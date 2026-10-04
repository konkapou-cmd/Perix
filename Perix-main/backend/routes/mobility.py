"""Mobility routes: live vehicles (buses/taxis), driver-code sessions and
vehicle management for operators. Drivers never need Perix accounts."""
import asyncio
import heapq
import logging
import math
import os
import random
import re
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

MOBILITY_CHANNEL = "mobility:live"
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
    # Driver codes are a TAXI-only concept. Buses and trams run from the
    # imported network/timetable - they don't need drivers in Perix.
    if vehicle.get("mode") != "taxi":
        raise HTTPException(status_code=400, detail="Driver codes are only for taxis")
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
    # Buses/trams are driven by the timetable - only taxi drivers log in.
    if vehicle.get("mode") != "taxi":
        raise HTTPException(status_code=403, detail="Driver codes are only for taxis")
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
    """Point at `frac` (0..1) of the cumulative path along the shape between
    the two indices (handles both directions)."""
    if from_idx == to_idx:
        return {"lat": shape[from_idx][0], "lng": shape[from_idx][1]}
    reverse = from_idx > to_idx
    lo, hi = (to_idx, from_idx) if reverse else (from_idx, to_idx)
    segs = []
    total = 0.0
    for i in range(lo, hi):
        d = _haversine_km(shape[i][0], shape[i][1], shape[i + 1][0], shape[i + 1][1])
        segs.append(d)
        total += d
    if total == 0:
        return {"lat": shape[from_idx][0], "lng": shape[from_idx][1]}
    target = total * (1.0 - frac if reverse else frac)
    acc = 0.0
    for i, d in enumerate(segs):
        if acc + d >= target and d > 0:
            f = (target - acc) / d
            a = lo + i
            b = a + 1
            return {
                "lat": shape[a][0] + (shape[b][0] - shape[a][0]) * f,
                "lng": shape[a][1] + (shape[b][1] - shape[a][1]) * f,
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


def _heading_on_shape(shape: List[list], from_idx: int, to_idx: int, frac: Optional[float] = None) -> Optional[float]:
    """Bearing of the shape segment at the interpolated point (or at `frac`),
    in the direction of travel - so a vehicle on an L-shaped street always
    faces along the street, never perpendicular to it."""
    if not shape or from_idx == to_idx:
        return None
    reverse = from_idx > to_idx
    lo, hi = (to_idx, from_idx) if reverse else (from_idx, to_idx)
    if hi - lo < 1 or hi >= len(shape):
        return None
    i = lo if not reverse else hi - 1
    if frac is not None and hi - lo >= 1:
        segs = [
            _haversine_km(shape[k][0], shape[k][1], shape[k + 1][0], shape[k + 1][1])
            for k in range(lo, hi)
        ]
        total = sum(segs)
        if total > 0:
            target = total * (1.0 - frac if reverse else frac)
            acc = 0.0
            for k, d in enumerate(segs):
                if acc + d >= target and d > 0:
                    i = lo + k
                    break
                acc += d
            else:
                i = hi - 1
    if reverse:
        a, b = i + 1, i
    else:
        a, b = i, i + 1
    if a < 0 or b < 0 or a >= len(shape) or b >= len(shape):
        return None
    return _bearing(shape[a][0], shape[a][1], shape[b][0], shape[b][1])


def _trip_stops(route: dict, trip: dict) -> List[dict]:
    """Exact ordered stops for one GTFS trip.

    New network versions carry trip.stop_ids from GTFS stop_sequence.
    Old versions fall back to sorting the trip's stop_times, so this code
    remains compatible with an already-active legacy network.
    """
    route_stops = route.get("stops") or []
    by_id = {
        str(s.get("stop_id")): s
        for s in route_stops
        if s.get("stop_id") is not None
    }

    stop_ids = trip.get("stop_ids") or []
    if stop_ids:
        ordered = [by_id[str(sid)] for sid in stop_ids if str(sid) in by_id]
        if len(ordered) >= 2:
            return ordered

    stop_times = trip.get("stop_times") or {}
    fallback = []
    for s in route_stops:
        t = _time_to_seconds(stop_times.get(s.get("stop_id"), ""))
        if t is not None:
            fallback.append((t, s))
    fallback.sort(key=lambda x: x[0])
    return [s for _t, s in fallback]


def _trip_shape(route: dict, trip: dict) -> List[list]:
    """Geometry for this exact trip/direction, with legacy fallback."""
    shape_id = trip.get("shape_id")
    shapes = route.get("shapes") or {}
    if shape_id:
        shape = shapes.get(shape_id)
        if isinstance(shape, list) and len(shape) > 2:
            return shape
    shape = route.get("shape") or []
    return shape if isinstance(shape, list) else []


_TRIP_PATH_CACHE: dict = {}
_DISPLAY_PROGRESS = {"date": None, "trips": {}}


def _service_date_key() -> str:
    now = _berlin_now()
    if now.hour < SERVICE_DAY_START_HOUR:
        now = now - timedelta(days=1)
    return now.date().isoformat()


def _epoch_to_service_seconds(epoch_value) -> Optional[int]:
    """Convert a GTFS-RT Unix timestamp to Perix service-day seconds."""
    try:
        tz = ZoneInfo("Europe/Berlin")
        dt = datetime.fromtimestamp(int(epoch_value), tz)
        now = _berlin_now()
        service_date = now.date() if now.hour >= SERVICE_DAY_START_HOUR else (now - timedelta(days=1)).date()
        base = datetime(service_date.year, service_date.month, service_date.day, tzinfo=tz)
        return int((dt - base).total_seconds())
    except Exception:
        return None


def _predicted_stop_timeline(route: dict, trip: dict, realtime: Optional[dict]) -> List[dict]:
    """One canonical predicted timeline for marker, ETA and trip progress."""
    realtime = realtime or {}
    trip_rel = str(realtime.get("trip_schedule_relationship") or "SCHEDULED").upper()
    if trip_rel in ("CANCELED", "DELETED"):
        return []

    stop_times = trip.get("stop_times") or {}
    stop_delays = realtime.get("stop_delays") or {}
    stop_predictions = realtime.get("stop_predictions") or {}
    stop_relationships = realtime.get("stop_relationships") or {}
    trip_delay = int(realtime.get("delay_seconds") or 0)

    timeline: List[dict] = []
    previous_departure = None

    for stop in _trip_stops(route, trip):
        sid = stop.get("stop_id")
        if sid is None:
            continue
        scheduled = _time_to_seconds(stop_times.get(sid, ""))
        if scheduled is None:
            continue

        sid_key = str(sid)
        rel = str(stop_relationships.get(sid_key) or stop_relationships.get(sid) or "SCHEDULED").upper()
        prediction = stop_predictions.get(sid_key) or stop_predictions.get(sid) or {}

        use_rt = rel != "NO_DATA"
        arrival = None
        departure = None

        if use_rt:
            arrival = _epoch_to_service_seconds(prediction.get("arrival_epoch"))
            departure = _epoch_to_service_seconds(prediction.get("departure_epoch"))

        if arrival is None:
            delay = int(stop_delays.get(sid_key, stop_delays.get(sid, trip_delay))) if use_rt else 0
            arrival = scheduled + delay
        if departure is None:
            departure = arrival

        if previous_departure is not None and arrival < previous_departure:
            arrival = previous_departure
        if departure < arrival:
            departure = arrival

        timeline.append(
            {
                "stop": stop,
                "stop_id": sid,
                "scheduled": scheduled,
                "predicted_arrival": arrival,
                "predicted_departure": departure,
                "delay_seconds": int(arrival - scheduled),
                "relationship": rel,
            }
        )
        previous_departure = departure

    return timeline


def _trip_path_geometry(route: dict, trip: dict, timeline: List[dict]) -> dict:
    """Travel-ordered path, cumulative meters and stop progress."""
    key = f"{_service_date_key()}:{trip.get('trip_id')}:{trip.get('shape_id') or 'legacy'}"
    cached = _TRIP_PATH_CACHE.get(key)
    if cached:
        return cached

    shape = _trip_shape(route, trip)
    if isinstance(shape, list) and len(shape) > 2:
        points = [[float(p[0]), float(p[1])] for p in shape]
        cumulative = [0.0]
        for i in range(len(points) - 1):
            cumulative.append(
                cumulative[-1]
                + _haversine_km(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]) * 1000.0
            )

        stop_progress = []
        cursor = 0
        for entry in timeline:
            s = entry["stop"]
            best_i = cursor
            best_d = float("inf")
            for i in range(cursor, len(points)):
                d = _haversine_km(s.get("lat"), s.get("lng"), points[i][0], points[i][1])
                if d < best_d:
                    best_d = d
                    best_i = i
            cursor = best_i
            stop_progress.append(cumulative[best_i])
    else:
        points = [
            [float(entry["stop"]["lat"]), float(entry["stop"]["lng"])]
            for entry in timeline
        ]
        cumulative = [0.0]
        for i in range(len(points) - 1):
            cumulative.append(
                cumulative[-1]
                + _haversine_km(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]) * 1000.0
            )
        stop_progress = list(cumulative)

    result = {
        "points": points,
        "cumulative": cumulative,
        "stop_progress": stop_progress,
        "total_m": cumulative[-1] if cumulative else 0.0,
    }
    _TRIP_PATH_CACHE[key] = result
    return result


