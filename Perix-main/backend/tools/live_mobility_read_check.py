"""Bounded GET-only production observation; no deployment or accuracy claim.

Captures only estimated (virtual) fleet records, never real GPS/driver data.
Four serial fleet samples, one map/stops read, up to three stop-board reads.
"""
import collections
import datetime as dt
import hashlib
import json
import math
import time
from pathlib import Path

import httpx

BASE = 'https://app.perix.eu/api/mobility/v2/'


def distance(a, b):
    lat, lon, lat2, lon2 = map(math.radians, (*a, *b))
    v = math.sin((lat2-lat)/2)**2 + math.cos(lat)*math.cos(lat2)*math.sin((lon2-lon)/2)**2
    return 6371000 * 2 * math.asin(min(1, math.sqrt(v)))


def main():
    import argparse
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', type=Path, required=True)
    args = p.parse_args()
    if args.output.exists():
        raise FileExistsError('Refusing overwrite')
    observations = []
    report = {'origin': BASE, 'observations': observations, 'limits': [
        'Virtual estimates only; no GPS or independent physical-position verification.',
        'Sequential requests have clock skew and may use different workers or model revisions.',
        'No load test, deployment, configuration mutation, or licence sign-off.']}
    with httpx.Client(timeout=60) as client:
        def get(path):
            start = time.time()
            r = client.get(BASE+path, headers={'Cache-Control': 'no-cache'})
            r.raise_for_status()
            return {'path': path, 'request_epoch': start, 'response_epoch': time.time(),
                    'sha256': hashlib.sha256(r.content).hexdigest(), 'payload': r.json()}
        report['network'] = get('networks')
        report['map'] = get('map')
        report['stops'] = get('stops')
        for index in range(4):
            if index:
                time.sleep(8)  # a bounded sampling experiment, not background polling
            sample = get('vehicles')
            fleet = [v for v in sample.pop('payload') if v.get('estimated') is True]
            sample['virtual_fleet'] = fleet
            sample['publication_counts'] = dict(collections.Counter(
                (v.get('motion') or {}).get('publication_status') or 'UNSPECIFIED' for v in fleet))
            sample['fallback_counts'] = dict(collections.Counter(
                (v.get('motion') or {}).get('fallback_reason') or 'NONE' for v in fleet))
            observations.append(sample)
        fleet = observations[-1]['virtual_fleet']
        ready = [v for v in fleet if (v.get('motion') or {}).get('publication_status') == 'READY']
        selected = sorted(ready, key=lambda v: (v.get('motion', {}).get('state') != 'MOVING',
                                               v.get('next_stop_eta_seconds') or 99999))[:3]
        report['board_checks'] = []
        for v in selected:
            sid = str(v.get('next_stop_id') or '')
            if not sid.isalnum():
                continue
            board = get('stops/'+sid+'/arrivals')
            matches = [a for a in board['payload'] if a.get('trip_instance_id') == v.get('trip_instance_id')
                       and str(a.get('platform_id')) == sid]
            board['comparison'] = {'vehicle_id': v['vehicle_id'], 'platform_id': sid,
                'vehicle_eta_seconds': v.get('next_stop_eta_seconds'),
                'vehicle_plan_revision': v.get('motion_plan_revision'), 'matching_arrivals': matches,
                'elapsed_since_fleet_response_s': board['response_epoch']-observations[-1]['response_epoch']}
            report['board_checks'].append(board)
        report['motion_deltas'] = []
        for a, b in zip(observations, observations[1:]):
            prior = {v['vehicle_id']: v for v in a['virtual_fleet']}
            for v in b['virtual_fleet']:
                old = prior.get(v['vehicle_id'])
                if not old:
                    continue
                pos, last = v.get('position') or {}, old.get('position') or {}
                if any(type(x.get(k)) not in (float, int) for x in (pos, last) for k in ('latitude', 'longitude')):
                    continue
                elapsed = b['response_epoch']-a['response_epoch']
                report['motion_deltas'].append({'vehicle_id': v['vehicle_id'],
                    'route': v.get('route'), 'elapsed_s': elapsed,
                    'displacement_m': distance((pos['latitude'], pos['longitude']), (last['latitude'], last['longitude'])),
                    'progress_delta_m': v['progress_m']-old['progress_m'] if isinstance(v.get('progress_m'), (float,int))
                        and isinstance(old.get('progress_m'), (float,int)) else None,
                    'old_eta': old.get('next_stop_eta_seconds'), 'new_eta': v.get('next_stop_eta_seconds'),
                    'same_next_stop': old.get('next_stop_id') == v.get('next_stop_id'),
                    'same_revision': old.get('motion_plan_revision') == v.get('motion_plan_revision'),
                    'old_state': (old.get('motion') or {}).get('state'), 'new_state': (v.get('motion') or {}).get('state'),
                    'publication_status': (v.get('motion') or {}).get('publication_status'),
                    'feed_changed': old.get('realtime_feed_timestamp') != v.get('realtime_feed_timestamp')})
    report['completed_utc'] = dt.datetime.now(dt.timezone.utc).isoformat()
    with args.output.open('x', encoding='utf-8') as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2, allow_nan=False)
    print(json.dumps({'report': str(args.output), 'completed_utc': report['completed_utc'],
        'samples': [{k: s[k] for k in ('publication_counts','fallback_counts')} for s in observations],
        'board_matches': [len(b['comparison']['matching_arrivals']) for b in report['board_checks']],
        'delta_count': len(report['motion_deltas'])}))


if __name__ == '__main__':
    main()
