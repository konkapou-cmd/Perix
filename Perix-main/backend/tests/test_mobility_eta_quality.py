"""Arrival source-quality regression tests; independent of MongoDB."""
from mobility.eta_quality import eta_source_for_stop


def test_gps_does_not_change_eta_source():
    assert eta_source_for_stop(None, "STOP_A") == "SCHEDULE"
    assert eta_source_for_stop({"delay_seconds": 0}, "STOP_A") == "SCHEDULE"


def test_stop_specific_realtime_and_no_data():
    update = {"stop_predictions": {"STOP_A": {"arrival_epoch": 1750000000}}}
    assert eta_source_for_stop(update, "STOP_A") == "REALTIME"
    assert eta_source_for_stop(update, "STOP_B") == "SCHEDULE"
    update["stop_relationships"] = {"STOP_A": "NO_DATA"}
    assert eta_source_for_stop(update, "STOP_A") == "SCHEDULE"


def test_genuine_zero_delay_is_realtime_when_reported():
    assert eta_source_for_stop({"delay_seconds": 0, "trip_delay_observed": True}, "A") == "REALTIME"
    assert eta_source_for_stop({"delay_seconds": 0, "trip_delay_observed": False}, "A") == "SCHEDULE"


def test_negative_delay_is_real_realtime_evidence():
    assert eta_source_for_stop({"delay_seconds": -60}, "A") == "REALTIME"
    assert eta_source_for_stop({"stop_delays": {"A": -40}}, "A") == "REALTIME"
