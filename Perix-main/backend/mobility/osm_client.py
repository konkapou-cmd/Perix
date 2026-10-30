"""Shared Overpass client for Perix mobility importers.

Runtime mobility code must read the local OSM snapshot from MongoDB. Public
Overpass instances are importer/update sources only. Keeping retry, timeout and
mirror behavior here prevents roads, rails and signals from drifting into
separate network clients.
"""
import asyncio
from typing import Optional

import httpx

OVERPASS_URLS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.osm.ch/api/interpreter",
]

USER_AGENT = "PerixMobility/1.0 (app.perixapp.com)"
REQUEST_TIMEOUT_SECONDS = 150
ATTEMPTS_PER_MIRROR = 2


async def overpass_json(query: str, *, require_elements: bool = True) -> dict:
    """Execute one Overpass query with the same fallback policy everywhere.

    `require_elements=True` treats a successful HTTP response containing zero
    elements as a failed mirror. This matches the existing road importer
    behavior and protects snapshot creation from stale/empty mirrors.
    """
    last_err: Optional[Exception] = None

    for url in OVERPASS_URLS:
        for attempt in range(ATTEMPTS_PER_MIRROR):
            try:
                async with httpx.AsyncClient(
                    timeout=REQUEST_TIMEOUT_SECONDS,
                    headers={"User-Agent": USER_AGENT},
                ) as client:
                    resp = await client.get(url, params={"data": query})
                    resp.raise_for_status()
                    data = resp.json()

                if not isinstance(data, dict) or not isinstance(data.get('elements'), list):
                    raise RuntimeError('Invalid Overpass response structure')
                # Overpass can return HTTP 200 plus partial elements and a
                # timeout/out-of-memory remark. Nonempty is not completeness.
                if data.get('remark'):
                    raise RuntimeError('Incomplete Overpass response (remark present)')
                if require_elements and not data.get("elements"):
                    raise RuntimeError("empty response (0 elements)")

                return data
            except Exception as err:
                last_err = err
                print(
                    f"[osm_client] overpass attempt failed ({type(err).__name__}: {err}); "
                    f"mirror={url} attempt={attempt + 1}",
                    flush=True,
                )
                await asyncio.sleep(5 * (attempt + 1))

    raise RuntimeError(f"Overpass failed: {last_err}")
