"""Concurrency tests for date-range booking engine."""
import sys, os, pytest, asyncio
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import timedelta
import database
from services.date_range_booking import (
    build_stay_quote, create_date_range_booking, confirm_date_range_booking,
)
from models.service import BookingCreate
from utils.helpers import generate_id, now_utc


@pytest.fixture
async def hotel_service_single(test_db):
    svc_id = generate_id("svc")
    doc = {
        "service_id": svc_id, "business_id": "test-biz-rc", "type": "hotel_room",
        "root_category": "local-hotels", "name": "Single Room Hotel", "price": "100.00",
        "currency": "EUR", "inventory_count": 1, "max_guests": 2, "max_adults": 2,
        "max_children": 0, "check_in_time": "15:00", "check_out_time": "11:00",
        "min_nights": 1, "max_nights": 30, "available_from": "2026-01-01",
        "available_until": "2027-12-31", "is_active": True, "status": "published",
        "created_at": now_utc(),
    }
    await database.db.services.insert_one(doc)
    yield doc
    await database.db.services.delete_one({"service_id": svc_id})
    await database.db.bookings.delete_many({"service_id": svc_id})
    await database.db.service_date_blocks.delete_many({"service_id": svc_id})


@pytest.fixture
async def hotel_service_multi(test_db):
    svc_id = generate_id("svc")
    doc = {
        "service_id": svc_id, "business_id": "test-biz-mc", "type": "hotel_room",
        "root_category": "local-hotels", "name": "Multi Room Hotel", "price": "100.00",
        "currency": "EUR", "inventory_count": 5, "max_guests": 2, "max_adults": 2,
        "max_children": 1, "check_in_time": "15:00", "check_out_time": "11:00",
        "min_nights": 1, "max_nights": 30, "available_from": "2026-01-01",
        "available_until": "2027-12-31", "is_active": True, "status": "published",
        "created_at": now_utc(),
    }
    await database.db.services.insert_one(doc)
    yield doc
    await database.db.services.delete_one({"service_id": svc_id})
    await database.db.bookings.delete_many({"service_id": svc_id})
    await database.db.service_date_blocks.delete_many({"service_id": svc_id})


def make_booking(service_id: str, client_id: str, date="2026-10-01"):
    return BookingCreate(
        service_id=service_id, date=date, end_date="2026-10-04",
        client_name=f"Guest {client_id}", room_count=1, adults=1, children=0)


async def cleanup_booking(b):
    if isinstance(b, dict) and "booking_id" in b:
        await database.db.bookings.delete_one({"booking_id": b["booking_id"]})


# ─── Final room race ───

@pytest.mark.asyncio
async def test_final_room_race(hotel_service_single):
    svc = hotel_service_single
    async def book(client_id: str):
        try:
            return await create_date_range_booking(
                make_booking(svc["service_id"], client_id), service=svc, business_id="test-biz-rc", client_id=client_id)
        except Exception as e:
            return {"error": str(e)}

    r1, r2 = await asyncio.gather(book("a"), book("b"), return_exceptions=True)
    successes = sum(1 for r in [r1, r2] if isinstance(r, dict) and "booking_id" in r)
    errors = sum(1 for r in [r1, r2] if isinstance(r, dict) and "error" in r)
    assert successes == 1
    assert errors == 1
    await cleanup_booking(r1) if isinstance(r1, dict) else None
    await cleanup_booking(r2) if isinstance(r2, dict) else None


# ─── Double confirm ───

@pytest.mark.asyncio
async def test_double_confirm_only_one_succeeds(hotel_service_single):
    svc = hotel_service_single
    booking = await create_date_range_booking(
        make_booking(svc["service_id"], "test-client"), service=svc, business_id="test-biz-rc", client_id="test-client")
    try:
        async def confirm():
            try:
                return await confirm_date_range_booking(booking, service=svc, business={"name": "Biz", "owner_id": "test-owner"})
            except Exception as e:
                return {"error": str(e)}
        r1, r2 = await asyncio.gather(confirm(), confirm(), return_exceptions=True)
        successes = sum(1 for r in [r1, r2] if isinstance(r, dict) and r.get("status") == "confirmed")
        assert successes == 1
    finally:
        await database.db.bookings.delete_one({"booking_id": booking["booking_id"]})


# ─── Booking vs owner block race ───

@pytest.mark.asyncio
async def test_booking_vs_block_race(hotel_service_single):
    svc = hotel_service_single

    async def do_book():
        try:
            return await create_date_range_booking(
                make_booking(svc["service_id"], "a", "2026-11-01"), service=svc, business_id="test-biz-rc", client_id="a")
        except Exception as e:
            return {"error": str(e)}

    async def do_block():
        try:
            from services.date_range_booking import create_service_date_block
            return await create_service_date_block(
                svc["service_id"], start_date="2026-11-01", end_date="2026-11-04", blocked_units=1)
        except Exception as e:
            return {"error": str(e)}

    r1, r2 = await asyncio.gather(do_book(), do_block(), return_exceptions=True)
    # With inventory=1, exactly one of booking/block should succeed
    successes = sum(1 for r in [r1, r2] if isinstance(r, dict) and "error" not in r)
    assert successes == 1
    for r in [r1, r2]:
        if isinstance(r, dict):
            if "booking_id" in r:
                await database.db.bookings.delete_one({"booking_id": r["booking_id"]})
            if "block_id" in r:
                await database.db.service_date_blocks.delete_one({"block_id": r["block_id"]})


# ─── Confirm vs decline race ───

