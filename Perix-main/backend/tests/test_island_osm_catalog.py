"""Offline stop catalog extraction, provenance and destination safety."""
import builtins
import hashlib
import csv
import json
import os
from pathlib import Path
import sys
import subprocess
from types import SimpleNamespace

import pytest

from scripts.validate_island_review import extract_island_stop_catalog, validate_output_paths


@pytest.fixture
def mocked_osmium(monkeypatch):
    def node(oid, lat=37.44, lon=24.94, **tags):
        return SimpleNamespace(id=oid, tags=list(tags.items()), location=SimpleNamespace(
            lat=lat, lon=lon, valid=lambda: True))

    def way(oid, refs, **tags):
        return SimpleNamespace(id=oid, tags=list(tags.items()),
                               nodes=[SimpleNamespace(ref=ref) for ref in refs])

    def relation(oid, refs, **tags):
        return SimpleNamespace(id=oid, tags=list(tags.items()), members=[
            SimpleNamespace(type=kind, ref=ref, role=role) for kind, ref, role in refs])

    objects = {
        "node": [node(1, highway="bus_stop", name="Stop", phone="private", **{"name:el": "Name"}),
                 node(2, public_transport="platform"),
                 node(3, public_transport="stop_position", bus="yes"),
                 node(4, amenity="bus_station"), node(5), node(6), node(7),
                 node(8, public_transport="platform", bus="no"),
                 node(9, public_transport="stop_position"),
                 node(10, lat=38.0, highway="bus_stop"),
                 node(11, lat=37.4, lon=25.4, highway="bus_stop"),
                 node(12, lat=37.32, lon=24.8, highway="bus_stop")],
        "way": [way(20, [5, 6, 7, 5], amenity="bus_station"),
                way(21, [5, 999, 5], amenity="bus_station"),
                way(22, [999], amenity="bus_station"),
                way(23, [5, 6], highway="residential")],
        "relation": [relation(4594447, [("n", 1, "stop"), ("n", 5, "platform"),
                                      ("w", 23, ""), ("n", 999, "stop")], route="bus"),
                     relation(4594448, [("n", 6, "platform_exit_only")]),
                     relation(30, [("n", 11, "stop")], route="bus"),
                     relation(31, [("n", 999, "stop")], route="bus"),
                     relation(32, [("n", 1, "stop")], route="train"),
                     relation(33, [("n", 1, "stop"), ("n", 11, "stop")], route="bus")],
    }

    class Handler:
        def apply_file(self, path):
            assert Path(path).is_file()
            for kind, records in objects.items():
                for record in records:
                    getattr(self, kind)(record)

    class Reader:
        def __init__(self, path):
            assert Path(path).is_file()

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def header(self):
            return {"osmosis_replication_timestamp": "2026-10-21T20:21:00Z",
                    "generator": "fixture"}

    monkeypatch.setitem(sys.modules, "osmium", SimpleNamespace(
        SimpleHandler=Handler, io=SimpleNamespace(Reader=Reader)))
    return objects


def test_extract_scoped_nodes_membership_polygons_and_provenance(mocked_osmium, tmp_path):
    path = tmp_path / "local.osm.pbf"
    original = b"read-only snapshot fixture"
    path.write_bytes(original)
    catalog = extract_island_stop_catalog(path)
    assert path.read_bytes() == original
    assert catalog == extract_island_stop_catalog(path)
    source = catalog["source"]
    assert source["path"] == path.name
    assert source["sha256"] == hashlib.sha256(original).hexdigest()
    assert source["size_bytes"] == len(original)
    assert source["snapshot"]["osmosis_replication_timestamp"] == "2026-10-21T20:21:00Z"
    assert source["attribution"] == "OpenStreetMap contributors"
    assert source["license"] == "ODbL-1.0"
    elements = {(item["type"], item["id"]): item for item in catalog["elements"]}
    assert {oid for kind, oid in elements if kind == "node"} == {1, 2, 3, 4, 5, 6, 11, 12}
    assert elements["node", 1]["tags"] == {"highway": "bus_stop", "name": "Stop", "name:el": "Name"}
    assert elements["node", 1]["lat"] == 37.44
    assert elements["node", 11]["island"] == "mykonos"
    assert elements["node", 12]["island"] == "syros"
    assert {oid for kind, oid in elements if kind == "relation"} == {4594447, 4594448, 30}
    assert elements["relation", 4594447]["members"][1] == {"type": "node", "ref": 5, "role": "platform"}
    assert elements["relation", 4594447]["members"][-1]["ref"] == 999
    assert elements["way", 20]["geometry"] == [{"lat": 37.44, "lon": 24.94}] * 4
    assert "geometry" not in elements["way", 21]
    assert ("way", 22) not in elements and ("way", 23) not in elements
    assert all("lat" not in item and "center" not in item for item in catalog["elements"] if item["type"] == "way")


