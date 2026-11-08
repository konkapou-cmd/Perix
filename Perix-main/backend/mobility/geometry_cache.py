"""In-process cache of the geometry the map and vehicles actually use.

Phase 2.2 stores metadata next to the points so motion can prove that
path geometry and infrastructure come from the same atomic generation.
The get_cached(pattern_id) API remains backward-compatible for map-match
and telemetry callers.
"""
from typing import Dict, List, Optional
from threading import Lock

_RESOLVED: Dict[object, dict] = {}
_VERSION: Optional[str] = None
_REVISION: int = 0
_WRITE_LOCK = Lock()


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
    direction_contract: Optional[dict] = None,
    direction_verified: bool = False,
    pattern_fingerprint: Optional[str] = None,
) -> None:
    if not points or len(points) < 2:
        return
    key = (str(pattern_id), str(version_id)) if version_id else str(pattern_id)
    entry = {
        "points": [[float(p[0]), float(p[1])] for p in points],
        "version_id": str(version_id) if version_id else None,
        "generation_id": str(generation_id) if generation_id else None,
        "source": source,
        "osm_snapshot_v": int(osm_snapshot_v) if osm_snapshot_v is not None else None,
        "geometry_fingerprint": geometry_fingerprint,
        "direction_contract": direction_contract,
        "direction_verified": direction_verified is True,
        "pattern_fingerprint": pattern_fingerprint,
    }
    with _WRITE_LOCK:
        _RESOLVED[key] = entry


def invalidate_generation(pattern_id: str, version_id: str, generation_id: str) -> bool:
    """Remove only the exact stale atomic entry, never a concurrently newer one.

    No DB write or retry: the next ordinary path read reloads its bundle.
    Manual/legacy entries are not evidence of a stale atomic generation.
    """
    global _REVISION
    if not pattern_id or not version_id or not generation_id:
        return False
    key = (str(pattern_id), str(version_id))
    with _WRITE_LOCK:
        entry = _RESOLVED.get(key)
        if (not entry or entry.get('generation_id') != str(generation_id)
                or entry.get('source') == 'PERIX_MANUAL'):
            return False
        del _RESOLVED[key]
        _REVISION += 1  # Invalidate projections without mutating in-flight paths.
        return True


def get_entry(pattern_id: str, version_id: Optional[str] = None) -> Optional[dict]:
    entry = _RESOLVED.get((str(pattern_id), str(version_id))) if version_id else None
    if entry is None:
        entry = _RESOLVED.get(str(pattern_id))
    if entry is None and not version_id and _VERSION:
        entry = _RESOLVED.get((str(pattern_id), _VERSION))
    if not entry:
        return None
    if version_id and entry.get("version_id") != str(version_id):
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
        contract = doc.get('direction_contract')
        verified = False
        if contract:
            from mobility.direction_contract import build_direction_contract, DirectionContractError
            try:
                verified = contract == build_direction_contract(scope=doc,
                    pattern=dict(mode=doc.get('mode'),route_number=doc.get('route_number'),
                        stop_ids=contract.get('ordered_stop_ids') or []),points=geometry.get('points') or [],
                    segments=doc.get('segments') or [],platforms=contract.get('platforms') or [])
            except (DirectionContractError,KeyError,TypeError,ValueError):
                verified = False
        set_cached(
            str(doc.get("pattern_id")),
            geometry.get("points") or [],
            version_id=str(version_id),
            generation_id=doc.get("generation_id"),
            source=geometry.get("source"),
            osm_snapshot_v=doc.get("osm_snapshot_v"),
            geometry_fingerprint=geometry.get("geometry_fingerprint"),
            direction_contract=doc.get('direction_contract'),
            direction_verified=verified,
            pattern_fingerprint=doc.get('pattern_fingerprint'),
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
