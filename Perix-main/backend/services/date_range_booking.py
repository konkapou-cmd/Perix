from __future__ import annotations

import asyncio
import time
from datetime import datetime, timedelta
from typing import Any, Optional

from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

from database import db
from models.service import BookingCreate
from utils.helpers import generate_id, now_utc
from services.date_range_utils import (
    calculate_total_cents,
    iter_stay_dates,
    parse_iso_date,
    parse_price_to_cents,
    ranges_overlap,
    validate_stay_dates,
)

PENDING_HOLD_HOURS = 24
LOCK_TTL_SECONDS = 15
LOCK_WAIT_SECONDS = 4


def booking_mode_from_config(config: Optional[dict[str, Any]]) -> str:
    if not config:
        return "time_slot"
    explicit_mode = config.get("mode")
    if explicit_mode:
        return str(explicit_mode)
    if config.get("slots"):
        return "time_slot"
    if config.get("booking"):
        return "request"
    return "none"


async def expire_stale_pending_bookings() -> None:
    now = now_utc()
    await db.bookings.update_many(
        {
            "status": "pending",
            "hold_expires_at": {"$lte": now},
        },
        {
            "$set": {
                "status": "expired",
                "expired_at": now,
            }
        },
    )


async def acquire_service_booking_lock(service_id: str) -> str:
    deadline = time.monotonic() + LOCK_WAIT_SECONDS

    while time.monotonic() < deadline:
        now = now_utc()
        await db.service_booking_locks.delete_many(
            {"expires_at": {"$lte": now}}
        )

        token = generate_id("lck")
        try:
            await db.service_booking_locks.insert_one(
                {
                    "service_id": service_id,
                    "token": token,
                    "created_at": now,
                    "expires_at": now + timedelta(seconds=LOCK_TTL_SECONDS),
                }
            )
            return token
        except DuplicateKeyError:
            await asyncio.sleep(0.05)

    raise HTTPException(
        status_code=409,
        detail="Availability is being updated. Please try again.",
    )


async def release_service_booking_lock(service_id: str, token: str) -> None:
    await db.service_booking_locks.delete_one(
        {"service_id": service_id, "token": token}
    )


def _is_active_inventory_booking(booking: dict[str, Any], now: datetime) -> bool:
    status = booking.get("status")
    if status == "confirmed":
        return True
    if status != "pending":
        return False

    hold_expires_at = booking.get("hold_expires_at")
    return hold_expires_at is None or hold_expires_at > now


