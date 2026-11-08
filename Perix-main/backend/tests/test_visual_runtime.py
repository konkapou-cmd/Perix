"""Opt-in passenger adapter: source targets, exact geometry, no physical ETA inflation."""
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from routes import mobility as routes
from mobility import generations, v2
from mobility.motion import visual_runtime
from mobility.motion.visual_progress import visual_preview, sample_visual_plan
from test_visual_progress import plan, IDENTITY
from test_mobility_motion_bus_tram import _edges
from test_effective_eta_consistency import endpoints


class MemoryState:
    """Single-loop stub only; process concurrency is tested on real MongoDB."""
    def __init__(self):
        self.rows = {}

    async def find_one(self, query):
        return deepcopy(self.rows.get(query['_id']))

    async def insert_one(self, state):
        self.rows[state['_id']] = deepcopy(state)

    async def update_one(self, query, update):
        self.rows[query['_id']].update(deepcopy(update['$set']))
        self.rows[query['_id']]['revision'] += update['$inc']['revision']
        return SimpleNamespace(matched_count=1)

    async def replace_one(self, query, state):
        self.rows[state['_id']] = deepcopy(state)
        return SimpleNamespace(matched_count=1)


@pytest.fixture(autouse=True)
def reset(monkeypatch):
    monkeypatch.delenv('MOBILITY_VISUAL_PROGRESS_ENABLED', raising=False)
    visual_runtime.clear_visual_cache()
    yield
    visual_runtime.clear_visual_cache()


@pytest.fixture
def runtime(monkeypatch):
    path = dict(pattern_id='p', derived_generation='g', geometry_source='OSM_RAIL',
                service_date='2026-11-02', points=[[52.1, 11.6], [52.1, 11.603], [52.102, 11.603]],
                stop_progress=[0, 500], cumulative=[0, 250, 500], total_m=500)
    bundle = dict(ready=True, generation_id='g', geometry={'points': path['points']},
                  infrastructure={'total_m': 500, 'edges': _edges(), 'signals': []})
    get = AsyncMock(return_value=bundle)
    monkeypatch.setattr(generations, 'get_pattern_generation', get)
    region = SimpleNamespace(region_id='r', network_id='n', motion={})
    timeline = [{'stop_id': 'A', 'stop_sequence': 1, 'predicted_arrival': 100, 'predicted_departure': 110},
                {'stop_id': 'B', 'stop_sequence': 2, 'predicted_arrival': 120, 'predicted_departure': 130}]
    kwargs = dict(trip_id='t', mode='tram', version_id='v', timeline=timeline, path=path,
                 now_s=115, now_epoch=1793650000, region=region,
                 source_order=(0, 100), state_collection=MemoryState())
    bind_runtime_direction(kwargs,bundle)
    return kwargs,bundle,get


def bind_runtime_direction(kwargs,bundle):
    from mobility.direction_contract import build_direction_contract
    from mobility.generations import pattern_fingerprint
    from mobility.roads import _haversine_m
    path=kwargs['path'];region=kwargs['region'];points=path['points']
    cumulative=[0.0]
    for a,b in zip(points,points[1:]):cumulative.append(cumulative[-1]+_haversine_m(*a,*b))
    pattern=dict(mode=kwargs['mode'],route_number='9',stop_ids=['A','B'],direction='B',shape_id=None,points=[])
    scope=dict(region_id=region.region_id,network_id=region.network_id,version_id=kwargs['version_id'],pattern_id=path['pattern_id'])
    segments=[dict(a_idx=0,b_idx=1,start_node_id=1,end_node_id=3,
        edge_ids=['100:1:2','101:2:3'],points=points)]
    contract=build_direction_contract(scope=scope,pattern=pattern,points=points,segments=segments,
        platforms=[dict(platform_id=s,latitude=p[0],longitude=p[1]) for s,p in zip(['A','B'],[points[0],points[-1]])])
    fp=pattern_fingerprint(pattern)
    path.update(stop_progress=contract['stop_progress_m'],cumulative=cumulative,total_m=cumulative[-1],
        route_number='9',direction_contract=contract,pattern_fingerprint=fp)
    bundle.update(mode=kwargs['mode'],route_number='9',direction_contract=contract,pattern_fingerprint=fp)
    bundle['infrastructure']['total_m']=cumulative[-1]
    for i,edge in enumerate(bundle['infrastructure']['edges']):
        edge.update(from_m=cumulative[i],to_m=cumulative[i+1])