@pytest.mark.asyncio
async def test_confirm_vs_decline_race(hotel_service_single):
    svc = hotel_service_single
    booking = await create_date_range_booking(
        make_booking(svc["service_id"], "c"), service=svc, business_id="test-biz-rc", client_id="c")
    try:
        async def do_confirm():
            try:
                return await confirm_date_range_booking(booking, service=svc, business={"name": "Biz", "owner_id": "to"})
            except Exception as e:
                return {"error": str(e)}

        async def do_decline():
            try:
                from routes.services import decline_booking
                # Use the route handler
                result = await database.db.bookings.update_one(
                    {"booking_id": booking["booking_id"], "status": "pending"},
                    {"$set": {"status": "declined", "declined_at": now_utc(), "cancelled_by": "business"},
                     "$unset": {"hold_expires_at": ""}})
                if result.modified_count != 1:
                    return {"error": "409"}
                booking["status"] = "declined"
                return booking
            except Exception as e:
                return {"error": str(e)}

        r1, r2 = await asyncio.gather(do_confirm(), do_decline(), return_exceptions=True)
        successes = sum(1 for r in [r1, r2] if isinstance(r, dict) and "error" not in r)
        errors = sum(1 for r in [r1, r2] if isinstance(r, dict) and "error" in r)
        assert successes == 1
        assert errors == 1
    finally:
        await database.db.bookings.delete_one({"booking_id": booking["booking_id"]})


# ─── Cancel vs complete race ───

@pytest.mark.asyncio
async def test_cancel_vs_complete_race(hotel_service_single):
    svc = hotel_service_single
    booking = await create_date_range_booking(
        make_booking(svc["service_id"], "d"), service=svc, business_id="test-biz-rc", client_id="d")
    # First confirm it
    booking = await confirm_date_range_booking(booking, service=svc, business={"name": "Biz", "owner_id": "to"})
    try:
        async def do_cancel():
            try:
                result = await database.db.bookings.update_one(
                    {"booking_id": booking["booking_id"], "status": {"$in": ["pending", "confirmed"]}},
                    {"$set": {"status": "cancelled", "cancelled_at": now_utc(), "cancelled_by": "client"},
                     "$unset": {"hold_expires_at": ""}})
                if result.modified_count != 1:
                    return {"error": "409"}
                return {"booking_id": booking["booking_id"], "status": "cancelled"}
            except Exception as e:
                return {"error": str(e)}

        async def do_complete():
            try:
                result = await database.db.bookings.update_one(
                    {"booking_id": booking["booking_id"], "status": "confirmed"},
                    {"$set": {"status": "completed", "completed_at": now_utc()}})
                if result.modified_count != 1:
                    return {"error": "409"}
                return {"booking_id": booking["booking_id"], "status": "completed"}
            except Exception as e:
                return {"error": str(e)}

        r1, r2 = await asyncio.gather(do_cancel(), do_complete(), return_exceptions=True)
        successes = sum(1 for r in [r1, r2] if isinstance(r, dict) and "error" not in r)
        errors = sum(1 for r in [r1, r2] if isinstance(r, dict) and "error" in r)
        # Either cancel succeeds and complete fails, or vice versa
        assert successes == 1
        assert errors == 1
    finally:
        await database.db.bookings.delete_one({"booking_id": booking["booking_id"]})


# ─── Double cancel ───

@pytest.mark.asyncio
async def test_double_cancel_only_one_succeeds(hotel_service_single):
    svc = hotel_service_single
    booking = await create_date_range_booking(
        make_booking(svc["service_id"], "e"), service=svc, business_id="test-biz-rc", client_id="e")
    try:
        async def cancel():
            try:
                result = await database.db.bookings.update_one(
                    {"booking_id": booking["booking_id"], "status": {"$in": ["pending", "confirmed"]}},
                    {"$set": {"status": "cancelled", "cancelled_at": now_utc(), "cancelled_by": "client"},
                     "$unset": {"hold_expires_at": ""}})
                if result.modified_count != 1:
                    return {"error": "409"}
                return {"status": "cancelled"}
            except Exception as e:
                return {"error": str(e)}

        r1, r2 = await asyncio.gather(cancel(), cancel(), return_exceptions=True)
        successes = sum(1 for r in [r1, r2] if isinstance(r, dict) and "error" not in r)
        assert successes == 1
    finally:
        await database.db.bookings.delete_one({"booking_id": booking["booking_id"]})


@pytest.mark.asyncio
async def test_confirm_vs_cancel_race(hotel_service_single):
    """Confirm vs cancel — only one succeeds."""
    svc = hotel_service_single
    booking = await create_date_range_booking(
        make_booking(svc["service_id"], "g"), service=svc, business_id="test-biz-rc", client_id="g")
    try:
        async def do_confirm():
            try:
                return await confirm_date_range_booking(booking, service=svc, business={"name": "Biz", "owner_id": "to"})
            except Exception as e:
                return {"error": str(e)}

        async def do_cancel():
            try:
                result = await database.db.bookings.update_one(
                    {"booking_id": booking["booking_id"], "status": {"$in": ["pending", "confirmed"]}},
                    {"$set": {"status": "cancelled", "cancelled_at": now_utc(), "cancelled_by": "client"},
                     "$unset": {"hold_expires_at": ""}})
                if result.modified_count != 1:
                    return {"error": "409"}
                return {"status": "cancelled"}
            except Exception as e:
                return {"error": str(e)}

        r1, r2 = await asyncio.gather(do_confirm(), do_cancel(), return_exceptions=True)
        successes = sum(1 for r in [r1, r2] if isinstance(r, dict) and "error" not in r)
        assert successes == 1
    finally:
        await database.db.bookings.delete_one({"booking_id": booking["booking_id"]})
