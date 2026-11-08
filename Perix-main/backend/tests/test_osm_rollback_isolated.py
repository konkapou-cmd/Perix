"""Synthetic, quiescent graph rollback in the supervised disposable MongoDB.

This is not a production backup utility or an atomic/live rollback procedure.
Only the fixture's PID/path-verified loopback server and unique region are used.
"""
import copy
import os
import uuid
from types import SimpleNamespace

import pytest

from test_realtime_order_isolated import isolated_collection


pytestmark = pytest.mark.skipif(
    not os.environ.get('PERIX_ISOLATED_MONGO_PID') or not os.environ.get('PERIX_ISOLATED_MONGO_DBPATH'),
    reason='Requires the explicitly verified disposable loopback MongoDB supervisor',
)


@pytest.mark.asyncio
async def test_quiescent_synthetic_graph_backup_and_restore(isolated_collection, monkeypatch):
    from mobility import osm_store

    database = isolated_collection.database
    region_id = 'synthetic_rollback_' + uuid.uuid4().hex
    other_region = 'synthetic_sentinel_' + uuid.uuid4().hex
    region = SimpleNamespace(region_id=region_id, network_id='synthetic', modes=('bus', 'tram'),
                             bbox=(52.0, 11.0, 52.1, 11.1))
    monkeypatch.setattr(osm_store, 'db', database)
    monkeypatch.setattr(osm_store, '_region', lambda _: region)
    sentinel = {'region_id': other_region, 'graph_v': 1, 'way_id': 999, 'kind': 'road'}
    await database.mobility_osm_ways.insert_one(copy.deepcopy(sentinel))

    version_number = 1
    async def fetch_ways(_tiles, mode):
        return [{'id': version_number * 10 + (1 if mode == 'bus' else 2),
                 'nodes': [101, 102], 'points': [[52.01, 11.01], [52.02, 11.02]], 'tags': {}}], 0
    async def fetch_signals(_tiles):
        return [{'id': version_number * 10 + 3, 'lat': 52.015, 'lng': 11.015, 'kinds': [], 'tags': {}}], 0
    monkeypatch.setattr(osm_store, '_fetch_quads', fetch_ways)
    monkeypatch.setattr(osm_store, '_fetch_signal_quads', fetch_signals)

    first = await osm_store.import_snapshot(region_id=region_id)
    assert first['ok'] is True
    collections = ('mobility_osm_ways', 'mobility_osm_signals', 'mobility_osm_graph_meta')
    backup = {name: await database[name].find({'region_id': region_id}).to_list(None) for name in collections}
    assert [len(backup[name]) for name in collections] == [2, 1, 1]
    assert backup['mobility_osm_graph_meta'][0]['active_v'] == first['v']

    version_number = 2
    second = await osm_store.import_snapshot(region_id=region_id)
    assert second['ok'] is True and second['v'] != first['v']
    assert await database.mobility_osm_ways.count_documents({'region_id': region_id, 'graph_v': first['v']}) == 0
    assert await database.mobility_osm_signals.count_documents({'region_id': region_id, 'graph_v': first['v']}) == 0

    # Test-only restoration with all readers/writers quiesced. This sequential
    # replacement is deliberately NOT presented as an atomic online rollback.
    for name in collections:
        await database[name].delete_many({'region_id': region_id})
        await database[name].insert_many(copy.deepcopy(backup[name]))
    for name in collections:
        restored = await database[name].find({'region_id': region_id}).to_list(None)
        assert sorted(restored, key=lambda x: str(x['_id'])) == sorted(backup[name], key=lambda x: str(x['_id']))
    assert (await database.mobility_osm_graph_meta.find_one({'region_id': region_id}))['active_v'] == first['v']
    assert await database.mobility_osm_ways.count_documents(sentinel) == 1