async def build_stay_quote(
    service: dict[str, Any],
    *,
    check_in_text: str,
    check_out_text: str,
    room_count: int,
    adults: int,
    children: int,
    exclude_booking_id: Optional[str] = None,
) -> dict[str, Any]:
    await expire_stale_pending_bookings()

    min_nights = int(service.get("min_nights") or 1)
    max_nights = int(service.get("max_nights") or 30)
    check_in, check_out, nights = validate_stay_dates(
        check_in_text,
        check_out_text,
        min_nights=min_nights,
        max_nights=max_nights,
    )

    today = now_utc().date()
    if check_in < today:
        raise HTTPException(
            status_code=400,
            detail="Check-in cannot be in the past",
        )

    available_from = service.get("available_from")
    if available_from and check_in_text < available_from:
        raise HTTPException(
            status_code=400,
            detail=f"Room is not available before {available_from}",
        )

    available_until = service.get("available_until")
    if available_until and check_out_text > available_until:
        raise HTTPException(
            status_code=400,
            detail=f"Checkout must be on or before {available_until}",
        )

    inventory_count = int(service.get("inventory_count") or 1)
    if room_count > inventory_count:
        raise HTTPException(
            status_code=400,
            detail=f"Only {inventory_count} room unit(s) exist",
        )

    max_guests_per_room = int(service.get("max_guests") or 1)
    total_guests = adults + children
    if total_guests > max_guests_per_room * room_count:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Maximum capacity is "
                f"{max_guests_per_room * room_count} guest(s)"
            ),
        )

    max_adults = service.get("max_adults")
    if max_adults is not None and adults > int(max_adults) * room_count:
        raise HTTPException(
            status_code=400,
            detail="Adult count exceeds room capacity",
        )

    max_children = service.get("max_children")
    if max_children is not None and children > int(max_children) * room_count:
        raise HTTPException(
            status_code=400,
            detail="Children count exceeds room capacity",
        )

    query: dict[str, Any] = {
        "service_id": service["service_id"],
        "date": {"$lt": check_out_text},
        "end_date": {"$gt": check_in_text},
        "status": {"$in": ["pending", "confirmed"]},
    }
    if exclude_booking_id:
        query["booking_id"] = {"$ne": exclude_booking_id}

    bookings = await db.bookings.find(
        query,
        {"_id": 0},
    ).to_list(10000)

    blocks = await db.service_date_blocks.find(
        {
            "service_id": service["service_id"],
            "start_date": {"$lt": check_out_text},
            "end_date": {"$gt": check_in_text},
            "is_active": {"$ne": False},
        },
        {"_id": 0},
    ).to_list(10000)

    now = now_utc()
    active_bookings = [
        booking
        for booking in bookings
        if _is_active_inventory_booking(booking, now)
    ]

    minimum_available = inventory_count
    unavailable_dates: list[str] = []

    for stay_date in iter_stay_dates(check_in, check_out):
        date_text = stay_date.isoformat()

        reserved_units = sum(
            int(booking.get("room_count") or 1)
            for booking in active_bookings
            if booking.get("end_date")
            and booking["date"] <= date_text < booking["end_date"]
        )

        blocked_units = sum(
            int(block.get("blocked_units") or inventory_count)
            for block in blocks
            if block["start_date"] <= date_text < block["end_date"]
        )

        available_units = max(
            0,
            inventory_count - reserved_units - blocked_units,
        )
        minimum_available = min(minimum_available, available_units)

        if available_units < room_count:
            unavailable_dates.append(date_text)

    nightly_rate_amount = parse_price_to_cents(service.get("price"))
    subtotal_amount = calculate_total_cents(
        nightly_rate_amount,
        nights,
        room_count,
    )

    return {
        "service_id": service["service_id"],
        "available": len(unavailable_dates) == 0,
        "check_in": check_in_text,
        "check_out": check_out_text,
        "nights": nights,
        "requested_rooms": room_count,
        "inventory_count": inventory_count,
        "minimum_available_rooms": minimum_available,
        "adults": adults,
        "children": children,
        "currency": (service.get("currency") or "EUR").upper(),
        "nightly_rate_amount": nightly_rate_amount,
        "subtotal_amount": subtotal_amount,
        "total_amount": subtotal_amount,
        "unavailable_dates": unavailable_dates,
    }


