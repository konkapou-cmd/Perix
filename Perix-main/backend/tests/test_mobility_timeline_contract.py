import pytest

from routes import mobility
from routes.mobility import _predicted_stop_timeline


ROUTE = {
    "route_number": "T",
    "mode": "bus",
    "stops": [
        {"stop_id": "A", "name": "A", "lat": 52.1, "lng": 11.6},
        {"stop_id": "B", "name": "B", "lat": 52.1, "lng": 11.61},
    ],
}

TRIP = {
    "trip_id": "trip-1",
    "stop_ids": ["A", "B"],
    "stop_times_arrival": {"A": "08:00", "B": "08:10"},
    "stop_times": {"A": "08:01", "B": "08:11"},
}


def test_timeline_preserves_separate_gtfs_arrival_and_departure():
    timeline = _predicted_stop_timeline(ROUTE, TRIP, None)
    assert timeline[0]["scheduled_arrival"] == 8 * 3600
    assert timeline[0]["scheduled_departure"] == 8 * 3600 + 60
    assert timeline[0]["predicted_arrival"] == 8 * 3600
    assert timeline[0]["predicted_departure"] == 8 * 3600 + 60


def test_timeline_preserves_separate_realtime_arrival_departure_delays():
    realtime = {
        "stop_predictions": {
            "A": {
                "arrival_delay_seconds": 60,
                "departure_delay_seconds": 120,
            }
        },
        "stop_delays": {"A": 60},
        "delay_seconds": 60,
    }
    timeline = _predicted_stop_timeline(ROUTE, TRIP, realtime)
    assert timeline[0]["predicted_arrival"] == 8 * 3600 + 60
    assert timeline[0]["predicted_departure"] == 8 * 3600 + 60 + 120


@pytest.mark.parametrize("prediction, expected_delay", [
    ({"arrival_delay_seconds": 300}, 300),
    ({"departure_delay_seconds": 360}, 360),
    ({"departure_delay_seconds": -30}, -30),
    ({"arrival_delay_seconds": 300, "departure_delay_seconds": 360}, 360),
    ({"arrival_delay_seconds": 0, "departure_delay_seconds": 0}, 0),
    ({"arrival_delay_seconds": -30, "departure_delay_seconds": -30}, -30),
])
def test_sparse_stop_delay_propagates_to_following_stops(prediction, expected_delay):
    realtime = {"delay_seconds": 60, "stop_predictions": {"A": prediction}}

    timeline = _predicted_stop_timeline(ROUTE, TRIP, realtime)

    assert timeline[1]["delay_seconds"] == expected_delay
    assert timeline[1]["predicted_departure"] == 8 * 3600 + 11 * 60 + expected_delay


@pytest.mark.parametrize("prediction", [
    {"departure_delay_seconds": -30},
    {"departure_epoch": 8 * 3600 + 60 - 30},
])
def test_departure_only_prediction_keeps_coherent_arrival(monkeypatch, prediction):
    monkeypatch.setattr(mobility, "_epoch_to_service_seconds", lambda value: value)
    realtime = {"delay_seconds": 60, "stop_predictions": {"A": prediction}}

    timeline = _predicted_stop_timeline(ROUTE, TRIP, realtime)

    assert timeline[0]["predicted_arrival"] == 8 * 3600 - 30
    assert timeline[0]["predicted_departure"] == 8 * 3600 + 60 - 30
    assert timeline[1]["delay_seconds"] == -30


def test_absolute_prediction_propagates_departure_delay(monkeypatch):
    monkeypatch.setattr(mobility, "_epoch_to_service_seconds", lambda value: value)
    realtime = {"stop_predictions": {"A": {
        "arrival_epoch": 8 * 3600 + 300,
        "departure_epoch": 8 * 3600 + 60 + 360,
    }}}

    timeline = _predicted_stop_timeline(ROUTE, TRIP, realtime)

    assert timeline[1]["delay_seconds"] == 360


@pytest.mark.parametrize("relationship, expected_delay", [("SKIPPED", 300), ("NO_DATA", 0)])
def test_sparse_relationship_propagation(relationship, expected_delay):
    route = {**ROUTE, "stops": [*ROUTE["stops"], {"stop_id": "C", "name": "C"}]}
    trip = {
        **TRIP,
        "stop_ids": ["A", "B", "C"],
        "stop_times_arrival": {**TRIP["stop_times_arrival"], "C": "08:20"},
        "stop_times": {**TRIP["stop_times"], "C": "08:21"},
    }
    realtime = {
        "delay_seconds": 60,
        "stop_predictions": {"A": {"departure_delay_seconds": 300}},
        "stop_relationships": {"B": relationship},
    }

    timeline = _predicted_stop_timeline(route, trip, realtime)

    assert timeline[2]["delay_seconds"] == expected_delay
    assert timeline[2]["relationship"] == ("NO_DATA" if relationship == "NO_DATA" else "SCHEDULED")


def test_explicit_prediction_resumes_after_no_data():
    realtime = {
        "delay_seconds": 60,
        "stop_relationships": {"A": "NO_DATA"},
        "stop_predictions": {"B": {"arrival_delay_seconds": 120}},
    }

    timeline = _predicted_stop_timeline(ROUTE, TRIP, realtime)

    assert timeline[0]["delay_seconds"] == 0
    assert timeline[1]["delay_seconds"] == 120
