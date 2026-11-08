"""Restore only the captured transit model on a verified disposable MongoDB.

Samples the candidate's actual V2 handlers at the real wall clock, with no
source/clock mocks. No production DB connection, full app data or importer.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid
import zipfile

from bson import decode_all, json_util, BSON
import hashlib
from run_isolated_mongo_tests import sha256_file, start_server, stop_owned_server


def child():
    import asyncio
    import faulthandler
    import cProfile
    faulthandler.enable()
    faulthandler.dump_traceback_later(25, repeat=True)
    async def run():
        from database import client
        from routes import mobility as routes  # Match server.py's router import order.
        from mobility import v2
        from mobility.motion import visual_runtime
        samples = []
        profiler = cProfile.Profile() if os.getenv('PERIX_RELEASE_PROFILE') else None
        if profiler:profiler.enable()
        for index in range(2):
            start = time.monotonic()
            initial = os.getenv('PERIX_RELEASE_INITIAL_SYNC_FIRST') == '1' and index == 0
            rows = await v2.v2_vehicles(None, initial_sync=initial, visual_preview_seconds=45,
                visual_rule_version='station-relative-v1')
            estimated = [r for r in rows if r.get('estimated')]
            assert estimated and all(r['motion']['model'] == 'TIME_NORMALIZED_VISUAL_ESTIMATE' for r in estimated)
            assert all(r['motion']['observed_arrival'] is False for r in estimated)
            samples.append(dict(duration_s=time.monotonic()-start, vehicles=len(estimated), initial_sync=initial,
                ready=sum((r.get('motion') or {}).get('publication_status') == 'READY' for r in estimated),
                modes={m:sum(r['mode']==m for r in estimated) for m in ('bus','tram')},
                visible=sum(r.get('position',{}).get('latitude') is not None for r in estimated),
                cached_plans=len(visual_runtime._PLANS),cached_segments=sum(p['size'] for p in visual_runtime._PLANS.values()),
                source_statuses=sorted({str(r.get('timing_evidence',{}).get('source_status')) for r in estimated})))
        from mobility.public_sources import data_sources, osm_derived, public_generation
        from database import db
        notice = await data_sources()
        assert notice.status_code == 200 and b'ODbL' in notice.body and b'not measured GPS' in notice.body
        export = await osm_derived()
        chunks = [chunk async for chunk in export.body_iterator]
        offered = json.loads(''.join(c.decode() if isinstance(c, bytes) else c for c in chunks))
        expected = []
        for network in await routes.networks_for_journey_window():
            async for row in db.mobility_pattern_generations.find({'version_id':network['version_id']}):
                clean = public_generation(row)
                if clean is not None:expected.append(clean)
        assert offered['licence'] == 'ODbL-1.0' and offered['patterns']
        assert sorted(offered['patterns'], key=lambda p:p['generation_id']) == sorted(expected,key=lambda p:p['generation_id'])
        samples.append(dict(source_notice_and_export_verified=True, exported_patterns=len(expected)))
        client.close()
        if profiler:
            profiler.disable()
            profiler.dump_stats(os.environ['PERIX_RELEASE_PROFILE'])
        faulthandler.cancel_dump_traceback_later()
        return samples
    print(json.dumps(asyncio.run(run())))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--release', type=Path, required=True)
    p.add_argument('--candidate-backend', type=Path, required=True)
    p.add_argument('--mongod', type=Path, required=True)
    p.add_argument('--mongod-sha256', required=True)
    p.add_argument('--attempt', type=int, default=1)
    p.add_argument('--initial-sync-first', action='store_true', help='Exercise the existing first-snapshot budget, then a normal full poll')
    p.add_argument('--route-limit', type=int, default=0, help='Diagnostic subset only; not a full-fleet pass')
    args = p.parse_args()
    assert sha256_file(args.mongod) == args.mongod_sha256
    work = args.release/('disposable-real-data-validation-'+str(args.attempt))
    work.mkdir(exist_ok=False)
    data = work/'db';data.mkdir()
    process, client, port, _ = start_server(args.mongod, data, work/'mongo.log')
    try:
        name = 'perix_ci_isolated_release_'+uuid.uuid4().hex[:10]
        db = client[name]
        restored = {}
        with zipfile.ZipFile(args.release/'production-mobility-private-backup.zip') as archive:
            catalog = json_util.loads(archive.read('catalog.json'))
            for collection, meta in catalog['collections'].items():
                rows = decode_all(archive.read(collection+'.bson'))
                col = db.create_collection(collection)
                if rows:col.insert_many(rows)
                for index in meta['indexes']:
                    if index['name'] != '_id_':
                        col.create_index(list(index['key'].items()), **{k:v for k,v in index.items() if k not in ('key','v','ns')})
                actual = list(col.find({}).sort('_id',1))
                assert hashlib.sha256(b''.join(BSON.encode(r) for r in actual)).hexdigest() == meta['sha256']
                restored[collection] = len(actual)
        if args.route_limit:
            network = db.bus_network_versions.find_one({'active': True})
            db.bus_network_versions.update_one({'_id':network['_id']}, {'$set': {'routes':network['routes'][:args.route_limit]}})
        env = {k:v for k,v in os.environ.items() if not k.startswith('MOBILITY_')}
        env.update(MONGO_URL=f'mongodb://127.0.0.1:{port}', DB_NAME=name,
            MOBILITY_REGION_ID='magdeburg',MOBILITY_NETWORK_ID='de-magdeburg-mvb',
            MOBILITY_WORKERS_ENABLED='false', MOBILITY_VISUAL_PROGRESS_ENABLED='true',
            MOBILITY_ATOMIC_GENERATIONS_ENABLED='true', MOBILITY_MOTION_ENABLED='true',
            MOBILITY_MOTION_PREVIEW_ENABLED='true',MOBILITY_GOOGLE_TRAFFIC_ENABLED='false',PYTHONDONTWRITEBYTECODE='1')
        if args.route_limit:env['PERIX_RELEASE_PROFILE'] = str(work/'candidate-profile.pstats')
        if args.initial_sync_first:env['PERIX_RELEASE_INITIAL_SYNC_FIRST'] = '1'
        else:env.pop('PERIX_RELEASE_INITIAL_SYNC_FIRST', None)
        code = f"import sys;sys.path.insert(0,{str(Path(__file__).parent)!r});from validate_production_mobility_snapshot import child;child()"
        try:
            result = subprocess.run([sys.executable,'-B','-c',code],cwd=args.candidate_backend,env=env,
                capture_output=True,text=True,encoding='utf-8',timeout=180)
        except subprocess.TimeoutExpired as exc:
            text = lambda value: value.decode('utf-8',errors='replace') if isinstance(value,bytes) else (value or '')
            (work/'candidate-timeout.log').write_text(text(exc.stdout)+'\n'+text(exc.stderr),encoding='utf-8')
            raise
        (work/'candidate-output.log').write_text(result.stdout+'\n'+result.stderr,encoding='utf-8')
        assert result.returncode == 0, 'Candidate validation failed; inspect private log'
        samples = json.loads(result.stdout.strip().splitlines()[-1])
        report = dict(restored_bson_hashes_equal=True, collections=restored, samples=samples, diagnostic_route_limit=args.route_limit,
            limits=['Real captured transit model, actual wall clock, no source/clock mocks.',
                    'Disposable local MongoDB 7; production is MongoDB 8.',
                    'Not a full database/volume backup or hosted capacity proof.'])
        (args.release/'real-mobility-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        print(json.dumps(report))
    finally:
        stop_owned_server(process, client)


if __name__ == '__main__':
    main()