def _raw_timeline_progress(timeline: List[dict], stop_progress: List[float], now_sec: int) -> float:
    """Target progress implied by current predicted arrivals."""
    if not timeline or not stop_progress:
        return 0.0
    if now_sec <= timeline[0]["predicted_arrival"]:
        return stop_progress[0]
    if now_sec >= timeline[-1]["predicted_arrival"]:
        return stop_progress[-1]

    for i in range(len(timeline) - 1):
        prev = timeline[i]
        nxt = timeline[i + 1]
        next_arrival = nxt["predicted_arrival"]
        if now_sec > next_arrival:
            continue

        dep = prev["predicted_departure"]
        if dep <= prev["predicted_arrival"] and prev["relationship"] != "SKIPPED":
            span = max(1, next_arrival - prev["predicted_arrival"])
            dep = prev["predicted_arrival"] + min(25, max(0, int(span * 0.3)))

        if now_sec <= dep:
            return stop_progress[i]

        frac = min(1.0, max(0.0, (now_sec - dep) / max(1, next_arrival - dep)))
        return stop_progress[i] + (stop_progress[i + 1] - stop_progress[i]) * frac

    return stop_progress[-1]


def _adaptive_forward_progress(trip_id: str, raw_progress_m: float, total_m: float, mode: str) -> float:
    """Forward-only ETA-constrained display progress."""
    import time

    service_date = _service_date_key()
    if _DISPLAY_PROGRESS.get("date") != service_date:
        _DISPLAY_PROGRESS["date"] = service_date
        _DISPLAY_PROGRESS["trips"] = {}

    states = _DISPLAY_PROGRESS["trips"]
    now_mono = time.monotonic()

    for key, value in list(states.items()):
        if now_mono - float(value.get("at", now_mono)) > 1800:
            states.pop(key, None)

    state = states.get(trip_id)
    if not state:
        shown = max(0.0, min(total_m, raw_progress_m))
    else:
        dt = max(0.0, now_mono - float(state.get("at", now_mono)))
        previous = float(state.get("progress_m", 0.0))

        if dt > 180:
            shown = max(0.0, min(total_m, raw_progress_m))
        elif raw_progress_m <= previous:
            # Delay got worse: hold/slow, never reverse.
            shown = previous
        else:
            # Delay improved: catch up forward, no teleport.
            max_kmh = 60.0 if mode == "tram" else 70.0
            max_step = (max_kmh / 3.6) * min(dt, 30.0)
            shown = min(raw_progress_m, previous + max_step)

    shown = max(0.0, min(total_m, shown))
    states[trip_id] = {"progress_m": shown, "at": now_mono, "total_m": total_m}
    return shown


