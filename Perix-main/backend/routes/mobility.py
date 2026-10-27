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
from mobility.regions import get_active_region
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
        from mobility.map_match import assign_trip
        matches = []
        for dated in await networks_for_journey_window():
            candidate_route = next((r for r in dated.get("routes", [])
                if str(r.get("route_number")) == str(live["route_number"])), None)
            if candidate_route is None:
                continue
            ids = [str(t["trip_id"]) for t in candidate_route.get("trips", []) if t.get("trip_id")]
            delays = await _realtime_delays_for(ids, network=dated)
            trip = assign_trip(candidate_route, live, payload.latitude, payload.longitude,
                _now_service_seconds(_network_service_date(dated)), delays, network=dated)
            if trip is not None:
                matches.append((dated, candidate_route, trip, delays))
        route = None
        if len(matches) == 1:
            network, route, trip, delays = matches[0]
            live.update(trip_id=trip["trip_id"], network_version_id=network["version_id"],
                        service_date=_network_service_date(network))
        if route:
            timeline = _predicted_stop_timeline(route, trip, delays.get(str(trip["trip_id"])))
            nearest = min(timeline, key=lambda e: _haversine_km(payload.latitude, payload.longitude,
                e["stop"]["lat"], e["stop"]["lng"]), default=None)
            next_stop = ({**nearest["stop"], "scheduled": _fmt_service_time(nearest["scheduled"])} if nearest else None)
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
                    scheduled = nearest["scheduled"]
                    if scheduled is not None:
                        now_sec = _now_service_seconds(_network_service_date(network))
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
    """Raw GTFS clock: 00:20 and 24:20 are not interchangeable."""
    from mobility.realtime_trip_identity import _time_seconds
    return _time_seconds(value)


# GTFS service-day boundary/timezone come from the active mobility region.
# Keep the historical helper name `_berlin_now` for compatibility; its
# behavior is region-aware after this patch.
SERVICE_DAY_START_HOUR = get_active_region().service_day_start_hour


def _network_service_date(network: Optional[dict]) -> str:
    from mobility.realtime_trip_identity import _service_date
    day = _service_date(network or {})
    if not day:
        raise ValueError("A dated network is required for the GTFS clock")
    return day


def _now_service_seconds(service_date: str) -> int:
    from mobility.service_clock import service_seconds
    return service_seconds(_berlin_now(), service_date, get_active_region().timezone)


def _berlin_now() -> datetime:
    return datetime.now(ZoneInfo(get_active_region().timezone))


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
    """Geometry for this EXACT trip/direction - the trip's own shape only.

    No legacy `route.shape` fallback: a representative shape can belong to
    another direction/pattern and would put the marker hundreds of meters
    off the canonical line. Estimator order is:
    resolved pattern geometry -> exact validated trip shape -> nothing."""
    shape_id = trip.get("shape_id")
    if not shape_id:
        return []
    shapes = route.get("shapes") or {}
    shape = shapes.get(shape_id)
    return shape if isinstance(shape, list) and len(shape) > 2 else []


_TRIP_PATH_CACHE: dict = {}


def _service_date_key() -> str:
    now = _berlin_now()
    if now.hour < SERVICE_DAY_START_HOUR:
        now = now - timedelta(days=1)
    return now.date().isoformat()


def _epoch_to_service_seconds(epoch_value, service_date: str) -> Optional[int]:
    """Convert RT onto the same dated local clock as raw scheduled times."""
    if epoch_value is None:
        return None
    try:
        tz = ZoneInfo(get_active_region().timezone)
        dt = datetime.fromtimestamp(int(epoch_value), tz)
        from mobility.service_clock import service_seconds
        return service_seconds(dt, service_date, str(tz))
    except Exception:
        return None


def _predicted_stop_timeline(route: dict, trip: dict, realtime: Optional[dict]) -> List[dict]:
    """One canonical scheduled/predicted timeline for marker, ETA and motion."""
    realtime = realtime or {}
    trip_rel = str(realtime.get("trip_schedule_relationship") or "SCHEDULED").upper()
    if trip_rel in ("CANCELED", "DELETED"):
        return []

    stop_times_departure = trip.get("stop_times") or {}
    stop_times_arrival = trip.get("stop_times_arrival") or stop_times_departure
    from mobility.stop_occurrences import stop_occurrence_times
    try:
        visits = stop_occurrence_times(trip)
    except ValueError:
        return []
    trip_delay = int(realtime.get("delay_seconds") or 0)
    # A first StopTimeUpdate is not an explicit trip-wide delay. New worker
    # rows retain that distinction; legacy rows remain compatible until refresh.
    derived_trip_delay = realtime.get("trip_delay_kind") == "FIRST_STOP_DERIVED"
    propagated_delay = 0 if derived_trip_delay else trip_delay
    propagated_basis = ("TRIP_DELAY" if realtime.get("trip_delay_observed", bool(trip_delay))
                        and not derived_trip_delay else "SCHEDULE")
    anchor_stop = None
    anchor_sequence = None
    from mobility.timing_evidence import occurrence_counts, stop_evidence

    timeline: List[dict] = []
    previous_scheduled_departure = None

    ordered_stops = _trip_stops(route, trip)
    counts = occurrence_counts(ordered_stops)
    if visits is not None and (
        len(ordered_stops) != len(visits)
        or any(str(stop.get("stop_id")) != str(visit["stop_id"])
               for stop, visit in zip(ordered_stops, visits))
    ):
        return []
    for position, stop in enumerate(ordered_stops):
        sid = stop.get("stop_id")
        if sid is None:
            continue

        sid_key = str(sid)
        scheduled_arrival = _time_to_seconds(
            visits[position]["arrival_time"] if visits is not None else
            stop_times_arrival.get(sid, stop_times_arrival.get(sid_key, ""))
        )
        scheduled_departure = _time_to_seconds(
            visits[position]["departure_time"] if visits is not None else
            stop_times_departure.get(sid, stop_times_departure.get(sid_key, ""))
        )
        if scheduled_arrival is None and scheduled_departure is None:
            continue
        if scheduled_arrival is None:
            scheduled_arrival = scheduled_departure
        if scheduled_departure is None:
            scheduled_departure = scheduled_arrival
        if (scheduled_departure < scheduled_arrival
                or (previous_scheduled_departure is not None
                    and scheduled_arrival < previous_scheduled_departure)):
            return []
        previous_scheduled_departure = scheduled_departure

        sequence = visits[position]["stop_sequence"] if visits is not None else None
        prediction, local_delay, rel, ambiguous = stop_evidence(
            realtime, sid, sequence, counts[sid_key] > 1)

        use_rt = rel not in ("NO_DATA", "SKIPPED")
        arrival = None
        departure = None

        if use_rt:
            # RT queries already enforce the dated/versioned namespace. Never
            # guess a date from the current display grouping for epoch data.
            arrival = _epoch_to_service_seconds(prediction.get("arrival_epoch"), realtime.get("service_date"))
            departure = _epoch_to_service_seconds(prediction.get("departure_epoch"), realtime.get("service_date"))

        fallback_delay = int(local_delay if local_delay is not None else propagated_delay) if use_rt else 0
        arrival_delay = (
            int(prediction["arrival_delay_seconds"])
            if use_rt and prediction.get("arrival_delay_seconds") is not None
            else fallback_delay
        )
        departure_delay = (
            int(prediction["departure_delay_seconds"])
            if use_rt and prediction.get("departure_delay_seconds") is not None
            else fallback_delay
        )

        direct_arrival = arrival is not None or (use_rt and prediction.get("arrival_delay_seconds") is not None)
        direct_departure = departure is not None or (use_rt and prediction.get("departure_delay_seconds") is not None)
        if arrival is None:
            arrival = scheduled_arrival + arrival_delay
        if departure is None:
            # An arrival-only update shifts the explicit scheduled dwell too;
            # do not erase it by falling back to an older generic trip delay.
            if direct_arrival and not direct_departure:
                departure_delay = arrival - scheduled_arrival
            departure = scheduled_departure + departure_delay
        arrival_from_departure = not direct_arrival and direct_departure and arrival > departure
        if arrival_from_departure:
            # An inferred arrival cannot postpone an explicit early departure.
            # Retain its provenance; this is not a provider arrival timestamp.
            arrival = departure
        provider_arrival = arrival if direct_arrival else None
        provider_departure = departure if direct_departure else None
        basis = (rel if not use_rt else "DIRECT_STOP_UPDATE" if direct_arrival
                 else "FROM_DEPARTURE_UPDATE" if arrival_from_departure
                 else "STOP_DELAY" if local_delay is not None else propagated_basis)
        departure_basis = (rel if not use_rt else "DIRECT_STOP_UPDATE" if direct_departure
                           else "FROM_ARRIVAL_UPDATE" if direct_arrival
                           else "STOP_DELAY" if local_delay is not None else propagated_basis)
        arrival_anchor = (sid_key if direct_arrival or arrival_from_departure or local_delay is not None else anchor_stop) if use_rt else None
        arrival_anchor_sequence = (sequence if direct_arrival or arrival_from_departure or local_delay is not None else anchor_sequence) if use_rt else None

        # Do not clamp against an inferred intermediate clock before using the
        # next direct source anchor. Ordering is validated after neighbour fit.

        timeline.append(
            {
                "stop": stop,
                "stop_id": sid,
                # Keep `scheduled` as a compatibility alias for code that
                # predates separate GTFS arrival/departure preservation.
                "scheduled": scheduled_arrival,
                "scheduled_arrival": scheduled_arrival,
                "scheduled_departure": scheduled_departure,
                "predicted_arrival": arrival,
                "predicted_departure": departure,
                "delay_seconds": int(arrival - scheduled_arrival),
                "relationship": rel,
                "stop_sequence": sequence,
                "timing_basis": basis,
                "departure_timing_basis": departure_basis,
                "timing_anchor_stop_id": arrival_anchor,
                "timing_anchor_sequence": arrival_anchor_sequence,
                "timing_anchor_delay_seconds": int(arrival - scheduled_arrival) if direct_arrival or arrival_from_departure else fallback_delay,
                "provider_predicted_arrival_s": provider_arrival,
                "provider_predicted_departure_s": provider_departure,
                "ambiguous_stop_update": ambiguous,
                "timing_order_adjusted": False,
            }
        )
        if rel == "NO_DATA":
            propagated_delay = 0
            propagated_basis = "SCHEDULE"
            anchor_stop = anchor_sequence = None
        elif use_rt and (direct_arrival or direct_departure or local_delay is not None):
            propagated_delay = int(departure - scheduled_departure)
            propagated_basis = "PROPAGATED_STOP_DEPARTURE"
            anchor_stop, anchor_sequence = sid_key, sequence

    from mobility.neighbor_timing import combine_neighbor_timings, order_timeline
    return order_timeline(combine_neighbor_timings(timeline))