def test_missing_optional_dependency_has_actionable_error(monkeypatch, tmp_path):
    original_import = builtins.__import__

    def without_osmium(name, *args, **kwargs):
        if name == "osmium":
            raise ImportError("not installed")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", without_osmium)
    with pytest.raises(RuntimeError, match="--osm-pbf requires optional PyOsmium"):
        extract_island_stop_catalog(tmp_path / "missing.pbf")


@pytest.mark.parametrize("destination", ["pbf", "date", "source", "manifest", "duplicate", "hardlink"])
def test_all_outputs_protect_all_inputs_and_each_other(tmp_path, destination):
    source, manifests = tmp_path / "source", tmp_path / "manifests"
    source.mkdir()
    manifests.mkdir()
    pbf, date = tmp_path / "source.pbf", tmp_path / "date.csv"
    pbf.write_bytes(b"pbf input")
    date.write_bytes(b"date input")
    output = tmp_path / "output.json"
    targets = {"pbf": pbf, "date": date, "source": source / "new.json",
               "manifest": manifests / "new.json", "duplicate": output, "hardlink": output}
    outputs = [targets[destination]]
    if destination == "duplicate":
        outputs.append(output)
    if destination == "hardlink":
        os.link(pbf, output)
    with pytest.raises(ValueError, match="input|distinct paths"):
        validate_output_paths(source, manifests, date, outputs, osm_pbf=pbf)
    assert pbf.read_bytes() == b"pbf input"
    assert date.read_bytes() == b"date input"


def test_distinct_output_hardlinks_are_rejected(tmp_path):
    first, second = tmp_path / "first", tmp_path / "second"
    first.write_bytes(b"existing preview")
    os.link(first, second)
    with pytest.raises(ValueError, match="distinct paths"):
        validate_output_paths(tmp_path / "source", None, None, [first, second])


def test_real_osmium_small_xml_read_only(tmp_path):
    osmium = pytest.importorskip("osmium")
    if not hasattr(osmium, "SimpleHandler"):
        pytest.skip("Complete optional PyOsmium installation required")
    path = tmp_path / "tiny.osm"
    path.write_text('''<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="catalog-test">
  <node id="1" lat="37.44" lon="24.94"><tag k="highway" v="bus_stop"/></node>
  <node id="2" lat="37.441" lon="24.941"/>
  <node id="3" lat="37.442" lon="24.942"/>
  <way id="20"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="1"/>
    <tag k="amenity" v="bus_station"/></way>
  <relation id="4594447"><member type="node" ref="2" role="platform"/>
    <tag k="type" v="route"/><tag k="route" v="bus"/></relation>
</osm>
''', encoding="utf-8")
    before = path.read_bytes()
    catalog = extract_island_stop_catalog(path)
    assert path.read_bytes() == before
    assert [(item["type"], item["id"]) for item in catalog["elements"]] == [
        ("node", 1), ("node", 2), ("way", 20), ("relation", 4594447)]
    assert len(catalog["elements"][2]["geometry"]) == 4


