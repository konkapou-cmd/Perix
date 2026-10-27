"""Offline vehicle-path regression tests; no database or provider calls."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from mobility import domain, geometry_cache
from routes import mobility as routes


def network_fixture(count=1):
    stops = [{"stop_id": "A", "name": "A", "lat": 52.1, "lng": 11.6},
             {"stop_id": "B", "name": "B", "lat": 52.11, "lng": 11.61}]
    trips = [{"trip_id": f"t{i}", "shape_id": "shape", "stop_ids": ["A", "B"],
              "stop_times": {"A": "12:00", "B": "12:30"},
              "start": "12:00", "end": "12:30", "headsign": "B"}
             for i in range(count)]
    return {"version_id": "perf-v1", "region_id": "magdeburg", "network_id": "mvb",
            "name": "2026-10-22", "service_date": "2026-10-22",
            "routes": [{"route_number": "1", "mode": "bus", "stops": stops,
                        "trips": trips}]}


@pytest.fixture(autouse=True)
def clean_caches():
    routes._TRIP_PATH_CACHE.clear()
    routes._ESTIMATES_INFLIGHT.clear()
    geometry_cache.clear()
    yield
    routes._TRIP_PATH_CACHE.clear()
    geometry_cache.clear()


@pytest.mark.asyncio
async def test_shared_path_no_network_read_and_generation_invalidates(monkeypatch):
    net = network_fixture(2)
    route = net["routes"][0]
    pid = domain._pattern_id("1", "shape")
    points = [[52.1, 11.6], [52.105, 11.605], [52.11, 11.61]]
    geometry_cache.set_cached(pid, points, version_id="perf-v1", generation_id="g1")
    get_network = AsyncMock(side_effect=AssertionError("unexpected full network read"))
    monkeypatch.setattr(routes, "_get_active_network", get_network)
    timeline = routes._predicted_stop_timeline(route, route["trips"][0], None)
    first = await routes._trip_path_geometry(route, route["trips"][0], timeline, net)
    second = await routes._trip_path_geometry(route, route["trips"][1], timeline, net)
    assert first is second
    geometry_cache.set_cached(pid, points, version_id="perf-v1", generation_id="g2")
    third = await routes._trip_path_geometry(route, route["trips"][0], timeline, net)
    assert third is not first
    assert third["derived_generation"] == "g2"
    assert get_network.await_count == 0
    for field, value in [("version_id", "perf-v2"), ("service_date", "2026-10-23")]:
        other = {**net, field: value, "name": "2026-10-23"}
        changed = await routes._trip_path_geometry(route, route["trips"][0], timeline, other)
        assert changed is not first


@pytest.mark.asyncio
async def test_singleflight_cancellation_context_and_no_position_ttl(monkeypatch):
    from contextvars import ContextVar
    context = ContextVar("request_context")
    entered, release = asyncio.Event(), asyncio.Event()
    calls = []

    async def compute(net):
        calls.append((net["version_id"], context.get()))
        entered.set()
        await release.wait()
        return [{"sample": len(calls)}]

    monkeypatch.setattr(routes, "_compute_estimated_transit_vehicles", compute)
    context.set("first-context")
    first = asyncio.create_task(routes._estimated_transit_vehicles(network_fixture()))
    await entered.wait()
    context.set("second-context")
    second = asyncio.create_task(routes._estimated_transit_vehicles(network_fixture()))
    await asyncio.sleep(0)
    first.cancel()
    with pytest.raises(asyncio.CancelledError):
        await first
    release.set()
    assert await second == [{"sample": 1}]
    assert calls == [("perf-v1", "first-context")]
    assert await routes._estimated_transit_vehicles(network_fixture()) == [{"sample": 2}]
    assert not routes._ESTIMATES_INFLIGHT


@pytest.mark.asyncio
async def test_singleflight_does_not_mix_versions_or_service_dates(monkeypatch):
    compute = AsyncMock(return_value=[{"ok": True}])
    monkeypatch.setattr(routes, "_compute_estimated_transit_vehicles", compute)
    base = network_fixture()
    await asyncio.gather(*(routes._estimated_transit_vehicles(net) for net in [
        base, {**base, "version_id": "perf-v2"},
        {**base, "service_date": "2026-10-23"},
    ]))
    assert compute.await_count == 3


def test_domain_override_tail_and_scope_are_not_truncated():
    base = network_fixture()
    override = {"kind": "rename", "stop_id": "A", "padding": "x" * 250, "name": "one"}
    first = domain.build_domain(base, overrides=[override])
    second = domain.build_domain(base, overrides=[{**override, "name": "two"}])
    assert first is not second
    for field, value in [("region_id", "other"), ("network_id", "other"),
                         ("name", "2026-10-23")]:
        assert domain.build_domain({**base, field: value}, overrides=[override]) is not first


@pytest.mark.asyncio
async def test_motion_plan_cache_samples_now_and_separates_generation_and_date(monkeypatch):
    from mobility.motion import engine
    engine.clear_motion_cache()
    build = AsyncMock(return_value={"segments": [], "motion_model": "TEST"})
    samples = []

    def sample(plan, now, timeline, progress):
        samples.append(now)
        return {"progress_m": now, "next_timeline_index": 1}

    monkeypatch.setattr(engine, "_build_trip_plan", build)
    monkeypatch.setattr(engine, "_sample_trip_plan", sample)
    monkeypatch.setattr(engine, "handover_enabled", lambda: False)
    path = {"pattern_id": "p", "derived_generation": "g1", "service_date": "2026-10-22",
            "stop_progress": [0, 1000], "total_m": 1000}
    kwargs = dict(trip_id="t", mode="bus", version_id="v",
                  timeline=[{"stop_id": "A", "predicted_arrival": 0, "predicted_departure": 0, "scheduled_arrival": 0},
                            {"stop_id": "B", "predicted_arrival": 200, "predicted_departure": 200, "scheduled_arrival": 200}], path=path)
    await engine.position_for_trip(**kwargs, now_sec=100)
    await engine.position_for_trip(**kwargs, now_sec=104)
    assert build.await_count == 1
    assert samples == [100, 104]
    await engine.position_for_trip(**{**kwargs, "path": {**path, "derived_generation": "g2"}}, now_sec=108)
    await engine.position_for_trip(**{**kwargs, "path": {**path, "service_date": "2026-10-23"}}, now_sec=108)
    assert build.await_count == 3
    engine.clear_motion_cache()


@pytest.mark.asyncio
async def test_realtime_still_scoped_fresh_and_not_globally_dropped(monkeypatch):
    from datetime import datetime, timezone
    net = network_fixture()
    now = datetime.now(timezone.utc)
    fresh = {"trip_id": "fresh", "updated_at": now.isoformat(), "feed_timestamp": int(now.timestamp())}
    stale = {**fresh, "trip_id": "stale", "feed_timestamp": int(now.timestamp()) - 1000}
    queries = []

    def find(query, projection):
        queries.append(query)
        return SimpleNamespace(to_list=AsyncMock(return_value=[fresh, stale]))

    monkeypatch.setattr(routes, "db", SimpleNamespace(
        mobility_realtime=SimpleNamespace(find=find),
        mobility_trip_realtime_journeys=SimpleNamespace(find=lambda *args: SimpleNamespace(to_list=AsyncMock(return_value=[])))))
    result = await routes._realtime_delays_for(["fresh", "stale"], network=net)
    assert result == {"fresh": fresh}
    assert queries[0]["network_version_id"] == "perf-v1"
    assert queries[0]["service_date"] == "2026-10-22"
    assert queries[0]["region_id"] == "magdeburg"
    assert queries[0]["network_id"]
