"""Occurrence timing regressions against the 17 deployed line-54 audit failures."""
import io
import json
from pathlib import Path
import zipfile

import pytest

from mobility.schedule_revision import audit_schedule
from mobility.stop_occurrences import stop_occurrence_times
from routes.mobility import _predicted_stop_timeline
from utils.gtfs import parse_gtfs_zip
from utils.mobility_workers import _has_occurrence_timing, STATIC_SCHEMA_V


@pytest.fixture
def network():
    return json.loads((Path(__file__).parent / "fixtures/magdeburg_line54_occurrences.json").read_text())


def test_all_17_real_loop_trips_pass_without_dropping_trips(network):
    assert sum(len(r["trips"]) for r in network["routes"]) == 17
    assert audit_schedule(network)["ready_to_import"]
    assert audit_schedule(network)["warning_count"] == 0
    for route in network["routes"]:
        for trip in route["trips"]:
            timeline = _predicted_stop_timeline(route, trip, None)
            assert len(timeline) == len(trip["stop_ids"])
            assert [e["stop_id"] for e in timeline] == trip["stop_ids"]
            for entry, visit in zip(timeline, trip["stop_times_sequence"]):
                h, m = map(int, visit["arrival_time"].split(":"))
                assert entry["scheduled_arrival"] == h * 3600 + m * 60


def test_legacy_representation_reproduces_17_blockers(network):
    for route in network["routes"]:
        for trip in route["trips"]:
            del trip["stop_times_sequence"]
    report = audit_schedule(network)
    assert report["blocking_error_count"] == 17
    assert {e["code"] for e in report["blocking_errors"]} == {"INVALID_TRIP_TIMELINE"}
    assert report["warning_count"] == 17


@pytest.mark.parametrize("damage", ["short", "stop", "sequence", "order", "missing_time", "backwards", "arrival_after_departure"])
def test_malformed_or_backwards_occurrences_still_block(network, damage):
    trip = network["routes"][0]["trips"][0]
    visits = trip["stop_times_sequence"]
    if damage == "short":
        visits.pop()
    elif damage == "stop":
        visits[1]["stop_id"] = "wrong-stop"
    elif damage == "sequence":
        visits[1]["stop_sequence"] += 100
    elif damage == "order":
        trip["stop_sequences"][1] = trip["stop_sequences"][0]
    elif damage == "missing_time":
        del visits[1]["arrival_time"]
    elif damage == "backwards":
        visits[2]["arrival_time"] = visits[2]["departure_time"] = "04:00"
    else:
        visits[1]["arrival_time"] = "47:59"
    report = audit_schedule(network)
    assert not report["ready_to_import"]
    assert "INVALID_TRIP_TIMELINE" in {e["code"] for e in report["blocking_errors"]}


def test_missing_route_stop_does_not_shift_occurrence_alignment(network):
    route = network["routes"][0]
    trip = route["trips"][0]
    sid = trip["stop_ids"][1]
    route["stops"] = [s for s in route["stops"] if s["stop_id"] != sid]
    assert _predicted_stop_timeline(route, trip, None) == []


def test_schema12_requires_every_trip_to_have_aligned_occurrences(network):
    assert STATIC_SCHEMA_V == "12"
    assert _has_occurrence_timing(network)
    assert not _has_occurrence_timing(None)
    del network["routes"][0]["trips"][-1]["stop_times_sequence"]
    assert not _has_occurrence_timing(network)
    network["routes"][0]["trips"][-1]["stop_times_sequence"] = []
    assert not _has_occurrence_timing(network)


def test_parser_retains_second_visit_times_and_strict_metadata():
    files = {
        "agency.txt": "agency_id,agency_name\n190,Magdeburger Verkehrsbetriebe\n",
        "calendar.txt": "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\ns,1,1,1,1,1,0,0,20261022,20261030\n",
        "routes.txt": "route_id,agency_id,route_short_name,route_type\nr,190,54,3\n",
        "trips.txt": "route_id,service_id,trip_id,direction_id\nr,s,loop,0\n",
        "stops.txt": "stop_id,stop_name,stop_lat,stop_lon\nA,A,52.1,11.6\nB,B,52.11,11.61\n",
        "stop_times.txt": "trip_id,stop_sequence,stop_id,arrival_time,departure_time\nloop,0,A,04:18:00,04:19:00\nloop,5,B,04:25:00,04:25:00\nloop,11,A,04:27:00,04:28:00\n",
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    parsed = parse_gtfs_zip(buf.getvalue(), service_date="2026-10-22", agency_regex="Magdeburger", timezone="Europe/Berlin")
    route = parsed["routes"][0]
    trip = route["trips"][0]
    assert trip["stop_sequences"] == [0, 5, 11]
    assert trip["stop_ids"] == ["A", "B", "A"]
    assert trip["stop_times"]["A"] == "04:19"
    assert trip["stop_times_sequence"][2] == {
        "stop_sequence": 11, "stop_id": "A", "arrival_time": "04:27", "departure_time": "04:28",
    }
    assert trip["gtfs_route_id"] == "r"
    assert trip["direction_id"] == "0"
    assert trip["service_id"] == "s"
    assert route["gtfs_agency_ids"] == ["190"]
    assert audit_schedule(parsed)["ready_to_import"]
    assert _predicted_stop_timeline(route, trip, None)[2]["scheduled_departure"] == 4 * 3600 + 28 * 60


def test_legacy_nonloop_trip_falls_back_to_existing_maps():
    trip = {"stop_ids": ["A", "B"], "stop_times": {"A": "08:00", "B": "08:10"}}
    assert stop_occurrence_times(trip) is None
    route = {"stops": [{"stop_id": "A"}, {"stop_id": "B"}]}
    assert [e["scheduled_arrival"] for e in _predicted_stop_timeline(route, trip, None)] == [28800, 29400]