def test_external_cli_resolved_csv_json_and_all_collision_guards(tmp_path):
    source_value = os.getenv("PERIX_ISLAND_REVIEW_SOURCE")
    if not source_value:
        pytest.skip("Set PERIX_ISLAND_REVIEW_SOURCE for validated bundle integration")
    pytest.importorskip("osmium")
    source = Path(source_value)
    pbf = tmp_path / "fixture.osm"
    pbf.write_text('''<osm version="0.6" generator="catalog-test">
<node id="1" lat="37.4461613" lon="24.9003572">
<tag k="highway" v="bus_stop"/><tag k="name" v="Kini"/></node>
</osm>''', encoding="utf-8")
    inputs = [path for path in source.iterdir() if path.is_file()] + [pbf]
    before = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in inputs}
    script = Path(__file__).resolve().parents[1] / "scripts/validate_island_review.py"
    catalog_path, json_path, csv_path = (tmp_path / name for name in ("catalog.json", "preview.json", "preview.csv"))
    command = [sys.executable, str(script), str(source), "--osm-pbf", str(pbf),
               "--osm-catalog-output", str(catalog_path), "--provisional-schedule", str(json_path),
               "--provisional-stop-times", str(csv_path)]
    subprocess.run(command, capture_output=True, text=True, check=True)
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    schedule = json.loads(json_path.read_text(encoding="utf-8"))
    assert catalog["source"]["sha256"] == before[pbf]
    with csv_path.open(encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))
    assert len(rows) == 311
    resolved = [row for row in rows if row["physical_stop_id"]]
    assert resolved
    assert all(json.loads(row["coordinates"]) == [37.4461613, 24.9003572] for row in resolved)
    assert all(json.loads(row["candidate_osm_ids"]) == ["osm:node:1"] for row in resolved)
    assert all(json.loads(row["coordinate_source"])["sha256"] == before[pbf] for row in resolved)
    assert schedule["active"] is schedule["runtime_eligible"] is False
    for flag in ("--osm-catalog-output", "--provisional-schedule", "--provisional-stop-times"):
        for destination in (pbf, catalog_path if flag != "--osm-catalog-output" else json_path):
            rejected = subprocess.run(command + [flag, str(destination)], capture_output=True, text=True)
            assert rejected.returncode != 0
            assert "must not overwrite an input" in rejected.stderr or "distinct paths" in rejected.stderr
    assert before == {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in inputs}


def test_generated_local_catalog_and_preview_consistency():
    if not os.getenv("PERIX_CHECK_LOCAL_ISLAND_CATALOG"):
        pytest.skip("Opt in to checking locally generated full-PBF artifacts")
    directory = Path(__file__).resolve().parents[1] / "data/review"
    catalog_path = directory / "ISLAND_OSM_STOP_CATALOG_2026-10-22.json"
    schedule_path = directory / "ISLAND_PROVISIONAL_SCHEDULE_2026-10-22.json"
    csv_path = directory / "ISLAND_PROVISIONAL_STOP_TIMES_2026-10-22.csv"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    schedule = json.loads(schedule_path.read_text(encoding="utf-8"))
    with csv_path.open(encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))
    nodes = {f"osm:node:{item['id']}": item for item in catalog["elements"] if item["type"] == "node"}
    stops = [stop for route in schedule["routes"] for stop in route["stops"]]
    assert len(rows) == len(stops) == 311
    for row, stop in zip(rows, stops):
        assert row["physical_stop_id"] == (stop["physical_stop_id"] or "")
        assert json.loads(row["candidate_osm_ids"]) == stop["candidate_osm_ids"]
        if stop["coordinates"] is not None:
            node = nodes[stop["physical_stop_id"]]
            assert json.loads(row["coordinates"]) == stop["coordinates"] == [node["lat"], node["lon"]]
            assert json.loads(row["coordinate_source"])["sha256"] == catalog["source"]["sha256"]
    for filename, key in (("FULL_342_DEPARTURES.csv", "source_observations"),
                          ("FULL_988_BASELINE_TIMELINES.csv", "source_baseline_timelines")):
        with (Path(os.environ["PERIX_ISLAND_REVIEW_SOURCE"]) / filename).open(encoding="utf-8-sig", newline="") as stream:
            assert list(csv.DictReader(stream)) == schedule[key]
    print(json.dumps({"coverage": schedule["spatial_coverage"],
                      "sizes_bytes": {path.name: path.stat().st_size for path in (catalog_path, schedule_path, csv_path)},
                      "unresolved_labels": {island: sorted({row["label"] for row in rows
                          if row["island"] == island and not row["physical_stop_id"]})
                          for island in ("Syros", "Mykonos")}}, ensure_ascii=True, indent=2))
