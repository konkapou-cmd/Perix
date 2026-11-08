"""Real Mongo regression checks on a specifically verified disposable server.

No production DB, provider calls, collection drops, or network snapshots.
The PID, exact loopback URI and dbpath must be supplied by the test supervisor.
"""
import asyncio
import os
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlsplit

import pytest
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError

from mobility.realtime_order import expected_accept, monotonic_update_pipeline


pytestmark = pytest.mark.skipif(
    not os.environ.get('PERIX_ISOLATED_MONGO_PID') or not os.environ.get('PERIX_ISOLATED_MONGO_DBPATH'),
    reason='Requires the explicitly verified disposable loopback MongoDB supervisor',
)


@pytest.fixture
async def isolated_collection():
    uri, database_name = os.environ.get('MONGO_URL', ''), os.environ.get('DB_NAME', '')
    parsed = urlsplit(uri)
    if (parsed.scheme != 'mongodb' or parsed.hostname != '127.0.0.1' or not parsed.port
            or parsed.username or parsed.password or parsed.path not in ('', '/') or parsed.query
            or not database_name.startswith('perix_ci_isolated_')):
        raise RuntimeError('Refusing non-disposable MongoDB URI or database name')
    client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=2000)
    try:
        status = await client.admin.command('serverStatus')
        options = await client.admin.command('getCmdLineOpts')
        config = options['parsed']
        if (int(status['pid']) != int(os.environ['PERIX_ISOLATED_MONGO_PID'])
                or int(config['net']['port']) != parsed.port
                or config['net']['bindIp'] != '127.0.0.1'
                or Path(config['storage']['dbPath']).resolve() != Path(os.environ['PERIX_ISOLATED_MONGO_DBPATH']).resolve()):
            raise RuntimeError('Connected MongoDB is not the supervised disposable server')
        collection = client[database_name]['order_' + uuid.uuid4().hex]
        await collection.create_index([('region_id', 1), ('network_id', 1), ('trip_id', 1)], unique=True)
        yield collection
    finally:
        client.close()


@pytest.mark.asyncio
async def test_real_mongo_network_version_keeps_its_static_archive_identity(isolated_collection, monkeypatch):
    from routes import mobility as routes
    database = isolated_collection.database
    monkeypatch.setattr(routes, 'db', database)
    monkeypatch.setattr(routes, '_get_active_network', lambda: _no_active_network())
    monkeypatch.setattr(routes, '_broadcast', lambda *_: None)
    identity = {'kind': 'GTFS_ARCHIVE', 'sha256': 'c' * 64, 'ingestion': 'DOWNLOAD'}
    result = await routes._create_network_version([], 'synthetic identity test',
        service_date='2026-11-02', static_input=identity)
    saved = await database.bus_network_versions.find_one({'version_id': result['version_id']})
    assert saved['static_input'] == identity
    assert saved['active'] is False
    assert saved['service_date'] == '2026-11-02'


async def _no_active_network():
    return None


def document(now, *, feed, trip_ts, delay=0, version='A', activation=None, day='2026-11-02'):
    return {'region_id': 'synthetic', 'network_id': 'synthetic', 'trip_id': 'trip',
            'network_version_id': version, 'service_date': day,
            'network_activation_epoch': activation if activation is not None else now - 1000,
            'feed_timestamp': feed, 'trip_update_timestamp': trip_ts,
            'delay_seconds': delay, 'label': '$literal-not-an-expression'}


@pytest.mark.asyncio
async def test_real_mongo_preserves_trip_highwater_across_missing_timestamps(isolated_collection):
    now = int(datetime.now(timezone.utc).timestamp())
    key = {'region_id': 'synthetic', 'network_id': 'synthetic', 'trip_id': 'trip'}
    updates = [
        document(now, feed=now-300, trip_ts=now-310, delay=1),
        document(now, feed=now-290, trip_ts=None, delay=2),
        document(now, feed=now-280, trip_ts=now-320, delay=99),
        document(now, feed=now-270, trip_ts=now-300, delay=3),
        document(now, feed=now-270, trip_ts=now-300, delay=88),
        document(now, feed=now-260, trip_ts=None, delay=77, version='B', activation=0),
        document(now, feed=now-250, trip_ts=None, delay=4, version='B', activation=now-255),
    ]
    for update in updates:
        previous = await isolated_collection.find_one(key)
        should_accept = expected_accept(previous, update)
        await isolated_collection.update_one(key, monotonic_update_pipeline(update), upsert=True)
        stored = await isolated_collection.find_one(key)
        if should_accept:
            assert stored['feed_timestamp'] == update['feed_timestamp']
            assert stored['delay_seconds'] == update['delay_seconds']
        else:
            assert stored == previous
        assert stored['label'] == '$literal-not-an-expression'
    assert stored['network_version_id'] == 'B' and stored['delay_seconds'] == 4
    assert await isolated_collection.count_documents(key) == 1


