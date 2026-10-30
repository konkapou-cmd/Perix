"""Synthetic edge cases for engineering safety, not real-vehicle accuracy."""
from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
import json
from pathlib import Path

import pytest

from mobility.motion import engine, native_recalibration as native
from mobility.motion.common import sample_trajectory
from mobility.motion.config import motion_config_for
from mobility.motion.native_realtime import normalize_timeline


def inputs():
    edges = [dict(edge_id=str(i), from_node=i, to_node=i+1, from_m=float(i*600),
        to_m=float((i+1)*600), from_point=[52., 11.+i*.01], to_point=[52., 11.+(i+1)*.01],
        way={'highway': 'primary', 'maxspeed_kmh': 50.}) for i in range(2)]
    infra = {'edges': edges, 'signals': [], 'total_m': 1200.}
    bundle = {'region_id': 'r', 'network_id': 'n', 'version_id': 'v', 'pattern_id': 'p',
        'generation_id': 'g', 'ready': True, 'mode': 'bus', 'infrastructure': infra,
        'geometry': {'validation': {'valid': True}}}
    path = {'pattern_id': 'p', 'derived_generation': 'g', 'total_m': 1200., 'stop_progress': [0., 600., 1200.]}
    timeline = [{'stop_id': s, 'stop_sequence': i+1, 'scheduled_arrival': a,
        'scheduled_departure': a+10, 'predicted_arrival': a, 'predicted_departure': a+10,
        'prediction_basis': 'RT_EXPLICIT', 'relationship': 'SCHEDULED'}
        for i, (s, a) in enumerate([('A', 0.), ('B', 300.), ('C', 600.)])]
    return infra, bundle, path, timeline


@pytest.fixture(autouse=True)
def isolated(monkeypatch):
    region = SimpleNamespace(region_id='r', network_id='n', timezone='UTC', motion={})
    monkeypatch.setattr(engine, 'get_active_region', lambda: region)
    monkeypatch.setattr(engine, 'traffic_snapshot_for_edges', AsyncMock(side_effect=AssertionError('EXTERNAL_OR_PROFILE_READ')))
    monkeypatch.setenv('MOBILITY_TIME_ALLOCATION_ENABLED', 'false')
    monkeypatch.delenv('MOBILITY_NATIVE_RECALIBRATION_ENABLED', raising=False)


@pytest.mark.parametrize('initial', [0., 10., 30., 49.])
@pytest.mark.parametrize('target', [10., 120., 240., 600.])
def test_solver_keeps_position_speed_physics_and_no_global_scaling(initial, target):
    infra, _, _, _ = inputs()
    c = motion_config_for('bus')
    fitted = native.fit_remaining_leg(infra=infra, start_m=100., end_m=600., initial_speed_kmh=initial,
        target_s=target, departure_service_s=100., config=c)
    trajectory = fitted['trajectory']
    assert fitted['time_scale'] == 1.
    at_now = sample_trajectory(trajectory, 0.)
    assert at_now['progress_m'] == pytest.approx(100.)
    assert at_now['speed_kmh'] == pytest.approx(initial)
    assert native.construction_checks(trajectory, c, initial)['physics_violations'] == 0
    if target >= fitted['fastest_duration_s']:
        assert abs(fitted['native_recalibration']['target_error_s']) < .12
        assert sample_trajectory(trajectory, target+.12)['progress_m'] == pytest.approx(600.)
    else:
        assert fitted['fit'] == 'NATIVE_PHYSICS_LIMITED'
        assert sample_trajectory(trajectory, target)['progress_m'] < 600.
    assert fitted['native_recalibration']['inferred_cause'] == 'UNKNOWN_NOT_OBSERVED_TRAFFIC'


async def update(session, bundle, path, timeline, *, t=100., source=None, **kw):
    epoch = 1793000000.+t
    return await session.update(trip_id='t', service_date='2026-10-26', timeline=timeline,
        path=path, bundle=bundle, source_epoch=epoch if source is None else source,
        received_epoch=epoch, now_epoch=epoch, now_service_s=t, **kw)


@pytest.mark.asyncio
async def test_new_flags_default_off_and_no_passenger_state_or_provider_access():
    _, bundle, path, timeline = inputs()
    passenger = deepcopy((engine._PLAN_CACHE, engine._HANDOVER_STATE))
    assert not native.enabled()
    assert (await update(native.NativeShadowSession(), bundle, path, timeline))['reason'] == 'NATIVE_SHADOW_DISABLED'
    s = native.NativeShadowSession(enabled_override=True)
    assert (await update(s, bundle, path, timeline))['accepted']
    assert (engine._PLAN_CACHE, engine._HANDOVER_STATE) == passenger
    engine.traffic_snapshot_for_edges.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize('delta', [120., -120., -190., 1.])
