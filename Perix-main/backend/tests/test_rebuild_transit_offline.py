"""Synthetic offline reconstruction is diagnostic and fails closed."""
from copy import deepcopy

import pytest

from tools.rebuild_transit_offline import coverage_ok, parse_osm, reconstruct_line


@pytest.fixture
def source():
    def way(wid, ids, points, tags):
        return {'type': 'way', 'id': wid, 'nodes': ids,
                'geometry': [{'lat': p[0], 'lon': p[1]} for p in points], 'tags': tags}
    return {'osm3s': {'timestamp_osm_base': '2026-11-02T10:36:38Z'}, 'elements': [
        way(1, [1, 2, 3], [[52, 11], [52.001, 11], [52.002, 11]], {'highway': 'residential'}),
        way(2, [10, 11, 12], [[52, 11], [52.001, 11], [52.002, 11]], {'railway': 'tram'}),
    ]}


@pytest.fixture
def line():
    return {'pattern_id': '1:test', 'mode': 'tram', 'route_number': '1',
            'points': [{'latitude': 52, 'longitude': 11}, {'latitude': 52.002, 'longitude': 11}],
            'stops': [{'stop_id': 'a', 'latitude': 52, 'longitude': 11},
                      {'stop_id': 'b', 'latitude': 52.002, 'longitude': 11}]}


BOX = [51.9, 10.9, 52.1, 11.1]


def test_complete_connected_osm_reconstruction_is_review_only(source, line):
    original = deepcopy(source)
    ways = parse_osm(source, BOX)
    result = reconstruct_line(line, BOX, ways)
    assert result['status'] == 'CANDIDATE_REVIEW_ONLY'
    assert result['physical_accuracy_verified'] is False
    assert result['segments'][0]['edge_ids'] == ['2:10:11', '2:11:12']
    assert result['validation']['valid'] is True
    assert result['exact_reverse_runs'] == []
    assert source == original


def test_missing_coverage_never_reroutes_outside_available_graph(source, line):
    ways = parse_osm(source, BOX)
    too_small = [51.999, 10.999, 52.003, 11.001]
    assert not coverage_ok(line['stops'], too_small, 0.004)
    result = reconstruct_line(line, too_small, ways)
    assert result['status'] == 'INCOMPLETE'
    assert result['reason'] == 'NO_COMPLETE_PATH_OR_COVERAGE'
    assert all(x['status'] == 'OUTSIDE_DECLARED_COVERAGE' for x in result['attempts'])


def test_no_connected_path_never_fabricates_a_line(source, line):
    source['elements'][1]['nodes'] = [10, 11]
    source['elements'][1]['geometry'] = source['elements'][1]['geometry'][:2]
    # Another real segment near the second stop but not connected to the first.
    source['elements'].append({'type': 'way', 'id': 3, 'nodes': [12, 13],
        'geometry': [{'lat': 52.002, 'lon': 11}, {'lat': 52.003, 'lon': 11}],
        'tags': {'railway': 'tram'}})
    result = reconstruct_line(line, BOX, parse_osm(source, BOX))
    assert result['status'] == 'INCOMPLETE'
    assert 'points' not in result


@pytest.mark.parametrize('bad', ['error', 'duplicate', 'missing_node', 'conflicting_node', 'bad_coord', 'construction'])
def test_untrusted_osm_fails_closed(source, bad):
    if bad == 'error': source['remark'] = 'runtime error'
    if bad == 'duplicate': source['elements'].append(deepcopy(source['elements'][0]))
    if bad == 'missing_node': source['elements'][0]['nodes'].pop()
    if bad == 'conflicting_node': source['elements'][1]['nodes'][0] = 1; source['elements'][1]['geometry'][0]['lat'] = 53
    if bad == 'bad_coord': source['elements'][0]['geometry'][0]['lat'] = float('nan')
    if bad == 'construction': source['elements'][1]['tags']['railway'] = 'construction'
    with pytest.raises(ValueError):
        parse_osm(source, BOX)
