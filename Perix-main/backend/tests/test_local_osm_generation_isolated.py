"""Captured patterns through the actual builder, in disposable MongoDB.

The single Overpass response is injected as a test-only source, not a certified
PBF import or release candidate. No production service or provider is called.
"""
import asyncio
import hashlib
import json
import os
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from test_realtime_order_isolated import isolated_collection


pytestmark = pytest.mark.skipif(
    not all(os.environ.get(k) for k in ('PERIX_ISOLATED_MONGO_PID', 'PERIX_ISOLATED_MONGO_DBPATH',
        'PERIX_LOCAL_OSM_RAW', 'PERIX_LOCAL_OSM_AUDIT', 'PERIX_LOCAL_OSM_WAYS',
        'PERIX_LOCAL_NETWORK', 'PERIX_LOCAL_CANDIDATES')),
    reason='Requires supervised disposable MongoDB and explicitly supplied offline OSM evidence',
)


def load_bytes(name):
    data = Path(os.environ[name]).read_bytes()
    return data, json.loads(data)


@pytest.mark.asyncio
async def test_captured_osm_real_builder_patterns(isolated_collection, monkeypatch):
    from mobility import generations, infrastructure, osm_store
    from mobility.domain import build_domain
    from mobility.geometry_audit import audit_generation_bundle
    from tools.audit_region_overpass import inspect_snapshot

    raw_bytes, raw = load_bytes('PERIX_LOCAL_OSM_RAW')
    _, source_audit = load_bytes('PERIX_LOCAL_OSM_AUDIT')
    way_bytes, ways_payload = load_bytes('PERIX_LOCAL_OSM_WAYS')
    network_bytes, network = load_bytes('PERIX_LOCAL_NETWORK')
    candidate_bytes, candidates = load_bytes('PERIX_LOCAL_CANDIDATES')
    sha = lambda data: hashlib.sha256(data).hexdigest()
    assert sha(raw_bytes) == source_audit['raw_sha256']
    assert sha(way_bytes) == source_audit['ways_view_sha256'] == candidates['provenance']['osm_sha256']
    assert sha(network_bytes) == candidates['provenance']['network_sha256']
    assert raw['osm3s']['timestamp_osm_base'] == ways_payload['osm3s']['timestamp_osm_base'] == candidates['scope']['osm_base']
    assert source_audit['declared_bbox'] == candidates['scope']['declared_osm_bbox'] == [52.0, 11.45, 52.25, 11.8]
    assert network['version_id'] == candidates['scope']['network_version_id']
    source = inspect_snapshot(raw, source_audit['declared_bbox'])
    assert len(source['layers']['bus']) == source_audit['counts']['road_ways']
    assert len(source['layers']['tram']) == source_audit['counts']['rail_ways']
    assert len(source['signals']) == source_audit['counts']['signal_nodes']

    database = isolated_collection.database
    # Mirror the relevant application-startup indexes; the generic test_db
    # fixture only creates booking indexes. Without these, 31k upserts become
    # collection scans and a timeout cannot represent normal indexed operation.
    await database.mobility_osm_ways.create_index(
        [('way_id', 1), ('region_id', 1), ('kind', 1), ('graph_v', 1)], unique=True)
    await database.mobility_osm_ways.create_index([('region_id', 1), ('kind', 1), ('graph_v', 1)])
    await database.mobility_osm_signals.create_index([('signal_id', 1), ('region_id', 1), ('graph_v', 1)], unique=True)
    await database.mobility_osm_signals.create_index(
        [('region_id', 1), ('graph_v', 1), ('latitude', 1), ('longitude', 1)])
    await database.mobility_pattern_generations.create_index(
        [('region_id', 1), ('network_id', 1), ('version_id', 1), ('pattern_id', 1)], unique=True)
    region = SimpleNamespace(region_id='magdeburg', network_id='de-magdeburg-mvb',
        bbox=(52.0, 11.45, 52.25, 11.8), modes=('bus', 'tram'), timezone='Europe/Berlin', motion={})
    monkeypatch.setattr(osm_store, 'db', database)
    monkeypatch.setattr(generations, 'db', database)
    monkeypatch.setattr(osm_store, '_region', lambda _: region)
    monkeypatch.setattr(generations, 'get_active_region', lambda: region)
    monkeypatch.setattr(infrastructure, 'get_region', lambda _: region)
    monkeypatch.setattr(osm_store, '_fetch_quads', AsyncMock(side_effect=lambda quadrants, mode: (source['layers'][mode], 0)))
    monkeypatch.setattr(osm_store, '_fetch_signal_quads', AsyncMock(return_value=(source['signals'], 0)))
    import_started = time.monotonic()
    imported = await osm_store.import_snapshot(region_id='magdeburg')
    import_elapsed = time.monotonic() - import_started
    assert imported['ok'] is True
    assert imported['roads'] == source_audit['counts']['road_ways']
    assert imported['rails'] == source_audit['counts']['rail_ways']
    assert imported['signals'] == source_audit['counts']['signal_nodes']

    network = {**network, 'region_id': region.region_id, 'network_id': region.network_id}
    domain = build_domain(network, region.network_id)
    baseline = {(x['pattern_id'], x['mode']): x for x in candidates['patterns']}
    all_patterns = os.environ.get('PERIX_LOCAL_OSM_ALL') == '1'
    wanted = (sorted(baseline) if all_patterns else
              [('N8:2bfdf50506', 'tram'), ('2:1ebda54deb', 'tram'),
               ('N5:14ef0cbce5', 'bus'), ('52:75afb29eba', 'bus')])
    assert len(baseline) == len(candidates['patterns'])
    platform_map = generations._platforms_by_id(domain)
    semaphore = asyncio.Semaphore(3)

    async def build_one(pid, mode):
        async with semaphore:
            try:
                patterns = [p for p in domain['patterns'] if p['pattern_id'] == pid and p['mode'] == mode]
                if len(patterns) != 1:
                    return {'pattern_id': pid, 'mode': mode, 'error': 'AMBIGUOUS_PATTERN_IDENTITY'}
                pat = patterns[0]
                build_started = time.monotonic()
                result = await generations.build_pattern_generation(network=network, domain=domain, pattern=pat,
                    reason='ISOLATED_TEST_ONLY', osm_snapshot_v=imported['v'], active_restrictions=[])
                build_elapsed = time.monotonic() - build_started
                if not result.get('ok'):
                    return {'pattern_id': pid, 'mode': mode, 'error': result.get('reason') or 'BUILDER_FAILED'}
                bundle = result['bundle']
                platforms = [platform_map[str(sid)] for sid in pat['stop_ids']]
                audit = audit_generation_bundle(bundle, platforms=platforms)
                actual = [edge for seg in bundle['segments'] for edge in seg['edge_ids']]
                expected = [edge for seg in baseline[pid, mode]['segments'] for edge in seg['edge_ids']]
                return {'pattern_id': pid, 'mode': mode, 'canonical_osm_conformant': audit['canonical_osm_conformant'],
                    'valid_generation_identity': generations.generation_matches_path(bundle, {'derived_generation': bundle['generation_id']}),
                    'rejects_wrong_generation_identity': not generations.generation_matches_path(bundle, {'derived_generation': 'wrong-generation'}),
                    'edge_count': len(actual), 'same_edge_chain_as_raw_offline_rebuild': actual == expected,
                    'signal_count': bundle['infrastructure']['signal_count'],
                    'motion_signal_count': bundle['infrastructure']['motion_signal_count'],
                    'build_elapsed_s': round(build_elapsed, 2), 'mirror_error': result['mirror_error']}
            except Exception as exc:
                return {'pattern_id': pid, 'mode': mode, 'error': type(exc).__name__}

    results = await asyncio.gather(*(build_one(pid, mode) for pid, mode in wanted))
    report = {'scope': candidates['scope'], 'local_graph_version': imported['v'],
              'captured_source_sha256': sha(raw_bytes), 'candidates_sha256': sha(candidate_bytes),
              'road_count': imported['roads'], 'rail_count': imported['rails'], 'signal_count': imported['signals'],
              'import_elapsed_s': round(import_elapsed, 2), 'app_source_indexes_explicitly_created': True,
              'all_patterns_requested': all_patterns, 'patterns': results,
              'limits': ['Single-response data injected into disposable MongoDB for test only; not a certified PBF import.',
                         'Empty restrictions and no verified overlays were explicitly supplied; not actual production state.',
                         'No realtime, traffic phase, GPS, physical route validation or activation.']}
    report_path = Path(os.environ['PERIX_ISOLATED_MONGO_DBPATH']).resolve().parent / 'osm-generation-test-report.json'
    with report_path.open('x', encoding='utf-8', newline='\n') as f:
        json.dump(report, f, ensure_ascii=False, indent=2, allow_nan=False); f.write('\n')
    # Divergence is a release blocker, not an invitation to accept guessed routes.
    assert all(not x.get('error') and x.get('canonical_osm_conformant')
               and x.get('valid_generation_identity') and x.get('rejects_wrong_generation_identity')
               and x.get('same_edge_chain_as_raw_offline_rebuild') and not x.get('mirror_error')
               for x in results), results
