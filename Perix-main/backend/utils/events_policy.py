"""Event publication quota (policy v18), feature-flagged.

EVENTS_QUOTA_ENFORCEMENT=1 -> basic Business plan: 4 active events.
Active = future or ongoing published events (decision D12).
"""
import os

from fastapi import HTTPException

from database import db
from utils.helpers import now_utc

EVENTS_QUOTA_ENFORCEMENT = os.environ.get("EVENTS_QUOTA_ENFORCEMENT", "0") == "1"

BUSINESS_ACTIVE_EVENTS = 4


async def count_active_business_events(business_id: str) -> int:
    now = now_utc()
    return await db.events.count_documents({
        "business_id": business_id,
        "is_hidden": {"$ne": True},
        "$or": [
            {"end_time": {"$gte": now}},
            {"end_time": None, "start_time": {"$gte": now}},
            {"end_time": {"$exists": False}, "start_time": {"$gte": now}},
        ],
    })


async def assert_business_event_quota(business_id: str) -> None:
    if not EVENTS_QUOTA_ENFORCEMENT:
        return
    current = await count_active_business_events(business_id)
    if current >= BUSINESS_ACTIVE_EVENTS:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "QUOTA_REACHED",
                "bucket": "events",
                "limit": BUSINESS_ACTIVE_EVENTS,
                "current": current,
            },
        )
