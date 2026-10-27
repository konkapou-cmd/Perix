"""No provider/production/database access: bounded-control and routing tests."""
import asyncio
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock
import importlib.util
from pathlib import Path

import pytest

from mobility.daily_recovery import DailyRecovery, civil_date, next_midnight_seconds
from mobility import roads


class MemoryControl:
    def __init__(self): self.row = None; self.reads = 0
    def matches(self, query):
        return self.row is not None and all(self.row.get(k) == v for k, v in query.items())
    async def find_one(self, query):
        self.reads += 1
        return deepcopy(self.row) if self.matches(query) else None
    async def update_one(self, query, update, upsert=False):
        if self.row is None and upsert:
            self.row = {**query, **deepcopy(update.get('$setOnInsert') or {})}
    async def find_one_and_update(self, query, update, **kwargs):
        if not self.matches(query): return None
        self.row.update(deepcopy(update.get('$set') or {}))
        for key, delta in update.get('$inc', {}).items(): self.row[key] = self.row.get(key, 0)+delta
        return deepcopy(self.row)


def setup(on=True):
    store = MemoryControl(); clock = [datetime(2026, 10, 26, 10, tzinfo=timezone.utc)]
    c = DailyRecovery(store, region_id='r', network_id='n', timezone_name='Europe/Berlin',
                      clock=lambda: clock[0], enabled_override=on)
    return c, store, clock


async def register(c, **changes):
    return await c.register(**{'service_date': '2026-10-26', 'source_sha256': 'a'*64,
                               'candidate_id': 'net_candidate', **changes})


def blocked():
    return AsyncMock(return_value={'state': 'BLOCKED_CHANGED_PATTERNS', 'version_id': 'net_candidate',
        'expected': 159, 'ready': 151, 'blocking_missing': ['56:missing']})


def ready():
    return AsyncMock(return_value={'state': 'READY', 'version_id': 'net_candidate', 'blocking_missing': []})


@pytest.mark.asyncio
async def test_default_off_does_not_read_db_or_invoke_callbacks(monkeypatch):
    monkeypatch.delenv('MOBILITY_DAILY_RECOVERY_ENABLED', raising=False)
    store = MemoryControl()
    c = DailyRecovery(store, region_id='r', network_id='n', timezone_name='Europe/Berlin')
    p = ready(); a = AsyncMock()
    assert (await c.status())['state'] == 'DISABLED'
    assert (await c.attempt(graph_v=1, source_version_id='old', prepare=p, activate=a))['state'] == 'DISABLED'
    assert store.reads == 0; p.assert_not_awaited(); a.assert_not_awaited()


@pytest.mark.asyncio
async def test_identical_source_and_day_reuse_original_candidate():
    c, _store, _clock = setup()
    await register(c)
    assert (await register(c, candidate_id='duplicate'))['candidate_id'] == 'net_candidate'
    assert await c.candidate_for('2026-10-26', 'a'*64) == 'net_candidate'
    assert await c.candidate_for('2026-10-27', 'a'*64) is None
    assert await c.candidate_for('2026-10-26', 'b'*64) is None


@pytest.mark.asyncio
async def test_blocked_is_a_durable_alarm_not_activation_or_success():
    c, store, _clock = setup(); await register(c)
    a = AsyncMock(); p = blocked()
    r = await c.attempt(graph_v=1, source_version_id='old', prepare=p, activate=a)
    assert r['state'] == 'BLOCKED'
    assert store.row['alarm']['code'] == 'DAILY_NETWORK_NOT_READY'
    assert store.row['alarm']['missing_patterns'] == ['56:missing']
    a.assert_not_awaited()


@pytest.mark.asyncio
async def test_new_graph_retries_immediately_and_calls_unchanged_strict_activation():
    c, _store, _clock = setup(); await register(c)
    await c.attempt(graph_v=1, source_version_id='old', prepare=blocked())
    p = ready(); a = AsyncMock(return_value={'active': 'net_candidate'})
    r = await c.attempt(graph_v=2, source_version_id='old', prepare=p, activate=a)
    assert r['state'] == 'ACTIVATED' and r['graph_attempts'] == 1
    a.assert_awaited_once_with('net_candidate', require_ready=True, force=False)


@pytest.mark.asyncio
async def test_same_graph_has_cooldown_and_hard_attempt_cap():
    c, _store, clock = setup(); await register(c); p = blocked()
    await c.attempt(graph_v=1, source_version_id='old', prepare=p)
    assert (await c.attempt(graph_v=1, source_version_id='old', prepare=p))['state'] == 'COOLDOWN'
    for _ in range(2):
        clock[0] += timedelta(seconds=301)
        await c.attempt(graph_v=1, source_version_id='old', prepare=p)
    clock[0] += timedelta(seconds=301)
    assert (await c.attempt(graph_v=1, source_version_id='old', prepare=p))['state'] == 'WAIT_FOR_NEW_GRAPH'
    assert p.await_count == 3


