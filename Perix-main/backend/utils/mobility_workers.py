"""In-process mobility workers: static GTFS sync + GTFS-Realtime sync.
They run together with the Perix backend as independent background loops -
no external cron/container needed.

Env:
  MOBILITY_REALTIME_URL      (default: https://realtime.gtfs.de/realtime-free.pb)
  MOBILITY_STATIC_GTFS_URL   (empty = static sync disabled)
  MOBILITY_SYNC_MIN_TRIPS    (default 500)
  MOBILITY_SYNC_MIN_LINES    (default 10)
  MOBILITY_SYNC_AUTO_ACTIVATE ("false" to disable auto-activate)
  MOBILITY_STATIC_INTERVAL_HOURS (default 6)
"""
import asyncio
import hashlib
import json
import logging
import os
from typing import Optional

import httpx
from pymongo import UpdateOne

from database import db
from mobility.regions import get_active_region

logger = logging.getLogger(__name__)

_ACTIVE_REGION = get_active_region()
REALTIME_URL = _ACTIVE_REGION.realtime_url
STATIC_GTFS_URL = _ACTIVE_REGION.static_gtfs_url
MIN_TRIPS = int(os.getenv("MOBILITY_SYNC_MIN_TRIPS", "500"))
MIN_LINES = int(os.getenv("MOBILITY_SYNC_MIN_LINES", "10"))
AUTO_ACTIVATE = os.getenv("MOBILITY_SYNC_AUTO_ACTIVATE", "true").lower() != "false"
STATIC_INTERVAL_HOURS = float(os.getenv("MOBILITY_STATIC_INTERVAL_HOURS", "6"))
REALTIME_INTERVAL_SECONDS = float(_ACTIVE_REGION.realtime_interval_seconds)
# v8 adds region/network namespacing to static, realtime and derived data.
STATIC_SCHEMA_V = "11"


def _log(msg: str) -> None:
    # print() (not logging) - Railway only forwards stdout, and INFO-level
    # logger calls from non-uvicorn loggers are silently dropped there.
    print(f"[mobility] {msg}", flush=True)


def _shape_matches_stops(shape: list, stops: list, max_d_m: float = 150.0) -> bool:
    """True when the route's MAIN pattern (the trip with the most stops)
    sits on the candidate geometry (>= 80% of its platforms within
    max_d_m). A diversion/terminus change fails this and the old geometry
    must NOT be carried over."""
    if not shape or not stops:
        return False
    import math

    def hav(a, b):
        r = 6371000.0
        p1, p2 = math.radians(a[0]), math.radians(b[0])
        dp, dl = math.radians(b[0] - a[0]), math.radians(b[1] - a[1])
        x = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        return r * 2 * math.atan2(math.sqrt(x), math.sqrt(1 - x))

    within = 0
    for s in stops:
        lat, lng = s.get("lat"), s.get("lng")
        if lat is None or lng is None:
            continue
        if min(hav((lat, lng), (p[0], p[1])) for p in shape) <= max_d_m:
            within += 1
    return len(stops) > 0 and within >= 0.8 * len(stops)


def _main_pattern_stops(route: dict) -> list:
    """Stops of the trip with the most stops (the route's main pattern)."""
    by_id = {str(s.get("stop_id")): s for s in route.get("stops", []) if s.get("stop_id") is not None}
    best = []
    for t in (route.get("trips") or []):
        ids = t.get("stop_ids") or []
        if len(ids) > len(best):
            best = ids
    return [by_id[str(sid)] for sid in best if str(sid) in by_id]


