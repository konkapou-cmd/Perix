"""Guard GTFS-RT freshness using the feed header's *generation* time.

A newly downloaded old feed is not new realtime information.
"""
from typing import Optional


def is_recent_feed_generation(feed_timestamp: Optional[int], now_epoch: int, max_age_seconds: int = 180) -> bool:
    if feed_timestamp is None:
        # Legacy providers do not always populate the header timestamp.
        # The existing per-trip updated_at age check remains authoritative.
        return True
    try:
        value = int(feed_timestamp)
    except (ValueError, TypeError):
        return False
    age = int(now_epoch) - value
    return -120 <= age <= max_age_seconds


def is_recent_trip_update(timestamp, now_epoch: int, max_age_seconds: int = 180) -> bool:
    """Missing source clock stays UNKNOWN, never replaced by arrival epochs."""
    if timestamp is None:
        return True
    if type(timestamp) is not int or timestamp <= 0:
        return False
    return -120 <= now_epoch - timestamp <= max_age_seconds


def operational_only(doc: dict, reason: str) -> dict:
    """Retain dated known skips/cancellations without reusing expired clocks."""
    result = dict(doc)
    for name in ('stop_predictions', 'stop_delays', 'stop_predictions_by_sequence', 'stop_delays_by_sequence'):
        result[name] = {}
    result.update(delay_seconds=0, trip_delay_observed=False, trip_delay_kind='UNAVAILABLE',
                  source_timing_status=reason)
    return result