def _point_heading_at_progress(path: dict, progress_m: float) -> tuple:
    points = path.get("points") or []
    cumulative = path.get("cumulative") or []
    if not points:
        return None, None
    if len(points) == 1 or len(cumulative) < 2:
        return {"lat": points[0][0], "lng": points[0][1]}, None

    progress_m = max(0.0, min(float(cumulative[-1]), float(progress_m)))
    for i in range(len(cumulative) - 1):
        if cumulative[i + 1] < progress_m:
            continue
        span = max(0.001, cumulative[i + 1] - cumulative[i])
        frac = min(1.0, max(0.0, (progress_m - cumulative[i]) / span))
        a = points[i]
        b = points[i + 1]
        pos = {
            "lat": a[0] + (b[0] - a[0]) * frac,
            "lng": a[1] + (b[1] - a[1]) * frac,
        }
        return pos, _bearing(a[0], a[1], b[0], b[1])

    last = points[-1]
    return (
        {"lat": last[0], "lng": last[1]},
        _bearing(points[-2][0], points[-2][1], last[0], last[1]),
    )


def _estimate_trip_position(route: dict, trip: dict, now_sec: int, delays: dict) -> Optional[dict]:
    """ETA-constrained, forward-only estimated position."""
    trip_id = str(trip.get("trip_id") or "")
    realtime = delays.get(trip_id) if trip_id else None
    timeline = _predicted_stop_timeline(route, trip, realtime)
    if len(timeline) < 2:
        return None

    start = timeline[0]["predicted_arrival"]
    end = timeline[-1]["predicted_arrival"]
    if now_sec < start - 60 or now_sec > end + 180:
        return None

    path = _trip_path_geometry(route, trip, timeline)
    stop_progress = path.get("stop_progress") or []
    if len(stop_progress) != len(timeline):
        return None

    raw_progress = _raw_timeline_progress(timeline, stop_progress, now_sec)
    shown_progress = _adaptive_forward_progress(
        trip_id,
        raw_progress,
        float(path.get("total_m") or 0.0),
        str(route.get("mode") or "bus"),
    )
    pos, heading = _point_heading_at_progress(path, shown_progress)
    if not pos:
        return None

    next_entry = next(
        (e for e in timeline if e["predicted_arrival"] >= now_sec and e["relationship"] != "SKIPPED"),
        timeline[-1],
    )
    delay_seconds = int(next_entry.get("delay_seconds") or 0)

    has_rt = bool(
        realtime
        and (
            realtime.get("stop_predictions")
            or realtime.get("stop_delays")
            or realtime.get("delay_seconds") is not None
            or realtime.get("trip_schedule_relationship")
        )
    )

    return {
        "latitude": pos["lat"],
        "longitude": pos["lng"],
        "heading": heading,
        "delay_minutes": round(delay_seconds / 60),
        "position_source": "REALTIME_ESTIMATE" if has_rt else "SCHEDULE_ESTIMATE",
        "progress_m": round(shown_progress, 1),
        "target_progress_m": round(raw_progress, 1),
    }

# Short-lived cache for the estimated vehicles so fast client polling
# doesn't recompute the whole trip graph on every request.
_ESTIMATES_CACHE = {"at": 0.0, "data": []}

REALTIME_FRESH_SECONDS = int(os.getenv("MOBILITY_REALTIME_FRESH_SECONDS", "120"))


def _trip_window(route: dict, trip: dict, realtime: Optional[dict] = None) -> Optional[dict]:
    """Predicted window + exact ordered stops for one trip."""
    timeline = _predicted_stop_timeline(route, trip, realtime)
    if len(timeline) < 2:
        return None
    ordered = [(e["stop"], e["predicted_arrival"]) for e in timeline]
    return {
        "start": timeline[0]["predicted_arrival"],
        "end": timeline[-1]["predicted_arrival"],
        "first_stop": timeline[0]["stop"],
        "last_stop": timeline[-1]["stop"],
        "first_stop_id": timeline[0]["stop_id"],
        "last_stop_id": timeline[-1]["stop_id"],
        "ordered": ordered,
    }


def _iso_is_fresh(ts: str, seconds: int) -> bool:
    try:
        return datetime.fromisoformat(ts) > now_utc() - timedelta(seconds=seconds)
    except Exception:
        return False


