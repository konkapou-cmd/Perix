"""Mobility routes: live vehicles (buses/taxis), driver-code sessions and
vehicle management for operators. Drivers never need Perix accounts."""
import asyncio
import logging
import math
import random
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from database import db
from models.user import UserPublic
from models.mobility import (
    VehicleCreate,
    DriverStartRequest,
    DriverLocationUpdate,
    DriverStatusUpdate,
    NetworkImportRequest,
)
from routes.dependencies import get_current_user, get_current_user_optional
from routes.ws import ws_broadcast_channel_message
from utils.helpers import generate_id, now_utc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mobility", tags=["Mobility"])

MOBILITY_CHANNEL = "mobility:magdeburg"
SESSION_HOURS = 12
CODE_HOURS = 12


def _broadcast(payload: dict) -> None:
    """Fire-and-forget broadcast to every passenger watching the channel."""

    async def _send():
        try:
            await ws_broadcast_channel_message(MOBILITY_CHANNEL, payload)
        except Exception as e:
            logger.warning(f"mobility broadcast failed: {e}")

    try:
        loop = asyncio.get_event_loop()
        loop.create_task(_send())
    except Exception:
        pass


def _generate_code() -> str:
    return f"{random.randint(0, 999999):06d}"


def _live_doc(vehicle: dict, token_doc: Optional[dict] = None) -> dict:
    return {
        "vehicle_id": vehicle["vehicle_id"],
        "business_id": vehicle["business_id"],
        "mode": vehicle["mode"],
        "fleet_number": vehicle.get("fleet_number", ""),
        "name": vehicle.get("name") or vehicle.get("fleet_number", ""),
        "registration": vehicle.get("registration"),
        "route_number": token_doc.get("route_number") if token_doc else vehicle.get("route_number"),
        "route_direction": token_doc.get("route_direction") if token_doc else vehicle.get("route_direction"),
        "latitude": None,
        "longitude": None,
        "heading": None,
        "speed": None,
        "status": "active",
        "updated_at": now_utc().isoformat(),
    }


# ---------------------------------------------------------------------------
# Operator (business owner) endpoints
# ---------------------------------------------------------------------------


async def _require_operator(current_user: UserPublic):
    """Only owners of a mobility business (bus/taxi operator) may manage
    vehicles and driver codes."""
    biz = await db.businesses.find_one(
        {
            "owner_id": current_user.user_id,
            "mobility_role": {"$in": ["bus_operator", "taxi_operator"]},
        },
        {"_id": 0},
    )
    if not biz:
        raise HTTPException(status_code=403, detail="Mobility operator business required")
    return biz


@router.get("/me")
async def mobility_me(current_user: UserPublic = Depends(get_current_user)):
    biz = await db.businesses.find_one({"owner_id": current_user.user_id}, {"_id": 0})
    return {
        "business_id": (biz or {}).get("business_id"),
        "mobility_role": (biz or {}).get("mobility_role"),
    }


@router.post("/vehicles")
async def create_vehicle(payload: VehicleCreate, current_user: UserPublic = Depends(get_current_user)):
    operator = await _require_operator(current_user)
    mode = payload.mode.lower()
    if mode not in ("bus", "taxi"):
        raise HTTPException(status_code=400, detail="mode must be bus or taxi")
    if not payload.fleet_number.strip():
        raise HTTPException(status_code=400, detail="fleet_number is required")
    vehicle = {
        "vehicle_id": generate_id("veh"),
        "business_id": operator["business_id"],
        "mode": mode,
        "fleet_number": payload.fleet_number.strip(),
        "name": payload.name,
        "registration": payload.registration,
        "route_number": payload.route_number,
        "route_direction": payload.route_direction,
        "created_at": now_utc().isoformat(),
        "active": True,
    }
    await db.mobility_vehicles.insert_one(vehicle)
    return vehicle


