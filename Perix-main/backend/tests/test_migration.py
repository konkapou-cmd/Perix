"""Migration script tests — dry-run, idempotency, field preservation."""
import sys, os, pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import date, timedelta
import database
from utils.helpers import generate_id, now_utc
from scripts.migrate_hotel_booking_v2 import migrate_services, migrate_bookings


@pytest.fixture
async def migration_test_data():
    svc_id = generate_id("svc-t")
    svc_doc = {
        "service_id": svc_id, "business_id": "test-biz-m", "type": "hotel_room",
        "root_category": "local-hotels", "name": "Migration Test Hotel", "price": "150.00",
        "currency": "USD", "capacity": 10, "max_guests": 4,
        "is_active": True, "status": "published", "created_at": now_utc(),
    }
    bkg_id = generate_id("bkg-t")
    bkg_doc = {
        "booking_id": bkg_id, "service_id": svc_id, "business_id": "test-biz-m",
        "client_id": "test-client", "client_name": "Test", "date": "2025-06-01",
        "guests": 2, "status": "confirmed", "created_at": now_utc(),
    }
    await database.db.services.insert_one(svc_doc)
    await database.db.bookings.insert_one(bkg_doc)
    yield {"service": svc_doc, "booking": bkg_doc}
    await database.db.services.delete_one({"service_id": svc_id})
    await database.db.bookings.delete_one({"booking_id": bkg_id})


@pytest.mark.asyncio
async def test_migration_dry_run_no_writes(migration_test_data):
    svc_count = await migrate_services(apply=False)
    bkg_count = await migrate_bookings(apply=False)
    assert svc_count >= 1
    assert bkg_count >= 1
    svc = await database.db.services.find_one({"service_id": migration_test_data["service"]["service_id"]})
    assert svc.get("hotel_booking_engine_version") is None


@pytest.mark.asyncio
async def test_migration_apply_writes(migration_test_data):
    svc_count = await migrate_services(apply=True)
    bkg_count = await migrate_bookings(apply=True)
    assert svc_count >= 1
    assert bkg_count >= 1
    svc = await database.db.services.find_one({"service_id": migration_test_data["service"]["service_id"]})
    assert svc["hotel_booking_engine_version"] == 2
    assert svc["inventory_count"] == 10
    assert svc["currency"] == "USD"
    bkg = await database.db.bookings.find_one({"booking_id": migration_test_data["booking"]["booking_id"]})
    assert bkg["booking_mode"] == "date_range"
    assert bkg["room_count"] == 1
    assert bkg["adults"] == 2
    assert bkg["children"] == 0
    assert bkg["end_date"] == "2025-06-02"  # next_day(2025-06-01)
    assert bkg["nights"] == 1


@pytest.mark.asyncio
async def test_migration_idempotent(migration_test_data):
    await migrate_services(apply=True)
    await migrate_bookings(apply=True)
    svc_count_2 = await migrate_services(apply=True)
    assert svc_count_2 == 0  # Already v2
    bkg_count_2 = await migrate_bookings(apply=True)
    assert bkg_count_2 == 0  # Already migrated


@pytest.mark.asyncio
async def test_migration_preserves_pricing(migration_test_data):
    bkg_id = migration_test_data["booking"]["booking_id"]
    await database.db.bookings.update_one({"booking_id": bkg_id}, {
        "$set": {"total_price": "99.99", "total_amount": 9999, "nightly_rate_amount": 3333,
                 "room_count": 2, "adults": 2, "children": 0,
                 "end_date": "2025-06-04", "nights": 3,
                 "booking_mode": "date_range", "currency": "USD", "confirmation_code": "PX-TESTING"}})
    # Run migration — structural fields already filled, pricing already present → skip
    count = await migrate_bookings(apply=True)
    assert count == 0  # Nothing to do
    bkg = await database.db.bookings.find_one({"booking_id": bkg_id})
    assert bkg["total_price"] == "99.99"
    assert bkg["total_amount"] == 9999
    assert bkg["nightly_rate_amount"] == 3333


@pytest.mark.asyncio
async def test_migration_pricing_fallback(migration_test_data):
    """Booking without pricing should get server-calculated pricing from service price."""
    bkg_id = migration_test_data["booking"]["booking_id"]
    # Ensure structural fields exist but no pricing
    await database.db.bookings.update_one({"booking_id": bkg_id}, {
        "$set": {"room_count": 1, "adults": 1, "children": 0, "end_date": "2025-06-03", "nights": 2,
                 "booking_mode": "date_range", "currency": "USD", "confirmation_code": "PX-FALL"}})
    count = await migrate_bookings(apply=True)
    assert count == 1  # Pricing backfilled
    bkg = await database.db.bookings.find_one({"booking_id": bkg_id})
    # 150.00 * 100 = 15000 cents * 2 nights * 1 room = 30000 cents
    assert bkg["nightly_rate_amount"] == 15000
    assert bkg["total_amount"] == 30000
    assert bkg["total_price"] == "300.00"
