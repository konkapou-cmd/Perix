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
import logging
import os
from typing import Optional

import httpx

from database import db

logger = logging.getLogger(__name__)

REALTIME_URL = os.getenv("MOBILITY_REALTIME_URL", "https://realtime.gtfs.de/realtime-free.pb")
STATIC_GTFS_URL = os.getenv("MOBILITY_STATIC_GTFS_URL", "")
MIN_TRIPS = int(os.getenv("MOBILITY_SYNC_MIN_TRIPS", "500"))
MIN_LINES = int(os.getenv("MOBILITY_SYNC_MIN_LINES", "10"))
AUTO_ACTIVATE = os.getenv("MOBILITY_SYNC_AUTO_ACTIVATE", "true").lower() != "false"
STATIC_INTERVAL_HOURS = float(os.getenv("MOBILITY_STATIC_INTERVAL_HOURS", "6"))
REALTIME_INTERVAL_SECONDS = float(os.getenv("MOBILITY_REALTIME_INTERVAL_SECONDS", "15"))
# Bump to force a one-time re-import when the network schema/derivation
# logic changes (the feed hash alone is not enough).
STATIC_SCHEMA_V = "7"


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
    network = await db.bus_network_versions.find_one({"active": True}, {"_id": 0})
    if not network:
        return set()
    ids = set()
    for route in network.get("routes", []):
        for trip in route.get("trips", []):
            if trip.get("trip_id"):
                ids.add(trip["trip_id"])
    return ids


async def _realtime_worker():
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

    trip_ids: set = set()
    last_refresh = 0.0
    _log(f"realtime started ({REALTIME_URL}, every {REALTIME_INTERVAL_SECONDS}s)")

    while True:
        try:
            now = asyncio.get_event_loop().time()
            if not trip_ids or now - last_refresh > 120:
                trip_ids = await _active_trip_ids()
                last_refresh = now

            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.get(REALTIME_URL)
                resp.raise_for_status()
                raw = resp.content

            feed = gtfs_realtime_pb2.FeedMessage()
            feed.ParseFromString(raw)
            total_tu = sum(1 for e in feed.entity if e.HasField("trip_update"))
            total_alerts = sum(1 for e in feed.entity if e.HasField("alert"))
            docs = []
            from routes.mobility import _berlin_now

            now_iso = _berlin_now().isoformat()

            for entity in feed.entity:
                if entity.HasField("alert"):
                    await _store_alert(entity.alert, now_iso)
                if not entity.HasField("trip_update"):
                    continue

                tu = entity.trip_update
                if not tu.trip.trip_id:
                    continue

                trip_id = tu.trip.trip_id
                if trip_id not in trip_ids:
                    continue

                trip_rel = trip_rel_names.get(int(tu.trip.schedule_relationship), "SCHEDULED")
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
                    if not sid:
                        continue

                    stop_relationships[sid] = stop_rel_names.get(
                        int(stu.schedule_relationship),
                        "SCHEDULED",
                    )

                    d = None
                    if stu.HasField("arrival") and stu.arrival.HasField("delay"):
                        d = int(stu.arrival.delay)
                    elif stu.HasField("departure") and stu.departure.HasField("delay"):
                        d = int(stu.departure.delay)

                    if d is not None:
                        stop_delays[sid] = d
                        if first_stop_delay is None:
                            first_stop_delay = d

                    prediction = {}
                    if stu.HasField("arrival") and stu.arrival.HasField("time") and stu.arrival.time:
                        prediction["arrival_epoch"] = int(stu.arrival.time)
                    if stu.HasField("departure") and stu.departure.HasField("time") and stu.departure.time:
                        prediction["departure_epoch"] = int(stu.departure.time)
                    if prediction:
                        stop_predictions[sid] = prediction

                if trip_delay is None:
                    trip_delay = first_stop_delay if first_stop_delay is not None else 0

                docs.append(
                    {
                        "trip_id": trip_id,
                        "delay_seconds": int(trip_delay),
                        "stop_delays": stop_delays,
                        "stop_predictions": stop_predictions,
                        "stop_relationships": stop_relationships,
                        "trip_schedule_relationship": trip_rel,
                    }
                )

            canceled = 0
            skipped = 0

            for doc in docs:
                doc["updated_at"] = now_iso
                doc["source"] = "GTFS_RT"
                if doc.get("trip_schedule_relationship") in ("CANCELED", "DELETED"):
                    canceled += 1
                skipped += sum(
                    1
                    for rel in (doc.get("stop_relationships") or {}).values()
                    if rel == "SKIPPED"
                )
                await db.mobility_realtime.replace_one(
                    {"trip_id": doc["trip_id"]},
                    doc,
                    upsert=True,
                )

            if docs or total_tu:
                _log(
                    "realtime: "
                    f"feed trip_updates={total_tu} "
                    f"network_trips={len(trip_ids)} "
                    f"matched={len(docs)} stored={len(docs)} "
                    f"canceled={canceled} skipped_stops={skipped}"
                )

        except Exception as e:
            _log(f"realtime: cycle error: {type(e).__name__}: {e}")

        await asyncio.sleep(REALTIME_INTERVAL_SECONDS)

