"""Integration tests for date-range booking engine."""
import sys, os, pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import date, timedelta
from decimal import Decimal

import database
from services.date_range_booking import (
    build_stay_quote, create_date_range_booking, confirm_date_range_booking,
)
from services.date_range_utils import parse_price_to_cents, calculate_total_cents
from utils.helpers import generate_id, now_utc


@pytest.fixture
async def hotel_service(test_db):
    """Create a test hotel service with inventory=3, price=120/night."""
    svc_id = generate_id("svc")
    """Create a test hotel service with inventory=3, price=120/night."""
    svc_id = generate_id("svc")
    doc = {
        "service_id": svc_id,
        "business_id": "test-biz-001",
        "type": "hotel_room",
        "root_category": "local-hotels",
        "name": "Test Hotel Room",
        "description": "A test room",
        "price": "120.00",
        "currency": "EUR",
        "inventory_count": 3,
        "max_guests": 2,
        "max_adults": 2,
        "max_children": 1,
        "check_in_time": "15:00",
        "check_out_time": "11:00",
        "min_nights": 1,
        "max_nights": 30,
        "available_from": "2026-01-01",
        "available_until": "2027-12-31",
        "is_active": True,
        "status": "published",
        "created_at": now_utc(),
    }
    await database.db.services.insert_one(doc)
    yield doc
    # Cleanup
    await database.db.services.delete_one({"service_id": svc_id})
    await database.db.bookings.delete_many({"service_id": svc_id})
    await database.db.service_date_blocks.delete_many({"service_id": svc_id})


@pytest.mark.asyncio
async def test_basic_stay_available(hotel_service):
    quote = await build_stay_quote(
        hotel_service,
        check_in_text="2026-09-10",
        check_out_text="2026-09-13",
        room_count=1,
        adults=1,
        children=0,
    )
    assert quote["available"]
    assert quote["nights"] == 3
    assert quote["nightly_rate_amount"] == 12000  # 120.00 * 100
    assert quote["subtotal_amount"] == 36000


@pytest.mark.asyncio
async def test_min_nights_rejected(hotel_service):
    # Set min_nights=3
    hotel_service["min_nights"] = 3
    with pytest.raises(Exception):
        await build_stay_quote(
            hotel_service,
            check_in_text="2026-09-10",
            check_out_text="2026-09-12",
            room_count=1, adults=1, children=0,
        )


@pytest.mark.asyncio
async def test_max_nights_rejected(hotel_service):
    hotel_service["max_nights"] = 5
    with pytest.raises(Exception):
        await build_stay_quote(
            hotel_service,
            check_in_text="2026-09-10",
            check_out_text="2026-09-17",
            room_count=1, adults=1, children=0,
        )


@pytest.mark.asyncio
async def test_outside_window_rejected(hotel_service):
    hotel_service["available_from"] = "2026-10-01"
    with pytest.raises(Exception):
        await build_stay_quote(
            hotel_service,
            check_in_text="2026-09-10",
            check_out_text="2026-09-13",
            room_count=1, adults=1, children=0,
        )


@pytest.mark.asyncio
async def test_too_many_rooms_rejected(hotel_service):
    with pytest.raises(Exception):
        await build_stay_quote(
            hotel_service,
            check_in_text="2026-09-10",
            check_out_text="2026-09-13",
            room_count=4, adults=1, children=0,
        )


@pytest.mark.asyncio
async def test_pricing_server_calculated(hotel_service):
    quote = await build_stay_quote(
        hotel_service,
        check_in_text="2026-09-10",
        check_out_text="2026-09-13",
        room_count=2,
        adults=2,
        children=0,
    )
    assert quote["nightly_rate_amount"] == 12000
    assert quote["subtotal_amount"] == 72000  # 120 * 3 * 2
    assert quote["total_amount"] == 72000


