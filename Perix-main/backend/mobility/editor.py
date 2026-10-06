"""Network Editor base (Mobility Core V2 - Phase 3).

Operator overrides over imported stops: rename, move, deactivate,
temporary/manual stops and extra platforms. Everything is stored as an
OVERLAY - imported GTFS data is never mutated, so the next import starts
clean and the overrides stay on top.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from database import db
from models.user import UserPublic
from routes.dependencies import get_current_user_optional

router = APIRouter(prefix="/mobility/v2", tags=["MobilityEditor"])


async def _require_operator_user(current_user: Optional[UserPublic]) -> dict:
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    from routes.mobility import _require_operator

    return await _require_operator(current_user)


async def _get_overrides() -> list:
    docs = await db.mobility_stop_overrides.find({}, {"_id": 0}).to_list(500)
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
    await db.mobility_stop_overrides.delete_one({"override_id": override_id})
    return {"ok": True}


@router.get("/editor/trip-overrides")
async def v2_list_trip_overrides(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    await _require_operator_user(current_user)
    docs = await db.mobility_trip_overrides.find({}, {"_id": 0}).to_list(500)
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
    await db.mobility_trip_overrides.delete_one({"override_id": override_id})
    return {"ok": True}


@router.get("/editor/restrictions")
async def v2_list_restrictions(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    await _require_operator_user(current_user)
    docs = await db.mobility_restrictions.find({}, {"_id": 0}).to_list(500)
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
    import uuid

    from routes.mobility import now_utc

    doc = {
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
        "created_by": operator.get("business_id") or current_user.user_id,
        "created_at": now_utc().isoformat(),
    }
    await db.mobility_restrictions.insert_one(doc)
    # Rebuild affected geometries with the closed edges excluded
    try:
        from mobility.restrictions import invalidate_geometries

        await invalidate_geometries(doc)
    except Exception:
        pass
    return doc


@router.delete("/editor/restrictions/{restriction_id}")
async def v2_delete_restriction(restriction_id: str, current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    operator = await _require_operator_user(current_user)
    doc = await db.mobility_restrictions.find_one({"restriction_id": restriction_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Restriction not found")
    await db.mobility_restrictions.delete_one({"restriction_id": restriction_id})
    try:
        from mobility.restrictions import invalidate_geometries

        await invalidate_geometries(doc)
    except Exception:
        pass
    return {"ok": True}
