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


def _log(msg: str) -> None:
    # print() (not logging) - Railway only forwards stdout, and INFO-level
    # logger calls from non-uvicorn loggers are silently dropped there.
    print(f"[mobility] {msg}", flush=True)


def _pattern_signature(route: dict) -> set:
    """First/last stop pairs of a route's trips - the route's travel
    patterns. Geometry may only be reused when these match, otherwise a
    diversion/terminus change would inherit the wrong street."""
    sigs = set()
    for t in (route.get("trips") or [])[:60]:
        ids = t.get("stop_ids") or []
        if len(ids) >= 2:
            sigs.add((str(ids[0]), str(ids[-1])))
    return sigs


async def _merge_shapes(payload: dict, prev_network: Optional[dict]) -> None:
    """Geometry priority:
    1. trip-specific GTFS shapes already in the feed - never touched.
    2. previous OSM geometry - reused ONLY when the trip patterns match
       (same first/last stops), never blindly by route_number.
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
        # Only reuse old geometry when today's trips still run the same
        # pattern (terminus changes / diversions must not inherit it).
        if not (_pattern_signature(route) & _pattern_signature(prev_r)):
            _log(f"static: {rn} pattern changed - dropping previous geometry")
            continue
        if prev_r.get("shapes"):
            route["shapes"] = prev_r["shapes"]
        sh = prev_r.get("shape") or []
        if isinstance(sh, list) and len(sh) > 2:
            route["shape"] = sh


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
            docs = []

            for entity in feed.entity:
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

            from routes.mobility import _berlin_now

            now_iso = _berlin_now().isoformat()
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
                await db.mobility_sync_state.replace_one(
                    {"key": "static_sha256"}, {"key": "static_sha256", "value": sha}, upsert=True
                )
        except Exception as e:
            _log(f"static: cycle error: {type(e).__name__}: {e}")
        await asyncio.sleep(STATIC_INTERVAL_HOURS * 3600)


def start_mobility_workers():
    asyncio.create_task(_realtime_worker())
    asyncio.create_task(_static_worker())
