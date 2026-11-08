"""Independent Python workers using shared optical state on disposable MongoDB."""
import asyncio
import json
import os
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
from urllib.parse import urlsplit
import uuid

import pytest
from test_realtime_order_isolated import isolated_collection


pytestmark = pytest.mark.skipif(
    not os.environ.get('PERIX_ISOLATED_MONGO_PID') or not os.environ.get('PERIX_ISOLATED_MONGO_DBPATH'),
    reason='Requires supervised PID/path-verified disposable loopback MongoDB',
)


def directed_fixture(region,mode='tram'):
    from test_mobility_motion_bus_tram import _edges
    from mobility.direction_contract import build_direction_contract
    from mobility.generations import pattern_fingerprint
    from mobility.roads import _haversine_m
    points=[[52.1,11.6],[52.1,11.603],[52.102,11.603]]
    cumulative=[0.0]
    for a,b in zip(points,points[1:]):cumulative.append(cumulative[-1]+_haversine_m(*a,*b))
    pattern=dict(mode=mode,route_number='9',direction='B',stop_ids=['A','B'],shape_id=None,points=[])
    scope=dict(region_id=region,network_id='synthetic',version_id='v',pattern_id='p')
    segments=[dict(a_idx=0,b_idx=1,start_node_id=1,end_node_id=3,edge_ids=['100:1:2','101:2:3'],points=points)]
    contract=build_direction_contract(scope=scope,pattern=pattern,points=points,segments=segments,
        platforms=[dict(platform_id=s,latitude=p[0],longitude=p[1]) for s,p in zip(['A','B'],[points[0],points[-1]])])
    edges=_edges()
    for i,edge in enumerate(edges):edge.update(from_m=cumulative[i],to_m=cumulative[i+1],way_id=100+i,from_node=i+1,to_node=i+2)
    source='OSM_ROADS' if mode=='bus' else 'OSM_RAIL'
    fp=pattern_fingerprint(pattern)
    bundle={**scope,'ready':True,'generation_id':'g','mode':mode,'route_number':'9','pattern_fingerprint':fp,
        'geometry':{'points':points,'source':source},'segments':segments,'direction_contract':contract,
        'infrastructure':{'total_m':cumulative[-1],'edges':edges,'signals':[]}}
    path=dict(pattern_id='p',derived_generation='g',geometry_source=source,points=points,cumulative=cumulative,
        stop_progress=contract['stop_progress_m'],total_m=cumulative[-1],route_number='9',
        direction_contract=contract,pattern_fingerprint=fp)
    return path,bundle


def worker(raw):
    """Child entry point; all output is synthetic, never production GPS."""
    from motor.motor_asyncio import AsyncIOMotorClient
    from mobility.motion.visual_runtime import visual_position, clear_visual_cache
    args = json.loads(raw)
    uri, name = os.environ['MONGO_URL'], os.environ['DB_NAME']
    url = urlsplit(uri)
    if url.hostname != '127.0.0.1' or url.username or not name.startswith('perix_ci_isolated_'):
        raise RuntimeError('Refusing non-disposable DB')

    async def run():
        client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=2000)
        try:
            status = await client.admin.command('serverStatus')
            opts = (await client.admin.command('getCmdLineOpts'))['parsed']
            if (int(status['pid']) != int(os.environ['PERIX_ISOLATED_MONGO_PID'])
                    or Path(opts['storage']['dbPath']).resolve() != Path(os.environ['PERIX_ISOLATED_MONGO_DBPATH']).resolve()
                    or opts['net']['bindIp'] != '127.0.0.1' or opts['net']['port'] != url.port):
                raise RuntimeError('Wrong supervised MongoDB')
            from test_mobility_motion_bus_tram import _edges
            import mobility.generations as generations
            # Use this child's separately verified Motor client for atomic reads.
            generations.db = client[name]
            region = SimpleNamespace(region_id=args['region'], network_id='synthetic', motion={}, timezone='Europe/Berlin')
            if args.get('mode') == 'bus':
                import mobility.traffic_profiles as traffic_profiles
                traffic_profiles.db = client[name]
                traffic_profiles.get_region = lambda _: region
            path,_ = directed_fixture(args['region'],args.get('mode','tram'))
            path['service_date']=args.get('day','2026-11-02')
            timeline = [dict(stop_id='A', stop_sequence=1, predicted_arrival=100, predicted_departure=110),
                        dict(stop_id='B', stop_sequence=2, predicted_arrival=110+args['duration'],
                             predicted_departure=120+args['duration'])]
            output = []
            for i in range(10):
                if i == 5:
                    clear_visual_cache()  # No local history after this boundary.
                s = await visual_position(trip_id='t', mode=args.get('mode', 'tram'), version_id='v', timeline=timeline,
                    path=path, now_s=args['now'], now_epoch=1793650000, region=region,
                    source_order=(0, args['order']), state_collection=client[name][args['collection']])
                output.append(None if s is None else {k: s[k] for k in (
                    'progress_m', 'revision', 'next_stop_eta_seconds', 'marker_visible')})
                if s and args.get('mode') == 'bus':
                    output[-1]['visual_context'] = s['visual_context']
            return output
        finally:
            client.close()
    print(json.dumps(asyncio.run(run()), allow_nan=False))