async def _store_alert(alert, now_iso: str) -> None:
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
    header = alert.header_text.translation[0].text if alert.header_text.translation else ""
    desc = alert.description_text.translation[0].text if alert.description_text.translation else ""
    doc = {
        "alert_hash": hashlib.sha256((header + desc).encode("utf-8")).hexdigest(),
        "effect": effect_names.get(int(alert.effect), "UNKNOWN_EFFECT"),
        "cause": cause_names.get(int(alert.cause), "UNKNOWN_CAUSE"),
        "header_text": header,
        "description_text": desc,
        "informed_entities": entities,
        "active_periods": periods,
        "updated_at": now_iso,
        "source": "GTFS_RT_ALERT",
    }
    existing = await db.mobility_service_alerts.find_one({"alert_hash": doc["alert_hash"]}, {"_id": 1})
    if existing:
        await db.mobility_service_alerts.update_one({"_id": existing["_id"]}, {"$set": doc})
    else:
        await db.mobility_service_alerts.insert_one(doc)


async def _static_worker():
    if not STATIC_GTFS_URL:
        _log("static disabled (MOBILITY_STATIC_GTFS_URL not set)")
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
            state = await db.mobility_sync_state.find_one({"key": "static_sha256"}) or {}
            # Skip only when the feed hash is unchanged AND the ACTIVE
            # network is today's timetable AND it carries the per-trip
            # fields (stop_ids) required by the trip-level estimator.
            # Otherwise (hash drift, manual activation, crash before
            # activate, older schema) re-import so the app never serves
            # stale or schema-outdated trips.
            from datetime import datetime
            from zoneinfo import ZoneInfo

            today = datetime.now(ZoneInfo("Europe/Berlin")).date().isoformat()
            active = await db.bus_network_versions.find_one({"active": True}, {"_id": 0})
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
                payload = parse_gtfs_zip_path(tmp_path)
                routes = payload.get("routes", [])
                trips = sum(len(r.get("trips", [])) for r in routes)
                lines = len(routes)
                _log(f"static: converted: {lines} lines, {trips} trips")
                if trips < MIN_TRIPS or lines < MIN_LINES:
                    _log(f"static: health check failed ({lines}<{MIN_LINES} or {trips}<{MIN_TRIPS}) - skipping")
                    raise RuntimeError("health check failed")
                # Preserve OSM shapes across the daily re-import
                from routes.mobility import _create_network_version, _get_active_network

                await _merge_shapes(payload, await _get_active_network())
                result = await _create_network_version(routes, payload.get("name") or "GTFS auto")
                _log(f"static: imported version {result['version_id']} diff={result['diff']}")
                if AUTO_ACTIVATE:
                    await db.bus_network_versions.update_many({}, {"$set": {"active": False}})
                    await db.bus_network_versions.update_one(
                        {"version_id": result["version_id"]}, {"$set": {"active": True}}
                    )
                    _log(f"static: activated {result['version_id']}")
                    # Rebuild real-road geometries for the new timetable in
                    # the background (lines must never cross buildings).
                    asyncio.create_task(_precompute_road_geometries())
                await db.mobility_sync_state.replace_one(
                    {"key": "static_sha256"},
                    {"key": "static_sha256", "value": sha, "schema_v": STATIC_SCHEMA_V},
                    upsert=True,
                )
        except Exception as e:
            _log(f"static: cycle error: {type(e).__name__}: {e}")
        await asyncio.sleep(STATIC_INTERVAL_HOURS * 3600)


