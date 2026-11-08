"""TEST ONLY: real V2 routes/estimator, synthetic source clock, no server.py.

Run only under the PID/path-verified disposable MongoDB supervisor. This app
must never be deployed. It replaces only source reads/clock with a fixture;
geometry, optical adapter, shared state and passenger serialization are real.
"""
from contextlib import asynccontextmanager
from contextvars import ContextVar
from datetime import datetime, timedelta
import ipaddress
import os
from pathlib import Path
import socket
import time
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from fastapi import FastAPI, Request
from routes import mobility as routes
from routes.dependencies import get_current_user_optional
from mobility import v2
from database import client, db

_fixture = ContextVar('visual_http_fixture', default=None)
_real_time = time.time
_real_connect = socket.socket.connect
_real_connect_ex = socket.socket.connect_ex


def _allowed(address):
    try:
        return ipaddress.ip_address(address[0]).is_loopback
    except (ValueError, TypeError, IndexError):
        return False


def _connect(sock, address):
    if not _allowed(address):
        raise RuntimeError('Test HTTP worker refuses non-loopback egress')
    return _real_connect(sock, address)


def _connect_ex(sock, address):
    if not _allowed(address):
        raise RuntimeError('Test HTTP worker refuses non-loopback egress')
    return _real_connect_ex(sock, address)


def clock():
    fixture = _fixture.get()
    if fixture is None:
        raise RuntimeError('Missing request-scoped test clock')
    elapsed = max(0, _real_time()-fixture['started_epoch']) if fixture.get('running') else 0
    return datetime(2026, 11, 2, tzinfo=ZoneInfo('Europe/Berlin'))+timedelta(seconds=fixture['now_s']+elapsed)


async def accepted_source(trip_ids, network=None, **_):
    fixture = _fixture.get()
    return {'t': {'trip_id': 't', 'service_date': '2026-11-02', 'network_version_id': 'visual-http-v',
        'trip_schedule_relationship': 'CANCELED' if fixture.get('canceled') else 'SCHEDULED',
        'feed_timestamp': fixture['order'], 'trip_update_timestamp': None,
        'source_match_validated': True, 'trip_delay_observed': False,
        'stop_predictions_by_sequence': {'2': {'stop_id': 'B',
            'arrival_delay_seconds': fixture['duration']-60,
            'departure_delay_seconds': fixture['duration']-60}}}} if 't' in trip_ids else {}


@asynccontextmanager
async def lifespan(app):
    url = urlsplit(os.environ.get('MONGO_URL', ''))
    if (url.hostname != '127.0.0.1' or url.username or url.query
            or not os.environ.get('DB_NAME', '').startswith('perix_ci_isolated_')):
        raise RuntimeError('Refusing non-disposable HTTP fixture database')
    status = await client.admin.command('serverStatus')
    opts = (await client.admin.command('getCmdLineOpts'))['parsed']
    if (int(status['pid']) != int(os.environ['PERIX_ISOLATED_MONGO_PID'])
            or Path(opts['storage']['dbPath']).resolve() != Path(os.environ['PERIX_ISOLATED_MONGO_DBPATH']).resolve()
            or opts['net']['bindIp'] != '127.0.0.1' or opts['net']['port'] != url.port):
        raise RuntimeError('Wrong supervised database')
    socket.socket.connect, socket.socket.connect_ex = _connect, _connect_ex
    routes._berlin_now = clock
    routes._realtime_delays_for = accepted_source
    # Match the send guard's wall clock to the synthetic request clock while
    # preserving real monotonic timing for sockets/timeouts and outside requests.
    time.time = lambda: clock().timestamp() if _fixture.get() is not None else _real_time()
    yield
    time.time = _real_time
    socket.socket.connect, socket.socket.connect_ex = _real_connect, _real_connect_ex
    client.close()


app = FastAPI(lifespan=lifespan)
app.dependency_overrides[get_current_user_optional] = lambda: None
app.include_router(v2.router, prefix='/api')


@app.middleware('http')
async def fixture_request(request: Request, call_next):
    if request.method != 'GET':
        from fastapi.responses import JSONResponse
        return JSONResponse({'detail': 'GET-only test application'}, status_code=405)
    control = await db.visual_http_control.find_one({'_id': 'fixture'})
    if not control:
        raise RuntimeError('Missing explicitly seeded fixture')
    token = _fixture.set(control)
    try:
        response = await call_next(request)
        response.headers['X-Visual-Test-Pid'] = str(os.getpid())
        response.headers['X-Visual-Test-Order'] = str(control['order'])
        return response
    finally:
        _fixture.reset(token)


@app.get('/fixture/health')
async def health():
    return {'fixture': 'synthetic-only', 'pid': os.getpid()}