@pytest.mark.asyncio
async def test_per_day_cap_does_not_reset_on_every_graph_or_feed_change():
    c, _store, _clock = setup(); await register(c); p = blocked()
    for graph in range(1, 13):
        await c.attempt(graph_v=graph, source_version_id='old', prepare=p)
    await register(c, source_sha256='b'*64)
    assert (await c.attempt(graph_v=13, source_version_id='old', prepare=p))['state'] == 'DAY_ATTEMPT_CAP'
    assert p.await_count == 12


@pytest.mark.asyncio
async def test_concurrent_instances_reserve_only_one_attempt():
    c, store, clock = setup(); await register(c)
    other = DailyRecovery(store, region_id='r', network_id='n', timezone_name='Europe/Berlin',
        clock=lambda: clock[0], enabled_override=True)
    gate = asyncio.Event()
    async def prepare(*args, **kw): await gate.wait(); return {'state': 'READY', 'version_id': 'net_candidate'}
    p = AsyncMock(side_effect=prepare); a = AsyncMock(return_value={'active': 'net_candidate'})
    first = asyncio.create_task(c.attempt(graph_v=1, source_version_id='old', prepare=p, activate=a))
    await asyncio.sleep(0)
    second = await other.attempt(graph_v=1, source_version_id='old', prepare=p, activate=a)
    assert second['state'] == 'BUSY'
    gate.set(); assert (await first)['state'] == 'ACTIVATED'
    assert p.await_count == a.await_count == 1


@pytest.mark.asyncio
async def test_expired_or_stolen_lease_cannot_activate():
    c, store, clock = setup(); await register(c)
    async def prepare(*args, **kwargs): clock[0] += timedelta(seconds=901); return {'state': 'READY', 'version_id': 'net_candidate'}
    a = AsyncMock()
    assert (await c.attempt(graph_v=1, source_version_id='old', prepare=prepare, activate=a))['state'] == 'LEASE_LOST'
    a.assert_not_awaited()


@pytest.mark.asyncio
async def test_date_rollover_during_preparation_never_activates_yesterday():
    c, _store, clock = setup(); await register(c)
    async def prepare(*args, **kwargs):
        clock[0] += timedelta(days=1)
        return {'state': 'READY', 'version_id': 'net_candidate'}
    a = AsyncMock()
    r = await c.attempt(graph_v=1, source_version_id='old', prepare=prepare, activate=a)
    assert r['state'] in ('DAY_ROLLED_OVER', 'LEASE_LOST'); a.assert_not_awaited()


@pytest.mark.asyncio
async def test_uncertain_activation_is_not_automatically_retried():
    c, _store, clock = setup(); await register(c)
    a = AsyncMock(side_effect=TimeoutError('no exception text retained'))
    r = await c.attempt(graph_v=1, source_version_id='old', prepare=ready(), activate=a)
    assert r['state'] == 'ACTIVATION_OUTCOME_UNKNOWN'
    clock[0] += timedelta(hours=1)
    assert (await c.attempt(graph_v=2, source_version_id='old', prepare=ready(), activate=a))['state'] == 'ACTIVATION_OUTCOME_UNKNOWN'
    assert a.await_count == 1


@pytest.mark.asyncio
async def test_false_ready_with_blockers_or_wrong_candidate_does_not_activate():
    c, _store, clock = setup(); await register(c); a = AsyncMock()
    for i, report in enumerate([{'state': 'READY', 'version_id': 'other'},
        {'state': 'READY', 'version_id': 'net_candidate', 'blocking_missing': ['bad']}], 1):
        r = await c.attempt(graph_v=i, source_version_id='old', prepare=AsyncMock(return_value=report), activate=a)
        assert r['state'] == 'BLOCKED'
    a.assert_not_awaited()


def test_dst_day_clock_does_not_use_display_day_or_fixed_24h():
    from zoneinfo import ZoneInfo
    fall = datetime(2026, 10, 25, tzinfo=ZoneInfo('Europe/Berlin'))
    assert next_midnight_seconds(fall, 'Europe/Berlin') == 90000
    assert civil_date(datetime(2026, 10, 26, 0, 1, tzinfo=ZoneInfo('Europe/Berlin')), 'Europe/Berlin') == '2026-10-26'


