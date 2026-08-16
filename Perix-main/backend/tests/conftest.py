"""Shared test fixtures — patches database.db for DB-dependent test modules in pytest's event loop."""
import pytest
from motor.motor_asyncio import AsyncIOMotorClient
from config import MONGO_URL, DB_NAME


@pytest.fixture(scope="function")
async def test_db():
    """Create fresh Motor client in pytest's event loop, patch production modules,
    and create the production indexes that hotel tests require.

    Drops the test database first so every test starts clean — the suite uses
    fixed IDs (e.g. client_id 'test-client') across files, and the unique
    client_id+request_id index would otherwise collide between tests when the
    database is reused (local dev) or shared within one CI run.
    """
    import database

    client = AsyncIOMotorClient(MONGO_URL)
    await client.drop_database(DB_NAME)
    d = client[DB_NAME]
    database.db = d

    for mod_name in ["services.date_range_booking", "routes.services", "scripts.migrate_hotel_booking_v2"]:
        try:
            import importlib
            mod = importlib.import_module(mod_name)
            if hasattr(mod, "db"):
                mod.db = d
        except ImportError:
            pass

    # Production indexes required by hotel concurrency/locking tests
    await d.service_booking_locks.create_index("service_id", unique=True)
    await d.bookings.create_index("booking_id", unique=True)
    await d.bookings.create_index([("client_id", 1), ("request_id", 1)], unique=True, sparse=True)
    await d.service_date_blocks.create_index("block_id", unique=True)

    yield d
    client.close()
