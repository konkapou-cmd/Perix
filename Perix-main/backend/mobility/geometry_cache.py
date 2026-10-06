"""In-process cache of RESOLVED pattern geometry (OSM roads/rails) so the
sync vehicle estimator can use exactly the same geometry as the V2 map
lines. Populated by the background precompute worker - a marker never
falls back to a fake stop-to-stop line."""
from typing import Dict, List, Optional

_RESOLVED: Dict[str, List[list]] = {}
_VERSION: Optional[str] = None


def set_cached(pattern_id: str, points: List[list]) -> None:
    if points and len(points) >= 2:
        _RESOLVED[str(pattern_id)] = points


def get_cached(pattern_id: str) -> Optional[List[list]]:
    return _RESOLVED.get(str(pattern_id))


def get_version() -> Optional[str]:
    return _VERSION


async def warm_from_db(version_id: Optional[str] = None) -> int:
    """Load all resolved geometries for a network version into the cache.
    Returns the number of patterns warmed."""
    from database import db

    global _VERSION
    query = {"version_id": version_id} if version_id else {}
    docs = await db.mobility_road_geometries.find(query, {"_id": 0}).to_list(2000)
    for d in docs:
        pts = d.get("points") or []
        if len(pts) >= 2:
            _RESOLVED[str(d.get("pattern_id"))] = pts
    if version_id:
        _VERSION = version_id
    return len(_RESOLVED)


def clear() -> None:
    _RESOLVED.clear()