def waiting_worker(raw):
    """Real shared-CAS waiting, deliberately independent of a worker's cache."""
    from motor.motor_asyncio import AsyncIOMotorClient
    from test_station_relative_patch import plan
    from mobility.motion.visual_shared_state import resolve_shared_visual_plan
    from mobility.motion.visual_progress import sample_visual_plan
    args = json.loads(raw)
    uri, name = os.environ['MONGO_URL'], os.environ['DB_NAME']
    url = urlsplit(uri)
    if url.hostname != '127.0.0.1' or url.username or not name.startswith('perix_ci_isolated_'):
        raise RuntimeError('Refusing non-disposable waiting DB')

    async def run():
        client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=2000)
        try:
            status = await client.admin.command('serverStatus')
            opts = (await client.admin.command('getCmdLineOpts'))['parsed']
            if (int(status['pid']) != int(os.environ['PERIX_ISOLATED_MONGO_PID'])
                    or Path(opts['storage']['dbPath']).resolve() != Path(os.environ['PERIX_ISOLATED_MONGO_DBPATH']).resolve()
                    or opts['net']['bindIp'] != '127.0.0.1' or opts['net']['port'] != url.port):
                raise RuntimeError('Wrong supervised waiting MongoDB')
            output = []
            for _ in range(10):
                source = plan(args['c_delay'], conditional=args.get('conditional', False))
                if args.get('rule_version') == 'station-cycle-v2':
                    # The 30s dwell needs a feasible incoming window. Keep the
                    # short legacy fixture above unchanged for v1 tests.
                    from test_station_cycle_clock import plan as cycle_plan
                    delay = args['c_delay']
                    source = cycle_plan((100,200,300+delay,400+delay),conditional=args.get('conditional',False))
                accepted = await resolve_shared_visual_plan(source, client[name][args['collection']],
                    source_order=(0, args['order']), now_s=args['now'])
                output.append(sample_visual_plan(accepted, args['now']) if accepted else None)
            return output
        finally:
            client.close()
    print(json.dumps(asyncio.run(run()), allow_nan=False))


