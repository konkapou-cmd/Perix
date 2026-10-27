"""Offline dated passenger and actual worker-cycle regressions; no Mongo/network."""
import asyncio
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from routes import mobility as routes
from mobility import arrivals, domain, geometry_cache, generations, overrides, v2
from mobility.realtime_index import journey_upsert_filter, realtime_upsert_filter
from utils import mobility_workers as workers
from test_mobility_civil_day import local, network


def cursor(rows):
    return SimpleNamespace(to_list=AsyncMock(return_value=rows))


@pytest.fixture
def dated(monkeypatch):
    nets = [network("2026-10-23"), network("2026-10-22", "24:10", "24:30")]
    monkeypatch.setattr(routes, "networks_for_journey_window", AsyncMock(return_value=nets))
    monkeypatch.setattr(routes, "_get_active_network", AsyncMock(return_value=nets[0]))
    monkeypatch.setattr(routes, "_berlin_now", lambda: local("2026-10-23T00:20"))
    monkeypatch.setattr(routes, "_realtime_delays_for", AsyncMock(return_value={}))
    monkeypatch.setattr(overrides, "canceled_trip_ids", AsyncMock(return_value=set()))
    monkeypatch.setattr(overrides, "skipped_stop_ids", AsyncMock(return_value={}))
    monkeypatch.setattr(v2, "_domain", AsyncMock(side_effect=lambda network: domain.build_domain(network)))
    monkeypatch.setattr(routes, "db", SimpleNamespace(mobility_live=SimpleNamespace(find=lambda *a: cursor([]))))
    monkeypatch.setattr(routes, "_estimate_trip_position", AsyncMock(return_value={
        "latitude": 52.1, "longitude": 11.6, "delay_minutes": 0,
        "position_source": "SCHEDULE_ESTIMATE"}))
    return nets


@pytest.mark.asyncio
async def test_real_fleet_and_arrivals_keep_dates_without_faking_daily_buses(monkeypatch, dated):
    # Forty ordinary daytime runs must not become forty overnight vehicles.
    for net in dated:
        for i in range(40):
            trip = deepcopy(net["routes"][0]["trips"][0])
            trip.update(trip_id=f"daily-{i}", start="12:00", end="12:30",
                        stop_times={"A": "12:00", "B": "12:30"})
            net["routes"][0]["trips"].append(trip)
    fleet = await routes._all_active_vehicles()
    assert len(fleet) == 2
    assert len({v["vehicle_id"] for v in fleet}) == 2
    assert {v["service_date"] for v in fleet} == {"2026-10-22", "2026-10-23"}
    assert all(v["trip_id"] == "same-id" for v in fleet)
    monkeypatch.setattr(arrivals, "db", SimpleNamespace(mobility_vehicle_state=SimpleNamespace(find=lambda *a: cursor([]))))
    result = await arrivals.unified_arrivals("B", limit=2)
    assert len(result) == 2
    assert [r["eta_seconds"] for r in result] == [600, 600]
    assert {r["vehicle_id"] for r in result} == {v["vehicle_id"] for v in fleet}
    assert len({r["trip_instance_id"] for r in result}) == 2
    served = await routes.buses_serving_stop("B", None, None, None)
    assert len(served) == 2
    for vehicle in fleet:
        monkeypatch.setattr(routes.db.mobility_live, "find_one", AsyncMock(return_value=None), raising=False)
        progress = await routes.vehicle_trip_progress(vehicle["vehicle_id"], None)
        assert progress["trip_id"] == "same-id"
        assert [s["passed"] for s in progress["stops"]] == [True, False]
    monkeypatch.setattr(routes, "_berlin_now", lambda: local("2026-10-23T04:00"))
    assert await routes._all_active_vehicles() == []


@pytest.mark.asyncio
async def test_v2_dated_scopes_preserve_gates_and_external_ids(monkeypatch, dated):
    from mobility import detour_guard
    monkeypatch.setattr(v2, "_domain", AsyncMock(side_effect=lambda network: domain.build_domain(network)))
    gate = AsyncMock(return_value={})
    monkeypatch.setattr(detour_guard, "detour_states_for_domain", gate)
    raw = await routes._all_active_vehicles()
    external = {"vehicle_id": "external-gps-id", "mode": "bus", "trip_id": "same-id",
                "latitude": 52.1, "longitude": 11.6, "estimated": False}
    monkeypatch.setattr(routes, "_all_active_vehicles", AsyncMock(return_value=raw + [external]))
    result = await v2.v2_vehicles(None)
    assert len(result) == 3
    assert len({v["trip_instance_id"] for v in result if v["estimated"]}) == 2
    assert next(v for v in result if not v["estimated"])["vehicle_id"] == "external-gps-id"
    assert next(v for v in result if not v["estimated"])["trip_instance_id"] is None
    assert gate.await_count == 2
    assert not routes._vehicle_in_network(external, dated[0])
    assert not routes._vehicle_in_network(external, dated[1])


