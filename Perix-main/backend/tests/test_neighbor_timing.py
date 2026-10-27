from copy import deepcopy
from pathlib import Path
import json
from unittest.mock import AsyncMock

import pytest

from routes import mobility as routes
from mobility.eta_quality import eta_source_for_stop
from mobility.motion import timeline_fallback as fallback


def data():
    ids = ['A', 'B', 'C', 'D']
    route = {'mode': 'tram', 'route_number': '9', 'stops': [
        {'stop_id': sid, 'name': sid, 'lat': 52 + i / 1000, 'lng': 11} for i, sid in enumerate(ids)]}
    trip = {'trip_id': 'T', 'stop_ids': ids, 'stop_times': dict(zip(ids, ['08:00', '08:02', '08:04', '08:06']))}
    rt = {'stop_predictions': {'A': {'departure_delay_seconds': 60}, 'D': {'arrival_delay_seconds': 300}}}
    return route, trip, rt


def test_missing_times_combine_both_neighboring_source_clocks_without_rewriting_them():
    route, trip, rt = data(); original = deepcopy(rt)
    timeline = routes._predicted_stop_timeline(route, trip, rt)
    assert timeline[1]['predicted_arrival'] == 8 * 3600 + 180
    assert timeline[2]['predicted_arrival'] == 8 * 3600 + 300
    assert timeline[1]['timing_basis'] == 'BETWEEN_STOP_UPDATES'
    assert timeline[1]['timing_anchor_stop_id'] == 'A'
    assert timeline[1]['timing_next_anchor_stop_id'] == 'D'
    assert timeline[1]['provider_predicted_arrival_s'] is None
    assert timeline[3]['provider_predicted_arrival_s'] == 8 * 3600 + 660
    assert eta_source_for_stop(rt, 'B', timeline[1]) == 'REALTIME_PROPAGATED'
    assert not any(e['timing_order_adjusted'] for e in timeline)
    assert rt == original
    assert timeline[1]['timing_neighbor_constraint'] == 'DOWNSTREAM_TIME_BOUND'


def test_next_source_can_reduce_the_carried_delay_before_it_causes_false_order_conflict():
    route, trip, rt = data()
    rt['stop_predictions']['A']['departure_delay_seconds'] = 300
    rt['stop_predictions']['D']['arrival_delay_seconds'] = 0
    timeline = routes._predicted_stop_timeline(route, trip, rt)
    assert [e['predicted_arrival'] for e in timeline[1:]] == [8 * 3600 + 320, 8 * 3600 + 340, 8 * 3600 + 360]
    assert timeline[-1]['predicted_departure'] == 8 * 3600 + 360
    assert not any(e['timing_order_adjusted'] for e in timeline)


def test_missing_future_source_keeps_one_sided_propagation_instead_of_inventing_an_anchor():
    route, trip, rt = data(); rt['stop_predictions'].pop('D')
    timeline = routes._predicted_stop_timeline(route, trip, rt)
    assert timeline[1]['timing_basis'] == 'PROPAGATED_STOP_DEPARTURE'
    assert timeline[1].get('timing_next_anchor_stop_id') is None


def test_direct_intermediate_clock_is_an_anchor_not_a_value_to_average_away():
    route, trip, rt = data(); rt['stop_predictions']['B'] = {'arrival_delay_seconds': 120}
    timeline = routes._predicted_stop_timeline(route, trip, rt)
    assert timeline[1]['predicted_arrival'] == 8 * 3600 + 240
    assert timeline[1]['timing_basis'] == 'DIRECT_STOP_UPDATE'
    assert timeline[2]['timing_anchor_stop_id'] == 'B'
    assert timeline[2]['timing_next_anchor_stop_id'] == 'D'


@pytest.mark.parametrize('relationship', ['NO_DATA', 'SKIPPED'])
def test_no_data_is_a_boundary_and_skipped_stop_is_not_a_timing_observation(relationship):
    route, trip, rt = data(); rt['stop_relationships'] = {'B': relationship}
    timeline = routes._predicted_stop_timeline(route, trip, rt)
    assert timeline[1]['timing_basis'] == relationship
    if relationship == 'NO_DATA':
        assert timeline[2]['timing_basis'] == 'SCHEDULE'
    else:
        assert timeline[2]['timing_basis'] == 'BETWEEN_STOP_UPDATES'


def test_impossible_source_endpoints_stay_raw_and_explicitly_conflicting():
    route, trip, rt = data()
    rt['stop_predictions']['A']['departure_delay_seconds'] = 600
    rt['stop_predictions']['D']['arrival_delay_seconds'] = 0
    timeline = routes._predicted_stop_timeline(route, trip, rt)
    assert timeline[-1]['provider_predicted_arrival_s'] == 8 * 3600 + 360
    assert timeline[-1]['predicted_arrival'] >= 8 * 3600 + 600
    assert timeline[-1]['timing_order_adjusted']


