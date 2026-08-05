"""Migrate existing hotel services and bookings to v2 date-range format."""
import asyncio
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from database import db
from utils.helpers import now_utc


def next_day(value: str) -> str:
    return (date.fromisoformat(value) + timedelta(days=1)).isoformat()


async def migrate_services() -> int:
    changed = 0
    async for service in db.services.find({"type": "hotel_room"}):
        service_id = service["service_id"]
        update = {}

        legacy_slots = await db.service_slots.find(
            {"service_id": service_id}, {"_id": 0}
        ).to_list(1000)

        range_starts = [
            slot.get("start_time")
            for slot in legacy_slots
            if isinstance(slot.get("start_time"), str) and len(slot["start_time"]) == 10
        ]
        range_ends = [
            slot.get("end_time")
            for slot in legacy_slots
            if isinstance(slot.get("end_time"), str) and len(slot["end_time"]) == 10
        ]

        if not service.get("available_from") and range_starts:
            update["available_from"] = min(range_starts)
        if not service.get("available_until") and range_ends:
            update["available_until"] = max(range_ends)

        update.setdefault("inventory_count", int(service.get("capacity") or 1))
        update.setdefault("max_adults", int(service.get("max_guests") or 2))
        update.setdefault("max_children", 0)
        update.setdefault("check_in_time", "15:00")
        update.setdefault("check_out_time", "11:00")
        update.setdefault("min_nights", 1)
        update.setdefault("max_nights", 30)
        update.setdefault("currency", "EUR")
        update["hotel_booking_engine_version"] = 2
        update["legacy_hotel_slots_preserved"] = True
        update["hotel_booking_migrated_at"] = now_utc()

        await db.services.update_one(
            {"service_id": service_id}, {"$set": update}
        )
        changed += 1

    return changed


async def migrate_bookings() -> int:
    changed = 0
    async for booking in db.bookings.find({}):
        service = await db.services.find_one(
            {"service_id": booking.get("service_id"), "type": "hotel_room"}
        )
        if not service:
            continue

        update = {
            "booking_mode": "date_range",
            "room_count": int(booking.get("room_count") or 1),
            "adults": int(booking.get("adults") or booking.get("guests") or 1),
            "children": int(booking.get("children") or 0),
        }

        end_date = booking.get("end_date")
        if not end_date:
            end_date = next_day(booking["date"])
            update["end_date"] = end_date

        nights = (date.fromisoformat(end_date) - date.fromisoformat(booking["date"])).days
        update["nights"] = max(1, nights)

        try:
            nightly = Decimal(str(service.get("price") or "0"))
            nightly_cents = int((nightly * Decimal("100")).quantize(Decimal("1")))
        except InvalidOperation:
            nightly_cents = 0

        total = nightly_cents * update["nights"] * update["room_count"]
        update["currency"] = service.get("currency") or "EUR"
        update["nightly_rate_amount"] = nightly_cents
        update["subtotal_amount"] = total
        update["total_amount"] = total
        update["total_price"] = f"{total / 100:.2f}"

        if not booking.get("confirmation_code"):
            update["confirmation_code"] = f'PX-{booking["booking_id"][-8:].upper()}'

        await db.bookings.update_one(
            {"booking_id": booking["booking_id"]}, {"$set": update}
        )
        changed += 1

    return changed


async def main() -> None:
    services = await migrate_services()
    bookings = await migrate_bookings()
    print(f"Migrated {services} hotel services and {bookings} hotel bookings.")


if __name__ == "__main__":
    asyncio.run(main())
