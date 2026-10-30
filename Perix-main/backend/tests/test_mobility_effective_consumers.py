"""Consumer contracts, with all database and geometry/network access stubbed."""
import asyncio
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from mobility import arrivals, domain, motion, overrides
from mobility.motion import engine
from routes import mobility


def run(awaitable):
    return asyncio.run(awaitable)


@pytest.fixture
def service(monkeypatch):
    route = {
        "route_number": "T", "mode": "bus",
        "stops": [
            {"stop_id": "A", "name": "Alpha", "lat": 52.1, "lng": 11.6},
            {"stop_id": "B", "name": "Beta", "lat": 52.1, "lng": 11.61},
        ],
        "trips": [
            {"trip_id": "out", "stop_ids": ["A", "B"],
             "stop_times_arrival": {"A": "08:00", "B": "08:10"},
             "stop_times": {"A": "08:01", "B": "08:11"}},
            {"trip_id": "back", "stop_ids": ["B", "A"],
             "stop_times_arrival": {"B": "08:13", "A": "08:23"},
             "stop_times": {"B": "08:14", "A": "08:24"}},
        ],
    }
    network = {"version_id": "v", "routes": [route]}
    monkeypatch.setattr(mobility, "MOTION_ENGINE_ENABLED", True)
    monkeypatch.setattr(mobility, "_get_active_network", AsyncMock(return_value=network))
    monkeypatch.setattr(mobility, "_network_route", AsyncMock(return_value=route))
    monkeypatch.setattr(mobility, "_now_service_seconds", lambda: 8 * 3600 + 12 * 60)
    monkeypatch.setattr(mobility, "_realtime_delays_for", AsyncMock(return_value={}))
    monkeypatch.setattr(mobility, "_ESTIMATES_CACHE", {})
    monkeypatch.setattr(mobility, "_trip_path_geometry", AsyncMock(return_value={
        "stop_progress": [0, 1000], "total_m": 1000, "pattern_id": "p",
    }))
    monkeypatch.setattr(mobility, "_point_heading_at_progress", lambda *args: (
        {"lat": 52.1, "lng": 11.605}, 90,
    ))
    monkeypatch.setattr(overrides, "canceled_trip_ids", AsyncMock(return_value=set()))
    monkeypatch.setattr(overrides, "skipped_stop_ids", AsyncMock(return_value={}))
    live = SimpleNamespace(
        find=Mock(return_value=SimpleNamespace(to_list=AsyncMock(return_value=[]))),
        find_one=AsyncMock(return_value=None),
    )
    database = SimpleNamespace(mobility_live=live, mobility_vehicle_state=live)
    monkeypatch.setattr(mobility, "db", database)
    monkeypatch.setattr(arrivals, "db", database)
    calls = []

    async def effective(**kwargs):
        calls.append(deepcopy(kwargs))
        timeline = deepcopy(kwargs["timeline"])
        floor = kwargs.get("departure_floor_s")
        shift = max(0, (floor or 0) - timeline[0]["predicted_departure"])
        for i, entry in enumerate(timeline):
            entry["raw_predicted_arrival"] = entry["predicted_arrival"]
            entry["raw_predicted_departure"] = entry["predicted_departure"]
            # The first trip's physically achievable final arrival is +300s.
            extra = 300 if kwargs["trip_id"] == "out" and i else shift
            entry["predicted_arrival"] += extra
            entry["predicted_departure"] += extra
            entry["delay_seconds"] = entry["predicted_arrival"] - entry["scheduled_arrival"]
        return timeline

    monkeypatch.setattr(engine, "effective_timeline_for_trip", effective, raising=False)

    async def position(**kwargs):
        kwargs = {k: v for k, v in kwargs.items() if k != "include_failure_reason"}
        timeline = await effective(**kwargs)
        return {"progress_m": 500, "next_timeline_index": 1,
                "effective_timeline": timeline, "motion_available": True}

    monkeypatch.setattr(motion, "position_for_trip", position)
    return SimpleNamespace(route=route, network=network, calls=calls, live=live)


