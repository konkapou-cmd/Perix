"""Read-only passenger API audit. Records evidence; never changes provider/GPS data."""
import argparse
import asyncio
from collections import Counter
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import time
from urllib.parse import quote

import httpx


def meters(a, b):
    lat1, lng1, lat2, lng2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    x = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lng2-lng1)/2)**2
    return 12742000 * math.asin(min(1, math.sqrt(x)))


async def main(args):
    args.output.mkdir(parents=True, exist_ok=False)
    failures, samples, timings = [], [], []
    same_revision_checks = 0
    semaphore = asyncio.Semaphore(3)
    async with httpx.AsyncClient(base_url=args.origin.rstrip('/'), timeout=75) as client:
        async def get(path):
            async with semaphore:
                started = time.monotonic()
                response = await client.get(path)
                timings.append({'path': path, 'status': response.status_code,
                                'seconds': round(time.monotonic()-started, 3)})
                response.raise_for_status()
                return response.json()

        mapping = await get('/api/mobility/v2/map')
        (args.output/'map.json').write_text(json.dumps(mapping), encoding='utf-8')
        platforms = {str(p['platform_id']): (s, p) for s in mapping['stops'] for p in s.get('platforms', [])}
        for round_index in range(args.rounds):
            fleet = await get('/api/mobility/v2/vehicles')
            (args.output/f'fleet-{round_index}.json').write_text(json.dumps(fleet), encoding='utf-8')
            targets = {}
            for vehicle in fleet:
                sid = str(vehicle.get('next_stop_id'))
                if sid in platforms:
                    stop, platform = platforms[sid]
                    targets[(stop['stop_id'], sid)] = (stop, platform)
                mode = vehicle.get('mode')
                speed = (vehicle.get('motion') or {}).get('speed_kmh')
                if isinstance(speed, (int, float)) and not 0 <= speed <= (100 if mode=='bus' else 90):
                    failures.append({'kind':'impossible_speed', 'vehicle':vehicle['vehicle_id'], 'speed':speed})
                eta = vehicle.get('next_stop_eta_seconds')
                distance = vehicle.get('distance_to_next_stop_m')
                if vehicle.get('estimated') and eta == 0 and isinstance(distance, (int, float)) and distance > 1:
                    failures.append({'kind':'fleet_zero_before_stop', 'vehicle':vehicle['vehicle_id'], 'distance':distance})
                if vehicle.get('estimated') and isinstance(eta, (int,float)) and eta > 0 and isinstance(distance, (int,float)):
                    required = distance / eta * 3.6
                    if required > (105 if mode=='bus' else 95):
                        failures.append({'kind':'impossible_remaining_time','vehicle':vehicle['vehicle_id'],
                                         'required_kmh':round(required,1),'distance':distance,'eta':eta})
                lines = [l for l in mapping['lines'] if l.get('pattern_id') == vehicle.get('pattern_id')]
                if lines and sid not in {str(s.get('stop_id')) for l in lines for s in l.get('stops', [])}:
                    failures.append({'kind':'next_platform_not_on_pattern', 'vehicle':vehicle['vehicle_id'], 'platform':sid})

            selected = list(targets.items())[:args.stops]
            async def board(key):
                stop_id, platform_id = key
                path = '/api/mobility/v2/stops/'+quote(stop_id,safe='')+'/arrivals?platform_id='+quote(platform_id,safe='')
                return await get(path)
            boards = await asyncio.gather(*(board(key) for key, _ in selected))
            for (key, (stop, platform)), rows in zip(selected, boards):
                record = {'round':round_index,'stop_id':key[0],'platform_id':key[1], 'name':stop['name'], 'arrivals':rows}
                samples.append(record)
                if any(r.get('platform_id') != key[1] for r in rows):
                    failures.append({'kind':'wrong_direction_platform_leak','stop':key[0],'requested':key[1]})
                for row in rows:
                    eta = row.get('eta_seconds')
                    if not isinstance(eta, (int,float)) or eta < 0:
                        failures.append({'kind':'unknown_or_negative_eta','trip':row.get('trip_instance_id')})
                    if row.get('eta_source') == 'PERIX_ESTIMATE' and (not row.get('motion_plan_revision') or not row.get('source_predicted_arrival')):
                        failures.append({'kind':'model_without_provenance','trip':row.get('trip_instance_id')})
                    if eta == 0 and row.get('position_source') != 'LIVE':
                        distance = row.get('distance_to_stop_m')
                        if isinstance(distance, (int,float)) and distance > 50:
                            failures.append({'kind':'zero_far_from_platform','trip':row.get('trip_instance_id'), 'distance':distance,'platform':key[1]})
            # Details are selected from real fleet identities only.
            detail_vehicles = [v for v in fleet if v.get('motion_plan_revision')][:4]
            details = await asyncio.gather(*(get('/api/mobility/vehicles/'+quote(v['vehicle_id'],safe='')+'/trip') for v in detail_vehicles))
            for vehicle, detail in zip(detail_vehicles, details):
                if str(detail.get('trip_id')) != str(vehicle.get('trip_id')):
                    continue  # Legitimate trip handover between HTTP requests.
                index = detail.get('next_timeline_index')
                if type(index) is int and 0 <= index < len(detail.get('stops',[])):
                    upcoming = detail['stops'][index]
                    if upcoming.get('skipped'):
                        failures.append({'kind':'skipped_next_platform','vehicle':vehicle['vehicle_id']})
                    if detail.get('motion_plan_revision') == vehicle.get('motion_plan_revision'):
                        # The vehicle may legitimately reach its next platform
                        # between requests without changing the plan revision.
                        # Compare the SAME occurrence, not two current-next stops.
                        fleet_index = vehicle.get('next_timeline_index')
                        comparable = detail['stops'][fleet_index] if type(fleet_index) is int and 0 <= fleet_index < len(detail['stops']) else None
                        same_revision_checks += int(comparable is not None)
                        if comparable and comparable.get('predicted') != vehicle.get('next_stop_predicted_arrival'):
                            failures.append({'kind':'same_plan_clock_mismatch','vehicle':vehicle['vehicle_id']})
            (args.output/f'details-{round_index}.json').write_text(json.dumps(details), encoding='utf-8')
            if round_index + 1 < args.rounds:
                await asyncio.sleep(args.interval)
        (args.output/'boards.json').write_text(json.dumps(samples), encoding='utf-8')
        all_rows = [r for s in samples for r in s['arrivals']]
        summary = {'observed_at':datetime.now(timezone.utc).isoformat(), 'origin':args.origin,
                   'rounds':args.rounds,'last_fleet_size':len(fleet), 'map_lines':len(mapping['lines']),
                   'platform_boards':len(samples), 'arrival_rows':len(all_rows),
                   'eta_sources':dict(Counter(r.get('eta_source') for r in all_rows)),
                   'same_revision_occurrence_checks':same_revision_checks,
                   'zero_rows':sum(r.get('eta_seconds') == 0 for r in all_rows),
                   'zero_rows_without_position':sum(r.get('eta_seconds') == 0 and r.get('distance_to_stop_m') is None for r in all_rows),
                   'zero_evidence':[{'platform':r.get('platform_id'),'trip':r.get('trip_instance_id'),
                                    'distance_m':r.get('distance_to_stop_m'),'eta_source':r.get('eta_source')}
                                    for r in all_rows if r.get('eta_seconds') == 0],
                   'max_request_seconds':max(t['seconds'] for t in timings),
                   'failures':failures, 'timings':timings,
                   'caveat':'Sampled internal model consistency, not field/GPS verification. No observed zero rows is not proof of zero correctness.'}
        (args.output/'summary.json').write_text(json.dumps(summary,indent=2), encoding='utf-8')
        print(json.dumps(summary,indent=2))
        if failures:
            raise SystemExit(1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--rounds', type=int, default=3)
    parser.add_argument('--stops', type=int, default=10)
    parser.add_argument('--interval', type=float, default=5)
    asyncio.run(main(parser.parse_args()))
