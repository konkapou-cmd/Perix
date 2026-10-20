"""GTFS-RT alert display lifecycle; no implicit graph/routing authority."""
from datetime import datetime, timezone
from typing import Optional


def _epoch(value) -> Optional[int]:
    try:
        if value in (None, ""):
            return None
        if isinstance(value, (int, float)) or (isinstance(value, str) and value.strip().isdigit()):
            return int(value)
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except (TypeError, ValueError, OverflowError):
        return None


def alert_is_current(alert: dict, now_epoch: int, max_update_age_seconds: int = 1800) -> bool:
    """A notice is displayable only if recently seen and within its GTFS period.

    GTFS-RT alerts can contain no active_period: those are valid while they
    continue to appear in the feed. Requiring a recent imported updated_at
    prevents orphaned notices from showing forever after feed removal.
    """
    seen = _epoch(alert.get("updated_at"))
    if seen is None or now_epoch - seen > max_update_age_seconds or seen - now_epoch > 300:
        return False
    periods = alert.get("active_periods") or []
    if not periods:
        return True
    for p in periods:
        start = _epoch(p.get("start"))
        end = _epoch(p.get("end"))
        if (start is None or start <= now_epoch) and (end is None or now_epoch <= end):
            return True
    return False
