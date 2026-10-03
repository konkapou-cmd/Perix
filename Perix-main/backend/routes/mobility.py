"""Mobility routes: live vehicles (buses/taxis), driver-code sessions and
vehicle management for operators. Drivers never need Perix accounts."""
import asyncio
import logging
import math
import os
import random
from datetime import datetime, timedelta
from typing import List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from database import db
from models.user import UserPublic
from models.mobility import (
    VehicleCreate,
    DriverStartRequest,
    DriverLocationUpdate,
    DriverStatusUpdate,
    NetworkImportRequest,
    TaxiRequestCreate,
)
from routes.dependencies import get_current_user, get_current_user_optional
from routes.ws import ws_broadcast_channel_message
from utils.helpers import generate_id, now_utc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mobility", tags=["Mobility"])

MOBILITY_CHANNEL = "mobility:magdeburg"
SESSION_HOURS = 12
CODE_HOURS = 12

# Restricted service credential for the external mobility sync worker.
# Scope: network write + realtime write ONLY - never user data.
MOBILITY_SYNC_API_KEY = os.getenv("MOBILITY_SYNC_API_KEY", "")
MOBILITY_SYNC_BUSINESS_ID = os.getenv("MOBILITY_SYNC_BUSINESS_ID", "")


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


async def _authorize_sync_or_operator(
    request: Request,
    current_user: Optional[UserPublic] = Depends(get_current_user_optional),
):
    """Accepts either an authenticated operator OR the restricted mobility
    sync API key (X-Perix-Sync-Key). The key only unlocks network/realtime
    writes - nothing else."""
    key = request.headers.get("X-Perix-Sync-Key", "")
    if MOBILITY_SYNC_API_KEY and key and key == MOBILITY_SYNC_API_KEY:
        query = (
            {"business_id": MOBILITY_SYNC_BUSINESS_ID}
            if MOBILITY_SYNC_BUSINESS_ID
            else {"mobility_role": {"$in": ["bus_operator", "taxi_operator"]}}
        )
        biz = await db.businesses.find_one(query, {"_id": 0})
        if not biz:
            raise HTTPException(status_code=403, detail="Sync business not configured")
        return biz
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return await _require_operator(current_user)


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
    if mode not in ("bus", "tram", "taxi"):
        raise HTTPException(status_code=400, detail="mode must be bus, tram or taxi")
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
                        now_sec = _now_service_seconds()
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
    """Parse HH:MM; hours >= 24 (GTFS service-day times) are preserved."""
    try:
        h, m = str(value).split(":")
        return int(h) * 3600 + int(m) * 60
    except Exception:
        return None


# GTFS service days run from ~04:00 to ~28:00 (04:00 next day). The whole
# engine works in "service-day seconds" so trips crossing midnight work.
SERVICE_DAY_START_HOUR = 4


def _now_service_seconds() -> int:
    """Current time in Europe/Berlin expressed in service-day seconds
    (e.g. 01:30 at night = 25:30 of yesterday's service day)."""
    now = datetime.now(ZoneInfo("Europe/Berlin"))
    sec = now.hour * 3600 + now.minute * 60 + now.second
    if now.hour < SERVICE_DAY_START_HOUR:
        sec += 24 * 3600
    return sec


def _berlin_now() -> datetime:
    return datetime.now(ZoneInfo("Europe/Berlin"))


def _shape_index_for(shape: List[list], lat: float, lng: float) -> int:
    best_i, best_d = 0, float("inf")
    for i, pt in enumerate(shape):
        d = _haversine_km(lat, lng, pt[0], pt[1])
        if d < best_d:
            best_d, best_i = d, i
    return best_i


