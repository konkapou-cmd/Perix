"""Bounded hosted staging GET smoke, NOT a production-capacity certification."""
import argparse
import asyncio
import json
import math
from pathlib import Path
import time

import httpx
from visual_staging_ops import remote, DATABASE, ORIGIN


def metrics():
    return remote('DATABASE='+repr(DATABASE)+'\n'+r'''
import json,time
from pathlib import Path
assert os.environ['DB_NAME']==DATABASE
assert os.getenv('MOBILITY_WORKERS_ENABLED')=='false'
assert os.getenv('MOBILITY_GOOGLE_TRAFFIC_ENABLED')=='false'
root=Path('/sys/fs/cgroup')
def number(name):
 try:return int((root/name).read_text().strip())
 except (OSError,ValueError):return None
try:cpu=dict(line.split() for line in (root/'cpu.stat').read_text().splitlines())
except OSError:cpu={}
print(json.dumps(dict(deployment=os.getenv('RAILWAY_DEPLOYMENT_ID'),epoch=time.time(),
 memory_current_bytes=number('memory.current'),memory_peak_bytes=number('memory.peak'),
 memory_max_bytes=number('memory.max'),cpu_usage_usec=int(cpu['usage_usec']) if 'usage_usec' in cpu else None)))
''')


async def reads(readers, rounds):
    records = []
    stop = asyncio.Event()
    async def reader(index):
        async with httpx.AsyncClient(base_url=ORIGIN, timeout=20, trust_env=False) as client:
            async def get(path):
                start = time.monotonic()
                try:
                    response = await client.get(path)
                except httpx.HTTPError as exc:
                    records.append(dict(reader=index, path=path, status=None,
                        duration_s=time.monotonic()-start, bytes=0, error=type(exc).__name__))
                    stop.set()
                    return None
                records.append(dict(reader=index, path=path, status=response.status_code,
                    duration_s=time.monotonic()-start, bytes=len(response.content)))
                if response.status_code != 200:
                    stop.set()
                return response
            # One map and one board per reader, then real 8-second fleet cadence.
            for path in ('/api/mobility/v2/map', '/api/mobility/v2/stops/QA_bus_B/arrivals'):
                if stop.is_set(): return
                await get(path)
            begin = time.monotonic()
            for i in range(rounds):
                if i:
                    await asyncio.sleep(max(0, begin+i*8-time.monotonic()))
                if stop.is_set(): return
                await get('/api/mobility/v2/vehicles?motion_preview=true')
    await asyncio.gather(*(reader(i) for i in range(readers)))
    return records


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--release', type=Path, required=True)
    p.add_argument('--readers', type=int, default=5, choices=range(1, 6))
    p.add_argument('--rounds', type=int, default=4, choices=range(1, 5))
    args = p.parse_args()
    before = metrics()
    records = asyncio.run(reads(args.readers, args.rounds))
    after = metrics()
    assert before['deployment'] == after['deployment'], 'Deployment changed during experiment'
    endpoints = {}
    for path in sorted({r['path'] for r in records}):
        samples = sorted(r['duration_s'] for r in records if r['path'] == path)
        percentile = lambda q: samples[max(0, math.ceil(len(samples)*q)-1)]
        endpoints[path] = dict(requests=len(samples), p50_s=percentile(.5), p95_s=percentile(.95), p99_s=percentile(.99))
    report = dict(origin=ORIGIN, readers=args.readers, rounds=args.rounds, records=records,
        metrics_before=before, metrics_after=after, endpoints=endpoints,
        http_errors=sum(r['status'] != 200 for r in records),
        limits=['Small QA dataset; at most five virtual readers from one client machine.',
                'Not the proposed 50/150-client capacity test, multi-worker hosting, or DB CPU test.',
                'Cgroup values are container metrics, including SSH diagnostics, not precise per-request CPU.'])
    fleet = endpoints.get('/api/mobility/v2/vehicles?motion_preview=true')
    map_reads = endpoints.get('/api/mobility/v2/map')
    report['gates'] = dict(no_http_errors=report['http_errors'] == 0,
        fleet_p95_under_800ms=bool(fleet and fleet['p95_s'] < .8),
        map_p95_under_2s=bool(map_reads and map_reads['p95_s'] < 2))
    report['gates_passed'] = all(report['gates'].values())
    if before['cpu_usage_usec'] is not None and after['cpu_usage_usec'] is not None:
        report['mean_container_cpu_cores'] = (after['cpu_usage_usec']-before['cpu_usage_usec'])/1e6/(after['epoch']-before['epoch'])
    with (args.release/'staging-read-smoke.json').open('x', encoding='utf-8') as f:
        json.dump(report, f, indent=2)
    print(json.dumps({k:v for k,v in report.items() if k != 'records'}))
    if not report['gates_passed']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
