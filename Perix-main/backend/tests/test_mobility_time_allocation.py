"""Synthetic engineering regressions, not measured vehicle accuracy."""
import asyncio
import importlib.util
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from mobility.motion import bus, tram, engine, time_allocation
from mobility.motion.common import directed_turn_caps, sample_trajectory
from mobility.motion.config import motion_config_for


def edges():
    return [dict(edge_id='1:1:2', way_id=1, from_node=1, to_node=2, from_m=0., to_m=300., length_m=300.,
                 from_point=[0., 0.], to_point=[0., .0027], way={'highway': 'primary', 'maxspeed_kmh': 40., 'follows_osm_way': True}),
            dict(edge_id='2:2:3', way_id=2, from_node=2, to_node=3, from_m=300., to_m=600., length_m=300.,
                 from_point=[0., .0027], to_point=[.0027, .0027], way={'highway': 'primary', 'maxspeed_kmh': 40., 'follows_osm_way': True})]


def signal(direction='forward', method='NODE_EXACT', progress=300.):
    return dict(signal_id=2, signal_instance_id='2:0', kinds=['ROAD_SIGNAL'], progress_m=progress,
                latitude=0., longitude=.0027, match_method=method, usable_for_motion=True,
                tags={'traffic_signals:direction': direction})


def setup():
    config = motion_config_for('bus')
    infra = {'edges': edges(), 'signals': [signal()]}
    args = dict(edges=infra['edges'], start_m=0., end_m=600., departure_service_s=0., config=config)
    baseline = engine._fit_leg(lambda ratio: bus.build_bus_leg(**args, signals=[], traffic_by_edge={}, recovery_ratio=ratio), 200., 10)
    def builder(scenario, direct):
        return bus.build_bus_leg(**args, signals=time_allocation.eligible_signals(infra, 'bus', 0, 600),
                                 traffic_by_edge=direct, scenario=scenario)
    return config, infra, baseline, builder


def assert_physics(trajectory, config):
    previous = None
    for segment in trajectory['segments']:
        ds = segment['p1'] - segment['p0']
        assert ds >= 0 and segment['t1'] >= segment['t0']
        assert segment['v1'] ** 2 <= segment['v0'] ** 2 + 2 * config['acceleration_mps2'] * ds + 1e-6
        assert segment['v0'] ** 2 <= segment['v1'] ** 2 + 2 * config['braking_mps2'] * ds + 1e-6
        if previous:
            assert segment['p0'] == pytest.approx(previous['p1'])
            assert segment['v0'] == pytest.approx(previous['v1'])
        previous = segment


def test_turn_braking_and_reacceleration_use_existing_envelope():
    config, infra, _, builder = setup()
    trajectory = builder({'refine_turns': True}, {})
    assert len(trajectory['turn_events']) == 1
    cap = trajectory['turn_events'][0]['speed_cap_kmh'] / 3.6
    at_turn = [s for s in trajectory['segments'] if s['p1'] == 300][0]
    assert at_turn['v1'] <= cap
    assert any(s['v1'] < s['v0'] for s in trajectory['segments'] if s['p1'] <= 300)
    assert any(s['v1'] > s['v0'] for s in trajectory['segments'] if s['p0'] >= 300)
    assert_physics(trajectory, config)


def test_polygon_zigzags_do_not_become_repeated_turns():
    chain = []
    for i in range(12):
        chain.append(dict(edge_id=str(i), from_node=i, to_node=i+1, from_m=i*10., to_m=(i+1)*10.,
            from_point=[(.00003 if i % 2 else 0), i*.00009],
            to_point=[(.00003 if (i+1) % 2 else 0), (i+1)*.00009]))
    turns = directed_turn_caps(chain, 0, 120, {'20': 25, '70': 15}, 20)
    assert not [t for t in turns if 20 <= t['progress_m'] <= 100]
    chain[6]['from_node'] = 999
    assert not [t for t in directed_turn_caps(chain, 0, 120, {'20': 25}, 20) if t['progress_m'] == 60]


@pytest.mark.parametrize('mode', ['bus', 'tram'])
def test_short_leg_cannot_reach_road_speed(mode):
    config = motion_config_for(mode)
    e = edges()[0]; e.update(to_m=20., length_m=20.)
    args = dict(edges=[e], signals=[], start_m=0., end_m=20., departure_service_s=0., config=config,
                scenario={'refine_turns': True})
    result = bus.build_bus_leg(**args, traffic_by_edge={}) if mode == 'bus' else tram.build_tram_leg(**args)
    assert max(max(s['v0'], s['v1']) for s in result['segments']) * 3.6 < 40
    assert_physics(result, config)


@pytest.mark.parametrize('direction,method,count', [('forward','NODE_EXACT',1), ('backward','NODE_EXACT',0),
    ('forward','SPATIAL_NEAR_PATH',0), ('unknown','NODE_EXACT',0)])
def test_signal_requires_real_directed_approach(direction, method, count):
    infra = {'edges': edges(), 'signals': [signal(direction, method)]}
    assert len(time_allocation.eligible_signals(infra, 'bus', 0, 600)) == count


