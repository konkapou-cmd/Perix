from copy import deepcopy
from pathlib import Path
import json

import pytest

from routes import mobility as routes


def fixture():
    return json.loads((Path(__file__).parent / 'fixtures/am_fuchsberg_sparse_20261025.json').read_text(encoding='utf-8'))


def test_real_9_departure_delay_propagates_instead_of_resetting_to_first_stop():
    f = fixture(); original = deepcopy(f)
    timeline = routes._predicted_stop_timeline(f['route'], f['trip'], f['realtime'])
    am, nxt = timeline[2:4]
    assert am['predicted_arrival'] == 18 * 3600 + 7 * 60 + 27
    assert nxt['predicted_arrival'] == 18 * 3600 + 8 * 60 + 27
    assert am['timing_basis'] == 'PROPAGATED_STOP_DEPARTURE'
    assert am['timing_anchor_stop_id'] == '340825'
    assert am['timing_anchor_delay_seconds'] == 87
    assert am['provider_predicted_arrival_s'] is None
    assert timeline[1]['provider_predicted_departure_s'] == 18 * 3600 + 5 * 60 + 27
    assert f == original


def test_new_explicit_stop_update_overrides_propagation_without_rewriting_provider_values():
    f = fixture()
    f['realtime']['stop_predictions']['639170'] = {'arrival_delay_seconds': 75, 'departure_delay_seconds': 90}
    t = routes._predicted_stop_timeline(f['route'], f['trip'], f['realtime'])
    assert t[2]['predicted_arrival'] == 18 * 3600 + 7 * 60 + 15
    assert t[2]['provider_predicted_arrival_s'] == t[2]['predicted_arrival']
    assert t[3]['timing_anchor_delay_seconds'] == 90
    assert t[2]['timing_basis'] == 'DIRECT_STOP_UPDATE'


def test_no_data_resets_propagation_and_does_not_claim_direct_provider_clocks():
    f = fixture(); f['realtime']['stop_relationships']['639170'] = 'NO_DATA'
    t = routes._predicted_stop_timeline(f['route'], f['trip'], f['realtime'])
    assert t[2]['timing_basis'] == 'NO_DATA'
    assert t[2]['timing_anchor_stop_id'] is None
    assert t[3]['predicted_arrival'] == t[3]['scheduled_arrival']
    assert t[3]['timing_basis'] == 'SCHEDULE'


def test_skipped_stop_does_not_poison_the_carried_departure_delay():
    f = fixture(); f['realtime']['stop_relationships']['639170'] = 'SKIPPED'
    f['realtime']['stop_predictions']['639170'] = {'arrival_delay_seconds': 900, 'departure_delay_seconds': 900}
    t = routes._predicted_stop_timeline(f['route'], f['trip'], f['realtime'])
    assert t[2]['relationship'] == 'SKIPPED'
    assert t[3]['timing_anchor_delay_seconds'] == 87
    assert t[3]['timing_anchor_stop_id'] == '340825'


@pytest.mark.parametrize('relationship', ['CANCELED', 'DELETED'])
def test_canceled_trip_has_no_timeline(relationship):
    f = fixture(); f['realtime']['trip_schedule_relationship'] = relationship
    assert routes._predicted_stop_timeline(f['route'], f['trip'], f['realtime']) == []


def test_arrival_only_update_keeps_the_scheduled_dwell_and_carries_its_delay():
    route = {'stops': [{'stop_id': 'A'}, {'stop_id': 'B'}]}
    trip = {'stop_ids': ['A', 'B'], 'stop_times_arrival': {'A': '08:00', 'B': '08:03'},
            'stop_times': {'A': '08:01', 'B': '08:03'}}
    t = routes._predicted_stop_timeline(route, trip, {'stop_predictions': {'A': {'arrival_delay_seconds': 90}}})
    assert t[0]['predicted_departure'] - t[0]['predicted_arrival'] == 60
    assert t[0]['provider_predicted_departure_s'] is None
    assert t[1]['predicted_arrival'] == 8 * 3600 + 4 * 60 + 30


def test_occurrence_specific_updates_do_not_leak_to_an_earlier_visit_to_the_same_platform():
    route = {'stops': [{'stop_id': 'A'}, {'stop_id': 'B'}]}
    trip = {'stop_ids': ['A', 'B', 'A'], 'stop_sequences': [10, 20, 30], 'stop_times_sequence': [
        {'stop_id': s, 'stop_sequence': q, 'arrival_time': t, 'departure_time': t}
        for s, q, t in [('A', 10, '08:00'), ('B', 20, '08:05'), ('A', 30, '08:10')]]}
    rt = {'stop_predictions': {'A': {'arrival_delay_seconds': 120}},
          'stop_predictions_by_sequence': {'30': {'stop_id': 'A', 'arrival_delay_seconds': 120}}}
    t = routes._predicted_stop_timeline(route, trip, rt)
    assert t[0]['predicted_arrival'] == 8 * 3600
    assert t[0]['ambiguous_stop_update'] is True
    assert t[2]['predicted_arrival'] == 8 * 3600 + 12 * 60
    assert t[2]['provider_predicted_arrival_s'] == t[2]['predicted_arrival']


def test_early_departure_only_update_is_preserved_without_inventing_provider_arrival():
    route = {'stops': [{'stop_id': 'A'}, {'stop_id': 'B'}]}
    trip = {'stop_ids': ['A', 'B'], 'stop_times': {'A': '08:00', 'B': '08:03'}}
    rt = {'stop_predictions': {'A': {'departure_delay_seconds': -30}}}
    original = deepcopy(rt)
    t = routes._predicted_stop_timeline(route, trip, rt)
    assert t[0]['predicted_arrival'] == t[0]['predicted_departure'] == 8 * 3600 - 30
    assert t[0]['provider_predicted_arrival_s'] is None
    assert t[0]['provider_predicted_departure_s'] == 8 * 3600 - 30
    assert t[0]['timing_basis'] == 'FROM_DEPARTURE_UPDATE'
    assert t[0]['departure_timing_basis'] == 'DIRECT_STOP_UPDATE'
    assert not t[0]['timing_order_adjusted']
    assert t[1]['predicted_arrival'] == 8 * 3600 + 150
    assert rt == original


def test_conflicting_provider_clocks_remain_raw_and_are_not_authoritative_anchors():
    from mobility.motion.source_reconciliation import source_start_index, source_frontier_conflict
    route = {'stops': [{'stop_id': s} for s in ['A', 'B', 'C']]}
    trip = {'stop_ids': ['A', 'B', 'C'], 'stop_times': {'A': '08:00', 'B': '08:01', 'C': '08:02'}}
    old = routes._predicted_stop_timeline(route, trip, {})
    rt = {'stop_predictions': {'A': {'departure_delay_seconds': 120},
                               'B': {'arrival_delay_seconds': -30, 'departure_delay_seconds': -30}}}
    t = routes._predicted_stop_timeline(route, trip, rt)
    assert t[1]['provider_predicted_arrival_s'] == 8 * 3600 + 30
    assert t[1]['provider_predicted_departure_s'] == 8 * 3600 + 30
    assert t[1]['predicted_arrival'] == t[1]['predicted_departure'] == 8 * 3600 + 120
    assert t[1]['timing_order_adjusted'] and t[2]['timing_order_adjusted']
    assert source_start_index(t, 8 * 3600 + 130) == 0
    assert source_frontier_conflict(old, t, [0, 100, 200], 150, 8 * 3600 + 130) is None
