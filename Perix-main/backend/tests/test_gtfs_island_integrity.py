import csv
from copy import deepcopy
import io
from pathlib import Path
import zipfile

import pytest

from mobility.regions import get_region
from utils import gtfs


@pytest.fixture(autouse=True)
def magdeburg_region(monkeypatch):
    monkeypatch.setattr(gtfs, "get_active_region", lambda: get_region("magdeburg"))


def feed(*, routes=None, trips=None, times=None):
    tables = {
        "agency.txt": (
            ["agency_id", "agency_name"],
            [["mvb", "Magdeburger Verkehrsbetriebe"], ["municipal", "Municipal"], ["ktel", "KTEL"]],
        ),
        "routes.txt": (
            ["route_id", "agency_id", "route_short_name", "route_long_name", "route_type"],
            routes if routes is not None else [["r1", "mvb", "1", "Line one", "0"]],
        ),
        "trips.txt": (
            ["route_id", "service_id", "trip_id", "direction_id", "block_id"],
            trips if trips is not None else [["r1", "daily", "t1", "0", "b1"]],
        ),
        "stops.txt": (
            ["stop_id", "stop_name", "stop_lat", "stop_lon"],
            [["A", "Alpha", "52.1", "11.6"], ["B", "Beta", "52.2", "11.7"]],
        ),
        "calendar_dates.txt": (
            ["service_id", "date", "exception_type"], [["daily", "20261022", "1"]],
        ),
        "stop_times.txt": (
            ["trip_id", "stop_sequence", "stop_id", "arrival_time", "departure_time"],
            times if times is not None else [
                ["t1", "1", "A", "08:00:00", "08:01:00"],
                ["t1", "2", "B", "08:10:00", "08:11:00"],
            ],
        ),
    }
    result = io.BytesIO()
    with zipfile.ZipFile(result, "w") as archive:
        for name, (header, rows) in tables.items():
            text = io.StringIO(newline="")
            writer = csv.writer(text)
            writer.writerow(header)
            writer.writerows(rows)
            archive.writestr(name, text.getvalue())
    return result.getvalue()


def parse(content, agency_regex="Magdeburger|Municipal|KTEL"):
    return gtfs.parse_gtfs_zip(content, "2026-10-22", agency_regex, "Europe/Berlin")


def test_magdeburg_public_number_and_legacy_times_are_unchanged():
    route, = parse(feed())["routes"]
    assert (route["route_number"], route["mode"]) == ("1", "tram")
    assert route["public_route_number"] == "1"
    assert route["agency_id"] == "mvb"
    trip, = route["trips"]
    assert trip["stop_times"] == {"A": "08:01", "B": "08:11"}
    assert trip["stop_times_arrival"] == {"A": "08:00", "B": "08:10"}
    assert (trip["agency_id"], trip["gtfs_route_id"], trip["direction_id"], trip["service_id"]) == (
        "mvb", "r1", "0", "daily",
    )
    assert trip["block_id"] == "b1"


def test_cross_agency_collision_is_namespaced_without_merging():
    content = feed(
        routes=[["mun-1", "municipal", "1", "Town", "3"], ["ktel-1", "ktel", "1", "Regional", "3"]],
        trips=[["mun-1", "daily", "t1", "0", ""], ["ktel-1", "daily", "t2", "1", ""]],
        times=[
            ["t1", "1", "A", "08:00", "08:00"], ["t1", "2", "B", "08:10", "08:10"],
            ["t2", "1", "B", "09:00", "09:00"], ["t2", "2", "A", "09:10", "09:10"],
        ],
    )
    routes = {r["route_number"]: r for r in parse(content)["routes"]}
    assert set(routes) == {"municipal/1", "ktel/1"}
    for label, agency, rid, tid in [
        ("municipal/1", "municipal", "mun-1", "t1"), ("ktel/1", "ktel", "ktel-1", "t2"),
    ]:
        route = routes[label]
        assert route["public_route_number"] == "1"
        assert route["agency_id"] == agency
        trip, = route["trips"]
        assert (trip["trip_id"], trip["gtfs_route_id"]) == (tid, rid)
    # Filtering out the colliding operator restores the shipped public label.
    route, = parse(content, "Municipal")["routes"]
    assert route["route_number"] == "1"


