"""Hotel service route regression tests — create, update, publish, slot isolation."""
import sys, os, pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import date
from fastapi import HTTPException
import database
from utils.helpers import generate_id, now_utc
from models.service import ServiceCreate, ServiceUpdate, BlockDateRange, TimeSlotCreate, BookingCreate
from models.user import UserPublic


@pytest.fixture
def test_user():
    return UserPublic(user_id="test-owner", name="Test Owner", email="test@test.com", created_at=now_utc())


@pytest.fixture
async def test_business(test_db, test_user):
    biz_id = generate_id("biz")
    doc = {
        "business_id": biz_id, "owner_id": test_user.user_id, "name": "Test Hotel Biz",
        "root_category": "local-hotels", "subcategory": "hotels",
        "address": "123 Test St", "latitude": 52.5, "longitude": 13.4,
        "enabled_modules": {"services": True},
        "subscription_status": "active", "trial_expires_at": "2027-12-31T00:00:00Z",
        "created_at": now_utc(),
    }
    await database.db.businesses.insert_one(doc)
    yield doc
    await database.db.businesses.delete_one({"business_id": biz_id})


def make_hotel_payload(biz_id: str, status: str = "draft"):
    return ServiceCreate(
        business_id=biz_id, type="hotel_room", root_category="local-hotels",
        name="Route Test Room", price="100.00", inventory_count=2,
        max_guests=2, max_adults=2, max_children=1,
        check_in_time="15:00", check_out_time="11:00",
        min_nights=1, max_nights=30, currency="EUR",
        available_from="2026-10-01", available_until="2026-12-31",
        cover_image_url="https://example.com/img.jpg", status=status,
    )


@pytest.mark.asyncio
async def test_create_draft_hotel(test_db, test_business, test_user):
    """Draft hotel create succeeds and creates zero legacy slots."""
    from routes.services import create_service
    payload = make_hotel_payload(test_business["business_id"], "draft")
    svc = await create_service(payload, test_user)
    try:
        assert svc.service_id
        assert svc.status == "draft"
        slot_count = await database.db.service_slots.count_documents({"service_id": svc.service_id})
        assert slot_count == 0
    finally:
        await database.db.services.delete_one({"service_id": svc.service_id})


@pytest.mark.asyncio
async def test_create_draft_ignores_slots(test_db, test_business, test_user):
    """Draft hotel with availability_slots creates zero legacy slots."""
    from routes.services import create_service
    payload = make_hotel_payload(test_business["business_id"], "draft")
    payload.availability_slots = [
        {"start_time": "09:00", "end_time": "10:00", "is_recurring": False}]
    svc = await create_service(payload, test_user)
    try:
        slot_count = await database.db.service_slots.count_documents({"service_id": svc.service_id})
        assert slot_count == 0  # Hotels never create legacy slots
    finally:
        await database.db.services.delete_one({"service_id": svc.service_id})


@pytest.mark.asyncio
async def test_published_no_window_rejected(test_db, test_business, test_user):
    """Published hotel without available_from/until must raise 400."""
    from routes.services import create_service
    payload = make_hotel_payload(test_business["business_id"], "published")
    payload.available_from = None
    payload.available_until = None
    with pytest.raises(HTTPException) as exc:
        await create_service(payload, test_user)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_published_hotel_succeeds(test_db, test_business, test_user):
    """Valid published hotel create succeeds."""
    from routes.services import create_service
    payload = make_hotel_payload(test_business["business_id"], "published")
    svc = await create_service(payload, test_user)
    try:
        assert svc.service_id
        assert svc.status == "published"
        slot_count = await database.db.service_slots.count_documents({"service_id": svc.service_id})
        assert slot_count == 0
    finally:
        await database.db.services.delete_one({"service_id": svc.service_id})


@pytest.mark.asyncio
async def test_update_hotel_window(test_db, test_business, test_user):
    """Update hotel inventory and window persists."""
    from routes.services import create_service, update_service
    payload = make_hotel_payload(test_business["business_id"], "draft")
    svc = await create_service(payload, test_user)
    try:
        upd = ServiceUpdate(inventory_count=10, available_from="2026-11-01", available_until="2026-11-30")
        updated = await update_service(svc.service_id, upd, test_user)
        assert updated.inventory_count == 10
        assert updated.available_from == "2026-11-01"
        assert updated.available_until == "2026-11-30"
    finally:
        await database.db.services.delete_one({"service_id": svc.service_id})


@pytest.mark.asyncio
async def test_update_hotel_slots_rejected(test_db, test_business, test_user):
    """Hotel update with availability_slots must not create legacy slots."""
    from routes.services import create_service, update_service
    payload = make_hotel_payload(test_business["business_id"], "draft")
    svc = await create_service(payload, test_user)
    try:
        upd = ServiceUpdate(availability_slots=[
            {"start_time": "09:00", "end_time": "10:00", "is_recurring": False}])
        updated = await update_service(svc.service_id, upd, test_user)
        slot_count = await database.db.service_slots.count_documents({"service_id": svc.service_id})
        assert slot_count == 0  # Hotels never create legacy slots
    finally:
        await database.db.services.delete_one({"service_id": svc.service_id})