async def test_changed_eta_rebuilds_remaining_only_and_preserves_current_speed(delta):
    _, bundle, path, timeline = inputs()
    s = native.NativeShadowSession(enabled_override=True)
    await update(s, bundle, path, timeline)
    old = s.checkpoint()
    expected = engine._sample_trip_plan(old['plan'], 110., timeline, path['stop_progress'])
    changed = deepcopy(timeline)
    for entry in changed[1:]:
        entry['predicted_arrival'] += delta; entry['predicted_departure'] += delta
    result = await update(s, bundle, path, changed, t=110.)
    assert result['accepted'], result
    assert result['sample']['progress_m'] == pytest.approx(expected['progress_m'])
    assert result['sample']['speed_kmh'] == pytest.approx(expected['speed_kmh'], abs=.01)
    assert result['plan']['effective_timeline'][0] == old['plan']['effective_timeline'][0]
    for before in (40., 99., 109.):
        prior = engine._sample_trip_plan(old['plan'], before, timeline, path['stop_progress'])
        after = engine._sample_trip_plan(result['plan'], before, timeline, path['stop_progress'])
        assert after['progress_m'] == pytest.approx(prior['progress_m'])
    for leg in result['plan']['segments']:
        if 'native_recalibration' in leg:
            assert leg['native_recalibration']['physics_violations'] == 0
            assert leg['time_scale'] == 1.
    assert changed != timeline


@pytest.mark.asyncio
async def test_duplicates_refresh_and_out_of_order_never_recalibrate():
    _, bundle, path, timeline = inputs(); s = native.NativeShadowSession(enabled_override=True)
    first = await update(s, bundle, path, timeline)
    duplicate = await update(s, bundle, path, timeline, t=103.)
    assert not duplicate['rebuilt'] and duplicate['plan'] == first['plan']
    changed = deepcopy(timeline); changed[1]['predicted_arrival'] += 10
    late = await update(s, bundle, path, changed, t=105., source=1793000100.)
    assert late['reason'] == 'OUT_OF_ORDER'
    assert late['plan'] == first['plan']
    future = await update(s, bundle, path, changed, t=106., source=1793000200.)
    assert future['reason'] == 'STALE_OR_FUTURE_SOURCE'
    conflict = await update(s, bundle, path, changed, t=104., source=1793000103.)
    assert conflict['reason'] == 'CONFLICTING_SAME_TIMESTAMP'


@pytest.mark.asyncio
async def test_stale_update_no_data_and_long_gap_preserve_previous_plan():
    _, bundle, path, timeline = inputs(); s = native.NativeShadowSession(enabled_override=True)
    first = await update(s, bundle, path, timeline)
    stale = await update(s, bundle, path, timeline, t=101., source=1792999000.)
    assert stale['reason'] == 'STALE_OR_FUTURE_SOURCE'
    unknown = deepcopy(timeline); unknown[1]['relationship'] = 'NO_DATA'
    r = await update(s, bundle, path, unknown, t=110.)
    assert r['reason'] == 'NO_RELIABLE_NEXT_PREDICTION'
    assert r['plan'] == first['plan']
    later = deepcopy(timeline); later[1]['predicted_arrival'] += 120; later[1]['predicted_departure'] += 120
    r = await update(s, bundle, path, later, t=200.)
    assert r['reason'] == 'STATE_GAP_REQUIRES_RESEED'


@pytest.mark.asyncio
async def test_checkpoint_restart_same_update_is_idempotent_and_generation_does_not_bridge():
    _, bundle, path, timeline = inputs(); s = native.NativeShadowSession(enabled_override=True)
    await update(s, bundle, path, timeline)
    checkpoint = json.loads(json.dumps(s.checkpoint()))
    restored = native.NativeShadowSession(enabled_override=True); restored.restore(checkpoint)
    a = await update(s, bundle, path, timeline, t=105.)
    b = await update(restored, bundle, path, timeline, t=105.)
    assert a == b
    bundle = {**bundle, 'generation_id': 'g2'}
    mismatch = await update(restored, bundle, path, timeline, t=110.)
    assert mismatch['reason'] == 'GENERATION_MISMATCH'
    reset = await update(restored, bundle, {**path, 'derived_generation': 'g2'}, timeline, t=110.)
    assert reset['reason'] == 'IDENTITY_RESET_NO_CONTINUITY_CLAIM'