def test_duplicate_heads_dedup_and_near_stop_no_second_dwell():
    infra = {'edges': edges(), 'signals': [signal(), signal()]}
    assert len(time_allocation.eligible_signals(infra, 'bus', 0, 600)) == 1
    assert not time_allocation.eligible_signals(infra, 'bus', 295, 600)
    assert not time_allocation.eligible_signals(infra, 'tram', 0, 600)


def test_signal_cost_is_full_rebuild_and_insufficient_margin_rejects():
    config, infra, baseline, builder = setup()
    event = time_allocation.eligible_signals(infra, 'bus', 0, 600)[0]
    no_stop = builder({'refine_turns': True}, {})
    stopped = builder({'refine_turns': True, 'hold_event_id': event['signal_instance_id'], 'hold_s': 0}, {})
    cost = stopped['duration_s'] - no_stop['duration_s']
    assert cost > 0
    target = no_stop['duration_s'] + cost / 2
    _, report = time_allocation.allocate(baseline, builder, target, infra=infra, mode='bus',
                                         start_m=0, end_m=600, config=config)
    item = next(c for c in report['candidates'] if c['name'] == 'POSSIBLE_SIGNAL_STOP')
    assert item['stop_cost_s'] == pytest.approx(cost)
    assert not item['feasible']
    assert_physics(stopped, config)


def test_no_distinguishing_evidence_retains_baseline_and_reports_ambiguity():
    config, infra, baseline, builder = setup()
    actual, report = time_allocation.allocate(baseline, builder, 200, infra=infra, mode='bus',
                                             start_m=0, end_m=600, config=config)
    assert actual is baseline
    assert report['fallback_reason'] == 'NO_DISTINGUISHING_EVIDENCE'
    assert report['uncertainty'] == 'UNOBSERVED_WITHIN_LEG'
    assert report['position_envelope_samples_m']


def test_impossible_rt_target_preserves_physics_limited_behavior():
    config, infra, _, builder = setup()
    baseline = engine._fit_leg(lambda ratio: bus.build_bus_leg(edges=edges(), signals=[], traffic_by_edge={},
        start_m=0, end_m=600, departure_service_s=0, config=config, recovery_ratio=ratio), 1, 10)
    fitted, report = time_allocation.allocate(baseline, builder, 1, infra=infra, mode='bus',
                                             start_m=0, end_m=600, config=config)
    assert fitted is baseline and fitted['fit'] == 'PHYSICS_LIMITED'
    assert not report['candidates']


def test_no_new_scaled_initial_speed_discontinuity_from_moving_handover():
    config, infra, baseline, _ = setup()
    def builder(scenario, evidence):
        return bus.build_bus_leg(edges=edges(), signals=[], traffic_by_edge=evidence,
            start_m=0, end_m=600, departure_service_s=0, config=config,
            initial_speed_kmh=25., scenario=scenario)
    fitted, report = time_allocation.allocate(baseline, builder, 200, infra=infra, mode='bus',
        start_m=0,end_m=600,config=config,initial_speed_kmh=25.)
    assert fitted is baseline
    assert any(c['reason']=='INITIAL_SPEED_DISCONTINUITY' for c in report['candidates'])


def test_scenario_preserves_small_posted_limit_and_default_provenance():
    config=motion_config_for('bus');chain=edges()
    chain[0]['way']['maxspeed_kmh']=2.
    chain[1]['way'].pop('maxspeed_kmh')
    result=bus.build_bus_leg(edges=chain,signals=[],traffic_by_edge={},start_m=0,end_m=600,
        departure_service_s=0,config=config,scenario={'refine_turns':True})
    assert result['speed_constraints'][0]['speed_cap_kmh']==2.
    assert result['speed_constraints'][0]['limit_basis']=='OSM_TAG'
    assert result['speed_constraints'][1]['limit_basis']=='MODELED_DEFAULT'
    assert not any(s['legal_limit_verified'] for s in result['speed_constraints'])


def test_scenario_does_not_enable_rail_cycles(monkeypatch):
    monkeypatch.setattr(tram, 'deterministic_signal_hold_seconds', lambda *a, **k: pytest.fail('invented rail phase'))
    result = tram.build_tram_leg(edges=edges(), signals=[], start_m=0, end_m=600, departure_service_s=0,
        config={**motion_config_for('tram'), 'rail_signal_enabled': True}, scenario={'refine_turns': True})
    assert result['signal_stop_count'] == 0


def test_default_builders_equal_snapshot_of_preexisting_wip():
    # Optional local byte-level behavior proof; CI has baseline regression suites.
    root = Path(r'C:\Users\PC\AppData\Local\Temp\opencode\perix-physics-tomtom-baseline-20261026')
    if not root.exists():
        pytest.skip('local pre-change WIP snapshot not available')
    for mode, module in [('bus', bus), ('tram', tram)]:
        spec = importlib.util.spec_from_file_location('old_' + mode, root / 'mobility/motion' / (mode + '.py'))
        old = importlib.util.module_from_spec(spec); spec.loader.exec_module(old)
        args = dict(edges=edges(), signals=[signal()], start_m=0., end_m=600., departure_service_s=43200.,
                    config=motion_config_for(mode))
        if mode == 'bus':
            args['traffic_by_edge'] = {}
        assert getattr(module, 'build_' + mode + '_leg')(**args) == getattr(old, 'build_' + mode + '_leg')(**args)


