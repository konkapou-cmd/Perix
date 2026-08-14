"""Unit tests for date range utilities."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi import HTTPException

from services.date_range_utils import (
    calculate_total_cents,
    parse_iso_date,
    parse_price_to_cents,
    ranges_overlap,
    validate_stay_dates,
)


def test_parse_valid_iso_date():
    d = parse_iso_date("2026-08-10", "test")
    assert d.year == 2026
    assert d.month == 8
    assert d.day == 10


def test_parse_invalid_iso_date():
    with pytest.raises(HTTPException):
        parse_iso_date("not-a-date", "test")


def test_checkout_is_exclusive():
    check_in, check_out, nights = validate_stay_dates("2026-08-10", "2026-08-13")
    assert check_in.isoformat() == "2026-08-10"
    assert check_out.isoformat() == "2026-08-13"
    assert nights == 3


def test_checkout_must_follow_checkin():
    with pytest.raises(HTTPException):
        validate_stay_dates("2026-08-10", "2026-08-10")


def test_checkout_before_checkin():
    with pytest.raises(HTTPException):
        validate_stay_dates("2026-08-13", "2026-08-10")


def test_minimum_nights():
    with pytest.raises(HTTPException):
        validate_stay_dates("2026-08-10", "2026-08-11", min_nights=2)


def test_maximum_nights():
    with pytest.raises(HTTPException):
        validate_stay_dates("2026-08-10", "2026-08-20", max_nights=5)


def test_stay_dates_iteration():
    from services.date_range_utils import iter_stay_dates
    from datetime import date
    check_in = date(2026, 8, 10)
    check_out = date(2026, 8, 13)
    dates = list(iter_stay_dates(check_in, check_out))
    assert len(dates) == 3
    assert dates[0] == date(2026, 8, 10)
    assert dates[1] == date(2026, 8, 11)
    assert dates[2] == date(2026, 8, 12)
    assert date(2026, 8, 13) not in dates  # checkout is exclusive


def test_ranges_overlap_with_exclusive_checkout():
    assert ranges_overlap("2026-08-10", "2026-08-13", "2026-08-12", "2026-08-14")
    assert not ranges_overlap("2026-08-10", "2026-08-13", "2026-08-13", "2026-08-14")


def test_price_integer():
    assert parse_price_to_cents("129") == 12900


def test_price_decimal():
    assert parse_price_to_cents("129.90") == 12990


def test_price_comma_decimal():
    assert parse_price_to_cents("129,90") == 12990


def test_price_zero():
    with pytest.raises(HTTPException):
        parse_price_to_cents("0")


def test_price_negative():
    with pytest.raises(HTTPException):
        parse_price_to_cents("-50")


def test_price_invalid():
    with pytest.raises(HTTPException):
        parse_price_to_cents("abc")


def test_price_empty():
    with pytest.raises(HTTPException):
        parse_price_to_cents("")


def test_calculate_total():
    assert calculate_total_cents(12990, 3, 2) == 77940  # 129.90 * 3 * 2