@pytest.mark.asyncio
@pytest.mark.parametrize('bad',['missing','reversed-order','marker-projection'])
async def test_visual_pin_cannot_override_the_line_direction_contract(runtime,bad):
    kwargs,_,_=runtime
    if bad=='missing':kwargs['path'].pop('direction_contract')
    elif bad=='reversed-order':kwargs['path']['direction_contract']['ordered_stop_ids'].reverse()
    else:kwargs['path']['stop_progress']=[0,999]
    assert await visual_runtime.visual_position(**kwargs) is None


@pytest.mark.asyncio
async def test_runtime_keeps_tight_source_target_and_publishes_separate_preview(runtime):
    kwargs, bundle, get = runtime
    before = deepcopy(kwargs['timeline'])
    result = await visual_runtime.visual_position(**kwargs)
    assert result['marker_visible']
    assert result['next_stop_eta_seconds'] == 5
    assert result['speed_kmh'] is None
    assert result['timeline'] == before == kwargs['timeline']
    assert result['preview']['schema'] == 2
    assert result['preview']['effective_arrival_at_ms'] == kwargs['now_epoch']*1000+5000
    assert result['preview']['physical_speed_assurance'] is False
    # Versioned optical coverage may continue through the terminal's authorized
    # source dwell; it must not fabricate another leg or extend that departure.
    assert result['preview']['visual_rule_version'] == 'station-relative-v1'
    assert result['preview']['valid_until_ms'] == kwargs['now_epoch']*1000+15000
    assert result['preview']['phases'][-1]['state'] == 'VISUAL_STOP_ESTIMATE'
    assert result['preview']['phases'][-1]['p1'] == kwargs['path']['stop_progress'][-1]
    at_stop = await visual_runtime.visual_position(**{**kwargs, 'now_s': 120})
    assert at_stop['progress_m'] == kwargs['path']['stop_progress'][-1] and at_stop['next_stop_eta_seconds'] == 0
    assert len(visual_runtime._PLANS) == 1
    # Authority is checked on cache hits, too.
    bundle['generation_id'] = 'new'
    assert await visual_runtime.visual_position(**kwargs) is None


@pytest.mark.asyncio
@pytest.mark.parametrize('bad', ['generation', 'points', 'unready', 'manual'])
async def test_invalid_authority_hides_marker_instead_of_physical_fallback(runtime, bad):
    kwargs, bundle, _ = runtime
    if bad == 'generation': bundle['generation_id'] = 'different'
    if bad == 'points': bundle['geometry']['points'] = [[0, 0], [1, 1]]
    if bad == 'unready': bundle['ready'] = False
    if bad == 'manual': kwargs['path']['geometry_source'] = 'PERIX_MANUAL'
    assert await visual_runtime.visual_position(**kwargs) is None


def test_visual_mode_off_by_default_and_board_does_not_inherit_physical_clocks(monkeypatch):
    assert visual_runtime.enabled() is False
    monkeypatch.setenv('MOBILITY_VISUAL_PROGRESS_ENABLED', 'true')
    expected = [{'stop_id': 'A', 'predicted_arrival': 100}]
    provider = object()
    make = lambda r, t, rt: expected if rt is provider else None
    monkeypatch.setattr(routes, '_predicted_stop_timeline', make)
    vehicle = dict(estimated=True, trip_id='t', _motion_plan_revision='physical',
                   _effective_timeline=[{'stop_id': 'A', 'predicted_arrival': 128}])
    assert routes._timeline_for_vehicle({}, {'trip_id': 't'}, provider, vehicle) == expected