def _timeline_for_vehicle(route: dict, trip: dict, realtime: Optional[dict], vehicle: Optional[dict]) -> List[dict]:
    """Read the position's exact cached projection; GPS retains provider times."""
    projected = (vehicle or {}).get("_effective_timeline")
    if (vehicle and vehicle.get("estimated") and projected
            and vehicle.get("_motion_plan_revision")
            and str(vehicle.get("trip_id")) == str(trip.get("trip_id"))):
        return [dict(entry) for entry in projected]
    return _predicted_stop_timeline(route, trip, realtime)


def _assembled_matches_timeline(points: List[list], timeline: List[dict]) -> bool:
    """The assembled segment geometry must actually pass its stops (like the
    resolver's validate_geometry) - otherwise the vehicle would ride a line
    the map does not draw."""
    stops = [
        e["stop"]
        for e in timeline
        if (e.get("stop") or {}).get("lat") is not None and (e.get("stop") or {}).get("lng") is not None
    ]
    if len(stops) < 2:
        return True
    cum = [0.0]
    for i in range(len(points) - 1):
        cum.append(cum[-1] + _haversine_km(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]))
    positions = []
    for s in stops:
        lat, lng = float(s["lat"]), float(s["lng"])
        best_d, best_pos = float("inf"), 0.0
        for i in range(len(points) - 1):
            x0, y0 = points[i]
            x1, y1 = points[i + 1]
            dx, dy = x1 - x0, y1 - y0
            denom = dx * dx + dy * dy
            t = 0.0 if denom == 0 else max(0.0, min(1.0, ((lat - x0) * dx + (lng - y0) * dy) / denom))
            d = _haversine_km(lat, lng, x0 + t * dx, y0 + t * dy)
            if d < best_d:
                best_d = d
                best_pos = cum[i] + t * (cum[i + 1] - cum[i])
        if best_d > 0.12:
            return False
        positions.append(best_pos)
    return all(positions[i + 1] >= positions[i] - 0.06 for i in range(len(positions) - 1))


async def _trip_path_geometry(route: dict, trip: dict, timeline: List[dict], network: Optional[dict] = None) -> Optional[dict]:
    """Travel-ordered path with generation metadata when available."""
    from mobility import geometry_cache
    from mobility.generations import atomic_generations_enabled

    try:
        from mobility.domain import (
            _pattern_id as _dom_pattern_id,
            _pattern_key as _dom_pattern_key,
        )
        pat_id = _dom_pattern_id(
            str(route.get("route_number")),
            _dom_pattern_key(trip),
        )
    except Exception:
        pat_id = None

    if network is None:
        network = await _get_active_network()
    version_id = str((network or {}).get("version_id") or "")
    region = get_active_region()
    from mobility.realtime_trip_identity import _service_date
    import time

    entry = geometry_cache.get_entry(pat_id, version_id or None)
    key = (
        region.region_id, region.network_id, version_id,
        _service_date(network or {}) or _service_date_key(), pat_id,
        (entry or {}).get("generation_id"),
        (entry or {}).get("geometry_fingerprint"),
        (entry or {}).get("source"), (entry or {}).get("osm_snapshot_v"),
        geometry_cache.revision(),
        tuple((e.get("stop_id"), e["stop"].get("lat"), e["stop"].get("lng")) for e in timeline),
    )
    cached_path = _TRIP_PATH_CACHE.get(key)
    # Share static projection across trips, not their realtime timelines.
    # Unversioned/fallback paths must periodically retry canonical geometry.
    if cached_path is not None and (
        (entry or {}).get("generation_id") or time.monotonic() - cached_path["at"] < 15
    ):
        return cached_path["path"]

    points: Optional[List[list]] = None
    path_meta = {
        "derived_generation": None,
        "geometry_source": None,
        "osm_snapshot_v": None,
        "geometry_fingerprint": None,
    }

    if entry and len(entry.get("points") or []) >= 2:
        points = [
            [float(p[0]), float(p[1])]
            for p in entry.get("points") or []
        ]
        path_meta = {
            "derived_generation": entry.get("generation_id"),
            "geometry_source": entry.get("source"),
            "osm_snapshot_v": entry.get("osm_snapshot_v"),
            "geometry_fingerprint": entry.get("geometry_fingerprint"),
        }

    if points is None and atomic_generations_enabled() and version_id and pat_id:
        try:
            from mobility.generations import get_pattern_generation

            bundle = await get_pattern_generation(pat_id, version_id)
            if bundle and bundle.get("ready"):
                geometry = bundle.get("geometry") or {}
                bundle_points = geometry.get("points") or []
                if len(bundle_points) >= 2:
                    points = [
                        [float(p[0]), float(p[1])]
                        for p in bundle_points
                    ]
                    path_meta = {
                        "derived_generation": bundle.get("generation_id"),
                        "geometry_source": geometry.get("source"),
                        "osm_snapshot_v": bundle.get("osm_snapshot_v"),
                        "geometry_fingerprint": geometry.get("geometry_fingerprint"),
                    }
                    geometry_cache.set_cached(
                        pat_id,
                        points,
                        version_id=version_id,
                        generation_id=bundle.get("generation_id"),
                        source=geometry.get("source"),
                        osm_snapshot_v=bundle.get("osm_snapshot_v"),
                        geometry_fingerprint=geometry.get("geometry_fingerprint"),
                    )
        except Exception:
            points = None

    if points is None and not atomic_generations_enabled():
        try:
            query = {
                "pattern_id": pat_id,
                "region_id": get_active_region().region_id,
            }
            if version_id:
                query["version_id"] = version_id
            seg_docs = await db.mobility_geometry_segments.find(
                query,
                {"_id": 0},
            ).to_list(300)
            segs = sorted(
                seg_docs,
                key=lambda s: (
                    int(s.get("a_idx", 0)),
                    int(s.get("b_idx", 0)),
                ),
            )
            n_stops = len(
                trip.get("stop_ids")
                or route.get("stop_ids")
                or []
            )
            covered = {
                (int(s.get("a_idx")), int(s.get("b_idx")))
                for s in segs
                if s.get("points")
            }
            if (
                segs
                and n_stops > 0
                and len(covered) == max(0, n_stops - 1)
            ):
                from mobility.graph import assemble_segments

                assembled = assemble_segments(segs)
                if (
                    assembled is not None
                    and _assembled_matches_timeline(assembled, timeline)
                ):
                    points = assembled
                    geometry_cache.set_cached(
                        pat_id,
                        assembled,
                        version_id=version_id or None,
                    )
        except Exception:
            points = None

    # Position-only last fallback. Because it has no atomic generation,
    # the motion engine will deliberately reject physics and use the
    # existing compatibility estimator.
    if points is None:
        shape = _trip_shape(route, trip)
        if isinstance(shape, list) and len(shape) > 2:
            shape_pts = [[float(p[0]), float(p[1])] for p in shape]
            if _assembled_matches_timeline(shape_pts, timeline):
                points = shape_pts
                path_meta["geometry_source"] = "GTFS_POSITION_FALLBACK"

    if not points:
        return None

    cumulative = [0.0]
    for i in range(len(points) - 1):
        cumulative.append(
            cumulative[-1]
            + _haversine_km(
                points[i][0],
                points[i][1],
                points[i + 1][0],
                points[i + 1][1],
            )
            * 1000.0
        )

    stop_progress = []
    cursor = 0
    for entry_timeline in timeline:
        stop = entry_timeline["stop"]
        best_i = cursor
        best_d = float("inf")
        for i in range(cursor, len(points)):
            d = _haversine_km(
                stop.get("lat"),
                stop.get("lng"),
                points[i][0],
                points[i][1],
            )
            if d < best_d:
                best_d = d
                best_i = i
        cursor = best_i
        stop_progress.append(cumulative[best_i])

    result = {
        "points": points,
        "cumulative": cumulative,
        "stop_progress": stop_progress,
        "total_m": cumulative[-1] if cumulative else 0.0,
        "pattern_id": pat_id,
        **path_meta,
    }
    if len(_TRIP_PATH_CACHE) >= 2048:
        _TRIP_PATH_CACHE.pop(next(iter(_TRIP_PATH_CACHE)))
    _TRIP_PATH_CACHE[key] = {"at": time.monotonic(), "path": result}
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


