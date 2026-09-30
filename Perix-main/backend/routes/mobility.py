"""Mobility routes: live vehicles (buses/taxis), driver-code sessions and
vehicle management for operators. Drivers never need Perix accounts."""
import asyncio
import logging
import random
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from database import db
from models.user import UserPublic
from models.mobility import (
    VehicleCreate,
    DriverStartRequest,
    DriverLocationUpdate,
    DriverStatusUpdate,
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
    live["status"] = (
        await db.mobility_live.find_one({"vehicle_id": vehicle["vehicle_id"]}) or {}
    ).get("status", "good" if vehicle["mode"] == "bus" else "available")
    live["updated_at"] = now_utc().isoformat()
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
