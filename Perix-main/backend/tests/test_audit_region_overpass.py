"""One Overpass query is research data, never a certified production snapshot."""
from copy import deepcopy

import pytest

from tools.audit_region_overpass import compare_ways, inspect_snapshot


BOX = [51.9, 10.9, 52.1, 11.1]


@pytest.fixture
def payload():
    def way(wid, ids, tags):
        return {'type': 'way', 'id': wid, 'nodes': ids,
                'geometry': [{'lat': 52, 'lon': 11}, {'lat': 52.001, 'lon': 11}], 'tags': tags}
    return {'osm3s': {'timestamp_osm_base': '2026-11-02T10:00:00Z'}, 'elements': [
        way(1, [1, 2], {'highway': 'residential'}),
        way(2, [3, 4], {'railway': 'tram'}),
        {'type': 'node', 'id': 5, 'lat': 52, 'lon': 11, 'tags': {'highway': 'traffic_signals'}},
    ]}


def test_combined_layers_and_old_comparison_are_read_only(payload):
    original = deepcopy(payload)
    result = inspect_snapshot(payload, BOX)
    assert len(result['layers']['bus']) == len(result['layers']['tram']) == len(result['signals']) == 1
    assert result['signals'][0]['kinds'] == ['ROAD_SIGNAL']
    assert compare_ways(original, payload)['same_geometry_nodes_and_tags'] == 2
    assert payload == original


def test_changed_and_missing_ways_are_reviewed_not_silently_trusted(payload):
    old = deepcopy(payload)
    payload['elements'][0]['tags']['name'] = 'updated'
    payload['elements'].pop(1)
    result = compare_ways(old, payload)
    assert result['changed_geometry_nodes_or_tags'] == 1
    assert result['not_in_new_response'] == 1


@pytest.mark.parametrize('bad', ['remark', 'duplicate', 'outside', 'unexpected', 'no_signals', 'incomplete', 'timestamp', 'boolean'])
def test_untrusted_or_incomplete_response_fails_closed(payload, bad):
    if bad == 'remark': payload['remark'] = 'runtime error'
    if bad == 'duplicate': payload['elements'].append(deepcopy(payload['elements'][-1]))
    if bad == 'outside': payload['elements'][-1]['lat'] = 53
    if bad == 'unexpected': payload['elements'].append({'type': 'relation', 'id': 100})
    if bad == 'no_signals': payload['elements'].pop()
    if bad == 'incomplete': payload['elements'][0]['nodes'].pop()
    if bad == 'timestamp': payload['osm3s']['timestamp_osm_base'] = 'not-a-date'
    if bad == 'boolean': payload['elements'][-1]['lat'] = True
    with pytest.raises(ValueError):
        inspect_snapshot(payload, BOX)
