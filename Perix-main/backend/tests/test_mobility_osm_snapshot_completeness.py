from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from mobility import osm_store


@pytest.fixture
def snapshot(monkeypatch):
    old = {
        "key": "graph_meta:magdeburg", "active_v": 100,
        "imported_at": 990, "roads": 14155, "rails": 620, "signals": 1628,
    }
    events = []
    meta = AsyncMock()
    meta.find_one.return_value = deepcopy(old)
    ways = AsyncMock()
    signals = AsyncMock()
    ways.count_documents.side_effect = [1, 1]
    signals.count_documents.return_value = 1
    db = SimpleNamespace(
        mobility_osm_graph_meta=meta,
        mobility_osm_ways=ways,
        mobility_osm_signals=signals,
    )
    way = {"id": 1, "nodes": [10, 11], "points": [[52, 11], [52.001, 11.001]]}
    signal = {"id": 2, "lat": 52, "lng": 11}

    async def fetch(tiles, mode):
        events.append("fetch:" + mode)
        return [deepcopy(way)], 0

    async def fetch_signals(tiles):
        events.append("fetch:signals")
        return [signal], 0

    async def write_way(*args, **kwargs):
        events.append("write:way")

    async def promote(*args, **kwargs):
        ways.count_documents.assert_awaited()
        signals.count_documents.assert_awaited_once()
        signals.replace_one.assert_awaited_once()
        events.append("promote")

    ways.replace_one.side_effect = write_way
    meta.replace_one.side_effect = promote
    monkeypatch.setattr(osm_store, "db", db)
    monkeypatch.setattr(osm_store, "_region", lambda _: SimpleNamespace(
        region_id="magdeburg", network_id="de-magdeburg-mvb",
        modes=("bus", "tram"), bbox=(52, 11, 53, 12),
    ))
    monkeypatch.setattr(osm_store, "_fetch_quads", fetch)
    monkeypatch.setattr(osm_store, "_fetch_signal_quads", fetch_signals)
    monkeypatch.setattr(osm_store.time, "time", lambda: 1000)
    return SimpleNamespace(db=db, old=old, events=events, way=way, signal=signal)


@pytest.mark.asyncio
@pytest.mark.parametrize("failed_layer", ["bus", "tram", "signals"])
@pytest.mark.parametrize("force_new", [False, True])
async def test_failed_tile_preserves_active_without_graph_writes(snapshot, monkeypatch, failed_layer, force_new):
    async def fetch(tiles, mode):
        return [snapshot.way], int(mode == failed_layer)

    async def fetch_signals(tiles):
        return [snapshot.signal], int(failed_layer == "signals")

    monkeypatch.setattr(osm_store, "_fetch_quads", fetch)
    monkeypatch.setattr(osm_store, "_fetch_signal_quads", fetch_signals)
    result = await osm_store.import_snapshot(force_new=force_new, region_id="magdeburg")

    assert result["ok"] is False
    assert result["reason"] == "INCOMPLETE_SNAPSHOT"
    assert result["v"] == snapshot.old["active_v"]
    assert result["failed"] == 1
    for collection in (snapshot.db.mobility_osm_ways, snapshot.db.mobility_osm_signals):
        collection.replace_one.assert_not_awaited()
        collection.delete_many.assert_not_awaited()
    meta = snapshot.db.mobility_osm_graph_meta
    meta.replace_one.assert_not_awaited()
    update = meta.update_one.await_args.args[1]
    assert set(update["$set"]) == {"last_import_attempt"}
    attempt = update["$set"]["last_import_attempt"]
    assert attempt["tiles_per_layer"] == 16
    assert attempt["failed"] == 1
    assert attempt[{"bus": "roads_failed", "tram": "rails_failed", "signals": "signals_failed"}[failed_layer]] == 1
    assert meta.find_one.return_value == snapshot.old