async def _merge_shapes(payload: dict, prev_network: Optional[dict]) -> None:
    """Geometry priority:
    1. trip-specific GTFS shapes already in the feed - never touched.
    2. previous OSM geometry - reused ONLY when today's main trip pattern
       actually sits on it (>= 80% of platforms within 150m). A diversion
       or terminus change drops the old geometry instead of inheriting the
       wrong street.
    3. otherwise: no geometry - clients draw the ordered stop polyline,
       which is always correct even if less pretty."""
    prev_by_num = {}
    if prev_network:
        for r in prev_network.get("routes", []):
            prev_by_num[str(r.get("route_number"))] = r
    for route in payload.get("routes", []):
        rn = str(route.get("route_number"))
        # The feed itself has shapes for this line - keep them untouched.
        if route.get("shapes"):
            continue
        prev_r = prev_by_num.get(rn)
        if not prev_r:
            continue
        prev_shape = prev_r.get("shape") or []
        if not (isinstance(prev_shape, list) and len(prev_shape) > 2):
            continue
        if not _shape_matches_stops(prev_shape, _main_pattern_stops(route)):
            _log(f"static: {rn} pattern changed - dropping previous geometry")
            continue
        if prev_r.get("shapes"):
            route["shapes"] = prev_r["shapes"]
        route["shape"] = prev_shape


async def _active_trip_ids() -> set:
    from routes.mobility import _get_active_network

    network = await _get_active_network()
    if not network:
        return set()
    ids = set()
    for route in network.get("routes", []):
        for trip in route.get("trips", []):
            if trip.get("trip_id"):
                ids.add(trip["trip_id"])
    return ids


