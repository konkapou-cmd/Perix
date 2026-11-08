"""Opt-in staging isolation guard; no DB, tasks or provider calls."""
import pytest

from utils import mobility_workers as workers


def test_disabled_startup_does_not_create_any_mobility_tasks(monkeypatch):
    monkeypatch.setenv('MOBILITY_WORKERS_ENABLED', 'false')
    monkeypatch.setattr(workers, '_precompute_primitives', lambda: pytest.fail('must not initialize coordinator'))
    monkeypatch.setattr(workers.asyncio, 'create_task', lambda _: pytest.fail('must not spawn workers'))
    monkeypatch.setattr(workers, 'request_precompute', lambda *a, **k: pytest.fail('must not request precompute'))
    workers.start_mobility_workers()


def test_default_startup_keeps_existing_four_worker_tasks(monkeypatch):
    monkeypatch.delenv('MOBILITY_WORKERS_ENABLED', raising=False)
    calls = []
    monkeypatch.setattr(workers, '_precompute_primitives', lambda: calls.append('coordinator'))
    monkeypatch.setattr(workers, 'request_precompute', lambda *a, **k: calls.append('startup'))
    def consume(coroutine):
        calls.append(coroutine.cr_code.co_name)
        coroutine.close()
    monkeypatch.setattr(workers.asyncio, 'create_task', consume)
    workers.start_mobility_workers()
    assert calls == ['coordinator', '_realtime_worker', '_static_worker', '_precompute_road_geometries',
                     'startup', '_osm_snapshot_worker']


@pytest.mark.parametrize('bad', ['0', 'off', '', 'tru'])
def test_invalid_setting_fails_before_starting_any_task(monkeypatch, bad):
    monkeypatch.setenv('MOBILITY_WORKERS_ENABLED', bad)
    monkeypatch.setattr(workers, '_precompute_primitives', lambda: pytest.fail('must fail closed'))
    with pytest.raises(ValueError, match='must be true or false'):
        workers.start_mobility_workers()