@pytest.mark.asyncio
async def test_complete_fetch_is_verified_before_new_version_promotion(snapshot):
    result = await osm_store.import_snapshot(region_id="magdeburg")

    assert result["ok"] is True
    assert result["v"] == 1000
    assert result["merged"] is False
    assert snapshot.events == ["fetch:bus", "fetch:tram", "fetch:signals", "write:way", "write:way", "promote"]
    meta = snapshot.db.mobility_osm_graph_meta.replace_one.await_args.args[1]
    assert meta["active_v"] == 1000
    assert meta["last_import_attempt"]["failed"] == 0
    assert meta["last_import_attempt"]["ok"] is True
    for collection in (snapshot.db.mobility_osm_ways, snapshot.db.mobility_osm_signals):
        collection.delete_many.assert_awaited_once_with({"region_id": "magdeburg", "graph_v": {"$ne": 1000}})


@pytest.mark.asyncio
async def test_count_mismatch_does_not_promote_or_delete(snapshot):
    snapshot.db.mobility_osm_ways.count_documents.side_effect = [1, 0]
    result = await osm_store.import_snapshot(region_id="magdeburg")

    assert result["ok"] is False
    assert result["reason"] == "SNAPSHOT_COUNT_MISMATCH"
    assert result["v"] == 100
    snapshot.db.mobility_osm_graph_meta.replace_one.assert_not_awaited()
    snapshot.db.mobility_osm_ways.delete_many.assert_not_awaited()
    snapshot.db.mobility_osm_signals.delete_many.assert_not_awaited()


@pytest.mark.asyncio
async def test_interrupted_storage_does_not_touch_active_version(snapshot):
    snapshot.db.mobility_osm_ways.replace_one.side_effect = RuntimeError("storage unavailable")
    with pytest.raises(RuntimeError, match="storage unavailable"):
        await osm_store.import_snapshot(region_id="magdeburg")
    snapshot.db.mobility_osm_graph_meta.replace_one.assert_not_awaited()
    snapshot.db.mobility_osm_ways.delete_many.assert_not_awaited()
    assert snapshot.db.mobility_osm_ways.replace_one.await_args.args[0]["graph_v"] != 100


@pytest.mark.asyncio
async def test_failed_first_import_does_not_create_active_snapshot(snapshot, monkeypatch):
    snapshot.db.mobility_osm_graph_meta.find_one.return_value = None
    monkeypatch.setattr(osm_store, "_fetch_quads", AsyncMock(return_value=([snapshot.way], 1)))
    result = await osm_store.import_snapshot(region_id="magdeburg")
    assert result["ok"] is False
    assert result["v"] is None
    snapshot.db.mobility_osm_ways.replace_one.assert_not_awaited()
    snapshot.db.mobility_osm_graph_meta.replace_one.assert_not_awaited()
    update = snapshot.db.mobility_osm_graph_meta.update_one.await_args.args[1]
    assert "active_v" not in update["$set"]
    assert "active_v" not in update["$setOnInsert"]


@pytest.mark.asyncio
async def test_empty_required_layer_is_rejected(snapshot, monkeypatch):
    monkeypatch.setattr(osm_store, "_fetch_quads", AsyncMock(return_value=([], 0)))
    result = await osm_store.import_snapshot(region_id="magdeburg")
    assert result["ok"] is False
    assert result["reason"] == "INCOMPLETE_SNAPSHOT"
    snapshot.db.mobility_osm_ways.replace_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_unrequired_rail_layer_is_not_fetched(snapshot, monkeypatch):
    monkeypatch.setattr(osm_store, "_region", lambda _: SimpleNamespace(
        region_id="magdeburg", network_id="de-magdeburg-mvb",
        modes=("bus",), bbox=(52, 11, 53, 12),
    ))
    snapshot.db.mobility_osm_ways.count_documents.side_effect = [1, 0]
    result = await osm_store.import_snapshot(region_id="magdeburg")
    assert result["ok"] is True
    assert "fetch:tram" not in snapshot.events
