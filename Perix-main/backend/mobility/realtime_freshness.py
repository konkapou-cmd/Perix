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
