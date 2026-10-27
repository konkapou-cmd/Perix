from copy import deepcopy
from types import SimpleNamespace
import time

import pytest

from mobility.motion import engine
from mobility.motion.source_reconciliation import source_frontier_conflict, source_start_index
from mobility import source_diagnostics


def timeline(later=False):
    values = [0, 150, 240] if later else [0, 60, 120]
    return [dict(stop_id=sid, stop_sequence=i, scheduled_arrival=i * 60, scheduled_departure=i * 60,
        predicted_arrival=value, predicted_departure=value, relationship='SCHEDULED',
        timing_basis='DIRECT_STOP_UPDATE' if i == 0 else 'PROPAGATED_STOP_DEPARTURE',
        departure_timing_basis='DIRECT_STOP_UPDATE' if i == 0 else 'PROPAGATED_STOP_DEPARTURE',
        provider_predicted_arrival_s=0 if i == 0 else None,
        provider_predicted_departure_s=0 if i == 0 else None)
        for i, (sid, value) in enumerate(zip(['A', 'B', 'C'], values))]


def test_only_revised_usable_source_frontiers_override_simulated_history():
    old, new = timeline(), timeline(True)
    assert source_frontier_conflict(old, new, [0, 100, 200], 150, 70)['anchor_index'] == 1
    assert source_frontier_conflict(old, old, [0, 100, 200], 150, 70) is None
    assert source_frontier_conflict(old, new, [0, 100, 200], 50, 70) is None
    new[1].update(timing_basis='SCHEDULE', departure_timing_basis='SCHEDULE')
    assert source_frontier_conflict(old, new, [0, 100, 200], 150, 70) is None
    new = timeline(True); new[1]['relationship'] = 'SKIPPED'
    assert source_frontier_conflict(old, new, [0, 100, 200], 150, 70) is None


def test_cold_simulation_starts_from_last_source_anchor_not_accumulated_fake_history():
    source = timeline()
    source[1].update(provider_predicted_arrival_s=60, provider_predicted_departure_s=80,
                     predicted_departure=80, timing_basis='DIRECT_STOP_UPDATE')
    assert source_start_index(source, 70) == 1
    source[1]['relationship'] = 'SKIPPED'
    assert source_start_index(source, 70) == 0
    assert source_start_index([{**e, 'provider_predicted_arrival_s': None, 'provider_predicted_departure_s': None,
                                'timing_basis': 'SCHEDULE'} for e in source], 70) is None


def test_future_departure_only_update_reconciles_a_model_that_already_left():
    old = timeline(); new = deepcopy(old)
    new[1].update(predicted_departure=150, timing_basis='SCHEDULE',
                  departure_timing_basis='DIRECT_STOP_UPDATE', provider_predicted_departure_s=150)
    assert source_frontier_conflict(old, new, [0, 100, 200], 150, 70) == {
        'reason': 'REVISED_SOURCE_DEPARTURE_AHEAD', 'anchor_index': 1}
    assert source_frontier_conflict(old, new, [0, 100, 200], 100, 70) is None


def test_arrival_only_update_retains_its_inferred_future_dwell_constraint():
    old = timeline(); new = deepcopy(old)
    new[1].update(predicted_arrival=65, predicted_departure=100, timing_basis='DIRECT_STOP_UPDATE',
                  departure_timing_basis='FROM_ARRIVAL_UPDATE', provider_predicted_arrival_s=65)
    assert source_frontier_conflict(old, new, [0, 100, 200], 150, 70) == {
        'reason': 'REVISED_SOURCE_DEPARTURE_AHEAD', 'anchor_index': 1}


def test_new_explicit_elapsed_stop_evidence_can_replace_a_model_that_is_behind_without_treating_propagation_as_observation():
    old = timeline(); new = deepcopy(old)
    new[1].update(predicted_arrival=80, predicted_departure=85, timing_basis='DIRECT_STOP_UPDATE',
                  provider_predicted_arrival_s=80, provider_predicted_departure_s=85)
    assert source_frontier_conflict(old, new, [0, 100, 200], 50, 100)['reason'] == 'REVISED_SOURCE_ANCHOR_PASSED'
    new[1].update(provider_predicted_arrival_s=None, provider_predicted_departure_s=None, timing_basis='PROPAGATED_STOP_DEPARTURE')
    assert source_frontier_conflict(old, new, [0, 100, 200], 50, 100) is None


