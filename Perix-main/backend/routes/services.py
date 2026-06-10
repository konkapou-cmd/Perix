"""Services, Time Slots, and Bookings routes."""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
import logging

from database import db
from models.user import UserPublic
from models.service import (
    ServiceCreate, ServiceUpdate, ServiceResponse,
    TimeSlotCreate, TimeSlotResponse, BlockDateRange,
    BookingCreate, BookingResponse,
)
from utils.helpers import generate_id, now_utc
from routes.dependencies import get_current_user
from routes.businesses import is_subscription_active

router = APIRouter(prefix="/services", tags=["Services"])

# ─── Services CRUD ───

@router.post("", response_model=ServiceResponse)
async def create_service(payload: ServiceCreate, current_user: UserPublic = Depends(get_current_user)):
    business = await db.businesses.find_one({"business_id": payload.business_id})
    if not business or business["owner_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    if not is_subscription_active(business):
        raise HTTPException(status_code=403, detail="Active subscription required")

    doc = {
        **payload.model_dump(),
        "service_id": generate_id("svc"),
        "is_active": True,
        "created_at": now_utc(),
    }
    await db.services.insert_one(doc)
    return ServiceResponse(**doc)


@router.get("", response_model=List[ServiceResponse])
async def list_services(business_id: Optional[str] = None, type: Optional[str] = None):
    query = {"is_active": True}
    if business_id:
        query["business_id"] = business_id
    if type:
        query["type"] = type
    services = await db.services.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [ServiceResponse(**s) for s in services]


@router.put("/{service_id}", response_model=ServiceResponse)
async def update_service(service_id: str, payload: ServiceUpdate, current_user: UserPublic = Depends(get_current_user)):
    service = await db.services.find_one({"service_id": service_id})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    business = await db.businesses.find_one({"business_id": service["business_id"]})
    if not business or business["owner_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    if not is_subscription_active(business):
        raise HTTPException(status_code=403, detail="Active subscription required")

    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if update_data:
        await db.services.update_one({"service_id": service_id}, {"$set": update_data})
        service.update(update_data)
    return ServiceResponse(**service)


@router.delete("/{service_id}")
async def delete_service(service_id: str, current_user: UserPublic = Depends(get_current_user)):
    service = await db.services.find_one({"service_id": service_id})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    business = await db.businesses.find_one({"business_id": service["business_id"]})
    if not business or business["owner_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    await db.services.update_one({"service_id": service_id}, {"$set": {"is_active": False}})
    # Cancel pending bookings for this service
    await db.bookings.update_many(
        {"service_id": service_id, "status": "pending"},
        {"$set": {"status": "cancelled"}},
    )
    return {"success": True}


# ─── Time Slots ───

@router.get("/{service_id}/slots")
async def list_slots(service_id: str):
    slots = await db.service_slots.find(
        {"service_id": service_id}, {"_id": 0}
    ).sort([("date", 1), ("start_time", 1)]).to_list(500)
    return [TimeSlotResponse(**s) for s in slots]


@router.post("/{service_id}/slots", response_model=TimeSlotResponse)
async def create_slot(service_id: str, payload: TimeSlotCreate, current_user: UserPublic = Depends(get_current_user)):
    if payload.service_id != service_id:
        raise HTTPException(status_code=400, detail="service_id mismatch")
    service = await db.services.find_one({"service_id": service_id})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    business = await db.businesses.find_one({"business_id": service["business_id"]})
    if not business or business["owner_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    doc = {
        **payload.model_dump(),
        "slot_id": generate_id("slt"),
        "is_blocked": False,
        "is_booked": False,
    }
    await db.service_slots.insert_one(doc)
    return TimeSlotResponse(**doc)


@router.delete("/{service_id}/slots/{slot_id}")
async def delete_slot(service_id: str, slot_id: str, current_user: UserPublic = Depends(get_current_user)):
    service = await db.services.find_one({"service_id": service_id})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    business = await db.businesses.find_one({"business_id": service["business_id"]})
    if not business or business["owner_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    await db.service_slots.delete_one({"slot_id": slot_id})
    # Cancel unconfirmed bookings on this slot
    await db.bookings.update_many(
        {"slot_id": slot_id, "status": "pending"},
        {"$set": {"status": "cancelled"}},
    )
    return {"success": True}


@router.post("/{service_id}/slots/block")
async def block_slots(service_id: str, payload: BlockDateRange, current_user: UserPublic = Depends(get_current_user)):
    service = await db.services.find_one({"service_id": service_id})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    business = await db.businesses.find_one({"business_id": service["business_id"]})
    if not business or business["owner_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    count = await db.service_slots.count_documents({
        "service_id": service_id,
        "date": {"$gte": payload.from_date, "$lte": payload.to_date},
    })
    await db.service_slots.update_many(
        {"service_id": service_id, "date": {"$gte": payload.from_date, "$lte": payload.to_date}},
        {"$set": {"is_blocked": True}},
    )
    return {"success": True, "blocked_count": count}


# ─── Bookings ───

@router.post("/bookings", response_model=BookingResponse)
async def create_booking(payload: BookingCreate, current_user: UserPublic = Depends(get_current_user)):
    service = await db.services.find_one({"service_id": payload.service_id, "is_active": True})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    business_id = service["business_id"]

    # Check slot availability if slot_id provided
    if payload.slot_id:
        slot = await db.service_slots.find_one({"slot_id": payload.slot_id})
        if not slot or slot["is_booked"] or slot["is_blocked"]:
            raise HTTPException(status_code=400, detail="Slot not available")

    doc = {
        **payload.model_dump(),
        "booking_id": generate_id("bkg"),
        "business_id": business_id,
        "client_id": current_user.user_id,
        "status": "pending",
        "created_at": now_utc(),
    }
    await db.bookings.insert_one(doc)

    # Mark slot as booked
    if payload.slot_id:
        await db.service_slots.update_one({"slot_id": payload.slot_id}, {"$set": {"is_booked": True}})

    booking = doc.copy()
    booking["service_name"] = service.get("name")
    biz = await db.businesses.find_one({"business_id": business_id})
    booking["business_name"] = biz["name"] if biz else None
    return BookingResponse(**booking)


@router.get("/bookings", response_model=List[BookingResponse])
async def list_bookings(business_id: Optional[str] = None, status: Optional[str] = None, current_user: UserPublic = Depends(get_current_user)):
    query = {}
    if business_id:
        business = await db.businesses.find_one({"business_id": business_id})
        if not business or business["owner_id"] != current_user.user_id:
            raise HTTPException(status_code=403, detail="Not authorized")
        query["business_id"] = business_id
    else:
        query["client_id"] = current_user.user_id
    if status:
        query["status"] = status

    bookings = await db.bookings.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    result = []
    for b in bookings:
        service = await db.services.find_one({"service_id": b["service_id"]}, {"_id": 0, "name": 1})
        business = await db.businesses.find_one({"business_id": b["business_id"]}, {"_id": 0, "name": 1})
        b["service_name"] = service["name"] if service else None
        b["business_name"] = business["name"] if business else None
        result.append(BookingResponse(**b))
    return result


@router.put("/bookings/{booking_id}/confirm", response_model=BookingResponse)
async def confirm_booking(booking_id: str, current_user: UserPublic = Depends(get_current_user)):
    booking = await db.bookings.find_one({"booking_id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    business = await db.businesses.find_one({"business_id": booking["business_id"]})
    if not business or business["owner_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    if booking["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Booking is already {booking['status']}")

    await db.bookings.update_one({"booking_id": booking_id}, {"$set": {"status": "confirmed"}})
    booking["status"] = "confirmed"
    service = await db.services.find_one({"service_id": booking["service_id"]}, {"_id": 0, "name": 1})
    booking["service_name"] = service["name"] if service else None
    booking["business_name"] = business.get("name")
    return BookingResponse(**booking)


@router.put("/bookings/{booking_id}/cancel", response_model=BookingResponse)
async def cancel_booking(booking_id: str, current_user: UserPublic = Depends(get_current_user)):
    booking = await db.bookings.find_one({"booking_id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    is_owner = False
    if booking["client_id"] == current_user.user_id:
        is_owner = False
    else:
        business = await db.businesses.find_one({"business_id": booking["business_id"]})
        is_owner = business and business["owner_id"] == current_user.user_id

    if not is_owner and booking["client_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    await db.bookings.update_one({"booking_id": booking_id}, {"$set": {"status": "cancelled"}})
    # Free the slot
    if booking.get("slot_id"):
        await db.service_slots.update_one({"slot_id": booking["slot_id"]}, {"$set": {"is_booked": False}})

    booking["status"] = "cancelled"
    service = await db.services.find_one({"service_id": booking["service_id"]}, {"_id": 0, "name": 1})
    booking["service_name"] = service["name"] if service else None
    biz = await db.businesses.find_one({"business_id": booking["business_id"]})
    booking["business_name"] = biz["name"] if biz else None
    return BookingResponse(**booking)


@router.put("/bookings/{booking_id}/complete", response_model=BookingResponse)
async def complete_booking(booking_id: str, current_user: UserPublic = Depends(get_current_user)):
    booking = await db.bookings.find_one({"booking_id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    business = await db.businesses.find_one({"business_id": booking["business_id"]})
    if not business or business["owner_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    if booking["status"] != "confirmed":
        raise HTTPException(status_code=400, detail="Only confirmed bookings can be completed")

    await db.bookings.update_one({"booking_id": booking_id}, {"$set": {"status": "completed"}})
    booking["status"] = "completed"
    service = await db.services.find_one({"service_id": booking["service_id"]}, {"_id": 0, "name": 1})
    booking["service_name"] = service["name"] if service else None
    booking["business_name"] = business.get("name")
    return BookingResponse(**booking)
