"""Perix local OSM graph/infrastructure store.

The active mobility region is configuration-driven. Roads, rails and signal
nodes are imported into a versioned local snapshot. Public Overpass instances
are importer/update sources only; runtime route reconstruction reads MongoDB.

Storage is namespaced by region_id so several cities may coexist in one DB even
though Phase 1 runs one active region per deployment.
"""
import asyncio
import hashlib
import json
import math
import re
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


def _offline_sources(sources: dict, region) -> tuple:
    """Validate an internally supplied, audited full-bbox OSM source bundle.

    This is not a public upload API. The operator must pin the bundle hash and
    verify its PBF coverage audit before supplying it to the existing importer.
    """
    if sources.get("schema") != "perix-osm-source-v1":
        raise ValueError("INVALID_SOURCE_SCHEMA")
    if (sources.get("region_id"), sources.get("network_id"), sources.get("bbox")) != (
        region.region_id, region.network_id, list(region.bbox)
    ):
        raise ValueError("SOURCE_SCOPE_MISMATCH")
    elements = sources.get("elements")
    if not isinstance(elements, list) or len(elements) > 250000:
        raise ValueError("SOURCE_SIZE_LIMIT")
    digest = hashlib.sha256(json.dumps(elements, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()
    if digest != sources.get("elements_sha256"):
        raise ValueError("SOURCE_HASH_MISMATCH")
    provenance = sources.get("provenance") or {}
    if (not re.fullmatch(r"[0-9a-f]{64}", provenance.get("sha256", ""))
            or not provenance.get("source_timestamp") or not provenance.get("polygon_contains_bbox")
            or provenance.get("missing_node_references") != 0):
        raise ValueError("SOURCE_PROVENANCE_INCOMPLETE")
    from mobility.roads import HIGHWAY_FILTER, RAILWAY_FILTER
    from mobility.signals import normalize_signal

    roads, rails, signals = [], [], []
    seen = set()
    for el in elements:
        key = (el.get("type"), el.get("id"))
        if not isinstance(key[1], int) or key[1] <= 0 or key in seen:
            raise ValueError("SOURCE_DUPLICATE_OR_INVALID_ID")
        seen.add(key)
        tags = el.get("tags") or {}
        if key[0] == "way":
            geometry, nodes = el.get("geometry") or [], el.get("nodes") or []
            if len(nodes) < 2 or len(nodes) != len(geometry) or any(not isinstance(n, int) or n <= 0 for n in nodes):
                raise ValueError("SOURCE_INCOMPLETE_WAY")
            points = [[p["lat"], p["lon"]] for p in geometry]
            way = {"id": key[1], "nodes": nodes, "points": points, "tags": tags, "name": tags.get("name")}
            kinds = []
            if "bus" in region.modes and re.fullmatch(HIGHWAY_FILTER, tags.get("highway", "")):
                roads.append(way)
                kinds.append("roads")
            if "tram" in region.modes and re.fullmatch(RAILWAY_FILTER, tags.get("railway", "")):
                rails.append(way)
                kinds.append("rails")
            if not kinds:
                raise ValueError("SOURCE_UNQUERIED_WAY")
        elif key[0] == "node":
            signal = normalize_signal(el)
            if not signal:
                raise ValueError("SOURCE_UNQUERIED_NODE")
            points = [[el["lat"], el["lon"]]]
            signals.append(signal)
        else:
            raise ValueError("SOURCE_INVALID_ELEMENT")
        if any(not math.isfinite(float(lat)) or not math.isfinite(float(lon))
               or not -90 <= lat <= 90 or not -180 <= lon <= 180 for lat, lon in points):
            raise ValueError("SOURCE_INVALID_COORDINATES")
        south, west, north, east = region.bbox
        if not any(south <= lat <= north and west <= lon <= east for lat, lon in points):
            raise ValueError("SOURCE_OUTSIDE_BBOX")
    counts = {"roads": len(roads), "rails": len(rails), "signals": len(signals)}
    coverage = sources.get("coverage") or {}
    for layer in ("roads", "rails", "signals"):
        audit = coverage.get(layer) or {}
        if (audit.get("bbox") != list(region.bbox) or audit.get("failed") != 0
                or audit.get("complete") is not True or audit.get("expected") != counts[layer]):
            raise ValueError("SOURCE_INCOMPLETE_COVERAGE:" + layer)
    return roads, rails, signals, {"elements_sha256": digest, "provenance": provenance, "coverage": coverage}


async def import_snapshot(force_new: bool = False, region_id: Optional[str] = None, *, sources: Optional[dict] = None) -> dict:
    """Fetch a complete snapshot before replacing the active graph.

    force_new is retained for existing callers; all successful imports now
    use a fresh version so an interrupted write cannot alter the active graph.
    """
    region = _region(region_id)
    # 16 small tiles instead of 4 large quadrants: each Overpass request is
    # far lighter. Every required tile must succeed before storage. (Large queries hit
    # mirror read timeouts on busy public Overpass instances.)
    quadrants = split_bbox(region.bbox, rows=4, cols=4)

    roads = []
    rails = []
    roads_failed = rails_failed = 0
    source_meta = None
    signals_failed = 0
    if sources is not None:
        roads, rails, signals, source_meta = _offline_sources(sources, region)
    else:
        if "bus" in region.modes:
            roads, roads_failed = await _fetch_quads(quadrants, "bus")
        if "tram" in region.modes:
            rails, rails_failed = await _fetch_quads(quadrants, "tram")
        signals, signals_failed = await _fetch_signal_quads(quadrants)
    total_failed = roads_failed + rails_failed + signals_failed
    meta_key = _meta_key(region.region_id)
    meta = await db.mobility_osm_graph_meta.find_one({"key": meta_key})
    active = meta.get("active_v") if meta else None
    attempt = {
        "attempted_at": time.time(),
        "tiles_per_layer": len(quadrants),
        "roads_failed": roads_failed,
        "rails_failed": rails_failed,
        "signals_failed": signals_failed,
        "failed": total_failed,
    }
    if source_meta is not None:
        attempt["source"] = source_meta

    if (
        total_failed
        or ("bus" in region.modes and not roads)
        or ("tram" in region.modes and not rails)
        or not (roads or rails or signals)
    ):
        attempt.update(ok=False, reason="INCOMPLETE_SNAPSHOT")
        await db.mobility_osm_graph_meta.update_one(
            {"key": meta_key},
            {
                "$set": {"last_import_attempt": attempt},
                "$setOnInsert": {
                    "region_id": region.region_id,
                    "network_id": region.network_id,
                },
            },
            upsert=True,
        )
        print(
            f"[osm_store] {region.region_id}: incomplete snapshot rejected; "
            f"failed tiles roads={roads_failed} rails={rails_failed} signals={signals_failed}",
            flush=True,
        )
        return {
            "ok": False,
            "region_id": region.region_id,
            "network_id": region.network_id,
            "reason": "INCOMPLETE_SNAPSHOT",
            "v": active,
            "roads": len(roads),
            "rails": len(rails),
            "signals": len(signals),
            "failed": total_failed,
            "last_import_attempt": attempt,
        }

    version = max(int(time.time()), int(active or 0) + 1)

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
    expected = {
        "roads": len(roads),
        "rails": len(rails),
        "signals": len(signals),
    }
    if counts != expected:
        attempt.update(ok=False, reason="SNAPSHOT_COUNT_MISMATCH")
        await db.mobility_osm_graph_meta.update_one(
            {"key": meta_key},
            {
                "$set": {"last_import_attempt": attempt},
                "$setOnInsert": {
                    "region_id": region.region_id,
                    "network_id": region.network_id,
                },
            },
            upsert=True,
        )
        return {
            "ok": False,
            "reason": "SNAPSHOT_COUNT_MISMATCH",
            "region_id": region.region_id,
            "network_id": region.network_id,
            "v": active,
            "failed": total_failed,
            "expected": expected,
            "stored": counts,
            "last_import_attempt": attempt,
        }
    attempt.update(ok=True)
    await db.mobility_osm_graph_meta.replace_one(
        {"key": meta_key},
        {
            "key": meta_key,
            "region_id": region.region_id,
            "network_id": region.network_id,
            "active_v": version,
            "bbox": list(region.bbox),
            "imported_at": time.time(),
            "last_import_attempt": attempt,
            **counts,
        },
        upsert=True,
    )

    await db.mobility_osm_ways.delete_many(
        {"region_id": region.region_id, "graph_v": {"$ne": version}}
    )
    await db.mobility_osm_signals.delete_many(
        {"region_id": region.region_id, "graph_v": {"$ne": version}}
    )

    print(
        f"[osm_store] {region.region_id} snapshot v{version} activated new: "
        f"{counts['roads']} roads, {counts['rails']} rails, {counts['signals']} signals",
        flush=True,
    )
    return {
        "ok": True,
        "region_id": region.region_id,
        "network_id": region.network_id,
        "v": version,
        **counts,
        "merged": False,
        "failed": total_failed,
        "last_import_attempt": attempt,
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
