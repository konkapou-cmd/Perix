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
    return build_domain(network, NETWORK_ID)


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
    return domain["patterns"]


@router.get("/stops")
async def v2_stops(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    domain = await _domain()
    if not domain:
        return []
    return domain["stops"]


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
