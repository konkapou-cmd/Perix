"""One-time migration: normalise and validate opening_hours for all businesses.

Run: python scripts/migrate_business_opening_hours.py

Rules:
- Existing { schedule: ... } records → canonical (re-validate, set hours_configured)
- Legacy { Monday: ..., Tuesday: ... } → wrap into lowercase schedule, set hours_configured
- Missing/empty/malformed → opening_hours = None, hours_configured = False
- Valid schedules get timezone from stored location or fallback to Europe/Berlin
- No data is deleted.
"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("MONGO_DB", "perix")

client = AsyncIOMotorClient(MONGO_URI)
db = client[DB_NAME]

from services.business_hours import normalize_opening_hours, has_configured_opening_hours


async def migrate():
    businesses = await db.businesses.find({}).to_list(None)
    total = len(businesses)
    updated = 0
    skipped = 0
    errors = 0

    print(f"Found {total} businesses. Migrating...")

    for biz in businesses:
        bid = biz.get("business_id", "unknown")
        raw = biz.get("opening_hours")

        try:
            normalized = normalize_opening_hours(raw)
            configured = has_configured_opening_hours(normalized)

            update_fields = {}
            if normalized:
                update_fields["opening_hours"] = normalized.model_dump()
            elif raw is not None:
                update_fields["opening_hours"] = None
            else:
                update_fields["opening_hours"] = None

            if biz.get("hours_configured") != configured:
                update_fields["hours_configured"] = configured

            if update_fields:
                await db.businesses.update_one(
                    {"business_id": bid},
                    {"$set": update_fields},
                )
                updated += 1
                print(f"  [UPDATED] {bid} → configured={configured}")
            else:
                skipped += 1
                print(f"  [SKIPPED] {bid} → already correct")
        except Exception as e:
            print(f"  [ERROR] {bid}: {e}")
            errors += 1

    print(f"\nDone. Total={total}, Updated={updated}, Skipped={skipped}, Errors={errors}")


if __name__ == "__main__":
    asyncio.run(migrate())