def test_visual_publication_is_not_resampled_from_physical_plan_cache(monkeypatch):
    from mobility.motion import engine
    monkeypatch.setattr(engine, 'sample_cached_publication', lambda **kw: pytest.fail('physical sampler called'))
    row = {'estimated': True, 'mode': 'tram', 'motion': {'model': 'TIME_NORMALIZED_VISUAL_ESTIMATE'},
           'progress_m': 42, 'trip_id': 't', 'motion_plan_revision': 'visual:x'}
    assert v2._refresh_estimated_publications([row], None) == [row]


@pytest.mark.parametrize('duration', [1, 10, 60, 180])
def test_visual_preview_has_continuous_optical_equations_and_exact_clock(duration):
    p = plan(duration)
    now = 110+duration/3
    sample = sample_visual_plan(p, now)
    preview = visual_preview(p, sample, now_s=now, sampled_at_ms=1000000, journey_id='journey')
    assert preview is not None
    prior_t, prior_p = 0, sample['progress_m']
    for phase in preview['phases']:
        assert phase['t0'] == pytest.approx(prior_t)
        assert phase['p0'] == pytest.approx(prior_p)
        dt = phase['t1']-phase['t0']
        assert phase['p1'] == pytest.approx(phase['p0']+phase['v0']*dt+0.5*phase['a']*dt**2)
        assert phase['p1'] <= 500.001
        prior_t, prior_p = phase['t1'], phase['p1']
    assert preview['valid_until_ms'] == pytest.approx(1000000+prior_t*1000)
    assert preview['effective_arrival_at_ms'] == pytest.approx(1000000+(110+duration-now)*1000)


@pytest.mark.asyncio
async def test_estimator_visual_branch_uses_source_eta_without_calling_physical_solver(monkeypatch):
    from mobility import motion
    from datetime import datetime
    from zoneinfo import ZoneInfo
    monkeypatch.setattr(routes, '_berlin_now', lambda: datetime(2026, 11, 2, 10, 0, 55, tzinfo=ZoneInfo('Europe/Berlin')))
    monkeypatch.setenv('MOBILITY_VISUAL_PROGRESS_ENABLED', 'true')
    monkeypatch.setattr(motion, 'position_for_trip', AsyncMock(side_effect=AssertionError('physical branch')))
    monkeypatch.setattr(routes, '_trip_path_geometry', AsyncMock(return_value={
        'pattern_id': 'p', 'points': [[52, 11], [52.001, 11]], 'cumulative': [0, 500],
        'stop_progress': [0, 500], 'total_m': 500}))
    monkeypatch.setattr(visual_runtime, 'visual_position', AsyncMock(return_value={
        'marker_visible': True, 'next_timeline_index': 1, 'progress_m': 250,
        'next_stop_eta_seconds': 5, 'revision': 'visual:revision', 'state': 'VISUAL_MOVING',
        'preview': None, 'timeline': []}))
    route = {'mode': 'tram', 'stops': [{'stop_id': 'A', 'lat': 52, 'lng': 11},
                                      {'stop_id': 'B', 'lat': 52.001, 'lng': 11}]}
    trip = {'trip_id': 't', 'stop_ids': ['A', 'B'], 'stop_times': {'A': '10:00', 'B': '10:01'}}
    result = await routes._estimate_trip_position(route, trip, 36055, {}, version_id='v',
                                                 network={'service_date': '2026-11-02'})
    assert result['next_stop_predicted_arrival'] == '10:01'
    assert result['source_next_stop_predicted_arrival'] == '10:01'
    assert result['motion']['speed_kmh'] is None
    assert result['prediction_basis'] == 'SOURCE_TIMELINE'
    assert result['motion']['model'] == 'TIME_NORMALIZED_VISUAL_ESTIMATE'