def _dwell_progress(timeline: List[dict], stop_progress: List[float], now_sec: int) -> Optional[float]:
    """When the vehicle is between its predicted ARRIVAL and DEPARTURE at a
    stop, it stands absolutely still (true dwell) - not even the crawl."""
    for i, entry in enumerate(timeline):
        arrival = int(entry.get("predicted_arrival", 0))
        departure = int(entry.get("predicted_departure", arrival))
        if arrival <= now_sec <= departure and i < len(stop_progress):
            return float(stop_progress[i])
    return None


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


async def _estimate_trip_position(
    route: dict,
    trip: dict,
    now_sec: int,
    delays: dict,
    version_id: Optional[str] = None,
    network: Optional[dict] = None,
) -> Optional[dict]:
    """Physics-first projection; fallback shares one stop-constrained ETA plan."""
    trip_id = str(trip.get("trip_id") or "")
    realtime = delays.get(trip_id) if trip_id else None
    timeline = _predicted_stop_timeline(route, trip, realtime)
    if len(timeline) < 2:
        return None

    start = timeline[0]["predicted_arrival"]
    end = timeline[-1]["predicted_arrival"]
    if now_sec < start - 60:
        return None

    path = await _trip_path_geometry(route, trip, timeline, network=network)
    if path and network:
        from mobility.realtime_trip_identity import _service_date
        path = {**path, "service_date": _service_date(network) or _service_date_key()}
    if not path:
        # No verified real geometry: the marker is not drawn (ETA remains
        # available via arrivals) - never a fake line through buildings.
        return None
    stop_progress = path.get("stop_progress") or []
    if len(stop_progress) != len(timeline):
        return None

    raw_progress = _raw_timeline_progress(timeline, stop_progress, now_sec)
    motion_result = None
    motion_failure_reason = None
    if MOTION_ENGINE_ENABLED and not version_id:
        motion_failure_reason = "NO_VERSION_ID"
    if version_id and MOTION_ENGINE_ENABLED:
        try:
            from mobility.motion import position_for_trip

            motion_result = await position_for_trip(
                trip_id=trip_id,
                mode=str(route.get("mode") or "bus"),
                version_id=str(version_id),
                timeline=timeline,
                path=path,
                now_sec=now_sec,
                include_failure_reason=True,
            )
            if motion_result and motion_result.get("motion_available") is False:
                motion_failure_reason = str(
                    motion_result.get("fallback_reason") or "PLAN_BUILD_FAILED"
                )
        except Exception as e:
            motion_failure_reason = "ENGINE_EXCEPTION"
            logger.warning(
                "motion fallback for trip %s: %s: %s",
                trip_id,
                type(e).__name__,
                e,
            )

    detailed_motion_available = bool(
        motion_result
        and motion_result.get("motion_available", True)
        and motion_result.get("progress_m") is not None
    )
    if not detailed_motion_available:
        from mobility.motion.timeline_fallback import position_from_timeline
        motion_result = position_from_timeline(trip_id=trip_id, mode=str(route.get("mode") or "bus"),
            version_id=version_id, timeline=timeline, path=path, now_sec=now_sec)
        if not motion_result:
            return None  # Retain board ETAs; do not draw an unbounded marker.
    motion_available = True
    if motion_available:
        timeline = motion_result.get("effective_timeline") or timeline
        start = timeline[0]["predicted_arrival"]
        end = timeline[-1]["predicted_departure"]
        if now_sec < start - 60 or now_sec > end + 180:
            return None
        shown_progress = float(motion_result["progress_m"])
        next_idx = int(motion_result["next_timeline_index"])
        next_entry = timeline[max(0, min(len(timeline) - 1, next_idx))]
        distance_to_next_stop_m = round(
            float(motion_result.get("distance_to_next_stop_m") or 0.0)
        )
        motion = {
            "model": motion_result.get("motion_model"),
            "quality": motion_result.get("motion_quality"),
            "state": motion_result.get("motion_state"),
            "speed_kmh": motion_result.get("speed_kmh"),
            "leg_from_stop_id": motion_result.get("leg_from_stop_id"),
            "leg_to_stop_id": motion_result.get("leg_to_stop_id"),
            "delay_delta_s": motion_result.get("delay_delta_s"),
            "scheduled_duration_s": motion_result.get("scheduled_duration_s"),
            "predicted_leg_duration_s": motion_result.get(
                "predicted_leg_duration_s"
            ),
            "engine_available_duration_s": motion_result.get(
                "engine_available_duration_s"
            ),
            "natural_duration_s": motion_result.get("natural_duration_s"),
            "fastest_duration_s": motion_result.get("fastest_duration_s"),
            "recovery_ratio": motion_result.get("recovery_ratio"),
            "physics_limited_s": motion_result.get("physics_limited_s"),
            "arrival_target_error_s": motion_result.get(
                "arrival_target_error_s"
            ),
            "incremental_physics_limited_s": motion_result.get(
                "incremental_physics_limited_s"
            ),
            "carried_lateness_s": motion_result.get("carried_lateness_s"),
            "recovered_lateness_s": motion_result.get("recovered_lateness_s"),
            "fit": motion_result.get("fit"),
            "traffic_edge_count": motion_result.get("traffic_edge_count"),
            "signal_stop_count": motion_result.get("signal_stop_count"),
            "traffic_provider": motion_result.get("traffic_provider"),
            "traffic_profile_versions": (
                motion_result.get("traffic_profile_versions") or []
            ),
            "plan_final_arrival_target_error_s": motion_result.get(
                "plan_final_arrival_target_error_s"
            ),
            "plan_max_arrival_target_error_s": motion_result.get(
                "plan_max_arrival_target_error_s"
            ),
            "plan_incremental_physics_limited_s": motion_result.get(
                "plan_incremental_physics_limited_s"
            ),
            "handover_applied": bool(
                motion_result.get("handover_applied")
            ),
            "handover_from_progress_m": motion_result.get(
                "handover_from_progress_m"
            ),
            "handover_initial_speed_kmh": motion_result.get(
                "handover_initial_speed_kmh"
            ),
            "continuity_clamp_m": motion_result.get(
                "continuity_clamp_m"
            ),
            "backward_resample_prevented_m": motion_result.get(
                "backward_resample_prevented_m"
            ),
            "fallback_reason": None if detailed_motion_available else motion_failure_reason or "DETAILED_MOTION_UNAVAILABLE",
            "motion_plan_revision": motion_result.get("motion_plan_revision"),
            "next_timeline_index": next_idx,
        }
    pos, heading = _point_heading_at_progress(path, shown_progress)
    if not pos:
        return None

    delay_seconds = int(next_entry.get("delay_seconds") or 0)
    has_rt_legacy = bool(
        realtime
        and (
            realtime.get("stop_predictions")
            or realtime.get("stop_delays")
            or realtime.get("trip_delay_observed") is True
            or (realtime.get("trip_delay_observed") is None and realtime.get("delay_seconds"))
        )
    )
    from mobility.timing_evidence import timing_evidence, has_realtime_timing
    has_rt = has_realtime_timing(next_entry) if next_entry.get("timing_basis") is not None else has_rt_legacy
    evidence = timing_evidence(next_entry)
    anchor = next((s for s in route.get("stops", []) if str(s.get("stop_id")) == str(evidence.get("timing_anchor_stop_id"))), {})
    next_anchor = next((s for s in route.get("stops", []) if str(s.get("stop_id")) == str(evidence.get("timing_next_anchor_stop_id"))), {})
    evidence.update(anchor_stop_name=anchor.get("name"),
        next_anchor_stop_name=next_anchor.get("name"),
        source_status=(realtime or {}).get("source_timing_status") or
            ("TRIP_CLOCK_UNKNOWN" if realtime and realtime.get("trip_update_timestamp") is None else "CURRENT" if realtime else "SCHEDULE_ONLY"),
        trip_update_timestamp=(realtime or {}).get("trip_update_timestamp"),
        feed_timestamp=(realtime or {}).get("feed_timestamp"),
        received_at=(realtime or {}).get("received_at", (realtime or {}).get("updated_at")),
        position_assurance="MODEL_ESTIMATE" if detailed_motion_available else "TIMELINE_CONSTRAINED_FALLBACK",
        source_correction=motion_result.get("source_correction") if motion_available else None)

    return {
        "latitude": pos["lat"],
        "longitude": pos["lng"],
        "heading": heading,
        "delay_minutes": round(delay_seconds / 60),
        "position_source": "REALTIME_ESTIMATE" if has_rt else "SCHEDULE_ESTIMATE",
        "progress_m": round(shown_progress, 1),
        "target_progress_m": round(raw_progress, 1),
        "next_stop_id": next_entry.get("stop_id"),
        "next_stop_name": next_entry.get("name") or (next_entry.get("stop") or {}).get("name"),
        "distance_to_next_stop_m": distance_to_next_stop_m,
        "pattern_id": path.get("pattern_id"),
        "position_state": "ON_PATTERN",
        "geometry_pending": False,
        "motion": motion,
        "_effective_timeline": motion_result.get("effective_timeline") if motion_available else None,
        "_motion_plan_revision": motion_result.get("motion_plan_revision") if motion_available else None,
        "_motion_next_timeline_index": next_idx if motion_available else None,
        "next_stop_eta_seconds": max(0, int(next_entry["predicted_arrival"])-now_sec),
        "next_stop_predicted_arrival": _fmt_service_time(int(next_entry["predicted_arrival"])),
        "source_next_stop_predicted_arrival": _fmt_service_time(int(next_entry.get("source_predicted_arrival", next_entry["predicted_arrival"]))),
        "prediction_basis": next_entry.get("prediction_basis", "SOURCE_TIMELINE"),
        "timing_evidence": evidence,
        "estimate_revision": motion_result.get("estimate_revision") if motion_available else None,
        "next_stop_eta_source": "PERIX_ESTIMATE" if next_entry.get("prediction_basis") == "PERIX_MOTION_PLAN" else ("REALTIME" if has_rt else "SCHEDULE"),
    }