def simple_timeline(arrival=480):
    route = {'mode': 'tram', 'route_number': '9', 'stops': [
        {'stop_id': 'A', 'name': 'A', 'lat': 52, 'lng': 11},
        {'stop_id': 'B', 'name': 'B', 'lat': 52.01, 'lng': 11}]}
    trip = {'trip_id': 'T', 'stop_ids': ['A', 'B'], 'stop_times': {'A': '08:00', 'B': '08:04'}}
    rt = {'stop_predictions': {'A': {'departure_delay_seconds': 0}, 'B': {'arrival_delay_seconds': arrival - 240}}}
    return route, trip, rt, routes._predicted_stop_timeline(route, trip, rt)


def path():
    return {'points': [[52, 11], [52.01, 11]], 'stop_progress': [0, 1000], 'total_m': 1000,
            'pattern_id': 'p', 'service_date': '2026-10-25', 'geometry_source': 'GTFS_POSITION_FALLBACK'}


def sample(timeline, now, **kwargs):
    return fallback.position_from_timeline(trip_id='T', mode='tram', version_id='v', timeline=timeline,
        path=kwargs.pop('path', path()), now_sec=now, **kwargs)


def test_fallback_never_arrives_at_the_next_stop_while_its_own_eta_is_five_minutes():
    fallback.clear_fallback_cache()
    _, _, _, timeline = simple_timeline()
    result = sample(timeline, 8 * 3600 + 180)
    assert 0 < result['progress_m'] < 1000
    assert result['next_timeline_index'] == 1
    assert result['effective_timeline'][1]['predicted_arrival'] - (8 * 3600 + 180) == 300
    assert result['signal_stop_count'] == result['traffic_edge_count'] == 0
    assert result['motion_state'] != 'SIGNAL_HOLD'


def test_later_next_stop_clock_resamples_existing_fallback_without_preserving_a_wrong_lead():
    fallback.clear_fallback_cache()
    _, _, _, old = simple_timeline(240)
    _, _, _, revised = simple_timeline(480)
    before = sample(old, 8 * 3600 + 180)
    after = sample(revised, 8 * 3600 + 180)
    assert before['progress_m'] > after['progress_m']
    assert before['estimate_revision'] != after['estimate_revision']
    assert sample(revised, 8 * 3600 + 181)['estimate_revision'] == after['estimate_revision']
    assert sample(revised, 8 * 3600 + 181)['progress_m'] > after['progress_m']


def test_impossibly_short_source_time_is_not_achieved_by_teleporting_or_rewriting_provider():
    _, _, _, timeline = simple_timeline(10); original = deepcopy(timeline)
    result = sample(timeline, 8 * 3600 + 10)
    assert result['progress_m'] < 1000
    assert result['effective_timeline'][1]['predicted_arrival'] > 8 * 3600 + 10
    assert result['effective_timeline'][1]['source_predicted_arrival'] == 8 * 3600 + 10
    assert result['speed_kmh'] <= 45
    assert timeline == original


def test_fallback_cache_is_dated_and_bounded(monkeypatch):
    fallback.clear_fallback_cache(); monkeypatch.setattr(fallback, 'MAX_PLANS', 2)
    _, _, _, timeline = simple_timeline()
    first = sample(timeline, 8 * 3600 + 180)
    second = sample(timeline, 8 * 3600 + 180, path={**path(), 'service_date': '2026-10-26'})
    assert first['estimate_revision'] != second['estimate_revision']
    sample(timeline, 8 * 3600 + 180, path={**path(), 'service_date': '2026-10-27'})
    assert len(fallback._plans) == 2


@pytest.mark.parametrize('mode', ['tram', 'bus'])
@pytest.mark.parametrize('target', [10, 60, 480, 900])
def test_dense_time_samples_obey_one_position_eta_plan_and_generic_speed_cap(mode, target):
    fallback.clear_fallback_cache()
    _, _, _, timeline = simple_timeline(target)
    for second in range(1, max(target, 180) + 1, 5):
        now = 8 * 3600 + second
        result = fallback.position_from_timeline(trip_id='T', mode=mode, version_id='v',
            timeline=timeline, path=path(), now_sec=now)
        arrival = result['effective_timeline'][1]['predicted_arrival']
        assert 0 <= result['progress_m'] <= 1000
        if arrival - now > 1:
            assert result['progress_m'] < 1000
        if now >= arrival:
            assert result['progress_m'] == 1000
        assert result['speed_kmh'] <= (45 if mode == 'tram' else 50)
        assert result['signal_stop_count'] == result['traffic_edge_count'] == 0