@pytest.mark.asyncio
async def test_hotel_slot_endpoints_reject(test_db, test_business, test_user):
    """Hotel rejects create_slot, delete_slot, set_availability, and block_slots."""
    from routes.services import create_service, create_slot, delete_slot, set_availability, block_slots
    payload = make_hotel_payload(test_business["business_id"], "published")
    svc = await create_service(payload, test_user)
    try:
        # create_slot
        slot_payload = TimeSlotCreate(service_id=svc.service_id, start_time="09:00", end_time="10:00", date="2026-10-10")
        with pytest.raises(HTTPException) as exc:
            await create_slot(svc.service_id, slot_payload, test_user)
        assert exc.value.status_code == 400

        # set_availability (bulk)
        avail_payload = {"timezone": "Europe/Berlin", "slots": [
            {"start_time": "09:00", "end_time": "10:00", "is_recurring": False, "date": "2026-10-10"}]}
        with pytest.raises(HTTPException) as exc:
            await set_availability(svc.service_id, avail_payload, test_user)
        assert exc.value.status_code == 400

        # block_slots
        block_payload = BlockDateRange(from_date="2026-10-01", to_date="2026-10-05")
        with pytest.raises(HTTPException) as exc:
            await block_slots(svc.service_id, block_payload, test_user)
        assert exc.value.status_code == 400

        # Verify zero legacy slots after all attempted mutations
        slot_count = await database.db.service_slots.count_documents({"service_id": svc.service_id})
        assert slot_count == 0
    finally:
        await database.db.services.delete_one({"service_id": svc.service_id})


@pytest.mark.asyncio
async def test_delete_slot_hotel_rejected(test_db, test_business, test_user):
    """delete_slot on a hotel service must raise 400."""
    from routes.services import create_service, delete_slot
    payload = make_hotel_payload(test_business["business_id"], "published")
    svc = await create_service(payload, test_user)
    try:
        with pytest.raises(HTTPException) as exc:
            await delete_slot(svc.service_id, "nonexistent", test_user)
        assert exc.value.status_code == 400
    finally:
        await database.db.services.delete_one({"service_id": svc.service_id})


@pytest.mark.asyncio
async def test_draft_to_published_invalid(test_db, test_business, test_user):
    """Draft hotel missing available_from → published must raise 400."""
    from routes.services import create_service, update_service
    payload = make_hotel_payload(test_business["business_id"], "draft")
    payload.available_from = None
    payload.available_until = None
    svc = await create_service(payload, test_user)
    try:
        upd = ServiceUpdate(status="published")
        with pytest.raises(HTTPException) as exc:
            await update_service(svc.service_id, upd, test_user)
        assert exc.value.status_code == 400
    finally:
        await database.db.services.delete_one({"service_id": svc.service_id})


@pytest.mark.asyncio
async def test_draft_to_published_valid(test_db, test_business, test_user):
    """Draft hotel with valid config → published succeeds."""
    from routes.services import create_service, update_service
    payload = make_hotel_payload(test_business["business_id"], "draft")
    svc = await create_service(payload, test_user)
    try:
        upd = ServiceUpdate(status="published")
        updated = await update_service(svc.service_id, upd, test_user)
        assert updated.status == "published"
        slot_count = await database.db.service_slots.count_documents({"service_id": svc.service_id})
        assert slot_count == 0
    finally:
        await database.db.services.delete_one({"service_id": svc.service_id})


@pytest.mark.asyncio
async def test_hotel_smoke_create_availability_book(test_db, test_business, test_user):
    """End-to-end hotel smoke test: create published hotel -> availability -> booking."""
    from routes.services import create_service, get_stay_availability, create_booking

    payload = make_hotel_payload(test_business["business_id"], "published")
    svc = await create_service(payload, test_user)
    try:
        avail = await get_stay_availability(
            svc.service_id, check_in="2026-10-10", check_out="2026-10-12",
            rooms=1, adults=1, children=0,
        )
        assert avail.available is True
        assert avail.nights == 2
        assert avail.total_amount > 0

        booking = await create_booking(BookingCreate(
            service_id=svc.service_id,
            date="2026-10-10", end_date="2026-10-12",
            room_count=1, adults=1, children=0,
            client_name="Smoke Test Guest",
        ), test_user)
        assert booking.booking_id
        assert booking.status == "pending"

        stored = await database.db.bookings.find_one({"booking_id": booking.booking_id})
        assert stored is not None
        assert stored["status"] == "pending"
    finally:
        if "booking" in dir() and booking.booking_id:
            await database.db.bookings.delete_one({"booking_id": booking.booking_id})
        await database.db.services.delete_one({"service_id": svc.service_id})
