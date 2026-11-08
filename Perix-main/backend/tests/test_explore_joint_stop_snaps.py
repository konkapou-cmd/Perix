"""Joint snap ranking remains local, bounded and explicitly ambiguous."""
import copy

import pytest

from mobility.roads import _haversine_m
from tools.explore_joint_stop_snaps import explore, rank_window
from tools.rebuild_transit_offline import parse_osm
from tools.replay_stop_snap_hypothesis import replay


@pytest.fixture
def graph_case():
    nodes = {1: (52.000, 11), 2: (52.001, 11), 20: (52.001, 11.0001),
             3: (52.002, 11), 30: (52.002, 11.0001), 4: (52.003, 11),
             5: (52.0015, 11.02)}
    graph = {node: [] for node in nodes}
    def edge(a, b):
        graph[a].append((b, _haversine_m(*nodes[a], *nodes[b]), f'100:{a}:{b}'))
    for pair in [(1, 2), (2, 5), (5, 3), (3, 4), (1, 20), (20, 30), (30, 4)]:
        edge(*pair)
    stops = [{'stop_id': str(node), 'latitude': nodes[node][0], 'longitude': nodes[node][1]}
             for node in (1, 2, 3, 4)]
    segments = [{'a_idx': i, 'b_idx': i+1, 'start_node_id': a, 'end_node_id': b}
                for i, (a, b) in enumerate(((1, 2), (2, 3), (3, 4)))]
    return stops, nodes, graph, segments


def test_joint_assignment_finds_connected_alternative_without_touching_input(graph_case):
    stops, nodes, graph, segments = graph_case
    original = copy.deepcopy((stops, nodes, graph, segments))
    result = rank_window(stops, nodes, graph, segments, 0, 3)
    assert result['boundary_nodes'] == [1, 4]
    assert result['ranked'][0]['overrides'] == {'1': 20, '2': 30}
    assert result['ranked'][0]['window_length_m'] < 400
    assert (stops, nodes, graph, segments) == original


def test_disconnected_graph_fails_without_inventing_path(graph_case):
    stops, nodes, graph, segments = graph_case
    graph[3] = []; graph[30] = []
    with pytest.raises(ValueError, match='no connected candidate'):
        rank_window(stops, nodes, graph, segments, 0, 3)


def test_ambiguous_nearby_assignments_are_marked_not_approved(graph_case):
    stops, nodes, graph, segments = graph_case
    nodes[20] = (52.001, 11.00005)
    graph[1] = [(n, _haversine_m(*nodes[1], *nodes[n]), e) for n, _, e in graph[1]]
    graph[2] = [(3, _haversine_m(*nodes[2], *nodes[3]), '101:2:3')]
    graph[20] = [(3, _haversine_m(*nodes[20], *nodes[3]), '102:20:3')]
    result = rank_window(stops, nodes, graph, segments, 0, 3)
    assert len(result['ranked']) == 2
    assert result['ambiguous_by_heuristic'] is True


def test_window_and_baseline_node_integrity_are_required(graph_case):
    stops, nodes, graph, segments = graph_case
    with pytest.raises(ValueError, match='bounded'):
        rank_window(stops, nodes, graph, segments, 0, 1)
    segments[1]['start_node_id'] = 999
    with pytest.raises(ValueError, match='continuity'):
        rank_window(stops, nodes, graph, segments, 0, 3)


def test_explorer_rechecks_baseline_source_edges_before_ranking():
    a, b, c = [52, 11], [52.001, 11], [52.002, 11]
    def way(wid, ids, points, tags):
        return {'type': 'way', 'id': wid, 'nodes': ids,
                'geometry': [{'lat': p[0], 'lon': p[1]} for p in points], 'tags': tags}
    box = [51.9, 10.9, 52.1, 11.1]
    source = parse_osm({'osm3s': {'timestamp_osm_base': '2026-11-02T00:00:00Z'}, 'elements': [
        way(1, [1, 2, 3], [a, b, c], {'railway': 'tram'}),
        way(2, [11, 12, 13], [a, b, c], {'highway': 'residential'}),
    ]}, box)
    line = {'pattern_id': 'x', 'mode': 'tram', 'stops': [
        {'stop_id': str(i), 'latitude': p[0], 'longitude': p[1]} for i, p in enumerate((a, b, c))]}
    prior = {'pattern_id': 'x', 'mode': 'tram', 'segments': [
        {'a_idx': 0, 'b_idx': 1, 'points': [a, b], 'edge_ids': ['1:1:2']},
        {'a_idx': 1, 'b_idx': 2, 'points': [b, c], 'edge_ids': ['1:2:3']}]}
    baseline = replay(line, prior, source, box, {})
    ranked, candidate = explore(line, baseline, source, box, 0, 2)
    assert ranked['window'] == [0, 2]
    assert candidate['status'] == 'CANDIDATE_REVIEW_ONLY'
    baseline['segments'][0]['edge_ids'][0] = '999:1:2'
    with pytest.raises(ValueError, match='edge audit failed'):
        explore(line, baseline, source, box, 0, 2)