def test_same_agency_route_variants_still_group_and_keep_provenance():
    route, = parse(feed(
        routes=[["r1", "mvb", "1", "Outbound", "0"], ["r2", "mvb", "1", "Inbound", "0"]],
        trips=[["r1", "daily", "t1", "0", ""], ["r2", "daily", "t2", "1", ""]],
        times=[
            ["t1", "1", "A", "08:00", "08:00"], ["t1", "2", "B", "08:10", "08:10"],
            ["t2", "1", "B", "09:00", "09:00"], ["t2", "2", "A", "09:10", "09:10"],
        ],
    ))["routes"]
    assert route["route_number"] == "1"
    assert [(t["gtfs_route_id"], t["direction_id"]) for t in route["trips"]] == [("r1", "0"), ("r2", "1")]


def test_ordered_occurrences_keep_loop_dwell_seconds_and_gtfs_extended_hours():
    route, = parse(feed(times=[
        ["t1", "30", "A", "25:00:05", "25:01:10"],
        ["t1", "10", "A", "23:50:05", "23:51:10"],
        ["t1", "20", "B", "24:10:00", "24:11:00"],
    ]))["routes"]
    trip, = route["trips"]
    assert trip["stop_ids"] == ["A", "B", "A"]
    assert trip["stop_sequences"] == [10, 20, 30]
    assert trip["stop_times_sequence"] == [
        {"stop_sequence": 10, "stop_id": "A", "arrival_time": "23:50:05", "departure_time": "23:51:10"},
        {"stop_sequence": 20, "stop_id": "B", "arrival_time": "24:10", "departure_time": "24:11"},
        {"stop_sequence": 30, "stop_id": "A", "arrival_time": "25:00:05", "departure_time": "25:01:10"},
    ]
    assert trip["stop_times"]["A"] == "23:51:10"
    assert [s["stop_id"] for s in route["stops"]] == ["A", "B"]


@pytest.fixture
def loop_trip():
    route, = parse(feed(times=[
        ["t1", "30", "A", "25:00:05", "25:01:10"],
        ["t1", "10", "A", "23:50:05", "23:51:10"],
        ["t1", "20", "B", "24:10", "24:11"],
    ]))["routes"]
    return route, route["trips"][0]


def test_timeline_uses_occurrence_times_for_repeated_stops(loop_trip):
    from routes.mobility import _predicted_stop_timeline

    route, trip = loop_trip
    original = deepcopy(trip)
    timeline = _predicted_stop_timeline(route, trip, None)
    assert [s["stop_id"] for s in timeline] == ["A", "B", "A"]
    assert [s["scheduled_arrival"] for s in timeline] == [85805, 87000, 90005]
    assert [s["scheduled_departure"] for s in timeline] == [85870, 87060, 90070]
    assert [s["predicted_arrival"] for s in timeline] == [85805, 87000, 90005]
    assert [s["predicted_departure"] for s in timeline] == [85870, 87060, 90070]
    assert trip == original


@pytest.mark.parametrize("damage", [
    "short_entries", "short_ids", "short_sequences", "wrong_sid", "wrong_sequence",
    "shifted_loop", "duplicate_sequence", "reversed_sequence", "missing_stop",
    "missing_ids", "missing_sequences", "null_entries", "empty_entries", "bad_entry",
])
def test_timeline_rejects_misaligned_occurrences(loop_trip, damage):
    from routes.mobility import _predicted_stop_timeline

    route, trip = loop_trip
    if damage == "short_entries":
        trip["stop_times_sequence"].pop()
    elif damage == "short_ids":
        trip["stop_ids"].pop()
    elif damage == "short_sequences":
        trip["stop_sequences"].pop()
    elif damage == "wrong_sid":
        trip["stop_times_sequence"][1]["stop_id"] = "A"
    elif damage == "wrong_sequence":
        trip["stop_times_sequence"][1]["stop_sequence"] = 21
    elif damage == "shifted_loop":
        # Identical stop IDs at either end must not hide a sequence swap.
        entries = trip["stop_times_sequence"]
        entries[0], entries[2] = entries[2], entries[0]
    elif damage in ("duplicate_sequence", "reversed_sequence"):
        sequence = 10 if damage == "duplicate_sequence" else 5
        trip["stop_sequences"][1] = sequence
        trip["stop_times_sequence"][1]["stop_sequence"] = sequence
    elif damage == "missing_stop":
        route["stops"].pop()
    elif damage == "missing_ids":
        del trip["stop_ids"]
    elif damage == "missing_sequences":
        del trip["stop_sequences"]
    elif damage == "null_entries":
        trip["stop_times_sequence"] = None
    elif damage == "empty_entries":
        trip["stop_times_sequence"] = []
    elif damage == "bad_entry":
        trip["stop_times_sequence"][1] = None
    with pytest.raises(ValueError, match="trip 't1': invalid stop_times_sequence alignment"):
        _predicted_stop_timeline(route, trip, None)


