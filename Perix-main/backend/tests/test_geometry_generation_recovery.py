"""Stale atomic geometry must be retried, not silently mixed with new infra."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest

from mobility import domain, generations, geometry_cache
from mobility.motion import engine
from routes import mobility as routes
from test_vehicle_performance import network_fixture


@pytest.fixture(autouse=True)
def reset_caches():
    geometry_cache.clear()
    routes._TRIP_PATH_CACHE.clear()
    yield
    geometry_cache.clear()
    routes._TRIP_PATH_CACHE.clear()


@pytest.mark.asyncio
async def test_mismatched_cached_generation_is_evicted_then_next_read_recovers(monkeypatch):
    net = network_fixture()
    route, trip = net['routes'][0], net['routes'][0]['trips'][0]
    pid = domain._pattern_id('1', domain._pattern_key(trip))
    points = [[52.1, 11.6], [52.105, 11.605], [52.11, 11.61]]
    monkeypatch.setattr(generations, 'atomic_generations_enabled', lambda: True)
    region=routes.get_active_region()
    bundle = dict(region_id=region.region_id,network_id=region.network_id,version_id=net['version_id'],pattern_id=pid,
        ready=True,generation_id='new',mode='bus',route_number='1',
        pattern_fingerprint=generations.pattern_fingerprint(domain.pattern_source_for_trip(route,trip)),
        geometry={'points':points,'source':'OSM_ROADS'},segments=[dict(a_idx=0,b_idx=1,start_node_id=1,end_node_id=3,
            edge_ids=['100:1:2','100:2:3'],points=points)])
    from mobility.direction_contract import build_direction_contract
    contract=build_direction_contract(scope=bundle,pattern=domain.pattern_source_for_trip(route,trip),points=points,
        segments=bundle['segments'],platforms=[dict(platform_id=s['stop_id'],latitude=s['lat'],longitude=s['lng']) for s in route['stops']])
    geometry_cache.set_cached(pid,points,version_id=net['version_id'],generation_id='old',source='OSM_ROADS',
        direction_contract=contract,direction_verified=True,pattern_fingerprint=bundle['pattern_fingerprint'])
    get_bundle = AsyncMock(return_value=bundle)
    monkeypatch.setattr(generations, 'get_pattern_generation', get_bundle)
    timeline = routes._predicted_stop_timeline(route, trip, None)
    path = await routes._trip_path_geometry(route, trip, timeline, net)
    assert path['derived_generation'] == 'old'
    failure = {}
    result = await engine._build_trip_plan(trip_id=trip['trip_id'], mode='bus', version_id=net['version_id'],
        timeline=timeline, path=path, now_local=datetime(2026, 10, 22, tzinfo=timezone.utc), failure=failure)
    assert result is None and failure['reason'] == 'GENERATION_MISMATCH'
    assert path['derived_generation'] == 'old'  # Never mutate the packet in place.
    assert geometry_cache.get_entry(pid, net['version_id']) is None
    repaired = await routes._trip_path_geometry(route, trip, timeline, net)
    assert repaired['derived_generation'] == 'new'
    assert repaired is not path
    assert generations.generation_matches_path(bundle, repaired)
    assert get_bundle.await_count == 2  # No retry loop inside the failed model call.


@pytest.mark.asyncio
@pytest.mark.parametrize('case', ['newer-cache', 'manual', 'unready-bundle'])
async def test_mismatch_does_not_evict_a_newer_manual_or_unready_entry(monkeypatch, case):
    source = 'PERIX_MANUAL' if case == 'manual' else 'OSM_ROADS'
    cached_generation = 'newer' if case == 'newer-cache' else 'old'
    geometry_cache.set_cached('p', [[52, 11], [52.001, 11]], version_id='v',
                              generation_id=cached_generation, source=source)
    before = geometry_cache.get_entry('p', 'v')
    monkeypatch.setattr(generations, 'atomic_generations_enabled', lambda: True)
    monkeypatch.setattr(generations, 'get_pattern_generation', AsyncMock(return_value={
        'generation_id': 'new', 'ready': case != 'unready-bundle'}))
    failure = {}
    await engine._build_trip_plan(trip_id='t', mode='bus', version_id='v', timeline=[],
        path={'pattern_id': 'p', 'derived_generation': 'old', 'geometry_source': source},
        now_local=datetime(2026, 10, 22, tzinfo=timezone.utc), failure=failure)
    assert failure['reason'] == 'GENERATION_MISMATCH'
    assert geometry_cache.get_entry('p', 'v') is before


def test_conditional_invalidation_is_scoped_and_bumps_projection_revision():
    for version, generation in [('v', 'old'), ('other', 'old')]:
        geometry_cache.set_cached('p', [[52, 11], [52.001, 11]], version_id=version,
                                  generation_id=generation, source='OSM_ROADS')
    before = geometry_cache.revision()
    assert geometry_cache.invalidate_generation('p', 'v', 'old') is True
    assert geometry_cache.revision() > before
    assert geometry_cache.get_entry('p', 'v') is None
    assert geometry_cache.get_entry('p', 'other')['generation_id'] == 'old'
    assert geometry_cache.invalidate_generation('p', 'v', 'old') is False
