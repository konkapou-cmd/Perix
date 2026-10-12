from mobility.traffic_counts import normalize_count_row, normalize_road_name
from mobility.traffic_profiles import (
    _day_type,
    _interval_minutes,
    _speed_from_volume,
)


def test_count_normalization_keeps_authoritative_source_fields():
    row = normalize_count_row(
        {
            "count_site_id": "MD-001",
            "measurement_date": "2026-05-12",
            "interval_start": "07:00",
            "interval_end": "08:00",
            "road_name": "Leipziger Straße",
            "approach_key": "N",
            "total": "840",
            "method": "AUTOMATIC",
            "osm_direction": "BOTH",
        }
    )
    assert row["total"] == 840
    assert row["source"] == "CITY_TRAFFIC_COUNTS:magdeburg"
    assert row["region_id"] == "magdeburg"
    assert row["network_id"] == "de-magdeburg-mvb"
    assert row["source_year"] == 2026
    assert row["osm_direction"] == "BOTH"


def test_road_name_normalization_handles_german_strasse():
    assert normalize_road_name("Leipziger Straße") == normalize_road_name("Leipziger Str.")


def test_bpr_speed_decreases_when_flow_increases():
    _, low_speed = _speed_from_volume(50.0, 300.0, 1200.0)
    _, high_speed = _speed_from_volume(50.0, 1200.0, 1200.0)
    assert high_speed < low_speed


def test_interval_duration_handles_midnight():
    assert _interval_minutes("23:30", "00:30") == 60


def test_day_type():
    assert _day_type("2026-10-12") == "WEEKDAY"
    assert _day_type("2026-10-17") == "SATURDAY"
    assert _day_type("2026-10-18") == "SUNDAY"
