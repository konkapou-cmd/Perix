"""Read-only, dated transit geometry triage for captured PERIX JSON snapshots.

This CLI does not fetch, edit, publish, activate or certify any geometry. Exact
out-and-back runs and projection disagreements are review signals, not proof
that a route is wrong: some routes legitimately reverse or revisit a station.
No source/traffic/GPS evidence is invented or promoted to an observation.

Example: python -B tools/audit_transit_geometry.py --network network.json
    --map map.json --output report.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mobility.approach import path_fingerprint
from mobility.domain import _pattern_id, _pattern_key
from mobility.graph import _haversine_m, validate_geometry
from mobility.realtime_trip_identity import _service_date


def _points(line):
    result = []
    for point in line.get('points') or []:
        if not isinstance(point, dict):
            raise ValueError('invalid point')
        lat, lon = point.get('latitude'), point.get('longitude')
        if (type(lat) not in (int, float) or type(lon) not in (int, float)
                or not math.isfinite(lat) or not math.isfinite(lon)
                or not -90 <= lat <= 90 or not -180 <= lon <= 180):
            raise ValueError('invalid coordinates')
        result.append([float(lat), float(lon)])
    if len(result) < 2:
        raise ValueError('insufficient geometry')
    return result


def reverse_runs(points, min_edges=3, min_length_m=100.0):
    """Find exact immediate out-and-back subpaths; never label them errors."""
    runs = []
    for pivot in range(1, len(points) - 1):
        if points[pivot - 1] != points[pivot + 1]:
            continue
        count, length = 0, 0.0
        while pivot - count - 1 >= 0 and pivot + count + 1 < len(points):
            left, right = pivot - count - 1, pivot + count + 1
            if points[left] != points[right]:
                break
            distance = _haversine_m(*points[left], *points[left + 1])
            if distance <= 0:
                break
            count += 1
            length += distance
        if count >= min_edges and length >= min_length_m:
            runs.append({'turn_vertex': pivot, 'edges_each_direction': count,
                         'repeated_distance_m': round(length, 1)})
    return runs


def runtime_stop_projection(points, stops):
    """Reproduce the existing solver's forward nearest-vertex projection."""
    cumulative = [0.0]
    for a, b in zip(points, points[1:]):
        cumulative.append(cumulative[-1] + _haversine_m(*a, *b))
    cursor, positions, distances = 0, [], []
    for stop in stops:
        lat, lon = stop.get('latitude'), stop.get('longitude')
        if (type(lat) not in (int, float) or type(lon) not in (int, float)
                or not math.isfinite(lat) or not math.isfinite(lon)):
            return None
        cursor = min(range(cursor, len(points)), key=lambda i: _haversine_m(lat, lon, *points[i]))
        positions.append(cumulative[cursor])
        distances.append(_haversine_m(lat, lon, *points[cursor]))
    return {'positions': positions, 'distances': distances}


def _expected_patterns(network):
    expected, ambiguous = {}, set()
    excluded = Counter()
    for route in network.get('routes') or []:
        mode = str(route.get('mode') or '')
        if mode not in ('bus', 'tram', 'trolleybus'):
            excluded[mode or 'unknown'] += 1
            continue
        number = str(route.get('route_number') or '')
        for trip in route.get('trips') or []:
            pid = _pattern_id(number, _pattern_key(trip))
            identity = (pid, mode)
            ids = tuple(str(v) for v in trip.get('stop_ids') or [])
            if identity in expected and expected[identity] != ids:
                ambiguous.add(identity)
            else:
                expected[identity] = ids
    return expected, ambiguous, dict(excluded)


