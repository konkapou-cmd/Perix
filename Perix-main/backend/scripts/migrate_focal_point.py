"""
One-time migration script: Add default cover_focal_point to all existing documents.
Run once: python -m scripts.migrate_focal_point
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import db

DEFAULT_FOCAL_POINT = {"x": 0.5, "y": 0.5}

COLLECTIONS = [
    "jobs",
    "events",
    "activities",
    "services",
    "rentals",
    "users",
    "businesses",
    "artists",
]


async def migrate():
    for collection_name in COLLECTIONS:
        collection = db[collection_name] if hasattr(db, collection_name) else getattr(db, collection_name, None)
        if collection is None:
            print(f"WARN: Collection '{collection_name}' not found, skipping.")
            continue

        result = await collection.update_many(
            {
                "$or": [
                    {"cover_focal_point": {"$exists": False}},
                    {"cover_focal_point": None},
                ]
            },
            {"$set": {"cover_focal_point": DEFAULT_FOCAL_POINT}},
        )
        print(f"  {collection_name}: {result.modified_count} documents updated")

    print("Migration complete.")


if __name__ == "__main__":
    asyncio.run(migrate())
