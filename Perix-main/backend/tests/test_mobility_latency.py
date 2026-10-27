"""Static work reuse must not freeze RT positions or cross dated namespaces."""
import asyncio
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from routes import mobility as routes
from mobility import domain, v2, generations, detour_guard, graph, osm_store
from test_mobility_civil_day import network, local


@pytest.fixture(autouse=True)
def clear():
    domain._DOMAIN_CACHE.clear()
    v2._MAP_CACHE.clear()
    v2._MAP_INFLIGHT.clear()
    routes._NETWORK_READS.clear()
    yield
    domain._DOMAIN_CACHE.clear()
    v2._MAP_CACHE.clear()
    v2._MAP_INFLIGHT.clear()
    routes._NETWORK_READS.clear()


def test_missing_epoch_does_not_build_region_configuration(monkeypatch):
    monkeypatch.setattr(routes, "get_active_region", lambda: pytest.fail("unnecessary region lookup"))
    assert routes._epoch_to_service_seconds(None, "2026-10-23") is None


def test_domain_retains_both_dates_and_all_override_content(monkeypatch):
    physical = domain._physical_stops
    calls = []
    def build(net):
        calls.append(net["service_date"])
        return physical(net)
    monkeypatch.setattr(domain, "_physical_stops", build)
    today, prior = network("2026-10-23"), network("2026-10-22")
    a = domain.build_domain(today)
    b = domain.build_domain(prior)
    assert domain.build_domain(today) is a
    assert domain.build_domain(prior) is b
    assert calls == ["2026-10-23", "2026-10-22"]
    assert domain.build_domain({**today, "region_id": "other"}) is not a
    assert domain.build_domain({**today, "version_id": "new"}) is not a
    assert domain.build_domain(today, overrides=[{"kind": "rename", "stop_id": "A", "name": "changed"}]) is not a


@pytest.mark.asyncio
async def test_active_network_singleflight_cancellation_and_next_read_fresh(monkeypatch):
    entered, release = asyncio.Event(), asyncio.Event()
    calls = []
    async def load():
        calls.append(len(calls))
        entered.set()
        await release.wait()
        return {"version_id": str(len(calls))}
    monkeypatch.setattr(routes, "_load_active_network", load)
    first = asyncio.create_task(routes._get_active_network())
    await entered.wait()
    second = asyncio.create_task(routes._get_active_network())
    await asyncio.sleep(0)
    first.cancel()
    with pytest.raises(asyncio.CancelledError):
        await first
    release.set()
    assert await second == {"version_id": "1"}
    assert await routes._get_active_network() == {"version_id": "2"}
    assert not routes._NETWORK_READS


@pytest.mark.asyncio
async def test_window_singleflight_separates_civil_dates_and_explicit_versions(monkeypatch):
    load = AsyncMock(side_effect=lambda net, now: [net])
    monkeypatch.setattr(routes, "_load_journey_networks", load)
    a = network("2026-10-23")
    midnight = local("2026-10-23T00:00")
    await asyncio.gather(*(routes.networks_for_journey_window(a, now=midnight) for _ in range(4)))
    assert load.await_count == 1
    await asyncio.gather(routes.networks_for_journey_window(a, now=local("2026-10-24T00:00")),
                         routes.networks_for_journey_window({**a, "version_id": "other"}, now=midnight))
    assert load.await_count == 3
    await routes.networks_for_journey_window(a, now=midnight)
    assert load.await_count == 4  # No completed snapshot TTL across activation.


@pytest.fixture
def static_map(monkeypatch):
    state = {"generation": "g1", "ready": True, "snapshot": 1, "overlay": [],
             "gates": {"p": {"safe": True, "status": "NO_VERIFIED_CLOSURE"}}}
    def find(*args):
        return SimpleNamespace(to_list=AsyncMock(return_value=[{"pattern_id": "p", "generation_id": state["generation"],
            "ready": state["ready"], "osm_snapshot_v": state["snapshot"]}]))
    monkeypatch.setattr(v2, "db", SimpleNamespace(mobility_pattern_generations=SimpleNamespace(find=find)))
    monkeypatch.setattr(generations, "atomic_generations_enabled", lambda: True)
    monkeypatch.setattr(detour_guard, "detour_states_for_domain", AsyncMock(side_effect=lambda dom: deepcopy(state["gates"])))
    monkeypatch.setattr(graph, "get_overlays", AsyncMock(side_effect=lambda: deepcopy(state["overlay"])))
    monkeypatch.setattr(osm_store, "active_version", AsyncMock(side_effect=lambda region: state["snapshot"]))
    return state


@pytest.mark.asyncio
async def test_map_singleflight_defensive_copy_and_every_safety_revision(monkeypatch, static_map):
    entered, release = asyncio.Event(), asyncio.Event()
    async def build(dom, **kwargs):
        entered.set()
        await release.wait()
        return {"lines": [{"points": [1]}], "stops": [], "diversion_warnings": []}
    render = AsyncMock(side_effect=build)
    monkeypatch.setattr(v2, "_build_map_dated", render)
    dom = domain.build_domain(network("2026-10-23"))
    first = asyncio.create_task(v2._map_dated(dom))
    await entered.wait()
    second = asyncio.create_task(v2._map_dated(dom))
    for _ in range(10):
        await asyncio.sleep(0)
    first.cancel()
    with pytest.raises(asyncio.CancelledError):
        await first
    release.set()
    result = await second
    assert render.await_count == 1
    result["lines"][0]["points"].append("mutated")
    assert (await v2._map_dated(dom))["lines"][0]["points"] == [1]
    assert render.await_count == 1
    for field, value in [("generation", "g2"), ("ready", False), ("snapshot", 2),
                         ("overlay", [{"geometry": [1, 2]}]),
                         ("gates", {"p": {"safe": False, "status": "CLOSURE"}})]:
        static_map[field] = value
        before = render.await_count
        await v2._map_dated(dom)
        assert render.await_count == before + 1
    for field in ("service_date", "version_id", "region_id", "network_id"):
        other = deepcopy(dom)
        other["network"][field] = "other"
        before = render.await_count
        await v2._map_dated(other)
        assert render.await_count == before + 1
    other = deepcopy(dom)
    other["stops"][0]["name"] = "override changed"
    before = render.await_count
    await v2._map_dated(other)
    assert render.await_count == before + 1


@pytest.mark.asyncio
async def test_failed_map_build_is_not_cached(monkeypatch, static_map):
    render = AsyncMock(side_effect=RuntimeError("transient"))
    monkeypatch.setattr(v2, "_build_map_dated", render)
    dom = domain.build_domain(network("2026-10-23"))
    for _ in range(2):
        with pytest.raises(RuntimeError):
            await v2._map_dated(dom)
    assert render.await_count == 2
    assert not v2._MAP_INFLIGHT and not v2._MAP_CACHE
