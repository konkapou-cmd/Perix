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
