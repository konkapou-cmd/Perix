"""Offline regressions: source journeys must not be hidden by inferred runs."""
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from routes import mobility as routes
from mobility import overrides
from mobility.motion import engine


def route_fixture():
    return {"route_number": "6", "mode": "tram", "stops": [
        {"stop_id": "A", "name": "Diesdorf", "lat": 52.129, "lng": 11.569},
        {"stop_id": "B", "name": "Hauptbahnhof", "lat": 52.129, "lng": 11.628},
    ], "trips": [
        {"trip_id": "out", "headsign": "Hauptbahnhof", "stop_ids": ["A", "B"],
         "stop_times": {"A": "17:44", "B": "17:58"}},
        {"trip_id": "back", "headsign": "Diesdorf", "stop_ids": ["B", "A"],
         "stop_times": {"B": "18:00", "A": "18:14"}},
    ]}


def identity(runs):
    return [[w["trip"]["trip_id"] for w in run["trips"]] for run in runs]


def test_realtime_does_not_regroup_or_change_virtual_run_identity():
    route = route_fixture()
    original = deepcopy(route)
    base = routes._chain_trips(route)
    delayed = routes._chain_trips(route, {"out": {"delay_seconds": 600}})
    early = routes._chain_trips(route, {"back": {"delay_seconds": -180}})
    assert identity(base) == identity(delayed) == identity(early) == [["out"], ["back"]]
    assert delayed[0]["trips"][0]["source_end"] == 17 * 3600 + 58 * 60 + 600
    assert route == original


def test_source_active_successor_wins_over_unverified_cached_predecessor():
    # Production route 6, 2026-10-24 18:03:36: source predecessor 844818
    # ended at 64792; successor 956987 began at 64800 and was omitted.
    old = {"trip": {"trip_id": "844818"}, "start": 63952, "end": 65500,
           "source_start": 63952, "source_end": 64792}
    new = {"trip": {"trip_id": "956987"}, "start": 64800, "end": 65640,
           "source_start": 64800, "source_end": 65640}
    selected, basis = routes._select_run_trip({"trips": [old, new]}, 65016)
    assert selected is new and basis == "SOURCE_ACTIVE"
    assert old["end"] == 65500  # no clock/coordinate surgery to conceal conflict


def test_a_late_trip_is_retained_when_no_source_successor_is_active():
    runs = routes._chain_trips(route_fixture(), effective_windows={
        "out": {"start": 63840, "end": 65300},
    })
    selected, basis = routes._select_run_trip(runs[0], 17 * 3600 + 59 * 60)
    assert selected["trip"]["trip_id"] == "out"
    assert basis == "PERIX_RETAINED"


def test_verified_same_block_retains_physical_continuity():
    route = route_fixture()
    for trip in route["trips"]:
        trip["block_id"] = "operator-block"
    run = routes._chain_trips(route, effective_windows={"out": {"start": 63840, "end": 65300}})[0]
    selected, basis = routes._select_run_trip(run, 65016)
    assert selected["trip"]["trip_id"] == "out"
    assert basis == "VERIFIED_BLOCK_RETAINED"


@pytest.mark.parametrize("blocks", [("one", "two"), ("one", None), (None, "two")])
def test_distinct_or_incomplete_source_blocks_are_not_merged(blocks):
    route = route_fixture()
    for trip, block in zip(route["trips"], blocks):
        trip["block_id"] = block
    assert identity(routes._chain_trips(route)) == [["out"], ["back"]]


@pytest.mark.parametrize("relationship", ["CANCELED", "DELETED"])
def test_provider_cancellation_is_never_replaced_by_a_virtual_vehicle(relationship):
    runs = routes._chain_trips(route_fixture(), {"back": {"trip_schedule_relationship": relationship}})
    assert identity(runs) == [["out"]]
    assert identity(routes._chain_trips(route_fixture(), skip_trip_ids={"out"})) == [["back"]]


@pytest.fixture
def fleet(monkeypatch):
    route = route_fixture()
    route["trips"][1]["stop_times"] = {"B": "18:10", "A": "18:24"}
    net = {"version_id": "v", "service_date": "2026-10-24", "routes": [route]}
    monkeypatch.setattr(routes, "db", SimpleNamespace(mobility_live=SimpleNamespace(
        find=Mock(return_value=SimpleNamespace(to_list=AsyncMock(return_value=[]))))))
    monkeypatch.setattr(routes, "_realtime_delays_for", AsyncMock(return_value={}))
    monkeypatch.setattr(overrides, "canceled_trip_ids", AsyncMock(return_value=set()))
    monkeypatch.setattr(engine, "cached_trip_windows", lambda **kwargs: {})
    monkeypatch.setattr(routes, "_estimate_trip_position", AsyncMock(return_value={
        "latitude": 52.13, "longitude": 11.62, "delay_minutes": 0,
        "position_source": "SCHEDULE_ESTIMATE", "pattern_id": "exact-pattern",
        "progress_m": 50, "_effective_timeline": None,
    }))
    return net


