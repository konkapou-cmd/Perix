"""Network Editor base (Mobility Core V2 - Phase 3).

Operator overrides over imported stops: rename, move, deactivate,
temporary/manual stops and extra platforms. Everything is stored as an
OVERLAY - imported GTFS data is never mutated, so the next import starts
clean and the overrides stay on top.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from database import db
from mobility.regions import get_active_region
from models.user import UserPublic
from routes.dependencies import get_current_user_optional

router = APIRouter(prefix="/mobility/v2", tags=["MobilityEditor"])


def _scope() -> dict:
    region = get_active_region()
    return {"region_id": region.region_id, "network_id": region.network_id}


async def _require_operator_user(current_user: Optional[UserPublic]) -> dict:
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    from routes.mobility import _require_operator

    return await _require_operator(current_user)


async def _get_overrides() -> list:
    docs = await db.mobility_stop_overrides.find(_scope(), {"_id": 0}).to_list(500)
    return list(docs)


@router.get("/stops/{stop_id}")
async def v2_stop_detail(stop_id: str, current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    from mobility.domain import build_domain, NETWORK_ID
    from routes.mobility import _get_active_network

    network = await _get_active_network()
    if not network:
        raise HTTPException(status_code=404, detail="No active network")
    domain = build_domain(network, NETWORK_ID, await _get_overrides())
    for stop in domain["stops"]:
        if str(stop.get("stop_id")) == stop_id or stop_id in {str(x) for x in stop.get("stop_ids", [])}:
            return stop
    raise HTTPException(status_code=404, detail="Stop not found")


@router.get("/editor/release-snapshot")
async def v2_operator_release_snapshot(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    """Operator-only, read-only export for OFFLINE V6 validation.

    Unlike the public /mobility/network endpoint, includes the precise active
    network version, service day, activation timestamp and routing metadata.
    No GPS traces, user profiles, API credentials or operator write actions.
    """
    await _require_operator_user(current_user)
    from routes.mobility import _get_active_network
    from mobility.domain import _service_date
    network = await _get_active_network()
    if not network:
        raise HTTPException(status_code=404, detail="No active transit network")
    region = get_active_region()
    return {
        "region_id": region.region_id,
        "network_id": region.network_id,
        "timezone": str(network.get("timezone") or region.timezone),
        "service_day_start_hour": int(network.get("service_day_start_hour") or region.service_day_start_hour),
        "version_id": str(network.get("version_id") or ""),
        "service_date": str(network.get("service_date") or _service_date(network)),
        "activated_at": network.get("activated_at"),
        "name": network.get("name"),
        "routes": network.get("routes") or [],
    }


@router.get("/editor/overrides")
async def v2_list_overrides(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    await _require_operator_user(current_user)
    return await _get_overrides()


@router.post("/editor/overrides")
async def v2_create_override(payload: dict, current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    """Create a stop override: kind = rename | move | deactivate | activate |
    manual_stop | add_platform."""
    operator = await _require_operator_user(current_user)
    kind = str(payload.get("kind") or "")
    if kind not in ("rename", "move", "deactivate", "activate", "manual_stop", "add_platform"):
        raise HTTPException(status_code=400, detail="Unknown override kind")
    import uuid

    from routes.mobility import now_utc

    doc = {
        **_scope(),
        "override_id": f"ovr_{uuid.uuid4().hex[:12]}",
        "kind": kind,
        "target_stop_id": str(payload.get("target_stop_id") or ""),
        "name": payload.get("name"),
        "latitude": payload.get("latitude"),
        "longitude": payload.get("longitude"),
        "modes": [m for m in (payload.get("modes") or []) if m in ("bus", "tram")],
        "routes": payload.get("routes") or [],
        "platforms": payload.get("platforms") or [],
        "platform": payload.get("platform"),
        "stop_id": payload.get("stop_id"),
        "created_by": operator.get("business_id") or current_user.user_id,
        "created_at": now_utc().isoformat(),
    }
    await db.mobility_stop_overrides.insert_one(doc)
    return doc


@router.delete("/editor/overrides/{override_id}")
async def v2_delete_override(override_id: str, current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    await _require_operator_user(current_user)
    await db.mobility_stop_overrides.delete_one({**_scope(), "override_id": override_id})
    return {"ok": True}


@router.get("/editor/trip-overrides")
async def v2_list_trip_overrides(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    await _require_operator_user(current_user)
    docs = await db.mobility_trip_overrides.find(_scope(), {"_id": 0}).to_list(500)
    return docs


@router.post("/editor/trip-overrides")
async def v2_create_trip_override(payload: dict, current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    """Operational exception: kind = trip_canceled | stop_skipped.
    Applied by the arrivals engine AND the position estimator - the
    imported timetable stays untouched."""
    operator = await _require_operator_user(current_user)
    kind = str(payload.get("kind") or "")
    if kind not in ("trip_canceled", "stop_skipped"):
        raise HTTPException(status_code=400, detail="Unknown trip override kind")
    if not payload.get("trip_id"):
        raise HTTPException(status_code=400, detail="trip_id required")
    if kind == "stop_skipped" and not payload.get("stop_id"):
        raise HTTPException(status_code=400, detail="stop_id required for stop_skipped")
    import uuid

    from routes.mobility import now_utc

    doc = {
        **_scope(),
        "override_id": f"tovr_{uuid.uuid4().hex[:12]}",
        "kind": kind,
        "trip_id": str(payload.get("trip_id")),
        "stop_id": str(payload.get("stop_id") or "") or None,
        "reason": payload.get("reason"),
        "valid_from": payload.get("valid_from"),
        "valid_until": payload.get("valid_until"),
        "created_by": operator.get("business_id") or current_user.user_id,
        "created_at": now_utc().isoformat(),
    }
    await db.mobility_trip_overrides.insert_one(doc)
    return doc


@router.delete("/editor/trip-overrides/{override_id}")
async def v2_delete_trip_override(override_id: str, current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    await _require_operator_user(current_user)
    await db.mobility_trip_overrides.delete_one({**_scope(), "override_id": override_id})
    return {"ok": True}


@router.get("/editor/restrictions")
async def v2_list_restrictions(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    await _require_operator_user(current_user)
    docs = await db.mobility_restrictions.find(_scope(), {"_id": 0}).to_list(500)
    return docs


@router.post("/editor/restrictions")
async def v2_create_restriction(payload: dict, current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    """Mode-aware closure: e.g. {kind: segment_closed, geometry: [[lat,lng],...],
    blocked_modes: [bus, taxi], allowed_modes: [tram], route_numbers: [], valid window}.
    Closed edges for the blocked modes are excluded from road/rail routing."""
    operator = await _require_operator_user(current_user)
    kind = str(payload.get("kind") or "segment_closed")
    if kind not in ("segment_closed", "rail_closed", "road_closed", "detour", "stop_closed"):
        raise HTTPException(status_code=400, detail="Unknown restriction kind")
    geometry = [[float(p[0]), float(p[1])] for p in (payload.get("geometry") or []) if len(p) >= 2]
    if len(geometry) < 2:
        raise HTTPException(status_code=400, detail="geometry needs at least 2 points")
    import re

    ways = []
    for x in payload.get("blocked_way_ids") or []:
        try:
            ways.append(int(x))
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="invalid blocked_way_ids")
    edges = [str(x) for x in (payload.get("blocked_edge_ids") or [])]
    if any(not re.fullmatch(r"-?\d{1,20}:-?\d{1,20}:-?\d{1,20}", x) for x in edges):
        raise HTTPException(status_code=400, detail="invalid blocked_edge_ids")
    verified = bool(payload.get("verified", False))
    if verified and not bool(getattr(current_user, "is_admin", False)):
        raise HTTPException(status_code=403, detail="Admin verification required for graph closures")
    if verified and not (ways or edges):
        raise HTTPException(status_code=400, detail="verified closure needs exact OSM way/edge IDs")
    if verified and not (payload.get("blocked_modes") or payload.get("allowed_modes")):
        raise HTTPException(status_code=400, detail="verified closure needs explicit mode selection")
    verified_snapshot_v = None
    if verified:
        from mobility.verified_closure import verify_closure_osm
        try:
            verified_snapshot_v = await verify_closure_osm(
                geometry=geometry, blocked_way_ids=set(ways),
                blocked_edge_ids=set(edges),
                blocked_modes=[m for m in (payload.get("blocked_modes") or [])],
                allowed_modes=[m for m in (payload.get("allowed_modes") or [])],
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    import uuid

    from routes.mobility import now_utc

    doc = {
        **_scope(),
        "restriction_id": f"res_{uuid.uuid4().hex[:12]}",
        "kind": kind,
        "geometry": geometry,
        "blocked_modes": [m for m in (payload.get("blocked_modes") or []) if m in ("bus", "tram", "taxi", "car")],
        "allowed_modes": [m for m in (payload.get("allowed_modes") or []) if m in ("bus", "tram", "taxi", "car")],
        "route_numbers": [str(x) for x in (payload.get("route_numbers") or [])],
        "direction": payload.get("direction") or "both",
        "valid_from": payload.get("valid_from"),
        "valid_until": payload.get("valid_until"),
        "source": payload.get("source") or "PERIX_MANUAL",
        "verified": verified,
        "verified_osm_snapshot_v": verified_snapshot_v,
        "blocked_way_ids": sorted(set(ways)),
        "blocked_edge_ids": sorted(set(edges)),
        "created_by": operator.get("business_id") or current_user.user_id,
        "created_at": now_utc().isoformat(),
    }
    await db.mobility_restrictions.insert_one(doc)
    # Rebuild affected geometries with the closed edges excluded
    try:
        from mobility.restrictions import invalidate_geometries

        await invalidate_geometries(doc)
    except Exception:
        return {**doc, "rebuild_queued": False, "rebuild_error": "Geometry rebuild failed"}
    return {**doc, "rebuild_queued": bool(verified)}


@router.delete("/editor/restrictions/{restriction_id}")
async def v2_delete_restriction(restriction_id: str, current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    operator = await _require_operator_user(current_user)
    doc = await db.mobility_restrictions.find_one({**_scope(), "restriction_id": restriction_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Restriction not found")
    if doc.get("verified") and not bool(getattr(current_user, "is_admin", False)):
        raise HTTPException(status_code=403, detail="Admin verification required for graph closures")
    await db.mobility_restrictions.delete_one({**_scope(), "restriction_id": restriction_id})
    try:
        from mobility.restrictions import invalidate_geometries

        await invalidate_geometries(doc)
    except Exception:
        return {"ok": True, "rebuild_queued": False, "rebuild_error": "Geometry rebuild failed"}
    return {"ok": True, "rebuild_queued": bool(doc.get("verified"))}
