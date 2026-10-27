"""Civil GTFS dates and raw local timetable clocks, independent of UI grouping."""
from datetime import date, datetime
from zoneinfo import ZoneInfo


def _static_service_date(now: datetime, timezone: str) -> str:
    if now.tzinfo is None:
        raise ValueError("An aware datetime is required")
    return now.astimezone(ZoneInfo(timezone)).date().isoformat()


def service_seconds(now: datetime, service_date: str, timezone: str) -> int:
    """Local wall-clock seconds from the dated journey, retaining 24+ hours.

    This is a timetable coordinate, not elapsed UTC duration across DST.
    Repeated DST wall times have the same coordinate; no fold is inferred.
    """
    day = date.fromisoformat(service_date)
    if now.tzinfo is None:
        raise ValueError("An aware datetime is required")
    local = now.astimezone(ZoneInfo(timezone))
    return ((local.date() - day).days * 86400
            + local.hour * 3600 + local.minute * 60 + local.second)