def test_storage_domain_and_geometry_namespaces():
    a, b = network("2026-10-22"), network("2026-10-23")
    docs = [{"region_id": "magdeburg", "network_id": "de-magdeburg-mvb", "trip_id": "same-id",
             "network_version_id": n["version_id"], "service_date": n["service_date"]} for n in (a, b)]
    assert realtime_upsert_filter(docs[0]) == realtime_upsert_filter(docs[1])
    assert journey_upsert_filter(docs[0]) != journey_upsert_filter(docs[1])
    assert domain.build_domain(a)["trip_templates"][0]["trip_instance_id"] != domain.build_domain(b)["trip_templates"][0]["trip_instance_id"]
    geometry_cache.clear()
    try:
        geometry_cache.set_cached("same-pattern", [[1, 2], [3, 4]], version_id=a["version_id"])
        geometry_cache.set_cached("same-pattern", [[5, 6], [7, 8]], version_id=b["version_id"])
        assert geometry_cache.get_cached("same-pattern", a["version_id"])[0] == [1, 2]
        assert geometry_cache.get_cached("same-pattern", b["version_id"])[0] == [5, 6]
        assert geometry_cache.get_cached("same-pattern", "unknown") is None
    finally:
        geometry_cache.clear()


@pytest.mark.asyncio
async def test_twenty_one_cross_midnight_windows_are_not_truncated(monkeypatch, dated):
    # Count regression, not a claim to replay the uncaptured actual 21 trips.
    previous = dated[1]
    previous["routes"][0]["trips"] = []
    for i in range(21):
        trip = deepcopy(network("2026-10-22", "23:50", "24:30")["routes"][0]["trips"][0])
        trip["trip_id"] = f"crossing-{i}"
        previous["routes"][0]["trips"].append(trip)
    evidence = await routes._journey_window_evidence()
    prior = next(n for n in evidence["networks"] if n["service_date"] == "2026-10-22")
    assert len(prior["journeys"]) == 21
    assert all(j["scheduled_start_seconds"] == 85800 and j["scheduled_end_seconds"] == 88200
               for j in prior["journeys"])
    assert len(await routes._estimated_transit_vehicles(previous)) == 21
    monkeypatch.setattr(routes, "_berlin_now", lambda: local("2026-10-23T04:00"))
    assert await routes._estimated_transit_vehicles(previous) == []


@pytest.mark.asyncio
async def test_map_and_planner_evaluate_dated_networks_independently(monkeypatch, dated):
    monkeypatch.setattr(v2, "_domain", AsyncMock(side_effect=lambda network: domain.build_domain(network)))
    rendered = AsyncMock(side_effect=lambda dom: {"lines": [{"pattern_id": p["pattern_id"]} for p in dom["patterns"]],
                                                 "stops": [], "diversion_warnings": []})
    monkeypatch.setattr(v2, "_map_dated", rendered)
    result = await v2.v2_map(None)
    assert {line["service_date"] for line in result["lines"]} == {"2026-10-22", "2026-10-23"}
    planner = AsyncMock(return_value={"itineraries": [{"duration_minutes": 10}]})
    monkeypatch.setattr(routes, "_plan_dated_network", planner)
    result = await routes.plan_journey(52.1, 11.6, 52.11, 11.61, None)
    assert planner.await_count == 2
    assert len(result["itineraries"]) == 2
    monkeypatch.setattr(routes, "_berlin_now", lambda: local("2026-10-23T04:00"))
    result = await v2.v2_map(None)
    assert {line["service_date"] for line in result["lines"]} == {"2026-10-23"}


