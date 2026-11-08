"""Offline arithmetic audit of paired source/model diagnostic timelines.

No network, database, solver fitting or route activation. A consistent clock
flow explains a model, not the real vehicle's position or timing accuracy.
"""
import argparse
import hashlib
import json
from pathlib import Path


def audit_event(event):
    source, model = event.get('timeline'), event.get('model_timeline')
    if not isinstance(source, list) or not isinstance(model, list) or not source or len(source) != len(model):
        raise ValueError('Missing or unequal paired timelines')
    rows = []
    previous = None
    sequences = set()
    for s, m in zip(source, model):
        if (not isinstance(s, list) or len(s) != 9 or not isinstance(m, list) or len(m) != 4
                or not isinstance(s[0], str) or not s[0] or m[:2] != s[:2]
                or type(s[1]) is not int or s[1] < 0 or s[1] in sequences
                or any(type(v) is not int for v in (*s[2:6], *m[2:4]))):
            raise ValueError('Invalid occurrence identity or clock')
        if previous and s[1] <= previous[0][1]:
            raise ValueError('Unordered stop sequences')
        if s[3] < s[2] or s[5] < s[4] or m[3] < m[2]:
            raise ValueError('Departure before arrival')
        if previous and (s[2] < previous[0][3] or s[4] < previous[0][5] or m[2] < previous[1][3]):
            raise ValueError('Backwards timeline')
        sequences.add(s[1])
        row = {'stop_id': s[0], 'stop_sequence': s[1], 'source_timing_basis': s[6],
               'scheduled_arrival_s': s[2], 'scheduled_departure_s': s[3],
               'source_arrival_s': s[4], 'source_departure_s': s[5],
               'model_arrival_s': m[2], 'model_departure_s': m[3],
               'source_departure_delay_s': s[5]-s[3], 'model_departure_delay_s': m[3]-s[3],
               'arrival_model_minus_source_s': m[2]-s[4],
               'departure_model_minus_source_s': m[3]-s[5],
               'source_dwell_s': s[5]-s[4], 'model_dwell_s': m[3]-m[2]}
        if previous:
            ps, pm = previous
            carried = pm[3]-ps[5]
            source_leg, model_leg = s[4]-ps[5], m[2]-pm[3]
            delta = model_leg-source_leg
            if carried+delta != row['arrival_model_minus_source_s']:
                raise ValueError('Clock-flow arithmetic mismatch')
            row.update(from_stop_id=ps[0], carried_model_minus_source_s=carried,
                       source_leg_s=source_leg, model_leg_s=model_leg,
                       leg_duration_difference_s=delta,
                       recovered_model_excess_s=max(0, carried)-max(0, row['arrival_model_minus_source_s']))
        rows.append(row)
        previous = s, m
    return {'trip_id': event.get('trip_id'), 'version_id': event.get('version_id'),
            'service_date': event.get('service_date'), 'recorded_epoch': event.get('recorded_epoch'),
            'source_signature': event.get('source_signature'), 'rows': rows,
            'limits': ['Arithmetic over captured diagnostics, not an independent vehicle observation.',
                       'Does not validate geometry, speed limits, physical feasibility or forecast accuracy.']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise FileExistsError('Refusing to overwrite report')
    raw = args.capture.read_bytes()
    capture = json.loads(raw)
    params = capture['params']
    events = capture['data']['events']
    for event in events:
        if (event.get('trip_id'), event.get('version_id'), event.get('service_date')) != (
                params['trip_id'], params['network_version_id'], params['service_date']):
            raise ValueError('Captured event scope mismatch')
    paired = [event for event in events if event.get('timeline') and event.get('model_timeline')]
    if not paired:
        raise ValueError('No paired timelines; absence is not a passing audit')
    report = {'capture_sha256': hashlib.sha256(raw).hexdigest(), 'events': [audit_event(e) for e in paired]}
    with args.output.open('x', encoding='utf-8', newline='\n') as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write('\n')
    print(json.dumps({'report': str(args.output), 'events': len(report['events']),
                      'capture_sha256': report['capture_sha256']}))


if __name__ == '__main__':
    main()
