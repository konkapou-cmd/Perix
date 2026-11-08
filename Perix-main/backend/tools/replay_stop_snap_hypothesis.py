"""Offline alternative stop-node and optional tram-direction experiment.

Generic OSM oneway tags and nearby stop nodes are hypotheses, not permission
or evidence that a trip used them. No network, database or production writes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mobility.domain import _pattern_id, _pattern_key
from mobility.graph import validate_geometry
from mobility.motion.config import DEFAULT_MOTION_CONFIG
from mobility.realtime_trip_identity import _service_date
from mobility.roads import _astar, _build_graph_detailed, _haversine_m, _nearest_node, _way_oneway
from mobility.stop_occurrences import stop_occurrence_times
from tools.audit_offline_rebuild import edge_assessment, index_ways
from tools.audit_rebuild_schedule import pair_check
from tools.audit_transit_geometry import reverse_runs, runtime_stop_projection
from tools.rebuild_transit_offline import _length, _local_ways, coverage_ok, parse_osm


MAX_EXPERIMENT_SNAP_M = 20.0
SEGMENT_INCREASE_REVIEW_M = 100.0


def compare_segments(prior_segments, proposed_segments):
    """Show displaced detours; a per-leg increase is a warning, not a verdict."""
    if len(prior_segments) != len(proposed_segments):
        raise ValueError('baseline segment count mismatch')
    changes = []
    for index, (old, new) in enumerate(zip(prior_segments, proposed_segments)):
        if (old.get('a_idx') != index or old.get('b_idx') != index + 1
                or not old.get('points') or not new.get('points')):
            raise ValueError('invalid baseline segment')
        old_m, new_m = _length(old['points']), _length(new['points'])
        if old.get('edge_ids') != new.get('edge_ids'):
            changes.append({'pair_index': index, 'old_length_m': round(old_m, 1),
                            'new_length_m': round(new_m, 1),
                            'increase_m': round(new_m - old_m, 1),
                            'significant_increase_review': new_m - old_m > SEGMENT_INCREASE_REVIEW_M})
    return changes


def compare_schedule(network, line, prior, proposed):
    """Necessary-condition check only; not the motion solver or observation."""
    if (str(network.get('version_id') or '') != str(line.get('network_version_id') or '')
            or _service_date(network) != line.get('service_date')):
        raise ValueError('dated schedule identity mismatch')
    mode, pid = line['mode'], line['pattern_id']
    cap = DEFAULT_MOTION_CONFIG[mode]['max_speed_kmh']
    stats = {'trips': 0, 'checked_pairs': 0, 'prior_flagged_pairs': 0,
             'proposed_flagged_pairs': 0, 'unavailable_trips_or_pairs': 0}
    if len(prior['segments']) != len(proposed['segments']):
        raise ValueError('schedule comparison segment mismatch')
    for route in network.get('routes') or []:
        if route.get('mode') != mode:
            continue
        for trip in route.get('trips') or []:
            if _pattern_id(str(route.get('route_number') or ''), _pattern_key(trip)) != pid:
                continue
            if [str(x) for x in trip.get('stop_ids') or []] != [str(x['stop_id']) for x in line['stops']]:
                raise ValueError('schedule stop occurrence mismatch')
            stats['trips'] += 1
            try:
                visits = stop_occurrence_times(trip)
            except ValueError:
                visits = None
            if visits is None or len(visits) != len(line['stops']):
                stats['unavailable_trips_or_pairs'] += 1
                continue
            for i, (old, new) in enumerate(zip(prior['segments'], proposed['segments'])):
                old_check = pair_check(old, visits[i]['departure_time'], visits[i+1]['arrival_time'], cap)
                new_check = pair_check(new, visits[i]['departure_time'], visits[i+1]['arrival_time'], cap)
                if old_check is None or new_check is None:
                    stats['unavailable_trips_or_pairs'] += 1
                    continue
                stats['checked_pairs'] += 1
                stats['prior_flagged_pairs'] += bool(old_check['flagged'])
                stats['proposed_flagged_pairs'] += bool(new_check['flagged'])
    return {**stats, 'default_cap_kmh': cap, 'tolerance_s': 60,
            'limits': 'Static schedule and optimistic constant speed only; no traffic, dwell, signals or GPS.'}


def filter_tram_oneway(ways):
    """Strictly interpret generic oneway only for this offline hypothesis."""
    nodes, adjacent, _ = _build_graph_detailed(ways, 'tram')
    by_id = {way['id']: way for way in ways}
    directed = {}
    for a, choices in adjacent.items():
        directed[a] = []
        for b, distance, edge in choices:
            way = by_id[int(edge.split(':')[0])]
            pairs = set(zip(way['nodes'], way['nodes'][1:]))
            forward, backward = (a, b) in pairs, (b, a) in pairs
            direction = _way_oneway(way['tags'], 'tram')
            if forward == backward:
                continue
            if direction is None or (direction == 'yes' and forward) or (direction == '-1' and backward):
                directed[a].append((b, distance, edge))
    return nodes, directed


def replay(line, prior, source, bbox, overrides, *, strict_tram_oneway=False):
    mode = line.get('mode')
    if mode not in ('tram', 'bus') or prior.get('mode') != mode or line['pattern_id'] != prior['pattern_id']:
        raise ValueError('dated pattern identity and supported mode required')
    if strict_tram_oneway and mode != 'tram':
        raise ValueError('tram oneway experiment cannot apply to bus')
    stops = line.get('stops') or []
    if not coverage_ok(stops, bbox, 0.004):
        raise ValueError('pattern outside declared source coverage')
    ways = _local_ways(source[mode], stops, 0.004)
    if strict_tram_oneway:
        nodes, graph = filter_tram_oneway(ways)
    else:
        nodes, graph, _ = _build_graph_detailed(ways, mode)
    if not nodes:
        raise ValueError('empty graph')
    snaps = [_nearest_node(nodes, s['latitude'], s['longitude']) for s in stops]
    if any(n not in nodes for n in snaps):
        raise ValueError('unavailable stop snap')
    originals = snaps.copy()
    for index, node in overrides.items():
        if type(index) is not int or not 0 <= index < len(stops) or node not in nodes:
            raise ValueError('invalid override index or node')
        dist = _haversine_m(stops[index]['latitude'], stops[index]['longitude'], *nodes[node])
        if not math.isfinite(dist) or dist > MAX_EXPERIMENT_SNAP_M:
            raise ValueError('override node beyond experimental snap radius')
        snaps[index] = node
    selections = [{'stop_index': i, 'stop_id': str(stops[i]['stop_id']),
                   'original_node': originals[i], 'candidate_node': snaps[i],
                   'original_offset_m': round(_haversine_m(stops[i]['latitude'], stops[i]['longitude'], *nodes[originals[i]]), 2),
                   'candidate_offset_m': round(_haversine_m(stops[i]['latitude'], stops[i]['longitude'], *nodes[snaps[i]]), 2)}
                  for i in sorted(overrides)]
    segments, full = [], []
    for i, (start, end) in enumerate(zip(snaps, snaps[1:])):
        path, edges = _astar(graph, nodes, start, end)
        if not path or len(path) != len(edges) + 1:
            raise ValueError(f'no directed path for stop pair {i}')
        points = [list(nodes[n]) for n in path]
        if full and full[-1] != points[0]:
            raise ValueError('disconnected stop pairs')
        full.extend(points if not full else points[1:])
        segments.append({'a_idx': i, 'b_idx': i+1, 'ok': True, 'start_node_id': path[0],
                         'end_node_id': path[-1], 'points': points, 'edge_ids': edges})
    check = validate_geometry(full, stops)
    projection = runtime_stop_projection(full, stops)
    if not check.get('valid') or projection is None or len(check.get('projection_positions_m') or []) != len(stops):
        raise ValueError('geometry validation failed')
    delta = max(abs(a-b) for a, b in zip(projection['positions'], check['projection_positions_m']))
    output = {'pattern_id': line['pattern_id'], 'mode': mode, 'status': 'CANDIDATE_REVIEW_ONLY',
              'physical_accuracy_verified': False, 'selected_snaps': selections,
              'candidate_length_m': round(_length(full), 1), 'prior_candidate_length_m': prior.get('new_length_m'),
              'points': full, 'segments': segments, 'validation': check,
              'exact_reverse_runs': reverse_runs(full), 'max_projection_disagreement_m': round(delta, 1)}
    output['segment_changes'] = compare_segments(prior.get('segments') or [], segments)
    output['increased_leg_review_count'] = sum(x['significant_increase_review'] for x in output['segment_changes'])
    audit = edge_assessment(output, line, index_ways(source))
    if audit['issues'] or (strict_tram_oneway and audit['warnings'].get('AGAINST_OSM_ONEWAY_REVIEW')):
        raise ValueError('edge chain or experimental direction audit failed')
    output['edge_audit'] = audit
    return output


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('map', 'osm', 'candidates', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--pattern', required=True)
    parser.add_argument('--mode', choices=('bus', 'tram'), required=True)
    parser.add_argument('--generic-tram-oneway', action='store_true',
                        help='Hypothesis only: interpret generic OSM oneway for tram')
    parser.add_argument('--snap', action='append', default=[], metavar='INDEX=OSM_NODE_ID')
    parser.add_argument('--network', type=Path, help='Optional same-snapshot static timetable for a sanity screen')
    args = parser.parse_args(argv)
    if args.output.exists(): raise FileExistsError('Refusing to overwrite report')
    mp, osm, candidate_bytes = (p.read_bytes() for p in (args.map, args.osm, args.candidates))
    map_payload, osm_payload, candidates = map(json.loads, (mp, osm, candidate_bytes))
    sha = lambda data: hashlib.sha256(data).hexdigest()
    if (candidates['provenance']['map_sha256'] != sha(mp)
            or candidates['provenance']['osm_sha256'] != sha(osm)):
        raise ValueError('source hashes mismatch')
    scope = candidates['scope']
    lines = [x for x in map_payload['lines'] if x.get('pattern_id') == args.pattern and x.get('mode') == args.mode
             and x.get('network_version_id') == scope['network_version_id'] and x.get('service_date') == scope['service_date']]
    prior = [x for x in candidates['patterns'] if x.get('pattern_id') == args.pattern and x.get('mode') == args.mode
             and x.get('status') == 'CANDIDATE_REVIEW_ONLY']
    if len(lines) != 1 or len(prior) != 1:
        raise ValueError('ambiguous or missing dated candidate')
    overrides = {}
    for value in args.snap:
        try:
            parts = value.split('=')
            if len(parts) != 2: raise ValueError()
            index, node = map(int, parts)
            if index in overrides: raise ValueError()
            overrides[index] = node
        except ValueError:
            raise ValueError('snap must be unique INDEX=OSM_NODE_ID') from None
    bbox = scope['declared_osm_bbox']
    output = {'scope': scope, 'candidate': replay(lines[0], prior[0], parse_osm(osm_payload, bbox), bbox, overrides,
                                                  strict_tram_oneway=args.generic_tram_oneway),
              'input_candidates_sha256': sha(candidate_bytes),
              'limits': ['If selected, generic tram oneway interpretation is experimental; operational direction is unverified.',
                         'Alternative nodes are hypotheses; platform side is not independently verified.',
                         'No closures, real traffic, signals, GPS, operator trip shape or production activation.']}
    if args.network:
        network_bytes = args.network.read_bytes()
        if candidates['provenance']['network_sha256'] != sha(network_bytes):
            raise ValueError('network hash mismatch')
        output['schedule_screen'] = compare_schedule(json.loads(network_bytes), lines[0], prior[0], output['candidate'])
    with args.output.open('x', encoding='utf-8', newline='\n') as f:
        json.dump(output, f, ensure_ascii=False, indent=2, allow_nan=False); f.write('\n')
    print(json.dumps({'report': str(args.output), 'pattern_id': args.pattern,
                      'candidate_length_m': output['candidate']['candidate_length_m'],
                      'selected_snaps': output['candidate']['selected_snaps'],
                      'increased_leg_review_count': output['candidate']['increased_leg_review_count'],
                      'schedule_screen': output.get('schedule_screen'),
                      'edge_audit': output['candidate']['edge_audit']}, ensure_ascii=False))


if __name__ == '__main__': main()