def test_late_trip_keeps_run_identity_even_with_realtime(service):
    runs = mobility._chain_trips(service.route, {"out": {"delay_seconds": 600}})
    assert len(runs) == 1
    assert [w["trip"]["trip_id"] for w in runs[0]["trips"]] == ["out", "back"]


def test_windows_absorb_layover_and_do_not_compound(service):
    original = deepcopy(service.route)
    results = [run(mobility._effective_trip_windows(
        service.route, {}, "v", 8 * 3600 + 12 * 60,
    )) for _ in range(2)]
    assert results[0] == results[1]
    outbound, successor = results[0][0]["trips"]
    assert outbound["end"] == 8 * 3600 + 16 * 60
    assert successor["departure_floor_s"] == outbound["end"]
    assert successor["timeline"][0]["predicted_departure"] == outbound["end"]
    assert successor["timeline"][-1]["delay_seconds"] == 120
    assert service.route == original


def test_position_survives_raw_end_and_uses_effective_next_stop(service):
    pos = run(mobility._estimate_trip_position(
        service.route, service.route["trips"][0], 8 * 3600 + 14 * 60, {}, "v",
        allow_live_fetch=False,
    ))
    assert pos is not None
    assert pos["next_stop_id"] == "B"
    assert pos["delay_minutes"] == 5


def test_fleet_keeps_late_predecessor_instead_of_starting_successor(service):
    vehicles = run(mobility._estimated_transit_vehicles(allow_live_fetch=False))
    assert len(vehicles) == 1
    assert vehicles[0]["vehicle_id"] == "est_T_out"
    assert vehicles[0]["trip_id"] == "out"
    assert vehicles[0]["delay_minutes"] == 5


def test_selected_details_use_plus_300_and_successor_floor(service):
    service.live.find_one.return_value = {
        "vehicle_id": "gps", "route_number": "T", "mode": "bus", "trip_id": "out",
    }
    details = run(mobility.vehicle_trip_progress("gps", current_user=None))
    assert details["stops"][-1]["scheduled"] == "08:10"
    assert details["stops"][-1]["predicted"] == "08:15"
    assert details["stops"][-1]["delay_seconds"] == 300
    assert not details["stops"][-1]["passed"]
    service.live.find_one.return_value["trip_id"] = "back"
    successor = run(mobility.vehicle_trip_progress("gps", current_user=None))
    assert successor["stops"][-1]["predicted"] == "08:25"
    assert service.calls[-1]["departure_floor_s"] == 8 * 3600 + 16 * 60


def test_arrivals_include_future_trip_without_active_vehicle(service, monkeypatch):
    monkeypatch.setattr(domain, "build_domain", lambda *args: {
        "stops": [{"stop_id": "B", "stop_ids": ["B"]}],
        "trip_templates": [
            {"trip_id": t["trip_id"], "stop_ids": t["stop_ids"], "route_number": "T", "mode": "bus"}
            for t in service.route["trips"]
        ],
    })
    monkeypatch.setattr(mobility, "_all_active_vehicles", AsyncMock(return_value=[]))
    entries = run(arrivals.unified_arrivals("B"))
    outbound = next(e for e in entries if e["trip_id"] == "out")
    assert outbound["predicted"] == "08:15"
    assert outbound["eta_seconds"] == 180
    assert outbound["delay_seconds"] == 300
    assert any(e["trip_id"] == "back" for e in entries)
    assert all(c["allow_live_fetch"] is False for c in service.calls)


@pytest.mark.parametrize("reason", ["disabled", "version", "geometry", "alignment"])
def test_effective_timeline_falls_back_without_engine(service, monkeypatch, reason):
    effective = AsyncMock(side_effect=AssertionError("engine must not be called"))
    monkeypatch.setattr(engine, "effective_timeline_for_trip", effective)
    version = "v"
    if reason == "disabled":
        monkeypatch.setattr(mobility, "MOTION_ENGINE_ENABLED", False)
    elif reason == "version":
        version = ""
    else:
        monkeypatch.setattr(mobility, "_trip_path_geometry", AsyncMock(
            return_value=None if reason == "geometry" else {"stop_progress": [0]},
        ))
    trip = service.route["trips"][0]
    result = run(mobility._effective_trip_timeline(service.route, trip, None, version, 0))
    assert result == mobility._predicted_stop_timeline(service.route, trip, None)
    effective.assert_not_awaited()


