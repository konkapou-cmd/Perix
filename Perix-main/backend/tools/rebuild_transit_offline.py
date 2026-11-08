"""Offline OSM stop-pair reconstruction, never a production generation.

Reads captured dated network/map and one bounded Overpass response. It does
not fetch, edit, publish, access a database, apply operational restrictions or
certify actual travel. Outputs are diagnostic candidates only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import multiprocessing
import re
import sys
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mobility.graph import validate_geometry
from mobility.roads import HIGHWAY_FILTER, RAILWAY_FILTER, _haversine_m, _route_stops_segments_sync
from tools.audit_transit_geometry import _points, audit_snapshots, reverse_runs, runtime_stop_projection


_WAYS = None


def _init_worker(ways):
    global _WAYS
    _WAYS = ways


def parse_osm(payload, bbox):
    """Validate complete ways returned by a *declared* Overpass bbox query."""
    if (not isinstance(payload, dict) or payload.get('remark') or
            not (payload.get('osm3s') or {}).get('timestamp_osm_base')):
        raise ValueError('OSM response missing timestamp or contains an error')
    if len(bbox) != 4 or any(not math.isfinite(x) for x in bbox):
        raise ValueError('invalid declared OSM bbox')
    s, w, n, e = bbox
    if not (-90 <= s < n <= 90 and -180 <= w < e <= 180):
        raise ValueError('invalid declared OSM bbox')
    if not isinstance(payload.get('elements'), list):
        raise ValueError('OSM elements missing')
    result = {'bus': [], 'tram': []}
    seen = set()
    nodes_seen = {}
    for element in payload['elements']:
        if element.get('type') != 'way':
            raise ValueError('unexpected OSM element')
        wid, ids, geom, tags = (element.get('id'), element.get('nodes'),
                                element.get('geometry'), element.get('tags') or {})
        if type(wid) is not int or wid <= 0 or wid in seen:
            raise ValueError('invalid or duplicate OSM way')
        seen.add(wid)
        if not isinstance(ids, list) or not isinstance(geom, list) or len(ids) < 2 or len(ids) != len(geom):
            raise ValueError('incomplete OSM way')
        points = []
        for node, point in zip(ids, geom):
            if type(node) is not int or node <= 0 or not isinstance(point, dict):
                raise ValueError('invalid OSM node')
            lat, lon = point.get('lat'), point.get('lon')
            if (type(lat) not in (int, float) or type(lon) not in (int, float)
                    or not math.isfinite(lat) or not math.isfinite(lon)
                    or not -90 <= lat <= 90 or not -180 <= lon <= 180):
                raise ValueError('invalid OSM coordinate')
            pair = (float(lat), float(lon))
            if node in nodes_seen and nodes_seen[node] != pair:
                raise ValueError('conflicting OSM node coordinates')
            nodes_seen[node] = pair
            points.append(list(pair))
        matches = []
        if re.fullmatch(HIGHWAY_FILTER, str(tags.get('highway') or '')):
            matches.append('bus')
        if re.fullmatch(RAILWAY_FILTER, str(tags.get('railway') or '')):
            matches.append('tram')
        if not matches:
            raise ValueError('OSM way outside requested layers')
        way = {'id': wid, 'nodes': ids, 'points': points, 'tags': tags,
               'bounds': [min(p[0] for p in points), min(p[1] for p in points),
                          max(p[0] for p in points), max(p[1] for p in points)]}
        for kind in matches:
            result[kind].append(way)
    if not result['bus'] or not result['tram']:
        raise ValueError('required OSM layer empty')
    return result


def coverage_ok(stops, bbox, margin):
    """Replicate pattern bbox plus the local store's extra 0.003 degrees."""
    if len(stops) < 2:
        return False
    lat = [s['latitude'] for s in stops]
    lon = [s['longitude'] for s in stops]
    d = margin + 0.003
    return (bbox[0] <= min(lat) - d and bbox[1] <= min(lon) - d
            and bbox[2] >= max(lat) + d and bbox[3] >= max(lon) + d)


def _local_ways(ways, stops, margin):
    d = margin + 0.003
    south = min(s['latitude'] for s in stops) - d
    north = max(s['latitude'] for s in stops) + d
    west = min(s['longitude'] for s in stops) - d
    east = max(s['longitude'] for s in stops) + d
    return [way for way in ways if way['bounds'][0] <= north and way['bounds'][2] >= south
            and way['bounds'][1] <= east and way['bounds'][3] >= west]


def _length(points):
    return sum(_haversine_m(*a, *b) for a, b in zip(points, points[1:]))


