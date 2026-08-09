"""Migrate existing hotel services and bookings to v2 date-range format."""
import argparse
import asyncio
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from database import db
from utils.helpers import now_utc


def next_day(value: str) -> str:
    return (date.fromisoformat(value) + timedelta(days=1)).isoformat()


async def migrate_services(apply: bool = False) -> int:
    changed = 0
    proposed = 0
    async for service in db.services.find({"type": "hotel_room"}):
        if service.get("hotel_booking_engine_version") == 2:
            continue

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

        if service.get("available_from") is None and range_starts:
            update["available_from"] = min(range_starts)
        if service.get("available_until") is None and range_ends:
            update["available_until"] = max(range_ends)
        if service.get("inventory_count") is None:
            update["inventory_count"] = int(service.get("capacity") or 1)
        if service.get("max_adults") is None:
            update["max_adults"] = int(service.get("max_guests") or 2)
        if service.get("max_children") is None:
            update["max_children"] = 0
        if service.get("check_in_time") is None:
            update["check_in_time"] = "15:00"
        if service.get("check_out_time") is None:
            update["check_out_time"] = "11:00"
        if service.get("min_nights") is None:
            update["min_nights"] = 1
        if service.get("max_nights") is None:
            update["max_nights"] = 30
        if service.get("currency") is None:
            update["currency"] = "EUR"

        if not update:
            continue

        update["hotel_booking_engine_version"] = 2
        update["legacy_hotel_slots_preserved"] = True
        update["hotel_booking_migrated_at"] = now_utc()
        proposed += 1

        print(f"[DRY-RUN] Would update service {service_id}: {list(update.keys())}")

        if apply:
            await db.services.update_one({"service_id": service_id}, {"$set": update})
            changed += 1

    return changed if apply else proposed


async def migrate_bookings(apply: bool = False) -> int:
    changed = 0
    proposed = 0
    async for booking in db.bookings.find({}):
        service = await db.services.find_one(
            {"service_id": booking.get("service_id"), "type": "hotel_room"}
        )
        if not service:
            continue

        update = {}
        changed_any = False

        # Structural fields — backfill each independently when missing
        if booking.get("booking_mode") is None:
            update["booking_mode"] = "date_range"
            changed_any = True
        if booking.get("room_count") is None:
            update["room_count"] = 1
            changed_any = True
        if booking.get("adults") is None:
            update["adults"] = int(booking.get("guests") or 1)
            changed_any = True
        if booking.get("children") is None:
            update["children"] = 0
            changed_any = True
        if booking.get("end_date") is None:
            nights = max(1, int(booking.get("nights") or 1))
            update["end_date"] = (date.fromisoformat(booking["date"]) + timedelta(days=nights)).isoformat()
            update["nights"] = nights
            changed_any = True
        elif booking.get("nights") is None:
            update["nights"] = max(1, (date.fromisoformat(booking["end_date"]) - date.fromisoformat(booking["date"])).days)
            changed_any = True
        if booking.get("currency") is None:
            update["currency"] = service.get("currency") or "EUR"
            changed_any = True
        if booking.get("confirmation_code") is None:
            update["confirmation_code"] = f'PX-{booking["booking_id"][-8:].upper()}'
            changed_any = True

        # Pricing — only backfill when ALL pricing fields are missing
        has_existing_pricing = (
            booking.get("nightly_rate_amount") is not None
            or booking.get("total_amount") is not None
            or booking.get("total_price") is not None
        )
        if not has_existing_pricing:
            try:
                nightly = Decimal(str(service.get("price") or "0"))
                if nightly > 0:
                    nightly_cents = int((nightly * Decimal("100")).quantize(Decimal("1")))
                    n = update.get("nights") or booking.get("nights") or 1
                    r = update.get("room_count") or booking.get("room_count") or 1
                    total = nightly_cents * n * r
                    update["nightly_rate_amount"] = nightly_cents
                    update["subtotal_amount"] = total
                    update["total_amount"] = total
                    update["total_price"] = f"{total / 100:.2f}"
                    changed_any = True
                else:
                    print(f"[WARN] Booking {booking.get('booking_id')}: zero/negative price, skipping pricing migration")
            except (InvalidOperation, ValueError):
                print(f"[WARN] Booking {booking.get('booking_id')}: invalid price, skipping pricing migration")

        if not update:
            continue
        proposed += 1
        print(f"[DRY-RUN] Would update booking {booking.get('booking_id')}: {list(update.keys())}")

        if apply:
            await db.bookings.update_one({"booking_id": booking["booking_id"]}, {"$set": update})
            changed += 1

    return changed if apply else proposed


async def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate hotel services/bookings to v2 date-range")
    parser.add_argument("--apply", action="store_true", help="Actually write to database")
    args = parser.parse_args()

    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"Hotel booking migration — {mode}")
    svc = await migrate_services(apply=args.apply)
    bkg = await migrate_bookings(apply=args.apply)
    if args.apply:
        print(f"Applied {svc} hotel services and {bkg} hotel bookings.")
    else:
        print(f"Dry-run: {svc} services and {bkg} bookings would be changed.")
        print("Run with --apply to write changes.")


if __name__ == "__main__":
    asyncio.run(main())