@pytest.mark.asyncio
async def test_full_capacity_fully_booked(hotel_service):
    """Book all 3 rooms — stay quote should show unavailable."""
    # Create a confirmed booking for all 3 rooms
    booking_doc = {
        "booking_id": generate_id("bkg"),
        "service_id": hotel_service["service_id"],
        "business_id": "test-biz-001",
        "client_id": "test-client",
        "date": "2026-09-10",
        "end_date": "2026-09-13",
        "room_count": 3,
        "adults": 2,
        "children": 0,
        "nights": 3,
        "status": "confirmed",
        "currency": "EUR",
        "nightly_rate_amount": 12000,
        "subtotal_amount": 36000,
        "total_amount": 108000,
        "hold_expires_at": None,
        "created_at": now_utc(),
    }
    await database.db.bookings.insert_one(booking_doc)
    try:
        quote = await build_stay_quote(
            hotel_service,
            check_in_text="2026-09-10",
            check_out_text="2026-09-13",
            room_count=1, adults=1, children=0,
        )
        assert not quote["available"]
        assert "2026-09-10" in quote["unavailable_dates"]
    finally:
        await database.db.bookings.delete_one({"booking_id": booking_doc["booking_id"]})


@pytest.mark.asyncio
async def test_stale_pending_does_not_consume(hotel_service):
    """Expired pending booking should not block inventory."""
    booking_doc = {
        "booking_id": generate_id("bkg"),
        "service_id": hotel_service["service_id"],
        "business_id": "test-biz-001",
        "client_id": "test-client",
        "date": "2026-09-10",
        "end_date": "2026-09-13",
        "room_count": 3,
        "adults": 1,
        "children": 0,
        "nights": 3,
        "status": "pending",
        "hold_expires_at": now_utc() - timedelta(hours=48),  # expired
        "created_at": now_utc(),
    }
    await database.db.bookings.insert_one(booking_doc)
    try:
        quote = await build_stay_quote(
            hotel_service,
            check_in_text="2026-09-10",
            check_out_text="2026-09-13",
            room_count=1, adults=1, children=0,
        )
        assert quote["available"]  # Expired, so available
    finally:
        await database.db.bookings.delete_one({"booking_id": booking_doc["booking_id"]})


@pytest.mark.asyncio
async def test_request_id_idempotent(hotel_service):
    """Same request_id should not create duplicate booking."""
    from models.service import BookingCreate
    payload = BookingCreate(
        service_id=hotel_service["service_id"],
        date="2026-09-10",
        end_date="2026-09-13",
        client_name="Test Guest",
        room_count=1,
        adults=1,
        children=0,
        request_id="test-idem-001",
    )
    b1 = await create_date_range_booking(
        payload, service=hotel_service, business_id="test-biz-001", client_id="test-client"
    )
    try:
        b2 = await create_date_range_booking(
            payload, service=hotel_service, business_id="test-biz-001", client_id="test-client"
        )
        # Same booking_id returned
        assert b2["booking_id"] == b1["booking_id"]
    finally:
        await database.db.bookings.delete_one({"booking_id": b1["booking_id"]})


@pytest.mark.asyncio
async def test_partial_block_allowed(hotel_service):
    """Create a block that doesn't exceed inventory should succeed."""
    # Block 1 room for Sep 10-13
    block_doc = {
        "block_id": generate_id("blk"),
        "service_id": hotel_service["service_id"],
        "start_date": "2026-09-10",
        "end_date": "2026-09-13",
        "blocked_units": 1,
        "is_active": True,
        "created_at": now_utc(),
    }
    await database.db.service_date_blocks.insert_one(block_doc)
    try:
        # Book 1 room (inventory=3, blocked=1 → 2 available)
        quote = await build_stay_quote(
            hotel_service,
            check_in_text="2026-09-10",
            check_out_text="2026-09-13",
            room_count=2, adults=1, children=0,
        )
        assert quote["available"]  # 3 - 1 blocked = 2 available, requesting 2 -> OK
    finally:
        await database.db.service_date_blocks.delete_one({"block_id": block_doc["block_id"]})