@pytest.mark.asyncio
async def test_cancel_stops_shadow_output_and_cannot_resurrect_from_old_feed():
    _, bundle, path, timeline = inputs(); s = native.NativeShadowSession(enabled_override=True)
    await update(s, bundle, path, timeline)
    r = await update(s, bundle, path, [], t=110., trip_relationship='CANCELED')
    assert r['sample'] is None and r['reason'] == 'CANCELED'
    r = await update(s, bundle, path, timeline, t=111., source=1793000100.)
    assert r['reason'] == 'OUT_OF_ORDER' and r['sample'] is None


def test_chain_gap_and_initial_braking_contradiction_are_not_teleported():
    infra, _, _, _ = inputs(); infra['edges'][1]['from_m'] += 10
    with pytest.raises(ValueError, match='CANONICAL_CHAIN_GAP'):
        native.fit_remaining_leg(infra=infra, start_m=100., end_m=1000., initial_speed_kmh=30.,
            target_s=100., departure_service_s=100., config=motion_config_for('bus'))
    with pytest.raises(ValueError, match='NO_CONTINUOUS_PHYSICAL_TAIL'):
        native.fit_remaining_leg(infra=infra, start_m=598., end_m=600., initial_speed_kmh=50.,
            target_s=100., departure_service_s=100., config=motion_config_for('bus'))


def static_trip():
    return {'trip_id': 't', 'stop_times_sequence': [
        {'stop_id': s, 'stop_sequence': seq, 'arrival_time': a, 'departure_time': d}
        for s, seq, a, d in [('A', 10, '24:00:05', '24:00:15'),
                             ('B', 20, '24:05:05', '24:05:15'),
                             ('A', 30, '24:10:05', '24:10:15')]]}


def test_normalization_preserves_occurrence_epochs_delays_and_no_double_count():
    t = static_trip()
    epoch = int(datetime(2026, 10, 27, 0, 7, 5, tzinfo=timezone.utc).timestamp())
    rt = {'trip_id': 't', 'start_date': '20261026', 'trip_relationship': 'SCHEDULED',
        'trip_delay': 120, 'stops': [{'stop_id': 'B', 'stop_sequence': 20,
            'arrival': {'time': epoch, 'delay': 999}, 'departure': {'delay': 120}}]}
    timeline = normalize_timeline(t, rt, service_date='2026-10-26', timezone='UTC')
    assert timeline[1]['predicted_arrival'] == 86825  # 24:07:05, not +999 or +120 again.
    assert timeline[1]['predicted_departure'] == 86835
    assert timeline[2]['predicted_arrival'] == 87125
    assert timeline[0]['stop_id'] == timeline[2]['stop_id']
    rt['stops'] = [{'stop_id': 'A', 'arrival': {'delay': 120}}]
    with pytest.raises(ValueError, match='AMBIGUOUS_REALTIME_OCCURRENCE'):
        normalize_timeline(t, rt, service_date='2026-10-26', timezone='UTC')


def test_no_data_resets_propagation_skipped_does_not_create_a_delay():
    rt = {'trip_id': 't', 'trip_relationship': 'SCHEDULED', 'trip_delay': 120,
        'stops': [{'stop_sequence': 20, 'relationship': 'NO_DATA'},
                  {'stop_sequence': 30, 'relationship': 'SKIPPED', 'arrival': {'delay': 999}}]}
    timeline = normalize_timeline(static_trip(), rt, service_date='2026-10-26', timezone='UTC')
    assert timeline[1]['prediction_basis'] == 'SCHEDULE'
    assert timeline[2]['relationship'] == 'SKIPPED'
    assert timeline[2]['delay_seconds'] == 0


def test_removed_provider_modules_and_startup_hooks_are_absent():
    root = Path(__file__).parents[1]
    assert not list((root/'mobility').glob('tomtom*.py'))
    assert 'tomtom' not in (root/'utils/mobility_workers.py').read_text(encoding='utf-8').lower()
    assert 'tomtom' not in (root/'mobility/motion/engine.py').read_text(encoding='utf-8').lower()