def test_candidate_resolution_does_not_build_distant_runs(service):
    service.route["trips"].append({
        "trip_id": "night", "stop_ids": ["A", "B"],
        "stop_times": {"A": "23:00", "B": "23:10"},
    })
    run(mobility._effective_trip_windows(service.route, {}, "v", 8 * 3600 + 12 * 60))
    assert {c["trip_id"] for c in service.calls} == {"out", "back"}


def test_canceled_trip_is_not_resolved(service):
    run(mobility._effective_trip_windows(
        service.route, {"out": {"trip_schedule_relationship": "CANCELED"}},
        "v", 8 * 3600 + 12 * 60,
    ))
    assert all(c["trip_id"] != "out" for c in service.calls)


def test_legacy_serving_stop_uses_effective_timing(service, monkeypatch):
    monkeypatch.setattr(mobility, "_all_active_vehicles", AsyncMock(return_value=[{
        "vehicle_id": "gps", "trip_id": "out", "route_number": "T", "mode": "bus",
        "latitude": 52.1, "longitude": 11.605,
    }]))
    monkeypatch.setattr(mobility, "_physical_stop_ids", AsyncMock(return_value={"B"}))
    entries = run(mobility.buses_serving_stop("B", current_user=None))
    assert len(entries) == 1
    assert entries[0]["eta_minutes"] == 3
    assert entries[0]["delay_minutes"] == 5


def test_explicit_future_candidates_are_not_capped(service):
    service.route["trips"] = [{
        "trip_id": f"future-{i}", "stop_ids": ["A", "B"],
        "stop_times": {"A": f"{9 + i // 6:02d}:{(i % 6) * 10:02d}",
                       "B": f"{9 + i // 6:02d}:{(i % 6) * 10 + 5:02d}"},
    } for i in range(60)]
    wanted = {t["trip_id"] for t in service.route["trips"]}
    run(mobility._effective_trip_windows(
        service.route, {}, "v", 8 * 3600, trip_ids=wanted, max_future_trips=2,
    ))
    assert len(service.calls) == 60


def test_long_ongoing_arrival_is_retained_by_end_not_start(service, monkeypatch):
    service.route["trips"] = [{
        "trip_id": "long", "stop_ids": ["A", "B"],
        "stop_times": {"A": "09:00", "B": "12:10"},
    }]
    monkeypatch.setattr(mobility, "_now_service_seconds", lambda: 12 * 3600)
    monkeypatch.setattr(domain, "build_domain", lambda *args: {
        "stops": [{"stop_id": "B", "stop_ids": ["B"]}],
        "trip_templates": [{"trip_id": "long", "route_number": "T", "stop_ids": ["A", "B"]}],
    })
    monkeypatch.setattr(mobility, "_all_active_vehicles", AsyncMock(return_value=[]))
    entries = run(arrivals.unified_arrivals("B", limit=1))
    assert len(entries) == 1
    assert entries[0]["trip_id"] == "long"
    assert entries[0]["eta_seconds"] == 600


@pytest.mark.parametrize("source", ["realtime", "override"])
def test_limit_one_skips_first_four_and_returns_fifth(service, monkeypatch, source):
    service.route["trips"] = [{
        "trip_id": f"future-{i}", "stop_ids": ["A", "B"],
        "stop_times": {"A": f"09:{i * 10:02d}", "B": f"09:{i * 10 + 5:02d}"},
    } for i in range(5)]
    if source == "realtime":
        monkeypatch.setattr(mobility, "_realtime_delays_for", AsyncMock(return_value={
            f"future-{i}": {"stop_relationships": {"B": "SKIPPED"}} for i in range(4)
        }))
    else:
        monkeypatch.setattr(overrides, "skipped_stop_ids", AsyncMock(return_value={
            f"future-{i}": {"B"} for i in range(4)
        }))
    monkeypatch.setattr(domain, "build_domain", lambda *args: {
        "stops": [{"stop_id": "B", "stop_ids": ["B"]}],
        "trip_templates": [{"trip_id": t["trip_id"], "route_number": "T", "stop_ids": ["A", "B"]}
                           for t in service.route["trips"]],
    })
    monkeypatch.setattr(mobility, "_all_active_vehicles", AsyncMock(return_value=[]))
    entries = run(arrivals.unified_arrivals("B", limit=1))
    assert [e["trip_id"] for e in entries] == ["future-4"]
    assert [c["trip_id"] for c in service.calls] == ["future-4"]


