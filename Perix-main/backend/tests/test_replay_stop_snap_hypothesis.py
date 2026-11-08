"""Experimental snaps and tram direction never promote a transit geometry."""
import pytest

from mobility.domain import _pattern_id, _pattern_key
from tools.rebuild_transit_offline import parse_osm
from tools.replay_stop_snap_hypothesis import compare_schedule, compare_segments, replay


BOX = [51.9, 10.9, 52.1, 11.1]


@pytest.fixture
def data():
    def way(wid, ids, coords, tags):
        return {'type': 'way', 'id': wid, 'nodes': ids,
                'geometry': [{'lat': lat, 'lon': lon} for lat, lon in coords], 'tags': tags}
    a, b, d, z = [52, 11], [52.001, 11], [52.001, 11.00005], [52.002, 11]
    payload = {'osm3s': {'timestamp_osm_base': '2026-11-02T00:00:00Z'}, 'elements': [
        way(1, [1, 2, 3], [a, b, z], {'railway': 'tram', 'oneway': 'yes'}),
        way(2, [1, 4, 3], [a, d, z], {'railway': 'tram', 'oneway': 'yes'}),
        way(3, [11, 12, 13], [a, b, z], {'highway': 'residential'}),
    ]}
    stops = [{'stop_id': str(i), 'latitude': p[0], 'longitude': p[1]} for i, p in enumerate((a, b, z))]
    line = {'pattern_id': 'N8:test', 'mode': 'tram', 'stops': stops}
    prior = {'pattern_id': 'N8:test', 'mode': 'tram', 'new_length_m': 222,
             'segments': [{'a_idx': 0, 'b_idx': 1, 'points': [a, b], 'edge_ids': ['1:1:2']},
                          {'a_idx': 1, 'b_idx': 2, 'points': [b, z], 'edge_ids': ['1:2:3']}]}
    return line, prior, parse_osm(payload, BOX)


def test_same_override_node_used_in_both_adjacent_segments(data):
    line, prior, source = data
    result = replay(line, prior, source, BOX, {1: 4}, strict_tram_oneway=True)
    assert result['status'] == 'CANDIDATE_REVIEW_ONLY'
    assert result['physical_accuracy_verified'] is False
    assert result['segments'][0]['end_node_id'] == 4
    assert result['segments'][1]['start_node_id'] == 4
    assert not result['edge_audit']['issues']


def test_no_nearby_or_invalid_override_is_never_guessed(data):
    line, prior, source = data
    with pytest.raises(ValueError, match='override'):
        replay(line, prior, source, BOX, {1: 999})
    with pytest.raises(ValueError, match='radius'):
        replay(line, prior, source, BOX, {1: 3})


def test_directed_tram_hypothesis_cannot_invent_reverse_path(data):
    line, prior, source = data
    line['stops'].reverse()
    with pytest.raises(ValueError, match='no directed path'):
        replay(line, prior, source, BOX, {}, strict_tram_oneway=True)


def test_tram_oneway_experiment_is_not_a_bus_rule(data):
    line, prior, source = data
    line['mode'] = 'bus'; prior['mode'] = 'bus'
    with pytest.raises(ValueError, match='cannot apply to bus'):
        replay(line, prior, source, BOX, {}, strict_tram_oneway=True)
    result = replay(line, prior, source, BOX, {})
    assert result['mode'] == 'bus'


def test_improving_one_segment_does_not_hide_a_much_longer_neighbor():
    old = [{'a_idx': 0, 'b_idx': 1, 'points': [[52, 11], [52.001, 11]], 'edge_ids': ['old']}]
    new = [{'a_idx': 0, 'b_idx': 1, 'points': [[52, 11], [52.003, 11]], 'edge_ids': ['new']}]
    change = compare_segments(old, new)[0]
    assert change['increase_m'] > 100
    assert change['significant_increase_review'] is True


def test_optional_schedule_screen_checks_dated_trip_occurrences(data):
    line, prior, source = data
    trip = {'trip_id': 't', 'headsign': 'End', 'stop_ids': ['0', '1', '2'], 'stop_sequences': [0, 1, 2],
            'stop_times_sequence': [{'stop_id': str(i), 'stop_sequence': i,
                                     'arrival_time': f'24:0{i}', 'departure_time': f'24:0{i}'}
                                    for i in range(3)]}
    pid = _pattern_id('N8', _pattern_key(trip))
    line.update(pattern_id=pid, network_version_id='v', service_date='2026-11-02')
    prior['pattern_id'] = pid
    network = {'version_id': 'v', 'name': '2026-11-02',
               'routes': [{'mode': 'tram', 'route_number': 'N8', 'trips': [trip]}]}
    candidate = replay(line, prior, source, BOX, {})
    report = compare_schedule(network, line, prior, candidate)
    assert report['trips'] == 1 and report['checked_pairs'] == 2
    assert report['prior_flagged_pairs'] == report['proposed_flagged_pairs'] == 0
    network['version_id'] = 'other'
    with pytest.raises(ValueError, match='identity'):
        compare_schedule(network, line, prior, candidate)