def _chain_trips(route: dict, delays: Optional[dict] = None) -> List[dict]:
    """Group consecutive predicted trips into one physical vehicle run."""
    windows = []
    for trip in route.get("trips", []):
        rt = (delays or {}).get(str(trip.get("trip_id") or ""))
        w = _trip_window(route, trip, rt)
        if w:
            windows.append({"trip": trip, **w})

    windows.sort(key=lambda x: x["start"])
    runs: List[dict] = []
    for w in windows:
        attached = False
        for run in runs:
            ls = run["last_stop"]
            fs = w["first_stop"]
            if (
                _haversine_km(ls.get("lat"), ls.get("lng"), fs.get("lat"), fs.get("lng")) < 0.08
                and run["end"] <= w["start"] <= run["end"] + 420
            ):
                run["trips"].append(w)
                run["end"] = w["end"]
                run["last_stop"] = w["last_stop"]
                attached = True
                break
        if not attached:
            runs.append(
                {
                    "trips": [w],
                    "start": w["start"],
                    "end": w["end"],
                    "last_stop": w["last_stop"],
                }
            )
    return runs


async def _realtime_delays_for(trip_ids: List[str]) -> dict:
    """Fresh GTFS-RT state. Do not mutate delay values to prevent reverse motion."""
    if not trip_ids:
        return {}

    docs = await db.mobility_realtime.find(
        {"trip_id": {"$in": trip_ids}},
        {"_id": 0},
    ).to_list(len(trip_ids))

    result = {}
    for doc in docs:
        if not _iso_is_fresh(doc.get("updated_at") or "", REALTIME_FRESH_SECONDS):
            continue
        result[str(doc.get("trip_id"))] = doc
    return result


def _active_trip_for(route: dict, vehicle: dict, now_sec: int, delays: dict) -> Optional[dict]:
    """The exact trip the vehicle is currently on."""
    tid = str(vehicle.get("trip_id") or "")
    if tid:
        trip = next(
            (t for t in route.get("trips", []) if str(t.get("trip_id") or "") == tid),
            None,
        )
        if trip and _trip_window(route, trip, delays.get(tid)):
            return trip

    direction = str(vehicle.get("route_direction") or "")
    candidates = []
    for trip in route.get("trips", []):
        tid = str(trip.get("trip_id") or "")
        w = _trip_window(route, trip, delays.get(tid))
        if not w:
            continue
        if w["start"] - 60 <= now_sec <= w["end"] + 180:
            candidates.append(
                (
                    trip,
                    direction != "" and direction == str(trip.get("headsign") or ""),
                )
            )

    if not candidates:
        return None
    candidates.sort(key=lambda x: not x[1])
    return candidates[0][0]