@pytest.mark.parametrize("source", ["realtime", "physics"])
def test_known_lateness_retains_old_baseline_candidate(service, monkeypatch, source):
    service.route["trips"] = [service.route["trips"][0]]
    now = 12 * 3600
    delays = {}
    if source == "realtime":
        delays = {"out": {"stop_predictions": {"B": {"arrival_delay_seconds": 4 * 3600}}}}
    else:
        monkeypatch.setattr(mobility, "_ESTIMATES_CACHE", {
            mobility._estimates_cache_key("v", "baseline"): {
                "at": 0, "data": [{"route_number": "T", "trip_id": "out", "delay_minutes": 240}],
            },
        })
    runs = run(mobility._effective_trip_windows(
        service.route, delays, "v", now, trip_ids={"out"}, max_future_trips=1,
    ))
    assert len(runs) == 1
    assert service.calls[0]["trip_id"] == "out"


def test_explicit_candidates_exclude_old_completed_unrelated_runs(service):
    wanted = {t["trip_id"] for t in service.route["trips"]}
    assert run(mobility._effective_trip_windows(
        service.route, {}, "v", 12 * 3600, trip_ids=wanted,
    )) == []
    assert service.calls == []


@pytest.mark.parametrize("explicit_trip", [False, True])
def test_long_run_cold_resolution_matches_sequential_from_origin(service, monkeypatch, explicit_trip):
    # Alternating 30 km trips: 29 minutes scheduled, 35 physically required.
    service.route["stops"][1]["lng"] = 12.04
    trips = []
    for i in range(13):
        start = 8 * 3600 + i * 1800
        stops = ["A", "B"] if i % 2 == 0 else ["B", "A"]
        trips.append({
            "trip_id": f"leg-{i}", "stop_ids": stops,
            "stop_times": {stops[0]: mobility._fmt_service_time(start),
                           stops[1]: mobility._fmt_service_time(start + 1740)},
        })
    service.route["trips"] = [*trips, {
        "trip_id": "unrelated-night", "stop_ids": ["A", "B"],
        "stop_times": {"A": "23:00", "B": "23:29"},
    }]
    calls = []

    async def physical_timeline(**kwargs):
        calls.append(kwargs["trip_id"])
        timeline = deepcopy(kwargs["timeline"])
        departure = max(timeline[0]["predicted_departure"], kwargs["departure_floor_s"] or 0)
        timeline[0]["predicted_departure"] = departure
        timeline[-1]["predicted_arrival"] = departure + 2100
        timeline[-1]["predicted_departure"] = departure + 2100
        return timeline

    monkeypatch.setattr(engine, "effective_timeline_for_trip", physical_timeline)
    now = 14 * 3600
    cold = run(mobility._effective_trip_windows(
        service.route, {}, "v", now,
        trip_ids={"leg-12"} if explicit_trip else None,
    ))
    assert len(cold) == 1
    assert calls == [t["trip_id"] for t in trips]
    assert cold[0]["trips"][0]["trip"]["trip_id"] == "leg-0"

    async def sequential():
        completion = None
        timelines = []
        for trip in trips:
            scheduled = mobility._trip_window(service.route, trip)["start"]
            timeline = await mobility._effective_trip_timeline(
                service.route, trip, None, "v", now,
                departure_floor_s=max(scheduled, completion) if completion is not None else None,
            )
            timelines.append(timeline)
            completion = timeline[-1]["predicted_departure"]
        return timelines

    calls.clear()
    expected = run(sequential())
    assert [w["timeline"] for w in cold[0]["trips"]] == expected
    assert cold[0]["end"] == 8 * 3600 + 13 * 2100
    assert cold[0]["trips"][-1]["departure_floor_s"] == 8 * 3600 + 12 * 2100
    assert calls == [t["trip_id"] for t in trips]


