"""Operational overrides (Mobility Core V2 - Phase 6).

Operator-driven realtime exceptions on top of the imported timetable:
trip_canceled and stop_skipped. Never mutates imported data; the arrivals
engine and the estimator both apply them as an overlay layer.
"""
from datetime import datetime
from typing import List, Optional, Set
from zoneinfo import ZoneInfo

from database import db


def _now_utc() -> datetime:
    return datetime.now(ZoneInfo("UTC"))


async def get_trip_overrides() -> List[dict]:
    docs = await db.mobility_trip_overrides.find({}, {"_id": 0}).to_list(500)
    return list(docs)


def _override_active(ov: dict) -> bool:
    now = _now_utc()
    valid_from = ov.get("valid_from")
    valid_until = ov.get("valid_until")
    try:
        if valid_from:
            f = datetime.fromisoformat(str(valid_from))
            if f.tzinfo is None:
                f = f.replace(tzinfo=ZoneInfo("UTC"))
            if now < f:
                return False
        if valid_until:
            u = datetime.fromisoformat(str(valid_until))
            if u.tzinfo is None:
                u = u.replace(tzinfo=ZoneInfo("UTC"))
            if now > u:
                return False
    except ValueError:
        pass
    return True


async def canceled_trip_ids() -> Set[str]:
    out = set()
    for ov in await get_trip_overrides():
        if ov.get("kind") != "trip_canceled" or not _override_active(ov):
            continue
        if ov.get("trip_id"):
            out.add(str(ov["trip_id"]))
    return out


async def skipped_stop_ids() -> dict:
    """trip_id -> set(stop_ids) skipped by operator override."""
    out: dict = {}
    for ov in await get_trip_overrides():
        if ov.get("kind") != "stop_skipped" or not _override_active(ov):
            continue
        tid = str(ov.get("trip_id") or "")
        sid = str(ov.get("stop_id") or "")
        if tid and sid:
            out.setdefault(tid, set()).add(sid)
    return out
