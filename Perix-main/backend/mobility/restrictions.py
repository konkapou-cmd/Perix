"""Operational restrictions (mode-aware closures).

A restriction blocks specific MODES on a segment - e.g. the Halberstädter
Straße works close the street for cars/buses while trams keep running:
{blocked_modes: [bus, taxi], allowed_modes: [tram]}. Applied by the road/
rail reconstruction so closed edges never participate in routing for the
blocked mode. Imported data stays untouched.
"""
from datetime import datetime
from typing import List
from zoneinfo import ZoneInfo

from database import db


def _now_utc() -> datetime:
    return datetime.now(ZoneInfo("UTC"))


def _active(ov: dict) -> bool:
    now = _now_utc()
    try:
        if ov.get("valid_from"):
            f = datetime.fromisoformat(str(ov["valid_from"]))
            if f.tzinfo is None:
                f = f.replace(tzinfo=ZoneInfo("UTC"))
            if now < f:
                return False
        if ov.get("valid_until"):
            u = datetime.fromisoformat(str(ov["valid_until"]))
            if u.tzinfo is None:
                u = u.replace(tzinfo=ZoneInfo("UTC"))
            if now > u:
                return False
    except ValueError:
        pass
    return True


async def get_active_restrictions() -> List[dict]:
    docs = await db.mobility_restrictions.find({}, {"_id": 0}).to_list(500)
    return [d for d in docs if _active(d)]


def restriction_blocks_mode(r: dict, mode: str) -> bool:
    blocked = [str(m) for m in (r.get("blocked_modes") or [])]
    allowed = [str(m) for m in (r.get("allowed_modes") or [])]
    if blocked and mode in blocked:
        return True
    if allowed and mode not in allowed:
        return True
    return False


def _hav_m(a_lat, a_lng, b_lat, b_lng) -> float:
    import math

    r = 6371000.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp, dl = math.radians(b_lat - a_lat), math.radians(b_lng - a_lng)
    x = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(x), math.sqrt(1 - x))


def way_blocked(mode: str, way: List[list], restrictions: List[dict]) -> bool:
    """True when any sample point of the way lies on a restriction segment
    that blocks this mode. Route-specific restrictions are handled via
    geometry invalidation - here we check area restrictions only."""
    for r in restrictions:
        if r.get("route_numbers"):
            continue
        if not restriction_blocks_mode(r, mode):
            continue
        geom = r.get("geometry") or []
        if len(geom) < 2:
            continue
        for i in range(0, len(way), 3):
            wlat, wlng = way[i]
            for j in range(len(geom) - 1):
                x0, y0 = geom[j]
                x1, y1 = geom[j + 1]
                dx, dy = x1 - x0, y1 - y0
                denom = dx * dx + dy * dy
                t = 0.0 if denom == 0 else max(0.0, min(1.0, ((wlat - x0) * dx + (wlng - y0) * dy) / denom))
                if _hav_m(wlat, wlng, x0 + t * dx, y0 + t * dy) < 60.0:
                    return True
    return False


async def invalidate_geometries(restriction: dict) -> None:
    """Drop cached/precomputed pattern geometries affected by the
    restriction so the background rebuild recomputes them with the
    closed edges excluded."""
    import asyncio

    route_numbers = [str(x) for x in (restriction.get("route_numbers") or [])]
    if route_numbers:
        import re

        pattern = "^(" + "|".join(re.escape(r) for r in route_numbers) + "):"
        await db.mobility_road_geometries.delete_many({"pattern_id": {"$regex": pattern}})
    else:
        await db.mobility_road_geometries.delete_many({})
    try:
        from mobility import geometry_cache

        geometry_cache.clear()
    except Exception:
        pass
    try:
        from utils.mobility_workers import _precompute_road_geometries

        asyncio.create_task(_precompute_road_geometries())
    except Exception:
        pass
