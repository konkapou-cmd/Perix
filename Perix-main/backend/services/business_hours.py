"""Business opening hours validation, normalisation and open-state calculation."""
from datetime import datetime, timedelta, time
from typing import Optional, Dict, Any, Tuple, List
import logging

from models.business import BusinessOpeningHours, DaySchedule, OpeningPeriod, SpecialHours

logger = logging.getLogger(__name__)

DAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
DAY_NAMES_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _parse_time(t: str) -> Tuple[int, int]:
    h, m = map(int, t.split(":"))
    return h, m


def _time_to_minutes(t: str) -> int:
    h, m = _parse_time(t)
    return h * 60 + m


def _period_overlaps(p1: OpeningPeriod, p2: OpeningPeriod) -> bool:
    s1 = _time_to_minutes(p1.open)
    e1 = _time_to_minutes(p1.close)
    s2 = _time_to_minutes(p2.open)
    e2 = _time_to_minutes(p2.close)
    if e1 <= s1:
        e1 += 24 * 60
    if e2 <= s2:
        e2 += 24 * 60
    return max(s1, s2) < min(e1, e2)


def _build_default_schedule() -> Dict[str, DaySchedule]:
    return {d: DaySchedule(enabled=False, periods=[]) for d in DAY_NAMES}


def normalize_opening_hours(raw: Any) -> Optional[BusinessOpeningHours]:
    """Convert raw opening hours into canonical BusinessOpeningHours or return None."""
    if raw is None:
        return None

    if isinstance(raw, BusinessOpeningHours):
        return raw

    if isinstance(raw, dict):
        try:
            if "schedule" in raw:
                schedule = raw["schedule"]
                if isinstance(schedule, dict):
                    normalized = {}
                    for d in DAY_NAMES:
                        ds = schedule.get(d)
                        if isinstance(ds, dict):
                            enabled = ds.get("enabled", False)
                            periods_raw = ds.get("periods", []) or []
                            periods = [OpeningPeriod(**p) for p in periods_raw]
                            normalized[d] = DaySchedule(enabled=enabled, periods=periods)
                        else:
                            normalized[d] = DaySchedule(enabled=False, periods=[])
                    timezone = raw.get("timezone", "Europe/Berlin")
                    exceptions_raw = raw.get("exceptions")
                    exceptions = [SpecialHours(**e) for e in exceptions_raw] if exceptions_raw else None
                    return BusinessOpeningHours(timezone=timezone, schedule=normalized, exceptions=exceptions)

            elif any(k in DAY_NAMES_EN for k in raw.keys()):
                normalized = {}
                for i, day_en in enumerate(DAY_NAMES_EN):
                    ds = raw.get(day_en)
                    dl = DAY_NAMES[i]
                    if isinstance(ds, dict):
                        enabled = ds.get("enabled", False)
                        periods_raw = ds.get("periods", []) or []
                        periods = [OpeningPeriod(**p) for p in periods_raw]
                        normalized[dl] = DaySchedule(enabled=enabled, periods=periods)
                    else:
                        normalized[dl] = DaySchedule(enabled=False, periods=[])
                return BusinessOpeningHours(timezone="Europe/Berlin", schedule=normalized)

            elif any(k in DAY_NAMES for k in raw.keys()):
                normalized = {}
                for d in DAY_NAMES:
                    ds = raw.get(d)
                    if isinstance(ds, dict):
                        enabled = ds.get("enabled", False)
                        periods_raw = ds.get("periods", []) or []
                        periods = [OpeningPeriod(**p) for p in periods_raw]
                        normalized[d] = DaySchedule(enabled=enabled, periods=periods)
                    else:
                        normalized[d] = DaySchedule(enabled=False, periods=[])
                return BusinessOpeningHours(timezone="Europe/Berlin", schedule=normalized)
        except Exception as e:
            logger.warning(f"Failed to normalize opening_hours: {e}")
            return None

    return None


def validate_opening_hours(oh: BusinessOpeningHours) -> Tuple[bool, List[str]]:
    """Validate opening hours. Returns (valid, errors)."""
    errors: List[str] = []

    try:
        import zoneinfo
        zoneinfo.ZoneInfo(oh.timezone)
    except Exception:
        try:
            import pytz
            pytz.timezone(oh.timezone)
        except Exception:
            errors.append(f"Invalid timezone: {oh.timezone}")

    has_enabled_day = False
    any_period = False

    for day_name in DAY_NAMES:
        ds = oh.schedule.get(day_name)
        if not ds:
            errors.append(f"Missing day: {day_name}")
            continue
        if ds.enabled:
            has_enabled_day = True
            if not ds.periods:
                errors.append(f"{day_name} is enabled but has no periods")
            else:
                any_period = True
                sorted_p = sorted(ds.periods, key=lambda p: p.open)
                for i in range(len(sorted_p)):
                    for j in range(i + 1, len(sorted_p)):
                        if _period_overlaps(sorted_p[i], sorted_p[j]):
                            errors.append(
                                f"Overlap in {day_name}: {sorted_p[i].open}-{sorted_p[i].close} with {sorted_p[j].open}-{sorted_p[j].close}"
                            )

    if not has_enabled_day:
        pass

    if oh.exceptions:
        seen_dates = set()
        for exc in oh.exceptions:
            try:
                datetime.strptime(exc.date, "%Y-%m-%d")
            except ValueError:
                errors.append(f"Invalid exception date: {exc.date}")
            if exc.date in seen_dates:
                errors.append(f"Duplicate exception date: {exc.date}")
            seen_dates.add(exc.date)
            if not exc.closed and exc.periods:
                sorted_p = sorted(exc.periods, key=lambda p: p.open)
                for i in range(len(sorted_p)):
                    for j in range(i + 1, len(sorted_p)):
                        if _period_overlaps(sorted_p[i], sorted_p[j]):
                            errors.append(
                                f"Overlap in exception {exc.date}: {sorted_p[i].open}-{sorted_p[i].close} with {sorted_p[j].open}-{sorted_p[j].close}"
                            )

    return (len(errors) == 0 and has_enabled_day and any_period, errors)