def ways(offset=0.):
    return [{'id': 1, 'nodes': [1, 2, 3], 'points': [[52.+offset, 11.], [52.+offset, 11.001],
        [52.+offset, 11.002]], 'tags': {'highway': 'primary'}}]


def test_bus_missing_coverage_is_rejected_before_distant_node_routing():
    r = roads._route_stops_segments_sync([(52., 11.), (52., 11.002)], ways(.03), mode='bus')
    assert r['full'] is None
    assert r['segments'][0]['reason'] == 'PLATFORM_OUTSIDE_LOCAL_GRAPH'
    assert all(not s['accepted'] for s in r['snap_diagnostics'])
    assert all(s['limit_m'] == 120 for s in r['snap_diagnostics'])


def test_long_edge_near_platform_is_not_confused_with_absent_graph():
    w = [{'id': 1, 'nodes': [1, 2], 'points': [[52., 11.], [52., 11.01]], 'tags': {}}]
    nodes, adj, _ = roads._build_graph_detailed(w, 'bus')
    snap = roads._bounded_stop_snaps([(52.00001, 11.005)], nodes, adj)[0]
    assert snap['node_distance_m'] > 120 and snap['edge_distance_m'] < 2
    assert snap['accepted'] is True


@pytest.mark.asyncio
async def test_pinned_snapshot_never_silently_falls_back_to_external_overpass(monkeypatch):
    from mobility import osm_store
    monkeypatch.setattr(osm_store, 'get_local_ways', AsyncMock(return_value=[]))
    external = AsyncMock(side_effect=AssertionError('external canonical fetch'))
    monkeypatch.setattr(roads, '_fetch_ways_detailed', external)
    r = await roads.compute_pattern_segments([{'lat': 52., 'lng': 11.}, {'lat': 52., 'lng': 11.01}], 'bus', osm_snapshot_v=123)
    assert r['missing_pairs'] == [[0, 1]]; external.assert_not_awaited()


def test_tram_routing_does_not_receive_new_bus_snap_policy():
    r = roads._route_stops_segments_sync([(52., 11.), (52., 11.002)], ways(.03), mode='tram')
    assert 'snap_diagnostics' not in r


def test_polygon_proof_rejects_holes_and_concave_intrusion():
    spec = importlib.util.spec_from_file_location('osm_source_tool', Path(__file__).parents[1]/'tools/build_osm_source.py')
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    outer = [(0., 0.), (10., 0.), (10., 10.), (0., 10.)]
    bbox = (2., 2., 8., 8.)
    assert m.polygon_contains_bbox([(False, outer)], bbox)
    assert not m.polygon_contains_bbox([(False, outer), (True, [(4., 4.), (5., 4.), (5., 5.), (4., 5.)])], bbox)
    assert not m.polygon_contains_bbox([(False, [(0., 0.), (10., 0.), (10., 10.), (6., 10.),
        (6., 5.), (4., 5.), (4., 10.), (0., 10.)])], bbox)


