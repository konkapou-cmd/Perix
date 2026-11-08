"""Synthetic concurrent static downloads; no provider or database access."""
import asyncio
import contextvars
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from utils import gtfs, mobility_workers as workers
from routes import mobility as routes


def configure(monkeypatch, tmp_path):
    paths = []
    original_mkstemp = workers.tempfile.mkstemp

    def create_file(**kwargs):
        fd, path = original_mkstemp(dir=tmp_path, **kwargs)
        paths.append(Path(path))
        return fd, path

    monkeypatch.setattr(workers.tempfile, 'mkstemp', create_file)
    monkeypatch.setattr(workers, '_ACTIVE_REGION', SimpleNamespace(static_transit_type='GTFS',
        region_id='test', network_id='test', timezone='Europe/Berlin', agency_regex='test'))
    monkeypatch.setattr(workers, 'STATIC_GTFS_URL', 'https://example.invalid/synthetic.zip')
    monkeypatch.setattr(workers, 'db', SimpleNamespace(mobility_sync_state=SimpleNamespace(
        find_one=AsyncMock(return_value=None))))
    monkeypatch.setattr(routes, '_get_active_network', AsyncMock(return_value=None))
    return paths


@pytest.mark.asyncio
async def test_concurrent_workers_parse_only_their_own_download(monkeypatch, tmp_path):
    paths = configure(monkeypatch, tmp_path)
    identity = contextvars.ContextVar('identity')
    both_open = asyncio.Event()
    arrivals = 0
    parsed = []

    @asynccontextmanager
    async def client(**kwargs):
        @asynccontextmanager
        async def stream(*args):
            async def chunks():
                nonlocal arrivals
                arrivals += 1
                if arrivals == 2:
                    both_open.set()
                await both_open.wait()
                yield identity.get().encode()
            yield SimpleNamespace(raise_for_status=lambda: None, aiter_bytes=chunks)
        yield SimpleNamespace(stream=stream)

    def parse(path, **kwargs):
        parsed.append((identity.get(), Path(path).read_bytes()))
        raise ValueError('synthetic stop after parse')

    monkeypatch.setattr(workers.httpx, 'AsyncClient', client)
    monkeypatch.setattr(gtfs, 'parse_gtfs_zip_path', parse)
    monkeypatch.setattr(workers.asyncio, 'sleep', AsyncMock(side_effect=asyncio.CancelledError))

    async def run_one(value):
        identity.set(value)
        with pytest.raises(asyncio.CancelledError):
            await workers._static_worker()

    await asyncio.wait_for(asyncio.gather(run_one('first'), run_one('second')), timeout=10)
    assert sorted(parsed) == [('first', b'first'), ('second', b'second')]
    assert len(set(paths)) == 2
    assert all(not path.exists() for path in paths)


@pytest.mark.asyncio
async def test_cancelled_download_removes_only_its_own_file(monkeypatch, tmp_path):
    paths = configure(monkeypatch, tmp_path)
    entered = asyncio.Event()
    blocked = asyncio.Event()
    sentinel = tmp_path / 'unrelated.zip'
    sentinel.write_bytes(b'untouched')

    @asynccontextmanager
    async def client(**kwargs):
        @asynccontextmanager
        async def stream(*args):
            async def chunks():
                entered.set()
                await blocked.wait()
                yield b'never'
            yield SimpleNamespace(raise_for_status=lambda: None, aiter_bytes=chunks)
        yield SimpleNamespace(stream=stream)

    monkeypatch.setattr(workers.httpx, 'AsyncClient', client)
    task = asyncio.create_task(workers._static_worker())
    await asyncio.wait_for(entered.wait(), timeout=10)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert len(paths) == 1 and not paths[0].exists()
    assert sentinel.read_bytes() == b'untouched'