def test_timeline_legacy_payload_falls_back_to_time_dictionaries():
    from routes.mobility import _predicted_stop_timeline

    route, = parse(feed())["routes"]
    trip, = route["trips"]
    del trip["stop_times_sequence"]
    del trip["stop_sequences"]
    timeline = _predicted_stop_timeline(route, trip, None)
    assert [s["scheduled_arrival"] for s in timeline] == [28800, 29400]
    assert [s["scheduled_departure"] for s in timeline] == [28860, 29460]


def test_timeline_occurrence_early_hours_are_not_auto_rolled_over():
    from routes.mobility import _predicted_stop_timeline

    route, = parse(feed(times=[
        ["t1", "1", "A", "01:00", "01:01"],
        ["t1", "2", "B", "01:10", "01:11"],
    ]))["routes"]
    timeline = _predicted_stop_timeline(route, route["trips"][0], None)
    assert [s["scheduled_arrival"] for s in timeline] == [3600, 4200]


@pytest.mark.parametrize("relationship", ["CANCELED", "DELETED"])
def test_timeline_canceled_trip_still_returns_empty(loop_trip, relationship):
    from routes.mobility import _predicted_stop_timeline

    route, trip = loop_trip
    trip["stop_times_sequence"] = None
    assert _predicted_stop_timeline(route, trip, {"trip_schedule_relationship": relationship}) == []


def test_timeline_occurrences_keep_skipped_stop_delay_behavior(loop_trip):
    from routes.mobility import _predicted_stop_timeline

    route, trip = loop_trip
    timeline = _predicted_stop_timeline(route, trip, {
        "delay_seconds": 60,
        "stop_relationships": {"B": "SKIPPED"},
        "stop_predictions": {"B": {"departure_delay_seconds": 300}},
    })
    assert [s["relationship"] for s in timeline] == ["SCHEDULED", "SKIPPED", "SCHEDULED"]
    assert timeline[1]["predicted_departure"] == 87060 + 300
    assert timeline[2]["predicted_arrival"] == 90005 + 60
    assert timeline[2]["predicted_departure"] == 90070 + 60


@pytest.mark.parametrize("arrival,departure,reason", [
    ("07:59", "08:10", "precedes previous departure_time"),
    ("08:10", "08:09", "precedes arrival_time"),
    ("-1:10", "08:10", "invalid GTFS time"),
    ("08:60", "09:10", "invalid GTFS time"),
    ("08:10:60", "09:10", "invalid GTFS time"),
    ("broken", "09:10", "invalid GTFS time"),
    ("08:10", "08:xx", "invalid GTFS time"),
    ("08:10:40", "08:10:39", "precedes arrival_time"),
    ("08:00:29", "08:10", "precedes previous departure_time"),
])
def test_malformed_selected_trip_fails_explicitly(arrival, departure, reason):
    with pytest.raises(ValueError, match=reason) as error:
        parse(feed(times=[
            ["t1", "1", "A", "08:00", "08:00:30"],
            ["t1", "2", "B", arrival, departure],
        ]))
    assert "trip 't1', stop 'B', stop_sequence" in str(error.value)


def test_broken_midnight_times_are_not_automatically_rolled_over():
    with pytest.raises(ValueError, match="precedes previous departure_time"):
        parse(feed(times=[
            ["t1", "1", "A", "23:50", "23:50"], ["t1", "2", "B", "00:10", "00:10"],
        ]))


@pytest.mark.parametrize("island", ["syros", "mykonos"])
def test_packaged_synthetic_chronology(island):
    path = Path(__file__).resolve().parents[3] / "web-observer" / f"{island}_synthetic.gtfs.zip"
    if not path.exists():
        pytest.skip("Optional packaged synthetic feed is not present")
    if island == "mykonos":
        with pytest.raises(ValueError, match=r"trip .+, stop .+, stop_sequence .+: .*precedes"):
            gtfs.parse_gtfs_zip_path(path, "2026-10-22", ".*", "Europe/Athens")
    else:
        payload = gtfs.parse_gtfs_zip_path(path, "2026-10-22", ".*", "Europe/Athens")
        assert payload["routes"]
        assert all(t["stop_times_sequence"] for r in payload["routes"] for t in r["trips"])
