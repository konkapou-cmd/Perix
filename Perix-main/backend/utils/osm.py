"""OpenStreetMap Overpass route geometry for transit lines (free, no key).

Used to attach accurate shapes to bus/tram routes when the GTFS feed
doesn't include shapes.txt - vehicles then follow the real streets/tracks
instead of straight lines between stops.
"""
import logging

import httpx

logger = logging.getLogger(__name__)

OVERPASS_URLS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]

# Magdeburg + surroundings (trams reach Barleben, buses reach the edge towns)
MAGDEBURG_BBOX = (52.02, 11.50, 52.25, 11.76)  # south, west, north, east

_cache: dict = {}


def _pt(p):
    if isinstance(p, (list, tuple)) and len(p) >= 2:
        return [float(p[0]), float(p[1])]
    return [float(p.get("lat")), float(p.get("lon"))]


def _chain_ways(members: list) -> list:
    """Concatenate relation member geometries into polylines, splitting on
    gaps > 250m and returning the longest continuous chain."""
    chains = []
    current = []
    for m in members:
        geom = m.get("geometry") or []
        if not geom:
            continue
        if current and geom:
            last = current[-1]
            first = _pt(geom[0])
            d = ((last[0] - first[0]) ** 2 + (last[1] - first[1]) ** 2) ** 0.5
            if d > 0.003:  # ~250m gap -> new chain
                chains.append(current)
                current = []
        for raw in geom:
            current.append(_pt(raw))
    if current:
        chains.append(current)
    if not chains:
        return []
    chains.sort(key=len, reverse=True)
    return chains[0]


async def fetch_route_shape(ref: str) -> list:
    """Geometry for a bus/tram line (e.g. ref='52') as [[lat, lng], ...]."""
    ref = str(ref).strip()
    if ref in _cache:
        return _cache[ref]
    south, west, north, east = MAGDEBURG_BBOX
    query = (
        f'[out:json][timeout:60];'
        f'relation["route"]["ref"="{ref}"]["route"~"bus|tram"]'
        f'({south},{west},{north},{east});'
        f'out geom;'
    )
    try:
        last_err = None
        for url in OVERPASS_URLS:
            for attempt in range(2):
                try:
                    async with httpx.AsyncClient(timeout=120, headers={"User-Agent": "PerixMobility/1.0 (app.perixapp.com)"}) as client:
                        resp = await client.get(url, params={"data": query})
                        resp.raise_for_status()
                        data = resp.json()
                    break
                except Exception as e:
                    last_err = e
                    import asyncio as _a

                    await _a.sleep(2 * (attempt + 1))
            else:
                continue
            break
        else:
            raise last_err
        best = []
        for el in data.get("elements", []):
            if el.get("type") != "relation":
                continue
            chain = _chain_ways(el.get("members", []))
            if len(chain) > len(best):
                best = chain
        _cache[ref] = best
        logger.info(f"[osm] route {ref}: {len(best)} points")
        return best
    except Exception as e:
        logger.warning(f"[osm] route {ref} failed: {e}")
        _cache[ref] = []
        return []
