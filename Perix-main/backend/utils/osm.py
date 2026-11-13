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
# Kept as fallback; active regions resolve their own bbox via mobility.regions.
MAGDEBURG_BBOX = (52.02, 11.50, 52.25, 11.76)  # south, west, north, east


def _active_bbox_and_modes():
    """Region bbox + OSM route filter for the active mobility region.

    Magdeburg resolves to the legacy MAGDEBURG_BBOX + bus|tram so current
    behaviour is byte-identical. Other regions use their configured bbox
    and extend the filter only for modes they declare.
    """
    try:
        from mobility.regions import get_active_region

        region = get_active_region()
        bbox = tuple(region.bbox)
        modes = {str(m).strip().lower() for m in (region.modes or ())}
        if region.region_id == "magdeburg":
            return MAGDEBURG_BBOX, "bus|tram"
        # Other regions query exactly the modes they declare, keeping
        # Overpass load minimal (Gardelegen bus-only -> "bus").
        filt = []
        if "bus" in modes:
            filt.append("bus")
        if "tram" in modes:
            filt.append("tram")
        if "subway" in modes or "u-bahn" in modes or "metro" in modes:
            filt.append("subway")
        if "s-bahn" in modes or "s Bahn" in modes or "rail" in modes:
            filt.extend(["light_rail", "rail", "train"])
        if "ferry" in modes:
            filt.append("ferry")
        if "trolleybus" in modes:
            filt.append("trolleybus")
        # de-duplicate while keeping order
        seen = set()
        filt = [x for x in filt if not (x in seen or seen.add(x))]
        return bbox, "|".join(filt)
    except Exception:
        return MAGDEBURG_BBOX, "bus|tram"

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


async def fetch_route_shape(ref: str, route_mode: str = "") -> list:
    """Geometry for a line (e.g. ref='52') as [[lat, lng], ...].

    Uses the active region bbox/modes; magdeburg behaviour is unchanged.
    Cache is namespaced by region so Berlin/Gardelegen shapes never leak
    into the Magdeburg network.
    """
    ref = str(ref).strip()
    south, west, north, east = MAGDEBURG_BBOX
    route_filter = "bus|tram"
    region_id = "magdeburg"
    try:
        bbox, route_filter = _active_bbox_and_modes()
        south, west, north, east = bbox
        from mobility.regions import get_active_region

        region_id = get_active_region().region_id
    except Exception:
        pass
    cache_key = f"{region_id}:{route_filter}:{ref}:{str(route_mode or '').lower()}"
    if cache_key in _cache:
        return _cache[cache_key]
    query = (
        f'[out:json][timeout:60];'
        f'relation["route"]["ref"="{ref}"]["route"~"{route_filter}"]'
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
        _cache[cache_key] = best
        logger.info(f"[osm] route {ref}: {len(best)} points")
        return best
    except Exception as e:
        logger.warning(f"[osm] route {ref} failed: {e}")
        _cache[cache_key] = []
        return []