def _park_position(route: dict, trip: dict, now_sec: int, delays: dict) -> Optional[dict]:
    """Fallback position for a vehicle whose line geometry is not resolved
    yet: stand ON the next stop (or the last passed one), never in the
    air. Once the canonical geometry exists the estimator takes over."""
    rt = delays.get(str(trip.get("trip_id") or ""))
    timeline = _predicted_stop_timeline(route, trip, rt)
    if len(timeline) < 2:
        return None
    start = timeline[0]["predicted_arrival"]
    end = timeline[-1]["predicted_arrival"]
    if now_sec < start - 60 or now_sec > end + 180:
        return None
    entry = next(
        (e for e in timeline if e["predicted_arrival"] >= now_sec and e["relationship"] != "SKIPPED"),
        timeline[-1],
    )
    s = entry.get("stop") or {}
    if s.get("lat") is None or s.get("lng") is None:
        return None
    heading = None
    idx = timeline.index(entry)
    if idx + 1 < len(timeline):
        nxt = timeline[idx + 1].get("stop") or {}
        if nxt.get("lat") is not None:
            heading = _bearing(s["lat"], s["lng"], nxt["lat"], nxt["lng"])
    from mobility.timing_evidence import has_realtime_timing
    has_rt = has_realtime_timing(entry)
    return {
        "pos": {"lat": s["lat"], "lng": s["lng"]},
        "heading": heading,
        "next_stop_id": entry.get("stop_id"),
        "next_stop_name": (entry.get("stop") or {}).get("name") or entry.get("name"),
        "position_source": "REALTIME_ESTIMATE" if has_rt else "SCHEDULE_ESTIMATE",
        "position_state": "STOP_ANCHOR",
        "geometry_pending": True,
    }


# Only overlapping callers share a sample. Completed positions are never cached.
_ESTIMATES_INFLIGHT: dict = {}

REALTIME_FRESH_SECONDS = int(os.getenv("MOBILITY_REALTIME_FRESH_SECONDS", "420"))
MOTION_ENGINE_ENABLED = os.getenv("MOBILITY_MOTION_ENABLED", "false").lower() == "true"


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