def start_mobility_workers():
    asyncio.create_task(_realtime_worker())
    asyncio.create_task(_static_worker())
    # Startup repair: rebuild road/rail geometry for any pattern missing it
    # (also covers networks that were already active before this deploy).
    asyncio.create_task(_precompute_road_geometries())
    # Live traffic incidents -> operational restrictions (TomTom)
    try:
        from mobility.traffic import traffic_worker

        asyncio.create_task(traffic_worker())
    except Exception as e:
        _log(f"traffic worker not started: {type(e).__name__}: {e}")


async def _precompute_road_geometries():
    """Rebuild every pattern's geometry over real OSM roads (bus) or rails
    (tram) - road-center routing between consecutive stops. Stored per
    version so the resolver can prefer real streets over nothing; lines
    never cross buildings. Runs continuously: after the first pass it
    re-checks every 20 minutes for missing/invalidated patterns (e.g.
    after an operator created a restriction)."""
    from mobility.domain import NETWORK_ID, build_domain
    from mobility.roads import compute_pattern_geometry
    from routes.mobility import _berlin_now

    while True:
        try:
            await _precompute_pass(build_domain, NETWORK_ID, compute_pattern_geometry, _berlin_now)
        except Exception as e:
            _log(f"roads: precompute pass failed: {type(e).__name__}: {e}")
        await asyncio.sleep(1200)


async def _precompute_pass(build_domain, NETWORK_ID, compute_pattern_geometry, _berlin_now):
    network = await db.bus_network_versions.find_one({"active": True}, {"_id": 0})
    if not network:
        return
    domain = build_domain(network, NETWORK_ID)
    version = str(network.get("version_id"))
    # Warm the in-process geometry cache with everything already computed
    # (the sync estimator reads exactly the same resolved geometry).
    try:
        from mobility import geometry_cache

        warmed = await geometry_cache.warm_from_db(version)
        _log(f"roads: warmed {warmed} cached geometries for {version}")
    except Exception as e:
        _log(f"roads: cache warm failed: {type(e).__name__}: {e}")
    platforms_by_id = {}
    for stop in domain.get("stops", []):
        for p in stop.get("platforms", []):
            platforms_by_id[str(p.get("platform_id"))] = p
    done = 0
    for pat in domain.get("patterns", []):
        pid = str(pat.get("pattern_id") or "")
        mode = str(pat.get("mode") or "bus")
        if not pid:
            continue
        existing = await db.mobility_road_geometries.find_one(
            {"pattern_id": pid, "version_id": version}, {"_id": 0}
        )
        # Rebuild old docs that predate the road/rail mode split
        if existing and existing.get("mode"):
            continue
        coords = []
        for sid in pat.get("stop_ids") or []:
            p = platforms_by_id.get(str(sid))
            if p and p.get("latitude") is not None and p.get("longitude") is not None:
                coords.append({"latitude": p["latitude"], "longitude": p["longitude"]})
        if len(coords) < 2:
            continue
        try:
            pts = await compute_pattern_geometry(coords, mode)
            if pts and len(pts) >= 2:
                await db.mobility_road_geometries.replace_one(
                    {"pattern_id": pid},
                    {
                        "pattern_id": pid,
                        "version_id": version,
                        "mode": mode,
                        "points": pts,
                        "source": "OSM_RAIL" if mode == "tram" else "OSM_ROADS",
                        "created_at": _berlin_now().isoformat(),
                    },
                    upsert=True,
                )
                try:
                    from mobility import geometry_cache

                    geometry_cache.set_cached(pid, pts)
                except Exception:
                    pass
                done += 1
                _log(f"roads: {pid} ({mode}) -> {len(pts)} points")
        except Exception as e:
            _log(f"roads: {pid} failed: {type(e).__name__}: {e}")
        await asyncio.sleep(1)
    _log(f"roads: precomputed {done} pattern geometries")
