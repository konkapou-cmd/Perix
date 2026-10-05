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
    }
    await db.mobility_position_observations.insert_one(obs)

    # Best-known state per vehicle
    await db.mobility_vehicle_state.replace_one(
        {"vehicle_id": vehicle_id},
        {
            "vehicle_id": vehicle_id,
            "latitude": lat,
            "longitude": lng,
            "heading": body.get("heading"),
            "speed_mps": body.get("speed_mps"),
            "accuracy_m": body.get("accuracy_m"),
            "source": source,
            "quality": "LIVE",
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
        "latitude": lat,
        "longitude": lng,
        "heading": body.get("heading"),
        "speed": body.get("speed_mps"),
        "accuracy_m": body.get("accuracy_m"),
        "status": "active",
        "updated_at": now_utc().isoformat(),
        "position_source": source,
        "estimated": False,
    }
    await db.mobility_live.replace_one({"vehicle_id": vehicle_id}, live, upsert=True)
    return {"ok": True, "observation_id": obs_id, "source": source}


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