def _chain_trips(route: dict, delays: Optional[dict] = None, skip_trip_ids: Optional[set] = None,
                 effective_windows: Optional[dict] = None) -> List[dict]:
    """Source-identified virtual journeys; join only source-verified blocks.

    Build topology from scheduled clocks before applying realtime/retention.
    A delay refresh must not regroup journeys or change an icon's run identity.
    Terminus proximity is not proof that two trips share a physical vehicle.
    Without a source block, keep each existing dated trip as its own virtual
    journey using the existing source-derived ID function, never a made-up GPS
    vehicle. This also prevents simultaneous source trips masking each other.
    """
    windows = []
    for trip in route.get("trips", []):
        if skip_trip_ids and str(trip.get("trip_id") or "") in skip_trip_ids:
            continue
        rt = (delays or {}).get(str(trip.get("trip_id") or ""))
        if str((rt or {}).get("trip_schedule_relationship") or "").upper() in ("CANCELED", "DELETED"):
            continue
        w = _trip_window(route, trip)
        if w:
            windows.append({"trip": trip, **w})

    windows.sort(key=lambda x: (x["start"], str(x["trip"].get("trip_id") or "")))
    runs: List[dict] = []
    for w in windows:
        attached = False
        for run in (runs if w["trip"].get("block_id") else ()):
            ls = run["last_stop"]
            fs = w["first_stop"]
            previous_block = str(run["trips"][-1]["trip"].get("block_id") or "")
            next_block = str(w["trip"].get("block_id") or "")
            if (
                bool(previous_block) and previous_block == next_block
                and
                _haversine_km(ls.get("lat"), ls.get("lng"), fs.get("lat"), fs.get("lng")) < 0.08
                and run["end"] <= w["start"] <= run["end"] + 900
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
    # Keep source clocks distinct from PERIX retention. An extended predecessor
    # must not mask a successor whose own source window has already started.
    for run in runs:
        for window in run["trips"]:
            realtime = (delays or {}).get(str(window["trip"].get("trip_id")))
            source = _trip_window(route, window["trip"], realtime) if realtime else None
            if source:
                window.update(source)
            window["source_start"] = window["start"]
            window["source_end"] = window["end"]
            known = (effective_windows or {}).get(str(window["trip"].get("trip_id")))
            if known:
                window["start"] = max(window["start"], known["start"])
                window["end"] = max(window["end"], known["end"])
        run["start"] = min(w["start"] for w in run["trips"])
        run["end"] = max(w["end"] for w in run["trips"])
    return runs


def _select_run_trip(run: dict, now_sec: int) -> tuple:
    """Resolve source-active journeys before cache-only inferred continuity.

    No additional vehicles, replacement positions or changed clocks are made.
    A verified same-block predecessor may still be held by its effective plan;
    mere terminus proximity is not evidence of a shared physical vehicle.
    """
    retained = next((w for w in run["trips"] if w["start"] <= now_sec <= w["end"]), None)
    source_active = [w for w in run["trips"]
                     if w.get("source_start", w["start"]) <= now_sec <= w.get("source_end", w["end"])]
    if source_active:
        current = max(source_active, key=lambda w: (w.get("source_start", w["start"]),
                                                   str(w["trip"].get("trip_id") or "")))
        current_block = str(current["trip"].get("block_id") or "")
        if (retained is not None and retained is not current and current_block
                and current_block == str(retained["trip"].get("block_id") or "")):
            return retained, "VERIFIED_BLOCK_RETAINED"
        return current, "SOURCE_ACTIVE"
    return retained, "PERIX_RETAINED" if retained is not None else "NO_ACTIVE_WINDOW"


async def _realtime_delays_for(trip_ids: List[str], network: Optional[dict] = None, *, collection=None) -> dict:
    """Fresh GTFS-RT state. Do not mutate delay values to prevent reverse motion."""
    if not trip_ids:
        return {}

    region = get_active_region()
    from mobility.realtime_trip_identity import _service_date

    active = network if network is not None else await _get_active_network()
    version_id = str((active or {}).get("version_id") or "")
    service_date = _service_date(active or {})
    if not version_id or not service_date:
        return {}
    query = {
            "region_id": region.region_id,
            "network_id": region.network_id,
            "network_version_id": version_id,
            "service_date": service_date,
            "trip_id": {"$in": trip_ids},
        }
    if collection is None:
        # Never inherit legacy state across dates/versions. A dated row, even
        # stale, supersedes its rollback row rather than reviving old evidence.
        legacy = await db.mobility_realtime.find(query, {"_id": 0}).to_list(len(trip_ids))
        dated = await db.mobility_trip_realtime_journeys.find(query, {"_id": 0}).to_list(len(trip_ids))
        docs = list({str(d["trip_id"]): d for d in legacy + dated}.values())
    else:
        docs = await collection.find(query, {"_id": 0}).to_list(len(trip_ids))

    from mobility.realtime_freshness import is_recent_feed_generation, is_recent_trip_update, operational_only

    now_epoch = int(datetime.now(ZoneInfo("UTC")).timestamp())
    # A per-trip DB write can be fresh even when the feed snapshot is old.
    max_feed_age = int(os.getenv("MOBILITY_REALTIME_FEED_FRESH_SECONDS", "180"))
    result = {}
    for doc in docs:
        receipt_fresh = _iso_is_fresh(doc.get("updated_at") or "", REALTIME_FRESH_SECONDS)
        feed_fresh = is_recent_feed_generation(doc.get("feed_timestamp"), now_epoch, max_feed_age)
        trip_fresh = is_recent_trip_update(doc.get("trip_update_timestamp"), now_epoch, max_feed_age)
        if receipt_fresh and feed_fresh and trip_fresh:
            result[str(doc.get("trip_id"))] = doc
            continue
        # Source-validated operational exceptions remain in this exact dated
        # namespace during an outage. Expired timing never becomes live again.
        validated = (doc.get("source_match_validated") is True
                     and doc.get("network_version_id") == version_id
                     and doc.get("service_date") == service_date)
        rels = list((doc.get("stop_relationships") or {}).values())
        rels += [r.get("relationship") for r in (doc.get("stop_relationships_by_sequence") or {}).values() if isinstance(r, dict)]
        exceptional = str(doc.get("trip_schedule_relationship") or "").upper() in ("CANCELED", "DELETED") or "SKIPPED" in rels
        if validated and exceptional:
            reason = "STALE_FEED" if not feed_fresh else "STALE_TRIP_UPDATE" if not trip_fresh else "STALE_RECEIPT"
            result[str(doc.get("trip_id"))] = operational_only(doc, reason)
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

async def _estimated_transit_vehicles(network: Optional[dict] = None) -> List[dict]:
    from mobility import geometry_cache
    from mobility.realtime_trip_identity import _service_date

    if network is None:
        network = await _get_active_network()
    if not network:
        return []
    region = get_active_region()
    key = (region.region_id, region.network_id, str(network.get("version_id") or ""),
           _service_date(network), _service_date_key(), geometry_cache.revision())
    task = _ESTIMATES_INFLIGHT.get(key)
    if task is None or task.done():
        task = asyncio.create_task(_compute_estimated_transit_vehicles(network))
        _ESTIMATES_INFLIGHT[key] = task

        def finished(done):
            if _ESTIMATES_INFLIGHT.get(key) is done:
                _ESTIMATES_INFLIGHT.pop(key, None)
            # Retrieve failures even if every HTTP waiter has disconnected.
            if not done.cancelled():
                done.exception()

        task.add_done_callback(finished)
    # A disconnected caller must not cancel another caller's shared work.
    return await asyncio.shield(task)


async def _compute_estimated_transit_vehicles(network: dict) -> List[dict]:
    """Virtual vehicles for every currently running vehicle run of the
    active network (bus/tram), unless a real vehicle already covers that
    route and direction. Consecutive trips at a terminus chain into ONE
    vehicle so lines run at their real frequency."""
    live = await db.mobility_live.find(
        {"mode": {"$in": ["bus", "tram"]}, "latitude": {"$ne": None}}, {"_id": 0}
    ).to_list(500)
    # Only FRESH live positions suppress estimates, and suppression is per
    # TRIP: a GPS vehicle hides only the estimate of the trip it is on -
    # never every scheduled vehicle of the same route+direction.
    covered_trip_ids = {
        str(v.get("trip_id"))
        for v in live
        if v.get("trip_id") and _vehicle_in_network(v, network)
        and _iso_is_fresh(v.get("updated_at") or "", 90)
    }
    now_sec = _now_service_seconds(_network_service_date(network))
    estimates: List[dict] = []
    trip_ids = [
        t.get("trip_id")
        for route in network.get("routes", [])
        for t in route.get("trips", [])
        if t.get("trip_id")
    ]
    # Preserve strict region/version/service-date matching and feed freshness.
    delays = await _realtime_delays_for(trip_ids, network=network)
    # Operator overrides: canceled trips produce no vehicle at all.
    canceled_ids: set = set()
    try:
        from mobility.overrides import canceled_trip_ids

        canceled_ids = await canceled_trip_ids()
    except Exception:
        pass
    from mobility.motion.engine import cached_trip_windows
    region = get_active_region()
    known_windows = cached_trip_windows(region_id=region.region_id, network_id=region.network_id,
                                       version_id=str(network.get("version_id") or ""),
                                       service_date=_network_service_date(network)) if MOTION_ENGINE_ENABLED else {}
    for route in network.get("routes", []):
        route_number = str(route.get("route_number"))
        mode = route.get("mode") if route.get("mode") in ("bus", "tram") else "bus"
        for run in _chain_trips(route, delays, canceled_ids, known_windows):
            first = run["trips"][0]
            headsign = str(first["trip"].get("headsign") or route.get("name") or "")
            if now_sec < run["start"] - 60 or now_sec > run["end"] + 60:
                continue
            # Determine the trip the vehicle is on RIGHT NOW first (window
            # check), so suppression can be trip-scoped.
            active, selection_basis = _select_run_trip(run, now_sec)
            before = None
            after = None
            for w in run["trips"]:
                if w["end"] <= now_sec:
                    before = w
                if w["start"] >= now_sec and after is None:
                    after = w
            # A geometric schedule chain does not locate an actual vehicle in
            # its layover. Do not park a speculative bus/tram for a whole gap.
            # Preserve only the existing 60s trip-edge grace and active trips
            # whose canonical geometry is still pending.
            if (active is None and before is not None and after is not None
                    and now_sec > before["end"] + 60 and now_sec < after["start"] - 60):
                continue
            current_trip = None
            if active is not None:
                current_trip = active["trip"]
            elif after is not None:
                current_trip = after["trip"]
            elif before is not None:
                current_trip = before["trip"]
            else:
                current_trip = first["trip"]
            if current_trip and str(current_trip.get("trip_id")) in covered_trip_ids:
                continue
            pos = None
            heading = None
            delay_minutes = 0
            position_source = "SCHEDULE_ESTIMATE"
            next_stop_name = None
            next_stop_id = None
            distance_to_next_stop_m = None
            pattern_id = None
            progress_m = None
            position_state = "ON_PATTERN"
            geometry_pending = False
            motion = None
            projection = {}
            if active:
                p = await _estimate_trip_position(
                    route,
                    active["trip"],
                    now_sec,
                    delays,
                    version_id=str(network.get("version_id") or ""),
                    network=network,
                )
                if p:
                    projection = p
                    pos = {"lat": p["latitude"], "lng": p["longitude"]}
                    heading = p.get("heading")
                    delay_minutes = p["delay_minutes"]
                    position_source = p["position_source"]
                    next_stop_name = p.get("next_stop_name")
                    next_stop_id = p.get("next_stop_id")
                    distance_to_next_stop_m = p.get("distance_to_next_stop_m")
                    pattern_id = p.get("pattern_id")
                    progress_m = p.get("progress_m")
                    motion = p.get("motion")
                else:
                    # Trip active but no verified line geometry yet (e.g.
                    # the nightly route is still computing): park the
                    # vehicle ON its next stop instead of hiding it - the
                    # passenger still sees it, never floating in the air.
                    park = _park_position(route, active["trip"], now_sec, delays)
                    if park:
                        pos = {"lat": park["pos"]["lat"], "lng": park["pos"]["lng"]}
                        heading = park.get("heading")
                        next_stop_name = park.get("next_stop_name")
                        next_stop_id = park.get("next_stop_id")
                        distance_to_next_stop_m = 0
                        position_source = park.get("position_source") or "SCHEDULE_ESTIMATE"
                        position_state = park.get("position_state") or "STOP_ANCHOR"
                        geometry_pending = bool(park.get("geometry_pending"))
                    else:
                        continue
            if pos is None:
                # Gap between trips (turnaround) or grace at the run ends:
                # stand at the shared terminus stop, facing along the line.
                position_state = "TURNAROUND_ANCHOR"
                geometry_pending = False
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
            estimates.append(
                {
                    "vehicle_id": _estimated_vehicle_id(network, route_number, first['trip'].get('trip_id', '')),
                    "network_version_id": network.get("version_id"),
                    "service_date": _network_service_date(network),
                    "business_id": network.get("business_id") or "mvb",
                    "mode": mode,
                    "fleet_number": route_number,
                    "name": f"{route_number} {headsign}".strip(),
                    "route_number": route_number,
                    # Direction of the CURRENT trip (a run alternates
                    # directions at each turnaround)
                    "route_direction": str(current_trip.get("headsign") or headsign),
                    "trip_id": current_trip.get("trip_id"),
                    "trip_selection_basis": selection_basis,
                    "run_identity_basis": "GTFS_BLOCK" if current_trip.get("block_id") else "DATED_SOURCE_TRIP",
                    "latitude": pos["lat"],
                    "longitude": pos["lng"],
                    "heading": heading,
                    "status": "estimated",
                    "delay_minutes": delay_minutes,
                    "position_source": position_source,
                    "estimated": True,
                    "next_stop_id": next_stop_id,
                    "next_stop_name": next_stop_name,
                    "distance_to_next_stop_m": distance_to_next_stop_m,
                    "pattern_id": pattern_id,
                    "progress_m": progress_m,
                    "position_state": position_state,
                    "geometry_pending": geometry_pending,
                    "motion": motion,
                    "_effective_timeline": projection.get("_effective_timeline"),
                    "_motion_plan_revision": projection.get("_motion_plan_revision"),
                    "_motion_next_timeline_index": projection.get("_motion_next_timeline_index"),
                    "_prediction_realtime": delays.get(str(current_trip.get("trip_id"))) if projection.get("_effective_timeline") else None,
                    "next_stop_eta_seconds": projection.get("next_stop_eta_seconds"),
                    "next_stop_predicted_arrival": projection.get("next_stop_predicted_arrival"),
                    "source_next_stop_predicted_arrival": projection.get("source_next_stop_predicted_arrival"),
                    "prediction_basis": projection.get("prediction_basis", "SOURCE_TIMELINE"),
                    "timing_evidence": projection.get("timing_evidence"),
                    "estimate_revision": projection.get("estimate_revision"),
                    "next_stop_eta_source": projection.get("next_stop_eta_source"),
                    "realtime_feed_timestamp": (delays.get(str(current_trip.get("trip_id"))) or {}).get("feed_timestamp"),
                    "realtime_updated_at": (delays.get(str(current_trip.get("trip_id"))) or {}).get("updated_at"),
                    "updated_at": datetime.now().isoformat(),
                }
            )
    return estimates


async def _all_active_vehicles(network: Optional[dict] = None, *, networks: Optional[List[dict]] = None) -> List[dict]:
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
    if network is not None:
        return [v for v in live if v.get("mode") == "taxi" or _vehicle_in_network(v, network)] + await _estimated_transit_vehicles(network=network)
    estimates = []
    for dated in networks if networks is not None else await networks_for_journey_window():
        estimates.extend(await _estimated_transit_vehicles(network=dated))
    return live + estimates


def _estimated_vehicle_id(network: dict, route_number: str, trip_id: str) -> str:
    region = get_active_region()
    return f"est_{region.region_id}:{region.network_id}:{network['version_id']}:{_network_service_date(network)}:{route_number}:{trip_id}"


def _vehicle_in_network(vehicle: dict, network: dict) -> bool:
    return (str(vehicle.get("network_version_id") or vehicle.get("version_id") or "") == str(network.get("version_id") or "")
            and vehicle.get("service_date") == _network_service_date(network))


_NETWORK_READS = {}


async def _get_active_network() -> Optional[dict]:
    region = get_active_region()
    key = (region.region_id, region.network_id, "active")
    task = _NETWORK_READS.get(key)
    if task is None or task.done():
        task = asyncio.create_task(_load_active_network())
        _NETWORK_READS[key] = task
        def finished(done):
            if _NETWORK_READS.get(key) is done:
                _NETWORK_READS.pop(key, None)
            if not done.cancelled():
                done.exception()
        task.add_done_callback(finished)
    return await asyncio.shield(task)


async def _load_active_network() -> Optional[dict]:
    region = get_active_region()
    network = await db.bus_network_versions.find_one(
        {
            "active": True,
            "region_id": region.region_id,
            "network_id": region.network_id,
        },
        {"_id": 0},
    )
    if network:
        return network

    # One-time compatibility bridge only for the pre-existing Magdeburg
    # deployment. Never claim a legacy network when another city is active.
    if region.region_id != "magdeburg":
        return None
    legacy = await db.bus_network_versions.find_one(
        {"active": True, "region_id": {"$exists": False}},
        {"_id": 0},
    )
    if not legacy:
        return None
    version_id = legacy.get("version_id")
    fields = {
        "region_id": region.region_id,
        "network_id": region.network_id,
        "timezone": region.timezone,
        "country": region.country,
        "service_day_start_hour": region.service_day_start_hour,
    }
    if version_id:
        await db.bus_network_versions.update_one(
            {"version_id": version_id},
            {"$set": fields},
        )
    return {**legacy, **fields}


async def networks_for_journey_window(network: Optional[dict] = None, *, now: Optional[datetime] = None) -> List[dict]:
    region = get_active_region()
    from mobility.service_clock import _static_service_date
    observed = now or _berlin_now()
    key = (region.region_id, region.network_id, "window",
           _static_service_date(observed, region.timezone),
           str((network or {}).get("version_id") or ""),
           _network_service_date(network) if network else None)
    task = _NETWORK_READS.get(key)
    if task is None or task.done():
        task = asyncio.create_task(_load_journey_networks(network, now=observed))
        _NETWORK_READS[key] = task
        def finished(done):
            if _NETWORK_READS.get(key) is done:
                _NETWORK_READS.pop(key, None)
            if not done.cancelled():
                done.exception()
        task.add_done_callback(finished)
    return await asyncio.shield(task)


async def _load_journey_networks(network: Optional[dict] = None, *, now: Optional[datetime] = None) -> List[dict]:
    """Read active + last activated previous civil date; never union trip IDs.

    Historical name dating supports already shipped versions without an
    explicit service_date. Unactivated candidates are never journey evidence.
    Individual trip windows must still be checked in each network's clock.
    """
    from mobility.service_clock import _static_service_date
    from mobility.realtime_trip_identity import _service_date
    region = get_active_region()
    now = now or _berlin_now()
    today = _static_service_date(now, region.timezone)
    previous = (datetime.fromisoformat(today) - timedelta(days=1)).date().isoformat()
    if network is None:
        network = await _get_active_network()
    selected = []
    if network and _service_date(network) in (today, previous):
        selected.append(network)
    if any(_service_date(n) == previous for n in selected):
        return selected
    prior = await db.bus_network_versions.find_one(
        {
            "region_id": region.region_id,
            "network_id": region.network_id,
            "activated_at": {"$exists": True, "$ne": None},
            "$or": [
                {"service_date": previous},
                {"service_date": {"$exists": False},
                 "name": {"$regex": rf"\b{previous}\b"}},
            ],
        },
        {"_id": 0},
        sort=[("activated_at", -1), ("imported_at", -1)],
    )
    if prior and _service_date(prior) == previous:
        selected.append(prior)
    return selected


async def _journey_window_evidence():
    """Dated overlap evidence, NOT a merged map/arrivals or RT ingestion API."""
    from mobility.service_clock import service_seconds
    region = get_active_region()
    now = _berlin_now()
    networks = await networks_for_journey_window(now=now)
    out = []
    for network in networks:
        day = _network_service_date(network)
        clock = service_seconds(now, day, region.timezone)
        ids = [str(t["trip_id"]) for r in network.get("routes", [])
               for t in r.get("trips", []) if t.get("trip_id")]
        realtime = await _realtime_delays_for(ids, network=network)
        journeys = []
        seen = set()
        for route in network.get("routes", []):
            for trip in route.get("trips", []):
                tid = str(trip.get("trip_id") or "")
                timeline = _predicted_stop_timeline(route, trip, realtime.get(tid))
                if not tid or not timeline:
                    continue
                start = timeline[0]["predicted_arrival"]
                end = timeline[-1]["predicted_departure"]
                key = (region.region_id, region.network_id, str(network["version_id"]), day, tid)
                if key in seen or not start <= clock <= end:
                    continue
                seen.add(key)
                journeys.append({
                    "journey_key": list(key), "trip_id": tid,
                    "route_number": route.get("route_number"),
                    "scheduled_start_seconds": timeline[0]["scheduled_arrival"],
                    "scheduled_end_seconds": timeline[-1]["scheduled_departure"],
                    "predicted_start_seconds": start, "predicted_end_seconds": end,
                    "realtime_present": tid in realtime,
                })
        out.append({
            "network_version_id": network.get("version_id"), "service_date": day,
            "activated_at": network.get("activated_at"), "now_service_seconds": clock,
            "journeys": journeys,
        })
    return {"observed_at": now.isoformat(), "networks": out,
            "scope": "READ_ONLY_DATED_OVERLAP_EVIDENCE",
            "limits": ["A missing previously activated date cannot be reconstructed here"]}


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


async def _create_network_version(routes: List[dict], name: str, *, service_date: Optional[str] = None) -> dict:
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
    region = get_active_region()
    version = {
        "version_id": generate_id("net"),
        "region_id": region.region_id,
        "network_id": region.network_id,
        "timezone": region.timezone,
        "country": region.country,
        "service_day_start_hour": region.service_day_start_hour,
        "name": name,
        "routes": routes,
        "imported_at": now_utc().isoformat(),
        "active": False,
        "generation_state": "UNPREPARED",
        "generation_report": None,
    }
    if service_date is not None:
        from datetime import date
        version["service_date"] = date.fromisoformat(service_date).isoformat()
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
    """Upload GTFS for the active mobility region/network."""
    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="GTFS file too large (max 50MB)")
    try:
        from utils.gtfs import parse_gtfs_zip

        region = get_active_region()
        payload = parse_gtfs_zip(
            content,
            date,
            agency_regex=region.agency_regex,
            timezone=region.timezone,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"GTFS parse failed: {e}")
    if not payload.get("routes"):
        raise HTTPException(status_code=400, detail="No bus/tram routes found in the feed")
    result = await _create_network_version(
        payload["routes"], payload.get("name") or f"GTFS {date or 'today'}",
        service_date=payload["service_date"],
    )
    result["summary"] = {
        "bus_lines": sum(1 for r in payload["routes"] if r.get("mode") == "bus"),
        "tram_lines": sum(1 for r in payload["routes"] if r.get("mode") == "tram"),
        "trips": sum(len(r.get("trips", [])) for r in payload["routes"]),
        "service_date": payload.get("service_date"),
    }
    return result


