"""
One-time migration script: Map old activity themes to new activity type keys.
Run once: python -m scripts.migrate_activity_themes
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import db

THEME_MIGRATION_MAP = {
    "birthday": "one_hour_hangout",
    "dinner": "one_hour_hangout",
    "cinema": "one_hour_hangout",
    "party": "one_hour_hangout",
    "coffee": "one_hour_hangout",
    "travel": "one_hour_hangout",
    "game": "one_hour_hangout",
    "music": "one_hour_hangout",
    "custom": "one_hour_hangout",
    "sports": "casual_football_kickabout",
    "outdoor": "casual_walk_meetup",
}


async def migrate():
    updated_total = 0
    for old_key, new_key in THEME_MIGRATION_MAP.items():
        result = await db.activities.update_many(
            {"theme": old_key},
            {"$set": {"theme": new_key}},
        )
        if result.modified_count > 0:
            print(f"  {old_key} → {new_key}: {result.modified_count} activities updated")
            updated_total += result.modified_count
        else:
            print(f"  {old_key} → {new_key}: no matching activities (OK)")

    print(f"\nMigration complete. {updated_total} total activities updated.")


if __name__ == "__main__":
    asyncio.run(migrate())