def has_configured_opening_hours(oh: Optional[BusinessOpeningHours]) -> bool:
    """Check if the business has valid, complete opening hours."""
    if oh is None:
        return False
    try:
        valid, _ = validate_opening_hours(oh)
        return valid
    except Exception:
        return False


def get_business_open_state(oh: Optional[BusinessOpeningHours]) -> Optional[Dict[str, Any]]:
    """Calculate current open state based on business timezone. Returns None if hours not configured."""
    if not has_configured_opening_hours(oh):
        return None

    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo(oh.timezone)
    except Exception:
        try:
            import pytz
            tz = pytz.timezone(oh.timezone)
        except Exception:
            return None

    now = datetime.now(tz)
    current_day_name = DAY_NAMES[now.weekday()]
    current_day_idx = now.weekday()

    date_str = now.strftime("%Y-%m-%d")
    if oh.exceptions:
        for exc in oh.exceptions:
            if exc.date == date_str:
                if exc.closed:
                    next_open = _find_next_open(oh, now, current_day_idx, tz)
                    return {
                        "hours_configured": True,
                        "open_now": False,
                        "next_open_at": next_open.isoformat() if next_open else None,
                    }
                if exc.periods:
                    current_minutes = now.hour * 60 + now.minute
                    found = False
                    closes_at = None
                    for p in exc.periods:
                        opens = _time_to_minutes(p.open)
                        closes = _time_to_minutes(p.close)
                        if closes <= opens:
                            closes += 24 * 60
                        if opens <= current_minutes < closes:
                            found = True
                            closes_at = f"{p.close}"
                            break
                    next_open = None if found else _find_next_open(oh, now, current_day_idx, tz)
                    return {
                        "hours_configured": True,
                        "open_now": found,
                        "closes_at": closes_at,
                        "next_open_at": next_open.isoformat() if next_open else None,
                    }

    ds = oh.schedule.get(current_day_name)
    current_minutes = now.hour * 60 + now.minute
    open_now = False
    closes_at = None

    if ds and ds.enabled:
        for p in ds.periods:
            opens = _time_to_minutes(p.open)
            closes = _time_to_minutes(p.close)
            if closes <= opens:
                closes += 24 * 60
            if opens <= current_minutes < closes:
                open_now = True
                closes_at = f"{p.close}"
                break
            if current_minutes < opens:
                next_open_time = p.open
                break

    next_open = _find_next_open(oh, now, current_day_idx, tz) if not open_now else None

    return {
        "hours_configured": True,
        "open_now": open_now,
        "closes_at": closes_at,
        "next_open_at": next_open.isoformat() if next_open else None,
    }


def _find_next_open(oh: BusinessOpeningHours, now: datetime, start_day_idx: int, tz) -> Optional[datetime]:
    """Find the next time this business opens, looking up to 7 days ahead."""
    today_dt = now.replace(hour=0, minute=0, second=0, microsecond=0)
    for offset in range(7):
        check_dt = today_dt + timedelta(days=offset)
        check_day_idx = (start_day_idx + offset) % 7
        check_day_name = DAY_NAMES[check_day_idx]
        check_date_str = check_dt.strftime("%Y-%m-%d")

        if oh.exceptions:
            for exc in oh.exceptions:
                if exc.date == check_date_str and exc.closed:
                    continue
                if exc.date == check_date_str and exc.periods:
                    first = sorted(exc.periods, key=lambda p: p.open)[0]
                    if offset == 0:
                        opens_min = _time_to_minutes(first.open)
                        if now.hour * 60 + now.minute >= opens_min:
                            continue
                    return check_dt.replace(
                        hour=int(first.open.split(":")[0]),
                        minute=int(first.open.split(":")[1]),
                    )

        ds = oh.schedule.get(check_day_name)
        if ds and ds.enabled and ds.periods:
            first = sorted(ds.periods, key=lambda p: p.open)[0]
            if offset == 0:
                opens_min = _time_to_minutes(first.open)
                if now.hour * 60 + now.minute >= opens_min:
                    continue
            return check_dt.replace(
                hour=int(first.open.split(":")[0]),
                minute=int(first.open.split(":")[1]),
            )

    return None


def build_public_business_query() -> Dict[str, Any]:
    """Return MongoDB query filter that matches only publicly-visible businesses."""
    return {
        "is_active": True,
        "hours_configured": True,
        "latitude": {"$exists": True},
        "longitude": {"$exists": True},
    }