async def _activate_network_version(
    version_id: str,
    *,
    require_ready: bool = True,
    force: bool = False,
) -> dict:
    region = get_active_region()
    version = await db.bus_network_versions.find_one(
        {
            "version_id": str(version_id),
            "region_id": region.region_id,
            "network_id": region.network_id,
        },
        {"_id": 0},
    )
    if not version:
        raise HTTPException(
            status_code=404,
            detail="Version not found for active mobility region",
        )

    from mobility.generations import atomic_generations_enabled

    if (
        atomic_generations_enabled()
        and require_ready
        and not force
        and str(version.get("generation_state") or "") != "READY"
    ):
        raise HTTPException(
            status_code=409,
            detail={
                "error": "NETWORK_GENERATION_NOT_READY",
                "version_id": str(version_id),
                "generation_state": version.get("generation_state"),
                "generation_report": version.get("generation_report"),
            },
        )

    await db.bus_network_versions.update_many(
        {
            "region_id": region.region_id,
            "network_id": region.network_id,
        },
        {"$set": {"active": False}},
    )
    await db.bus_network_versions.update_one(
        {
            "version_id": str(version_id),
            "region_id": region.region_id,
            "network_id": region.network_id,
        },
        {"$set": {"active": True, "activated_at": now_utc().isoformat()}},
    )

    from mobility import geometry_cache

    geometry_cache.clear()
    if atomic_generations_enabled():
        await geometry_cache.warm_from_generations(str(version_id))
    else:
        await geometry_cache.warm_from_db(str(version_id))
    geometry_cache.bump_revision()
    try:
        from mobility.motion import clear_motion_cache

        clear_motion_cache()
    except Exception:
        pass

    _broadcast(
        {"type": "network_activated", "version_id": str(version_id)}
    )
    return {
        "active": str(version_id),
        "generation_state": version.get("generation_state"),
    }