@pytest.mark.asyncio
async def test_later_source_clock_rebuilds_virtual_plan_without_backward_continuity_clamp(monkeypatch):
    engine.clear_motion_cache(); source_diagnostics.clear_source_events()
    monkeypatch.setattr(engine, 'handover_enabled', lambda: True)
    builds = []
    async def build(**kwargs):
        builds.append(kwargs)
        raw = deepcopy(kwargs['timeline'])
        return {'kind': 'new' if raw[1]['predicted_arrival'] == 150 else 'old',
                'start_s': 0, 'end_s': raw[-1]['predicted_departure'], 'effective_timeline': raw,
                'segments': [], 'motion_model': 'TEST', 'motion_quality': 'TEST'}
    def sample(plan, now, raw, progress):
        return {'progress_m': 150 if plan['kind'] == 'old' else 40 + max(0, now - 70),
                'speed_kmh': 10, 'motion_state': 'MOVING', 'next_timeline_index': 2 if plan['kind'] == 'old' else 1}
    monkeypatch.setattr(engine, '_build_trip_plan', build)
    monkeypatch.setattr(engine, '_sample_trip_plan', sample)
    kwargs = dict(trip_id='source:T', mode='tram', version_id='v',
                  path={'pattern_id': 'p', 'service_date': '2026-10-25', 'derived_generation': 'g',
                        'stop_progress': [0, 100, 200], 'total_m': 200})
    before = await engine.position_for_trip(**kwargs, timeline=timeline(), now_sec=65)
    after = await engine.position_for_trip(**kwargs, timeline=timeline(True), now_sec=70)
    assert before['progress_m'] == 150 and after['progress_m'] == 40
    assert builds[-1]['handover'] is None and builds[-1]['previous_plan'] is None
    assert builds[-1]['source_anchor_index'] == 0
    assert before['estimate_revision'] != after['estimate_revision']
    assert after['source_correction']['reason'] == 'REVISED_SOURCE_ARRIVAL_AHEAD'
    again = await engine.position_for_trip(**kwargs, timeline=timeline(True), now_sec=75)
    assert again['progress_m'] == 45
    assert again['estimate_revision'] == after['estimate_revision']
    assert len(builds) == 2
    windows = engine.cached_trip_windows(region_id='magdeburg', network_id='de-magdeburg-mvb',
                                          version_id='v', service_date='2026-10-25')
    assert windows['source:T']['end'] == 240
    history = source_diagnostics.source_events(region_id='magdeburg', network_id='de-magdeburg-mvb',
        version_id='v', service_date='2026-10-25', trip_id='source:T')
    assert any(e['kind'] == 'RECONCILIATION_RESULT' and e['old_progress_m'] == 150
               and e['new_progress_m'] == 40 for e in history['events'])
    engine.clear_motion_cache(); source_diagnostics.clear_source_events()


def test_diagnostics_are_immutable_bounded_scoped_and_never_keep_gps_or_credentials(monkeypatch):
    source_diagnostics.clear_source_events()
    monkeypatch.setattr(source_diagnostics, 'MAX_EVENTS', 2)
    event = dict(kind='SOURCE_PLAN_REFRESH', region_id='magdeburg', network_id='mvb', version_id='v',
                 service_date='2026-10-25', trip_id='T', timeline=[['A', 0, 10, 10]],
                 api_key='secret', user_id='private', latitude=52, longitude=11, vehicle_id='physical-private')
    source_diagnostics.record_source_event(event); event['timeline'][0][2] = 999
    assert source_diagnostics.source_events(region_id='magdeburg', network_id='mvb')['events'][0]['timeline'][0][2] == 10
    source_diagnostics.record_source_event({**event, 'trip_id': 'U'})
    source_diagnostics.record_source_event({**event, 'trip_id': 'V'})
    history = source_diagnostics.source_events(region_id='magdeburg', network_id='mvb', version_id='v', service_date='2026-10-25')
    assert history['retained_events'] == 2 and history['dropped_events'] == 1
    assert all(not set(e) & {'api_key', 'user_id', 'latitude', 'longitude', 'vehicle_id'} for e in history['events'])
    assert source_diagnostics.source_events(region_id='other', network_id='mvb')['retained_events'] == 0
    assert source_diagnostics.source_events(region_id='magdeburg', network_id='mvb', service_date='2026-10-24')['retained_events'] == 0
    source_diagnostics._prune(time.monotonic() + source_diagnostics.TTL_SECONDS + 1)
    assert source_diagnostics.source_events(region_id='magdeburg', network_id='mvb')['retained_events'] == 0
    source_diagnostics.clear_source_events()
