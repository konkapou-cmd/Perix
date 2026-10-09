"""Unified Telemetry (Mobility Core V2 - Phase 4).

ANY GPS source - dedicated hardware boxes, driver phones, external APIs -
sends the exact same normalized observation to POST /mobility/v2/telemetry
with a device credential. Telemetry is independent of driver sessions and
mode: bus, tram or taxi. Raw observations are append-only; the best-known
state is maintained in mobility_vehicle_state and mirrored to the V1
mobility_live collection so the existing map shows LIVE GPS immediately.
"""
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request

from database import db
from models.user import UserPublic
from routes.dependencies import get_current_user_optional

router = APIRouter(prefix="/mobility/v2", tags=["MobilityTelemetry"])

VALID_SOURCES = ("PERIX_GPS", "PHONE_GPS", "EXTERNAL_API")
MAX_OBSERVATION_AGE_SECONDS = 120


def _hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def _utc_now_iso() -> str:
    return datetime.now(ZoneInfo("UTC")).isoformat()


async def _require_operator_user(current_user: Optional[UserPublic]) -> dict:
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    from routes.mobility import _require_operator

    return await _require_operator(current_user)


async def _authenticate_device(request: Request, body: dict) -> dict:
    device_id = str(request.headers.get("X-Device-Id") or body.get("device_id") or "")
    secret = str(request.headers.get("X-Device-Secret") or body.get("device_secret") or "")
    if not device_id or not secret:
        raise HTTPException(status_code=401, detail="Device credentials required")
    device = await db.mobility_devices.find_one({"device_id": device_id})
    if not device or not device.get("active", True):
        raise HTTPException(status_code=401, detail="Unknown or inactive device")
    if _hash_secret(secret) != device.get("secret_hash"):
        raise HTTPException(status_code=401, detail="Invalid device secret")
    return device