@router.get("/vehicles")
async def list_vehicles(current_user: UserPublic = Depends(get_current_user)):
    operator = await _require_operator(current_user)
    vehicles = (
        await db.mobility_vehicles.find({"business_id": operator["business_id"]}, {"_id": 0})
        .to_list(500)
    )
    return vehicles


@router.post("/vehicles/{vehicle_id}/code")
async def generate_driver_code(vehicle_id: str, current_user: UserPublic = Depends(get_current_user)):
    operator = await _require_operator(current_user)
    vehicle = await db.mobility_vehicles.find_one(
        {"vehicle_id": vehicle_id, "business_id": operator["business_id"]}, {"_id": 0}
    )
    if not vehicle:
        raise HTTPException(status_code=403, detail="Not authorized")
    # One active code per vehicle - reuse it while valid.
    existing = await db.mobility_driver_codes.find_one(
        {"vehicle_id": vehicle_id, "expires_at": {"$gt": now_utc()}}
    )
    if existing:
        return {
            "code": existing["code"],
            "vehicle_id": vehicle_id,
            "mode": vehicle["mode"],
            "fleet_number": vehicle.get("fleet_number", ""),
            "name": vehicle.get("name") or vehicle.get("fleet_number", ""),
            "route_number": vehicle.get("route_number"),
            "route_direction": vehicle.get("route_direction"),
            "expires_at": existing["expires_at"].isoformat(),
        }
    code = _generate_code()
    doc = {
        "code": code,
        "vehicle_id": vehicle_id,
        "business_id": current_user.user_id,
        "created_at": now_utc(),
        "expires_at": now_utc() + timedelta(hours=CODE_HOURS),
    }
    await db.mobility_driver_codes.insert_one(doc)
    return {
        "code": code,
        "vehicle_id": vehicle_id,
        "mode": vehicle["mode"],
        "fleet_number": vehicle.get("fleet_number", ""),
        "name": vehicle.get("name") or vehicle.get("fleet_number", ""),
        "route_number": vehicle.get("route_number"),
        "route_direction": vehicle.get("route_direction"),
        "expires_at": doc["expires_at"].isoformat(),
    }


# ---------------------------------------------------------------------------
# Driver endpoints - code based, no Perix account
# ---------------------------------------------------------------------------


@router.post("/driver/start")
async def driver_start(payload: DriverStartRequest):
    code = payload.code.strip()
    code_doc = await db.mobility_driver_codes.find_one({"code": code})
    if not code_doc or code_doc.get("expires_at") < now_utc():
        raise HTTPException(status_code=401, detail="Invalid or expired code")
    vehicle = await db.mobility_vehicles.find_one(
        {"vehicle_id": code_doc["vehicle_id"]}, {"_id": 0}
    )
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    token = generate_id("mob")
    session = {
        "session_token": token,
        "vehicle_id": vehicle["vehicle_id"],
        "business_id": vehicle["business_id"],
        "started_at": now_utc(),
        "expires_at": now_utc() + timedelta(hours=SESSION_HOURS),
    }
    await db.mobility_driver_sessions.insert_one(session)
    live = _live_doc(vehicle)
    live["status"] = "available" if vehicle["mode"] == "taxi" else "good"
    await db.mobility_live.replace_one({"vehicle_id": vehicle["vehicle_id"]}, live, upsert=True)
    _broadcast({"type": "vehicle_online", "vehicle": live})
    return {
        "session_token": token,
        "vehicle_id": vehicle["vehicle_id"],
        "mode": vehicle["mode"],
        "fleet_number": vehicle.get("fleet_number", ""),
        "name": vehicle.get("name") or vehicle.get("fleet_number", ""),
        "registration": vehicle.get("registration"),
        "route_number": vehicle.get("route_number"),
        "route_direction": vehicle.get("route_direction"),
        "status": live["status"],
    }


