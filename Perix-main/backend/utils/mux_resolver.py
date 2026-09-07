"""Background resolver for Mux assets that are still processing.

Uploads save `mux_asset_id` + `video_status=processing` immediately. If the Mux
webhook is not configured (or delayed), content would stay unplayable forever.
This loop polls Mux every 30s and flips ready assets to playable URLs.
"""
import asyncio
import logging

from config import MUX_TOKEN_ID, MUX_TOKEN_SECRET
from database import db

logger = logging.getLogger(__name__)

RESOLVE_INTERVAL_SECONDS = 30
_CACHE = {}


def _get_assets_api():
    import mux_python

    configuration = mux_python.Configuration()
    configuration.username = MUX_TOKEN_ID
    configuration.password = MUX_TOKEN_SECRET
    return mux_python.AssetsApi(mux_python.ApiClient(configuration))


async def _check_asset(asset_id):
    cached = _CACHE.get(asset_id)
    if cached is not None:
        return cached
    if not MUX_TOKEN_ID or not MUX_TOKEN_SECRET:
        return None
    try:
        api = _get_assets_api()
        response = await asyncio.to_thread(api.get_asset, asset_id, _request_timeout=20)
        data = response.data if hasattr(response, "data") and response.data is not None else response
        playback_ids = getattr(data, "playback_ids", None) or []
        pid = None
        for p in playback_ids:
            pid = getattr(p, "id", None) or (p.get("id") if isinstance(p, dict) else None)
            if pid:
                break
        result = {
            "status": getattr(data, "status", "unknown"),
            "playback_id": pid,
            "playback_url": f"https://stream.mux.com/{pid}.m3u8" if pid else None,
            "thumbnail_url": f"https://image.mux.com/{pid}/thumbnail.jpg?time=0" if pid else None,
            "duration": getattr(data, "duration", None),
        }
        if result["status"] in ("ready", "errored"):
            _CACHE[asset_id] = result
        return result
    except Exception as e:
        logger.warning(f"[mux-resolver] asset check failed for {asset_id}: {e}")
        return None


async def _resolve_collection(name, id_field):
    query = {
        "mux_asset_id": {"$exists": True, "$ne": None, "$ne": ""},
        "video_status": {"$in": ["processing", "uploading"]},
    }
    docs = await db[name].find(query, {"mux_asset_id": 1, id_field: 1}).to_list(length=200)
    resolved = 0
    for doc in docs:
        asset_id = doc.get("mux_asset_id")
        if not asset_id:
            continue
        result = await _check_asset(asset_id)
        if not result:
            continue
        if result["status"] == "ready" and result["playback_url"]:
            update = {"video_status": "ready", "mux_playback_id": result["playback_id"]}
            if name == "stories":
                update["media_url"] = result["playback_url"]
            else:
                update["video_url"] = result["playback_url"]
            if result["thumbnail_url"]:
                update["mux_thumbnail_url"] = result["thumbnail_url"]
            if result.get("duration"):
                update["video_duration"] = result["duration"]
            await db[name].update_one({id_field: doc[id_field]}, {"$set": update})
            logger.info(f"[mux-resolver] {name} {doc[id_field]} is ready")
            resolved += 1
        elif result["status"] == "errored":
            await db[name].update_one({id_field: doc[id_field]}, {"$set": {"video_status": "failed"}})
    return resolved


async def resolve_loop():
    while True:
        try:
            total = 0
            for name, id_field in (
                ("posts", "post_id"),
                ("stories", "story_id"),
                ("services", "service_id"),
                ("jobs", "job_id"),
                ("events", "event_id"),
                ("listings", "listing_id"),
            ):
                try:
                    total += await _resolve_collection(name, id_field)
                except Exception as e:
                    logger.warning(f"[mux-resolver] {name} failed: {e}")
            if total:
                logger.info(f"[mux-resolver] resolved {total} processing assets")
        except Exception as e:
            logger.warning(f"[mux-resolver] loop error: {e}")
        await asyncio.sleep(RESOLVE_INTERVAL_SECONDS)


def start_mux_resolver():
    asyncio.get_event_loop().create_task(resolve_loop())
    print("[MuxResolver] Background Mux asset resolver started (every 30s)")