async def _realtime_worker():
    if not REALTIME_URL:
        _log("realtime disabled for active mobility region")
        return
    if _ACTIVE_REGION.realtime_type != "GTFS_RT":
        _log(
            f"realtime type {_ACTIVE_REGION.realtime_type} needs a source adapter; "
            "built-in worker supports GTFS_RT"
        )
        return
    try:
        from google.transit import gtfs_realtime_pb2
    except Exception as e:
        _log(f"realtime: gtfs-realtime-bindings missing: {e}")
        return

    trip_rel_names = {
        0: "SCHEDULED",
        1: "ADDED",
        2: "UNSCHEDULED",
        3: "CANCELED",
        5: "REPLACEMENT",
        6: "DUPLICATED",
        7: "DELETED",
    }
    stop_rel_names = {
        0: "SCHEDULED",
        1: "SKIPPED",
        2: "NO_DATA",
        3: "UNSCHEDULED",
    }

    from mobility.realtime_trip_identity import build_trip_index, match_trip_update, stop_id_for_sequence
    from mobility.realtime_order import activation_epoch, validate_candidate, InvalidRealtimeClock, monotonic_update_pipeline
    from pymongo.errors import BulkWriteError
    from routes.mobility import _get_active_network
    _log(f"realtime started ({REALTIME_URL}, every {REALTIME_INTERVAL_SECONDS}s)")

    while True:
        try:
            # Re-read the active version every cycle (not just every 120s).
            # An atomic schedule swap must never match GTFS-RT to old trips.
            active_network = await _get_active_network()
            trip_index = build_trip_index(active_network or {})
            from mobility.alert_scope import build_alert_scope
            alert_scope = build_alert_scope(active_network or {})
            trip_ids = set(trip_index)

            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.get(REALTIME_URL)
                resp.raise_for_status()
                raw = resp.content

            feed = gtfs_realtime_pb2.FeedMessage()
            feed.ParseFromString(raw)
            # Feed generation time helps distinguish a newly fetched old feed.
            feed_timestamp = int(feed.header.timestamp) if feed.header.HasField("timestamp") else None
            total_tu = sum(1 for e in feed.entity if e.HasField("trip_update"))
            total_alerts = sum(1 for e in feed.entity if e.HasField("alert"))
            docs = []
            rejected: dict[str, int] = {}
            from routes.mobility import _berlin_now

            now_iso = _berlin_now().isoformat()

            for entity in feed.entity:
                if entity.HasField("alert"):
                    await _store_alert(entity.alert, now_iso, alert_scope)
                if not entity.HasField("trip_update"):
                    continue

                tu = entity.trip_update
                if not tu.trip.trip_id:
                    continue

                trip_id = str(tu.trip.trip_id)
                trip_rel = trip_rel_names.get(int(tu.trip.schedule_relationship), "SCHEDULED")
                descriptor = {
                    "trip_id": trip_id,
                    "route_id": str(tu.trip.route_id or ""),
                    "start_date": str(tu.trip.start_date or ""),
                    "start_time": str(tu.trip.start_time or ""),
                    "direction_id": next((int(v) for field, v in tu.trip.ListFields() if field.name == "direction_id"), None),
                    "schedule_relationship": trip_rel,
                }
                stop_refs = [
                    {
                        "stop_id": str(stu.stop_id or ""),
                        "stop_sequence": int(stu.stop_sequence) if stu.HasField("stop_sequence") else None,
                    }
                    for stu in tu.stop_time_update
                ]
                matched, match_reason = match_trip_update(
                    descriptor, stop_refs, trip_index,
                    feed_timestamp=feed_timestamp,
                    timezone_name=_ACTIVE_REGION.timezone,
                    service_day_start_hour=_ACTIVE_REGION.service_day_start_hour,
                    activated_at=(active_network or {}).get("activated_at"),
                )
                if matched is None:
                    rejected[match_reason] = rejected.get(match_reason, 0) + 1
                    continue
                stop_delays = {}
                stop_predictions = {}
                stop_relationships = {}

                trip_delay = None
                try:
                    if tu.HasField("delay"):
                        trip_delay = int(tu.delay)
                except Exception:
                    pass

                first_stop_delay = None

                for stu in tu.stop_time_update:
                    sid = str(stu.stop_id or "")
                    if not sid and stu.HasField("stop_sequence"):
                        sid = stop_id_for_sequence(matched, stu.stop_sequence) or ""
                    if not sid:
                        continue

                    stop_relationships[sid] = stop_rel_names.get(
                        int(stu.schedule_relationship),
                        "SCHEDULED",
                    )

                    arrival_delay = None
                    departure_delay = None
                    if stu.HasField("arrival") and stu.arrival.HasField("delay"):
                        arrival_delay = int(stu.arrival.delay)
                    if stu.HasField("departure") and stu.departure.HasField("delay"):
                        departure_delay = int(stu.departure.delay)

                    d = arrival_delay if arrival_delay is not None else departure_delay
                    if d is not None:
                        stop_delays[sid] = d
                        if first_stop_delay is None:
                            first_stop_delay = d

                    prediction = {}
                    if arrival_delay is not None:
                        prediction["arrival_delay_seconds"] = arrival_delay
                    if departure_delay is not None:
                        prediction["departure_delay_seconds"] = departure_delay
                    if stu.HasField("arrival") and stu.arrival.HasField("time") and stu.arrival.time:
                        prediction["arrival_epoch"] = int(stu.arrival.time)
                    if stu.HasField("departure") and stu.departure.HasField("time") and stu.departure.time:
                        prediction["departure_epoch"] = int(stu.departure.time)
                    if prediction:
                        stop_predictions[sid] = prediction

                trip_delay_observed = trip_delay is not None or first_stop_delay is not None
                if trip_delay is None:
                    trip_delay = first_stop_delay if first_stop_delay is not None else 0

                docs.append(
                    {
                        "region_id": _ACTIVE_REGION.region_id,
                        "network_id": _ACTIVE_REGION.network_id,
                        "trip_id": trip_id,
                        "network_version_id": matched["network_version_id"],
                        "service_date": matched["service_date"],
                        "gtfs_route_id": matched["gtfs_route_id"],
                        "delay_seconds": int(trip_delay),
                        "trip_delay_observed": trip_delay_observed,
                        "feed_timestamp": feed_timestamp,
                        "network_activation_epoch": activation_epoch((active_network or {}).get("activated_at")),
                        "stop_delays": stop_delays,
                        "stop_predictions": stop_predictions,
                        "stop_relationships": stop_relationships,
                        "trip_schedule_relationship": trip_rel,
                    }
                )

            canceled = 0
            skipped = 0

            from mobility.realtime_index import realtime_upsert_filter
            ops = []
            retry_ops = []
            clock_rejected = 0
            stored = 0
            # Duplicate TripUpdates within a feed must never race each other.
            unique_docs = {doc["trip_id"]: doc for doc in reversed(docs)}
            for doc in reversed(list(unique_docs.values())):
                doc["updated_at"] = now_iso
                doc["source"] = "GTFS_RT"
                if doc.get("trip_schedule_relationship") in ("CANCELED", "DELETED"):
                    canceled += 1
                skipped += sum(
                    1
                    for rel in (doc.get("stop_relationships") or {}).values()
                    if rel == "SKIPPED"
                )
                try:
                    validate_candidate(doc)
                except InvalidRealtimeClock:
                    clock_rejected += 1
                    continue
                key = realtime_upsert_filter(doc)
                update = monotonic_update_pipeline(doc)
                retry_ops.append(UpdateOne(key, update, upsert=False))
                ops.append(
                    UpdateOne(key, update, upsert=True)
                )
            if ops:
                try:
                    result = await db.mobility_realtime.bulk_write(ops, ordered=False)
                    stored = int(result.modified_count or 0) + int(result.upserted_count or 0)
                except BulkWriteError as exc:
                    # Concurrent upsert of a previously absent trip may race
                    # the unique index. Retry duplicate-key items as updates
                    # with NO upsert, preserving the same atomic rank check.
                    details = exc.details or {}
                    errors = details.get("writeErrors") or []
                    if not errors or any(int(e.get("code", -1)) != 11000 for e in errors):
                        raise
                    indices = sorted({int(e["index"]) for e in errors})
                    if any(i < 0 or i >= len(retry_ops) for i in indices):
                        raise
                    retry = await db.mobility_realtime.bulk_write(
                        [retry_ops[i] for i in indices], ordered=False
                    )
                    if int(retry.matched_count or 0) != len(indices):
                        raise RuntimeError("Concurrent-upsert retry could not find the winning trip row")
                    stored = (int(details.get("nModified") or 0) +
                              int(details.get("nUpserted") or 0) +
                              int(retry.modified_count or 0))

            if docs or total_tu:
                _log(
                    "realtime: "
                    f"feed trip_updates={total_tu} "
                    f"network_trips={len(trip_ids)} "
                    f"matched={len(docs)} stored={stored} clock_rejected={clock_rejected} "
                    f"canceled={canceled} skipped_stops={skipped} "
                    f"identity_rejected={sum(rejected.values())} "
                    f"reject_reasons={dict(sorted(rejected.items()))}"
                )

        except Exception as e:
            _log(f"realtime: cycle error: {type(e).__name__}: {e}")

        await asyncio.sleep(REALTIME_INTERVAL_SECONDS)

