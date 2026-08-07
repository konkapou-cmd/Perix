"""Concurrency tests for date-range booking engine."""
import sys, os, pytest, asyncio
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import db
from services.date_range_booking import (
    build_stay_quote, create_date_range_booking, confirm_date_range_booking,
    acquire_service_booking_lock, release_service_booking_lock,
)
from models.service import BookingCreate
from utils.helpers import generate_id, now_utc


@pytest.fixture
async def hotel_service_single():
    """Hotel with inventory=1 for race testing."""
    svc_id = generate_id("svc")
    doc = {
        "service_id": svc_id, "business_id": "test-biz-002", "type": "hotel_room",
        "root_category": "local-hotels", "name": "Single Room Hotel", "price": "100.00",
        "currency": "EUR", "inventory_count": 1, "max_guests": 2, "max_adults": 2,
        "max_children": 0, "check_in_time": "15:00", "check_out_time": "11:00",
        "min_nights": 1, "max_nights": 30, "available_from": "2026-01-01",
        "available_until": "2027-12-31", "is_active": True, "status": "published",
        "created_at": now_utc(),
    }
    await db.services.insert_one(doc)
    yield doc
    await db.services.delete_one({"service_id": svc_id})
    await db.bookings.delete_many({"service_id": svc_id})


@pytest.mark.asyncio
async def test_final_room_race(hotel_service_single):
    """Two concurrent bookings for the last room — only one succeeds."""
    svc = hotel_service_single

    async def book(client_id: str):
        payload = BookingCreate(
            service_id=svc["service_id"], date="2026-10-01", end_date="2026-10-04",
            client_name=f"Guest {client_id}", room_count=1, adults=1, children=0)
        try:
            return await create_date_range_booking(payload, service=svc, business_id="test-biz-002", client_id=client_id)
        except Exception as e:
            return {"error": str(e)}

    r1, r2 = await asyncio.gather(book("client-a"), book("client-b"), return_exceptions=True)

    success_count = sum(1 for r in [r1, r2] if isinstance(r, dict) and "booking_id" in r)
    error_count = sum(1 for r in [r1, r2] if isinstance(r, dict) and "error" in r)

    assert success_count == 1
    assert error_count == 1

    # Clean up
    for r in [r1, r2]:
        if isinstance(r, dict) and "booking_id" in r:
            await db.bookings.delete_one({"booking_id": r["booking_id"]})


@pytest.mark.asyncio
async def test_double_confirm_only_one_succeeds(hotel_service_single):
    """Double confirm should result in one success, one 409."""
    svc = hotel_service_single
    # Create a pending booking
    payload = BookingCreate(
        service_id=svc["service_id"], date="2026-10-01", end_date="2026-10-04",
        client_name="Guest", room_count=1, adults=1, children=0)
    booking = await create_date_range_booking(payload, service=svc, business_id="test-biz-002", client_id="test-client")
    try:
        # Try to confirm twice concurrently
        async def confirm():
            try:
                return await confirm_date_range_booking(booking, service=svc, business={"name": "Test Biz", "owner_id": "test-owner"})
            except Exception as e:
                return {"error": str(e)}

        r1, r2 = await asyncio.gather(confirm(), confirm(), return_exceptions=True)
        success_count = sum(1 for r in [r1, r2] if isinstance(r, dict) and "status" in r and r["status"] == "confirmed")
        assert success_count == 1  # Only one succeeds
    finally:
        await db.bookings.delete_one({"booking_id": booking["booking_id"]})


@pytest.mark.asyncio
async def test_booking_vs_block_race(hotel_service_single):
    """Race between booking last room and blocking it — no overselling."""
    svc = hotel_service_single

    async def do_book():
        payload = BookingCreate(
            service_id=svc["service_id"], date="2026-11-01", end_date="2026-11-04",
            client_name="Guest", room_count=1, adults=1, children=0)
        try:
            return await create_date_range_booking(payload, service=svc, business_id="test-biz-002", client_id="client-a")
        except Exception as e:
            return {"error": str(e)}

    async def do_block():
        try:
            block_doc = {"block_id": generate_id("blk"), "service_id": svc["service_id"],
                         "start_date": "2026-11-01", "end_date": "2026-11-04",
                         "blocked_units": 1, "is_active": True, "created_at": now_utc()}
            await db.service_date_blocks.insert_one(block_doc)
            return {"block_id": block_doc["block_id"]}
        except Exception as e:
            return {"error": str(e)}

    r1, r2 = await asyncio.gather(do_book(), do_block(), return_exceptions=True)

    # Clean up
    for r in [r1, r2]:
        if isinstance(r, dict):
            if "booking_id" in r:
                await db.bookings.delete_one({"booking_id": r["booking_id"]})
            if "block_id" in r:
                await db.service_date_blocks.delete_one({"block_id": r["block_id"]})