@pytest.mark.asyncio
async def test_skipped_next_stop_and_infeasible_following_deadline_propagate_forward():
    _, bundle, path, timeline = inputs(); s = native.NativeShadowSession(enabled_override=True)
    await update(s, bundle, path, timeline)
    changed = deepcopy(timeline); changed[1]['relationship'] = 'SKIPPED'
    changed[2]['predicted_arrival'] = 115.; changed[2]['predicted_departure'] = 125.
    r = await update(s, bundle, path, changed, t=110.)
    assert r['accepted'] and r['sample']['next_timeline_index'] == 2
    assert r['plan']['max_arrival_target_error_s'] > 0
    assert all(seg.get('to_stop_id') != 'B' for seg in r['plan']['segments'] if seg['t0'] >= 110)


def test_signal_alternative_is_bounded_and_never_claimed_real_phase():
    from test_mobility_time_allocation import edges, signal
    c = motion_config_for('bus')
    r = native.fit_remaining_leg(infra={'edges': edges(), 'signals': [signal()]}, start_m=0.,
        end_m=600., initial_speed_kmh=0., target_s=240., departure_service_s=0., config=c)
    report = r['native_recalibration']
    signals = [v for v in report['candidates'] if v['hypothetical_signal_id']]
    assert signals and all(0 <= v['hold_s'] <= c['road_signal_max_hold_s'] for v in signals)
    assert report['selected'] != 'POSSIBLE_SIGNAL_HOLD'
    assert report['uncertainty'] == 'EVALUATED_SCENARIOS_NOT_CONFIDENCE_INTERVAL'


@pytest.mark.asyncio
async def test_forecast_updates_at_reached_stop_do_not_reopen_completed_motion():
    _, bundle, path, timeline = inputs(); s = native.NativeShadowSession(enabled_override=True)
    await update(s, bundle, path, timeline, t=299.)
    changed = deepcopy(timeline)
    changed[2]['predicted_arrival'] += 120; changed[2]['predicted_departure'] += 120
    r = await update(s, bundle, path, changed, t=301.)
    assert r['accepted'] and r['sample']['progress_m'] == pytest.approx(600.)
    assert r['sample']['speed_kmh'] == 0


def test_invalid_checkpoint_does_not_masquerade_as_restart_state():
    with pytest.raises(ValueError, match='INVALID_NATIVE_CHECKPOINT'):
        native.NativeShadowSession().restore({'schema_v': 1})


@pytest.mark.asyncio
async def test_frequency_trip_instance_start_time_is_not_reused():
    _, bundle, path, timeline = inputs(); s = native.NativeShadowSession(enabled_override=True)
    await update(s, bundle, path, timeline, start_time='09:00:00')
    r = await update(s, bundle, path, timeline, t=105., start_time='09:15:00')
    assert r['reason'] == 'IDENTITY_RESET_NO_CONTINUITY_CLAIM'


@pytest.mark.asyncio
async def test_path_changes_without_a_new_generation_are_rejected():
    _, bundle, path, timeline = inputs(); s = native.NativeShadowSession(enabled_override=True)
    await update(s, bundle, path, timeline)
    path = deepcopy(path); path['stop_progress'][1] += 25
    r = await update(s, bundle, path, timeline, t=105.)
    assert r['reason'] == 'CANONICAL_PATH_CHANGED_WITHIN_GENERATION'


@pytest.mark.asyncio
async def test_replay_comparison_uses_same_handover_and_does_not_forge_bus_truth():
    import importlib.util
    spec = importlib.util.spec_from_file_location('native_replay_tool', Path(__file__).parents[1]/'tools/replay_native_recalibration.py')
    tool = importlib.util.module_from_spec(spec); spec.loader.exec_module(tool)
    _, bundle, path, timeline = inputs()
    def case(t, rows):
        return dict(trip_id='t', service_date='2026-10-26', timeline=rows, path=path,
            bundle=bundle, now_service_s=t, now_epoch=1793000000.+t,
            received_epoch=1793000000.+t, source_epoch=1793000000.+t)
    changed = deepcopy(timeline)
    for e in changed[1:]: e['predicted_arrival'] += 120; e['predicted_departure'] += 120
    r = await tool.compare_updates([case(100., timeline), case(110., changed)], region=engine.get_active_region())
    rows = [x for x in r['rows'] if x['calculation_service_s'] == 110.]
    assert rows[0]['models']['A']['progress_m'] == pytest.approx(rows[0]['models']['C']['progress_m'])
    assert rows[0]['models']['C']['speed_kmh'] > rows[0]['models']['A']['speed_kmh']
    assert abs(rows[1]['position_delta_c_minus_b_m']) > 1
    assert all(not x['observed_vehicle_state'] for row in rows for x in row['models'].values())


