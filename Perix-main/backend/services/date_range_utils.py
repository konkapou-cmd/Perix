from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Iterable

from fastapi import HTTPException


def parse_iso_date(value: str, field_name: str) -> date:
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=400,
            detail=f"{field_name} must use YYYY-MM-DD format",
        )


def validate_stay_dates(
    check_in_text: str,
    check_out_text: str | None,
    *,
    min_nights: int = 1,
    max_nights: int = 30,
) -> tuple[date, date, int]:
    if not check_out_text:
        raise HTTPException(status_code=400, detail="Checkout date is required")

    check_in = parse_iso_date(check_in_text, "Check-in")
    check_out = parse_iso_date(check_out_text, "Checkout")

    if check_out <= check_in:
        raise HTTPException(
            status_code=400,
            detail="Checkout must be after check-in",
        )

    nights = (check_out - check_in).days

    if nights < min_nights:
        raise HTTPException(
            status_code=400,
            detail=f"Minimum stay is {min_nights} night(s)",
        )
    if nights > max_nights:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum stay is {max_nights} night(s)",
        )

    return check_in, check_out, nights


def iter_stay_dates(check_in: date, check_out: date) -> Iterable[date]:
    current = check_in
    while current < check_out:
        yield current
        current += timedelta(days=1)


def ranges_overlap(
    start_a: str,
    end_a: str,
    start_b: str,
    end_b: str,
) -> bool:
    return start_a < end_b and start_b < end_a


def parse_price_to_cents(raw_value: str | None) -> int:
    if raw_value is None or not str(raw_value).strip():
        raise HTTPException(
            status_code=400,
            detail="A numeric nightly price is required",
        )

    normalized = str(raw_value).strip().replace(",", ".")

    try:
        amount = Decimal(normalized)
    except InvalidOperation:
        raise HTTPException(
            status_code=400,
            detail="Nightly price must be a plain numeric value",
        )

    if amount <= 0:
        raise HTTPException(
            status_code=400,
            detail="Nightly price must be greater than zero",
        )

    cents = (amount * Decimal("100")).quantize(
        Decimal("1"),
        rounding=ROUND_HALF_UP,
    )
    return int(cents)


def calculate_total_cents(
    nightly_rate_amount: int,
    nights: int,
    room_count: int,
) -> int:
    return nightly_rate_amount * nights * room_count