@router.post("/driver/location")
async def driver_location(payload: DriverLocationUpdate):
    session = await db.mobility_driver_sessions.find_one({"session_token": payload.token})
    if not session or session.get("expires_at") < now_utc():
        raise HTTPException(status_code=401, detail="Session expired")
    vehicle = await db.mobility_vehicles.find_one(
        {"vehicle_id": session["vehicle_id"]}, {"_id": 0}
    )
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    live = _live_doc(vehicle, session)
    live["latitude"] = payload.latitude
    live["longitude"] = payload.longitude
    live["heading"] = payload.heading
    live["speed"] = payload.speed
    existing = await db.mobility_live.find_one({"vehicle_id": vehicle["vehicle_id"]})
    live["status"] = (existing or {}).get("status", "good" if vehicle["mode"] == "bus" else "available")
    live["updated_at"] = now_utc().isoformat()

    # Bus stop tracking: snap to the route, detect passed stops and measure
    # the delay against the imported timetable.
    if vehicle["mode"] == "bus" and live.get("route_number"):
        route = await _network_route(live["route_number"])
        if route:
            next_stop = _next_stop_on_route(route, payload.latitude, payload.longitude)
            if next_stop:
                live["next_stop_id"] = next_stop.get("stop_id")
                live["delay_minutes"] = (existing or {}).get("delay_minutes") or 0
                live["passed_stop_id"] = (existing or {}).get("passed_stop_id")
                dist = _haversine_km(
                    payload.latitude, payload.longitude,
                    next_stop["lat"], next_stop["lng"],
                )
                if dist * 1000 < 60:
                    passed = next_stop
                    live["passed_stop_id"] = passed.get("stop_id")
                    scheduled = _time_to_seconds(passed.get("scheduled", ""))
                    if scheduled is not None:
                        now_sec = datetime.now().hour * 3600 + datetime.now().minute * 60 + datetime.now().second
                        live["delay_minutes"] = max(0, round((now_sec - scheduled) / 60))

    await db.mobility_live.replace_one({"vehicle_id": vehicle["vehicle_id"]}, live, upsert=True)
    _broadcast({"type": "vehicle_location", "vehicle": live})
    return {"ok": True}


@router.post("/driver/status")
async def driver_status(payload: DriverStatusUpdate):
    session = await db.mobility_driver_sessions.find_one({"session_token": payload.token})
    if not session or session.get("expires_at") < now_utc():
        raise HTTPException(status_code=401, detail="Session expired")
    vehicle = await db.mobility_vehicles.find_one(
        {"vehicle_id": session["vehicle_id"]}, {"_id": 0}
    )
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    existing = await db.mobility_live.find_one({"vehicle_id": vehicle["vehicle_id"]})
    live = _live_doc(vehicle, session)
    if existing:
        live["latitude"] = existing.get("latitude")
        live["longitude"] = existing.get("longitude")
        live["heading"] = existing.get("heading")
        live["speed"] = existing.get("speed")
    live["status"] = payload.status
    live["updated_at"] = now_utc().isoformat()
    await db.mobility_live.replace_one({"vehicle_id": vehicle["vehicle_id"]}, live, upsert=True)
    _broadcast({"type": "vehicle_status", "vehicle": live})
    return {"ok": True}


@router.post("/driver/end")
async def driver_end(payload: DriverStartRequest):
    session = await db.mobility_driver_sessions.find_one({"session_token": payload.code})
    if not session:
        return {"ok": True}
    await db.mobility_driver_sessions.delete_one({"session_token": payload.code})
    await db.mobility_live.delete_one({"vehicle_id": session["vehicle_id"]})
    _broadcast({"type": "vehicle_offline", "vehicle_id": session["vehicle_id"]})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Bus network (routes/stops/timetable) - versioned imports with a simple
# JSON structure. GTFS conversion can be layered on top later.
# ---------------------------------------------------------------------------


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2
    )
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _time_to_seconds(value: str) -> Optional[int]:
    try:
        h, m = str(value).split(":")
        return int(h) * 3600 + int(m) * 60
    except Exception:
        return None


