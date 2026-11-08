"""Count exact OSM signal-node occurrences on audited offline edge chains.

Signal-node presence is map data only. It does not show phase, direction,
vehicle stops, delay, real traffic or an operator-confirmed route.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools.audit_region_overpass import inspect_snapshot


def signal_occurrences(candidate, signals):
    mode = candidate.get('mode')
    kind = {'bus': 'ROAD_SIGNAL', 'tram': 'RAIL_SIGNAL'}.get(mode)
    if kind is None or candidate.get('status') != 'CANDIDATE_REVIEW_ONLY':
        raise ValueError('unsupported or incomplete candidate')
    by_id = {s['id']: s for s in signals if kind in s['kinds']}
    ids, previous = [], None
    for i, segment in enumerate(candidate.get('segments') or []):
        if segment.get('a_idx') != i or segment.get('b_idx') != i + 1:
            raise ValueError('invalid segment order')
        if previous is not None and segment.get('start_node_id') != previous:
            raise ValueError('disconnected edge chain')
        edges = segment.get('edge_ids') or []
        if previous is None:
            ids.append(segment.get('start_node_id'))
        for edge in edges:
            try: _, start, end = map(int, str(edge).split(':'))
            except (TypeError, ValueError): raise ValueError('invalid edge ID') from None
            if not ids or ids[-1] != start:
                raise ValueError('edge-node discontinuity')
            ids.append(end)
        if not ids or ids[-1] != segment.get('end_node_id'):
            raise ValueError('segment endpoint mismatch')
        previous = segment.get('end_node_id')
    if not ids:
        raise ValueError('empty edge chain')
    hits = [node for node in ids if node in by_id]
    return {'signal_kind': kind, 'exact_signal_node_occurrences': len(hits),
            'unique_exact_signal_nodes': len(set(hits)), 'exact_signal_node_ids': sorted(set(hits))}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('osm-raw', 'osm-audit', 'candidates', 'candidate-audit', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args(argv)
    if args.output.exists(): raise FileExistsError('Refusing to overwrite report')
    raw_bytes, audit_bytes, candidate_bytes, candidate_audit_bytes = (p.read_bytes() for p in
        (args.osm_raw, args.osm_audit, args.candidates, args.candidate_audit))
    raw, source_audit, candidates, candidate_audit = map(json.loads,
        (raw_bytes, audit_bytes, candidate_bytes, candidate_audit_bytes))
    sha = lambda data: hashlib.sha256(data).hexdigest()
    scope = candidates['scope']
    if (source_audit['raw_sha256'] != sha(raw_bytes)
            or source_audit['ways_view_sha256'] != candidates['provenance']['osm_sha256']
            or source_audit['osm_base'] != scope['osm_base']
            or source_audit['declared_bbox'] != scope['declared_osm_bbox']
            or candidate_audit['input_candidates_sha256'] != sha(candidate_bytes)
            or candidate_audit['scope'] != scope
            or candidate_audit['counts']['technical_issue_patterns'] != 0):
        raise ValueError('source or candidate audit identity mismatch')
    signals = inspect_snapshot(raw, scope['declared_osm_bbox'])['signals']
    results, counts = [], Counter()
    for candidate in candidates['patterns']:
        measurement = signal_occurrences(candidate, signals)
        counts['patterns'] += 1
        if measurement['exact_signal_node_occurrences']: counts['patterns_with_mode_signal_nodes'] += 1
        counts['mode_signal_node_occurrences'] += measurement['exact_signal_node_occurrences']
        results.append({'pattern_id': candidate['pattern_id'], 'mode': candidate['mode'],
                        'route_number': candidate['route_number'], **measurement})
    if len(results) != scope['selected_patterns']:
        raise ValueError('candidate pattern count mismatch')
    out = {'scope': scope, 'counts': dict(counts), 'patterns': results,
           'source_raw_sha256': sha(raw_bytes), 'candidates_sha256': sha(candidate_bytes),
           'limits': ['Only exact signal nodes on the candidate edge chain are counted.',
                      'No inference of signal phase, delay, vehicle stop, actual track or physical accuracy.',
                      'The candidate geometry itself remains unverified and is not activated.']}
    with args.output.open('x', encoding='utf-8', newline='\n') as f:
        json.dump(out, f, ensure_ascii=False, indent=2, allow_nan=False); f.write('\n')
    print(json.dumps({'report': str(args.output), **out['counts']}, ensure_ascii=True))


if __name__ == '__main__': main()
