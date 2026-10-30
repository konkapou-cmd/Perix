import asyncio
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from routes import mobility
from mobility import motion, overrides, v2


def test_cold_diagnostic_and_public_reads_never_fetch_live(monkeypatch):
    route = {
        "route_number": "1",
        "mode": "bus",
        "stops": [
            {"stop_id": "A", "lat": 52.1, "lng": 11.6},
            {"stop_id": "B", "lat": 52.1, "lng": 11.61},
        ],
        "trips": [{
            "trip_id": "trip-1",
            "stop_ids": ["A", "B"],
            "stop_times": {"A": "08:00", "B": "08:10"},
        }],
    }
    network = {"version_id": "test-version", "routes": [route]}
    cache = {}
    monkeypatch.setattr(mobility, "_ESTIMATES_CACHE", cache)
    monkeypatch.setattr(mobility, "MOTION_ENGINE_ENABLED", True)
    monkeypatch.setattr(mobility, "_get_active_network", AsyncMock(return_value=network))
    monkeypatch.setattr(mobility, "_now_service_seconds", lambda: 8 * 3600 + 300)
    monkeypatch.setattr(mobility, "_realtime_delays_for", AsyncMock(return_value={}))
    monkeypatch.setattr(overrides, "canceled_trip_ids", AsyncMock(return_value=set()))
    monkeypatch.setattr(mobility, "db", SimpleNamespace(
        mobility_live=SimpleNamespace(find=Mock(return_value=SimpleNamespace(
            to_list=AsyncMock(return_value=[]),
        ))),
    ))
    monkeypatch.setattr(mobility, "_trip_path_geometry", AsyncMock(return_value={
        "stop_progress": [0.0, 100.0], "total_m": 100.0,
    }))
    monkeypatch.setattr(mobility, "_point_heading_at_progress", lambda *args: (
        {"lat": 52.1, "lng": 11.605}, 90.0,
    ))
    position = AsyncMock(return_value={"progress_m": 50.0, "next_timeline_index": 1})
    monkeypatch.setattr(motion, "position_for_trip", position)

    asyncio.run(v2.v2_diagnostic_motion_summary(current_user=None))

    position.assert_awaited_once()
    assert position.await_args.kwargs["allow_live_fetch"] is False
    key = mobility._estimates_cache_key("test-version", "baseline")
    assert key in cache

    vehicles = asyncio.run(mobility._all_active_vehicles())

    assert position.await_count == 1
    assert position.await_args.kwargs["allow_live_fetch"] is False
    assert len(vehicles) == 1
    assert cache[key]["data"] == vehicles
    assert cache[key]["at"] > 0


@pytest.mark.parametrize("allow_live_fetch", [False, True])
def test_recent_live_estimates_are_reused(monkeypatch, allow_live_fetch):
    estimates = [{"vehicle_id": "cached"}]
    monkeypatch.setattr(mobility, "_ESTIMATES_CACHE", {
        mobility._estimates_cache_key("v", "baseline"): {"at": time.time(), "data": estimates},
    })
    network = AsyncMock(return_value={"version_id": "v"})
    monkeypatch.setattr(mobility, "_get_active_network", network)

    result = asyncio.run(mobility._estimated_transit_vehicles(
        allow_live_fetch=allow_live_fetch,
    ))

    assert result is estimates
    network.assert_awaited_once()
