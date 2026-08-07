"""Migration script tests — dry-run, idempotency, field preservation."""
import sys, os, pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import date, timedelta
from database import db
from utils.helpers import generate_id, now_utc


@pytest.fixture
async def migration_test_data():
    """Create test hotel services and bookings for migration testing."""
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
    await db.services.insert_one(svc_doc)
    await db.bookings.insert_one(bkg_doc)
    yield {"service": svc_doc, "booking": bkg_doc}
    await db.services.delete_one({"service_id": svc_id})
    await db.bookings.delete_one({"booking_id": bkg_id})


def test_migration_dry_run_no_writes(migration_test_data):
    """Dry run must not mutate the database."""
    import asyncio
    from scripts.migrate_hotel_booking_v2 import migrate_services, migrate_bookings
    svc_count = asyncio.run(migrate_services(apply=False))
    bkg_count = asyncio.run(migrate_bookings(apply=False))
    assert svc_count >= 1
    assert bkg_count >= 1
    # Verify no writes happened
    svc = asyncio.run(db.services.find_one({"service_id": migration_test_data["service"]["service_id"]}))
    assert svc.get("hotel_booking_engine_version") is None  # Not written


def test_migration_apply_writes(migration_test_data):
    """--apply must write to database."""
    import asyncio
    from scripts.migrate_hotel_booking_v2 import migrate_services, migrate_bookings
    svc_count = asyncio.run(migrate_services(apply=True))
    bkg_count = asyncio.run(migrate_bookings(apply=True))
    assert svc_count >= 1
    assert bkg_count >= 1
    svc = asyncio.run(db.services.find_one({"service_id": migration_test_data["service"]["service_id"]}))
    assert svc["hotel_booking_engine_version"] == 2
    assert svc["inventory_count"] == 10  # from capacity
    assert svc["currency"] == "USD"  # preserved
    bkg = asyncio.run(db.bookings.find_one({"booking_id": migration_test_data["booking"]["booking_id"]}))
    assert bkg["booking_mode"] == "date_range"
    assert bkg["room_count"] == 1
    assert bkg["adults"] == 2  # from guests
    assert bkg["children"] == 0
    assert bkg["end_date"] is not None


def test_migration_idempotent(migration_test_data):
    """Second run must not change already-migrated records."""
    import asyncio
    from scripts.migrate_hotel_booking_v2 import migrate_services, migrate_bookings
    # Apply once
    asyncio.run(migrate_services(apply=True))
    asyncio.run(migrate_bookings(apply=True))
    # Apply second time — should skip
    svc_count_2 = asyncio.run(migrate_services(apply=True))
    assert svc_count_2 == 0  # Already v2
    bkg_count_2 = asyncio.run(migrate_bookings(apply=True))
    # Booking with existing total_amount should be skipped from pricing
    assert bkg_count_2 == 0


def test_migration_preserves_historical_pricing(migration_test_data):
    """Migration must not overwrite existing total_price when present."""
    import asyncio
    from database import db
    from scripts.migrate_hotel_booking_v2 import migrate_bookings
    # Set an existing total_price on the booking
    bkg_id = migration_test_data["booking"]["booking_id"]
    asyncio.run(db.bookings.update_one({"booking_id": bkg_id}, {"$set": {"total_price": "99.99", "total_amount": 9999, "nightly_rate_amount": 3333}}))
    # Run migration
    count = asyncio.run(migrate_bookings(apply=True))
    assert count == 0  # Pricing already present — skipped
    bkg = asyncio.run(db.bookings.find_one({"booking_id": bkg_id}))
    assert bkg["total_price"] == "99.99"  # Preserved
    assert bkg["total_amount"] == 9999  # Preserved
    assert bkg["nightly_rate_amount"] == 3333  # Preserved