async def _get_active_network() -> Optional[dict]:
    return await db.bus_network_versions.find_one({"active": True}, {"_id": 0})


async def _network_route(route_number: str) -> Optional[dict]:
    network = await _get_active_network()
    if not network:
        return None
    for route in network.get("routes", []):
        if str(route.get("route_number")) == str(route_number):
            return route
    return None


def _route_distance_to_stop(route: dict, lat: float, lng: float, target_stop_id: str) -> Optional[float]:
    """Approximate distance (meters) the bus still has to travel along the
    route shape (polyline through stops) until the target stop."""
    stops = route.get("stops") or []
    if not stops:
        return None
    target_index = next(
        (i for i, s in enumerate(stops) if s.get("stop_id") == target_stop_id), None
    )
    if target_index is None:
        return None
    # Nearest segment to the current bus position
    best_seg, best_dist = 0, float("inf")
    for i in range(len(stops) - 1):
        a, b = stops[i], stops[i + 1]
        # point-to-segment distance (simplified via midpoint for brevity)
        mid_lat = (a["lat"] + b["lat"]) / 2
        mid_lng = (a["lng"] + b["lng"]) / 2
        d = _haversine_km(lat, lng, mid_lat, mid_lng)
        if d < best_dist:
            best_dist, best_seg = d, i
    total_km = _haversine_km(lat, lng, stops[best_seg + 1]["lat"], stops[best_seg + 1]["lng"])
    for i in range(best_seg + 1, target_index):
        total_km += _haversine_km(
            stops[i]["lat"], stops[i]["lng"], stops[i + 1]["lat"], stops[i + 1]["lng"]
        )
    return max(0.0, total_km * 1000.0)


def _next_stop_on_route(route: dict, lat: float, lng: float) -> Optional[dict]:
    stops = route.get("stops") or []
    if not stops:
        return None
    best_index, best_dist = 0, float("inf")
    for i, s in enumerate(stops):
        d = _haversine_km(lat, lng, s["lat"], s["lng"])
        if d < best_dist:
            best_dist, best_index = d, i
    if best_index + 1 < len(stops):
        return stops[best_index + 1]
    return stops[best_index]


