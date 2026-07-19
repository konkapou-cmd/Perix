"""Services, Time Slots, and Bookings routes."""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
import asyncio
from datetime import datetime
from pydantic import BaseModel
import logging
from database import db, ROOT_SERVICE_TYPES, ROOT_SERVICE_BOOKING_CONFIG
from models.user import UserPublic
from models.service import (
    ServiceCreate, ServiceUpdate, ServiceResponse,
    TimeSlotCreate, TimeSlotResponse, BlockDateRange,
    BookingCreate, BookingResponse,
)
from utils.helpers import generate_id, now_utc
from routes.dependencies import get_current_user
from routes.businesses import is_subscription_active
from routes.ws import ws_broadcast_new_message, ws_broadcast_conversation_update
from utils.push_notifications import send_message_notification

router = APIRouter(prefix="/services", tags=["Services"])
logger = logging.getLogger("services")

# ─── Services CRUD ───

@router.post("", response_model=ServiceResponse)
async def create_service(payload: ServiceCreate, current_user: UserPublic = Depends(get_current_user)):
    business = await db.businesses.find_one({"business_id": payload.business_id})
    if not business or business["owner_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    if not is_subscription_active(business):
        raise HTTPException(status_code=403, detail="Active subscription required")
    enabled_modules = business.get("enabled_modules")

    if not isinstance(enabled_modules, dict):
        logger.warning(
            "Repairing invalid enabled_modules for business %s: type=%s",
            payload.business_id,
            type(enabled_modules).__name__,
        )
        enabled_modules = {}

    root_category = business.get("root_category") or getattr(payload, "root_category", None) or ""

    if not enabled_modules:
        allowed_types = ROOT_SERVICE_TYPES.get(root_category, [])
        if allowed_types:
            enabled_modules = {
                "services": True,
                "service_types": allowed_types,
            }
            await db.businesses.update_one(
                {"business_id": payload.business_id},
                {"$set": {"enabled_modules": enabled_modules}},
            )
    if not enabled_modules.get("services") and not enabled_modules.get("menu") and not enabled_modules.get("rentals") and not enabled_modules.get("gym"):
        raise HTTPException(status_code=403, detail="Services are not enabled for this business category")

    allowed_types = enabled_modules.get("service_types", [])
    if not allowed_types:
        root_cat = business.get("root_category", "")
        allowed_types = ROOT_SERVICE_TYPES.get(root_cat, [])
        if allowed_types:
            await db.businesses.update_one(
                {"business_id": payload.business_id},
                {"$set": {"enabled_modules.service_types": allowed_types}}
            )
    if allowed_types and payload.type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Service type '{payload.type}' not allowed for this business category")

    publish_status = getattr(payload, "status", None) or "published"
    if publish_status == "published" and not payload.cover_image_url:
        raise HTTPException(
            status_code=400,
            detail="A cover photo is required before publishing this service."
        )

    doc = {
        **payload.model_dump(),
        "service_id": generate_id("svc"),
        "is_active": True,
        "created_at": now_utc(),
    }
    await db.services.insert_one(doc)
    return ServiceResponse(**doc)


@router.get("")
async def list_services(
    business_id: Optional[str] = None,
    type: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    max_distance_km: float = 50,
    min_lat: Optional[float] = None,
    max_lat: Optional[float] = None,
    min_lng: Optional[float] = None,
    max_lng: Optional[float] = None,
    skip: int = 0,
    limit: int = 100,
):
    query = {"is_active": True}
    if business_id:
        query["business_id"] = business_id
    if type:
        query["type"] = type

    services = await db.services.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)

    if all([min_lat, max_lat, min_lng, max_lng]):
        filtered = []
        for s in services:
            lat = s.get("latitude")
            lng = s.get("longitude")
            if lat is not None and lng is not None:
                if min_lat <= lat <= max_lat and min_lng <= lng <= max_lng:
                    filtered.append(s)
        services = filtered
    elif latitude is not None and longitude is not None:
        from math import radians, sin, cos, sqrt, atan2

        def haversine(lat1, lon1, lat2, lon2):
            R = 6371
            dlat = radians(lat2 - lat1)
            dlon = radians(lon2 - lon1)
            a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
            c = 2 * atan2(sqrt(a), sqrt(1 - a))
            return R * c

        filtered = []
        for s in services:
            lat = s.get("latitude")
            lng = s.get("longitude")
            if lat is not None and lng is not None:
                distance = haversine(latitude, longitude, lat, lng)
                if distance <= max_distance_km:
                    s["distance_km"] = round(distance, 2)
                    filtered.append(s)
        filtered.sort(key=lambda x: x.get("distance_km", 999))
        services = filtered

    total = len(services)
    services = services[skip : skip + limit]
    return {"services": [ServiceResponse(**s) for s in services], "total": total}


# ─── Bookings (MUST be before /{service_id} to avoid route conflict) ───

