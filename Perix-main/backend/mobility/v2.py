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
    out = []
    for pat in domain.get("patterns", []):
        resolved = resolve_pattern_geometry(pat, platforms_by_id, overlays)
        out.append(
            {
                **{k: v for k, v in pat.items() if k != "points"},
                "geometry": resolved,
            }
        )
    return out


@router.get("/map")
async def v2_map(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    """The stable map payload the Locator will consume: resolved lines
    (validated geometry + source per pattern) and physical stops."""
    domain = await _domain()
    if not domain:
        return {"lines": [], "stops": []}
    patterns = await _patterns_resolved(domain)
    lines = []
    for p in patterns:
        g = p.get("geometry") or {}
        points = g.get("points") or []
        if len(points) < 2:
            continue
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
            }
        )
    return {"lines": lines, "stops": domain.get("stops", [])}


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


@router.get("/vehicles")


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
