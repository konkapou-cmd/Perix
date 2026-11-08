"""Exercise the actual redirect middleware without starting app workers/DB."""
import ast
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from starlette.requests import Request
from starlette.responses import JSONResponse, RedirectResponse


def middleware():
    tree = ast.parse((Path(__file__).resolve().parents[1]/'server.py').read_text(encoding='utf-8'))
    function = next(n for n in tree.body if isinstance(n,ast.AsyncFunctionDef) and n.name=='force_https_middleware')
    function.decorator_list=[]
    namespace = {'Request':Request,'RedirectResponse':RedirectResponse}
    exec(compile(ast.Module(body=[function],type_ignores=[]),'server.py','exec'),namespace)
    return namespace[function.name]


def request(host,path,method='GET',proto=None):
    headers=[(b'host',host.encode())]
    if proto:headers.append((b'x-forwarded-proto',proto.encode()))
    return Request(dict(type='http',scheme='http',method=method,path=path,query_string=b'',headers=headers,server=(host,80)))


@pytest.mark.asyncio
async def test_exact_railway_probe_reaches_real_handler_including_failure():
    for status in (200,503):
        handler = AsyncMock(return_value=JSONResponse({'ready':status==200},status_code=status))
        response = await middleware()(request('healthcheck.railway.app','/api/mobility/v2/networks'),handler)
        assert response.status_code==status
        handler.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize('host,path',[
    ('app.perix.eu','/api/mobility/v2/networks'),
    ('healthcheck.railway.app','/app'),
    ('healthcheck.railway.app','/api/auth/me'),
    ('healthcheck.railway.app','/api/mobility/v2/networks/'),
    ('healthcheck.railway.app.evil.test','/api/mobility/v2/networks'),
])
async def test_other_plain_http_requests_still_require_https(host,path):
    handler = AsyncMock()
    response = await middleware()(request(host,path),handler)
    assert response.status_code==308
    assert response.headers['location'].startswith('https://')
    handler.assert_not_awaited()


@pytest.mark.asyncio
async def test_forwarded_https_browser_request_is_not_redirected():
    handler = AsyncMock(return_value=JSONResponse({'ok':True}))
    response = await middleware()(request('app.perix.eu','/app',proto='https'),handler)
    assert response.status_code==200