@router.post("/telemetry")
async def ingest_telemetry(request: Request, payload: dict = None):
    """Normalized GPS observation from any device. Auth: X-Device-Id +
    X-Device-Secret headers (or device_id/device_secret in the body)."""
    body = payload or {}
    device = await _authenticate_device(request, body)

    vehicle_id = str(body.get("vehicle_id") or device.get("vehicle_id") or "")
    if not vehicle_id:
        raise HTTPException(status_code=400, detail="vehicle_id required")
    if device.get("vehicle_id") and str(device.get("vehicle_id")) != vehicle_id:
        raise HTTPException(status_code=403, detail="Device is not assigned to this vehicle")
    vehicle = await db.mobility_vehicles.find_one({"vehicle_id": vehicle_id}, {"_id": 0})
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    lat = body.get("latitude")
    lng = body.get("longitude")
    if lat is None or lng is None:
        raise HTTPException(status_code=400, detail="latitude/longitude required")
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid coordinates")
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise HTTPException(status_code=400, detail="Coordinates out of range")

    observed_at = body.get("observed_at") or _utc_now_iso()
    try:
        observed_dt = datetime.fromisoformat(str(observed_at))
        if observed_dt.tzinfo is None:
            observed_dt = observed_dt.replace(tzinfo=ZoneInfo("UTC"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid observed_at")
    age = (datetime.now(ZoneInfo("UTC")) - observed_dt).total_seconds()
    if age < -60 or age > MAX_OBSERVATION_AGE_SECONDS:
        raise HTTPException(status_code=400, detail="Observation too old (max 120s)")

    source = str(body.get("source") or device.get("source_type") or "PERIX_GPS")
    if source not in VALID_SOURCES:
        source = str(device.get("source_type") or "PERIX_GPS")

    # Map matching (Phase 5): bus/tram positions snap to their line's
    # geometry (with heading/tolerance guards); taxis stay raw. When the
    # vehicle is confidently on an active trip, that trip is assigned so
    # the estimator stops drawing a duplicate for the same physical bus.
    matched_lat, matched_lng = lat, lng
    snapped = False
    snapped_distance_m = None
    display_heading = body.get("heading")
    trip_id = None
    mode = vehicle.get("mode")
    if mode in ("bus", "tram") and vehicle.get("route_number"):
        try:
            from mobility.map_match import assign_trip, snap_to_geometry
            from routes.mobility import (
                _get_active_network,
                _network_route,
                _now_service_seconds,
                _realtime_delays_for,
            )

            route = await _network_route(str(vehicle.get("route_number")))
            if route:
                network = await _get_active_network()
                trip_ids = [str(t.get("trip_id")) for t in route.get("trips", []) if t.get("trip_id")]
                delays = await _realtime_delays_for(trip_ids)
                # Canonical pattern geometry ONLY (the exact line the map
                # draws). No route.shape, no Google fallback for transit.
                trip = assign_trip(route, vehicle, lat, lng, _now_service_seconds(), delays)
                if trip is not None:
                    trip_id = str(trip.get("trip_id"))
                    from mobility.domain import _pattern_id as _dom_pattern_id, _pattern_key as _dom_pattern_key
                    from mobility.geometry_cache import get_cached

                    pat_id = _dom_pattern_id(str(route.get("route_number")), _dom_pattern_key(trip))
                    geometry = get_cached(pat_id) or []
                    snap = snap_to_geometry(lat, lng, body.get("heading"), body.get("accuracy_m"), geometry)
                    if snap.get("snapped"):
                        matched_lat, matched_lng = snap["latitude"], snap["longitude"]
                        snapped = True
                        snapped_distance_m = snap.get("distance_m")
                        # Display heading = the road/rail bearing the vehicle
                        # is riding, never the raw GPS compass.
                        if snap.get("bearing") is not None:
                            display_heading = snap["bearing"]
        except Exception as e:
            print(f"[mobility] telemetry map-match failed: {type(e).__name__}: {e}", flush=True)

    # Second opinion: Google Roads snap-to-road - TAXI ONLY. Transit GPS
    # lives 100% on the Perix graph (canonical pattern or hidden).
    if not snapped and mode == "taxi":
        try:
            from mobility.google_roads import snap_to_road

            gpos = await snap_to_road(vehicle_id, lat, lng)
            if gpos:
                matched_lat, matched_lng = gpos["latitude"], gpos["longitude"]
                snapped = True
                snapped_distance_m = None
        except Exception as e:
            print(f"[mobility] google snap failed: {type(e).__name__}: {e}", flush=True)

    # Strict rule: transit vehicles are shown ONLY on their road/rail. If
    # nothing snapped, keep the last valid position instead of drifting a
    # raw GPS fix across buildings. No previous valid position -> hide
    # (the state is not updated, so no off-road marker ever appears).
    if mode in ("bus", "tram") and not snapped:
        prev = await db.mobility_vehicle_state.find_one({"vehicle_id": vehicle_id})
        if prev and prev.get("latitude") is not None and prev.get("longitude") is not None:
            matched_lat, matched_lng = prev["latitude"], prev["longitude"]
            display_heading = prev.get("heading")
            trip_id = trip_id or prev.get("trip_id")
            snapped = bool(prev.get("snapped"))
        else:
            # Hide: record the raw observation for diagnostics only.
            obs_id_hidden = f"obs_{uuid.uuid4().hex[:12]}"
            await db.mobility_position_observations.insert_one(
                {
                    "observation_id": obs_id_hidden,
                    "device_id": device.get("device_id"),
                    "vehicle_id": vehicle_id,
                    "observed_at": observed_dt.isoformat(),
                    "received_at": _utc_now_iso(),
                    "latitude": lat,
                    "longitude": lng,
                    "accuracy_m": body.get("accuracy_m"),
                    "heading": body.get("heading"),
                    "source": source,
                    "snapped": False,
                    "hidden": True,
                }
            )
            return {"ok": True, "observation_id": obs_id_hidden, "source": source, "snapped": False, "hidden": True}

    obs_id = f"obs_{uuid.uuid4().hex[:12]}"
    obs = {
        "observation_id": obs_id,
        "device_id": device.get("device_id"),
        "vehicle_id": vehicle_id,
        "business_id": vehicle.get("business_id"),
        "observed_at": observed_dt.isoformat(),
        "received_at": _utc_now_iso(),
        "latitude": lat,
        "longitude": lng,
        "accuracy_m": body.get("accuracy_m"),
        "speed_mps": body.get("speed_mps"),
        "heading": body.get("heading"),
        "source": source,
        "matched_latitude": matched_lat if snapped else None,
        "matched_longitude": matched_lng if snapped else None,
        "snapped": snapped,
        "snapped_distance_m": snapped_distance_m,
        "trip_id": trip_id,
    }
    await db.mobility_position_observations.insert_one(obs)

    # Best-known state per vehicle
    await db.mobility_vehicle_state.replace_one(
        {"vehicle_id": vehicle_id},
        {
            "vehicle_id": vehicle_id,
            "latitude": matched_lat,
            "longitude": matched_lng,
            "raw_latitude": lat,
            "raw_longitude": lng,
            "snapped": snapped,
            "heading": display_heading,
            "speed_mps": body.get("speed_mps"),
            "accuracy_m": body.get("accuracy_m"),
            "source": source,
            "quality": "LIVE",
            "trip_id": trip_id,
            "observed_at": observed_dt.isoformat(),
            "updated_at": _utc_now_iso(),
        },
        upsert=True,
    )

    # Mirror to V1 live state so the current map shows the vehicle right away
    from routes.mobility import now_utc

    live = {
        "vehicle_id": vehicle_id,
        "business_id": vehicle.get("business_id"),
        "mode": vehicle.get("mode"),
        "fleet_number": vehicle.get("fleet_number", ""),
        "name": vehicle.get("name") or vehicle.get("fleet_number", ""),
        "registration": vehicle.get("registration"),
        "route_number": vehicle.get("route_number"),
        "route_direction": vehicle.get("route_direction"),
        "latitude": matched_lat,
        "longitude": matched_lng,
        "heading": display_heading,
        "speed": body.get("speed_mps"),
        "accuracy_m": body.get("accuracy_m"),
        "status": "active",
        "updated_at": now_utc().isoformat(),
        "position_source": source,
        "trip_id": trip_id,
        "snapped": snapped,
        "estimated": False,
    }
    await db.mobility_live.replace_one({"vehicle_id": vehicle_id}, live, upsert=True)
    return {"ok": True, "observation_id": obs_id, "source": source, "snapped": snapped, "trip_id": trip_id}


# ---------------------------------------------------------------------------
# Device registry (operator endpoints)
# ---------------------------------------------------------------------------


@router.post("/devices")
async def register_device(payload: dict, current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    """Register a GPS device (hardware box or phone). The secret is
    returned ONCE - store it on the device."""
    operator = await _require_operator_user(current_user)
    source_type = str(payload.get("source_type") or "PERIX_GPS")
    if source_type not in VALID_SOURCES:
        raise HTTPException(status_code=400, detail=f"source_type must be one of {VALID_SOURCES}")
    device_id = f"dev_{uuid.uuid4().hex[:12]}"
    secret = secrets.token_urlsafe(24)
    from routes.mobility import now_utc

    doc = {
        "device_id": device_id,
        "secret_hash": _hash_secret(secret),
        "name": str(payload.get("name") or "").strip(),
        "source_type": source_type,
        "vehicle_id": str(payload.get("vehicle_id") or "") or None,
        "business_id": operator.get("business_id"),
        "active": True,
        "created_at": now_utc().isoformat(),
    }
    await db.mobility_devices.insert_one(doc)
    return {
        "device_id": device_id,
        "secret": secret,
        "name": doc["name"],
        "source_type": source_type,
        "vehicle_id": doc["vehicle_id"],
    }


@router.get("/devices")
async def list_devices(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    operator = await _require_operator_user(current_user)
    docs = await db.mobility_devices.find(
        {"business_id": operator.get("business_id")}, {"_id": 0, "secret_hash": 0}
    ).to_list(500)
    return docs


@router.post("/devices/{device_id}/assign")
async def assign_device(device_id: str, payload: dict, current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    operator = await _require_operator_user(current_user)
    device = await db.mobility_devices.find_one({"device_id": device_id})
    if not device or device.get("business_id") != operator.get("business_id"):
        raise HTTPException(status_code=404, detail="Device not found")
    vehicle_id = str(payload.get("vehicle_id") or "")
    if vehicle_id:
        vehicle = await db.mobility_vehicles.find_one({"vehicle_id": vehicle_id})
        if not vehicle or vehicle.get("business_id") != operator.get("business_id"):
            raise HTTPException(status_code=403, detail="Vehicle not authorized")
    await db.mobility_devices.update_one(
        {"device_id": device_id}, {"$set": {"vehicle_id": vehicle_id or None}}
    )
    return {"ok": True, "device_id": device_id, "vehicle_id": vehicle_id or None}


@router.delete("/devices/{device_id}")
async def delete_device(device_id: str, current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    operator = await _require_operator_user(current_user)
    device = await db.mobility_devices.find_one({"device_id": device_id})
    if not device or device.get("business_id") != operator.get("business_id"):
        raise HTTPException(status_code=404, detail="Device not found")
    await db.mobility_devices.delete_one({"device_id": device_id})
    return {"ok": True}
