"""One-time migration for legacy mobility documents without city scope.

The repository baseline predates region_id/network_id and represents Magdeburg.
Run this once after deploying the multi-city schema, before adding another city.
It never guesses a city: it writes the currently configured active region.

This includes the legacy OSM snapshot: the old {key: "graph_meta"} metadata
and its unscoped ways/signals are re-scoped IN PLACE (same graph_v), so the
existing snapshot keeps serving instead of being re-downloaded from Overpass.

Usage from backend/:
    python -m scripts.backfill_mobility_region_scope --confirm
"""
import argparse
import asyncio
import time

from database import db
from mobility.regions import get_active_region

COLLECTIONS = (
    "bus_network_versions",
    "mobility_realtime",
    "mobility_service_alerts",
    "mobility_stop_overrides",
    "mobility_trip_overrides",
    "mobility_graph_overlays",
    "mobility_restrictions",
    "mobility_geometry_segments",
    "mobility_road_geometries",
)

_ID_KEYS = {
    "bus_network_versions": "version_id",
    "mobility_realtime": "trip_id",
    "mobility_service_alerts": "alert_hash",
    "mobility_stop_overrides": "override_id",
    "mobility_trip_overrides": "override_id",
    "mobility_graph_overlays": "overlay_id",
    "mobility_restrictions": "restriction_id",
    "mobility_geometry_segments": "segment_id",
    "mobility_road_geometries": "pattern_id",
}


async def _scope_legacy_collection(collection, region, confirm: bool) -> None:
    query = {"region_id": {"$exists": False}}
    count = await collection.count_documents(query)
    print(f"{collection.name}: {count} legacy documents")
    if not confirm or not count:
        return

    scope = {
        "region_id": region.region_id,
        "network_id": region.network_id,
    }
    try:
        await collection.update_many(query, {"$set": scope})
        return
    except Exception:
        # Collision-tolerant fallback: while the migration runs, an older
        # deployment may keep writing unscoped docs while the new workers
        # already write scoped twins for the same identity. A unique index
        # then rejects the bulk scope; drop the stale legacy twin instead.
        id_key = _ID_KEYS.get(collection.name, "_id")
        async for doc in collection.find(query, {"_id": 1, id_key: 1}):
            ident = doc.get(id_key)
            if ident is not None:
                twin_query = dict(scope)
                twin_query[id_key] = ident
                twin = await collection.find_one(twin_query, {"_id": 1})
                if twin:
                    await collection.delete_one({"_id": doc["_id"]})
                    continue
            await collection.update_one({"_id": doc["_id"]}, {"$set": scope})


async def _migrate_osm_snapshot_scope(region, confirm: bool) -> None:
    """Re-scope the legacy OSM graph snapshot without re-downloading it.

    The old snapshot lives under {key: "graph_meta"} with ways carrying
    region/kind/graph_v but no region_id/network_id. The region-scoped
    store queries by region_id, so without this migration the importer
    would treat the store as empty and re-fetch tens of thousands of ways
    from public Overpass.
    """
    new_key = f"graph_meta:{region.region_id}"
    legacy_meta = await db.mobility_osm_graph_meta.find_one({"key": "graph_meta"})
    scoped_meta = await db.mobility_osm_graph_meta.find_one({"key": new_key})

    if not legacy_meta and not scoped_meta:
        print("mobility_osm_graph_meta: no legacy or scoped snapshot (fresh import required)")
        return

    if legacy_meta:
        legacy_v = int(legacy_meta.get("active_v") or 0)
        orphan_ways = await db.mobility_osm_ways.count_documents(
            {"region_id": {"$exists": False}}
        )
        stray_ways = await db.mobility_osm_ways.count_documents(
            {"region_id": region.region_id, "graph_v": {"$ne": legacy_v}}
        )
        print(
            f"mobility_osm_graph_meta: legacy v{legacy_v} -> {new_key} "
            f"(reusing snapshot, no re-download)"
        )
        print(
            f"mobility_osm_ways: {orphan_ways} legacy unscoped, "
            f"{stray_ways} partial scoped with mismatched graph_v"
        )
        if confirm:
            doc = {
                **{k: v for k, v in legacy_meta.items() if k != "_id"},
                "key": new_key,
                "region_id": region.region_id,
                "network_id": region.network_id,
                # Mark the snapshot fresh so the worker MERGES repairs into
                # it instead of starting a brand-new snapshot right away.
                "imported_at": time.time(),
            }
            await db.mobility_osm_graph_meta.replace_one({"key": new_key}, doc, upsert=True)
            await db.mobility_osm_graph_meta.delete_one({"key": "graph_meta"})
            if orphan_ways:
                await db.mobility_osm_ways.update_many(
                    {"region_id": {"$exists": False}},
                    {
                        "$set": {
                            "region_id": region.region_id,
                            "network_id": region.network_id,
                        }
                    },
                )
            if stray_ways:
                await db.mobility_osm_ways.delete_many(
                    {"region_id": region.region_id, "graph_v": {"$ne": legacy_v}}
                )
            await db.mobility_osm_signals.delete_many(
                {"region_id": region.region_id, "graph_v": {"$ne": legacy_v}}
            )
            print("mobility_osm snapshot: re-scoped in place")
        return

    print(
        f"mobility_osm_graph_meta: scoped meta already exists "
        f"(v{scoped_meta.get('active_v')}) - nothing to migrate"
    )


async def _run(confirm: bool) -> None:
    region = get_active_region()
    print(
        f"legacy mobility scope target: region={region.region_id} "
        f"network={region.network_id}"
    )
    if not confirm:
        print("dry run only; pass --confirm to write")

    for collection_name in COLLECTIONS:
        collection = getattr(db, collection_name)
        await _scope_legacy_collection(collection, region, confirm)

    await _migrate_osm_snapshot_scope(region, confirm)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--confirm", action="store_true")
    args = parser.parse_args()
    asyncio.run(_run(args.confirm))
