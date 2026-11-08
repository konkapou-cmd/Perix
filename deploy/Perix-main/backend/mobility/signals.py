"""OSM traffic-signal importer and normalization.

This module only knows how to identify signal nodes in OSM. It does not decide
which transit pattern uses a signal and it never computes delay. Pattern
matching belongs to mobility.infrastructure; movement physics belongs to the
future bus/tram motion engines.
"""
from typing import List, Optional, Tuple

from mobility.osm_client import overpass_json

ROAD_SIGNAL = "ROAD_SIGNAL"
RAIL_SIGNAL = "RAIL_SIGNAL"


def normalize_signal(element: dict) -> Optional[dict]:
    """Normalize one Overpass node into the stable Perix signal shape."""
    if element.get("type") != "node":
        return None

    tags = element.get("tags") or {}
    kinds = []

    if tags.get("highway") == "traffic_signals":
        kinds.append(ROAD_SIGNAL)
    if tags.get("railway") == "signal":
        kinds.append(RAIL_SIGNAL)

    if not kinds or element.get("id") is None:
        return None
    if element.get("lat") is None or element.get("lon") is None:
        return None

    return {
        "id": int(element["id"]),
        "lat": float(element["lat"]),
        "lng": float(element["lon"]),
        "kinds": kinds,
        "tags": tags,
    }


async def fetch_signals_detailed(
    bbox: Tuple[float, float, float, float]
) -> List[dict]:
    """Fetch road traffic lights and rail/tram signals inside one bbox."""
    s, w, n, e = bbox
    query = (
        f"[out:json][timeout:90];("
        f'node["highway"="traffic_signals"]({s},{w},{n},{e});'
        f'node["railway"="signal"]({s},{w},{n},{e});'
        f");out body;"
    )
    data = await overpass_json(query)

    out = []
    for element in data.get("elements", []):
        signal = normalize_signal(element)
        if signal:
            out.append(signal)
    return out
