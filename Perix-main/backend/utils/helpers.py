"""Common helper functions."""
from datetime import datetime, timezone
import uuid


def generate_id(prefix: str) -> str:
    """Generate a unique ID with the given prefix."""
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def now_utc() -> datetime:
    """Get current UTC datetime."""
    return datetime.now(timezone.utc)


def normalize_datetime(value: datetime) -> datetime:
    """Ensure datetime has UTC timezone info."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value