@router.post("/network/prepare")
async def prepare_network(
    payload: dict,
    operator: dict = Depends(_require_operator),
):
    version_id = str(payload.get("version_id") or "")
    if not version_id:
        raise HTTPException(status_code=400, detail="version_id is required")
    from mobility.generations import prepare_network_version

    active = await _get_active_network()
    return await prepare_network_version(
        version_id,
        source_version_id=str((active or {}).get("version_id") or "") or None,
        reason="OPERATOR_PREPARE",
    )


@router.post("/network/activate")
async def activate_network(
    payload: dict,
    operator: dict = Depends(_require_operator),
):
    version_id = str(payload.get("version_id") or "")
    if not version_id:
        raise HTTPException(status_code=400, detail="version_id is required")
    return await _activate_network_version(
        version_id,
        require_ready=True,
        force=bool(payload.get("force", False)),
    )


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
    google_key = os.getenv("GOOGLE_API_KEY", "")
    if google_key:
        # Primary: Google Geocoding (reliable street/address search)
        try:
            import httpx as _httpx

            async with _httpx.AsyncClient(timeout=8) as client:
                resp = await client.get(
                    "https://maps.googleapis.com/maps/api/geocode/json",
                    params={
                        "address": f"{q}, Magdeburg",
                        "components": "country:DE",
                        "bounds": "52.00,11.45|52.25,11.80",
                        "key": google_key,
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    for item in (data.get("results") or [])[:6]:
                        loc = (item.get("geometry") or {}).get("location") or {}
                        if loc.get("lat") and loc.get("lng"):
                            first_comp = ((item.get("address_components") or [{}])[0] or {}).get("long_name")
                            streets.append(
                                {
                                    "name": first_comp or item.get("formatted_address", "").split(",")[0].strip(),
                                    "address": item.get("formatted_address", ""),
                                    "lat": loc["lat"],
                                    "lng": loc["lng"],
                                    "type": "google",
                                }
                            )
        except Exception:
            streets = []
    if not streets:
        # Fallback: OSM Nominatim (rate-limited, scoped to the city)
        try:
            import httpx as _httpx

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


_STOPS_CACHE: dict = {"version_id": None, "data": []}


def _physical_stop_groups(network: dict) -> List[dict]:
    """Group raw GTFS platforms into PHYSICAL stops.

    Key: parent_station when the feed provides it, otherwise same name
    within ~80m (stops with the same name far apart never merge). Each
    group carries every platform (id, coords, directions) plus the
    serving modes/routes so the UI shows ONE clear stop.
    """
    groups: dict = {}
    for route in network.get("routes", []):
        mode = route.get("mode") if route.get("mode") in ("bus", "tram") else "bus"
        rn = str(route.get("route_number"))
        directions = {
            str(t.get("headsign") or "")
            for t in (route.get("trips") or [])
            if t.get("headsign")
        }
        for s in route.get("stops", []):
            sid = str(s.get("stop_id") or "")
            if not sid or s.get("lat") is None or s.get("lng") is None:
                continue
            parent = s.get("parent_station")
            key = f"p:{parent}" if parent else f"n:{str(s.get('name')).strip().lower()}"
            if not parent:
                # fallback: attach to an existing same-name group within 80m
                for gkey, g in groups.items():
                    if not gkey.startswith("n:"):
                        continue
                    if str(g.get("name") or "").strip().lower() != str(s.get("name")).strip().lower():
                        continue
                    if _haversine_km(g.get("latitude"), g.get("longitude"), s.get("lat"), s.get("lng")) < 0.08:
                        key = gkey
                        break
            g = groups.get(key)
            if not g:
                g = {
                    "stop_id": f"physical:{key[2:]}",
                    "stop_ids": [],
                    "platforms": {},
                    "name": str(s.get("name") or "").strip(),
                    "latitude": s.get("lat"),
                    "longitude": s.get("lng"),
                    "modes": set(),
                    "routes": {},
                }
                groups[key] = g
            if sid not in g["stop_ids"]:
                g["stop_ids"].append(sid)
            g["modes"].add(mode)
            plat = g["platforms"].setdefault(
                sid,
                {
                    "platform_id": sid,
                    "latitude": s.get("lat"),
                    "longitude": s.get("lng"),
                    "name": str(s.get("name") or "").strip(),
                    "platform_code": s.get("platform_code"),
                    "directions": set(),
                },
            )
            plat["directions"] |= directions
            entry = g["routes"].setdefault(rn, {"route_number": rn, "mode": mode, "directions": set()})
            entry["directions"] |= directions
    out = []
    for g in groups.values():
        out.append(
            {
                "stop_id": g["stop_id"],
                "stop_ids": g["stop_ids"],
                "platforms": [
                    {
                        "platform_id": p["platform_id"],
                        "latitude": p["latitude"],
                        "longitude": p["longitude"],
                        "name": p["name"],
                        "platform_code": p.get("platform_code"),
                        "directions": sorted(d for d in p["directions"] if d),
                    }
                    for p in g["platforms"].values()
                ],
                "name": g["name"],
                "latitude": g["latitude"],
                "longitude": g["longitude"],
                "modes": sorted(g["modes"]),
                "routes": [
                    {
                        "route_number": r["route_number"],
                        "mode": r["mode"],
                        "directions": sorted(d for d in r["directions"] if d),
                    }
                    for r in sorted(g["routes"].values(), key=lambda x: (x["mode"] != "tram", x["route_number"]))
                ],
            }
        )
    return out


async def _physical_stop_ids(network: dict, stop_id: str) -> set:
    """All platform ids belonging to the same physical stop as `stop_id`."""
    groups = await _physical_stops_for(network)
    if not groups:
        return {str(stop_id)}
    for g in groups:
        if str(stop_id) in {str(x) for x in g["stop_ids"]} or str(g["stop_id"]) == str(stop_id):
            return {str(x) for x in g["stop_ids"]}
    return {str(stop_id)}


async def _physical_stops_for(network: dict) -> List[dict]:
    version = network.get("version_id")
    if _STOPS_CACHE.get("version_id") == version:
        return _STOPS_CACHE["data"]
    data = _physical_stop_groups(network)
    _STOPS_CACHE["version_id"] = version
    _STOPS_CACHE["data"] = data
    return data


@router.get("/stops")
async def transit_stops(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    """Physical stops of the active network (platforms grouped by
    parent_station or same name + proximity), with modes and routes."""
    network = await _get_active_network()
    if not network:
        return []
    return await _physical_stops_for(network)


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
    results = []
    for network in await networks_for_journey_window():
        results.extend(await _buses_serving_stop(network, stop_id, lat, lng))
    results.sort(key=lambda x: x["eta_minutes"])
    return results


async def _buses_serving_stop(network: dict, stop_id: str, lat=None, lng=None):
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
        for v in await _all_active_vehicles(network=network)
        if v.get("mode") in ("bus", "tram")
        and str(v.get("route_number")) in route_numbers
    ]

    now_sec = _now_service_seconds(_network_service_date(network))
    all_trip_ids = [
        str(t.get("trip_id"))
        for r in serving_routes
        for t in r.get("trips", [])
        if t.get("trip_id")
    ]
    realtime_by_trip = await _realtime_delays_for(all_trip_ids, network=network)
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

        # All platforms of the requested PHYSICAL stop - a trip serves it
        # when its timeline contains ANY of them (arrival/departure ids).
        target_stop_ids = await _physical_stop_ids(network, stop_id)

        target = next(
            (
                e for e in timeline
                if str(e.get("stop_id")) in target_stop_ids
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
                "network_version_id": network.get("version_id"),
                "service_date": _network_service_date(network),
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

    network = next((n for n in await networks_for_journey_window()
                    if _vehicle_in_network(vehicle, n)), None)
    route = next((r for r in (network or {}).get("routes", [])
                  if str(r.get("route_number")) == str(vehicle.get("route_number"))), None)
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    now_sec = _now_service_seconds(_network_service_date(network))
    trip_ids = [
        str(t.get("trip_id"))
        for t in route.get("trips", [])
        if t.get("trip_id")
    ]
    realtime_by_trip = await _realtime_delays_for(trip_ids, network=network)
    trip = _active_trip_for(route, vehicle, now_sec, realtime_by_trip)
    if not trip:
        raise HTTPException(status_code=404, detail="Active trip not found")

    trip_id = str(trip.get("trip_id") or "")
    realtime = realtime_by_trip.get(trip_id)
    timeline = _timeline_for_vehicle(route, trip, realtime, vehicle)
    if not timeline:
        raise HTTPException(status_code=404, detail="Trip cancelled or unavailable")

    revision = vehicle.get("_motion_plan_revision") if vehicle.get("estimated") else None
    from mobility.timing_evidence import timing_evidence
    physical_next_index = vehicle.get("_motion_next_timeline_index") if revision else None
    stops_out = []
    for index, entry in enumerate(timeline):
        predicted = int(entry["predicted_arrival"])
        relationship = entry.get("relationship") or "SCHEDULED"
        stops_out.append(
            {
                "stop_id": entry.get("stop_id"),
                "name": (entry.get("stop") or {}).get("name"),
                "scheduled": _fmt_service_time(int(entry["scheduled"])),
                "delay_seconds": int(entry.get("delay_seconds") or 0),
                "predicted": _fmt_service_time(predicted),
                "passed": index < physical_next_index if type(physical_next_index) is int
                          else int(entry["predicted_departure"]) < now_sec,
                "predicted_departure": _fmt_service_time(int(entry["predicted_departure"])),
                "source_predicted": _fmt_service_time(int(entry.get("source_predicted_arrival", entry["predicted_arrival"]))),
                "prediction_basis": entry.get("prediction_basis", "SOURCE_TIMELINE"),
                "timing_evidence": timing_evidence(entry),
                "provider_predicted": _fmt_service_time(entry["provider_predicted_arrival_s"]) if entry.get("provider_predicted_arrival_s") is not None else None,
                "passed_basis": "MODEL_PROGRESS" if vehicle.get("estimated") else "GPS_POSITION" if physical_next_index is not None else "TIME_PREDICTION",
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
        "network_version_id": network.get("version_id"),
        "service_date": _network_service_date(network),
        "route_number": vehicle.get("route_number"),
        "route_direction": vehicle.get("route_direction") or trip.get("headsign"),
        "mode": vehicle.get("mode"),
        "delay_minutes": round(int(next_entry.get("delay_seconds") or 0) / 60),
        "position_source": vehicle.get("position_source", "VEHICLE_GPS"),
        "estimated": bool(vehicle.get("estimated")),
        "motion_plan_revision": revision,
        "next_timeline_index": physical_next_index,
        "timing_evidence": vehicle.get("timing_evidence") if vehicle.get("estimated") else None,
        "estimate_revision": vehicle.get("estimate_revision") if vehicle.get("estimated") else None,
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
    with transfers and walking (Google Maps style, minimal walking + time).

    Runs in a worker thread: the trip-graph search is CPU-heavy and must
    NEVER block the async event loop (a slow plan used to freeze every
    other request and time out the edge gateway).

    The search uses the SAME predicted timeline as arrivals/vehicles
    (GTFS-RT delays + canceled trips), not a separate static snapshot."""
    itineraries = []
    for network in await networks_for_journey_window():
        result = await _plan_dated_network(network, from_lat, from_lng, to_lat, to_lng)
        for itinerary in result["itineraries"]:
            itinerary["network_version_id"] = network.get("version_id")
            itinerary["service_date"] = _network_service_date(network)
            itineraries.append(itinerary)
    return {"itineraries": itineraries}


async def _plan_dated_network(network, from_lat, from_lng, to_lat, to_lng):
    trip_ids = [
        str(t.get("trip_id"))
        for route in network.get("routes", [])
        for t in route.get("trips", [])
        if t.get("trip_id")
    ]
    delays = await _realtime_delays_for(trip_ids, network=network)
    try:
        from mobility.overrides import canceled_trip_ids, skipped_stop_ids

        canceled = await canceled_trip_ids()
        skipped = await skipped_stop_ids()
    except Exception:
        canceled = set()
        skipped = {}
    active = await _all_active_vehicles(network=network)
    by_trip = {str(v.get("trip_id")): v for v in active if v.get("trip_id")}
    result = await asyncio.to_thread(
        _plan_core, network, from_lat, from_lng, to_lat, to_lng, delays, canceled, by_trip, skipped
    )
    # Exact dated identity and ordered platform occurrence, never display names.
    from mobility.domain import NETWORK_ID
    for itinerary in result.get("itineraries", []):
        for leg in itinerary.get("legs", []):
            if leg.get("type") != "ride":
                continue
            match = next(((r, t) for r in network.get("routes", [])
                          for t in r.get("trips", [])
                          if str(t.get("trip_id")) == str(leg.get("trip_id"))), None)
            if not match:
                continue
            route, trip = match
            timeline = _predicted_stop_timeline(route, trip, delays.get(str(trip.get("trip_id"))))
            path = await _trip_path_geometry(route, trip, timeline, network=network)
            leg["trip_instance_id"] = f"{NETWORK_ID}:{network.get('version_id')}:{_network_service_date(network)}:{trip.get('trip_id')}"
            if path and path.get("geometry_source") != "GTFS_POSITION_FALLBACK" and path.get("points"):
                from mobility.approach import path_fingerprint
                leg["board_geometry_fingerprint"] = path_fingerprint(path["points"])
                leg["pattern_id"] = path.get("pattern_id")
                index = leg.get("board_timeline_index")
                progress = path.get("stop_progress") or []
                if (type(index) is int and 0 <= index < len(progress) and index < len(timeline)
                        and str(timeline[index].get("stop_id")) == leg.get("board_stop_id")
                        and timeline[index].get("relationship") != "SKIPPED"):
                    leg["board_progress_m"] = progress[index]
    return result


def _plan_core(
    network: dict,
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
    delays: Optional[dict] = None,
    canceled: Optional[set] = None,
    active_by_trip: Optional[dict] = None,
    skipped: Optional[dict] = None,
) -> dict:
    now_sec = _now_service_seconds(_network_service_date(network))
    delays = delays or {}
    canceled = canceled or set()

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

    # Trips as ordered segments; also stop -> sorted departures for boarding.
    # Times are PREDICTED (scheduled + GTFS-RT delays) - the same timeline
    # arrivals and vehicle positions use. Canceled trips are excluded.
    trips = []
    for route in network.get("routes", []):
        mode = route.get("mode") if route.get("mode") in ("bus", "tram") else "bus"
        for trip in route.get("trips", []):
            tid = str(trip.get("trip_id") or "")
            if tid in canceled:
                continue
            rt = delays.get(tid) or {}
            seq = []
            timeline = _timeline_for_vehicle(route, trip, rt, (active_by_trip or {}).get(tid))
            for index, entry in enumerate(timeline):
                sid = entry.get("stop_id")
                if (sid in stops and entry.get("relationship") != "SKIPPED"
                        and str(sid) not in (skipped or {}).get(tid, set())):
                    seq.append((sid, entry["predicted_arrival"], entry["predicted_departure"], index))
            if len(seq) < 2:
                continue
            segments = []
            for i in range(len(seq) - 1):
                segments.append((seq[i][0], seq[i][2], seq[i + 1][0], seq[i + 1][1]))
            trips.append(
                {
                    "route_number": route.get("route_number"),
                    "mode": mode,
                    "direction": trip.get("headsign") or route.get("name") or "",
                    "trip_id": trip.get("trip_id"),
                    "segments": segments,
                    "timeline_indices": [e[3] for e in seq],
                }
            )

    boardings = {}
    # Time-window pruning: only trips that can possibly serve a journey in
    # the next 3 hours participate - the full-day graph made the search
    # explode and block the server.
    horizon = now_sec + 3 * 3600
    for ti, trip in enumerate(trips):
        first_dep = trip["segments"][0][1]
        last_arr = trip["segments"][-1][3]
        if last_arr < now_sec - 600 or first_dep > horizon:
            continue
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
    pops = 0
    while heap and pops < 30000:
        pops += 1
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
                        "board_timeline_index": trip["timeline_indices"][pos],
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

    # Trip-specific CANONICAL geometry lookup for ride polylines - the
    # exact Perix line the map draws, sliced between the two stops. NO
    # GTFS-shape authority and NO straight stop-to-stop fallback: without
    # a canonical line the leg simply carries no polyline.
    routes_by_num = {
        str(route.get("route_number")): route
        for route in network.get("routes", [])
    }

    def _canonical_slice(route_num, trip_id, from_stop_id, to_stop_id):
        route = routes_by_num.get(str(route_num))
        if not route:
            return None
        trip = next(
            (t for t in route.get("trips", []) if str(t.get("trip_id")) == str(trip_id)),
            None,
        )
        if not trip:
            return None
        try:
            from mobility.domain import _pattern_id as _dom_pattern_id, _pattern_key as _dom_pattern_key
            from mobility.geometry_cache import get_cached

            pat_id = _dom_pattern_id(str(route.get("route_number")), _dom_pattern_key(trip))
            sh = get_cached(pat_id, str(network.get("version_id") or ""))
        except Exception:
            return None
        if not sh or len(sh) < 2:
            return None
        a = next((s for s in route.get("stops", []) if str(s.get("stop_id")) == str(from_stop_id)), None)
        b = next((s for s in route.get("stops", []) if str(s.get("stop_id")) == str(to_stop_id)), None)
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
            shape_slice = _canonical_slice(
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
                "board_stop_id": str(payload["board"]),
                "alight_stop_id": str(payload["alight"]),
                "board_timeline_index": payload["board_timeline_index"],
                "trip_id": str(payload["trip_id"]),
                "alight": stops.get(payload["alight"], {}).get("name", ""),
                "depart": _fmt_service_time(payload["depart"]),
                "arrive": _fmt_service_time(payload["arrive"]),
                "minutes": round((payload["arrive"] - payload["depart"]) / 60),
                "points": shape_slice or [],
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