def reconstruct_line(line, bbox, ways):
    """Run existing routing and validators without touching their safeguards."""
    stops = line['stops']
    mode = line['mode']
    baseline = _points(line)
    out = {'pattern_id': line['pattern_id'], 'mode': mode, 'route_number': line['route_number'],
           'status': 'INCOMPLETE', 'physical_accuracy_verified': False,
           'old_length_m': round(_length(baseline), 1), 'stop_count': len(stops)}
    if mode not in ('bus', 'tram'):
        out['reason'] = 'UNSUPPORTED_MODE'
        return out
    margins = [0.004, 0.02] if mode == 'tram' else [0.004]
    chosen, attempts = None, []
    for margin in margins:
        if not coverage_ok(stops, bbox, margin):
            attempts.append({'margin': margin, 'status': 'OUTSIDE_DECLARED_COVERAGE'})
            continue
        local = _local_ways(ways[mode], stops, margin)
        routed = _route_stops_segments_sync(
            [(s['latitude'], s['longitude']) for s in stops], local, mode=mode)
        attempts.append({'margin': margin, 'ways': len(local),
                         'missing_pairs': routed['missing_pairs']})
        if routed['full']:
            chosen = routed
            break
    out['attempts'] = attempts
    if chosen is None:
        out['reason'] = 'NO_COMPLETE_PATH_OR_COVERAGE'
        return out
    points = chosen['full']
    # No fabricated links: verify node and coordinate joins across every segment.
    segments = chosen['segments']
    if (len(segments) != len(stops) - 1 or any(not s.get('ok') or
            len(s['edge_ids']) + 1 != len(s['points']) for s in segments) or
            any(a['end_node_id'] != b['start_node_id'] or a['points'][-1] != b['points'][0]
                for a, b in zip(segments, segments[1:]))):
        out['reason'] = 'DISCONNECTED_SEGMENTS'
        return out
    validation = validate_geometry(points, stops)
    if not validation.get('valid'):
        out['reason'] = 'GEOMETRY_VALIDATION_FAILED'
        out['validation'] = validation
        return out
    runtime = runtime_stop_projection(points, stops)
    if runtime is None or len(validation.get('projection_positions_m') or []) != len(stops):
        out['reason'] = 'STOP_PROJECTION_UNAVAILABLE'
        return out
    delta = [abs(a - b) for a, b in zip(runtime['positions'], validation['projection_positions_m'])]
    reversals = reverse_runs(points)
    out.update(status='CANDIDATE_REVIEW_ONLY', reason=None,
               new_length_m=round(_length(points), 1), point_count=len(points),
               max_projection_disagreement_m=round(max(delta), 1),
               exact_reverse_runs=reversals, validation=validation,
               points=points, segments=segments)
    return out


def _job(args):
    line, bbox = args
    try:
        return reconstruct_line(line, bbox, _WAYS)
    except Exception as exc:
        return {'pattern_id': line.get('pattern_id'), 'mode': line.get('mode'),
                'route_number': line.get('route_number'), 'status': 'ERROR',
                'reason': type(exc).__name__, 'physical_accuracy_verified': False}


def _sha(data):
    return hashlib.sha256(data).hexdigest()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--network', required=True, type=Path)
    parser.add_argument('--map', required=True, type=Path)
    parser.add_argument('--osm', required=True, type=Path)
    parser.add_argument('--osm-bbox', required=True, nargs=4, type=float, metavar=('S', 'W', 'N', 'E'))
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--workers', type=int, default=2, choices=range(1, 5))
    parser.add_argument('--pattern', help='Optional single-pattern pilot')
    args = parser.parse_args(argv)
    if args.output.exists():
        raise FileExistsError('Refusing to overwrite report')
    network_data, map_data, osm_data = (p.read_bytes() for p in (args.network, args.map, args.osm))
    network, map_payload, osm_payload = map(json.loads, (network_data, map_data, osm_data))
    if any(r.get('shapes') or any(t.get('shape_id') for t in r.get('trips') or [])
           for r in network.get('routes') or []):
        raise ValueError('network shapes need explicit hint support; refusing unhinted replay')
    baseline = audit_snapshots(network, map_payload)
    if baseline['counts']['technical_issue_patterns'] or baseline['counts']['patterns_absent_from_map']:
        raise ValueError('dated baseline identity checks failed')
    ways = parse_osm(osm_payload, args.osm_bbox)
    day, version = baseline['scope']['service_date'], baseline['scope']['network_version_id']
    lines = [line for line in map_payload['lines'] if line.get('service_date') == day
             and line.get('network_version_id') == version and (not args.pattern or line['pattern_id'] == args.pattern)]
    if not lines:
        raise ValueError('no matching dated patterns')
    with ProcessPoolExecutor(max_workers=args.workers, initializer=_init_worker, initargs=(ways,)) as pool:
        rows = list(pool.map(_job, ((line, args.osm_bbox) for line in lines), chunksize=1))
    counts = Counter(x['status'] for x in rows)
    result = {'scope': {**baseline['scope'], 'selected_patterns': len(lines),
                        'declared_osm_bbox': args.osm_bbox, 'osm_base': osm_payload['osm3s']['timestamp_osm_base']},
              'provenance': {'network_sha256': _sha(network_data), 'map_sha256': _sha(map_data),
                             'osm_sha256': _sha(osm_data), 'osm_attribution': '© OpenStreetMap contributors',
                             'osm_license': 'ODbL https://www.openstreetmap.org/copyright',
                             'built_at_utc': datetime.now(timezone.utc).isoformat()},
              'counts': dict(counts), 'patterns': rows,
              'limits': ['OSM bbox is caller-declared and query completeness must be independently verified.',
                         'No operational restrictions, traffic, signal data or current detours were applied.',
                         'Full infra/motion generation, deployment, operator-reference and GPS validation were not performed.',
                         'A candidate, validation pass or shorter path does not prove a physically correct route.']}
    with args.output.open('x', encoding='utf-8', newline='\n') as f:
        json.dump(result, f, ensure_ascii=False, indent=2, allow_nan=False)
        f.write('\n')
    print(json.dumps({'report': str(args.output), **result['scope'], 'counts': result['counts']}, ensure_ascii=False))


if __name__ == '__main__':
    multiprocessing.freeze_support()
    main()
