"""In-process cache of the geometry the map and vehicles actually use.

Phase 2.2 stores metadata next to the points so motion can prove that
path geometry and infrastructure come from the same atomic generation.
The get_cached(pattern_id) API remains backward-compatible for map-match
and telemetry callers.
"""
from typing import Dict, List, Optional

_RESOLVED: Dict[str, dict] = {}
_VERSION: Optional[str] = None
_REVISION: int = 0


def revision() -> int:
    return _REVISION


def bump_revision() -> int:
    global _REVISION
    _REVISION += 1
    return _REVISION


def set_cached(
    pattern_id: str,
    points: List[list],
    *,
    version_id: Optional[str] = None,
    generation_id: Optional[str] = None,
    source: Optional[str] = None,
    osm_snapshot_v: Optional[int] = None,
    geometry_fingerprint: Optional[str] = None,
) -> None:
    if not points or len(points) < 2:
        return
    _RESOLVED[str(pattern_id)] = {
        "points": [[float(p[0]), float(p[1])] for p in points],
        "version_id": str(version_id) if version_id else None,
        "generation_id": str(generation_id) if generation_id else None,
        "source": source,
        "osm_snapshot_v": int(osm_snapshot_v) if osm_snapshot_v is not None else None,
        "geometry_fingerprint": geometry_fingerprint,
    }


def get_entry(pattern_id: str, version_id: Optional[str] = None) -> Optional[dict]:
    entry = _RESOLVED.get(str(pattern_id))
    if not entry:
        return None
    if version_id and entry.get("version_id") not in (None, str(version_id)):
        return None
    return entry


def get_cached(pattern_id: str, version_id: Optional[str] = None) -> Optional[List[list]]:
    entry = get_entry(pattern_id, version_id)
    return (entry or {}).get("points")


def get_version() -> Optional[str]:
    return _VERSION


async def warm_from_generations(version_id: str) -> int:
    """Warm only ready atomic generations for exactly one version."""
    from mobility.generations import list_pattern_generations

    global _VERSION
    _RESOLVED.clear()
    docs = await list_pattern_generations(str(version_id))
    for doc in docs:
        geometry = doc.get("geometry") or {}
        set_cached(
            str(doc.get("pattern_id")),
            geometry.get("points") or [],
            version_id=str(version_id),
            generation_id=doc.get("generation_id"),
            source=geometry.get("source"),
            osm_snapshot_v=doc.get("osm_snapshot_v"),
            geometry_fingerprint=geometry.get("geometry_fingerprint"),
        )
    _VERSION = str(version_id)
    return len(_RESOLVED)


async def warm_from_db(version_id: Optional[str] = None) -> int:
    """Legacy rollback warmer. Clears first; never mixes versions."""
    from database import db

    global _VERSION
    _RESOLVED.clear()
    query = {"version_id": version_id} if version_id else {}
    docs = await db.mobility_road_geometries.find(query, {"_id": 0}).to_list(2000)
    for doc in docs:
        points = doc.get("points") or []
        if len(points) >= 2:
            set_cached(
                str(doc.get("pattern_id")),
                points,
                version_id=str(doc.get("version_id") or version_id or "") or None,
                generation_id=doc.get("derived_generation"),
                source=doc.get("source"),
                osm_snapshot_v=doc.get("osm_snapshot_v"),
            )
    if version_id:
        _VERSION = str(version_id)
    return len(_RESOLVED)


def clear() -> None:
    global _VERSION
    _RESOLVED.clear()
    _VERSION = None
