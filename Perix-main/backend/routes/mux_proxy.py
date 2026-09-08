"""First-party proxy for Mux HLS streams.

Browsers with strict tracking prevention (Edge, Safari ITP) block
third-party storage/requests to stream.mux.com, which breaks video
playback. Serving the stream from our own API origin avoids that.
"""
import httpx
from fastapi import APIRouter, Request
from starlette.responses import StreamingResponse

router = APIRouter(prefix="/mux-hls", tags=["Mux HLS Proxy"])


@router.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
async def mux_hls_proxy(path: str, request: Request):
    qs = request.url.query
    target = f"https://stream.mux.com/{path}" + (f"?{qs}" if qs else "")
    fwd_headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in ("host", "origin", "referer", "cookie", "connection")
    }
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        upstream = await client.send(
            client.build_request(request.method, target, headers=fwd_headers),
            stream=True,
        )
        resp_headers = {
            k: v for k, v in upstream.headers.items()
            if k.lower() not in ("transfer-encoding", "connection", "content-encoding", "content-length")
        }
        return StreamingResponse(
            upstream.aiter_bytes(),
            status_code=upstream.status_code,
            headers=resp_headers,
            media_type=upstream.headers.get("content-type"),
        )
