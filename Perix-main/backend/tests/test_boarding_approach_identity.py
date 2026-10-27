"""No network/DB: identical stop names must not erase directional identities."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from routes import mobility as routes
from mobility import overrides


@pytest.fixture
def journey(monkeypatch):
    a = {"stop_id": "A", "name": "Same name", "lat": 52, "lng": 11}
    p = {"stop_id": "P", "name": "Same name", "lat": 52.00001, "lng": 11}
    b = {"stop_id": "B", "name": "Destination", "lat": 52.04, "lng": 11}
    trip = {"trip_id": "T", "headsign": "East", "stop_ids": ["A", "B"],
            "stop_times": {"A": "00:03:20", "B": "00:08:20"}}
    reverse = {"trip_id": "opposite", "headsign": "West", "stop_ids": ["B", "P"],
               "stop_times": {"B": "00:03:20", "P": "00:08:20"}}
    route = {"route_number": "3", "mode": "tram", "stops": [a, b, p], "trips": [trip, reverse]}
    network = {"version_id": "v", "service_date": "2026-10-24", "routes": [route]}
    monkeypatch.setattr(routes, "_now_service_seconds", lambda *args: 100)
    monkeypatch.setattr(routes, "_realtime_delays_for", AsyncMock(return_value={}))
    monkeypatch.setattr(routes, "_all_active_vehicles", AsyncMock(return_value=[]))
    monkeypatch.setattr(overrides, "canceled_trip_ids", AsyncMock(return_value=set()))
    monkeypatch.setattr(overrides, "skipped_stop_ids", AsyncMock(return_value={}))
    path = AsyncMock(return_value={"pattern_id": "east", "stop_progress": [100, 4000],
                                  "points": [[52, 11], [52.04, 11]], "geometry_source": "OSM"})
    monkeypatch.setattr(routes, "_trip_path_geometry", path)
    return SimpleNamespace(network=network, route=route, trip=trip, path=path)


@pytest.mark.asyncio
async def test_plan_carries_exact_platform_dated_trip_and_canonical_board_progress(journey):
    result = await routes._plan_dated_network(journey.network, 52, 11, 52.04, 11)
    legs = result["itineraries"][0]["legs"]
    ride = next(l for l in legs if l["type"] == "ride")
    assert ride["board"] == "Same name"
    assert ride["board_stop_id"] == "A" and ride["alight_stop_id"] == "B"
    assert ride["trip_id"] == "T" and ride["direction"] == "East"
    assert ride["trip_instance_id"].endswith(":v:2026-10-24:T")
    assert ride["board_timeline_index"] == 0
    assert ride["board_progress_m"] == 100 and ride["pattern_id"] == "east"
    assert len(ride["board_geometry_fingerprint"]) == 64
    assert legs[0]["points"][0] == [52, 11]  # location-to-stop walk remains
    assert journey.path.await_args.kwargs["network"] is journey.network


def test_plan_uses_active_effective_clocks_but_does_not_offer_skipped_platform(journey):
    raw = routes._predicted_stop_timeline(journey.route, journey.trip, None)
    effective = [{**e, "predicted_arrival": e["predicted_arrival"] + 300,
                  "predicted_departure": e["predicted_departure"] + 300} for e in raw]
    vehicle = {"trip_id": "T", "estimated": True, "_motion_plan_revision": "rev",
               "_effective_timeline": effective}
    args = (journey.network, 52, 11, 52.04, 11)
    result = routes._plan_core(*args, active_by_trip={"T": vehicle})
    ride = next(l for l in result["itineraries"][0]["legs"] if l["type"] == "ride")
    assert ride["depart"] == "00:08" and ride["arrive"] == "00:13"
    assert routes._plan_core(*args, skipped={"T": {"A"}})["itineraries"] == []
    assert routes._plan_core(*args, canceled={"T"})["itineraries"] == []


@pytest.mark.asyncio
async def test_no_canonical_path_means_no_invented_board_progress(journey):
    journey.path.return_value = None
    result = await routes._plan_dated_network(journey.network, 52, 11, 52.04, 11)
    ride = next(l for l in result["itineraries"][0]["legs"] if l["type"] == "ride")
    assert "board_progress_m" not in ride
    assert "pattern_id" not in ride


@pytest.mark.asyncio
async def test_position_only_gtfs_fallback_cannot_become_an_approach_path(journey):
    journey.path.return_value["geometry_source"] = "GTFS_POSITION_FALLBACK"
    result = await routes._plan_dated_network(journey.network, 52, 11, 52.04, 11)
    ride = next(l for l in result["itineraries"][0]["legs"] if l["type"] == "ride")
    assert "board_progress_m" not in ride
    assert "board_geometry_fingerprint" not in ride
