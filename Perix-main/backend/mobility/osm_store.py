"""Perix local OSM graph/infrastructure store.

The active mobility region is configuration-driven. Roads, rails and signal
nodes are imported into a versioned local snapshot. Public Overpass instances
are importer/update sources only; runtime route reconstruction reads MongoDB.

Storage is namespaced by region_id so several cities may coexist in one DB even
though Phase 1 runs one active region per deployment.
"""
import asyncio
import time
from typing import List, Optional

from database import db
from mobility.regions import get_active_region, get_region, split_bbox

_CHUNK = 2000


def _meta_key(region_id: str) -> str:
    return f"graph_meta:{region_id}"


def _region(region_id: Optional[str] = None):
    return get_region(region_id) if region_id else get_active_region()


async def _fetch_quads(quadrants, mode: str) -> tuple:
    from mobility.roads import _fetch_ways_detailed

    by_id = {}
    failed = 0
    for bbox in quadrants:
        try:
            part = await _fetch_ways_detailed(bbox, mode, with_names=True)
            for way in part:
                by_id[int(way.get("id") or 0)] = way
            await asyncio.sleep(3)
        except Exception as exc:
            failed += 1
            print(f"[osm_store] {mode} quadrant fetch failed {bbox}: {type(exc).__name__}: {exc}", flush=True)
    return list(by_id.values()), failed


async def _fetch_signal_quads(quadrants) -> tuple:
    from mobility.signals import fetch_signals_detailed

    by_id = {}
    failed = 0
    for bbox in quadrants:
        try:
            part = await fetch_signals_detailed(bbox)
            for signal in part:
                by_id[int(signal.get("id") or 0)] = signal
            await asyncio.sleep(3)
        except Exception as exc:
            failed += 1
            print(
                f"[osm_store] signal quadrant fetch failed {bbox}: {type(exc).__name__}: {exc}",
                flush=True,
            )
    return list(by_id.values()), failed


async def active_version(region_id: Optional[str] = None) -> Optional[int]:
    region = _region(region_id)
    meta = await db.mobility_osm_graph_meta.find_one({"key": _meta_key(region.region_id)})
    return meta.get("active_v") if meta else None


async def snapshot_meta(region_id: Optional[str] = None) -> Optional[dict]:
    region = _region(region_id)
    return await db.mobility_osm_graph_meta.find_one(
        {"key": _meta_key(region.region_id)},
        {"_id": 0},
    )


async def import_snapshot(force_new: bool = False, region_id: Optional[str] = None) -> dict:
    """Download one region's road/rail/signal snapshot and activate it."""
    region = _region(region_id)
    # 16 small tiles instead of 4 large quadrants: each Overpass request is
    # far lighter, and one failing tile only costs a small repair merge
    # instead of losing a quarter of the city. (Large quadrant queries hit
    # mirror read timeouts on busy public Overpass instances.)
    quadrants = split_bbox(region.bbox, rows=4, cols=4)

    roads = []
    rails = []
    roads_failed = rails_failed = 0
    if "bus" in region.modes:
        roads, roads_failed = await _fetch_quads(quadrants, "bus")
    if "tram" in region.modes:
        rails, rails_failed = await _fetch_quads(quadrants, "tram")
    signals, signals_failed = await _fetch_signal_quads(quadrants)
    total_failed = roads_failed + rails_failed + signals_failed

    if not roads and not rails and not signals:
        print(
            f"[osm_store] {region.region_id}: import aborted (no OSM objects fetched)",
            flush=True,
        )
        return {
            "ok": False,
            "region_id": region.region_id,
            "network_id": region.network_id,
            "roads": 0,
            "rails": 0,
            "signals": 0,
            "failed": total_failed,
        }

    meta_key = _meta_key(region.region_id)
    meta = await db.mobility_osm_graph_meta.find_one({"key": meta_key})
    active = meta.get("active_v") if meta else None
    age = time.time() - float((meta or {}).get("imported_at") or 0)
    merged = bool(active) and not force_new and age < 12 * 3600
    version = int(active) if merged else int(time.time())

    way_docs = []
    for kind, ways in (("road", roads), ("rail", rails)):
        for way in ways:
            points = way.get("points") or []
            if len(points) < 2:
                continue
            lats = [float(p[0]) for p in points]
            lngs = [float(p[1]) for p in points]
            way_docs.append(
                {
                    "way_id": int(way.get("id") or 0),
                    "region_id": region.region_id,
                    "network_id": region.network_id,
                    "kind": kind,
                    "graph_v": version,
                    "min_lat": min(lats),
                    "max_lat": max(lats),
                    "min_lng": min(lngs),
                    "max_lng": max(lngs),
                    "nodes": [int(x) for x in (way.get("nodes") or [])],
                    "points": [[round(float(p[0]), 6), round(float(p[1]), 6)] for p in points],
                    "name": way.get("name"),
                    "tags": way.get("tags") or {},
                }
            )

    for doc in way_docs:
        await db.mobility_osm_ways.replace_one(
            {
                "way_id": doc["way_id"],
                "region_id": region.region_id,
                "kind": doc["kind"],
                "graph_v": version,
            },
            doc,
            upsert=True,
        )

    for signal in signals:
        doc = {
            "signal_id": int(signal.get("id") or 0),
            "region_id": region.region_id,
            "network_id": region.network_id,
            "graph_v": version,
            "latitude": round(float(signal.get("lat")), 7),
            "longitude": round(float(signal.get("lng")), 7),
            "kinds": list(signal.get("kinds") or []),
            "tags": signal.get("tags") or {},
        }
        await db.mobility_osm_signals.replace_one(
            {
                "signal_id": doc["signal_id"],
                "region_id": region.region_id,
                "graph_v": version,
            },
            doc,
            upsert=True,
        )

    counts = {
        "roads": await db.mobility_osm_ways.count_documents(
            {"region_id": region.region_id, "kind": "road", "graph_v": version}
        ),
        "rails": await db.mobility_osm_ways.count_documents(
            {"region_id": region.region_id, "kind": "rail", "graph_v": version}
        ),
        "signals": await db.mobility_osm_signals.count_documents(
            {"region_id": region.region_id, "graph_v": version}
        ),
    }
    await db.mobility_osm_graph_meta.replace_one(
        {"key": meta_key},
        {
            "key": meta_key,
            "region_id": region.region_id,
            "network_id": region.network_id,
            "active_v": version,
            "bbox": list(region.bbox),
            "imported_at": time.time(),
            **counts,
        },
        upsert=True,
    )

    if not merged:
        await db.mobility_osm_ways.delete_many(
            {"region_id": region.region_id, "graph_v": {"$ne": version}}
        )
        await db.mobility_osm_signals.delete_many(
            {"region_id": region.region_id, "graph_v": {"$ne": version}}
        )

    action = "merged into" if merged else "activated new"
    print(
        f"[osm_store] {region.region_id} snapshot v{version} {action}: "
        f"{counts['roads']} roads, {counts['rails']} rails, {counts['signals']} signals",
        flush=True,
    )
    return {
        "ok": True,
        "region_id": region.region_id,
        "network_id": region.network_id,
        "v": version,
        **counts,
        "merged": merged,
        "failed": total_failed,
    }


