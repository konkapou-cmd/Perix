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


async def blocked_way_ids_for(mode: str, restrictions: List[dict]) -> set:
    """OSM way ids closed for this mode - ONLY from map-matched (verified)
    restrictions. Proximity guessing is gone: a parallel street must never
    get blocked because it sits near a closed one."""
    blocked: set = set()
    for r in restrictions:
        if not r.get("verified", False):
            continue
        if r.get("route_numbers"):
            continue
        if not restriction_blocks_mode(r, mode):
            continue
        for wid in (r.get("blocked_way_ids") or []):
            try:
                blocked.add(int(wid))
            except (TypeError, ValueError):
                continue
    return blocked


def way_blocked(mode: str, way: List[list], restrictions: List[dict]) -> bool:
    """Legacy helper for manual restrictions without matched edges: any
    sample point within 20m of a manual (non-TomTom) closure geometry."""
    for r in restrictions:
        if r.get("route_numbers"):
            continue
        if not restriction_blocks_mode(r, mode):
            continue
        if str(r.get("source") or "") == "TOMTOM_TRAFFIC":
            # TomTom closures block by exact matched edges only.
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
                if _hav_m(wlat, wlng, x0 + t * dx, y0 + t * dy) < 20.0:
                    return True
    return False


async def invalidate_geometries(restriction: dict) -> None:
    """Rebuild ONLY the patterns affected by this restriction - and never
    delete the old geometry first (last-known-good): a line keeps its
    previous canonical shape until the new one is validated and written.

    Tram patterns are not touched by road closures (allowed_modes tram),
    and the geometry revision is bumped so cached trip paths expire."""
    import asyncio

    from mobility import geometry_cache

    geometry_cache.bump_revision()

    blocked_modes = [str(m) for m in (restriction.get("blocked_modes") or [])]
    affected_modes = {m for m in blocked_modes} if blocked_modes else {"bus"}
    affected_modes.discard("tram")

    geom = restriction.get("geometry") or []
    lats = [p[0] for p in geom if isinstance(p, (list, tuple)) and len(p) >= 2]
    lngs = [p[1] for p in geom if isinstance(p, (list, tuple)) and len(p) >= 2]
    margin = 0.01

    network = await db.bus_network_versions.find_one({"active": True}, {"_id": 0})
    if not network:
        return
    route_numbers = {str(x) for x in (restriction.get("route_numbers") or [])}
    try:
        from mobility.domain import NETWORK_ID, build_domain

        domain = build_domain(network, NETWORK_ID)
        stop_by_id = {}
        for stop in domain.get("stops", []):
            for p in stop.get("platforms", []):
                stop_by_id[str(p.get("platform_id"))] = p
        affected = set()
        for pat in domain.get("patterns", []):
            if route_numbers and str(pat.get("route_number")) not in route_numbers:
                continue
            if str(pat.get("mode") or "bus") not in affected_modes:
                continue
            hit = False
            for sid in (pat.get("stop_ids") or []):
                p = stop_by_id.get(str(sid))
                if (
                    p
                    and p.get("latitude") is not None
                    and lats
                    and min(lats) - margin <= p["latitude"] <= max(lats) + margin
                    and min(lngs) - margin <= p["longitude"] <= max(lngs) + margin
                ):
                    hit = True
                    break
            if hit:
                affected.add(str(pat.get("pattern_id")))
    except Exception:
        affected = set()
    if affected:
        from utils.mobility_workers import _precompute_road_geometries

        asyncio.create_task(_precompute_road_geometries(only_patterns=affected))