def _position_along_shape(shape: List[list], from_idx: int, to_idx: int, frac: float) -> dict:
    """Point at `frac` (0..1) of the cumulative path along shape[from_idx..to_idx]."""
    if from_idx == to_idx:
        return {"lat": shape[from_idx][0], "lng": shape[from_idx][1]}
    segs = []
    total = 0.0
    for i in range(from_idx, to_idx):
        d = _haversine_km(shape[i][0], shape[i][1], shape[i + 1][0], shape[i + 1][1])
        segs.append(d)
        total += d
    target = total * frac
    acc = 0.0
    for i, d in enumerate(segs):
        if acc + d >= target and d > 0:
            f = (target - acc) / d
            return {
                "lat": shape[from_idx + i][0] + (shape[from_idx + i + 1][0] - shape[from_idx + i][0]) * f,
                "lng": shape[from_idx + i][1] + (shape[from_idx + i + 1][1] - shape[from_idx + i][1]) * f,
            }
        acc += d
    return {"lat": shape[to_idx][0], "lng": shape[to_idx][1]}


def _bearing(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Bearing in degrees (0 = north, clockwise)."""
    import math

    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_lng = math.radians(lng2 - lng1)
    y = math.sin(d_lng) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(d_lng)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def _estimate_trip_position(route: dict, trip: dict, now_sec: int, delays: dict) -> Optional[dict]:
    """Estimated position of a running trip along the route shape (or stop
    polyline), interpolated between scheduled stop times, corrected with
    GTFS-Realtime per-stop delays so a delayed vehicle sits where it
    actually is. Returns None when the trip is not running right now."""
    # Realtime state for this trip
    realtime = delays.get(trip.get("trip_id")) if trip.get("trip_id") else None
    trip_delay = int(realtime.get("delay_seconds") or 0) if realtime else 0
    stop_delays = realtime.get("stop_delays") or {} if realtime else {}

    stop_times = trip.get("stop_times") or {}
    stops = route.get("stops") or []
    if not stops:
        return None
    # Effective (delay-corrected) stop times
    scheduled = []
    for s in stops:
        t = _time_to_seconds(stop_times.get(s.get("stop_id"), ""))
        if t is None and s.get("scheduled"):
            t = _time_to_seconds(s.get("scheduled"))
        if t is None:
            continue
        d = int(stop_delays.get(s.get("stop_id"), trip_delay))
        scheduled.append({"stop": s, "t": t + d})
    scheduled.sort(key=lambda x: x["t"])
    if not scheduled:
        return None
    start = scheduled[0]["t"]
    end = scheduled[-1]["t"]
    if now_sec < start or now_sec > end:
        return None
    prev, nxt = None, None
    for i, entry in enumerate(scheduled):
        if entry["t"] <= now_sec:
            prev = entry
        if entry["t"] >= now_sec and nxt is None:
            nxt = entry
    if prev is None:
        pos = scheduled[0]["stop"]
    elif nxt is None or nxt is prev:
        pos = scheduled[-1]["stop"]
    else:
        span = max(1, nxt["t"] - prev["t"])
        frac = min(1.0, max(0.0, (now_sec - prev["t"]) / span))
        shape = route.get("shape") or []
        if isinstance(shape, list) and len(shape) > 2:
            # Move along the real route shape instead of a straight line.
            from_idx = _shape_index_for(shape, prev["stop"]["lat"], prev["stop"]["lng"])
            to_idx = _shape_index_for(shape, nxt["stop"]["lat"], nxt["stop"]["lng"])
            pos = _position_along_shape(shape, from_idx, to_idx, frac)
        else:
            pos = {
                "lat": prev["stop"]["lat"] + (nxt["stop"]["lat"] - prev["stop"]["lat"]) * frac,
                "lng": prev["stop"]["lng"] + (nxt["stop"]["lng"] - prev["stop"]["lng"]) * frac,
            }
    delay_minutes = 0
    position_source = "SCHEDULE_ESTIMATE"
    if trip_delay > 0:
        delay_minutes = max(0, round(trip_delay / 60))
        position_source = "REALTIME_ESTIMATE"
    # Facing direction: toward the next scheduled stop
    heading = None
    if prev is not None and nxt is not None and nxt is not prev:
        heading = _bearing(prev["stop"]["lat"], prev["stop"]["lng"], nxt["stop"]["lat"], nxt["stop"]["lng"])
    return {
        "latitude": pos["lat"],
        "longitude": pos["lng"],
        "heading": heading,
        "delay_minutes": delay_minutes,
        "position_source": position_source,
    }


# Short-lived cache for the estimated vehicles so fast client polling
# doesn't recompute the whole trip graph on every request.
_ESTIMATES_CACHE = {"at": 0.0, "data": []}


async def _estimated_transit_vehicles() -> List[dict]:
    """Virtual vehicles for every currently running trip of the active
    network (bus/tram), unless a real vehicle already covers that route
    and direction."""
    import time

    now_ts = time.time()
    if now_ts - _ESTIMATES_CACHE["at"] < 3:
        return _ESTIMATES_CACHE["data"]
    network = await _get_active_network()
    if not network:
        return []
    live = await db.mobility_live.find(
        {"mode": {"$in": ["bus", "tram"]}, "latitude": {"$ne": None}}, {"_id": 0}
    ).to_list(500)
    covered = {
        (str(v.get("route_number")), str(v.get("route_direction") or "")) for v in live
    }
    now_sec = _now_service_seconds()
    estimates: List[dict] = []
    trip_ids = [
        t.get("trip_id")
        for route in network.get("routes", [])
        for t in route.get("trips", [])
        if t.get("trip_id")
    ]
    # One batched query for all realtime delays (not one per trip)
    delays = {}
    if trip_ids:
        docs = await db.mobility_realtime.find(
            {"trip_id": {"$in": trip_ids}}, {"_id": 0}
        ).to_list(len(trip_ids))
        delays = {d["trip_id"]: d for d in docs}
    for route in network.get("routes", []):
        route_number = str(route.get("route_number"))
        mode = route.get("mode") if route.get("mode") in ("bus", "tram") else "bus"
        for trip in route.get("trips", []):
            headsign = str(trip.get("headsign") or route.get("name") or "")
            if (route_number, headsign) in covered or (route_number, "") in covered:
                continue
            pos = _estimate_trip_position(route, trip, now_sec, delays)
            if not pos:
                continue
            estimates.append(
                {
                    "vehicle_id": f"est_{route_number}_{trip.get('trip_id', '')}",
                    "business_id": network.get("business_id") or "mvb",
                    "mode": mode,
                    "fleet_number": route_number,
                    "name": f"{route_number} {headsign}".strip(),
                    "route_number": route_number,
                    "route_direction": headsign,
                    "latitude": pos["latitude"],
                    "longitude": pos["longitude"],
                    "heading": pos.get("heading"),
                    "status": "estimated",
                    "delay_minutes": pos["delay_minutes"],
                    "position_source": pos["position_source"],
                    "estimated": True,
                    "updated_at": datetime.now().isoformat(),
                }
            )
    _ESTIMATES_CACHE["at"] = time.time()
    _ESTIMATES_CACHE["data"] = estimates
    return estimates


async def _all_active_vehicles() -> List[dict]:
    live = (
        await db.mobility_live.find(
            {"updated_at": {"$gt": (now_utc() - timedelta(minutes=5)).isoformat()}},
            {"_id": 0},
        ).to_list(500)
    )
    return live + await _estimated_transit_vehicles()


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


async def _create_network_version(routes: List[dict], name: str) -> dict:
    """Create an inactive network version and diff it against the active one."""
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
        "name": name,
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


@router.post("/network/import")
async def import_network(
    payload: NetworkImportRequest,
    operator: dict = Depends(_authorize_sync_or_operator),
):
    routes = payload.routes or []
    if not routes:
        raise HTTPException(status_code=400, detail="routes are required")
    return await _create_network_version(routes, payload.name or f"Network {now_utc().strftime('%Y-%m-%d %H:%M')}")


@router.post("/network/import-gtfs")
async def import_gtfs_zip(
    file: UploadFile = File(...),
    date: Optional[str] = Form(None),
    operator: dict = Depends(_authorize_sync_or_operator),
):
    """Upload the official GTFS zip directly - the backend converts it into
    the bus/tram network for the requested service date (default: today in
    Europe/Berlin)."""
    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="GTFS file too large (max 50MB)")
    try:
        from utils.gtfs import parse_gtfs_zip

        payload = parse_gtfs_zip(content, date)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"GTFS parse failed: {e}")
    if not payload.get("routes"):
        raise HTTPException(status_code=400, detail="No bus/tram routes found in the feed")
    result = await _create_network_version(
        payload["routes"], payload.get("name") or f"GTFS {date or 'today'}"
    )
    result["summary"] = {
        "bus_lines": sum(1 for r in payload["routes"] if r.get("mode") == "bus"),
        "tram_lines": sum(1 for r in payload["routes"] if r.get("mode") == "tram"),
        "trips": sum(len(r.get("trips", [])) for r in payload["routes"]),
        "service_date": payload.get("service_date"),
    }
    return result


@router.post("/network/activate")
async def activate_network(payload: dict, operator: dict = Depends(_authorize_sync_or_operator)):
    version_id = payload.get("version_id")
    version = await db.bus_network_versions.find_one({"version_id": version_id})
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    await db.bus_network_versions.update_many({}, {"$set": {"active": False}})
    await db.bus_network_versions.update_one({"version_id": version_id}, {"$set": {"active": True}})
    _broadcast({"type": "network_activated", "version_id": version_id})
    return {"active": version_id}


@router.post("/network/realtime")
async def push_realtime_updates(payload: dict, operator: dict = Depends(_authorize_sync_or_operator)):
    """GTFS-Realtime TripUpdates from the mobility sync service. Updates are
    keyed by trip_id and consumed by the position estimator
    (REALTIME_ESTIMATE)."""
    updates = payload.get("updates") or []
    if not isinstance(updates, list):
        raise HTTPException(status_code=400, detail="updates array required")
    now = _berlin_now().isoformat()
    for u in updates:
        trip_id = u.get("trip_id")
        if not trip_id:
            continue
        delay_seconds = u.get("delay_seconds")
        if delay_seconds is None:
            continue
        await db.mobility_realtime.replace_one(
            {"trip_id": trip_id},
            {
                "trip_id": trip_id,
                "delay_seconds": int(delay_seconds),
                "updated_at": now,
                "source": u.get("source", "GTFS_RT"),
            },
            upsert=True,
        )
    _broadcast({"type": "realtime_updates", "count": len(updates)})
    return {"ok": True, "count": len(updates)}


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
    live = [
        v
        for v in await _all_active_vehicles()
        if v.get("mode") in ("bus", "tram") and str(v.get("route_number")) in route_numbers
    ]
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
# Taxi: pricing, passenger requests and company assignment. No payments -
# the final fare is always set by the taxi meter / operator tariff.
# ---------------------------------------------------------------------------

_DEFAULT_TAXI_PRICING = {"base_fare": 4.5, "per_km": 2.6, "minimum": 8.0, "currency": "EUR"}


async def _taxi_operator_business(business_id: Optional[str] = None) -> Optional[dict]:
    query = {"mobility_role": "taxi_operator"}
    if business_id:
        query["business_id"] = business_id
    return await db.businesses.find_one(query, {"_id": 0})


def _estimate_trip(pickup_lat, pickup_lng, dest_lat, dest_lng, pricing: dict) -> dict:
    straight_km = _haversine_km(pickup_lat, pickup_lng, dest_lat, dest_lng)
    road_km = round(straight_km * 1.3, 1)
    duration_min = max(3, round(road_km / 25.0 * 60))
    fare = max(
        float(pricing.get("minimum", _DEFAULT_TAXI_PRICING["minimum"])),
        float(pricing.get("base_fare", _DEFAULT_TAXI_PRICING["base_fare"]))
        + road_km * float(pricing.get("per_km", _DEFAULT_TAXI_PRICING["per_km"])),
    )
    return {
        "distance_km": road_km,
        "duration_minutes": duration_min,
        "fare_min": round(fare, 2),
        "fare_max": round(fare * 1.15, 2),
        "currency": pricing.get("currency", "EUR"),
    }


@router.get("/taxi/pricing")
async def get_taxi_pricing(current_user: UserPublic = Depends(get_current_user)):
    operator = await _require_operator(current_user)
    doc = await db.mobility_taxi_settings.find_one(
        {"business_id": operator["business_id"]}, {"_id": 0}
    )
    return doc or {"business_id": operator["business_id"], **_DEFAULT_TAXI_PRICING}


@router.put("/taxi/pricing")
async def set_taxi_pricing(payload: dict, current_user: UserPublic = Depends(get_current_user)):
    operator = await _require_operator(current_user)
    if operator.get("mobility_role") != "taxi_operator":
        raise HTTPException(status_code=403, detail="Taxi operator required")
    doc = {
        "business_id": operator["business_id"],
        "base_fare": float(payload.get("base_fare", _DEFAULT_TAXI_PRICING["base_fare"])),
        "per_km": float(payload.get("per_km", _DEFAULT_TAXI_PRICING["per_km"])),
        "minimum": float(payload.get("minimum", _DEFAULT_TAXI_PRICING["minimum"])),
        "currency": payload.get("currency", "EUR"),
    }
    await db.mobility_taxi_settings.replace_one(
        {"business_id": operator["business_id"]}, doc, upsert=True
    )
    return doc


@router.post("/taxi/request")
async def create_taxi_request(payload: TaxiRequestCreate, current_user: UserPublic = Depends(get_current_user)):
    operator = await _taxi_operator_business(payload.business_id)
    if not operator:
        raise HTTPException(status_code=404, detail="No taxi operator available")
    pricing = (
        await db.mobility_taxi_settings.find_one(
            {"business_id": operator["business_id"]}, {"_id": 0}
        )
        or dict(_DEFAULT_TAXI_PRICING)
    )
    estimate = _estimate_trip(
        payload.pickup_lat, payload.pickup_lng,
        payload.destination_lat, payload.destination_lng,
        pricing,
    )
    doc = {
        "request_id": generate_id("txr"),
        "business_id": operator["business_id"],
        "business_name": operator.get("name", ""),
        "client_id": current_user.user_id,
        "client_name": current_user.name,
        "pickup_address": payload.pickup_address,
        "pickup_lat": payload.pickup_lat,
        "pickup_lng": payload.pickup_lng,
        "destination_address": payload.destination_address,
        "destination_lat": payload.destination_lat,
        "destination_lng": payload.destination_lng,
        **estimate,
        "assigned_vehicle_id": None,
        "status": "requested",
        "created_at": now_utc().isoformat(),
    }
    await db.mobility_taxi_requests.insert_one(doc)
    _broadcast({"type": "taxi_request_new", "request": doc, "channel": f"mobility:taxi:{operator['business_id']}"})
    return doc


def _request_public(doc: dict, vehicle: Optional[dict] = None) -> dict:
    out = {k: doc.get(k) for k in (
        "request_id", "business_id", "business_name", "client_id", "client_name",
        "pickup_address", "pickup_lat", "pickup_lng",
        "destination_address", "destination_lat", "destination_lng",
        "distance_km", "duration_minutes", "fare_min", "fare_max", "currency",
        "assigned_vehicle_id", "status", "created_at",
    )}
    out["vehicle_eta_minutes"] = None
    out["vehicle_distance_m"] = None
    if vehicle and vehicle.get("latitude") is not None:
        km = _haversine_km(vehicle["latitude"], vehicle["longitude"], doc["pickup_lat"], doc["pickup_lng"])
        out["vehicle_distance_m"] = round(km * 1000)
        out["vehicle_eta_minutes"] = max(1, round(km / 25.0 * 60))
    return out


@router.get("/taxi/requests/mine")
async def my_taxi_requests(current_user: UserPublic = Depends(get_current_user)):
    requests = (
        await db.mobility_taxi_requests.find({"client_id": current_user.user_id}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(20)
    )
    result = []
    for r in requests:
        vehicle = None
        if r.get("assigned_vehicle_id"):
            vehicle = await db.mobility_live.find_one(
                {"vehicle_id": r["assigned_vehicle_id"]}, {"_id": 0}
            )
        result.append(_request_public(r, vehicle))
    return result


@router.post("/taxi/requests/{request_id}/cancel")
async def cancel_taxi_request(request_id: str, current_user: UserPublic = Depends(get_current_user)):
    doc = await db.mobility_taxi_requests.find_one({"request_id": request_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Request not found")
    if doc["client_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    if doc["status"] not in ("requested", "accepted"):
        raise HTTPException(status_code=400, detail="Cannot cancel this request")
    await db.mobility_taxi_requests.update_one(
        {"request_id": request_id}, {"$set": {"status": "cancelled"}}
    )
    _broadcast({"type": "taxi_request_cancelled", "request_id": request_id, "channel": f"mobility:taxi:{doc['business_id']}"})
    return {"ok": True}


@router.get("/taxi/requests")
async def list_taxi_requests(current_user: UserPublic = Depends(get_current_user)):
    operator = await _require_operator(current_user)
    requests = (
        await db.mobility_taxi_requests.find({"business_id": operator["business_id"]}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(50)
    )
    result = []
    for r in requests:
        vehicle = None
        if r.get("assigned_vehicle_id"):
            vehicle = await db.mobility_live.find_one(
                {"vehicle_id": r["assigned_vehicle_id"]}, {"_id": 0}
            )
        result.append(_request_public(r, vehicle))
    return result


@router.post("/taxi/requests/{request_id}/accept")
async def accept_taxi_request(request_id: str, payload: dict, current_user: UserPublic = Depends(get_current_user)):
    operator = await _require_operator(current_user)
    doc = await db.mobility_taxi_requests.find_one({"request_id": request_id})
    if not doc or doc["business_id"] != operator["business_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    vehicle = await db.mobility_vehicles.find_one(
        {"vehicle_id": payload.get("vehicle_id"), "business_id": operator["business_id"], "mode": "taxi"}
    )
    if not vehicle:
        raise HTTPException(status_code=404, detail="Taxi not found")
    await db.mobility_taxi_requests.update_one(
        {"request_id": request_id},
        {"$set": {"status": "accepted", "assigned_vehicle_id": vehicle["vehicle_id"], "accepted_at": now_utc().isoformat()}},
    )
    live = await db.mobility_live.find_one({"vehicle_id": vehicle["vehicle_id"]})
    if live:
        await db.mobility_live.update_one(
            {"vehicle_id": vehicle["vehicle_id"]}, {"$set": {"status": "busy"}}
        )
    _broadcast({"type": "taxi_request_accepted", "request_id": request_id, "vehicle_id": vehicle["vehicle_id"], "channel": f"mobility:user:{doc['client_id']}"})
    return {"ok": True}


@router.post("/taxi/requests/{request_id}/decline")
async def decline_taxi_request(request_id: str, current_user: UserPublic = Depends(get_current_user)):
    operator = await _require_operator(current_user)
    doc = await db.mobility_taxi_requests.find_one({"request_id": request_id})
    if not doc or doc["business_id"] != operator["business_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    await db.mobility_taxi_requests.update_one(
        {"request_id": request_id}, {"$set": {"status": "declined"}}
    )
    _broadcast({"type": "taxi_request_declined", "request_id": request_id, "channel": f"mobility:user:{doc['client_id']}"})
    return {"ok": True}


@router.post("/taxi/requests/{request_id}/complete")
async def complete_taxi_request(request_id: str, current_user: UserPublic = Depends(get_current_user)):
    operator = await _require_operator(current_user)
    doc = await db.mobility_taxi_requests.find_one({"request_id": request_id})
    if not doc or doc["business_id"] != operator["business_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    await db.mobility_taxi_requests.update_one(
        {"request_id": request_id}, {"$set": {"status": "completed"}}
    )
    if doc.get("assigned_vehicle_id"):
        await db.mobility_live.update_one(
            {"vehicle_id": doc["assigned_vehicle_id"]}, {"$set": {"status": "available"}}
        )
    _broadcast({"type": "taxi_request_completed", "request_id": request_id, "channel": f"mobility:user:{doc['client_id']}"})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Passenger endpoint
# ---------------------------------------------------------------------------


@router.get("/live")
async def live_vehicles(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    vehicles = await _all_active_vehicles()
    return vehicles