async def get_local_ways(
    bbox: tuple,
    mode: str,
    *,
    region_id: Optional[str] = None,
    graph_v: Optional[int] = None,
) -> List[dict]:
    """Ways inside bbox from one region's local snapshot."""
    region = _region(region_id)
    version = graph_v if graph_v is not None else await active_version(region.region_id)
    if version is None:
        return []
    kind = "rail" if mode == "tram" else "road"
    south, west, north, east = bbox
    margin = 0.003
    docs = await db.mobility_osm_ways.find(
        {
            "region_id": region.region_id,
            "kind": kind,
            "graph_v": int(version),
            "min_lat": {"$lte": north + margin},
            "max_lat": {"$gte": south - margin},
            "min_lng": {"$lte": east + margin},
            "max_lng": {"$gte": west - margin},
        },
        {
            "_id": 0,
            "region_id": 0,
            "network_id": 0,
            "kind": 0,
            "graph_v": 0,
            "min_lat": 0,
            "max_lat": 0,
            "min_lng": 0,
            "max_lng": 0,
        },
    ).to_list(50000)
    return [
        {
            "id": doc.get("way_id"),
            "nodes": doc.get("nodes") or [],
            "points": doc.get("points") or [],
            "name": doc.get("name"),
            "tags": doc.get("tags") or {},
        }
        for doc in docs
    ]


async def get_local_ways_by_ids(
    way_ids: List[int],
    mode: str,
    *,
    region_id: Optional[str] = None,
    graph_v: Optional[int] = None,
) -> List[dict]:
    if not way_ids:
        return []
    region = _region(region_id)
    version = graph_v if graph_v is not None else await active_version(region.region_id)
    if version is None:
        return []
    kind = "rail" if mode == "tram" else "road"
    ids = sorted({int(x) for x in way_ids})
    docs = await db.mobility_osm_ways.find(
        {
            "region_id": region.region_id,
            "kind": kind,
            "graph_v": int(version),
            "way_id": {"$in": ids},
        },
        {"_id": 0},
    ).to_list(max(1, len(ids)))
    return [
        {
            "id": doc.get("way_id"),
            "nodes": doc.get("nodes") or [],
            "points": doc.get("points") or [],
            "name": doc.get("name"),
            "tags": doc.get("tags") or {},
        }
        for doc in docs
    ]


async def get_local_signals(
    bbox: Optional[tuple] = None,
    *,
    region_id: Optional[str] = None,
    graph_v: Optional[int] = None,
) -> List[dict]:
    """Signal nodes from one region/snapshot, optionally restricted by bbox."""
    region = _region(region_id)
    version = graph_v if graph_v is not None else await active_version(region.region_id)
    if version is None:
        return []

    query = {"region_id": region.region_id, "graph_v": int(version)}
    if bbox is not None:
        south, west, north, east = bbox
        query.update(
            {
                "latitude": {"$gte": south, "$lte": north},
                "longitude": {"$gte": west, "$lte": east},
            }
        )
    docs = await db.mobility_osm_signals.find(query, {"_id": 0}).to_list(50000)
    return docs