@pytest.mark.asyncio
async def test_visual_fleet_board_and_details_share_source_targets_and_revision(endpoints, monkeypatch):
    from mobility import arrivals
    s = endpoints
    monkeypatch.setenv('MOBILITY_VISUAL_PROGRESS_ENABLED', 'true')
    monkeypatch.setattr(routes, '_now_service_seconds', lambda *args: 50)
    s.vehicle.update(_effective_timeline=deepcopy(s.raw), _motion_plan_revision='visual:one',
        next_stop_eta_seconds=10, next_stop_predicted_arrival='00:01', prediction_basis='SOURCE_TIMELINE',
        motion={'model': 'TIME_NORMALIZED_VISUAL_ESTIMATE', 'publication_status': 'READY'})
    marker = (await v2.v2_vehicles(None))[0]
    board = (await arrivals.unified_arrivals('physical:station'))[0]
    details = await routes.vehicle_trip_progress('est_test', None)
    assert marker['next_stop_eta_seconds'] == board['eta_seconds'] == 10
    assert marker['next_stop_predicted_arrival'] == board['predicted_arrival'] == details['stops'][1]['predicted'] == '00:01'
    assert marker['motion_plan_revision'] == board['motion_plan_revision'] == 'visual:one'
    assert board['prediction_basis'] != 'PERIX_MOTION_PLAN'
    assert board['observed_arrival'] is False
    assert board['position_eta_consistency'] == 'NOT_APPLICABLE_VISUAL_PROGRESS'
    assert board['position_required_kmh'] is None


@pytest.mark.asyncio
async def test_source_revision_rebases_progress_and_does_not_inflate_deadline(runtime):
    kwargs, _, _ = runtime
    first = await visual_runtime.visual_position(**kwargs)
    revised_timeline = deepcopy(kwargs['timeline'])
    revised_timeline[1].update(predicted_arrival=140, predicted_departure=150)
    revised = await visual_runtime.visual_position(**{**kwargs, 'timeline': revised_timeline, 'source_order': (0, 101)})
    assert revised['progress_m'] == pytest.approx(first['progress_m'])
    assert revised['next_stop_eta_seconds'] == 25
    assert revised['timeline'] == revised_timeline
    assert revised['revision'] != first['revision']


@pytest.mark.asyncio
async def test_bootstrap_budget_does_not_invalidate_existing_shared_optical_anchors(runtime, monkeypatch):
    from mobility.motion import config
    kwargs, _, _ = runtime
    original = config.motion_config_for
    def legacy(mode, region=None):
        value = original(mode, region)
        value['visual'].pop('initial_preparation_budget_s', None)
        return value
    monkeypatch.setattr(config, 'motion_config_for', legacy)
    before = await visual_runtime.visual_position(**kwargs)
    visual_runtime.clear_visual_cache()
    monkeypatch.setattr(config, 'motion_config_for', original)
    after = await visual_runtime.visual_position(**kwargs)
    assert after is not None
    assert after['progress_m'] == before['progress_m']
    assert after['revision'] == before['revision']


@pytest.mark.asyncio
async def test_cached_plan_rechecks_compact_atomic_authority_and_hides_on_loss(runtime):
    kwargs, bundle, get = runtime
    bundle['geometry'].update(source='OSM_RAIL',geometry_fingerprint='authority')
    first = await visual_runtime.visual_position(**kwargs)
    assert first is not None
    async def current_header(*args, **options):
        assert options['projection']['ready'] == 1
        assert 'geometry.points' not in options['projection']
        return dict(ready=bundle['ready'],generation_id=bundle['generation_id'],mode='tram',
            geometry={'source':'OSM_RAIL','geometry_fingerprint':bundle['geometry']['geometry_fingerprint']},
            direction_contract={'fingerprint':bundle['direction_contract']['fingerprint']},
            pattern_fingerprint=bundle['pattern_fingerprint'],infrastructure={'total_m':kwargs['path']['total_m']})
    get.side_effect = current_header
    assert (await visual_runtime.visual_position(**kwargs))['revision'] == first['revision']
    bundle['ready'] = False
    assert await visual_runtime.visual_position(**kwargs) is None
    bundle['ready'] = True
    bundle['geometry']['geometry_fingerprint'] = 'changed-without-a-new-generation'
    assert await visual_runtime.visual_position(**kwargs) is None