@pytest.mark.asyncio
async def test_real_mongo_concurrent_upserts_preserve_newest_feed(isolated_collection):
    now = int(datetime.now(timezone.utc).timestamp())
    key = {'region_id': 'synthetic', 'network_id': 'synthetic', 'trip_id': 'trip'}

    async def write(offset):
        update = document(now, feed=now-300+offset, trip_ts=None, delay=offset)
        pipeline = monotonic_update_pipeline(update)
        try:
            await isolated_collection.update_one(key, pipeline, upsert=True)
        except DuplicateKeyError:
            result = await isolated_collection.update_one(key, pipeline, upsert=False)
            assert result.matched_count == 1

    await asyncio.gather(*(write(i) for i in reversed(range(50))))
    row = await isolated_collection.find_one(key)
    assert await isolated_collection.count_documents(key) == 1
    assert row['feed_timestamp'] == now - 251 and row['delay_seconds'] == 49


@pytest.mark.asyncio
async def test_separate_worker_processes_preserve_monotonic_feed_and_persist(isolated_collection):
    now = int(datetime.now(timezone.utc).timestamp())
    key = {'region_id': 'synthetic', 'network_id': 'synthetic', 'trip_id': 'trip'}
    initial = document(now, feed=now-400, trip_ts=None, delay=-1)
    await isolated_collection.update_one(key, monotonic_update_pipeline(initial), upsert=True)
    # Each child checks the exact server PID and dbpath before touching a
    # random-name collection on the explicitly supervised disposable server.
    code = r'''
import os,sys
from pathlib import Path
from pymongo import MongoClient
from mobility.realtime_order import monotonic_update_pipeline
now,begin,end,collection=int(sys.argv[1]),int(sys.argv[2]),int(sys.argv[3]),sys.argv[4]
client=MongoClient(os.environ['MONGO_URL'],serverSelectionTimeoutMS=2000)
status=client.admin.command('serverStatus');cfg=client.admin.command('getCmdLineOpts')['parsed']
if int(status['pid'])!=int(os.environ['PERIX_ISOLATED_MONGO_PID']) or Path(cfg['storage']['dbPath']).resolve()!=Path(os.environ['PERIX_ISOLATED_MONGO_DBPATH']).resolve():
 raise RuntimeError('wrong MongoDB server')
col=client[os.environ['DB_NAME']][collection]
key={'region_id':'synthetic','network_id':'synthetic','trip_id':'trip'}
for i in reversed(range(begin,end)):
 doc={**key,'network_version_id':'A','service_date':'2026-11-02','network_activation_epoch':now-1000,
      'feed_timestamp':now-300+i,'trip_update_timestamp':None,'delay_seconds':i}
 result=col.update_one(key,monotonic_update_pipeline(doc),upsert=False)
 if result.matched_count!=1: raise RuntimeError('missing row')
client.close()
'''

    def run_child(begin):
        return subprocess.run([sys.executable, '-B', '-c', code, str(now), str(begin), str(begin+20),
                               isolated_collection.name], capture_output=True, text=True, timeout=30, env=os.environ.copy())

    results = await asyncio.gather(*(asyncio.to_thread(run_child, begin) for begin in (0, 20, 40)))
    assert all(result.returncode == 0 for result in results), [result.stderr for result in results]
    row = await isolated_collection.find_one(key)
    assert await isolated_collection.count_documents(key) == 1
    assert row['feed_timestamp'] == now-241 and row['delay_seconds'] == 59


@pytest.mark.asyncio
async def test_atomic_generation_reads_never_mix_geometry_and_infrastructure(isolated_collection, monkeypatch):
    from mobility import generations

    database = isolated_collection.database
    monkeypatch.setattr(generations, 'db', database)
    monkeypatch.setattr(generations, 'get_active_region',
                        lambda: SimpleNamespace(region_id='synthetic', network_id='synthetic'))
    collection = database.mobility_pattern_generations
    key = {'region_id': 'synthetic', 'network_id': 'synthetic', 'version_id': 'v',
           'pattern_id': 'pattern_' + uuid.uuid4().hex}
    await collection.create_index([(name, 1) for name in key], unique=True)
    def bundle(gen):
        return {**key, 'generation_id': gen, 'ready': True,
                'geometry': {'geometry_fingerprint': 'geometry-' + gen},
                'infrastructure': {'derived_generation': gen},
                'segments': [{'derived_generation': gen}]}
    await collection.replace_one(key, bundle('A'), upsert=True)

    async def writer():
        for i in range(80):
            await collection.replace_one(key, bundle('A' if i % 2 == 0 else 'B'), upsert=False)

    async def reader():
        for _ in range(80):
            value = await generations.get_pattern_generation(key['pattern_id'], key['version_id'])
            gen = value['generation_id']
            assert value['geometry']['geometry_fingerprint'] == 'geometry-' + gen
            assert value['infrastructure']['derived_generation'] == gen
            assert value['segments'][0]['derived_generation'] == gen
            assert generations.generation_matches_path(value, {'derived_generation': gen})
    await asyncio.gather(writer(), *(reader() for _ in range(3)))
    # This is a local same-document restoration, not a production rollback test.
    await collection.replace_one(key, bundle('A'), upsert=False)
    restored = await generations.get_pattern_generation(key['pattern_id'], key['version_id'])
    assert restored['generation_id'] == restored['infrastructure']['derived_generation'] == 'A'