def test_context_reaches_fleet_arrivals_details_and_plan(service, monkeypatch):
    monkeypatch.setattr(domain, "build_domain", lambda *args: {
        "stops": [{"stop_id": "B", "stop_ids": ["B"]}],
        "trip_templates": [{"trip_id": "out", "stop_ids": ["A", "B"], "route_number": "T"}],
    })
    run(mobility._all_active_vehicles(traffic_context="google_locator"))
    assert service.calls and all(c["traffic_context"] == "google_locator" for c in service.calls)
    service.calls.clear()
    run(arrivals.unified_arrivals("B", traffic_context="google_locator"))
    assert service.calls and all(c["traffic_context"] == "google_locator" for c in service.calls)
    gps = {"vehicle_id": "gps", "trip_id": "out", "route_number": "T", "mode": "bus",
           "latitude": 52.12, "longitude": 11.62, "position_source": "VEHICLE_GPS"}
    service.live.find_one.return_value = deepcopy(gps)
    service.calls.clear()
    run(mobility.vehicle_trip_progress("gps", current_user=None, traffic_context="google_locator"))
    assert service.live.find_one.return_value == gps
    assert service.calls and all(c["traffic_context"] == "google_locator" for c in service.calls)
    service.calls.clear()
    core = Mock(return_value={"itineraries": []})
    monkeypatch.setattr(mobility, "_plan_core", core)
    run(mobility.plan_journey(52.1, 11.6, 52.1, 11.61, None, traffic_context="google_locator"))
    timelines = core.call_args.args[-1]
    assert timelines["out"][-1]["delay_seconds"] == 300
    assert service.calls and all(c["traffic_context"] == "google_locator" for c in service.calls)
    assert all(c["allow_live_fetch"] is False for c in service.calls)


def test_estimate_cache_does_not_cross_context_or_observation_revision(service, monkeypatch):
    revision = ["one"]
    monkeypatch.setattr(mobility, "observation_revision", lambda *args: revision[0])
    run(mobility._estimated_transit_vehicles(traffic_context="baseline"))
    service.calls.clear()
    run(mobility._estimated_transit_vehicles(traffic_context="google_locator"))
    assert service.calls
    service.calls.clear()
    run(mobility._estimated_transit_vehicles(traffic_context="google_locator"))
    assert not service.calls
    run(mobility._estimated_transit_vehicles(traffic_context="baseline"))
    assert not service.calls
    assert len(mobility._ESTIMATES_CACHE) == 2
    revision[0] = "two"
    run(mobility._estimated_transit_vehicles(traffic_context="google_locator"))
    assert service.calls


@pytest.mark.parametrize("boundary", ["region", "network", "version", "service_date"])
def test_estimate_cache_isolates_scope_switch_and_return(service, monkeypatch, boundary):
    region = SimpleNamespace(region_id="r", network_id="n")
    day = ["2026-10-21"]
    monkeypatch.setattr(mobility, "get_active_region", lambda: region)
    monkeypatch.setattr(mobility, "_service_date_key", lambda: day[0])
    first = run(mobility._estimated_transit_vehicles())
    if boundary == "service_date":
        day[0] = "2026-10-22"
    elif boundary == "version":
        service.network["version_id"] = "v2"
    else:
        setattr(region, boundary + "_id", "other")
    service.calls.clear()
    second = run(mobility._estimated_transit_vehicles())
    assert service.calls and second is not first
    assert len(mobility._ESTIMATES_CACHE) == 2
    region.region_id, region.network_id = "r", "n"
    service.network["version_id"] = "v"
    day[0] = "2026-10-21"
    service.calls.clear()
    assert run(mobility._estimated_transit_vehicles()) is first
    assert not service.calls