@pytest.mark.asyncio
async def test_freshness_reuses_engine_and_never_inherits_stale_rollback(monkeypatch):
    net = network("2026-10-23")
    base = {**journey_upsert_filter({"region_id": "magdeburg", "network_id": "de-magdeburg-mvb",
        "trip_id": "same-id", "network_version_id": net["version_id"], "service_date": net["service_date"]}),
        "updated_at": "fresh", "feed_timestamp": None}
    legacy_queries, dated_queries = [], []
    def collection(rows, queries):
        def find(query, projection):
            queries.append(query)
            return cursor(rows)
        return SimpleNamespace(find=find)
    monkeypatch.setattr(routes, "db", SimpleNamespace(
        mobility_realtime=collection([base], legacy_queries),
        mobility_trip_realtime_journeys=collection([{**base, "updated_at": "stale"}], dated_queries)))
    monkeypatch.setattr(routes, "_iso_is_fresh", lambda ts, seconds: ts == "fresh")
    assert await routes._realtime_delays_for(["same-id"], net) == {}
    for query in legacy_queries + dated_queries:
        assert query["network_version_id"] == net["version_id"]
        assert query["service_date"] == "2026-10-23"
    explicit = collection([base], [])
    assert (await routes._realtime_delays_for(["same-id"], net, collection=explicit))["same-id"] == base


@pytest.mark.asyncio
@pytest.mark.parametrize("blocked", [None, "not-ready", "bad-audit", "pre-activation", "active-ready", "partial-active-ready"])
async def test_actual_rt_worker_dispatches_same_feed_by_descriptor_date(monkeypatch, blocked):
    from contextlib import asynccontextmanager
    from google.transit import gtfs_realtime_pb2 as pb
    nets = [network("2026-10-23"), network("2026-10-22", "24:10", "24:30")]
    for net in nets:
        net["generation_state"] = "READY"
    if blocked == "not-ready":
        nets[1]["generation_state"] = "BUILDING"
    elif blocked == "bad-audit":
        nets[1]["routes"][0]["trips"][0]["stop_ids"] = ["missing"]
    elif blocked == "pre-activation":
        nets[1]["activated_at"] = "2026-10-23T00:21:00+02:00"
    elif blocked in ("active-ready", "partial-active-ready"):
        nets[1].update(generation_state="ACTIVE_READY", generation_report={
            "expected": 2, "ready": 2 if blocked == "active-ready" else 1, "blocking_missing": []})
    feed = pb.FeedMessage()
    feed.header.gtfs_realtime_version = "2.0"
    feed.header.timestamp = int(local("2026-10-23T00:20").timestamp())
    for i, (day, clock) in enumerate([("20261022", "24:10:00"), ("20261023", "00:10:00"),
                                     ("20261020", "00:10:00"), ("20261024", "00:10:00"),
                                     ("20261023", "24:10:00"), ("", "00:10:00"),
                                     ("2026102", "00:10:00")]):
        entity = feed.entity.add(id=str(i))
        entity.trip_update.trip.trip_id = "same-id"
        entity.trip_update.trip.start_date = day
        entity.trip_update.trip.start_time = clock
        stu = entity.trip_update.stop_time_update.add(stop_id="A", stop_sequence=0)
        stu.arrival.delay = 30 + i
    @asynccontextmanager
    async def client(**kwargs):
        yield SimpleNamespace(get=AsyncMock(return_value=SimpleNamespace(
            content=feed.SerializeToString(), raise_for_status=lambda: None)))
    saved = AsyncMock(return_value=SimpleNamespace(modified_count=0, upserted_count=2))
    legacy = AsyncMock()
    monkeypatch.setattr(workers, "db", SimpleNamespace(
        mobility_trip_realtime_journeys=SimpleNamespace(bulk_write=saved),
        mobility_realtime=SimpleNamespace(bulk_write=legacy)))
    monkeypatch.setattr(routes, "_get_active_network", AsyncMock(return_value=nets[0]))
    monkeypatch.setattr(routes, "networks_for_journey_window", AsyncMock(return_value=nets))
    monkeypatch.setattr(generations, "atomic_generations_enabled", lambda: True)
    monkeypatch.setattr(workers.httpx, "AsyncClient", client)
    monkeypatch.setattr(workers.asyncio, "sleep", AsyncMock(side_effect=asyncio.CancelledError))
    with pytest.raises(asyncio.CancelledError):
        await workers._realtime_worker()
    assert saved.await_count == 1
    ops = saved.await_args.args[0]
    expected = 2 if blocked in (None, "active-ready") else 1
    assert len(ops) == expected
    assert {op._filter["service_date"] for op in ops} == ({"2026-10-22", "2026-10-23"} if expected == 2 else {"2026-10-23"})
    assert len({tuple(op._filter.items()) for op in ops}) == expected
    assert all(op._filter["trip_id"] == "same-id" for op in ops)
    legacy.assert_not_awaited()