async def _store_alert(alert, now_iso: str, scope) -> None:
    """Store a GTFS-RT ServiceAlert (Störung/Umleitung/Sperrung/Halt entfällt)
    so the restrictions layer can derive mode-aware closures."""
    effect_names = {
        1: "NO_SERVICE",
        2: "REDUCED_SERVICE",
        3: "SIGNIFICANT_DELAYS",
        4: "DETOUR",
        5: "ADDITIONAL_SERVICE",
        6: "MODIFIED_SERVICE",
        7: "OTHER_EFFECT",
        8: "UNKNOWN_EFFECT",
        9: "STOP_MOVED",
        10: "NO_EFFECT",
        11: "ACCESSIBILITY_ISSUE",
    }
    cause_names = {
        1: "UNKNOWN_CAUSE",
        2: "OTHER_CAUSE",
        3: "TECHNICAL_PROBLEM",
        4: "STRIKE",
        5: "DEMONSTRATION",
        6: "ACCIDENT",
        7: "HOLIDAY",
        8: "WEATHER",
        9: "MAINTENANCE",
        10: "CONSTRUCTION",
        11: "POLICE_ACTIVITY",
        12: "MEDICAL_EMERGENCY",
    }
    entities = []
    for sel in alert.informed_entity:
        ent = {}
        if sel.HasField("agency_id"):
            ent["agency_id"] = sel.agency_id
        if sel.HasField("route_id"):
            ent["route_id"] = sel.route_id
        if sel.HasField("route_type"):
            ent["route_type"] = int(sel.route_type)
        if sel.HasField("stop_id"):
            ent["stop_id"] = sel.stop_id
        if sel.trip and sel.trip.trip_id:
            ent["trip_id"] = sel.trip.trip_id
        if ent:
            entities.append(ent)
    periods = []
    for ap in alert.active_period:
        p = {}
        if ap.HasField("start") and ap.start:
            p["start"] = int(ap.start)
        if ap.HasField("end") and ap.end:
            p["end"] = int(ap.end)
        if p:
            periods.append(p)
    from mobility.alert_scope import scope_alert
    verified = scope_alert(entities, scope)
    if not verified['accepted']:
        return  # Never assign a national ServiceAlert to Magdeburg by download source.
    entities = verified['entities']  # Do not persist out-of-region trip selectors.
    header = alert.header_text.translation[0].text if alert.header_text.translation else ""
    desc = alert.description_text.translation[0].text if alert.description_text.translation else ""
    doc = {
        "region_id": _ACTIVE_REGION.region_id,
        "network_id": _ACTIVE_REGION.network_id,
        # Same title/description can target different lines, stops or periods.
        "alert_hash": hashlib.sha256(json.dumps({
            "header": header, "description": desc,
            "effect": int(alert.effect), "cause": int(alert.cause),
            "entities": entities, "periods": periods,
        }, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest(),
        "effect": effect_names.get(int(alert.effect), "UNKNOWN_EFFECT"),
        "cause": cause_names.get(int(alert.cause), "UNKNOWN_CAUSE"),
        "header_text": header,
        "description_text": desc,
        "informed_entities": entities,
        "active_periods": periods,
        "updated_at": now_iso,
        "source": "GTFS_RT_ALERT",
        "scope_verified": True,
        "network_version_id": scope.version_id,
        "scope_method": verified['reason'],
        "source_selector_count": verified['total'],
    }
    existing = await db.mobility_service_alerts.find_one(
        {
            "region_id": _ACTIVE_REGION.region_id,
            "network_id": _ACTIVE_REGION.network_id,
            "alert_hash": doc["alert_hash"],
        },
        {"_id": 1},
    )
    if existing:
        await db.mobility_service_alerts.update_one({"_id": existing["_id"]}, {"$set": doc})
    else:
        await db.mobility_service_alerts.insert_one(doc)


async def _static_worker():
    if _ACTIVE_REGION.static_transit_type != "GTFS":
        _log(
            f"static transit type {_ACTIVE_REGION.static_transit_type} needs a source adapter; "
            "built-in worker supports GTFS"
        )
        return
    if not STATIC_GTFS_URL:
        _log("static disabled (no GTFS URL configured for active mobility region)")
        return
    _log(f"static started ({STATIC_GTFS_URL}, every {STATIC_INTERVAL_HOURS}h)")

    while True:
        try:
            # Stream to disk (the nationwide feed is ~270MB - never hold it in RAM)
            tmp_path = "/tmp/perix_gtfs.zip"
            _log("static: downloading feed...")
            with open(tmp_path, "wb") as out:
                async with httpx.AsyncClient(timeout=600) as client:
                    async with client.stream("GET", STATIC_GTFS_URL) as resp:
                        resp.raise_for_status()
                        sha = hashlib.sha256()
                        async for chunk in resp.aiter_bytes():
                            out.write(chunk)
                            sha.update(chunk)
            sha = sha.hexdigest()
            _log(f"static: downloaded, sha={sha[:12]}...")
            sync_key = f"static_sha256:{_ACTIVE_REGION.region_id}:{_ACTIVE_REGION.network_id}"
            state = await db.mobility_sync_state.find_one({"key": sync_key}) or {}
            # Skip only when the feed hash is unchanged AND the ACTIVE
            # network is today's timetable AND it carries the per-trip
            # fields (stop_ids) required by the trip-level estimator.
            # Otherwise (hash drift, manual activation, crash before
            # activate, older schema) re-import so the app never serves
            # stale or schema-outdated trips.
            from datetime import datetime
            from zoneinfo import ZoneInfo
            from mobility.schedule_revision import service_day_for

            local_now = datetime.now(ZoneInfo(_ACTIVE_REGION.timezone))
            today = service_day_for(local_now, _ACTIVE_REGION.service_day_start_hour).isoformat()
            from routes.mobility import _get_active_network

            active = await _get_active_network()
            active_fresh = bool(active) and today in str(active.get("name") or "")
            has_trip_stops = False
            for r in (active or {}).get("routes", []):
                for t in r.get("trips", []):
                    has_trip_stops = bool(t.get("stop_ids"))
                    break
                if has_trip_stops:
                    break
            # Schema v3: stops must carry location_type/parent_station so
            # the /mobility/stops physical grouping works.
            has_stop_meta = False
            for r in (active or {}).get("routes", []):
                for s in r.get("stops", []):
                    has_stop_meta = "location_type" in s
                    break
                if has_stop_meta:
                    break
            if (
                state.get("value") == sha
                and state.get("schema_v") == STATIC_SCHEMA_V
                and active_fresh
                and has_trip_stops
                and has_stop_meta
            ):
                _log("static: feed unchanged")
            else:
                from utils.gtfs import parse_gtfs_zip_path

                _log("static: parsing feed...")
                payload = parse_gtfs_zip_path(
                    tmp_path,
                    agency_regex=_ACTIVE_REGION.agency_regex,
                    timezone=_ACTIVE_REGION.timezone,
                )
                routes = payload.get("routes", [])
                trips = sum(len(r.get("trips", [])) for r in routes)
                lines = len(routes)
                _log(f"static: converted: {lines} lines, {trips} trips")
                # An official GTFS schedule update is NOT inferred from text
                # ServiceAlerts. A date/route/stop-specific operator-reviewed
                # contract may assert exactly which variants must exist.
                from mobility.schedule_revision import choose_contract, audit_schedule

                raw_contract = str(os.getenv("MOBILITY_REVISION_CONTRACT_JSON") or "").strip()
                manifest = choose_contract(
                    json.loads(raw_contract) if raw_contract else None,
                    region_id=_ACTIVE_REGION.region_id,
                    network_id=_ACTIVE_REGION.network_id,
                    service_date=str(payload.get("service_date") or ""),
                )
                from routes.mobility import _get_active_network
                prior = await _get_active_network()
                revision_report = audit_schedule(
                    payload, contract=manifest,
                    service_day_start_hour=_ACTIVE_REGION.service_day_start_hour,
                    previous=prior,
                    source_sha256=sha,
                )
                revision_report.update({
                    "source_sha256": sha,
                    "audited_at": datetime.now(ZoneInfo("UTC")).isoformat(),
                })
                audit_key = {
                    "region_id": _ACTIVE_REGION.region_id,
                    "network_id": _ACTIVE_REGION.network_id,
                    "service_date": str(payload.get("service_date")),
                    "source_sha256": sha,
                }
                await db.mobility_schedule_audits.replace_one(
                    audit_key, {**audit_key, **revision_report}, upsert=True,
                )
                _log(
                    "static revision: "
                    f"service_date={revision_report['service_date']} "
                    f"contract={revision_report['contract_applied']} "
                    f"blocking={revision_report['blocking_error_count']} "
                    f"warnings={revision_report['warning_count']}"
                )
                if not revision_report["ready_to_import"]:
                    raise RuntimeError(
                        "schedule revision audit rejected candidate; "
                        "see operator /mobility/v2/diagnostic/schedule-revision"
                    )
                if trips < MIN_TRIPS or lines < MIN_LINES:
                    _log(f"static: health check failed ({lines}<{MIN_LINES} or {trips}<{MIN_TRIPS}) - skipping")
                    raise RuntimeError("health check failed")
                # Preserve OSM shapes across the daily re-import
                from routes.mobility import _create_network_version, _get_active_network

                await _merge_shapes(payload, await _get_active_network())
                result = await _create_network_version(routes, payload.get("name") or "GTFS auto")
                _log(f"static: imported version {result['version_id']} diff={result['diff']}")
                activation_succeeded = not AUTO_ACTIVATE
                if AUTO_ACTIVATE:
                    from mobility.generations import (
                        atomic_generations_enabled,
                        prepare_network_version,
                    )
                    from routes.mobility import _activate_network_version

                    if atomic_generations_enabled():
                        _event, lock, _queue = _precompute_primitives()
                        async with lock:
                            preparation = await prepare_network_version(
                                str(result["version_id"]),
                                source_version_id=str((active or {}).get("version_id") or "") or None,
                            )
                        if preparation.get("state") == "READY":
                            await _activate_network_version(
                                str(result["version_id"]),
                                require_ready=True,
                            )
                            activation_succeeded = True
                            _log(
                                "static: warm-activated "
                                f"{result['version_id']} "
                                f"ready={preparation.get('ready')}/"
                                f"{preparation.get('expected')} "
                                f"reused={preparation.get('reused')} "
                                f"rebuilt={preparation.get('rebuilt')}"
                            )
                        else:
                            _log(
                                "static: candidate NOT activated "
                                f"{result['version_id']} state={preparation.get('state')} "
                                f"blocking={preparation.get('blocking_missing')}"
                            )
                    else:
                        await _activate_network_version(
                            str(result["version_id"]),
                            require_ready=False,
                            force=True,
                        )
                        request_precompute(None, reason="NETWORK_ACTIVATED_LEGACY_MODE")
                        activation_succeeded = True
                # Do not mark a feed as fully synced when the version
                # exists but its atomic generations were not activated.
                # Otherwise a retry can be lost until the hash changes.
                if not activation_succeeded:
                    raise RuntimeError(
                        "schedule candidate built but not activated; "
                        "feed hash intentionally left unsynced for retry"
                    )
                await db.mobility_sync_state.replace_one(
                    {"key": sync_key},
                    {
                        "key": sync_key,
                        "region_id": _ACTIVE_REGION.region_id,
                        "network_id": _ACTIVE_REGION.network_id,
                        "value": sha,
                        "schema_v": STATIC_SCHEMA_V,
                    },
                    upsert=True,
                )
        except Exception as e:
            _log(f"static: cycle error: {type(e).__name__}: {e}")
        # Refresh promptly when the 04:00 local service day changes, even
        # when the normal feed interval is six hours.
        from mobility.schedule_revision import seconds_until_next_service_day
        from datetime import datetime
        from zoneinfo import ZoneInfo
        local_now = datetime.now(ZoneInfo(_ACTIVE_REGION.timezone))
        rollover_wait = seconds_until_next_service_day(
            local_now, _ACTIVE_REGION.service_day_start_hour,
        )
        await asyncio.sleep(max(5.0, min(STATIC_INTERVAL_HOURS * 3600, rollover_wait)))


_PRECOMPUTE_EVENT: Optional[asyncio.Event] = None
_PRECOMPUTE_LOCK: Optional[asyncio.Lock] = None
_PRECOMPUTE_QUEUE = None


def _precompute_primitives():
    global _PRECOMPUTE_EVENT, _PRECOMPUTE_LOCK, _PRECOMPUTE_QUEUE
    if _PRECOMPUTE_EVENT is None:
        _PRECOMPUTE_EVENT = asyncio.Event()
    if _PRECOMPUTE_LOCK is None:
        _PRECOMPUTE_LOCK = asyncio.Lock()
    if _PRECOMPUTE_QUEUE is None:
        from mobility.rebuild_queue import RebuildRequestQueue

        _PRECOMPUTE_QUEUE = RebuildRequestQueue()
    return _PRECOMPUTE_EVENT, _PRECOMPUTE_LOCK, _PRECOMPUTE_QUEUE


def request_precompute(
    pattern_ids: Optional[set[str]] = None,
    *,
    reason: str = "UNSPECIFIED",
) -> None:
    event, _lock, queue = _precompute_primitives()
    queue.request(pattern_ids, reason=reason)
    event.set()


def start_mobility_workers():
    _precompute_primitives()
    asyncio.create_task(_realtime_worker())
    asyncio.create_task(_static_worker())
    # EXACTLY ONE long-lived precompute coordinator per backend process.
    asyncio.create_task(_precompute_road_geometries())
    request_precompute(None, reason="STARTUP")
    asyncio.create_task(_osm_snapshot_worker())


async def _osm_snapshot_worker():
    """Refresh raw OSM without destroying last-known-good derivatives.

    A successful new/merged raw snapshot merely requests a background
    pattern refresh. Each pattern keeps its previous atomic generation
    until a replacement generation validates and commits.
    """
    import time as _time

    while True:
        res = None
        try:
            from mobility.osm_store import active_version, import_snapshot, snapshot_meta

            version = await active_version()
            if version is None:
                _log("osm snapshot: no local graph yet - importing...")
                res = await import_snapshot()
            else:
                meta = await snapshot_meta(_ACTIVE_REGION.region_id)
                age = _time.time() - float((meta or {}).get("imported_at") or 0)
                if age > 12 * 3600:
                    res = await import_snapshot(force_new=(age > 86400))

            if res and res.get("ok"):
                request_precompute(
                    None,
                    reason=(
                        "OSM_MERGE_BACKFILL"
                        if res.get("merged")
                        else "OSM_SNAPSHOT_ROLLOVER"
                    ),
                )
                _log(
                    "osm snapshot: generation refresh requested; "
                    "last-known-good pattern generations retained"
                )
                try:
                    from mobility.traffic_profiles import rebuild_traffic_profiles

                    profile_result = await rebuild_traffic_profiles(
                        region_id=_ACTIVE_REGION.region_id,
                        network_id=_ACTIVE_REGION.network_id,
                    )
                    _log(f"osm snapshot: traffic profiles {profile_result}")
                except Exception as exc:
                    _log(
                        "osm snapshot: traffic profile rebuild failed: "
                        f"{type(exc).__name__}: {exc}"
                    )
        except Exception as exc:
            _log(f"osm snapshot worker error: {type(exc).__name__}: {exc}")

        last_failed = int((res or {}).get("failed") or 0)
        await asyncio.sleep(1800 if last_failed > 0 else 21600)


async def _refresh_active_generations(
    *,
    only_patterns: Optional[set[str]],
    reasons: list[str],
) -> dict:
    from mobility.generations import refresh_network_version
    from routes.mobility import _get_active_network

    network = await _get_active_network()
    if not network:
        return {"state": "NO_ACTIVE_NETWORK", "refreshed": 0}

    reason = "+".join(reasons) if reasons else "PERIODIC_REFRESH"
    return await refresh_network_version(
        str(network.get("version_id") or ""),
        only_patterns=only_patterns,
        reason=reason,
    )


async def _refresh_runtime_caches(version_id: str) -> None:
    from mobility import geometry_cache
    from mobility.generations import atomic_generations_enabled

    geometry_cache.clear()
    if atomic_generations_enabled():
        await geometry_cache.warm_from_generations(version_id)
    else:
        await geometry_cache.warm_from_db(version_id)
    geometry_cache.bump_revision()
    try:
        from mobility.motion import clear_motion_cache

        clear_motion_cache()
    except Exception:
        pass


async def _precompute_road_geometries():
    """Single coordinator; coalesces startup/OSM/restriction requests."""
    event, lock, queue = _precompute_primitives()

    while True:
        if not queue.pending():
            try:
                await asyncio.wait_for(event.wait(), timeout=1200)
            except asyncio.TimeoutError:
                queue.request(None, reason="PERIODIC_20M")
        event.clear()
        request = queue.drain()
        only_patterns = None if request.all_patterns else request.pattern_ids

        try:
            async with lock:
                report = await _refresh_active_generations(
                    only_patterns=only_patterns,
                    reasons=request.reasons,
                )
                version_id = str(report.get("version_id") or "")
                changed = int(report.get("refreshed") or 0)
                if version_id and changed:
                    await _refresh_runtime_caches(version_id)
                _log(
                    "generations: "
                    f"state={report.get('state')} "
                    f"refreshed={report.get('refreshed', 0)} "
                    f"retained={report.get('retained_last_good', 0)} "
                    f"stale={report.get('stale_count', 0)} "
                    f"missing={report.get('missing_count', 0)} "
                    f"reasons={request.reasons}"
                )
        except Exception as exc:
            _log(
                "generations: coordinator failed: "
                f"{type(exc).__name__}: {exc}"
            )
            # Never spin: periodic retry remains available in 20m.