def run_workers(args, count=4, *, entry='worker'):
    if entry not in ('worker', 'waiting_worker'):
        raise ValueError('Unknown isolated worker entry point')
    code = f"import sys; sys.path.insert(0, 'tests'); from test_visual_multiworker_isolated import {entry}; {entry}(sys.argv[1])"
    inputs = args if isinstance(args, list) else [args]*count
    children = [subprocess.Popen([sys.executable, '-B', '-c', code, json.dumps(item)],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', env=os.environ.copy())
        for item in inputs]
    try:
        results = []
        for child in children:
            stdout, stderr = child.communicate(timeout=45)
            assert child.returncode == 0, stderr
            results.append(json.loads(stdout))
        return results
    finally:
        for child in children:
            if child.poll() is None:
                child.terminate()
                child.wait(timeout=10)


@pytest.mark.asyncio
async def test_four_processes_share_rebases_ordering_and_restart_without_local_history(isolated_collection):
    from test_mobility_motion_bus_tram import _edges
    db = isolated_collection.database
    region = 'synthetic_visual_'+uuid.uuid4().hex
    collection_name = 'visual_'+uuid.uuid4().hex
    path,bundle=directed_fixture(region)
    await db.mobility_pattern_generations.insert_one(bundle)
    args = dict(region=region, collection=collection_name, duration=60, order=100, now=130)
    phases = []

    async def phase(**changes):
        params = {**args, **changes}
        outputs = await asyncio.to_thread(run_workers, params)
        flat = [row for process in outputs for row in process]
        assert all(row == flat[0] for row in flat)  # 40 exact same-clock samples.
        phases.append(dict(parameters=params, processes=4, reads=40, result=flat[0]))
        return flat[0]

    first = await phase()
    assert first['next_stop_eta_seconds'] == 40
    delayed = await phase(duration=240, order=101)
    assert delayed['progress_m'] == pytest.approx(first['progress_m'])
    assert delayed['next_stop_eta_seconds'] == 220
    assert delayed['revision'] != first['revision']
    state = await db[collection_name].find_one({})
    assert await phase(duration=60, order=100) is None  # Delayed old source cannot rewind state.
    assert await db[collection_name].find_one({}) == state
    earlier = await phase(duration=45, order=102)
    assert earlier['progress_m'] == pytest.approx(delayed['progress_m'])
    assert earlier['next_stop_eta_seconds'] == 25
    assert await phase(duration=45, order=102) == earlier  # Fresh interpreter processes, same anchor.
    at_stop = await phase(duration=45, order=102, now=155)
    assert at_stop['progress_m'] == path['stop_progress'][-1] and at_stop['next_stop_eta_seconds'] == 0
    assert await db[collection_name].count_documents({}) == 1
    # Equal metadata order but different target clocks is ambiguous, not a new update.
    assert await phase(duration=70, order=102) is None
    # An unchanged target on a newer feed still advances the ordering watermark.
    assert await phase(duration=45, order=103) == earlier
    assert await phase(duration=60, order=102) is None
    # Older and newer source packets compete at the SAME time from independent
    # interpreters. Either may win first, but the newer accepted order must win
    # finally and no subsequent old read may undo it.
    racing_args = [{**args, 'duration': 240 if i % 2 == 0 else 80, 'order': 104 if i % 2 == 0 else 105}
                   for i in range(4)]
    racing = await asyncio.to_thread(run_workers, racing_args)
    state = await db[collection_name].find_one({})
    assert state['source_order'] == [0, 105]
    assert state['source_windows'][1][2] == 190
    newest = await phase(duration=80, order=105)
    assert newest['progress_m'] == pytest.approx(earlier['progress_m'])
    assert newest['next_stop_eta_seconds'] == 60
    assert await phase(duration=240, order=104) is None
    report = dict(scope='synthetic independent processes; no hosted load or physical accuracy claim',
        phases=phases, processes_per_phase=4, total_independent_processes=4*len(phases),
        total_samples=40*len(phases), single_shared_state=True,
        mixed_source_race={'independent_processes': 4, 'samples': 40,
                           'winning_source_order': state['source_order'], 'outputs': racing})
    path = Path(os.environ['PERIX_ISOLATED_MONGO_DBPATH']).parent/'visual-multiworker-report.json'
    with path.open('x', encoding='utf-8') as stream:
        json.dump(report, stream, indent=2, allow_nan=False)


@pytest.mark.asyncio
async def test_four_bus_processes_freeze_real_static_profile_lookup(isolated_collection):
    from test_mobility_motion_bus_tram import _edges
    db = isolated_collection.database
    region = 'synthetic_bus_'+uuid.uuid4().hex
    collection_name = 'visual_bus_'+uuid.uuid4().hex
    path,bundle=directed_fixture(region,'bus')
    bundle['infrastructure']['signals']=[dict(progress_m=400,kinds=['ROAD_SIGNAL'],
        usable_for_motion=True,match_method='NODE_EXACT',signal_id='synthetic-s')]
    await db.mobility_pattern_generations.insert_one(bundle)
    await db.mobility_traffic_profiles.insert_one(dict(region_id=region, network_id='synthetic',
        way_id=101, osm_direction='BOTH', profile_key='synthetic-counts', profile_version='v1',
        model='BPR_V1_UNCALIBRATED', calibrated=False, buckets={'all': dict(day_type='WEEKDAY',
            interval_start='00:00', interval_end='24:00', expected_speed_kmh=7)}))
    args = dict(region=region, collection=collection_name, duration=60, order=100, now=130, mode='bus')
    outputs = await asyncio.to_thread(run_workers, args)
    flat = [row for process in outputs for row in process]
    assert flat[0] is not None and all(row == flat[0] for row in flat)
    assert flat[0]['visual_context']['traffic_edge_counts'] == [1]
    assert flat[0]['visual_context']['traffic_profile_versions'] == ['v1']
    assert flat[0]['next_stop_eta_seconds'] == 40
    assert await db[collection_name].count_documents({}) == 2  # Context + anchor.
    # Database changes cannot alter an in-flight template on fresh processes.
    await db.mobility_traffic_profiles.update_one({'region_id': region},
        {'$set': {'profile_version': 'v2', 'buckets.all.expected_speed_kmh': 35}})
    again = await asyncio.to_thread(run_workers, args)
    assert all(row == flat[0] for process in again for row in process)
    delayed = await asyncio.to_thread(run_workers, {**args, 'duration': 240, 'order': 101})
    rows = [row for process in delayed for row in process]
    assert rows[0] is not None and all(row == rows[0] for row in rows)
    assert rows[0]['progress_m'] == pytest.approx(flat[0]['progress_m'])
    assert rows[0]['next_stop_eta_seconds'] == 220
    assert rows[0]['visual_context']['traffic_profile_versions'] == ['v1']
    assert rows[0]['visual_context']['optical_delay_allocation'] == 'UPCOMING_MAPPED_APPROACHES'
    assert rows[0]['visual_context']['active_spatial_strength'] > 0.35
    evidence = dict(scope='synthetic static profiles, four real Python processes per phase',
        phases=3, responses=120, initial=flat[0], delayed=rows[0],
        limits=['Not hosted load, live traffic coverage, full app rendering or observed vehicle motion.'])
    path = Path(os.environ['PERIX_ISOLATED_MONGO_DBPATH']).parent/'visual-bus-context-report.json'
    with path.open('x', encoding='utf-8') as stream:
        json.dump(evidence, stream, indent=2, allow_nan=False)


@pytest.mark.asyncio
async def test_four_processes_share_b_wait_without_double_charging_c_delay(isolated_collection):
    collection_name = 'visual_wait_'+uuid.uuid4().hex
    collection = isolated_collection.database[collection_name]
    records = []

    async def phase(c_delay, order, now):
        args = dict(collection=collection_name, c_delay=c_delay, order=order, now=now)
        outputs = await asyncio.to_thread(run_workers, args, entry='waiting_worker')
        flat = [row for process in outputs for row in process]
        assert all(row == flat[0] for row in flat)
        records.append(dict(parameters=args, processes=4, samples=len(flat), result=flat[0]))
        return flat[0]

    first = await phase(0, 100, 110)
    delayed = await phase(30, 101, 110)
    assert delayed['progress_m'] == first['progress_m']
    waiting = await phase(30, 102, 140)
    assert waiting['progress_m'] == 100
    assert waiting['wait_state']['modeled_departure_s'] == 155
    assert waiting['wait_state']['waited_s'] == 20
    repeated = await phase(30, 103, 140)
    assert repeated == waiting
    extended = await phase(60, 104, 140)
    assert extended['wait_state']['modeled_departure_s'] == 185
    assert extended['wait_state']['waited_s'] == 20
    departing = await phase(60, 104, 186)
    assert 100 < departing['progress_m'] < 200
    assert departing['next_stop_eta_seconds'] == 19
    assert await phase(30, 103, 186) is None
    assert await collection.count_documents({}) == 1
    state = await collection.find_one({})
    assert state['source_windows'][1][3] == 125
    assert state['source_windows'][2][2] == 205
    assert state['wait_state']['1']['modeled_departure_s'] == 185
    path = Path(os.environ['PERIX_ISOLATED_MONGO_DBPATH']).parent/'visual-station-wait-report.json'
    with path.open('x', encoding='utf-8') as stream:
        json.dump(dict(synthetic_only=True, phases=records, single_shared_state=True), stream, indent=2, allow_nan=False)


@pytest.mark.asyncio
async def test_four_processes_require_relevant_update_to_release_conditional_wait(isolated_collection):
    collection_name = 'visual_conditional_wait_'+uuid.uuid4().hex

    async def phase(now, order, *, conditional=True, c_delay=0):
        args = dict(collection=collection_name, c_delay=c_delay, conditional=conditional, order=order, now=now)
        outputs = await asyncio.to_thread(run_workers, args, entry='waiting_worker')
        flat = [row for process in outputs for row in process]
        assert all(row == flat[0] for row in flat)
        return flat[0]

    assert (await phase(122, 100))['state'] == 'VISUAL_STOP_ESTIMATE'
    waiting = await phase(130, 101)
    assert waiting['progress_m'] == 100
    assert waiting['wait_state']['release_condition'] == 'RELEVANT_SOURCE_UPDATE'
    released = await phase(130, 102, conditional=False, c_delay=5)
    assert released['progress_m'] == 100
    assert released['wait_state']['release_condition'] == 'KNOWN_DEPARTURE'
    assert (await phase(131, 102, conditional=False, c_delay=5))['progress_m'] > 100


@pytest.mark.asyncio
async def test_four_processes_share_station_cycle_clocks_and_cold_platform_lock(isolated_collection):
    collection_name = 'visual_cycle_v2_'+uuid.uuid4().hex
    async def phase(now, order, c_delay=0):
        args = dict(collection=collection_name,c_delay=c_delay,order=order,now=now,rule_version='station-cycle-v2')
        outputs = await asyncio.to_thread(run_workers,args,entry='waiting_worker')
        flat = [row for process in outputs for row in process]
        assert flat[0] is not None and all(row == flat[0] for row in flat)
        return flat[0]
    at_platform = await phase(171,100)
    assert at_platform['state'] == 'VISUAL_STOP_ESTIMATE' and at_platform['progress_m'] == 100
    delayed = await phase(171,101,30)
    assert delayed['progress_m'] == 100
    assert delayed['revision'] != at_platform['revision']
    cold = await phase(172,102,30)
    assert cold['progress_m'] == 100
    state = await isolated_collection.database[collection_name].find_one({})
    assert state['source_windows'][1][3] == 200
    assert state['wait_state']['1']['modeled_departure_s'] == 230
    assert await isolated_collection.database[collection_name].count_documents({}) == 1