@router.post("/bookings", response_model=BookingResponse)
async def create_booking(payload: BookingCreate, current_user: UserPublic = Depends(get_current_user)):
    service = await db.services.find_one({"service_id": payload.service_id, "is_active": True})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    business_id = service["business_id"]

    # Determine booking mode from service type config
    root_cat = service.get("root_category", "")
    svc_type = service.get("type", "")
    resolved_cat = "rentals" if root_cat == "rental-real-estate" else root_cat
    type_config = ROOT_SERVICE_BOOKING_CONFIG.get(resolved_cat, {}).get(svc_type, None)

    if type_config is not None and not type_config["booking"]:
        raise HTTPException(status_code=400, detail="This service does not accept bookings.")

    requires_slots = type_config["slots"] if type_config else True

    # Check available_from for rentals
    available_from = service.get("available_from")
    if available_from and payload.date < available_from:
        raise HTTPException(status_code=400, detail=f"Service is not available until {available_from}")

    # Check slot availability if required
    slot = None
    if requires_slots:
        if not payload.slot_id:
            raise HTTPException(status_code=400, detail="A time slot must be selected for this service.")
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
        "start_time": slot.get("start_time") if slot else payload.start_time,
        "end_time": slot.get("end_time") if slot else payload.end_time,
    }
    await db.bookings.insert_one(doc)

    # Mark slot as booked
    if slot:
        await db.service_slots.update_one({"slot_id": slot["slot_id"]}, {"$set": {"is_booked": True}})

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


# ─── Inquiries ───


class InquiryPayload(BaseModel):
    name: str
    email: str
    message: str


@router.post("/{service_id}/inquiry")
async def send_service_inquiry(
    service_id: str,
    payload: InquiryPayload,
    current_user: UserPublic = Depends(get_current_user),
):
    service = await db.services.find_one({"service_id": service_id, "is_active": True}, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    business_id = service.get("business_id")
    business = await db.businesses.find_one({"business_id": business_id}, {"_id": 0})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    owner_id = business.get("owner_id")
    if not owner_id:
        raise HTTPException(status_code=404, detail="Business owner not found")

    inquiry_text = f"**Service Inquiry: {service.get('name')}**\n\nFrom: {payload.name} ({payload.email})\n\n{payload.message}"

    message_doc = {
        "message_id": generate_id("msg"),
        "from_user_id": current_user.user_id,
        "to_user_id": owner_id,
        "to_business_id": business_id,
        "entity_type": "business",
        "text": inquiry_text,
        "service_name": service.get("name"),
        "service_id": service_id,
        "read": False,
        "created_at": now_utc(),
    }
    await db.messages.insert_one(message_doc)

    asyncio.create_task(
        send_message_notification(
            recipient_user_id=owner_id,
            sender_name=current_user.name,
            sender_id=current_user.user_id,
            sender_photo=current_user.profile_photo,
            conversation_id=business_id,
            message_preview=inquiry_text[:100],
        )
    )

    await ws_broadcast_new_message(owner_id, message_doc)
    await ws_broadcast_new_message(current_user.user_id, message_doc)
    await ws_broadcast_conversation_update(owner_id, {"conversation_id": business_id, "last_message": message_doc})

    return {"success": True, "message_id": message_doc["message_id"]}


@router.get("/{service_id}", response_model=ServiceResponse)
async def get_service(service_id: str):
    service = await db.services.find_one({"service_id": service_id, "is_active": True}, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    return ServiceResponse(**service)


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
        publish_status = update_data.get("status") or service.get("status") or "published"
        cover_image = update_data.get("cover_image_url") or service.get("cover_image_url")
        if publish_status == "published" and not cover_image:
            raise HTTPException(
                status_code=400,
                detail="A cover photo is required before publishing this service."
            )
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


# ─── Availability ───

class SlotAvailability(BaseModel):
    slot_id: str
    start_time: str
    end_time: str
    capacity: int = 0
    confirmed_count: int = 0
    available_spots: int = 0
    is_full: bool = False


@router.get("/{service_id}/availability")
async def get_availability(service_id: str, date: Optional[str] = None):
    service = await db.services.find_one({"service_id": service_id, "is_active": True}, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    capacity = service.get("capacity") or 1
    day_names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    slots = await db.service_slots.find({"service_id": service_id}, {"_id": 0}).to_list(500)

    # Filter slots matching the date
    date_obj = datetime.strptime(date, "%Y-%m-%d") if date else None
    day_of_week = date_obj.weekday() if date_obj else None
    day_of_week_sunday = (day_of_week + 1) % 7 if day_of_week is not None else None

    matching = []
    for slot in slots:
        if slot.get("is_blocked") or slot.get("is_booked"):
            continue
        if date and slot.get("date") == date:
            matching.append(slot)
        elif date and slot.get("is_recurring") and slot.get("day_of_week") == day_of_week_sunday:
            matching.append(slot)

    # Count confirmed bookings for each slot
    result = []
    for slot in matching:
        slot_capacity = capacity
        confirmed_count = 0
        if slot.get("slot_id"):
            confirmed = await db.bookings.count_documents({
                "slot_id": slot["slot_id"],
                "status": {"$in": ["confirmed", "completed"]},
            })
            confirmed_count = confirmed
        available = max(0, slot_capacity - confirmed_count)
        result.append(SlotAvailability(
            slot_id=slot["slot_id"],
            start_time=slot["start_time"],
            end_time=slot["end_time"],
            capacity=slot_capacity,
            confirmed_count=confirmed_count,
            available_spots=available,
            is_full=available <= 0,
        ))

    result.sort(key=lambda r: r.start_time)
    return result


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
    booking["status"] = "completed"
    service = await db.services.find_one({"service_id": booking["service_id"]}, {"_id": 0, "name": 1})
    booking["service_name"] = service["name"] if service else None
    booking["business_name"] = business.get("name")
    return BookingResponse(**booking)
