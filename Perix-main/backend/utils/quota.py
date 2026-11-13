"""Atomic, idempotent monthly usage counters (policy v18).

FerretDB-compatible design: no multi-document transactions are assumed.
A unique idempotency record is inserted first; the monthly counter is
incremented only when the operation key is new. A duplicate insert raises
DuplicateKeyError, which means the operation was already counted
(idempotent retry).
"""
from datetime import datetime, timedelta, timezone

from utils.helpers import now_utc

DEFAULT_PERIOD_ZONE = "Europe/Berlin"


def period_key_for_month(now: datetime = None, zone_name: str = DEFAULT_PERIOD_ZONE) -> str:
    """Calendar-month key (e.g. "2026-11") in the business zone, server-side."""
    from zoneinfo import ZoneInfo
    moment = now or now_utc()
    zone = ZoneInfo(zone_name)
    local_moment = moment.astimezone(zone)
    return f"{local_moment.year:04d}-{local_moment.month:02d}"


def next_period_start(period_key: str, zone_name: str = DEFAULT_PERIOD_ZONE) -> datetime:
    """First instant of the month following period_key, in the business zone."""
    from zoneinfo import ZoneInfo
    year, month = (int(part) for part in period_key.split("-"))
    if month == 12:
        year, month = year + 1, 1
    else:
        month += 1
    return datetime(year, month, 1, tzinfo=ZoneInfo(zone_name))


async def get_usage(actor_type: str, actor_id: str, period_key: str) -> int:
    """Current counted usage for one actor and period."""
    from database import db
    doc = await db.monthly_usage.find_one(
        {"actor_type": actor_type, "actor_id": actor_id, "period_key": period_key},
        {"count": 1},
    )
    return int((doc or {}).get("count") or 0)


async def consume_usage(
    actor_type: str,
    actor_id: str,
    period_key: str,
    operation_key: str,
) -> bool:
    """Count one successful usage event exactly once.

    Returns True when this call performed the increment, False when the
    operation key was already counted (idempotent retry).
    """
    from database import db
    from pymongo.errors import DuplicateKeyError

    try:
        await db.usage_operations.insert_one({
            "actor_type": actor_type,
            "actor_id": actor_id,
            "period_key": period_key,
            "operation_key": operation_key,
            "created_at": now_utc(),
        })
    except DuplicateKeyError:
        return False

    await db.monthly_usage.find_one_and_update(
        {"actor_type": actor_type, "actor_id": actor_id, "period_key": period_key},
        {"$inc": {"count": 1}, "$setOnInsert": {"created_at": now_utc()}},
        upsert=True,
    )
    return True