async def _estimated_transit_vehicles() -> List[dict]:
    """Virtual vehicles for every currently running vehicle run of the
    active network (bus/tram), unless a real vehicle already covers that
    route and direction. Consecutive trips at a terminus chain into ONE
    vehicle so lines run at their real frequency."""
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
    # Only FRESH live positions may suppress estimates - a stale GPS record
    # must never hide the scheduled vehicles of a whole route+direction.
    covered = {
        (str(v.get("route_number")), str(v.get("route_direction") or ""))
        for v in live
        if _iso_is_fresh(v.get("updated_at") or "", 90)
    }
    now_sec = _now_service_seconds()
    estimates: List[dict] = []
    trip_ids = [
        t.get("trip_id")
        for route in network.get("routes", [])
        for t in route.get("trips", [])
        if t.get("trip_id")
    ]
    # One batched query for all realtime delays (not one per trip). Trip
    # ids are unique per service day, so docs from previous days can never
    # match today's ids - no freshness filter needed. Delays are smoothed
    # monotonically: a vehicle NEVER moves backwards, even when the feed's
    # delay value oscillates or drops.
    delays = await _realtime_delays_for(trip_ids)
    for route in network.get("routes", []):
        route_number = str(route.get("route_number"))
        mode = route.get("mode") if route.get("mode") in ("bus", "tram") else "bus"
        for run in _chain_trips(route, delays):
            first = run["trips"][0]
            headsign = str(first["trip"].get("headsign") or route.get("name") or "")
            if (route_number, headsign) in covered or (route_number, "") in covered:
                continue
            if now_sec < run["start"] - 60 or now_sec > run["end"] + 60:
                continue
            pos = None
            heading = None
            delay_minutes = 0
            position_source = "SCHEDULE_ESTIMATE"
            active = None
            for w in run["trips"]:
                if w["start"] <= now_sec <= w["end"]:
                    active = w
                    break
            if active:
                p = _estimate_trip_position(route, active["trip"], now_sec, delays)
                if p:
                    pos = {"lat": p["latitude"], "lng": p["longitude"]}
                    heading = p.get("heading")
                    delay_minutes = p["delay_minutes"]
                    position_source = p["position_source"]
            if pos is None:
                # Gap between trips (turnaround) or grace at the run ends:
                # stand at the shared terminus stop, facing along the line.
                before = None
                after = None
                for w in run["trips"]:
                    if w["end"] <= now_sec:
                        before = w
                    if w["start"] >= now_sec and after is None:
                        after = w
                heading_trip = (
                    after["trip"] if after is not None
                    else before["trip"] if before is not None
                    else first["trip"]
                )
                shape_r = _trip_shape(route, heading_trip)
                has_shape_r = isinstance(shape_r, list) and len(shape_r) > 2

                def _stop_pair_heading(s1: dict, s2: dict) -> Optional[float]:
                    if has_shape_r:
                        ia = _shape_index_for(shape_r, s1.get("lat"), s1.get("lng"))
                        ib = _shape_index_for(shape_r, s2.get("lat"), s2.get("lng"))
                        h = _heading_on_shape(shape_r, ia, ib, 0.0)
                        if h is not None:
                            return h
                    return _bearing(s1.get("lat"), s1.get("lng"), s2.get("lat"), s2.get("lng"))

                if before is not None and after is not None:
                    stop_pt = after["first_stop"]
                    ordered = after["ordered"]
                    if len(ordered) > 1:
                        heading = _stop_pair_heading(ordered[0][0], ordered[1][0])
                elif before is not None:
                    stop_pt = before["last_stop"]
                    ordered = before["ordered"]
                    if len(ordered) > 1:
                        heading = _stop_pair_heading(ordered[-2][0], ordered[-1][0])
                else:
                    stop_pt = first["first_stop"]
                    ordered = first["ordered"]
                    if len(ordered) > 1:
                        heading = _stop_pair_heading(ordered[0][0], ordered[1][0])
                if stop_pt:
                    pos = {"lat": stop_pt.get("lat"), "lng": stop_pt.get("lng")}
            if pos is None:
                continue
            # The trip the vehicle is on RIGHT NOW (window-based fallback for
            # the gap-at-terminus state), so consumers know the exact
            # stop sequence instead of guessing from the run's first trip.
            current_trip = None
            if active is not None:
                current_trip = active["trip"]
            elif after is not None:
                current_trip = after["trip"]
            elif before is not None:
                current_trip = before["trip"]
            else:
                current_trip = first["trip"]
            estimates.append(
                {
                    "vehicle_id": f"est_{route_number}_{first['trip'].get('trip_id', '')}",
                    "business_id": network.get("business_id") or "mvb",
                    "mode": mode,
                    "fleet_number": route_number,
                    "name": f"{route_number} {headsign}".strip(),
                    "route_number": route_number,
                    # Direction of the CURRENT trip (a run alternates
                    # directions at each turnaround)
                    "route_direction": str(current_trip.get("headsign") or headsign),
                    "trip_id": current_trip.get("trip_id"),
                    "latitude": pos["lat"],
                    "longitude": pos["lng"],
                    "heading": heading,
                    "status": "estimated",
                    "delay_minutes": delay_minutes,
                    "position_source": position_source,
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
    # Transit GPS must be fresh to count as live (90s) - a frozen bus/tram
    # record must not linger on the map. Taxis keep the longer window.
    live = [
        v
        for v in live
        if v.get("mode") == "taxi" or _iso_is_fresh(v.get("updated_at") or "", 90)
    ]
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
    operator: dict = Depends(_require_operator),
):
    routes = payload.routes or []
    if not routes:
        raise HTTPException(status_code=400, detail="routes are required")
    return await _create_network_version(routes, payload.name or f"Network {now_utc().strftime('%Y-%m-%d %H:%M')}")


@router.post("/network/import-gtfs")
async def import_gtfs_zip(
    file: UploadFile = File(...),
    date: Optional[str] = Form(None),
    operator: dict = Depends(_require_operator),
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
async def activate_network(payload: dict, operator: dict = Depends(_require_operator)):
    version_id = payload.get("version_id")
    version = await db.bus_network_versions.find_one({"version_id": version_id})
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    await db.bus_network_versions.update_many({}, {"$set": {"active": False}})
    await db.bus_network_versions.update_one({"version_id": version_id}, {"$set": {"active": True}})
    _broadcast({"type": "network_activated", "version_id": version_id})
    return {"active": version_id}


@router.get("/places/search")
async def search_places(q: str = "", current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    """Destination suggestions: Perix businesses, transit stops and real
    streets/addresses (OpenStreetMap Nominatim, scoped to the city)."""
    q = (q or "").strip()
    if not q:
        return {"places": [], "stops": [], "streets": []}
    needle = re.escape(q.lower())
    places = []
    cursor = db.businesses.find(
        {
            "name": {"$regex": needle, "$options": "i"},
            "latitude": {"$ne": None},
            "longitude": {"$ne": None},
        },
        {"_id": 0},
    ).limit(8)
    async for b in cursor:
        places.append(
            {
                "id": b.get("business_id"),
                "name": b.get("name"),
                "address": b.get("address") or "",
                "lat": b.get("latitude"),
                "lng": b.get("longitude"),
                "category": b.get("subcategory") or b.get("root_category") or "",
            }
        )
    stops = []
    seen = set()
    network = await _get_active_network()
    if network:
        for route in network.get("routes", []):
            for s in route.get("stops", []):
                name = str(s.get("name", ""))
                sid = s.get("stop_id")
                if sid in seen or q.lower() not in name.lower():
                    continue
                seen.add(sid)
                stops.append({"stop_id": sid, "name": name, "lat": s.get("lat"), "lng": s.get("lng")})
                if len(stops) >= 8:
                    break
            if len(stops) >= 8:
                break
    streets = []
    try:
        import httpx as _httpx

        # Magdeburg area viewbox: south, west, north, east
        async with _httpx.AsyncClient(timeout=8, headers={"User-Agent": "PerixMobility/1.0 (app.perixapp.com)"}) as client:
            resp = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "format": "json",
                    "q": q,
                    "addressdetails": 0,
                    "limit": 6,
                    "accept-language": "de",
                    "viewbox": "11.55,52.02,11.72,52.20",
                    "bounded": 1,
                },
            )
            if resp.status_code == 200:
                for item in resp.json():
                    lat = float(item.get("lat") or 0)
                    lng = float(item.get("lon") or 0)
                    if lat and lng:
                        streets.append(
                            {
                                "name": item.get("display_name", "").split(",")[0].strip(),
                                "address": item.get("display_name", ""),
                                "lat": lat,
                                "lng": lng,
                                "type": item.get("type", ""),
                            }
                        )
    except Exception:
        streets = []
    return {"places": places, "stops": stops, "streets": streets}


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
    """Vehicles whose CURRENT trip will still serve the requested stop."""
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
        if v.get("mode") in ("bus", "tram")
        and str(v.get("route_number")) in route_numbers
    ]

    now_sec = _now_service_seconds()
    all_trip_ids = [
        str(t.get("trip_id"))
        for r in serving_routes
        for t in r.get("trips", [])
        if t.get("trip_id")
    ]
    realtime_by_trip = await _realtime_delays_for(all_trip_ids)
    results = []

    for vehicle in live:
        if vehicle.get("latitude") is None or vehicle.get("longitude") is None:
            continue

        route = next(
            (
                r for r in serving_routes
                if str(r.get("route_number")) == str(vehicle.get("route_number"))
                and str(r.get("mode") or "bus") == str(vehicle.get("mode") or "bus")
            ),
            None,
        )
        if not route:
            continue

        trip = _active_trip_for(route, vehicle, now_sec, realtime_by_trip)
        if not trip:
            continue

        trip_id = str(trip.get("trip_id") or "")
        realtime = realtime_by_trip.get(trip_id)
        timeline = _predicted_stop_timeline(route, trip, realtime)
        if not timeline:
            continue

        stop_info = next(
            (s for s in route.get("stops", []) if s.get("stop_id") == stop_id),
            None,
        )

        def same_physical_stop(entry: dict) -> bool:
            if str(entry.get("stop_id")) == str(stop_id):
                return True
            if not stop_info:
                return False
            s = entry.get("stop") or {}
            if str(s.get("name")) == str(stop_info.get("name")):
                return True
            return (
                _haversine_km(
                    s.get("lat"), s.get("lng"),
                    stop_info.get("lat"), stop_info.get("lng"),
                )
                < 0.1
            )

        target = next(
            (
                e for e in timeline
                if same_physical_stop(e)
                and e.get("relationship") != "SKIPPED"
                and e.get("predicted_arrival", -1) > now_sec
            ),
            None,
        )
        if not target:
            continue

        eta_minutes = max(0, math.ceil((target["predicted_arrival"] - now_sec) / 60))
        delay_seconds = int(target.get("delay_seconds") or 0)

        remaining_m = None
        if stop_info:
            remaining_m = round(
                _haversine_km(
                    vehicle["latitude"], vehicle["longitude"],
                    stop_info.get("lat"), stop_info.get("lng"),
                ) * 1000
            )

        user_distance_m = None
        if lat is not None and lng is not None:
            user_distance_m = round(
                _haversine_km(
                    lat, lng,
                    vehicle["latitude"], vehicle["longitude"],
                ) * 1000
            )

        results.append(
            {
                "vehicle_id": vehicle.get("vehicle_id"),
                "trip_id": trip_id,
                "route_number": vehicle.get("route_number"),
                "route_direction": vehicle.get("route_direction") or trip.get("headsign") or route.get("name", ""),
                "status": vehicle.get("status"),
                "delay_minutes": round(delay_seconds / 60),
                "eta_minutes": eta_minutes,
                "eta_source": "REALTIME" if realtime else "SCHEDULE",
                "distance_to_bus_m": user_distance_m,
                "distance_to_stop_m": remaining_m,
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


@router.get("/vehicles/{vehicle_id}/trip")
async def vehicle_trip_progress(
    vehicle_id: str,
    current_user: Optional[UserPublic] = Depends(get_current_user_optional),
):
    """Per-stop progress using the same predicted timeline as map and ETA."""
    vehicle = await db.mobility_live.find_one({"vehicle_id": vehicle_id}, {"_id": 0})
    if not vehicle and vehicle_id.startswith("est_"):
        for v in await _all_active_vehicles():
            if v.get("vehicle_id") == vehicle_id:
                vehicle = v
                break
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    route = await _network_route(vehicle.get("route_number"))
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    now_sec = _now_service_seconds()
    trip_ids = [
        str(t.get("trip_id"))
        for t in route.get("trips", [])
        if t.get("trip_id")
    ]
    realtime_by_trip = await _realtime_delays_for(trip_ids)
    trip = _active_trip_for(route, vehicle, now_sec, realtime_by_trip)
    if not trip:
        raise HTTPException(status_code=404, detail="Active trip not found")

    trip_id = str(trip.get("trip_id") or "")
    realtime = realtime_by_trip.get(trip_id)
    timeline = _predicted_stop_timeline(route, trip, realtime)
    if not timeline:
        raise HTTPException(status_code=404, detail="Trip cancelled or unavailable")

    stops_out = []
    for entry in timeline:
        predicted = int(entry["predicted_arrival"])
        relationship = entry.get("relationship") or "SCHEDULED"
        stops_out.append(
            {
                "stop_id": entry.get("stop_id"),
                "name": (entry.get("stop") or {}).get("name"),
                "scheduled": _fmt_service_time(int(entry["scheduled"])),
                "delay_seconds": int(entry.get("delay_seconds") or 0),
                "predicted": _fmt_service_time(predicted),
                "passed": predicted <= now_sec,
                "skipped": relationship == "SKIPPED",
                "schedule_relationship": relationship,
            }
        )

    next_entry = next(
        (
            e for e in timeline
            if e["predicted_arrival"] >= now_sec
            and e.get("relationship") != "SKIPPED"
        ),
        timeline[-1],
    )

    return {
        "vehicle_id": vehicle.get("vehicle_id"),
        "trip_id": trip_id,
        "route_number": vehicle.get("route_number"),
        "route_direction": vehicle.get("route_direction") or trip.get("headsign"),
        "mode": vehicle.get("mode"),
        "delay_minutes": round(int(next_entry.get("delay_seconds") or 0) / 60),
        "position_source": vehicle.get("position_source", "VEHICLE_GPS"),
        "estimated": bool(vehicle.get("estimated")),
        "stops": stops_out,
    }

# ---------------------------------------------------------------------------
# Passenger endpoint
# ---------------------------------------------------------------------------


@router.get("/plan")
async def plan_journey(
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
    current_user: Optional[UserPublic] = Depends(get_current_user_optional),
):
    """Point-to-point transit planning: nearest stops, line combinations
    with transfers and walking (Google Maps style, minimal walking + time)."""
    network = await _get_active_network()
    if not network:
        return {"itineraries": []}
    now_sec = _now_service_seconds()

    stops = {}
    for route in network.get("routes", []):
        for s in route.get("stops", []):
            sid = s.get("stop_id")
            if sid not in stops:
                stops[sid] = {"id": sid, "name": s.get("name"), "lat": s.get("lat"), "lng": s.get("lng")}

    # Walking time in seconds for a straight distance, with a road factor
    def walk_sec(km):
        return (km * 1.35) / 4.5 * 3600

    # Nearest origin/destination stops
    def near_stops(lat, lng, radius_km=0.9, limit=6):
        out = []
        for sid, s in stops.items():
            d = _haversine_km(lat, lng, s["lat"], s["lng"])
            if d <= radius_km:
                out.append((sid, d))
        out.sort(key=lambda x: x[1])
        return out[:limit]

    origin_candidates = near_stops(from_lat, from_lng)
    if len(origin_candidates) < 2:
        origin_candidates = near_stops(from_lat, from_lng, radius_km=1.6)
    dest_candidates = near_stops(to_lat, to_lng)
    if len(dest_candidates) < 2:
        dest_candidates = near_stops(to_lat, to_lng, radius_km=1.6)
    if not origin_candidates or not dest_candidates:
        return {"itineraries": [], "note": "no stops nearby"}

    # Walking transfer map between stops (<= 350m)
    stop_list = list(stops.values())
    transfer = {}
    for i, a in enumerate(stop_list):
        neigh = []
        for b in stop_list:
            if a["id"] == b["id"]:
                continue
            d = _haversine_km(a["lat"], a["lng"], b["lat"], b["lng"])
            if d <= 0.35:
                neigh.append((b["id"], walk_sec(d)))
        transfer[a["id"]] = neigh

    # Trips as ordered segments; also stop -> sorted departures for boarding
    trips = []
    for route in network.get("routes", []):
        mode = route.get("mode") if route.get("mode") in ("bus", "tram") else "bus"
        for trip in route.get("trips", []):
            seq = []
            trip_stop_times = trip.get("stop_times") or {}
            for stop in _trip_stops(route, trip):
                sid = stop.get("stop_id")
                tsec = _time_to_seconds(trip_stop_times.get(sid, ""))
                if sid is not None and tsec is not None and sid in stops:
                    seq.append((sid, tsec))
            if len(seq) < 2:
                continue
            segments = []
            for i in range(len(seq) - 1):
                segments.append((seq[i][0], seq[i][1], seq[i + 1][0], seq[i + 1][1]))
            trips.append(
                {
                    "route_number": route.get("route_number"),
                    "mode": mode,
                    "direction": trip.get("headsign") or route.get("name") or "",
                    "trip_id": trip.get("trip_id"),
                    "segments": segments,
                }
            )

    boardings = {}
    for ti, trip in enumerate(trips):
        for pos, seg in enumerate(trip["segments"]):
            boardings.setdefault(seg[0], []).append((seg[1], ti, pos))
    for sid in boardings:
        boardings[sid].sort(key=lambda x: x[0])

    dest_ids = {sid for sid, _ in dest_candidates}

    # Time-dependent earliest-arrival search (multi-label per stop, capped)
    best = {}  # stop_id -> min arrival
    heap = []
    parent = {}  # (stop_id) -> (prev_stop, kind, payload)
    for sid, d in origin_candidates:
        arr = now_sec + walk_sec(d)
        heapq.heappush(heap, (arr, sid))
        best[sid] = arr
        parent[sid] = (None, "walk_origin", {"minutes": round(walk_sec(d) / 60), "stop": sid, "from_lat": from_lat, "from_lng": from_lng})

    reached = None
    while heap:
        arr, sid = heapq.heappop(heap)
        if arr > best.get(sid, float("inf")):
            continue
        if sid in dest_ids:
            reached = (arr, sid)
            break
        # Board trips
        for dep, ti, pos in boardings.get(sid, []):
            if dep < arr:
                continue
            trip = trips[ti]
            for k in range(pos, len(trip["segments"])):
                segk = trip["segments"][k]
                nxt2 = segk[2]
                narr2 = segk[3]
                if narr2 < best.get(nxt2, float("inf")):
                    best[nxt2] = narr2
                    parent[nxt2] = (sid, "ride", {
                        "route_number": trip["route_number"],
                        "mode": trip["mode"],
                        "direction": trip["direction"],
                        "trip_id": trip.get("trip_id"),
                        "board": sid,
                        "alight": nxt2,
                        "depart": trip["segments"][pos][1],
                        "arrive": segk[3],
                    })
                    heapq.heappush(heap, (narr2, nxt2))
        # Transfers
        for nid, wsec in transfer.get(sid, []):
            narr = arr + wsec
            if narr < best.get(nid, float("inf")):
                best[nid] = narr
                parent[nid] = (sid, "walk", {"minutes": round(wsec / 60)})
                heapq.heappush(heap, (narr, nid))

    if not reached:
        return {"itineraries": [], "note": "no connection found"}

    # Reconstruct the single best itinerary
    legs = []
    cur = reached[1]
    while parent.get(cur):
        prev, kind, payload = parent[cur]
        legs.append((kind, payload, prev, cur))
        cur = prev
    legs.reverse()

    final_walk_km = _haversine_km(to_lat, to_lng, stops[reached[1]]["lat"], stops[reached[1]]["lng"])
    legs.append(("walk_dest", {"minutes": round(walk_sec(final_walk_km) / 60), "to_lat": to_lat, "to_lng": to_lng}, reached[1], None))

    # Trip-specific shape lookup for ride polylines.
    routes_by_num = {
        str(route.get("route_number")): route
        for route in network.get("routes", [])
    }

    def _shape_slice(route_num, trip_id, from_stop_id, to_stop_id):
        """Slice of THIS trip's shape between two stops (either direction)."""
        route = routes_by_num.get(str(route_num))
        if not route:
            return None
        trip = next(
            (t for t in route.get("trips", []) if str(t.get("trip_id")) == str(trip_id)),
            None,
        )
        if not trip:
            return None
        sh = _trip_shape(route, trip)
        if len(sh) < 3:
            return None
        a = next((s for s in route.get("stops", []) if s.get("stop_id") == from_stop_id), None)
        b = next((s for s in route.get("stops", []) if s.get("stop_id") == to_stop_id), None)
        if not a or not b:
            return None
        ia = _shape_index_for(sh, a.get("lat"), a.get("lng"))
        ib = _shape_index_for(sh, b.get("lat"), b.get("lng"))
        lo, hi = (ia, ib) if ia <= ib else (ib, ia)
        if hi - lo < 1:
            return None
        seg = [[p[0], p[1]] for p in sh[lo : hi + 1]]
        return seg[::-1] if ia > ib else seg

    itinerary_legs = []
    walking_total = 0
    for kind, payload, prev_sid, cur_sid in legs:
        if kind == "walk_origin":
            s = stops[payload["stop"]]
            itinerary_legs.append({
                "type": "walk",
                "minutes": payload["minutes"],
                "label": s["name"],
                "lat": s["lat"],
                "lng": s["lng"],
                "points": [[from_lat, from_lng], [s["lat"], s["lng"]]],
            })
            walking_total += payload["minutes"]
        elif kind == "ride":
            shape_slice = _shape_slice(
                payload["route_number"],
                payload.get("trip_id"),
                payload["board"],
                payload["alight"],
            )
            itinerary_legs.append({
                "type": "ride",
                "route_number": payload["route_number"],
                "mode": payload["mode"],
                "direction": payload["direction"],
                "board": stops.get(payload["board"], {}).get("name", ""),
                "alight": stops.get(payload["alight"], {}).get("name", ""),
                "depart": _fmt_service_time(payload["depart"]),
                "arrive": _fmt_service_time(payload["arrive"]),
                "minutes": round((payload["arrive"] - payload["depart"]) / 60),
                "points": shape_slice or [
                    [stops.get(payload["board"], {}).get("lat"), stops.get(payload["board"], {}).get("lng")],
                    [stops.get(payload["alight"], {}).get("lat"), stops.get(payload["alight"], {}).get("lng")],
                ],
            })
        elif kind == "walk":
            p_stop = stops.get(prev_sid)
            c_stop = stops.get(cur_sid)
            itinerary_legs.append({
                "type": "walk_transfer",
                "minutes": payload["minutes"],
                "label": c_stop.get("name", "") if c_stop else "",
                "points": [
                    [p_stop.get("lat"), p_stop.get("lng")] if p_stop else None,
                    [c_stop.get("lat"), c_stop.get("lng")] if c_stop else None,
                ],
            })
            walking_total += payload["minutes"]
        elif kind == "walk_dest":
            p_stop = stops.get(prev_sid)
            itinerary_legs.append({
                "type": "walk",
                "minutes": payload["minutes"],
                "label": "destination",
                "points": [
                    [p_stop.get("lat"), p_stop.get("lng")] if p_stop else None,
                    [to_lat, to_lng],
                ],
            })
            walking_total += payload["minutes"]

    duration = round((reached[0] + walk_sec(final_walk_km) - now_sec) / 60)
    itinerary = {
        "duration_minutes": duration,
        "walking_minutes": walking_total,
        "departure": _fmt_service_time(now_sec),
        "arrival": _fmt_service_time(reached[0] + walk_sec(final_walk_km)),
        "legs": itinerary_legs,
    }
    return {"itineraries": [itinerary]}


def _fmt_service_time(sec: float) -> str:
    sec = int(sec) % (24 * 3600)
    h = sec // 3600
    m = (sec % 3600) // 60
    return f"{h:02d}:{m:02d}"


@router.get("/live")
async def live_vehicles(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    vehicles = await _all_active_vehicles()
    return vehicles