@pytest.mark.asyncio
async def test_hidden_visual_marker_does_not_remove_source_board_arrival(endpoints, monkeypatch):
    from mobility import arrivals
    s = endpoints
    monkeypatch.setenv('MOBILITY_VISUAL_PROGRESS_ENABLED', 'true')
    monkeypatch.setattr(routes, '_now_service_seconds', lambda *args: 50)
    s.vehicle.update(latitude=None, longitude=None,
        motion={'model': 'TIME_NORMALIZED_VISUAL_ESTIMATE', 'publication_status': 'HIDDEN'})
    board = (await arrivals.unified_arrivals('physical:station'))[0]
    assert board['eta_seconds'] == 10
    assert board['predicted_arrival'] == '00:01'
    assert board['distance_to_stop_m'] is None
    assert board['prediction_basis'] != 'PERIX_MOTION_PLAN'


@pytest.mark.asyncio
async def test_missing_visual_geometry_is_not_parked_as_an_arrived_vehicle(monkeypatch):
    from test_vehicle_performance import network_fixture
    from mobility import overrides
    monkeypatch.setenv('MOBILITY_VISUAL_PROGRESS_ENABLED', 'true')
    monkeypatch.setattr(routes, 'db', SimpleNamespace(mobility_live=SimpleNamespace(
        find=lambda *a: SimpleNamespace(to_list=AsyncMock(return_value=[])))))
    monkeypatch.setattr(routes, '_now_service_seconds', lambda *a: 12*3600+15*60)
    monkeypatch.setattr(routes, '_realtime_delays_for', AsyncMock(return_value={}))
    monkeypatch.setattr(overrides, 'canceled_trip_ids', AsyncMock(return_value=set()))
    monkeypatch.setattr(routes, '_estimate_trip_position', AsyncMock(return_value=None))
    monkeypatch.setattr(routes, '_park_position', lambda *a: pytest.fail('must not fake a stop anchor'))
    assert await routes._compute_estimated_transit_vehicles(network_fixture()) == []


@pytest.mark.asyncio
async def test_shared_db_failure_never_publishes_worker_local_visual_position(runtime):
    from pymongo.errors import ConnectionFailure
    kwargs, _, _ = runtime
    kwargs['state_collection'].find_one = AsyncMock(side_effect=ConnectionFailure('synthetic outage'))
    assert await visual_runtime.visual_position(**kwargs) is None


@pytest.mark.asyncio
async def test_workers_with_different_template_config_fail_closed_instead_of_diverging(runtime):
    kwargs, _, _ = runtime
    assert (await visual_runtime.visual_position(**kwargs)) is not None
    kwargs['region'].motion = {'tram': {'acceleration_mps2': 0.3}}
    assert await visual_runtime.visual_position(**kwargs) is None


@pytest.mark.asyncio
async def test_unknown_source_interval_can_recover_on_newer_source_without_changing_geometry(runtime):
    kwargs, _, _ = runtime
    unknown = deepcopy(kwargs['timeline'])
    unknown[1]['relationship'] = 'NO_DATA'
    hidden = await visual_runtime.visual_position(**{**kwargs, 'timeline': unknown})
    assert hidden['marker_visible'] is False
    ready = await visual_runtime.visual_position(**{**kwargs, 'source_order': (0, 101)})
    assert ready is not None and ready['marker_visible'] is True
    assert ready['next_stop_eta_seconds'] == 5


@pytest.mark.asyncio
async def test_ready_replacement_generation_recovers_without_map_warming_or_old_curve_reuse(runtime):
    from mobility import geometry_cache
    kwargs, bundle, _ = runtime
    path = kwargs['path']
    geometry_cache.set_cached('p', path['points'], version_id='v', generation_id='g', source='OSM_RAIL')
    try:
        old = await visual_runtime.visual_position(**kwargs)
        assert old is not None
        bundle['generation_id'] = 'g2'
        # Same coordinates, new infrastructure template: this must not remain
        # locked against the old generation's shared profile signature.
        bundle['infrastructure']['edges'][0]['way']['maxspeed_kmh'] = 20
        assert await visual_runtime.visual_position(**kwargs) is None
        assert geometry_cache.get_entry('p', 'v') is None
        recovered = await visual_runtime.visual_position(**{**kwargs,
            'path': {**path, 'derived_generation': 'g2'}, 'now_s': 116})
        assert recovered is not None and recovered['marker_visible']
        assert recovered['next_stop_eta_seconds'] == 4
        assert 0 < recovered['progress_m'] < 500
        assert len(kwargs['state_collection'].rows) == 2
    finally:
        geometry_cache.clear()