@pytest.mark.asyncio
@pytest.mark.parametrize('ready_state', [False, True])
async def test_static_worker_marks_hash_only_after_strict_activation(monkeypatch, ready_state):
    import io
    from types import SimpleNamespace
    from unittest.mock import Mock
    from utils import mobility_workers as w, gtfs
    from routes import mobility as routes
    from mobility import generations, daily_recovery
    import builtins
    class Response:
        def raise_for_status(self): pass
        async def aiter_bytes(self): yield b'SYNTHETIC_GTFS_ZIP_BYTES'
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
    class Client:
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
        def stream(self, *a, **k): return Response()
    original_open = builtins.open
    monkeypatch.setattr(builtins, 'open', lambda p, *a, **k: io.BytesIO() if p == '/tmp/perix_gtfs.zip' else original_open(p, *a, **k))
    monkeypatch.setattr(w.httpx, 'AsyncClient', lambda **k: Client())
    monkeypatch.setattr(w, '_ACTIVE_REGION', SimpleNamespace(static_transit_type='GTFS', region_id='r', network_id='n',
        timezone='Europe/Berlin', agency_regex='mock', service_day_start_hour=4))
    monkeypatch.setattr(w, 'STATIC_GTFS_URL', 'https://example.invalid/synthetic.zip')
    monkeypatch.setattr(w, 'AUTO_ACTIVATE', True); monkeypatch.setattr(w, 'MIN_TRIPS', 1); monkeypatch.setattr(w, 'MIN_LINES', 1)
    sync = SimpleNamespace(find_one=AsyncMock(return_value=None), replace_one=AsyncMock())
    monkeypatch.setattr(w, 'db', SimpleNamespace(mobility_sync_state=sync,
        mobility_schedule_audits=SimpleNamespace(replace_one=AsyncMock())))
    monkeypatch.setenv('MOBILITY_DAILY_RECOVERY_ENABLED', 'false')
    monkeypatch.setattr(daily_recovery, 'civil_date', lambda *a: '2026-10-26')
    monkeypatch.setattr(w, '_merge_shapes', AsyncMock())
    monkeypatch.setattr(w, '_precompute_primitives', lambda: (asyncio.Event(), asyncio.Lock(), None))
    monkeypatch.setattr(routes, '_get_active_network', AsyncMock(return_value=None))
    creator = AsyncMock(return_value={'version_id': 'net_candidate', 'diff': {}})
    activation = AsyncMock(return_value={'active': 'net_candidate'})
    monkeypatch.setattr(routes, '_create_network_version', creator)
    monkeypatch.setattr(routes, '_activate_network_version', activation)
    monkeypatch.setattr(generations, 'atomic_generations_enabled', lambda: True)
    monkeypatch.setattr(generations, 'prepare_network_version', AsyncMock(return_value={
        'state': 'READY' if ready_state else 'BLOCKED_CHANGED_PATTERNS', 'version_id': 'net_candidate', 'blocking_missing': [] if ready_state else ['56:missing']}))
    payload = {'service_date': '2026-10-26', 'name': 'GTFS 2026-10-26',
        'routes': [{'route_number': '56', 'trips': [{'trip_id': 't'}], 'stops': []}]}
    parser = Mock(return_value=payload); monkeypatch.setattr(gtfs, 'parse_gtfs_zip_path', parser)
    if importlib.util.find_spec('mobility.schedule_revision') is not None:
        from mobility import schedule_revision
        monkeypatch.setattr(schedule_revision, 'choose_contract', lambda *a, **k: None)
        monkeypatch.setattr(schedule_revision, 'audit_schedule', lambda *a, **k: {
            'ready_to_import': True, 'service_date': '2026-10-26', 'contract_applied': False,
            'blocking_error_count': 0, 'warning_count': 0})
    if importlib.util.find_spec('mobility.service_clock') is not None:
        from mobility import service_clock
        monkeypatch.setattr(service_clock, '_static_service_date', lambda *a: '2026-10-26')
    async def stop_after_cycle(*a): raise asyncio.CancelledError()
    monkeypatch.setattr(w.asyncio, 'sleep', stop_after_cycle)
    with pytest.raises(asyncio.CancelledError): await w._static_worker()
    assert parser.call_args.kwargs['service_date'] == '2026-10-26'
    assert creator.call_args.kwargs['service_date'] == '2026-10-26'
    if ready_state:
        activation.assert_awaited_once(); sync.replace_one.assert_awaited_once()
    else:
        activation.assert_not_awaited(); sync.replace_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_network_creator_preserves_explicit_day_without_forcing_active(monkeypatch):
    from types import SimpleNamespace
    from routes import mobility as m
    insert = AsyncMock()
    monkeypatch.setattr(m, 'db', SimpleNamespace(bus_network_versions=SimpleNamespace(insert_one=insert)))
    monkeypatch.setattr(m, '_get_active_network', AsyncMock(return_value=None))
    monkeypatch.setattr(m, '_broadcast', lambda *a: None)
    await m._create_network_version([], 'Synthetic dated network', service_date='2026-10-26')
    assert insert.call_args.args[0]['service_date'] == '2026-10-26'
    assert insert.call_args.args[0]['active'] is False


@pytest.mark.asyncio
async def test_disabling_recovery_during_preparation_stops_new_activation(monkeypatch):
    monkeypatch.setenv('MOBILITY_DAILY_RECOVERY_ENABLED', 'true')
    store = MemoryControl()
    c = DailyRecovery(store, region_id='r', network_id='n', timezone_name='Europe/Berlin',
        clock=lambda: datetime(2026, 10, 26, 10, tzinfo=timezone.utc))
    await register(c)
    async def prepare(*a, **k):
        monkeypatch.setenv('MOBILITY_DAILY_RECOVERY_ENABLED', 'false')
        return {'state': 'READY', 'version_id': 'net_candidate'}
    activation = AsyncMock()
    r = await c.attempt(graph_v=1, source_version_id='old', prepare=prepare, activate=activation)
    assert r['state'] == 'PAUSED'; activation.assert_not_awaited()


