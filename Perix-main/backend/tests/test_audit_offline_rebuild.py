"""Independent edge audit never promotes or physically certifies a route."""
from copy import deepcopy

from mobility.graph import validate_geometry
from tools.audit_transit_geometry import reverse_runs, runtime_stop_projection
from tools.audit_offline_rebuild import edge_assessment, displacement


def examples():
    line = {'stops': [{'stop_id': 'a', 'latitude': 52, 'longitude': 11},
                      {'stop_id': 'b', 'latitude': 52.002, 'longitude': 11}]}
    way = {'id': 5, 'nodes': [10, 11, 12], 'points': [[52, 11], [52.001, 11], [52.002, 11]],
           'tags': {'railway': 'tram', 'oneway': 'yes'}}
    seg = {'a_idx': 0, 'b_idx': 1, 'start_node_id': 10, 'end_node_id': 12,
           'points': deepcopy(way['points']), 'edge_ids': ['5:10:11', '5:11:12']}
    candidate = {'status': 'CANDIDATE_REVIEW_ONLY', 'mode': 'tram', 'segments': [seg],
                 'points': deepcopy(seg['points'])}
    set_diagnostics(candidate, line)
    return candidate, line, {'tram': {5: way}, 'bus': {}}


def set_diagnostics(candidate, line):
    check = validate_geometry(candidate['points'], line['stops'])
    projection = runtime_stop_projection(candidate['points'], line['stops'])
    candidate['validation'] = check
    candidate['exact_reverse_runs'] = reverse_runs(candidate['points'])
    candidate['max_projection_disagreement_m'] = round(max(abs(a-b) for a, b in
        zip(projection['positions'], check['projection_positions_m'])), 1)


def test_real_contiguous_edges_pass_without_claiming_physical_accuracy():
    candidate, line, ways = examples()
    assert edge_assessment(candidate, line, ways) == {'issues': [], 'warnings': {}, 'edge_count': 2}


def test_modified_geometry_and_nonexistent_edges_rejected():
    candidate, line, ways = examples()
    candidate['segments'][0]['points'][1][0] += .01
    assert 'EDGE_NOT_IDENTICAL_TO_SOURCE_GRAPH' in edge_assessment(candidate, line, ways)['issues']
    candidate, line, ways = examples()
    candidate['segments'][0]['edge_ids'][0] = '99:10:11'
    assert 'EDGE_NOT_IDENTICAL_TO_SOURCE_GRAPH' in edge_assessment(candidate, line, ways)['issues']


def test_reversed_oneway_and_access_are_review_signals():
    candidate, line, ways = examples()
    ways['tram'][5]['tags']['access'] = 'private'
    candidate['segments'][0].update(start_node_id=12, end_node_id=10,
        edge_ids=['5:12:11', '5:11:10'], points=list(reversed(ways['tram'][5]['points'])))
    candidate['points'] = deepcopy(candidate['segments'][0]['points'])
    line['stops'].reverse()
    set_diagnostics(candidate, line)
    result = edge_assessment(candidate, line, ways)
    assert not result['issues']
    assert result['warnings'] == {'AGAINST_OSM_ONEWAY_REVIEW': 2, 'ACCESS_TAG_REVIEW': 2}


def test_unusable_candidate_and_forged_join_fail_closed():
    candidate, line, ways = examples()
    candidate['status'] = 'INCOMPLETE'
    assert edge_assessment(candidate, line, ways)['issues'] == ['NO_COMPLETE_CANDIDATE']
    candidate, line, ways = examples()
    candidate['points'][-1] = [50, 11]
    assert edge_assessment(candidate, line, ways)['issues'] == ['ASSEMBLED_GEOMETRY_MISMATCH']


def test_equal_index_displacement_is_not_a_topology_equivalence():
    candidate, _, _ = examples()
    assert displacement(candidate['points'], candidate['points']) == 0
    assert displacement(candidate['points'], candidate['points'][:2]) is None


def test_forged_review_diagnostics_are_rejected():
    candidate, line, ways = examples()
    candidate['max_projection_disagreement_m'] = 999
    assert edge_assessment(candidate, line, ways)['issues'] == ['DIAGNOSTIC_RECOMPUTATION_MISMATCH']
