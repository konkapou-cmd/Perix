"""Common helper functions."""
from datetime import datetime, timezone
from typing import Any, Optional
import uuid


def generate_id(prefix: str) -> str:
    """Generate a unique ID with the given prefix."""
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def now_utc() -> datetime:
    """Get current UTC datetime."""
    return datetime.now(timezone.utc)


def parse_datetime(value: Any) -> Optional[datetime]:
    """Safely parse a datetime from str, datetime, or None."""
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)

    return parsed


def normalize_datetime(value: Any) -> datetime:
    """Backward-compatible strict datetime normalizer."""
    parsed = parse_datetime(value)
    if parsed is None:
        raise ValueError("Invalid datetime value")
    return parsed
