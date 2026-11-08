"""Read-only validation of one bounded Overpass road/rail/signal response.

No database, network call or activation. A successful response is not a
polygon-verified PBF snapshot, proof of operating routes, or signal phases.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mobility.signals import normalize_signal
from tools.rebuild_transit_offline import parse_osm


def source_timestamp(payload):
    value = (payload.get('osm3s') or {}).get('timestamp_osm_base')
    try:
        stamp = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        if stamp.tzinfo is None or stamp.utcoffset() is None:
            raise ValueError()
        return stamp
    except (ValueError, TypeError, OverflowError):
        raise ValueError('missing or invalid OSM source timestamp') from None


def inspect_snapshot(payload, bbox):
    source_timestamp(payload)
    if not isinstance(payload.get('elements'), list):
        raise ValueError('missing Overpass elements')
    if any(x.get('type') not in ('way', 'node') for x in payload['elements']):
        raise ValueError('unexpected element type')
    ways_raw = [x for x in payload['elements'] if x.get('type') == 'way']
    signals_raw = [x for x in payload['elements'] if x.get('type') == 'node']
    # Reuse the same source identity, complete node-ref and layer validators.
    way_view = {**payload, 'elements': ways_raw}
    layers = parse_osm(way_view, bbox)
    signals, seen = [], set()
    for row in signals_raw:
        sid = row.get('id')
        if type(sid) is not int or sid <= 0 or sid in seen:
            raise ValueError('duplicate or invalid signal ID')
        seen.add(sid)
        if type(row.get('lat')) not in (int, float) or type(row.get('lon')) not in (int, float):
            raise ValueError('invalid signal coordinates')
        normalized = normalize_signal(row)
        if normalized is None:
            raise ValueError('unexpected or malformed signal')
        lat, lon = normalized['lat'], normalized['lng']
        if (not math.isfinite(lat) or not math.isfinite(lon) or
                not bbox[0] <= lat <= bbox[2] or not bbox[1] <= lon <= bbox[3]):
            raise ValueError('signal outside declared bounds')
        signals.append(normalized)
    if not signals:
        raise ValueError('empty signal layer')
    return {'way_view': way_view, 'layers': layers, 'signals': signals}


def compare_ways(old, new):
    """Difference is evidence for review, not proof either dataset is complete."""
    old_by_id = {x['id']: x for x in old['elements'] if x.get('type') == 'way'}
    new_by_id = {x['id']: x for x in new['elements'] if x.get('type') == 'way'}
    counts = Counter()
    examples = []
    for wid, previous in old_by_id.items():
        current = new_by_id.get(wid)
        if current is None:
            counts['not_in_new_response'] += 1
            if len(examples) < 20: examples.append({'way_id': wid, 'reason': 'MISSING'})
            continue
        fields = ('nodes', 'geometry', 'tags')
        if all(previous.get(field) == current.get(field) for field in fields):
            counts['same_geometry_nodes_and_tags'] += 1
        else:
            counts['changed_geometry_nodes_or_tags'] += 1
            if len(examples) < 20: examples.append({'way_id': wid, 'reason': 'CHANGED'})
    return {'old_way_count': len(old_by_id), **dict(counts), 'examples': examples}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--osm', required=True, type=Path)
    parser.add_argument('--bbox', required=True, nargs=4, type=float, metavar=('S', 'W', 'N', 'E'))
    parser.add_argument('--previous', type=Path, help='Optional previously captured ways response')
    parser.add_argument('--previous-bbox', nargs=4, type=float, metavar=('S', 'W', 'N', 'E'))
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--ways-output', required=True, type=Path, help='New diagnostic-only ways view')
    args = parser.parse_args(argv)
    if args.output == args.ways_output or args.output.exists() or args.ways_output.exists():
        raise FileExistsError('Refusing to overwrite or share output paths')
    raw = args.osm.read_bytes(); payload = json.loads(raw)
    inspected = inspect_snapshot(payload, args.bbox)
    source_sha = hashlib.sha256(raw).hexdigest()
    ways_view = {**inspected['way_view'], 'diagnostic_parent_sha256': source_sha,
                 'diagnostic_declared_bbox': args.bbox}
    encoded = (json.dumps(ways_view, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')
    comparison = None
    previous_sha = None
    if args.previous:
        if not args.previous_bbox: raise ValueError('previous bbox required')
        old_raw = args.previous.read_bytes(); old = json.loads(old_raw)
        parse_osm(old, args.previous_bbox)
        if source_timestamp(old) > source_timestamp(payload):
            raise ValueError('previous source is newer than current source')
        if not (args.bbox[0] <= args.previous_bbox[0] and args.bbox[1] <= args.previous_bbox[1]
                and args.bbox[2] >= args.previous_bbox[2] and args.bbox[3] >= args.previous_bbox[3]):
            raise ValueError('previous bbox is not inside current bbox')
        comparison, previous_sha = compare_ways(old, ways_view), hashlib.sha256(old_raw).hexdigest()
    signals = inspected['signals']
    report = {'osm_base': payload['osm3s']['timestamp_osm_base'], 'declared_bbox': args.bbox,
              'raw_sha256': source_sha, 'ways_view_sha256': hashlib.sha256(encoded).hexdigest(),
              'previous_sha256': previous_sha, 'comparison': comparison,
              'counts': {'road_ways': len(inspected['layers']['bus']), 'rail_ways': len(inspected['layers']['tram']),
                         'signal_nodes': len(signals), 'road_signal_nodes': sum('ROAD_SIGNAL' in s['kinds'] for s in signals),
                         'rail_signal_nodes': sum('RAIL_SIGNAL' in s['kinds'] for s in signals)},
              'attribution': '© OpenStreetMap contributors, ODbL https://www.openstreetmap.org/copyright',
              'limits': ['Bounds are caller-declared and query completeness has not been independently proven.',
                         'This is not the polygon-verified PBF source contract and may not be activated.',
                         'Signal positions do not reveal phases, stops, real traffic or operator usage.']}
    with args.ways_output.open('xb') as f: f.write(encoded)
    with args.output.open('x', encoding='utf-8', newline='\n') as f:
        json.dump(report, f, ensure_ascii=False, indent=2, allow_nan=False); f.write('\n')
    print(json.dumps({'report': str(args.output), 'ways_view': str(args.ways_output),
                      'osm_base': report['osm_base'], 'counts': report['counts'], 'comparison': comparison}, ensure_ascii=True))


if __name__ == '__main__': main()
