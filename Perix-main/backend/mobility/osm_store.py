"""Perix Local OSM Graph Store.

The Magdeburg road/rail graph is imported ONCE into our own database as a
versioned snapshot and served to the pattern reconstruction locally.
Public Overpass instances are only an importer/updater - never a live
runtime dependency. An Overpass outage can never stop the map again: the
active snapshot keeps serving everything (lines, vehicles, closures).

Layout:
- mobility_osm_graph_meta: one doc {key: graph_meta, active_v, ...}
- mobility_osm_ways: one doc per OSM way {way_id, region, kind, graph_v,
  bbox fields, nodes, points, name, tags}
"""
import asyncio
import time
from typing import List, Optional

from database import db

REGION = "magdeburg"
META_KEY = "graph_meta"
_CHUNK = 2000

ROAD_QUADRANTS = [
    (52.00, 11.45, 52.125, 11.625),
    (52.00, 11.625, 52.125, 11.80),
    (52.125, 11.45, 52.25, 11.625),
    (52.125, 11.625, 52.25, 11.80),
]
RAIL_QUADRANTS = ROAD_QUADRANTS


async def _fetch_quads(quadrants, mode: str) -> tuple:
    from mobility.roads import _fetch_ways_detailed

    by_id = {}
    failed = 0
    for bbox in quadrants:
        try:
            part = await _fetch_ways_detailed(bbox, mode, with_names=True)
            for w in part:
                by_id[int(w.get("id") or 0)] = w
            await asyncio.sleep(3)
        except Exception as e:
            failed += 1
            print(f"[osm_store] quadrant fetch failed {bbox}: {type(e).__name__}", flush=True)
    return list(by_id.values()), failed


async def active_version() -> Optional[int]:
    meta = await db.mobility_osm_graph_meta.find_one({"key": META_KEY})
    return meta.get("active_v") if meta else None


async def import_snapshot(force_new: bool = False) -> dict:
    """Download the full Magdeburg road+rail graph and activate it.

    When a fresh snapshot already exists (< 12h), MERGE the fetched ways
    into it (upsert by way_id) - this backfills quadrants that failed on
    the first pass without churning the active graph. Otherwise create a
    new version and swap active_v atomically (old one untouched)."""
    roads, roads_failed = await _fetch_quads(ROAD_QUADRANTS, "bus")
    rails, rails_failed = await _fetch_quads(RAIL_QUADRANTS, "tram")
    if not roads and not rails:
        print("[osm_store] import aborted (no ways fetched)", flush=True)
        return {"ok": False, "roads": 0, "rails": 0, "failed": roads_failed + rails_failed}
    meta = await db.mobility_osm_graph_meta.find_one({"key": META_KEY})
    active = meta.get("active_v") if meta else None
    age = time.time() - float((meta or {}).get("imported_at") or 0)
    merged = bool(active) and not force_new and age < 12 * 3600
    v = int(active) if merged else int(time.time())

    docs = []
    for kind, ways in (("road", roads), ("rail", rails)):
        for w in ways:
            pts = w.get("points") or []
            lats = [p[0] for p in pts]
            lngs = [p[1] for p in pts]
            docs.append(
                {
                    "way_id": int(w.get("id") or 0),
                    "region": REGION,
                    "kind": kind,
                    "graph_v": v,
                    "min_lat": min(lats),
                    "max_lat": max(lats),
                    "min_lng": min(lngs),
                    "max_lng": max(lngs),
                    "nodes": [int(x) for x in (w.get("nodes") or [])],
                    "points": [[round(p[0], 6), round(p[1], 6)] for p in pts],
                    "name": w.get("name"),
                    "tags": w.get("tags") or {},
                }
            )
    for d in docs:
        await db.mobility_osm_ways.replace_one(
            {"way_id": d["way_id"], "region": REGION, "graph_v": v}, d, upsert=True
        )
    await db.mobility_osm_graph_meta.replace_one(
        {"key": META_KEY},
        {
            "key": META_KEY,
            "region": REGION,
            "active_v": v,
            "imported_at": time.time(),
            "roads": await db.mobility_osm_ways.count_documents({"region": REGION, "kind": "road", "graph_v": v}),
            "rails": await db.mobility_osm_ways.count_documents({"region": REGION, "kind": "rail", "graph_v": v}),
        },
        upsert=True,
    )
    if not merged:
        await db.mobility_osm_ways.delete_many({"region": REGION, "graph_v": {"$ne": v}})
    action = "merged into" if merged else "activated new"
    print(
        f"[osm_store] snapshot v{v} {action}: fetched {len(roads)} roads, {len(rails)} rails",
        flush=True,
    )
    return {"ok": True, "v": v, "roads": len(roads), "rails": len(rails), "merged": merged, "failed": roads_failed + rails_failed}


async def get_local_ways(bbox: tuple, mode: str) -> List[dict]:
    """Ways inside the bbox from the ACTIVE local snapshot (no internet)."""
    meta = await db.mobility_osm_graph_meta.find_one({"key": META_KEY})
    v = meta.get("active_v") if meta else None
    if v is None:
        return []
    kind = "rail" if mode == "tram" else "road"
    s, w, n, e = bbox
    margin = 0.003
    docs = await db.mobility_osm_ways.find(
        {
            "region": REGION,
            "kind": kind,
            "graph_v": v,
            "min_lat": {"$lte": n + margin},
            "max_lat": {"$gte": s - margin},
            "min_lng": {"$lte": e + margin},
            "max_lng": {"$gte": w - margin},
        },
        {"_id": 0, "region": 0, "kind": 0, "graph_v": 0, "min_lat": 0, "max_lat": 0, "min_lng": 0, "max_lng": 0},
    ).to_list(50000)
    out = []
    for d in docs:
        out.append(
            {
                "id": d.get("way_id"),
                "nodes": d.get("nodes") or [],
                "points": d.get("points") or [],
                "name": d.get("name"),
                "tags": d.get("tags") or {},
            }
        )
    return out