@pytest.mark.asyncio
async def test_only_completed_forecast_change_is_not_a_new_current_motion_constraint():
    _, bundle, path, timeline = inputs(); s = native.NativeShadowSession(enabled_override=True)
    await update(s, bundle, path, timeline)
    old = s.checkpoint()
    changed = deepcopy(timeline)
    changed[0]['predicted_arrival'] -= 20
    r = await update(s, bundle, path, changed, t=105.)
    assert r['reason'] == 'COMPLETED_TARGETS_ONLY_NO_REBUILD'
    assert r['plan'] == old['plan']


@pytest.mark.asyncio
async def test_future_stop_revision_keeps_unchanged_current_tail_exact():
    _, bundle, path, timeline = inputs(); s = native.NativeShadowSession(enabled_override=True)
    await update(s, bundle, path, timeline)
    old = s.checkpoint()
    changed = deepcopy(timeline)
    changed[2]['predicted_arrival'] += 120; changed[2]['predicted_departure'] += 120
    r = await update(s, bundle, path, changed, t=105.)
    assert r['accepted'] and r['rebuilt']
    for t in (105., 130., 200., 299.):
        before = engine._sample_trip_plan(old['plan'], t, timeline, path['stop_progress'])
        after = engine._sample_trip_plan(r['plan'], t, timeline, path['stop_progress'])
        assert before['progress_m'] == pytest.approx(after['progress_m'])
        assert before['speed_kmh'] == pytest.approx(after['speed_kmh'])
    assert any(s.get('native_recalibration', {}).get('selected') == 'UNCHANGED_CURRENT_TARGET_RETAINED'
               for s in r['plan']['segments'])


@pytest.mark.parametrize('value', [0., -1., float('nan')])
def test_invalid_grid_cannot_cause_unbounded_recalibration(value):
    infra, _, _, _ = inputs()
    with pytest.raises(ValueError, match='INVALID_NATIVE_PHYSICS_CONFIG'):
        native.fit_remaining_leg(infra=infra, start_m=0., end_m=600., initial_speed_kmh=0.,
            target_s=240., departure_service_s=0., config={**motion_config_for('bus'), 'trajectory_step_m': value})


def test_source_clock_and_zero_delay_are_preserved_from_protobuf():
    from google.transit import gtfs_realtime_pb2
    from mobility.motion.native_realtime import trip_update_record
    u = gtfs_realtime_pb2.TripUpdate()
    u.trip.trip_id = 't'; u.trip.start_date = '20261026'
    u.timestamp = 1793000000; u.delay = 0
    s = u.stop_time_update.add(); s.stop_sequence = 10; s.stop_id = 'A'
    s.arrival.delay = 0
    r = trip_update_record(u, 1793000010)
    assert r['source_epoch'] == 1793000000 and r['feed_epoch'] == 1793000010
    assert r['source_clock_basis'] == 'TRIP_UPDATE' and r['trip_delay'] == 0
    assert r['stops'][0]['arrival']['delay'] == 0


def test_small_sample_p95_is_not_below_p50():
    import importlib.util
    spec = importlib.util.spec_from_file_location('native_percentiles', Path(__file__).parents[1]/'tools/replay_native_recalibration.py')
    tool = importlib.util.module_from_spec(spec); spec.loader.exec_module(tool)
    assert tool.percentile([10., 100.], .95) == pytest.approx(95.5)


@pytest.mark.asyncio
async def test_delayed_current_leg_does_not_clip_future_motion_from_its_old_clock():
    _, bundle, path, timeline = inputs(); s = native.NativeShadowSession(enabled_override=True)
    await update(s, bundle, path, timeline)
    changed = deepcopy(timeline)
    changed[1]['predicted_arrival'] += 200; changed[1]['predicted_departure'] += 200
    r = await update(s, bundle, path, changed, t=110.)
    assert r['accepted']
    future = next(leg for leg in r['plan']['segments'] if leg['kind'] == 'MOVE' and leg['from_timeline_index'] == 1)
    assert future['trajectory']['start_m'] == pytest.approx(path['stop_progress'][1])
    assert future['trajectory']['segments'][0]['v0'] == 0
