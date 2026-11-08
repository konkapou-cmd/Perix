"""Independently audit offline candidate edge identity and review signals.

No database, network call, or candidate activation. OSM tags, length, route
changes, and diagnostic flags never establish real-world transit operation.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mobility.approach import path_fingerprint
from mobility.graph import validate_geometry
from mobility.roads import _haversine_m, _way_oneway
from tools.audit_transit_geometry import _points, audit_snapshots, reverse_runs, runtime_stop_projection
from tools.rebuild_transit_offline import parse_osm


def index_ways(ways):
    result = {}
    for mode in ('bus', 'tram'):
        result[mode] = {w['id']: w for w in ways[mode]}
    return result


def edge_assessment(candidate, line, ways):
    """Revalidate candidate against exact OSM node pairs and joined geometry."""
    issues, warnings = [], Counter()
    if candidate.get('status') != 'CANDIDATE_REVIEW_ONLY':
        return {'issues': ['NO_COMPLETE_CANDIDATE'], 'warnings': {}, 'edge_count': 0}
    mode, segments = candidate.get('mode'), candidate.get('segments')
    if mode not in ways or not isinstance(segments, list) or len(segments) != len(line['stops']) - 1:
        return {'issues': ['SEGMENT_COUNT_OR_MODE_MISMATCH'], 'warnings': {}, 'edge_count': 0}
    joined, previous_node, edge_count = [], None, 0
    for idx, seg in enumerate(segments):
        points, edges = seg.get('points') or [], seg.get('edge_ids') or []
        if seg.get('a_idx') != idx or seg.get('b_idx') != idx + 1 or len(points) != len(edges) + 1:
            issues.append('INVALID_SEGMENT_ORDER_OR_EDGE_COUNT'); break
        if (previous_node is not None and (seg.get('start_node_id') != previous_node
                                           or not joined or joined[-1] != points[0])):
            issues.append('DISCONNECTED_SEGMENTS'); break
        prior_edge_end = None
        for i, edge in enumerate(edges):
            try:
                bits = str(edge).split(':')
                if len(bits) != 3: raise ValueError()
                wid, a, b = map(int, bits)
                if min(wid, a, b) <= 0 or a == b: raise ValueError()
                if prior_edge_end is not None and prior_edge_end != a: raise ValueError()
                way = ways[mode][wid]
                matches = [(j, x, y) for j, (x, y) in enumerate(zip(way['nodes'], way['nodes'][1:]))
                           if (x, y) in ((a, b), (b, a))]
                if len(matches) != 1: raise ValueError()
                j, x, y = matches[0]
                expected_a, expected_b = ((way['points'][j], way['points'][j+1])
                                          if (x, y) == (a, b) else (way['points'][j+1], way['points'][j]))
                if points[i] != expected_a or points[i+1] != expected_b: raise ValueError()
                if i == 0 and seg.get('start_node_id') != a: raise ValueError()
                if i == len(edges)-1 and seg.get('end_node_id') != b: raise ValueError()
                one = _way_oneway(way['tags'], mode)
                if (one == 'yes' and (x, y) != (a, b)) or (one == '-1' and (x, y) == (a, b)):
                    warnings['AGAINST_OSM_ONEWAY_REVIEW'] += 1
                if any(way['tags'].get(k) in ('no', 'private') for k in ('access', 'bus', 'psv')):
                    warnings['ACCESS_TAG_REVIEW'] += 1
                edge_count += 1
                prior_edge_end = b
            except (ValueError, KeyError, TypeError, IndexError):
                issues.append('EDGE_NOT_IDENTICAL_TO_SOURCE_GRAPH'); break
        if issues:
            break
        joined.extend(points if not joined else points[1:])
        previous_node = seg.get('end_node_id')
    if not issues and joined != candidate.get('points'):
        issues.append('ASSEMBLED_GEOMETRY_MISMATCH')
    if not issues:
        check = validate_geometry(joined, line['stops'])
        projection = runtime_stop_projection(joined, line['stops'])
        if not check.get('valid') or projection is None or len(check.get('projection_positions_m') or []) != len(line['stops']):
            issues.append('REVALIDATION_FAILED')
        else:
            max_delta = round(max(abs(a-b) for a, b in zip(projection['positions'], check['projection_positions_m'])), 1)
            if (candidate.get('validation') != check or candidate.get('exact_reverse_runs') != reverse_runs(joined)
                    or candidate.get('max_projection_disagreement_m') != max_delta):
                issues.append('DIAGNOSTIC_RECOMPUTATION_MISMATCH')
    return {'issues': issues, 'warnings': dict(warnings), 'edge_count': edge_count}


def displacement(old, new):
    """Equal-index point differences distinguish rounding from topology changes."""
    if len(old) != len(new):
        return None
    return max((_haversine_m(*a, *b) for a, b in zip(old, new)), default=0.0)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('network', 'map', 'osm', 'candidates', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args(argv)
    if args.output.exists(): raise FileExistsError('Refusing to overwrite report')
    network_data, map_data, osm_data, candidate_data = (p.read_bytes() for p in
        (args.network, args.map, args.osm, args.candidates))
    network, map_payload, osm_payload, candidates = map(json.loads, (network_data, map_data, osm_data, candidate_data))
    baseline = audit_snapshots(network, map_payload)
    if baseline['counts']['technical_issue_patterns'] or baseline['counts']['patterns_absent_from_map']:
        raise ValueError('baseline identity failed')
    provenance, scope = candidates.get('provenance') or {}, candidates.get('scope') or {}
    for key, data in [('network_sha256', network_data), ('map_sha256', map_data), ('osm_sha256', osm_data)]:
        if provenance.get(key) != hashlib.sha256(data).hexdigest():
            raise ValueError('candidate input hash mismatch')
    if any(scope.get(k) != baseline['scope'][k] for k in ('network_version_id', 'service_date')):
        raise ValueError('dated identity mismatch')
    ways = index_ways(parse_osm(osm_payload, scope.get('declared_osm_bbox') or []))
    originals = {(line['pattern_id'], line['mode']): line for line in map_payload['lines']
                 if line.get('network_version_id') == scope['network_version_id']
                 and line.get('service_date') == scope['service_date']}
    old = {(row['pattern_id'], row['mode']): row for row in baseline['patterns']}
    selected, rows = set(), []
    for candidate in candidates.get('patterns') or []:
        key = (candidate.get('pattern_id'), candidate.get('mode'))
        if key not in originals or key in selected:
            raise ValueError('unexpected or duplicate candidate identity')
        selected.add(key)
        line, prior = originals[key], old[key]
        assessment = edge_assessment(candidate, line, ways)
        new_points = candidate.get('points') or []
        point_diff = displacement(_points(line), new_points) if new_points else None
        flags = []
        if candidate.get('exact_reverse_runs'): flags.append('EXACT_REVERSE_RUN_REVIEW')
        projection = candidate.get('max_projection_disagreement_m')
        if type(projection) in (int, float) and math.isfinite(projection) and projection > 100:
            flags.append('STOP_PROJECTION_DISAGREEMENT_REVIEW')
        rows.append({'pattern_id': key[0], 'mode': key[1], 'route_number': line.get('route_number'),
                     'technical_issues': assessment['issues'], 'edge_warning_counts': assessment['warnings'],
                     'edge_count': assessment['edge_count'], 'old_review_flags': prior['review_flags'],
                     'new_review_flags': flags, 'old_length_m': candidate.get('old_length_m'),
                     'new_length_m': candidate.get('new_length_m'),
                     'same_geometry_fingerprint': bool(new_points) and path_fingerprint(new_points) == prior['geometry_fingerprint'],
                     'equal_index_max_displacement_m': round(point_diff, 3) if point_diff is not None else None,
                     'physical_accuracy_verified': False})
    if len(selected) != scope.get('selected_patterns'):
        raise ValueError('candidate count mismatch')
    counts = Counter()
    for row in rows:
        counts['technical_issue_patterns'] += bool(row['technical_issues'])
        counts['old_review_flagged'] += bool(row['old_review_flags'])
        counts['new_review_flagged'] += bool(row['new_review_flags'])
        counts['old_reverse'] += 'EXACT_REVERSE_RUN_REVIEW' in row['old_review_flags']
        counts['new_reverse'] += 'EXACT_REVERSE_RUN_REVIEW' in row['new_review_flags']
        counts['old_projection'] += 'STOP_PROJECTION_DISAGREEMENT_REVIEW' in row['old_review_flags']
        counts['new_projection'] += 'STOP_PROJECTION_DISAGREEMENT_REVIEW' in row['new_review_flags']
        counts['new_flagged_from_unflagged'] += bool(row['new_review_flags']) and not row['old_review_flags']
        counts['all_previous_flags_cleared'] += bool(row['old_review_flags']) and not row['new_review_flags']
        counts['oneway_review_patterns'] += 'AGAINST_OSM_ONEWAY_REVIEW' in row['edge_warning_counts']
        counts['access_review_patterns'] += 'ACCESS_TAG_REVIEW' in row['edge_warning_counts']
        counts['same_fingerprint'] += row['same_geometry_fingerprint']
        counts['equal_index_within_1m'] += row['equal_index_max_displacement_m'] is not None and row['equal_index_max_displacement_m'] <= 1
    out = {'scope': scope, 'counts': dict(counts), 'patterns': rows,
           'input_candidates_sha256': hashlib.sha256(candidate_data).hexdigest(),
           'limits': ['OSM oneway and access tags are review signals, not proof of actual transit directions.',
                      'Changed or shorter paths and fewer flags do not prove physical correctness.',
                      'No operator restrictions, GPS, real traffic, timetable or motion replay was supplied.']}
    with args.output.open('x', encoding='utf-8', newline='\n') as f:
        json.dump(out, f, ensure_ascii=False, indent=2, allow_nan=False); f.write('\n')
    print(json.dumps({'report': str(args.output), 'counts': out['counts']}, ensure_ascii=False))


if __name__ == '__main__': main()