@pytest.mark.asyncio
async def test_stale_visual_request_cannot_evict_a_newer_cached_generation(runtime):
    from mobility import geometry_cache
    kwargs, bundle, _ = runtime
    geometry_cache.set_cached('p', kwargs['path']['points'], version_id='v', generation_id='g2', source='OSM_RAIL')
    bundle['generation_id'] = 'g2'
    try:
        assert await visual_runtime.visual_position(**kwargs) is None
        assert geometry_cache.get_entry('p', 'v')['generation_id'] == 'g2'
    finally:
        geometry_cache.clear()


def test_visual_run_retains_final_source_dwell_not_only_arrival(monkeypatch):
    route = {'stops': [{'stop_id': 'A', 'lat': 52, 'lng': 11}, {'stop_id': 'B', 'lat': 52.001, 'lng': 11}]}
    trip = {'trip_id': 't', 'stop_ids': ['A', 'B'], 'stop_times': {'A': '00:01:50', 'B': '00:03:00'},
            'stop_times_arrival': {'A': '00:01:40', 'B': '00:02:50'}}
    assert routes._trip_window(route, trip)['end'] == 170  # Legacy stays unchanged.
    monkeypatch.setenv('MOBILITY_VISUAL_PROGRESS_ENABLED', 'true')
    window = routes._trip_window(route, trip)
    assert window['end'] == 180
    run = {'trips': [{**window, 'trip': trip, 'source_start': 100, 'source_end': 180}]}
    assert routes._select_run_trip(run, 175)[0] is not None
    assert routes._select_run_trip(run, 181)[0] is None


@pytest.mark.asyncio
async def test_live_cache_uses_idle_expiry_and_still_checks_authority(runtime, monkeypatch):
    kwargs, bundle, get = runtime
    clock = [1000]
    monkeypatch.setattr(visual_runtime.time, 'monotonic', lambda: clock[0])
    assert await visual_runtime.visual_position(**kwargs) is not None
    original = next(iter(visual_runtime._PLANS.values()))['plan']
    for now in (1200, 1400, 1600):
        clock[0] = now
        assert await visual_runtime.visual_position(**kwargs) is not None
        assert next(iter(visual_runtime._PLANS.values()))['plan'] is original
    assert get.await_count == 4
    bundle['ready'] = False
    assert await visual_runtime.visual_position(**kwargs) is None
    bundle['ready'] = True
    clock[0] = 1901
    assert await visual_runtime.visual_position(**kwargs) is not None
    assert next(iter(visual_runtime._PLANS.values()))['plan'] is not original


@pytest.mark.asyncio
async def test_immutable_template_survives_idle_expiry_but_new_generation_rebuilds(runtime, monkeypatch):
    from mobility.motion import tram
    from unittest.mock import Mock
    kwargs, bundle, _ = runtime
    clock = [1000]
    monkeypatch.setattr(visual_runtime.time, 'monotonic', lambda: clock[0])
    build = Mock(wraps=tram.build_tram_leg)
    monkeypatch.setattr(tram, 'build_tram_leg', build)
    assert await visual_runtime.visual_position(**kwargs) is not None
    calls = build.call_count
    clock[0] = 1601
    assert await visual_runtime.visual_position(**kwargs) is not None
    assert build.call_count == calls
    bundle['generation_id'] = 'g2'
    assert await visual_runtime.visual_position(**{**kwargs,
        'path': {**kwargs['path'], 'derived_generation': 'g2'}}) is not None
    assert build.call_count > calls
