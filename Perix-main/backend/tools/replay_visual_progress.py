"""Offline visual normalization over dated, audited candidate geometry.

No provider request, database write, activation or passenger publication.
Uses existing per-mode physics solely as an optical curve template.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools.audit_source_model_clock_flow import audit_event
# This existing offline helper enforces a non-listening DB and disables live
# providers in this CLI process before importing any runtime infrastructure.
from tools.replay_candidate_motion import build_offline_infra, build_timeline, REGION
from tools.rebuild_transit_offline import parse_osm
from mobility.motion.tram import build_tram_leg
from mobility.motion.bus import build_bus_leg
from mobility.motion.config import motion_config_for
from mobility.motion.visual_progress import build_visual_plan, sample_visual_plan


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('capture', 'network', 'map', 'osm', 'candidates', 'output'):
        parser.add_argument('--'+name, type=Path, required=True)
    parser.add_argument('--region-id', required=True)
    parser.add_argument('--network-id', required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise FileExistsError('Refusing report overwrite')
    raw = {name: getattr(args, name).read_bytes() for name in ('capture', 'network', 'map', 'osm', 'candidates')}
    data = {k: json.loads(v) for k, v in raw.items()}
    hashes = {k: hashlib.sha256(v).hexdigest() for k, v in raw.items()}
    candidates = data['candidates']
    for key in ('network', 'map', 'osm'):
        if candidates['provenance'][key+'_sha256'] != hashes[key]:
            raise ValueError('Candidate provenance mismatch: '+key)
    params = data['capture']['params']
    events = [e for e in data['capture']['data']['events'] if e.get('timeline') and e.get('model_timeline')]
    if len(events) != 1:
        raise ValueError('Exactly one paired event required')
    event = events[0]
    audit_event(event)
    if (event.get('region_id'), event.get('network_id')) != (args.region_id, args.network_id):
        raise ValueError('Explicit region/network must match captured event')
    scope = candidates['scope']
    if (event['trip_id'], event['version_id'], event['service_date']) != (
            params['trip_id'], params['network_version_id'], params['service_date']):
        raise ValueError('Event capture scope mismatch')
    if (scope['network_version_id'], scope['service_date']) != (event['version_id'], event['service_date']):
        raise ValueError('Dated source scope mismatch')
    lines = [l for l in data['map']['lines'] if l['pattern_id'] == event['pattern_id']
             and l.get('network_version_id') == event['version_id'] and l.get('service_date') == event['service_date']]
    patterns = [p for p in candidates['patterns'] if p['pattern_id'] == event['pattern_id']]
    if len(lines) != 1 or len(patterns) != 1:
        raise ValueError('Ambiguous pattern identity')
    line, candidate = lines[0], patterns[0]
    timeline = build_timeline(data['network'], line, event['trip_id'])
    if len(timeline) != len(event['timeline']):
        raise ValueError('Stop occurrence count mismatch')
    for entry, source in zip(timeline, event['timeline']):
        if (entry['stop_id'], entry['stop_sequence'], entry['scheduled_arrival'], entry['scheduled_departure']) != tuple(source[:4]):
            raise ValueError('Static occurrence identity or timetable mismatch')
        entry.update(predicted_arrival=source[4], predicted_departure=source[5],
                     timing_basis=source[6], departure_timing_basis=source[6])
    infra, progress, audit = build_offline_infra(candidate, line, parse_osm(data['osm'], scope['declared_osm_bbox']))
    config = {**motion_config_for(line['mode'], REGION), 'max_speed_kmh': 50.0,
              'road_signal_enabled': False, 'rail_signal_enabled': False}
    profiles = []
    for i, (start, end) in enumerate(zip(progress, progress[1:])):
        kwargs = dict(edges=infra['edges'], signals=[], start_m=start, end_m=end,
                      departure_service_s=timeline[i]['predicted_departure'], config=config)
        profiles.append(build_tram_leg(**kwargs) if line['mode'] == 'tram'
                        else build_bus_leg(**kwargs, traffic_by_edge={}))
    plan = build_visual_plan(identity=dict(region_id=args.region_id,
        network_id=args.network_id, version_id=event['version_id'], service_date=event['service_date'],
        trip_id=event['trip_id'], pattern_id=event['pattern_id'], geometry_fingerprint=hashlib.sha256(
            json.dumps(candidate['points'], separators=(',', ':')).encode()).hexdigest()),
        timeline=timeline, stop_progress=progress, profiles=profiles)
    rows = []
    for i, leg in enumerate(plan['legs']):
        samples = [sample_visual_plan(plan, leg['departure_s']+(leg['arrival_s']-leg['departure_s'])*j/20)
                   for j in range(21)]
        positions = [s['progress_m'] for s in samples if s and s['marker_visible']]
        endpoint = sample_visual_plan(plan, leg['arrival_s'])
        rows.append(dict(from_stop=line['stops'][i]['name'], to_stop=line['stops'][i+1]['name'],
            from_index=i, natural_template_duration_s=profiles[i]['duration_s'],
            source_duration_s=leg['arrival_s']-leg['departure_s'],
            hidden_reason=leg['hidden_reason'], samples=len(samples),
            finite_monotone=all(a <= b for a, b in zip(positions, positions[1:])),
            target_progress_error_m=abs(endpoint['progress_m']-progress[i+1])
                if endpoint and endpoint['marker_visible'] else None,
            eta_at_target_s=endpoint['next_stop_eta_seconds'] if endpoint else None))
    report = dict(input_sha256=hashes, identity=plan['identity'], revision=plan['revision'],
        physics_template_cap_kmh=50, edge_audit=audit, source_clocks_unchanged=plan['timeline'] == timeline,
        legs=rows, limits=['Offline candidate geometry, not the original deployed generation or GPS.',
            'Time-normalized optical progress, NOT a physical-speed guarantee.',
            'No observed signals, traffic, added dwell, deployment or realtime API integration.'])
    with args.output.open('x', encoding='utf-8', newline='\n') as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write('\n')
    print(json.dumps({'report': str(args.output), 'legs': len(rows),
        'hidden': sum(bool(r['hidden_reason']) for r in rows),
        'exact_endpoint_and_zero_eta': sum(r['target_progress_error_m'] == 0 and r['eta_at_target_s'] == 0 for r in rows),
        'source_clocks_unchanged': report['source_clocks_unchanged']}))


if __name__ == '__main__':
    main()