def test_oversized_trajectory_is_not_retained_in_fallback_cache(monkeypatch):
    fallback.clear_fallback_cache(); monkeypatch.setattr(fallback, 'MAX_TRAJECTORY_SEGMENTS', 1)
    _, _, _, timeline = simple_timeline()
    assert sample(timeline, 8 * 3600 + 180)
    assert not fallback._plans


def test_fallback_effective_late_finish_participates_in_dated_candidate_retention():
    from mobility.motion import engine
    from mobility.regions import get_active_region
    engine.clear_motion_cache()
    _, _, _, timeline = simple_timeline(10)
    result = sample(timeline, 8 * 3600 + 10)
    region = get_active_region()
    scope = dict(region_id=region.region_id, network_id=region.network_id, version_id='v')
    windows = engine.cached_trip_windows(**scope, service_date='2026-10-25')
    assert windows['T']['end'] >= result['effective_timeline'][-1]['predicted_departure'] - 1
    assert not engine.cached_trip_windows(**scope, service_date='2026-10-26')
    engine.clear_motion_cache()
    assert not engine.cached_trip_windows(**scope, service_date='2026-10-25')


def test_departure_only_future_endpoint_is_not_silently_called_a_direct_arrival():
    route, trip, rt = data()
    rt['stop_predictions']['D'] = {'departure_delay_seconds': 300}
    timeline = routes._predicted_stop_timeline(route, trip, rt)
    assert timeline[1]['timing_basis'] == 'PROPAGATED_STOP_DEPARTURE'
    assert timeline[-1]['provider_predicted_arrival_s'] is None
    assert timeline[-1]['provider_predicted_departure_s'] == 8 * 3600 + 660


def test_actual_later_9_clocks_do_not_shift_following_leg_lateness_upstream_to_missing_am_fuchsberg():
    # Controlled thinning of captured later provider clocks, not an actual
    # sparse feed or proof of the vehicle's physical position.
    fixture = json.loads((Path(__file__).parent / 'fixtures/am_fuchsberg_sparse_20261025.json').read_bytes())
    rt = fixture['realtime']
    rt['stop_predictions']['340825']['departure_epoch'] = 1792947930  # 18:05:30 Berlin
    rt['stop_predictions']['340825']['departure_delay_seconds'] = 90
    rt['stop_predictions']['89420'] = {'arrival_delay_seconds': 109, 'departure_delay_seconds': 129}
    timeline = routes._predicted_stop_timeline(fixture['route'], fixture['trip'], rt)
    am = next(e for e in timeline if e['stop_id'] == '639170')
    assert am['predicted_arrival'] == 18 * 3600 + 7 * 60 + 30
    assert am['timing_basis'] == 'BETWEEN_STOP_UPDATES'
    assert am['timing_next_anchor_stop_id'] == '89420'
    assert am['provider_predicted_arrival_s'] is None
    withheld_provider_arrival = 18 * 3600 + 7 * 60 + 15
    assert am['predicted_arrival'] - withheld_provider_arrival == 15


@pytest.mark.asyncio
async def test_engine_failure_uses_same_plan_for_marker_and_stop_projection(monkeypatch):
    from mobility import motion
    route, trip, rt, _ = simple_timeline()
    monkeypatch.setattr(routes, '_trip_path_geometry', AsyncMock(return_value=path()))
    monkeypatch.setattr(routes, 'MOTION_ENGINE_ENABLED', True)
    monkeypatch.setattr(motion, 'position_for_trip', AsyncMock(return_value={
        'motion_available': False, 'fallback_reason': 'GENERATION_NOT_FOUND'}))
    result = await routes._estimate_trip_position(route, trip, 8 * 3600 + 180, {'T': rt}, version_id='v',
        network={'version_id': 'v', 'service_date': '2026-10-25'})
    assert result['motion']['quality'] == 'TIMELINE_CONSTRAINED_FALLBACK'
    assert result['motion']['fallback_reason'] == 'GENERATION_NOT_FOUND'
    assert result['timing_evidence']['position_assurance'] == 'TIMELINE_CONSTRAINED_FALLBACK'
    assert result['_effective_timeline'][1]['predicted_arrival'] == 8 * 3600 + 480
    assert result['next_stop_eta_seconds'] == 300
    assert result['_motion_plan_revision'] and result['estimate_revision']
    assert result['progress_m'] < 1000
    from mobility.motion.diagnostics import summarize_vehicle_motion
    summary = summarize_vehicle_motion([{'estimated': True, 'motion': result['motion']}])
    assert summary['physics_vehicles'] == summary['legacy_fallback_vehicles'] == 0
    assert summary['constrained_fallback_vehicles'] == 1