@pytest.mark.asyncio
async def test_shadow_keeps_passenger_plan_and_handover(monkeypatch):
    from mobility import generations
    region = SimpleNamespace(region_id='r', network_id='n', timezone='UTC', motion={})
    infra = {'total_m': 600., 'edges': edges(), 'signals': [signal()]}
    monkeypatch.setattr(engine, 'get_active_region', lambda: region)
    monkeypatch.setattr(engine, 'db', SimpleNamespace(mobility_pattern_infrastructure=SimpleNamespace(find_one=AsyncMock(return_value=infra))))
    monkeypatch.setattr(generations, 'atomic_generations_enabled', lambda: False)
    monkeypatch.setattr(engine, 'traffic_snapshot_for_edges', AsyncMock(return_value={'by_edge': {}}))
    monkeypatch.setenv('MOBILITY_PLAN_HANDOVER_ENABLED', 'true')
    monkeypatch.setenv('MOBILITY_TIME_ALLOCATION_ENABLED', 'false')
    kwargs = dict(trip_id='t', mode='bus', version_id='v', path={'pattern_id':'p','total_m':600.,'stop_progress':[0,600]},
        timeline=[{'stop_id':'A','predicted_arrival':0,'predicted_departure':1},
                  {'stop_id':'B','predicted_arrival':300,'predicted_departure':310}], now_sec=50)
    engine.clear_motion_cache()
    baseline = await engine.position_for_trip(**kwargs)
    baseline_plan = deepcopy(next(iter(engine._PLAN_CACHE.values()))['plan'])
    engine.clear_motion_cache()
    monkeypatch.setenv('MOBILITY_TIME_ALLOCATION_ENABLED', 'true')
    candidate = await engine.position_for_trip(**kwargs)
    plan = next(iter(engine._PLAN_CACHE.values()))['plan']
    assert candidate == baseline
    assert plan['effective_timeline'] == baseline_plan['effective_timeline']
    assert any(s.get('time_allocation') for s in plan['segments'])
    assert all(s.get('time_allocation', {}).get('shadow_only', True) for s in plan['segments'])
    following = await engine.position_for_trip(**{**kwargs, 'now_sec':51})
    assert following['progress_m'] >= candidate['progress_m']
    engine.clear_motion_cache()


@pytest.mark.asyncio
async def test_shadow_cannot_invalidate_baseline_cache_at_traffic_bucket_or_expiry(monkeypatch):
    from mobility import generations
    clock = [100.]
    real_clock = [datetime(2026,10,26,12,0,29,tzinfo=timezone.utc)]
    class Clock(datetime):
        @classmethod
        def now(cls,tz=None):return real_clock[0].astimezone(tz)
    region=SimpleNamespace(region_id='r',network_id='n',timezone='UTC',motion={})
    infra={'total_m':600.,'edges':edges(),'signals':[]}
    lookup=AsyncMock(return_value=infra)
    monkeypatch.setattr(engine,'db',SimpleNamespace(mobility_pattern_infrastructure=SimpleNamespace(find_one=lookup)))
    monkeypatch.setattr(engine,'get_active_region',lambda:region)
    monkeypatch.setattr(engine,'datetime',Clock)
    monkeypatch.setattr(engine,'time',SimpleNamespace(monotonic=lambda:clock[0]))
    monkeypatch.setattr(generations,'atomic_generations_enabled',lambda:False)
    monkeypatch.setattr(engine,'traffic_snapshot_for_edges',AsyncMock(return_value={'by_edge':{},
        'direct_by_edge':{'2:2:3':{'expires_at':'2026-10-26T12:00:30+00:00'}}}))
    monkeypatch.setenv('MOBILITY_TIME_ALLOCATION_ENABLED','true')
    monkeypatch.setenv('MOBILITY_TIME_ALLOCATION_SHADOW_ONLY','true')
    monkeypatch.setenv('MOBILITY_PLAN_HANDOVER_ENABLED','true')
    args=dict(trip_id='shadow',mode='bus',version_id='v',path={'pattern_id':'p','total_m':600.,'stop_progress':[0,600]},
        timeline=[{'stop_id':'A','predicted_arrival':0,'predicted_departure':1},
                  {'stop_id':'B','predicted_arrival':300,'predicted_departure':310}])
    engine.clear_motion_cache()
    first=await engine.position_for_trip(**args,now_sec=50)
    clock[0]+=3.;real_clock[0]=datetime(2026,10,26,12,0,32,tzinfo=timezone.utc)
    second=await engine.position_for_trip(**args,now_sec=53)
    assert lookup.await_count==1
    assert second['progress_m']>=first['progress_m']
    engine.clear_motion_cache()

