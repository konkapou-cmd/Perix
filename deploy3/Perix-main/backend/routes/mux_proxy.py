"""First-party proxy for Mux HLS streams.

Browsers with strict tracking prevention (Edge, Safari ITP) block
third-party storage/requests to mux.com domains, which breaks video
playback. This proxy:
  * fetches manifests/segments from stream.mux.com (or the rendition
    hosts passed via the `h` query parameter)
  * rewrites playlist URLs so every request stays first-party.
"""
import re
from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, Request
from starlette.responses import Response, StreamingResponse

router = APIRouter(prefix="/mux-hls", tags=["Mux HLS Proxy"])

PLAYLIST_CT = ("application/x-mpegurl", "application/vnd.apple.mpegurl", "audio/mpegurl")
ALLOWED_HOST = re.compile(r"^[a-zA-Z0-9.-]+\.mux\.com$")
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


@router.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
async def mux_hls_proxy(path: str, request: Request):
    host_param = request.query_params.get("h")
    host = host_param if host_param and ALLOWED_HOST.match(host_param) else "stream.mux.com"

    qs_items = [(k, v) for k, v in request.query_params.multi_items() if k != "h"]
    qs = "&".join(f"{k}={v}" for k, v in qs_items)
    target = f"https://{host}/{path}" + (f"?{qs}" if qs else "")

    fwd_headers = {
        "User-Agent": BROWSER_UA,
        "Accept": request.headers.get("accept", "*/*"),
        "Accept-Encoding": "identity",
        "Referer": "https://app.perixapp.com/",
    }
    if request.headers.get("range"):
        fwd_headers["Range"] = request.headers["range"]

    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        upstream = await client.send(
            client.build_request(request.method, target, headers=fwd_headers),
            stream=True,
        )
        resp_headers = {
            k: v for k, v in upstream.headers.items()
            if k.lower() not in ("transfer-encoding", "connection", "content-encoding", "content-length")
        }
        content_type = upstream.headers.get("content-type", "")

        if content_type and "mpegurl" in content_type.lower():
            body = b"".join([chunk async for chunk in upstream.aiter_bytes()])
            base = f"{request.base_url.scheme}://{request.base_url.netloc}/api/mux-hls"

            def rewrite(match: re.Match) -> str:
                url = match.group(0)
                parsed = urlsplit(url)
                if not ALLOWED_HOST.match(parsed.netloc):
                    return url
                p = parsed.path.lstrip("/")
                query = parsed.query + "&h=" + parsed.netloc if parsed.query else "h=" + parsed.netloc
                return f"{base}/{p}?{query}"

            text = re.sub(r"https://[^\"'\s]+", rewrite, body.decode("utf-8", "replace"))
            return Response(
                content=text.encode("utf-8"),
                status_code=upstream.status_code,
                headers=resp_headers,
                media_type=content_type,
            )

        return StreamingResponse(
            upstream.aiter_bytes(),
            status_code=upstream.status_code,
            headers=resp_headers,
            media_type=content_type,
        )
