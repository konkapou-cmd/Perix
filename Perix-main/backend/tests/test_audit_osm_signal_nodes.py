"""Exact signal-node counts never invent a stop or observed signal phase."""
import pytest

from tools.audit_osm_signal_nodes import signal_occurrences


def example():
    candidate = {'status': 'CANDIDATE_REVIEW_ONLY', 'mode': 'bus', 'segments': [
        {'a_idx': 0, 'b_idx': 1, 'start_node_id': 1, 'end_node_id': 2, 'edge_ids': ['5:1:2']},
        {'a_idx': 1, 'b_idx': 2, 'start_node_id': 2, 'end_node_id': 3, 'edge_ids': ['5:2:1', '6:1:3']},
    ]}
    signals = [{'id': 1, 'kinds': ['ROAD_SIGNAL']}, {'id': 2, 'kinds': ['RAIL_SIGNAL']}]
    return candidate, signals


def test_repeated_exact_node_occurrences_are_separate_and_mode_aware():
    candidate, signals = example()
    result = signal_occurrences(candidate, signals)
    assert result == {'signal_kind': 'ROAD_SIGNAL', 'exact_signal_node_occurrences': 2,
                      'unique_exact_signal_nodes': 1, 'exact_signal_node_ids': [1]}
    candidate['mode'] = 'tram'
    result = signal_occurrences(candidate, signals)
    assert result['exact_signal_node_ids'] == [2]


@pytest.mark.parametrize('bad', ['status', 'order', 'disconnect', 'edge', 'endpoint'])
def test_invalid_chain_or_identity_is_rejected(bad):
    candidate, signals = example()
    if bad == 'status': candidate['status'] = 'INCOMPLETE'
    if bad == 'order': candidate['segments'][1]['a_idx'] = 7
    if bad == 'disconnect': candidate['segments'][1]['start_node_id'] = 99
    if bad == 'edge': candidate['segments'][1]['edge_ids'][0] = 'bad'
    if bad == 'endpoint': candidate['segments'][1]['end_node_id'] = 99
    with pytest.raises(ValueError):
        signal_occurrences(candidate, signals)