def audit_snapshots(network, map_payload, *, divergence_m=100.0, reversal_m=100.0):
    """Audit one matching dated network; foreign dated map rows are excluded."""
    version = str(network.get('version_id') or '')
    day = _service_date(network)
    if not version or not day:
        raise ValueError('network version and explicit dated identity are required')
    if not isinstance(map_payload.get('lines'), list):
        raise ValueError('map lines missing')
    if not math.isfinite(divergence_m) or divergence_m <= 0 or not math.isfinite(reversal_m) or reversal_m <= 0:
        raise ValueError('thresholds must be positive finite values')
    expected, ambiguous, excluded = _expected_patterns(network)
    seen, lines, foreign = set(), [], 0
    for line in map_payload['lines']:
        if str(line.get('network_version_id') or '') != version or str(line.get('service_date') or '') != day:
            foreign += 1
            continue
        pid, mode = str(line.get('pattern_id') or ''), str(line.get('mode') or '')
        key = (pid, mode)
        issues, warnings = [], []
        if key in seen:
            issues.append('DUPLICATE_PATTERN_IDENTITY')
        seen.add(key)
        if key not in expected:
            issues.append('PATTERN_NOT_IN_DATED_NETWORK')
        if key in ambiguous:
            issues.append('AMBIGUOUS_PATTERN_IDENTITY')
        stops = line.get('stops') or []
        if key in expected and tuple(str(s.get('stop_id')) for s in stops) != expected[key]:
            issues.append('STOP_OCCURRENCE_MISMATCH')
        if line.get('valid') is not True:
            issues.append('MAP_GEOMETRY_NOT_VALIDATED')
        points = []
        try:
            points = _points(line)
        except (ValueError, TypeError, AttributeError):
            issues.append('INVALID_POINTS')
        if points:
            fingerprint = line.get('approach_geometry_fingerprint')
            if not isinstance(fingerprint, str) or not fingerprint:
                issues.append('MISSING_GEOMETRY_FINGERPRINT')
            elif fingerprint != path_fingerprint(points):
                issues.append('GEOMETRY_FINGERPRINT_MISMATCH')
        reversals, projection_delta, projection_stop = [], None, None
        if points and stops:
            reversals = reverse_runs(points, min_length_m=reversal_m)
            if reversals:
                warnings.append('EXACT_REVERSE_RUN_REVIEW')
            runtime = runtime_stop_projection(points, stops)
            valid = validate_geometry(points, stops)
            if runtime is None or not valid.get('valid') or len(valid['projection_positions_m']) != len(stops):
                issues.append('STOP_PROJECTION_UNAVAILABLE')
            else:
                differences = [abs(a - b) for a, b in zip(runtime['positions'], valid['projection_positions_m'])]
                index = max(range(len(differences)), key=differences.__getitem__)
                projection_delta = round(differences[index], 1)
                projection_stop = str(stops[index].get('stop_id') or '')
                if projection_delta > divergence_m:
                    warnings.append('STOP_PROJECTION_DISAGREEMENT_REVIEW')
        elif not stops:
            issues.append('STOP_OCCURRENCES_MISSING')
        lines.append({'pattern_id': pid, 'route_number': str(line.get('route_number') or ''),
                      'mode': mode, 'direction': line.get('direction'), 'source': line.get('source'),
                      'geometry_fingerprint': line.get('approach_geometry_fingerprint'),
                      'stop_count': len(stops), 'point_count': len(points),
                      'technical_issues': issues, 'review_flags': warnings, 'reverse_runs': reversals,
                      'max_projection_disagreement_m': projection_delta,
                      'max_projection_disagreement_stop_id': projection_stop,
                      'physical_accuracy_verified': False})
    if not lines:
        raise ValueError('no map lines match the dated network')
    missing = sorted(f'{pid}|{mode}' for pid, mode in expected.keys() - seen)
    count = Counter()
    for line in lines:
        count.update(line['technical_issues'])
        count.update(line['review_flags'])
    return {'scope': {'network_version_id': version, 'service_date': day,
                      'expected_dated_patterns': len(expected), 'matching_map_patterns': len(lines),
                      'foreign_dated_map_rows_excluded': foreign, 'excluded_network_route_modes': excluded},
            'method': {'exact_reversal_min_edges': 3, 'exact_reversal_min_length_m': reversal_m,
                       'projection_disagreement_m': divergence_m,
                       'not_a_physical_accuracy_or_route_correctness_test': True},
            'counts': {'technical_issue_patterns': sum(bool(x['technical_issues']) for x in lines),
                       'review_flagged_patterns': sum(bool(x['review_flags']) for x in lines),
                       'patterns_absent_from_map': len(missing), 'by_reason': dict(count)},
            'missing_pattern_identities': missing, 'patterns': lines}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--network', required=True, type=Path)
    parser.add_argument('--map', required=True, type=Path)
    parser.add_argument('--output', type=Path, help='New report file; existing files are never overwritten')
    args = parser.parse_args(argv)
    network_bytes, map_bytes = args.network.read_bytes(), args.map.read_bytes()
    report = audit_snapshots(json.loads(network_bytes), json.loads(map_bytes))
    report['capture_provenance'] = {
        'network_sha256': hashlib.sha256(network_bytes).hexdigest(),
        'map_sha256': hashlib.sha256(map_bytes).hexdigest(),
        'audited_at_utc': datetime.now(timezone.utc).isoformat(),
        'source_note': 'Local supplied snapshots; source licence and data provenance must be verified separately.',
    }
    output = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        with args.output.open('x', encoding='utf-8') as file:
            file.write(output + '\n')
        print(json.dumps({'report': str(args.output), **report['scope'], **report['counts']}, ensure_ascii=False))
    else:
        print(output)


if __name__ == '__main__':
    main()
