"""Offline joint stop-node sensitivity; output is never a route approval.

Ranks bounded nearby node combinations across a small stop window while
holding both boundary nodes fixed. This is a geometric heuristic only: real
platforms, operating routes, restrictions, legal rights and GPS are not inferred.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mobility.roads import _astar, _build_graph_detailed, _haversine_m, _nearest_node
from tools.audit_offline_rebuild import edge_assessment, index_ways
from tools.rebuild_transit_offline import _local_ways, coverage_ok, parse_osm
from tools.replay_stop_snap_hypothesis import compare_schedule, filter_tram_oneway, replay

MAX_RADIUS_M = 20.0
MAX_PER_STOP = 6
MAX_INTERIOR_STOPS = 6
# This arbitrary diagnostic penalty is not an operator route criterion.
SNAP_PENALTY = 10.0
AMBIGUITY_GAP_M = 50.0


def rank_window(stops, nodes, graph, prior_segments, start, end):
    """Find top two complete node assignments with immutable boundary nodes."""
    if (type(start) is not int or type(end) is not int or start < 0 or end >= len(stops)
            or end - start < 2 or end - start - 1 > MAX_INTERIOR_STOPS):
        raise ValueError('invalid bounded stop window')
    if len(prior_segments) != len(stops) - 1:
        raise ValueError('baseline segment count mismatch')
    for i, segment in enumerate(prior_segments):
        if segment.get('a_idx') != i or segment.get('b_idx') != i+1:
            raise ValueError('baseline segment ordering mismatch')
        if i and prior_segments[i-1].get('end_node_id') != segment.get('start_node_id'):
            raise ValueError('baseline stop-node continuity mismatch')
    boundaries = (prior_segments[start].get('start_node_id'), prior_segments[end-1].get('end_node_id'))
    if any(n not in nodes for n in boundaries):
        raise ValueError('boundary node missing')
    choices = [[(boundaries[0], 0.0)]]
    for index in range(start+1, end):
        stop = stops[index]
        available = sorted((_haversine_m(stop['latitude'], stop['longitude'], *coord), node)
                           for node, coord in nodes.items())
        eligible = [(node, distance) for distance, node in available if distance <= MAX_RADIUS_M][:MAX_PER_STOP]
        if not eligible:
            raise ValueError(f'no nearby source nodes for stop {index}')
        choices.append(eligible)
    choices.append([(boundaries[1], 0.0)])
    # Keep two distinct partial assignments per node; all edge weights are
    # nonnegative and future cost depends only on the current boundary node.
    states = {boundaries[0]: [{'score': 0.0, 'distance_m': 0.0, 'assignments': []}]}
    for layer in range(1, len(choices)):
        next_states = {}
        for node, offset in choices[layer]:
            options = []
            for previous, paths in states.items():
                if previous == node:
                    continue  # never collapse adjacent stops into a zero-edge leg
                sequence, edges = _astar(graph, nodes, previous, node)
                if len(sequence) < 2 or len(edges) != len(sequence)-1:
                    continue
                length = sum(_haversine_m(*nodes[a], *nodes[b]) for a, b in zip(sequence, sequence[1:]))
                if not math.isfinite(length):
                    raise ValueError('invalid graph path length')
                for prior in paths:
                    assignments = prior['assignments'] + ([] if layer == len(choices)-1 else [(start+layer, node, offset)])
                    options.append({'score': prior['score'] + length + SNAP_PENALTY*offset,
                                    'distance_m': prior['distance_m'] + length,
                                    'assignments': assignments})
            if options:
                options.sort(key=lambda x: (x['score'], tuple((a, b) for a, b, _ in x['assignments'])))
                next_states[node] = options[:2]
        if not next_states:
            raise ValueError('no connected candidate through complete window')
        states = next_states
    ranked = states[boundaries[1]][:2]
    gap = ranked[1]['score'] - ranked[0]['score'] if len(ranked) > 1 else None
    return {'window': [start, end], 'boundary_nodes': list(boundaries),
            'candidate_counts': [len(x) for x in choices],
            'ranked': [{'score': round(x['score'], 2), 'window_length_m': round(x['distance_m'], 2),
                        'overrides': {str(i): node for i, node, _ in x['assignments']},
                        'offsets_m': {str(i): round(offset, 2) for i, _, offset in x['assignments']}}
                       for x in ranked],
            'score_gap': round(gap, 2) if gap is not None else None,
            'ambiguous_by_heuristic': gap is not None and gap <= AMBIGUITY_GAP_M}


def explore(line, prior, source, bbox, start, end, *, strict_tram_oneway=False):
    """Reroute the whole pattern with the selected experimental assignments."""
    mode, stops = line.get('mode'), line.get('stops') or []
    if mode not in ('bus', 'tram') or prior.get('mode') != mode or prior.get('pattern_id') != line.get('pattern_id'):
        raise ValueError('pattern or mode mismatch')
    if strict_tram_oneway and mode != 'tram':
        raise ValueError('tram direction hypothesis is not a bus rule')
    if edge_assessment(prior, line, index_ways(source))['issues']:
        raise ValueError('baseline candidate edge audit failed')
    if not coverage_ok(stops, bbox, 0.004):
        raise ValueError('pattern outside declared source coverage')
    ways = _local_ways(source[mode], stops, 0.004)
    if strict_tram_oneway:
        nodes, graph = filter_tram_oneway(ways)
    else:
        nodes, graph, _ = _build_graph_detailed(ways, mode)
    if not nodes:
        raise ValueError('empty graph')
    # replay() preserves default nearest nodes outside the chosen window. A
    # baseline from a different graph/snap cannot be silently mixed with it.
    old_snaps = [s.get('start_node_id') for s in prior['segments']] + [prior['segments'][-1].get('end_node_id')]
    if old_snaps != [_nearest_node(nodes, s['latitude'], s['longitude']) for s in stops]:
        raise ValueError('baseline snaps differ from replay graph')
    ranked = rank_window(stops, nodes, graph, prior['segments'], start, end)
    overrides = {int(i): node for i, node in ranked['ranked'][0]['overrides'].items()}
    candidate = replay(line, prior, source, bbox, overrides, strict_tram_oneway=strict_tram_oneway)
    return ranked, candidate


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('network', 'map', 'osm', 'candidates', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--pattern', required=True)
    parser.add_argument('--mode', choices=('bus', 'tram'), required=True)
    parser.add_argument('--start-stop', type=int, required=True)
    parser.add_argument('--end-stop', type=int, required=True)
    parser.add_argument('--generic-tram-oneway', action='store_true')
    args = parser.parse_args(argv)
    if args.output.exists(): raise FileExistsError('Refusing to overwrite report')
    net, mp, osm, cand = (p.read_bytes() for p in (args.network, args.map, args.osm, args.candidates))
    network, map_data, source_data, candidates = map(json.loads, (net, mp, osm, cand))
    digest = lambda x: hashlib.sha256(x).hexdigest()
    provenance = candidates['provenance']
    if any(provenance[k] != digest(v) for k, v in [('network_sha256', net), ('map_sha256', mp), ('osm_sha256', osm)]):
        raise ValueError('input hashes mismatch')
    scope = candidates['scope']
    matches = [x for x in map_data['lines'] if x.get('pattern_id') == args.pattern and x.get('mode') == args.mode
               and x.get('service_date') == scope['service_date'] and x.get('network_version_id') == scope['network_version_id']]
    priors = [x for x in candidates['patterns'] if x.get('pattern_id') == args.pattern and x.get('mode') == args.mode
              and x.get('status') == 'CANDIDATE_REVIEW_ONLY']
    if len(matches) != 1 or len(priors) != 1:
        raise ValueError('dated pattern identity mismatch')
    bbox = scope['declared_osm_bbox']
    ranked, candidate = explore(matches[0], priors[0], parse_osm(source_data, bbox), bbox,
                                args.start_stop, args.end_stop, strict_tram_oneway=args.generic_tram_oneway)
    screen = compare_schedule(network, matches[0], priors[0], candidate)
    result = {'scope': scope, 'ranking': ranked, 'candidate': candidate, 'schedule_screen': screen,
              'input_candidates_sha256': digest(cand),
              'method': {'snap_radius_m': MAX_RADIUS_M, 'max_nodes_per_stop': MAX_PER_STOP,
                         'snap_penalty': SNAP_PENALTY, 'ambiguity_gap': AMBIGUITY_GAP_M},
              'limits': ['Heuristic ranking does not establish route, platform, access or track direction.',
                         'Active closures, operator routing, traffic, signals and GPS are unavailable.',
                         'No deployment, automatic adoption or physical accuracy claim.']}
    with args.output.open('x', encoding='utf-8', newline='\n') as f:
        json.dump(result, f, ensure_ascii=False, indent=2, allow_nan=False); f.write('\n')
    print(json.dumps({'report': str(args.output), 'pattern_id': args.pattern, 'ranking': ranked,
                      'candidate_length_m': candidate['candidate_length_m'],
                      'increased_leg_review_count': candidate['increased_leg_review_count'],
                      'schedule_screen': screen, 'edge_audit': candidate['edge_audit']}, ensure_ascii=False))


if __name__ == '__main__': main()
