"""Optimistic, offline static-schedule sanity checks for candidate stop pairs.

Not the motion solver: no real-time forecast, acceleration, turns, dwell,
traffic, signal phases or physical observations are modelled. A flag is only
a reason to investigate the geometry/timetable, never proof of either.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mobility.domain import _pattern_id, _pattern_key
from mobility.motion.config import DEFAULT_MOTION_CONFIG
from mobility.realtime_trip_identity import _time_seconds
from mobility.roads import _haversine_m
from mobility.stop_occurrences import stop_occurrence_times


def pair_check(segment, departure, arrival, speed_kmh, tolerance_s=60):
    a, b = _time_seconds(departure), _time_seconds(arrival)
    if a is None or b is None or b < a or speed_kmh <= 0:
        return None
    points = segment.get('points') or []
    if not points:
        return None
    length = sum(_haversine_m(*x, *y) for x, y in zip(points, points[1:]))
    elapsed = b - a
    minimum = length / (speed_kmh / 3.6)
    return {'distance_m': length, 'scheduled_s': elapsed, 'optimistic_minimum_s': minimum,
            'flagged': minimum > elapsed + tolerance_s}


def schedule_report(network, map_payload, candidates):
    scope = candidates['scope']
    if str(network.get('version_id') or '') != scope['network_version_id']:
        raise ValueError('network identity mismatch')
    lines = {(x['pattern_id'], x['mode']): x for x in map_payload['lines']
             if x.get('network_version_id') == scope['network_version_id']
             and x.get('service_date') == scope['service_date']}
    rows = {(x['pattern_id'], x['mode']): x for x in candidates['patterns']}
    if len(rows) != len(candidates['patterns']) or set(rows) != set(lines):
        raise ValueError('candidate identity mismatch')
    counts = Counter()
    flagged = defaultdict(list)
    caps = {m: DEFAULT_MOTION_CONFIG[m]['max_speed_kmh'] for m in ('tram', 'bus')}
    for route in network.get('routes') or []:
        mode, number = route.get('mode'), str(route.get('route_number') or '')
        if mode not in caps:
            continue
        for trip in route.get('trips') or []:
            key = (_pattern_id(number, _pattern_key(trip)), mode)
            if key not in rows or rows[key].get('status') != 'CANDIDATE_REVIEW_ONLY':
                counts['trips_without_complete_candidate'] += 1
                continue
            counts['trips_with_candidate'] += 1
            if [str(x) for x in trip.get('stop_ids') or []] != [str(s['stop_id']) for s in lines[key]['stops']]:
                raise ValueError('stop occurrence mismatch')
            try:
                visits = stop_occurrence_times(trip)
            except ValueError:
                counts['malformed_occurrence_trips'] += 1
                continue
            if visits is None:
                counts['missing_occurrence_trips'] += 1
                continue
            segments = rows[key].get('segments') or []
            if len(segments) != len(visits) - 1:
                raise ValueError('segment count mismatch')
            for i, segment in enumerate(segments):
                result = pair_check(segment, visits[i]['departure_time'], visits[i+1]['arrival_time'], caps[mode])
                if result is None:
                    counts['invalid_time_pairs'] += 1
                    continue
                counts['checked_pairs'] += 1
                if result['flagged']:
                    counts['flagged_trip_stop_pairs'] += 1
                    flagged[key].append({'trip_id': trip.get('trip_id'), 'pair_index': i,
                                         'distance_m': round(result['distance_m'], 1),
                                         'scheduled_s': result['scheduled_s'],
                                         'optimistic_minimum_s': round(result['optimistic_minimum_s'], 1)})
    output = [{'pattern_id': pid, 'mode': mode, 'route_number': lines[pid, mode].get('route_number'),
               'flagged_trip_stop_pairs': len(values), 'examples': values[:5]}
              for (pid, mode), values in sorted(flagged.items())]
    return {'scope': scope, 'counts': {**dict(counts), 'flagged_patterns': len(output)},
            'method': {'default_model_speed_caps_kmh': caps, 'tolerance_s': 60,
                       'interpretation': 'optimistic constant maximum speed; not a solver or observed speed'},
            'flagged_patterns': output,
            'limits': ['Default model caps, not independently verified local limits or the deployed region configuration.',
                       'No acceleration, turns, dwell, signals, traffic, delays or GPS; no physical accuracy proof.',
                       'Candidate length is along stop-snapped graph segments, not observed travelled distance.']}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('network', 'map', 'candidates', 'audit', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args(argv)
    if args.output.exists(): raise FileExistsError('Refusing to overwrite report')
    net, mp, cand, audit = (p.read_bytes() for p in (args.network, args.map, args.candidates, args.audit))
    network, map_payload, candidates, verified = map(json.loads, (net, mp, cand, audit))
    sha = lambda data: hashlib.sha256(data).hexdigest()
    if (candidates['provenance']['network_sha256'] != sha(net)
            or candidates['provenance']['map_sha256'] != sha(mp)
            or verified.get('input_candidates_sha256') != sha(cand)
            or verified.get('counts', {}).get('technical_issue_patterns') != 0
            or verified.get('scope') != candidates.get('scope')):
        raise ValueError('candidate inputs or edge audit do not match')
    result = schedule_report(network, map_payload, candidates)
    result['input_candidates_sha256'] = sha(cand)
    with args.output.open('x', encoding='utf-8', newline='\n') as f:
        json.dump(result, f, ensure_ascii=False, indent=2, allow_nan=False); f.write('\n')
    print(json.dumps({'report': str(args.output), **result['counts']}, ensure_ascii=False))


if __name__ == '__main__': main()
