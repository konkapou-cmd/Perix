"""Start an owned loopback-only synthetic diagram/API review, never production.

Creates a NEW directory/database; requires hash-pinned local mongod. No app
startup migrations, external maps, provider requests, user data or deployments.
Terminate this supervisor to finish; it only stops processes it started.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools.run_isolated_mongo_tests import sha256_file, start_server, stop_owned_server, free_loopback_port


def seed(db):
    # Imports use a non-listening DB; only the explicit supervisor client writes.
    os.environ['MONGO_URL'] = 'mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=50'
    os.environ['DB_NAME'] = 'offline_review_builder'
    from routes import mobility
    from mobility.domain import _pattern_id
    from mobility.approach import path_fingerprint
    from mobility.roads import _haversine_m
    region, network, version = 'synthetic_http', 'synthetic-http-network', 'visual-http-v'
    points = [[52.1, 11.6], [52.1, 11.603], [52.102, 11.603]]
    lengths = [_haversine_m(*a, *b) for a,b in zip(points,points[1:])]
    edges = [dict(edge_id=f'100:{i+1}:{i+2}', from_m=sum(lengths[:i]), to_m=sum(lengths[:i+1]),
        from_point=points[i], to_point=points[i+1], way={'railway':'tram','maxspeed_kmh':50}) for i in range(2)]
    trip = dict(trip_id='t', headsign='Synthetic destination', start='00:01:50', end='00:03:00',
        shape_id='shape', stop_ids=['A','B'], stop_sequences=[1,2],
        stop_times={'A':'00:01:50','B':'00:03:00'}, stop_times_arrival={'A':'00:01:40','B':'00:02:50'},
        stop_times_sequence=[dict(stop_id='A',stop_sequence=1,arrival_time='00:01:40',departure_time='00:01:50'),
                             dict(stop_id='B',stop_sequence=2,arrival_time='00:02:50',departure_time='00:03:00')])
    db.bus_network_versions.insert_one(dict(version_id=version, region_id=region, network_id=network,
        timezone='Europe/Berlin', service_date='2026-11-02', active=True, name='Synthetic visual review',
        routes=[dict(route_number='TEST',mode='tram',shapes={'shape':points},trips=[trip],stops=[
            dict(stop_id='A',name='Synthetic origin',lat=points[0][0],lng=points[0][1]),
            dict(stop_id='B',name='Synthetic destination',lat=points[-1][0],lng=points[-1][1])])]))
    db.mobility_pattern_generations.insert_one(dict(region_id=region,network_id=network,version_id=version,
        pattern_id=_pattern_id('TEST','shape'),ready=True,mode='tram',generation_id='http-g',osm_snapshot_v=1,
        geometry={'points':points,'source':'OSM_RAIL','geometry_fingerprint':path_fingerprint(points)},segments=[],
        infrastructure={'total_m':sum(lengths),'edges':edges,'signals':[]}))
    db.visual_http_control.insert_one(dict(_id='fixture',now_s=130,duration=45,order=100,
        running=False,canceled=False,hidden=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mongod',type=Path,required=True)
    parser.add_argument('--mongod-sha256',required=True)
    parser.add_argument('--workdir',type=Path,required=True)
    args = parser.parse_args()
    binary = args.mongod.resolve(strict=True)
    if sha256_file(binary) != args.mongod_sha256.lower():
        raise ValueError('MongoDB executable hash mismatch')
    root = args.workdir.resolve()
    root.mkdir(exist_ok=False)
    dbpath = root/'db'
    dbpath.mkdir()
    assets = root/'review'
    assets.mkdir()
    backend = Path(__file__).resolve().parents[1]
    builder = backend.parent/'frontend/tests/build-visual-review.cjs'
    subprocess.run([shutil.which('node'),str(builder),str(assets)],check=True)
    mongo = client = server = log = None
    try:
        mongo,client,mongo_port,status = start_server(binary,dbpath,root/'mongo.log')
        database = 'perix_ci_isolated_'+uuid.uuid4().hex[:12]
        seed(client[database])
        port = free_loopback_port()
        env = {k:v for k,v in os.environ.items() if not k.startswith('MOBILITY_')}
        env.update(MONGO_URL=f'mongodb://127.0.0.1:{mongo_port}', DB_NAME=database,
            PERIX_ISOLATED_MONGO_PID=str(mongo.pid),PERIX_ISOLATED_MONGO_DBPATH=str(dbpath),
            PERIX_VISUAL_REVIEW_ROOT=str(assets),PYTHONDONTWRITEBYTECODE='1',PYTHONIOENCODING='utf-8',
            MOBILITY_VISUAL_PROGRESS_ENABLED='true',MOBILITY_ATOMIC_GENERATIONS_ENABLED='true',
            MOBILITY_MOTION_PREVIEW_ENABLED='true',MOBILITY_WORKERS_ENABLED='false',
            MOBILITY_REGION_ID='synthetic_http',MOBILITY_NETWORK_ID='synthetic-http-network',
            MOBILITY_REGION_CONFIG_JSON=json.dumps(dict(region_id='synthetic_http',network_id='synthetic-http-network',
                city='Synthetic',country='DE',timezone='Europe/Berlin',service_day_start_hour=4,
                bbox=[52,11,53,12],agency_regex='Synthetic',modes=['tram'],realtime_type='NONE',static_transit_type='NONE')))
        log = (root/'http.log').open('x',encoding='utf-8')
        server = subprocess.Popen([sys.executable,'-B','-m','uvicorn','visual_review_app:app','--app-dir','tests',
            '--host','127.0.0.1','--port',str(port),'--log-level','warning'],cwd=backend,env=env,stdout=log,stderr=subprocess.STDOUT)
        report = dict(url=f'http://127.0.0.1:{port}/review',owned_http_pid=server.pid,
            owned_mongo_pid=mongo.pid,database=database,mongo_version=status['version'],
            limits=['Local synthetic diagram, actual API/animation helpers, not full production screens or GPS.'])
        with (root/'review-session.json').open('x',encoding='utf-8') as stream:
            json.dump(report,stream,indent=2)
        print(json.dumps(report),flush=True)
        server.wait()
    finally:
        if server and server.poll() is None:
            server.terminate()
            server.wait(timeout=15)
        if log:
            log.close()
        if mongo and client:
            stop_owned_server(mongo,client)


if __name__ == '__main__':
    main()
