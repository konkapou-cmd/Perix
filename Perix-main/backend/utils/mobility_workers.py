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
        logger.warning(f"[mobility-realtime] gtfs-realtime-bindings missing: {e}")
        return

    trip_ids: set = set()
    last_refresh = 0.0
    logger.info(f"[mobility-realtime] started ({REALTIME_URL}, every {REALTIME_INTERVAL_SECONDS}s)")

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
                for stu in tu.stop_time_update:
                    d = None
                    if stu.HasField("departure") and stu.departure.HasField("delay"):
                        d = stu.departure.delay
                    elif stu.HasField("arrival") and stu.arrival.HasField("delay"):
                        d = stu.arrival.delay
                    if d is not None and d > delay:
                        delay = d
                updates.append((trip_id, max(0, int(delay))))
            from routes.mobility import _berlin_now

            now_iso = _berlin_now().isoformat()
            for trip_id, delay in updates:
                await db.mobility_realtime.replace_one(
                    {"trip_id": trip_id},
                    {
                        "trip_id": trip_id,
                        "delay_seconds": delay,
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
        logger.info("[mobility-static] disabled (MOBILITY_STATIC_GTFS_URL not set)")
        return
    logger.info(f"[mobility-static] started ({STATIC_GTFS_URL}, every {STATIC_INTERVAL_HOURS}h)")

    while True:
        try:
            async with httpx.AsyncClient(timeout=180) as client:
                resp = await client.get(STATIC_GTFS_URL)
                resp.raise_for_status()
                content = resp.content
            sha = hashlib.sha256(content).hexdigest()
            state = await db.mobility_sync_state.find_one({"key": "static_sha256"}) or {}
            if state.get("value") == sha:
                logger.info("[mobility-static] feed unchanged")
            else:
                from utils.gtfs import parse_gtfs_zip

                payload = parse_gtfs_zip(content)
                routes = payload.get("routes", [])
                trips = sum(len(r.get("trips", [])) for r in routes)
                lines = len(routes)
                logger.info(f"[mobility-static] converted: {lines} lines, {trips} trips")
                if trips < MIN_TRIPS or lines < MIN_LINES:
                    logger.warning(
                        f"[mobility-static] health check failed ({lines}<{MIN_LINES} or {trips}<{MIN_TRIPS}) - skipping"
                    )
                    raise RuntimeError("health check failed")
                from routes.mobility import _create_network_version

                result = await _create_network_version(routes, payload.get("name") or "GTFS auto")
                logger.info(f"[mobility-static] imported version {result['version_id']} diff={result['diff']}")
                if AUTO_ACTIVATE:
                    await db.bus_network_versions.update_many({}, {"$set": {"active": False}})
                    await db.bus_network_versions.update_one(
                        {"version_id": result["version_id"]}, {"$set": {"active": True}}
                    )
                    logger.info(f"[mobility-static] activated {result['version_id']}")
                await db.mobility_sync_state.replace_one(
                    {"key": "static_sha256"}, {"key": "static_sha256", "value": sha}, upsert=True
                )
        except Exception as e:
            logger.warning(f"[mobility-static] cycle error: {e}")
        await asyncio.sleep(STATIC_INTERVAL_HOURS * 3600)


def start_mobility_workers():
    asyncio.create_task(_realtime_worker())
    asyncio.create_task(_static_worker())
