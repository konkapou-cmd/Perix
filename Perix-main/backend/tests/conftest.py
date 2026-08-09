"""Shared test fixtures — patches database.db for DB-dependent test modules in pytest's event loop."""
import pytest
from motor.motor_asyncio import AsyncIOMotorClient
from config import MONGO_URL, DB_NAME


@pytest.fixture(scope="module")
async def test_db():
    """Create fresh Motor client in pytest's event loop and patch database.db.
    Only used by test files that explicitly request this fixture."""
    import database

    client = AsyncIOMotorClient(MONGO_URL)
    d = client[DB_NAME]
    database.db = d

    # Patch production modules that import db from database
    for mod_name in ["services.date_range_booking", "routes.services", "scripts.migrate_hotel_booking_v2"]:
        try:
            import importlib
            mod = importlib.import_module(mod_name)
            if hasattr(mod, "db"):
                mod.db = d
        except ImportError:
            pass

    yield d
    client.close()