@router.get("/network")
async def get_network(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    network = await _get_active_network()
    if not network:
        return {"version_id": None, "name": None, "imported_at": None, "routes": []}
    return {
        "version_id": network.get("version_id"),
        "name": network.get("name"),
        "imported_at": network.get("imported_at"),
        "routes": network.get("routes", []),
    }


@router.post("/network/import")
async def import_network(payload: NetworkImportRequest, current_user: UserPublic = Depends(get_current_user)):
    await _require_operator(current_user)
    routes = payload.routes or []
    if not routes:
        raise HTTPException(status_code=400, detail="routes are required")
    active = await _get_active_network()
    old_routes = {str(r.get("route_number")): r for r in (active or {}).get("routes", [])}
    new_routes = {str(r.get("route_number")): r for r in routes}
    added_routes = sorted(set(new_routes) - set(old_routes))
    removed_routes = sorted(set(old_routes) - set(new_routes))
    changed_routes = []
    for num in set(old_routes) & set(new_routes):
        old_stops = [s.get("stop_id") for s in old_routes[num].get("stops", [])]
        new_stops = [s.get("stop_id") for s in new_routes[num].get("stops", [])]
        if old_stops != new_stops:
            changed_routes.append(num)
    version = {
        "version_id": generate_id("net"),
        "name": payload.name or f"Network {now_utc().strftime('%Y-%m-%d %H:%M')}",
        "routes": routes,
        "imported_at": now_utc().isoformat(),
        "active": False,
    }
    await db.bus_network_versions.insert_one(version)
    diff = {
        "added_routes": added_routes,
        "removed_routes": removed_routes,
        "changed_routes": changed_routes,
        "active_version": (active or {}).get("version_id"),
    }
    _broadcast({"type": "network_imported", "version_id": version["version_id"], "diff": diff})
    return {"version_id": version["version_id"], "name": version["name"], "diff": diff}


@router.post("/network/activate")
async def activate_network(payload: dict, current_user: UserPublic = Depends(get_current_user)):
    await _require_operator(current_user)
    version_id = payload.get("version_id")
    version = await db.bus_network_versions.find_one({"version_id": version_id})
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    await db.bus_network_versions.update_many({}, {"$set": {"active": False}})
    await db.bus_network_versions.update_one({"version_id": version_id}, {"$set": {"active": True}})
    _broadcast({"type": "network_activated", "version_id": version_id})
    return {"active": version_id}


@router.get("/buses/search")
async def search_bus_stops(q: str = "", current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    network = await _get_active_network()
    if not network or not q.strip():
        return []
    needle = q.strip().lower()
    results: dict = {}
    for route in network.get("routes", []):
        for stop in route.get("stops", []):
            name = str(stop.get("name", ""))
            if needle in name.lower():
                key = stop.get("stop_id") or name
                entry = results.setdefault(
                    key,
                    {"stop_id": stop.get("stop_id"), "name": name, "lat": stop.get("lat"), "lng": stop.get("lng"), "routes": []},
                )
                entry["routes"].append(
                    {"route_number": route.get("route_number"), "headsign": route.get("name", "")}
                )
    return list(results.values())[:20]


@router.get("/buses/serving")
async def buses_serving_stop(
    stop_id: str = "",
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    current_user: Optional[UserPublic] = Depends(get_current_user_optional),
):
    """Live buses whose route serves the requested stop, with a rough ETA."""
    network = await _get_active_network()
    if not network:
        return []
    serving_routes = [
        r
        for r in network.get("routes", [])
        if any(s.get("stop_id") == stop_id for s in r.get("stops", []))
    ]
    route_numbers = {str(r.get("route_number")) for r in serving_routes}
    live = (
        await db.mobility_live.find(
            {"mode": "bus", "route_number": {"$in": list(route_numbers)}}, {"_id": 0}
        ).to_list(200)
    )
    results = []
    for bus in live:
        if bus.get("latitude") is None or bus.get("longitude") is None:
            continue
        route = next((r for r in serving_routes if str(r.get("route_number")) == str(bus.get("route_number"))), None)
        if not route:
            continue
        remaining_m = _route_distance_to_stop(route, bus["latitude"], bus["longitude"], stop_id)
        speed_kmh = bus.get("speed") or 18.0
        if speed_kmh < 5:
            speed_kmh = 18.0
        eta_minutes = round((remaining_m / 1000.0) / speed_kmh * 60) + int(bus.get("delay_minutes") or 0)
        user_distance_m = None
        if lat is not None and lng is not None:
            user_distance_m = round(_haversine_km(lat, lng, bus["latitude"], bus["longitude"]) * 1000)
        results.append(
            {
                "vehicle_id": bus.get("vehicle_id"),
                "route_number": bus.get("route_number"),
                "route_direction": bus.get("route_direction") or route.get("name", ""),
                "status": bus.get("status"),
                "delay_minutes": bus.get("delay_minutes") or 0,
                "eta_minutes": eta_minutes,
                "distance_to_bus_m": user_distance_m,
                "distance_to_stop_m": round(remaining_m),
            }
        )
    results.sort(key=lambda x: x["eta_minutes"])
    return results


# ---------------------------------------------------------------------------
# Passenger endpoint
# ---------------------------------------------------------------------------


@router.get("/live")
async def live_vehicles(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    vehicles = (
        await db.mobility_live.find(
            {"updated_at": {"$gt": (now_utc() - timedelta(minutes=5)).isoformat()}},
            {"_id": 0},
        )
        .to_list(500)
    )
    return vehicles
