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


def _merge_shapes(payload: dict, prev_network: Optional[dict]) -> None:
    """Carry over OSM shapes from the previous network so the daily GTFS
    re-import never loses route geometries (the feed has no shapes.txt).
    Missing routes fall back to Overpass."""
    prev_by_num = {}
    if prev_network:
        for r in prev_network.get("routes", []):
            sh = r.get("shape") or []
            if isinstance(sh, list) and len(sh) > 2:
                prev_by_num[str(r.get("route_number"))] = sh
    missing = []
    for route in payload.get("routes", []):
        rn = str(route.get("route_number"))
        if rn in prev_by_num:
            route["shape"] = prev_by_num[rn]
        else:
            missing.append(rn)
    if missing:
        _log(f"static: {len(missing)} routes without shape, trying Overpass: {missing}")
        import asyncio as _a

        async def _fetch():
            from utils.osm import fetch_route_shape

            for rn in missing:
                sh = await fetch_route_shape(rn)
                for route in payload.get("routes", []):
                    if str(route.get("route_number")) == rn and sh:
                        route["shape"] = sh
                        _log(f"static: OSM shape for {rn}: {len(sh)} points")

        try:
            _a.run(_fetch())
        except Exception as e:
            _log(f"static: OSM shape fetch failed: {e}")


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

    trip_ids: set = set()
    last_refresh = 0.0
    _log(f"realtime started ({REALTIME_URL}, every {REALTIME_INTERVAL_SECONDS}s)")

    while True:
        try:
            now = asyncio.get_event_loop().time()
            if not trip_ids or now - last_refresh > 600:
                trip_ids = await _active_trip_ids()
                last_refresh = now
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.get(REALTIME_URL)
                resp.raise_for_status()
                raw = resp.content
            feed = gtfs_realtime_pb2.FeedMessage()
            feed.ParseFromString(raw)
            updates = []
            for entity in feed.entity:
                tu = entity.trip_update
                if not tu or not tu.trip.trip_id:
                    continue
                trip_id = tu.trip.trip_id
                if trip_id not in trip_ids:
                    continue
                delay = 0
                stop_delays = {}
                for stu in tu.stop_time_update:
                    d = None
                    if stu.HasField("departure") and stu.departure.HasField("delay"):
                        d = stu.departure.delay
                    elif stu.HasField("arrival") and stu.arrival.HasField("delay"):
                        d = stu.arrival.delay
                    if d is not None:
                        if d > delay:
                            delay = d
                        if stu.stop_id:
                            stop_delays[stu.stop_id] = int(d)
                updates.append((trip_id, max(0, int(delay)), stop_delays))
            from routes.mobility import _berlin_now

            now_iso = _berlin_now().isoformat()
            for trip_id, delay, stop_delays in updates:
                await db.mobility_realtime.replace_one(
                    {"trip_id": trip_id},
                    {
                        "trip_id": trip_id,
                        "delay_seconds": delay,
                        "stop_delays": stop_delays,
                        "updated_at": now_iso,
                        "source": "GTFS_RT",
                    },
                    upsert=True,
                )
            if updates:
                logger.info(f"[mobility-realtime] updated {len(updates)} trips")
        except Exception as e:
            logger.warning(f"[mobility-realtime] cycle error: {e}")
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
            # network is today's timetable. Otherwise (hash drift, manual
            # network activation, crash before activate) re-import so the
            # app never serves yesterday's trips.
            from datetime import datetime
            from zoneinfo import ZoneInfo

            today = datetime.now(ZoneInfo("Europe/Berlin")).date().isoformat()
            active = await db.bus_network_versions.find_one({"active": True}, {"_id": 0})
            active_fresh = bool(active) and today in str(active.get("name") or "")
            if state.get("value") == sha and active_fresh:
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

                _merge_shapes(payload, await _get_active_network())
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
