"""Packaged audited OSM source fallback: the shipped daily_osm_source.dat
must load, and import_snapshot(sources=...) must accept a valid bundle
without any Overpass fetch."""
import hashlib
import json
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from mobility import osm_store
from utils import mobility_workers as workers


def make_bundle():
    elements = [
        {
            "type": "way", "id": 1001,
            "nodes": [10, 11],
            "geometry": [{"lat": 52.13, "lon": 11.63}, {"lat": 52.1302, "lon": 11.6302}],
            "tags": {"highway": "residential"},
        },
        {
            "type": "way", "id": 1002,
            "nodes": [20, 21],
            "geometry": [{"lat": 52.131, "lon": 11.631}, {"lat": 52.1312, "lon": 11.6312}],
            "tags": {"railway": "tram"},
        },
        {
            "type": "node", "id": 2001, "lat": 52.1305, "lon": 11.6305,
            "tags": {"highway": "traffic_signals"},
        },
    ]
    digest = hashlib.sha256(json.dumps(elements, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()
    return {
        "schema": "perix-osm-source-v1",
        "region_id": "magdeburg",
        "network_id": "de-magdeburg-mvb",
        "bbox": [52.0, 11.45, 52.25, 11.8],
        "elements": elements,
        "elements_sha256": digest,
        "provenance": {
            "sha256": "b" * 64,
            "source_timestamp": "2026-10-25T21:21:21Z",
            "polygon_contains_bbox": True,
            "missing_node_references": 0,
        },
        "coverage": {
            "roads": {"bbox": [52.0, 11.45, 52.25, 11.8], "expected": 1, "failed": 0, "complete": True},
            "rails": {"bbox": [52.0, 11.45, 52.25, 11.8], "expected": 1, "failed": 0, "complete": True},
            "signals": {"bbox": [52.0, 11.45, 52.25, 11.8], "expected": 1, "failed": 0, "complete": True},
        },
    }


@pytest.mark.asyncio
async def test_packaged_source_loads_shipped_artifact():
    data = await workers._load_packaged_osm_source()
    assert data is not None
    assert data.get("schema") == "perix-osm-source-v1"
    assert data.get("region_id") == "magdeburg"
    assert len(data.get("elements", [])) > 1000


@pytest.mark.asyncio
async def test_packaged_source_missing_file_returns_none(tmp_path):
    assert await workers._load_packaged_osm_source(path=tmp_path / "nope.dat") is None


@pytest.mark.asyncio
async def test_offline_bundle_imports_without_overpass(monkeypatch):
    old = {"key": "graph_meta:magdeburg", "active_v": 100, "imported_at": 990,
           "roads": 1, "rails": 1, "signals": 1}
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

    async def write_way(*args, **kwargs):
        events.append("write:way")

    async def write_signal(*args, **kwargs):
        events.append("write:signal")

    async def promote(*args, **kwargs):
        events.append("promote")

    ways.replace_one.side_effect = write_way
    signals.replace_one.side_effect = write_signal
    meta.replace_one.side_effect = promote
    monkeypatch.setattr(osm_store, "db", db)
    monkeypatch.setattr(osm_store, "_region", lambda _: SimpleNamespace(
        region_id="magdeburg", network_id="de-magdeburg-mvb",
        modes=("bus", "tram"), bbox=(52.0, 11.45, 52.25, 11.8),
    ))
    monkeypatch.setattr(osm_store.time, "time", lambda: 1000)

    async def fetch_fail(*args, **kwargs):
        pytest.fail("packaged import must not touch Overpass")

    monkeypatch.setattr(osm_store, "_fetch_quads", fetch_fail)
    monkeypatch.setattr(osm_store, "_fetch_signal_quads", fetch_fail)

    result = await osm_store.import_snapshot(region_id="magdeburg", sources=make_bundle())

    assert result.get("ok") is True
    assert result.get("roads") == 1 and result.get("rails") == 1 and result.get("signals") == 1
    assert "write:way" in events and "write:signal" in events and "promote" in events


@pytest.mark.asyncio
async def test_offline_bundle_rejects_hash_mismatch(monkeypatch):
    bundle = make_bundle()
    bundle["elements_sha256"] = "0" * 64
    monkeypatch.setattr(osm_store, "db", SimpleNamespace(
        mobility_osm_graph_meta=AsyncMock(),
        mobility_osm_ways=AsyncMock(),
        mobility_osm_signals=AsyncMock(),
    ))
    monkeypatch.setattr(osm_store, "_region", lambda _: SimpleNamespace(
        region_id="magdeburg", network_id="de-magdeburg-mvb",
        modes=("bus", "tram"), bbox=(52.0, 11.45, 52.25, 11.8),
    ))
    with pytest.raises(ValueError, match="SOURCE_HASH_MISMATCH"):
        await osm_store.import_snapshot(region_id="magdeburg", sources=bundle)
