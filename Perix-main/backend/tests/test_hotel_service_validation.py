"""Hotel service validation tests."""
import sys, os, pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import HTTPException
from routes.services import validate_date_range_service_for_publish
from services.date_range_utils import parse_price_to_cents


def make_valid_hotel():
    return {
        "inventory_count": 5,
        "max_guests": 2,
        "max_adults": 2,
        "max_children": 1,
        "min_nights": 1,
        "max_nights": 30,
        "price": "120.00",
        "available_from": "2026-10-01",
        "available_until": "2026-12-31",
        "check_in_time": "15:00",
        "check_out_time": "11:00",
    }


def test_valid_hotel_passes():
    validate_date_range_service_for_publish(make_valid_hotel())


def test_missing_available_from():
    h = make_valid_hotel(); h["available_from"] = None
    with pytest.raises(HTTPException): validate_date_range_service_for_publish(h)


def test_missing_available_until():
    h = make_valid_hotel(); h["available_until"] = None
    with pytest.raises(HTTPException): validate_date_range_service_for_publish(h)


def test_end_before_start():
    h = make_valid_hotel(); h["available_until"] = "2026-09-01"
    with pytest.raises(HTTPException): validate_date_range_service_for_publish(h)


def test_inventory_zero():
    h = make_valid_hotel(); h["inventory_count"] = 0
    with pytest.raises(HTTPException): validate_date_range_service_for_publish(h)


def test_max_guests_zero():
    h = make_valid_hotel(); h["max_guests"] = 0
    with pytest.raises(HTTPException): validate_date_range_service_for_publish(h)


def test_max_adults_zero():
    h = make_valid_hotel(); h["max_adults"] = 0
    with pytest.raises(HTTPException): validate_date_range_service_for_publish(h)


def test_max_children_negative():
    h = make_valid_hotel(); h["max_children"] = -1
    with pytest.raises(HTTPException): validate_date_range_service_for_publish(h)


def test_min_nights_zero():
    h = make_valid_hotel(); h["min_nights"] = 0
    with pytest.raises(HTTPException): validate_date_range_service_for_publish(h)


def test_max_nights_less_than_min():
    h = make_valid_hotel(); h["max_nights"] = 1; h["min_nights"] = 3
    with pytest.raises(HTTPException): validate_date_range_service_for_publish(h)


def test_price_zero():
    h = make_valid_hotel(); h["price"] = "0"
    with pytest.raises(HTTPException): validate_date_range_service_for_publish(h)


def test_price_negative():
    h = make_valid_hotel(); h["price"] = "-50"
    with pytest.raises(HTTPException): validate_date_range_service_for_publish(h)


def test_invalid_price():
    h = make_valid_hotel(); h["price"] = "abc"
    with pytest.raises(HTTPException): validate_date_range_service_for_publish(h)


def test_invalid_check_in_time():
    h = make_valid_hotel(); h["check_in_time"] = "25:00"
    with pytest.raises(HTTPException): validate_date_range_service_for_publish(h)


def test_invalid_check_out_time():
    h = make_valid_hotel(); h["check_out_time"] = "abc"
    with pytest.raises(HTTPException): validate_date_range_service_for_publish(h)
