"""Build the existing importer's audited source contract from a full PBF.

Optional offline tooling dependency: pyosmium (not a runtime dependency).
No HTTP, database, activation, graph invention, routing or manual edge creation.
"""
from __future__ import annotations
from datetime import datetime, timezone
from pathlib import Path
import argparse
import hashlib
import json
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mobility.roads import HIGHWAY_FILTER, RAILWAY_FILTER
from mobility.signals import normalize_signal


def polygon_rings(text):
    lines = [s.strip() for s in text.splitlines() if s.strip()]
    rings, current, hole = [], None, False
    for s in lines[1:]:
        if s == 'END':
            if current is not None:
                if len(current) < 3: raise ValueError('Invalid coverage ring')
                rings.append((hole, current)); current = None
            else:
                break
        elif current is None:
            hole, current = s.startswith('!'), []
        else:
            x, y = map(float, s.split()); current.append((x, y))
    if not rings or current is not None: raise ValueError('Incomplete coverage polygon')
    return rings


def polygon_contains_bbox(rings, bbox):
    """Conservative full-rectangle proof, including holes and concave edges."""
    south, west, north, east = bbox
    corners = [(west, south), (east, south), (east, north), (west, north)]
    def inside(p, ring):
        result = False
        for a, b in zip(ring, ring[1:]+ring[:1]):
            if (a[1] > p[1]) != (b[1] > p[1]) and p[0] < (b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]:
                result = not result
        return result
    def orientation(a, b, c):
        return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    def crossing(a, b, c, d):
        if max(a[0], b[0]) < min(c[0], d[0]) or max(c[0], d[0]) < min(a[0], b[0]): return False
        if max(a[1], b[1]) < min(c[1], d[1]) or max(c[1], d[1]) < min(a[1], b[1]): return False
        return orientation(a, b, c)*orientation(a, b, d) <= 0 and orientation(c, d, a)*orientation(c, d, b) <= 0
    if not all(any(not h and inside(p, r) for h, r in rings) and not any(h and inside(p, r) for h, r in rings) for p in corners):
        return False
    for _hole, ring in rings:
        if any(west <= x <= east and south <= y <= north for x, y in ring): return False
        if any(crossing(a, b, c, d) for a, b in zip(ring, ring[1:]+ring[:1])
               for c, d in zip(corners, corners[1:]+corners[:1])): return False
    return True


def build_source(pbf, polygon, *, bbox, region_id, network_id, source_url):
    import osmium  # Optional CLI-only dependency; never imported by the backend.
    if not polygon_contains_bbox(polygon_rings(polygon.read_text()), bbox):
        raise ValueError('SOURCE_POLYGON_DOES_NOT_CONTAIN_REGION')
    reader = osmium.io.Reader(str(pbf), osmium.osm.osm_entity_bits.NOTHING)
    header = reader.header(); stamp = header.get('osmosis_replication_timestamp')
    reader.close()
    if not stamp: raise ValueError('SOURCE_TIMESTAMP_MISSING')
    elements, counts = [], {'roads': 0, 'rails': 0, 'signals': 0}
    south, west, north, east = bbox
    def in_bbox(lat, lon): return south <= lat <= north and west <= lon <= east
    class Extract(osmium.SimpleHandler):
        def __init__(self):
            super().__init__(); self.missing_refs = 0
        def node(self, n):
            tags = dict(n.tags)
            if tags.get('highway') != 'traffic_signals' and tags.get('railway') != 'signal': return
            if not n.location.valid() or not in_bbox(n.location.lat, n.location.lon): return
            e = {'type': 'node', 'id': int(n.id), 'lat': n.location.lat, 'lon': n.location.lon, 'tags': tags}
            if normalize_signal(e): elements.append(e); counts['signals'] += 1
        def way(self, w):
            tags = dict(w.tags)
            road = bool(re.fullmatch(HIGHWAY_FILTER, tags.get('highway', '')))
            rail = bool(re.fullmatch(RAILWAY_FILTER, tags.get('railway', '')))
            if not road and not rail: return
            if any(not n.location.valid() for n in w.nodes):
                self.missing_refs += 1; return
            if not any(in_bbox(n.location.lat, n.location.lon) for n in w.nodes): return
            elements.append({'type': 'way', 'id': int(w.id), 'nodes': [int(n.ref) for n in w.nodes],
                'geometry': [{'lat': n.location.lat, 'lon': n.location.lon} for n in w.nodes], 'tags': tags})
            counts['roads'] += road; counts['rails'] += rail
    handler = Extract()
    handler.apply_file(str(pbf), locations=True, idx='flex_mem')
    if handler.missing_refs: raise ValueError('SOURCE_MISSING_NODE_REFERENCES')
    if not counts['roads'] or not counts['rails']: raise ValueError('SOURCE_REQUIRED_LAYER_EMPTY')
    elements.sort(key=lambda e: (e['type'], e['id']))
    digest = hashlib.sha256(json.dumps(elements, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()
    source_sha = hashlib.sha256(pbf.read_bytes()).hexdigest()
    return {'schema': 'perix-osm-source-v1', 'region_id': region_id, 'network_id': network_id,
        'bbox': list(bbox), 'elements': elements, 'elements_sha256': digest,
        'provenance': {'supplier': 'Geofabrik / OpenStreetMap', 'license': 'ODbL-1.0', 'url': source_url,
            'sha256': source_sha, 'source_timestamp': stamp, 'polygon_contains_bbox': True,
            'polygon_sha256': hashlib.sha256(polygon.read_bytes()).hexdigest(), 'missing_node_references': 0,
            'extracted_at': datetime.now(timezone.utc).isoformat()},
        'coverage': {k: {'bbox': list(bbox), 'expected': n, 'failed': 0, 'complete': True}
                     for k, n in counts.items()}}


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--pbf', type=Path, required=True); p.add_argument('--polygon', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--region-id', default='magdeburg'); p.add_argument('--network-id', default='de-magdeburg-mvb')
    p.add_argument('--bbox', type=float, nargs=4, default=[52.0, 11.45, 52.25, 11.80])
    p.add_argument('--source-url', required=True)
    a = p.parse_args()
    if a.output.exists(): raise ValueError('Refusing source overwrite')
    source = build_source(a.pbf, a.polygon, bbox=a.bbox, region_id=a.region_id,
                          network_id=a.network_id, source_url=a.source_url)
    a.output.write_text(json.dumps(source, separators=(',', ':'), allow_nan=False), encoding='utf-8')
    print(json.dumps({'output': str(a.output), 'coverage': source['coverage'], 'provenance': source['provenance'],
                      'elements_sha256': source['elements_sha256']}, indent=2))