@pytest.mark.asyncio
async def test_unknown_outcome_cannot_be_overwritten_by_a_new_feed_revision():
    c, store, clock = setup(); await register(c)
    await c.attempt(graph_v=1, source_version_id='old', prepare=ready(), activate=AsyncMock(side_effect=TimeoutError()))
    clock[0] += timedelta(hours=1)
    r = await register(c, source_sha256='b'*64, candidate_id='new_candidate')
    assert r['state'] == 'ACTIVATION_OUTCOME_UNKNOWN' and 'candidate_id' not in r
    assert store.row['candidate_id'] == 'net_candidate'


@pytest.mark.asyncio
async def test_readback_confirmation_clears_alarm_only_for_exact_current_instance():
    c, store, clock = setup(); await register(c)
    await c.attempt(graph_v=1, source_version_id='old', prepare=ready(), activate=AsyncMock(side_effect=TimeoutError()))
    assert (await c.confirm_active('wrong_candidate', '2026-10-26'))['state'] == 'ACTIVE_CONFIRMATION_MISMATCH'
    assert (await c.confirm_active('net_candidate', '2026-10-26'))['state'] == 'ACTIVATED'
    assert store.row['alarm'] is None


@pytest.mark.asyncio
async def test_worker_refuses_wrong_dated_candidate_before_preparing_or_activating(monkeypatch):
    from types import SimpleNamespace
    from utils import mobility_workers as w
    from mobility import generations
    monkeypatch.setenv('MOBILITY_DAILY_RECOVERY_ENABLED', 'true')
    monkeypatch.setattr(w, 'AUTO_ACTIVATE', True)
    monkeypatch.setattr(generations, 'atomic_generations_enabled', lambda: True)
    monkeypatch.setattr(w, '_ACTIVE_REGION', SimpleNamespace(region_id='r', network_id='n'))
    control = SimpleNamespace(register=AsyncMock(return_value={'candidate_id': 'old_candidate'}), attempt=AsyncMock())
    monkeypatch.setattr(w, '_daily_recovery_control', lambda: control)
    monkeypatch.setattr(w, '_precompute_primitives', lambda: (None, asyncio.Lock(), None))
    find = AsyncMock(return_value={'version_id': 'old_candidate', 'service_date': '2026-10-25'})
    monkeypatch.setattr(w, 'db', SimpleNamespace(bus_network_versions=SimpleNamespace(find_one=find)))
    r = await w._managed_daily_candidate('old_candidate', '2026-10-26', 'a'*64)
    assert r['state'] == 'CANDIDATE_DATE_OR_SCOPE_MISMATCH'; control.attempt.assert_not_awaited()


@pytest.mark.asyncio
async def test_initialization_race_uses_the_winning_unique_control_row():
    from pymongo.errors import DuplicateKeyError
    c, store, _clock = setup()
    original = store.update_one
    async def race(query, update, **kwargs):
        await original(query, update, **kwargs)
        raise DuplicateKeyError('synthetic concurrent initializer')
    store.update_one = race
    assert (await register(c))['candidate_id'] == 'net_candidate'


async def overpass_case(monkeypatch, data, require_elements):
    from mobility import osm_client
    from types import SimpleNamespace
    class Client:
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
        async def get(self, *a, **kw):
            return SimpleNamespace(raise_for_status=lambda: None, json=lambda: data)
    monkeypatch.setattr(osm_client.httpx, 'AsyncClient', lambda **kw: Client())
    monkeypatch.setattr(osm_client, 'OVERPASS_URLS', ['https://example.invalid'])
    monkeypatch.setattr(osm_client, 'ATTEMPTS_PER_MIRROR', 1)
    monkeypatch.setattr(osm_client.asyncio, 'sleep', AsyncMock())
    return await osm_client.overpass_json('synthetic query', require_elements=require_elements)


@pytest.mark.asyncio
@pytest.mark.parametrize('required', [False, True])
async def test_http200_partial_overpass_elements_never_count_as_complete(monkeypatch, required):
    with pytest.raises(RuntimeError, match='Incomplete Overpass response'):
        await overpass_case(monkeypatch, {'elements': [{'type': 'way', 'id': 1}],
            'remark': 'runtime error: Query timed out'}, required)


@pytest.mark.asyncio
@pytest.mark.parametrize('required,elements', [(True, [{'type': 'way', 'id': 1}]), (False, [])])
async def test_complete_overpass_structure_keeps_existing_empty_policy(monkeypatch, required, elements):
    assert await overpass_case(monkeypatch, {'elements': elements}, required) == {'elements': elements}


@pytest.mark.asyncio
async def test_invalid_overpass_structure_is_not_accepted_as_an_empty_tile(monkeypatch):
    with pytest.raises(RuntimeError, match='Invalid Overpass response structure'):
        await overpass_case(monkeypatch, {'message': 'not a query result'}, False)