async def enrich_booking(
    booking: dict[str, Any],
    service: Optional[dict[str, Any]] = None,
    business: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    if service is None:
        service = await db.services.find_one(
            {"service_id": booking["service_id"]},
            {"_id": 0},
        )
    if business is None:
        business = await db.businesses.find_one(
            {"business_id": booking["business_id"]},
            {"_id": 0},
        )

    if service:
        booking["service_name"] = service.get("name")
        booking["service_type"] = service.get("type")
        booking["service_cover_image"] = (
            service.get("cover_image_url")
            or (service.get("image_urls") or [None])[0]
        )
        booking["service_address"] = service.get("address")
        booking["check_in_time"] = service.get("check_in_time")
        booking["check_out_time"] = service.get("check_out_time")
        booking["cancellation_policy"] = service.get("cancellation_policy")

    booking["business_name"] = business.get("name") if business else None
    return booking


async def create_date_range_booking(
    payload: BookingCreate,
    *,
    service: dict[str, Any],
    business_id: str,
    client_id: str,
) -> dict[str, Any]:
    if not payload.end_date:
        raise HTTPException(status_code=400, detail="Checkout is required")

    if payload.request_id:
        existing = await db.bookings.find_one(
            {
                "client_id": client_id,
                "request_id": payload.request_id,
            },
            {"_id": 0},
        )
        if existing:
            return await enrich_booking(existing, service=service)

    lock_token = await acquire_service_booking_lock(service["service_id"])

    try:
        if payload.request_id:
            existing = await db.bookings.find_one(
                {
                    "client_id": client_id,
                    "request_id": payload.request_id,
                },
                {"_id": 0},
            )
            if existing:
                return await enrich_booking(existing, service=service)

        quote = await build_stay_quote(
            service,
            check_in_text=payload.date,
            check_out_text=payload.end_date,
            room_count=payload.room_count,
            adults=payload.adults,
            children=payload.children,
        )

        if not quote["available"]:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Requested room inventory is not available",
                    "unavailable_dates": quote["unavailable_dates"],
                },
            )

        now = now_utc()
        booking_id = generate_id("bkg")
        payload_data = payload.model_dump()
        payload_data.pop("total_price", None)

        doc = {
            **payload_data,
            "booking_id": booking_id,
            "slot_id": None,
            "business_id": business_id,
            "client_id": client_id,
            "booking_mode": "date_range",
            "guests": payload.adults + payload.children,
            "nights": quote["nights"],
            "currency": quote["currency"],
            "nightly_rate_amount": quote["nightly_rate_amount"],
            "subtotal_amount": quote["subtotal_amount"],
            "total_amount": quote["total_amount"],
            "total_price": f'{quote["total_amount"] / 100:.2f}',
            "confirmation_code": f"PX-{booking_id[-8:].upper()}",
            "status": "pending",
            "hold_expires_at": now + timedelta(hours=PENDING_HOLD_HOURS),
            "created_at": now,
        }

        await db.bookings.insert_one(doc)
        return await enrich_booking(doc, service=service)
    finally:
        await release_service_booking_lock(service["service_id"], lock_token)


async def confirm_date_range_booking(
    booking: dict[str, Any],
    *,
    service: dict[str, Any],
    business: dict[str, Any],
) -> dict[str, Any]:
    if booking.get("status") != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Booking is already {booking.get('status')}",
        )

    lock_token = await acquire_service_booking_lock(service["service_id"])

    try:
        hold_expired = (
            booking.get("hold_expires_at") is not None
            and booking["hold_expires_at"] <= now_utc()
        )

        if hold_expired:
            quote = await build_stay_quote(
                service,
                check_in_text=booking["date"],
                check_out_text=booking["end_date"],
                room_count=int(booking.get("room_count") or 1),
                adults=int(booking.get("adults") or 1),
                children=int(booking.get("children") or 0),
                exclude_booking_id=booking["booking_id"],
            )
            if not quote["available"]:
                await db.bookings.update_one(
                    {"booking_id": booking["booking_id"]},
                    {
                        "$set": {
                            "status": "expired",
                            "expired_at": now_utc(),
                        }
                    },
                )
                raise HTTPException(
                    status_code=409,
                    detail="The hold expired and inventory is no longer available",
                )

        confirmed_at = now_utc()
        await db.bookings.update_one(
            {
                "booking_id": booking["booking_id"],
                "status": "pending",
            },
            {
                "$set": {
                    "status": "confirmed",
                    "confirmed_at": confirmed_at,
                },
                "$unset": {
                    "hold_expires_at": "",
                },
            },
        )
        booking["status"] = "confirmed"
        booking["confirmed_at"] = confirmed_at
        booking["hold_expires_at"] = None

        return await enrich_booking(booking, service=service, business=business)
    finally:
        await release_service_booking_lock(service["service_id"], lock_token)