@pytest.mark.asyncio
async def test_inferred_long_layover_does_not_invent_a_parked_vehicle(fleet, monkeypatch):
    monkeypatch.setattr(routes, "_now_service_seconds", lambda *args: 18 * 3600 + 4 * 60)
    assert await routes._compute_estimated_transit_vehicles(fleet) == []


@pytest.mark.asyncio
@pytest.mark.parametrize("now", [17 * 3600 + 57 * 60, 18 * 3600 + 11 * 60])
async def test_active_trips_keep_existing_positions_and_exact_run_id(fleet, monkeypatch, now):
    monkeypatch.setattr(routes, "_now_service_seconds", lambda *args: now)
    vehicles = await routes._compute_estimated_transit_vehicles(fleet)
    assert len(vehicles) == 1
    vehicle = vehicles[0]
    assert vehicle["latitude"] == 52.13 and vehicle["longitude"] == 11.62
    assert vehicle["trip_id"] == ("out" if now < 18 * 3600 else "back")
    assert vehicle["vehicle_id"].endswith(":6:" + vehicle["trip_id"])
    assert vehicle["trip_selection_basis"] == "SOURCE_ACTIVE"
    assert vehicle["run_identity_basis"] == "DATED_SOURCE_TRIP"


@pytest.mark.asyncio
@pytest.mark.parametrize("now", [17 * 3600 + 58 * 60 + 30, 18 * 3600 + 9 * 60 + 30])
async def test_existing_sixty_second_trip_edge_grace_is_retained(fleet, monkeypatch, now):
    monkeypatch.setattr(routes, "_now_service_seconds", lambda *args: now)
    vehicles = await routes._compute_estimated_transit_vehicles(fleet)
    assert len(vehicles) == 1 and vehicles[0]["position_state"] == "TURNAROUND_ANCHOR"


@pytest.mark.asyncio
async def test_two_overlapping_source_journeys_are_not_merged_into_one_inferred_physical_bus(fleet, monkeypatch):
    route = fleet["routes"][0]
    route["trips"][0]["stop_times"]["B"] = "18:15"
    monkeypatch.setattr(routes, "_now_service_seconds", lambda *args: 18 * 3600 + 12 * 60)
    vehicles = await routes._compute_estimated_transit_vehicles(fleet)
    assert {v["trip_id"] for v in vehicles} == {"out", "back"}
    assert len({v["vehicle_id"] for v in vehicles}) == 2
    for v in vehicles:
        assert v["vehicle_id"].endswith(":6:" + v["trip_id"])
        assert v["estimated"] is True and v["run_identity_basis"] == "DATED_SOURCE_TRIP"


def notice_domain():
    return {"network": {"region_id": "magdeburg", "network_id": "de-magdeburg-mvb", "service_date": "2026-10-24"},
            "stops": [{"stop_id": "physical:jordan", "name": "Jordanstraße", "stop_ids": ["J-east", "J-west"]}],
            "patterns": [{"pattern_id": "13:real", "route_number": "13", "mode": "tram", "stop_ids": ["S", "J-east", "H"]},
                         {"pattern_id": "9:real", "route_number": "9", "mode": "tram", "stop_ids": ["S", "J-east", "H"]}]}


def test_operator_notice_warns_without_changing_any_geometry_or_clocks():
    from mobility.service_notices import notices_for_domain
    domain = notice_domain()
    original = deepcopy(domain)
    notices = notices_for_domain(domain)
    assert list(notices) == ["13:real"]
    assert notices["13:real"]["status"] == "OPERATOR_DIVERSION_NOT_IN_TIMETABLE"
    assert notices["13:real"]["position_verified"] is False
    assert notices["13:real"]["source_url"].startswith("https://www.mvbnet.de/")
    assert domain == original


def test_notice_clears_when_importer_stop_sequence_has_been_corrected():
    from mobility.service_notices import notices_for_domain
    domain = notice_domain()
    domain["patterns"][0]["stop_ids"] = ["S", "Hertz", "Raiffeisen", "Fuchsberg", "H"]
    assert notices_for_domain(domain) == {}


def test_stale_operator_review_is_not_presented_as_fresh_indefinitely():
    from mobility.service_notices import notices_for_domain
    domain = notice_domain()
    domain["network"]["service_date"] = "2026-10-26"
    notice = notices_for_domain(domain)["13:real"]
    assert notice["status"] == "OPERATOR_NOTICE_REVIEW_REQUIRED"
    assert notice["review_required"] is True


@pytest.mark.parametrize("change", ["region", "network", "date", "before_start"])
def test_operator_notice_never_leaks_to_other_regions_or_service_days(change):
    from mobility.service_notices import notices_for_domain
    domain = notice_domain()
    key, value = {"region": ("region_id", "other"), "network": ("network_id", "other"),
                  "date": ("service_date", "invalid"), "before_start": ("service_date", "2026-10-16")}[change]
    domain["network"][key] = value
    assert notices_for_domain(domain) == {}
