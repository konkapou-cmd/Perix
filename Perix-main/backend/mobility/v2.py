"""Stable Mobility V2 read API (Phase 1 facade).

The Locator will cut over to these endpoints in a later phase. They only
expose the canonical domain - no GTFS/OSM/GPS internals - so future
sources (own GPS boxes, phone trackers, manual networks) can be added
without touching the client.
"""
from typing import Optional

from fastapi import APIRouter, Depends

from database import db
from mobility.domain import build_domain, NETWORK_ID, _service_date
from models.user import UserPublic
from routes.dependencies import get_current_user_optional

router = APIRouter(prefix="/mobility/v2", tags=["MobilityV2"])


async def _domain():
    from routes.mobility import _get_active_network

    network = await _get_active_network()
    if not network:
        return None
    overrides = await db.mobility_stop_overrides.find({}, {"_id": 0}).to_list(500)
    return build_domain(network, NETWORK_ID, list(overrides))


@router.get("/networks")
async def v2_networks(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    domain = await _domain()
    if not domain:
        return []
    return [domain["network"]]


@router.get("/routes")
async def v2_routes(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    domain = await _domain()
    if not domain:
        return []
    return domain["routes"]


@router.get("/patterns")
async def v2_patterns(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    domain = await _domain()
    if not domain:
        return []
    return await _patterns_resolved(domain)


async def _patterns_resolved(domain: dict) -> list:
    """Patterns with geometry resolved by the Geometry Resolver (validated
    against their platforms; invalid geometries fall back to the
    ordered-stop polyline)."""
    from mobility.graph import get_overlays, resolve_pattern_geometry

    platforms_by_id = {}
    for stop in domain.get("stops", []):
        for p in stop.get("platforms", []):
            platforms_by_id[str(p.get("platform_id"))] = p
    overlays = await get_overlays()
    # Precomputed real geometries (OSM road/rail reconstruction), scoped to
    # the ACTIVE network version - a previous day's path must never leak.
    version_id = domain.get("network", {}).get("version_id")
    road_docs = await db.mobility_road_geometries.find(
        {"version_id": version_id}, {"_id": 0}
    ).to_list(1000)
    roads_by_pattern = {
        str(d.get("pattern_id")): d.get("points") or []
        for d in road_docs
        if (d.get("mode") or "bus") != "tram"
    }
    rails_by_pattern = {
        str(d.get("pattern_id")): d.get("points") or []
        for d in road_docs
        if (d.get("mode") or "bus") == "tram"
    }
    out = []
    for pat in domain.get("patterns", []):
        resolved = resolve_pattern_geometry(pat, platforms_by_id, overlays, roads_by_pattern, rails_by_pattern)
        out.append(
            {
                **{k: v for k, v in pat.items() if k != "points"},
                "geometry": resolved,
            }
        )
    return out


@router.get("/map")
async def v2_map(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    """The stable map payload the Locator consumes: resolved lines
    (validated geometry + source + per-line stops) and physical stops."""
    domain = await _domain()
    if not domain:
        return {"lines": [], "stops": []}
    patterns = await _patterns_resolved(domain)
    # stop lookup for per-line stop lists
    stop_by_id = {}
    for stop in domain.get("stops", []):
        for p in stop.get("platforms", []):
            stop_by_id[str(p.get("platform_id"))] = p
    lines = []
    for p in patterns:
        g = p.get("geometry") or {}
        points = g.get("points") or []
        if len(points) < 2:
            continue
        line_stops = []
        for sid in p.get("stop_ids") or []:
            sp = stop_by_id.get(str(sid))
            if sp:
                line_stops.append(
                    {
                        "stop_id": str(sid),
                        "name": sp.get("name"),
                        "latitude": sp.get("latitude"),
                        "longitude": sp.get("longitude"),
                    }
                )
        lines.append(
            {
                "pattern_id": p.get("pattern_id"),
                "route_number": p.get("route_number"),
                "mode": p.get("mode"),
                "direction": p.get("direction"),
                "points": [{"latitude": pt[0], "longitude": pt[1]} for pt in points],
                "source": g.get("source"),
                "valid": g.get("valid"),
                "max_platform_distance_m": g.get("max_platform_distance_m"),
                "stops": line_stops,
            }
        )
    stops = _stops_with_sides(domain.get("stops", []), lines)
    return {"lines": lines, "stops": stops}


def _side_of_road(points: list, lat: float, lng: float) -> Optional[str]:
    """'left'/'right' of the road centerline (relative to its direction),
    None when the platform is not near the geometry."""
    import math as _math

    best = None
    for i in range(len(points) - 1):
        x0, y0 = points[i]
        x1, y1 = points[i + 1]
        dx, dy = x1 - x0, y1 - y0
        denom = dx * dx + dy * dy
        t = 0.0 if denom == 0 else max(0.0, min(1.0, ((lat - x0) * dx + (lng - y0) * dy) / denom))
        px, py = x0 + t * dx, y0 + t * dy
        d = _haversine_km(lat, lng, px, py)
        if best is None or d < best[0]:
            best = (d, dx, dy, x0, y0)
    if not best:
        return None
    d, dx, dy, x0, y0 = best
    if d > 0.2:
        return None
    kl = _math.cos(_math.radians((lat + y0) / 2.0))
    cross = dx * (lat - y0) - (dy * kl) * ((lng - x0) * kl)
    return "left" if cross > 0 else "right"


def _haversine_km(lat1, lng1, lat2, lng2) -> float:
    import math as _math

    r = 6371.0
    p1, p2 = _math.radians(lat1), _math.radians(lat2)
    dp, dl = _math.radians(lat2 - lat1), _math.radians(lng2 - lng1)
    a = _math.sin(dp / 2) ** 2 + _math.cos(p1) * _math.cos(p2) * _math.sin(dl / 2) ** 2
    return r * 2 * _math.atan2(_math.sqrt(a), _math.sqrt(1 - a))


def _stops_with_sides(stops: list, lines: list) -> list:
    """Attach left/right side to each stop/platform using the geometry of
    a line that serves it."""
    for stop in stops:
        stop_side = None
        plat_sides = {}
        for platform in stop.get("platforms", []):
            side = None
            for line in lines:
                if str(platform.get("platform_id")) in {str(s.get("stop_id")) for s in line.get("stops", [])}:
                    pts = [[p["latitude"], p["longitude"]] for p in line.get("points", [])]
                    if len(pts) >= 2:
                        side = _side_of_road(pts, platform.get("latitude"), platform.get("longitude"))
                        if side:
                            break
            platform["side"] = side
            plat_sides[str(platform.get("platform_id"))] = side
            if stop_side is None and side:
                stop_side = side
        stop["side"] = stop_side
    return stops


@router.get("/graph/overlays")
async def v2_overlays(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    from mobility.graph import get_overlays

    return await get_overlays()


@router.post("/graph/overlays")
async def v2_create_overlay(payload: dict, current_user: UserPublic = Depends(get_current_user_optional)):
    """Operator-drawn road/track correction (Perix manual graph overlay).
    Overlays never mutate imported data - the resolver prefers them only
    when verified and mode-compatible."""
    from fastapi import HTTPException

    from mobility.graph import create_overlay
    from routes.mobility import _require_operator

    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        await _require_operator(current_user)
    except HTTPException:
        raise
    try:
        return await create_overlay(payload or {})
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/stops")
async def v2_stops(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    domain = await _domain()
    if not domain:
        return []
    return domain["stops"]


@router.get("/stops/{stop_id}/arrivals")
async def v2_stop_arrivals(stop_id: str, current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    """Unified arrivals for a physical stop: LIVE GPS, realtime and
    schedule arrivals from one engine, honoring canceled/skipped."""
    from mobility.arrivals import unified_arrivals

    return await unified_arrivals(stop_id)


@router.get("/plan")
async def v2_plan(
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
    current_user: Optional[UserPublic] = Depends(get_current_user_optional),
):
    """Journey planning - same engine as V1, exposed on the stable API."""
    from routes.mobility import plan_journey

    return await plan_journey(from_lat, from_lng, to_lat, to_lng, current_user)


@router.get("/vehicles")
async def v2_vehicles(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    """Canonical vehicle state: position always carries source/quality, and
    every scheduled vehicle has a stable trip_instance_id. Adding a new
    position source later only changes `source` - never the shape."""
    from datetime import datetime

    from routes.mobility import _all_active_vehicles

    domain = await _domain()
    service_date = (domain or {}).get("network", {}).get("service_date")
    vehicles = await _all_active_vehicles()
    now = datetime.now().astimezone()
    out = []
    for v in vehicles:
        source = str(v.get("position_source") or "VEHICLE_GPS")
        estimated = bool(v.get("estimated"))
        quality = "LIVE" if not estimated else ("REALTIME" if source == "REALTIME_ESTIMATE" else "SCHEDULE")
        age_seconds = 0
        try:
            if v.get("updated_at"):
                dt = datetime.fromisoformat(str(v.get("updated_at")))
                if dt.tzinfo is None:
                    from zoneinfo import ZoneInfo

                    dt = dt.replace(tzinfo=ZoneInfo("UTC"))
                age_seconds = max(0, int((now - dt).total_seconds()))
        except Exception:
            age_seconds = 0
        trip_id = v.get("trip_id")
        out.append(
            {
                "vehicle_id": v.get("vehicle_id"),
                "mode": v.get("mode"),
                "route": {"number": v.get("route_number"), "direction": v.get("route_direction")},
                "position": {
                    "latitude": v.get("latitude"),
                    "longitude": v.get("longitude"),
                    "heading": v.get("heading"),
                    "source": source,
                    "quality": quality,
                    "accuracy_m": v.get("accuracy_m"),
                    "age_seconds": age_seconds,
                },
                "trip_instance_id": f"{NETWORK_ID}:{service_date}:{trip_id}" if trip_id and service_date else None,
                "trip_id": trip_id,
                "delay_minutes": v.get("delay_minutes") or 0,
                "estimated": estimated,
            }
        )
    return out
