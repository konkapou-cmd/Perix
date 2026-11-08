"""Actual concurrent loopback HTTP calls to four independent Uvicorn workers."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

import httpx
import pytest
from test_realtime_order_isolated import isolated_collection

pytestmark = pytest.mark.skipif(
    not os.environ.get('PERIX_ISOLATED_MONGO_PID') or not os.environ.get('PERIX_ISOLATED_MONGO_DBPATH'),
    reason='Requires supervised disposable loopback MongoDB',
)


@pytest.mark.asyncio
async def test_real_v2_http_four_workers_and_stop_board_agreement(isolated_collection):
    from routes import mobility as routes
    from mobility.domain import _pattern_id, _pattern_key, build_domain
    from mobility.approach import path_fingerprint
    from mobility.roads import _haversine_m
    from tools.run_isolated_mongo_tests import free_loopback_port
    db = isolated_collection.database
    region, network_id, version = 'synthetic_http', 'synthetic-http-network', 'visual-http-v'
    points = [[52.1, 11.6], [52.1, 11.603], [52.102, 11.603]]
    lengths = [_haversine_m(*a, *b) for a, b in zip(points, points[1:])]
    total = sum(lengths)
    edges = [dict(edge_id=f'100:{i+1}:{i+2}', from_m=sum(lengths[:i]), to_m=sum(lengths[:i+1]),
        from_node=i+1, to_node=i+2,
        from_point=points[i], to_point=points[i+1], way={'railway': 'tram', 'maxspeed_kmh': 50})
        for i in range(2)]
    net = dict(version_id=version, region_id=region, network_id=network_id, timezone='Europe/Berlin',
        service_date='2026-11-02', active=True, name='Synthetic HTTP fixture', routes=[{
            'route_number': 'TEST', 'mode': 'tram', 'stops': [
                dict(stop_id='A', name='Synthetic origin', lat=points[0][0], lng=points[0][1]),
                dict(stop_id='B', name='Synthetic destination', lat=points[-1][0], lng=points[-1][1])],
            'shapes': {'shape': points}, 'trips': [dict(trip_id='t', headsign='Synthetic destination',
                start='00:01:50', end='00:03:00', shape_id='shape', stop_ids=['A', 'B'], stop_sequences=[1, 2],
                stop_times={'A': '00:01:50', 'B': '00:03:00'}, stop_times_arrival={'A': '00:01:40', 'B': '00:02:50'},
                stop_times_sequence=[dict(stop_id='A', stop_sequence=1, arrival_time='00:01:40', departure_time='00:01:50'),
                                     dict(stop_id='B', stop_sequence=2, arrival_time='00:02:50', departure_time='00:03:00')])]}])
    pid = _pattern_id('TEST', _pattern_key(net['routes'][0]['trips'][0]))
    await db.bus_network_versions.insert_one(net)
    scope = dict(region_id=region, network_id=network_id, version_id=version, pattern_id=pid)
    from mobility.generations import pattern_fingerprint
    pat=build_domain(net,network_id)['patterns'][0]
    await db.mobility_pattern_generations.insert_one({**scope, 'ready': True, 'mode': 'tram', 'generation_id': 'http-g',
        'route_number':'TEST','pattern_fingerprint':pattern_fingerprint(pat),
        'osm_snapshot_v': 1, 'geometry': {'points': points, 'source': 'OSM_RAIL',
            'geometry_fingerprint': path_fingerprint(points)}, 'segments': [dict(a_idx=0,b_idx=1,
                start_node_id=1,end_node_id=3,edge_ids=['100:1:2','100:2:3'],points=points)],
         'infrastructure': {'total_m': total, 'edges': edges, 'signals': [dict(progress_m=total*0.8,
             kinds=['RAIL_SIGNAL'], usable_for_motion=True, match_method='NODE_EXACT', signal_id='synthetic-s')]}})
    await db.visual_http_control.insert_one({'_id': 'fixture', 'now_s': 130, 'duration': 60, 'order': 100})

    root = Path(os.environ['PERIX_ISOLATED_MONGO_DBPATH']).parent
    env = {k: v for k, v in os.environ.items() if not k.startswith('MOBILITY_')}
    env.update(MOBILITY_VISUAL_PROGRESS_ENABLED='true', MOBILITY_ATOMIC_GENERATIONS_ENABLED='true',
        MOBILITY_MOTION_PREVIEW_ENABLED='true', MOBILITY_WORKERS_ENABLED='false',
        MOBILITY_REGION_ID=region, MOBILITY_NETWORK_ID=network_id,
        MOBILITY_REGION_CONFIG_JSON=json.dumps(dict(region_id=region, network_id=network_id,
            city='Synthetic', country='DE', timezone='Europe/Berlin', service_day_start_hour=4,
            bbox=[52, 11, 53, 12], agency_regex='Synthetic', modes=['tram'],
            realtime_type='NONE', static_transit_type='NONE', realtime_url='')),
        PYTHONIOENCODING='utf-8', PYTHONDONTWRITEBYTECODE='1')
    processes, logs, ports = [], [], []

    def launch(port, index):
        log = (root/f'visual-http-worker-{index}.log').open('x', encoding='utf-8')
        logs.append(log)
        proc = subprocess.Popen([sys.executable, '-B', '-m', 'uvicorn', 'visual_http_fixture_app:app',
            '--app-dir', 'tests', '--host', '127.0.0.1', '--port', str(port), '--log-level', 'warning'],
            env=env, stdout=log, stderr=subprocess.STDOUT)
        processes.append(proc)
        return proc

    def ready(port, process):
        until = time.monotonic()+35
        while time.monotonic() < until:
            if process.poll() is not None:
                raise RuntimeError('HTTP fixture worker exited; inspect isolated logs')
            try:
                with httpx.Client(timeout=1, trust_env=False) as client:
                    res = client.get(f'http://127.0.0.1:{port}/fixture/health')
                    if res.status_code == 200 and res.json()['pid'] == process.pid:
                        return
            except httpx.HTTPError:
                pass
            time.sleep(0.1)
        raise RuntimeError('HTTP fixture readiness timeout')

    def reads(paths):
        def one(job):
            port, path = job
            start = time.monotonic()
            with httpx.Client(timeout=20, trust_env=False) as c:
                r = c.get(f'http://127.0.0.1:{port}'+path)
                r.raise_for_status()
                return dict(worker_pid=int(r.headers['X-Visual-Test-Pid']), path=path,
                    elapsed_s=time.monotonic()-start, data=r.json())
        jobs = [(port, path) for port in ports for path in paths for _ in range(3)]
        with ThreadPoolExecutor(max_workers=12) as pool:
            return list(pool.map(one, jobs))

    records = []
    paths = ['/api/mobility/v2/vehicles', '/api/mobility/v2/stops/B/arrivals?platform_id=B']
    try:
        for i in range(4):
            port = free_loopback_port()
            ports.append(port)
            launch(port, i)
        for port, process in zip(ports, processes):
            await asyncio.to_thread(ready, port, process)

        async def phase(label, **control):
            if control:
                await db.visual_http_control.update_one({'_id': 'fixture'}, {'$set': control})
            requested = paths+['/api/mobility/v2/map'] if label == 'initial' else paths
            result = await asyncio.to_thread(reads, requested)
            assert {r['worker_pid'] for r in result} == {p.pid for p in processes if p.poll() is None}
            vehicles = [r['data'] for r in result if r['path'] == paths[0]]
            boards = [r['data'] for r in result if r['path'] == paths[1]]
            records.append(dict(label=label, responses=result, control=control))
            return vehicles, boards

        def agreement(fleets, boards, eta):
            assert all(len(f) == 1 for f in fleets), fleets
            assert all(len(b) == 1 for b in boards), boards
            rows = [f[0] for f in fleets]
            reference = rows[0]
            for row in rows:
                assert row['motion_plan_revision'] == reference['motion_plan_revision']
                assert row['progress_m'] == reference['progress_m']
                assert row['position'] == reference['position']
                assert row['next_stop_eta_seconds'] == eta
                assert row['motion']['model'] == 'TIME_NORMALIZED_VISUAL_ESTIMATE'
                assert row['motion']['speed_kmh'] is None
                assert row['motion']['publication_status'] == 'READY'
                preview = row['motion']['preview']
                assert preview is not None
                assert preview['schema'] == 2
                assert preview['journey_id'] == row['trip_instance_id']
                assert preview['revision'] == row['motion_plan_revision']
                assert preview['approach_geometry_fingerprint'] == path_fingerprint(points)
            for board in boards:
                assert board[0]['eta_seconds'] == eta
                assert board[0]['motion_plan_revision'] == reference['motion_plan_revision']
                assert board[0]['predicted_arrival'] == reference['next_stop_predicted_arrival']
                assert board[0]['prediction_basis'] != 'PERIX_MOTION_PLAN'
                assert board[0]['observed_arrival'] is False
            return reference

        first = agreement(*(await phase('initial')), eta=40)
        assert first['motion']['preview']['valid_until_ms']-first['motion']['preview']['sampled_at_ms']<=8000.001
        maps = [r['data'] for r in records[-1]['responses'] if r['path'] == '/api/mobility/v2/map']
        assert len(maps) == 12
        for map_data in maps:
            assert len(map_data['lines']) == 1
            line = map_data['lines'][0]
            assert line['pattern_id'] == pid and line['network_version_id'] == version
            assert line['service_date'] == '2026-11-02' and line['valid'] is True
            assert line['approach_geometry_fingerprint'] == path_fingerprint(points)
            assert line['points'] == [dict(latitude=p[0], longitude=p[1]) for p in points]
        extended = await asyncio.to_thread(reads, ['/api/mobility/v2/vehicles?visual_preview_seconds=45'])
        records.append(dict(label='extended-preview',responses=extended,control={}))
        for response in extended:
            row=response['data'][0];preview=row['motion']['preview']
            assert row['motion_plan_revision']==first['motion_plan_revision']
            assert row['progress_m']==first['progress_m']
            assert row['next_stop_predicted_arrival']==first['next_stop_predicted_arrival']
            assert 8000<preview['valid_until_ms']-preview['sampled_at_ms']<=45000
            assert preview['valid_until_ms']<=preview['effective_arrival_at_ms']
            assert len(preview['phases'])<=128
        cycle_paths = ['/api/mobility/v2/vehicles?visual_preview_seconds=45&visual_rule_version=station-cycle-v2',
                       '/api/mobility/v2/stops/B/arrivals?platform_id=B&visual_rule_version=station-cycle-v2']
        cycle_responses = await asyncio.to_thread(reads, cycle_paths)
        records.append(dict(label='station-cycle-opt-in', responses=cycle_responses, control={}))
        cycle_fleets = [r['data'] for r in cycle_responses if r['path'] == cycle_paths[0]]
        cycle_boards = [r['data'] for r in cycle_responses if r['path'] == cycle_paths[1]]
        cycle_reference = agreement(cycle_fleets, cycle_boards, eta=40)
        cycle_preview = cycle_reference['motion']['preview']
        assert cycle_preview['visual_rule_version'] == 'station-cycle-v2'
        assert cycle_preview['visual_parameters']['station_stop_lead_s'] == 30
        assert [c['stop_occurrence_index'] for c in cycle_preview['station_window']] == [0,1]
        assert cycle_preview['phases'][0]['station_cycle']['countdown_event'] == 'DEPARTURE'
        departure = cycle_preview['station_window'][1]['modeled_departure_at_ms']
        assert departure-cycle_preview['station_window'][1]['modeled_arrival_at_ms'] == 30000
        for board in cycle_boards:
            assert board[0]['countdown_event'] == 'DEPARTURE'
            assert board[0]['countdown_target_at_ms'] == departure
            assert board[0]['motion_plan_revision'] == cycle_reference['motion_plan_revision']
        assert cycle_reference['motion_plan_revision'] != first['motion_plan_revision']
        delayed = agreement(*(await phase('delayed', duration=240, order=101)), eta=220)
        assert delayed['progress_m'] == first['progress_m']
        assert delayed['motion']['visual_context']['optical_delay_allocation'] == 'UPCOMING_MAPPED_APPROACHES'
        assert delayed['motion']['visual_context']['active_spatial_strength'] > 0.35
        earlier = agreement(*(await phase('earlier', duration=45, order=102)), eta=25)
        assert earlier['progress_m'] == first['progress_m']
        # Restart one HTTP worker, not the database; it must reload the same shared anchor.
        processes[0].terminate()
        await asyncio.to_thread(processes[0].wait, 15)
        replacement = launch(ports[0], 'restart')
        # Keep the active worker list distinct from the preserved exited process.
        processes[0], processes[-1] = replacement, processes[0]
        await asyncio.to_thread(ready, ports[0], replacement)
        restored = agreement(*(await phase('worker-restarted')), eta=25)
        assert restored['motion_plan_revision'] == earlier['motion_plan_revision']
        near = agreement(*(await phase('approach-target', now_s=152)), eta=3)
        for fleet in [r['data'] for r in records[-1]['responses'] if r['path'] == paths[0]]:
            preview = fleet[0]['motion']['preview']
            assert preview['valid_until_ms'] == preview['effective_arrival_at_ms']
            assert preview['phases'][-1]['p1'] == pytest.approx(total)
        at_stop = agreement(*(await phase('visual-target', now_s=155)), eta=0)
        assert at_stop['distance_to_next_stop_m'] == 0
        assert at_stop['progress_m'] == pytest.approx(total)
        assert at_stop['timing_evidence']['observed_arrival'] is False
        after_zero = agreement(*(await phase('source-dwell-after-zero', now_s=156)), eta=0)
        assert after_zero['progress_m'] == pytest.approx(total)
        assert after_zero['distance_to_next_stop_m'] == 0
        assert after_zero['motion']['state'] == 'VISUAL_STOP_ESTIMATE'

        await db.mobility_pattern_generations.update_one(scope, {'$set': {'ready': False}})
        fleets, boards = await phase('geometry-not-ready', now_s=130)
        assert all(not f for f in fleets)
        assert all(len(b) == 1 and b[0]['eta_seconds'] == 25 for b in boards)
        # Recovery with a NEW atomic generation, without /map warming. Each
        # worker may hide one initial stale-path sample, then ordinary polling
        # must reload compatible geometry and republish the current estimate.
        await db.mobility_pattern_generations.update_one(scope, {'$set': {'ready': True, 'generation_id': 'http-g2'}})
        fleets, boards = await phase('generation-recovery-first-poll', now_s=135)
        assert all(len(f) <= 1 for f in fleets)
        assert all(len(b) == 1 and b[0]['eta_seconds'] == 20 for b in boards)
        recovered = agreement(*(await phase('generation-recovered')), eta=20)
        assert 0 < recovered['progress_m'] < total
        assert recovered['position']['source'].endswith('_ESTIMATE')
        fleets, boards = await phase('canceled', canceled=True, order=103)
        assert all(not f for f in fleets) and all(not b for b in boards)
        report = dict(transport='loopback TCP HTTP, actual V2 routes on four independent Uvicorn processes',
            phases=records, response_count=sum(len(p['responses']) for p in records),
            map_geometry={'points': points, 'fingerprint': path_fingerprint(points), 'length_m': total},
            synthetic_only=True, source_fixture_boundary='accepted source reader and request service clock',
            limits=['Not server.py startup/migrations, hosted staging, capacity or browser/device rendering.',
                    'Controlled identical service clocks and synthetic accepted forecasts; not live GPS or forecast accuracy.'])
        with (root/'visual-http-report.json').open('x', encoding='utf-8') as stream:
            json.dump(report, stream, indent=2, allow_nan=False)
    finally:
        for p in processes:
            if p.poll() is None:
                p.terminate()
                await asyncio.to_thread(p.wait, 15)
        for log in logs:
            log.close()
