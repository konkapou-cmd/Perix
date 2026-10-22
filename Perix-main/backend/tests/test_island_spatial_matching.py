"""Offline spatial occurrence matching; no runtime, network or operator claims."""
from copy import deepcopy
import json
import os
from pathlib import Path

import pytest

from mobility.island_schedule import resolve_osm_stops


def preview(labels, island="Syros", agency="SYR_KTEL", code="TEST"):
    return {"active": False, "runtime_eligible": False, "public_release_allowed": False,
            "source_observations": [{"untouched": True}], "coverage": {"stop_occurrences": len(labels)},
            "routes": [{"source_reference": {"city": island, "operator": agency, "route_code": code},
                        "stops": [{"label": label, "sequence": i + 1,
                                   "internal_reference_occurrence_id": f"occurrence:{i + 1}",
                                   "estimated_offset_seconds": i * 60}
                                  for i, label in enumerate(labels)]}]}


def node(ref, name=None, lat=37.44, lon=24.94, **tags):
    return {"type": "node", "id": ref, "lat": lat, "lon": lon,
            "tags": {"highway": "bus_stop", **({"name": name} if name is not None else {}), **tags}}


def resolve(labels, elements, **kwargs):
    return resolve_osm_stops(preview(labels, **kwargs), {"elements": elements, "source": {"test": True}})


def stops(result):
    return result["routes"][0]["stops"]


def relation(ref, ids):
    return {"type": "relation", "id": ref, "tags": {"type": "route", "route": "bus"},
            "members": [{"type": "node", "ref": i, "role": "platform"} for i in ids]}


def test_pure_repeated_occurrences_and_provisional_schema():
    schedule = preview(["Κίνι", "Κίνι"])
    catalog = {"elements": [node(13597767508, "Kini")], "source": {"pbf": "offline"}}
    before = deepcopy((schedule, catalog))
    result = resolve_osm_stops(schedule, catalog)
    assert (schedule, catalog) == before
    assert [s["physical_stop_id"] for s in stops(result)] == ["osm:node:13597767508"] * 2
    assert len({s["internal_reference_occurrence_id"] for s in stops(result)}) == 2
    assert all(s["authoritative"] is False for s in stops(result))
    assert stops(result)[0]["coordinates"] == [37.44, 24.94]
    assert result["spatial_coverage"] == {"matched": 2, "ambiguous": 0, "unresolved": 0,
                                           "stop_occurrences": 2, "reference_variants": 1,
                                           "routes_all_stops_resolved": 1,
                                           "by_island": {"Syros": {"matched": 2, "ambiguous": 0,
                                                                    "unresolved": 0, "stop_occurrences": 2},
                                                         "Mykonos": {"matched": 0, "ambiguous": 0,
                                                                      "unresolved": 0, "stop_occurrences": 0}}}
    assert result["active"] is result["runtime_eligible"] is result["public_release_allowed"] is False
    result["source_observations"][0]["untouched"] = False
    result["spatial_resolution"]["source"]["pbf"] = "changed"
    assert (schedule, catalog) == before


@pytest.mark.parametrize("key", ["name", "official_name", "name:el", "name:en", "int_name", "local_ref"])
def test_all_supported_name_tags_are_exact_accent_case_whitespace_normalized(key):
    result = resolve(["  ΚΊΝΙ "], [node(1, **{key: "Kini"})])
    assert stops(result)[0]["physical_stop_id"] == "osm:node:1"
    assert stops(result)[0]["resolution_evidence"][0]["tag"] == key


def test_overlapping_platform_names_stay_ambiguous_never_pick_nearest_or_side():
    result = resolve(["ΙΚΑ", "ΙΚΑ"], [node(1, "ΙΚΑ"), node(2, "ΙΚΑ", lat=37.44001)])
    assert result["spatial_coverage"]["ambiguous"] == 2
    for stop in stops(result):
        assert stop["coordinates"] is stop["physical_stop_id"] is None
        assert {c["osm_id"] for c in stop["spatial_candidates"]} == {"osm:node:1", "osm:node:2"}


def test_numbered_names_local_refs_and_addresses_are_not_truncated():
    labels = ["Finikas 1", "Φοίνικας 2", "Φοίνικας", "Στάση Νο 3", "Στάση Νο 4", "Road 1422"]
    result = resolve(labels, [node(1, "ΦΟΙΝΙΚΑΣ 1"), node(2, local_ref="Finikas 2"),
                              node(3, local_ref="Στάση Νο 3"), node(4, "Road"),
                              {"type": "node", "id": 5, "lat": 37.44, "lon": 24.94,
                               "tags": {"name": "Road 1422", "addr:housenumber": "1422"}}])
    assert [s["physical_stop_id"] for s in stops(result)] == ["osm:node:1", "osm:node:2", None,
                                                             "osm:node:3", None, None]


def test_generic_and_unnamed_features_do_not_name_match_or_interpolate():
    result = resolve(["Στάση", "Σταση", "Αεροδρόμιο", "unnamed"],
                     [node(1, "Στάση"), node(2), node(3, "Airport", lon=25.34)], island="Mykonos")
    assert result["spatial_coverage"]["unresolved"] == 4
    assert all(not stop["spatial_candidates"] for stop in stops(result))


def test_wrong_island_private_nonbus_and_nonfinite_points_excluded():
    result = resolve(["Κίνι"], [node(1, "Kini", lon=25.34), node(2, "Kini", bus="no"),
                               node(3, "Kini", access="private"), node(4, "Kini", lat=float("nan")),
                               {"type": "node", "id": 5, "lat": 37.44, "lon": 24.94,
                                "tags": {"name": "Kini", "place": "village"}}])
    assert result["spatial_coverage"]["unresolved"] == 1


def test_platform_position_cluster_requires_reciprocal_proximity_and_same_name():
    platform = node(1, "ΙΚΑ", public_transport="platform")
    position = node(2, "ΙΚΑ", lat=37.44002, public_transport="stop_position", bus="yes")
    position["tags"].pop("highway")
    stop = stops(resolve(["ΙΚΑ"], [platform, position]))[0]
    assert stop["physical_stop_id"] == "osm:node:1"
    assert stop["spatial_candidates"][0]["candidate_cluster"] == ["osm:node:1", "osm:node:2"]
    position["lat"] = 37.45
    assert stops(resolve(["ΙΚΑ"], [platform, position]))[0]["spatial_status"] == "AMBIGUOUS"
    position["lat"] = 37.44002
    extra = node(3, "ΙΚΑ", lat=37.44003)
    assert stops(resolve(["ΙΚΑ"], [platform, position, extra]))[0]["spatial_status"] == "AMBIGUOUS"


def test_station_node_is_station_level_never_platform_and_polygon_has_no_centroid():
    station = node(3578181775, "Central Bus Station KTEL", amenity="bus_station", public_transport="station")
    station["tags"].pop("highway")
    stop = stops(resolve(["Αφετηρία Κτελ Σύρου"], [station]))[0]
    assert stop["spatial_status"] == "MATCHED_OSM_STATION_CANDIDATE"
    assert stop["platform_id"] is None and stop["coordinate_level"] == "station"
    polygon = {"type": "way", "id": 736284303, "tags": {"amenity": "bus_station", "name": "Fabrika"},
               "nodes": [1, 2, 1], "center": {"lat": 37.44, "lon": 25.33},
               "geometry": [{"lat": 37.44, "lon": 25.33}, {"lat": 37.441, "lon": 25.331},
                            {"lat": 37.44, "lon": 25.33}]}
    stop = stops(resolve(["Fabrika"], [polygon], island="Mykonos"))[0]
    assert stop["coordinates"] is stop["physical_stop_id"] is None
    assert stop["spatial_candidates"][0]["osm_id"] == "osm:way:736284303"


def station_footprint(ref, name, lat=37.44, lon=24.94):
    return {"type": "way", "id": ref, "tags": {"amenity": "bus_station", "name": name},
            "geometry": [{"lat": lat + dy, "lon": lon + dx}
                         for dy, dx in [(-.001, -.001), (-.001, .001), (.001, .001),
                                        (.001, -.001), (-.001, -.001)]]}


def test_unique_platform_uses_same_name_station_as_context_not_rival():
    station = node(2, "Old Port", lat=37.4402, lon=25.33, amenity="bus_station")
    station["tags"].pop("highway")
    polygon = station_footprint(3, "Παλαιό Λιμάνι", lon=25.33)
    elements = [node(1, "Old Port", lon=25.33), station, polygon]
    stop = stops(resolve(["Παλιό Λιμάνι"], elements, island="Mykonos"))[0]
    assert stop["physical_stop_id"] == stop["platform_id"] == "osm:node:1"
    assert {c["osm_id"] for c in stop["spatial_candidates"][0]["station_context"]} == {
        "osm:node:2", "osm:way:3"}
    assert stop["resolution_evidence"][-1]["station_context"]
    elements.append(node(4, "Old Port", lat=37.4401, lon=25.33))
    stop = stops(resolve(["Παλαιό Λιμάνι"], elements, island="Mykonos"))[0]
    assert stop["physical_stop_id"] is None
    assert {c["osm_id"] for c in stop["spatial_candidates"]} == {"osm:node:1", "osm:node:4"}


def test_station_node_inside_same_name_footprint_is_station_level_not_platform():
    station = node(3578181775, "Central Bus Station KTEL", amenity="bus_station")
    station["tags"].pop("highway")
    polygon = station_footprint(299227982, "Αφετηρία Υπεραστικών Συγκοινωνιών ΚΤΕΛ Σύρου")
    stop = stops(resolve(["Αφετηρία Κτελ Σύρου"], [station, polygon]))[0]
    assert stop["physical_stop_id"] == "osm:node:3578181775"
    assert stop["platform_id"] is None
    assert stop["coordinate_level"] == "station"
    assert stop["spatial_candidates"][0]["station_context"][0]["osm_id"] == "osm:way:299227982"


def test_remote_different_station_and_multiple_station_nodes_stay_distinct():
    station = node(2, "Kini", amenity="bus_station", lat=37.46)
    station["tags"].pop("highway")
    stop = stops(resolve(["Κίνι"], [node(1, "Kini"), station]))[0]
    assert stop["spatial_status"] == "AMBIGUOUS"
    for name, lat in [("Different station", 37.44), ("Kini", 37.46)]:
        polygon = station_footprint(3, name, lat=lat)
        stop = stops(resolve(["Κίνι"], [node(1, "Kini"), polygon]))[0]
        assert not stop["spatial_candidates"][0].get("station_context")
        assert stop["physical_stop_id"] == ("osm:node:1" if name != "Kini" else None)
    station["lat"] = 37.44
    other = deepcopy(station)
    other["id"] = 4
    stop = stops(resolve(["Κίνι"], [station, other, station_footprint(3, "Kini")]))[0]
    assert stop["spatial_status"] == "AMBIGUOUS"
    assert {c["osm_id"] for c in stop["spatial_candidates"]} == {"osm:node:2", "osm:node:4"}


def test_locality_aliases_do_not_expand_road_labels_or_cross_islands():
    elements = [node(1, "Ornos", lon=25.33), node(2, "Agios Ioannis", lon=25.31),
                node(3, "Agios Ioannis", lat=37.4401, lon=25.31), node(4, "Ano Mera", lon=25.39)]
    labels = ["Όρνος", "Ορνός", "Άγιος Ιωάννης", "Άγιος Ιωάννης Διακόφτης", "Άνω Μέρά",
              "Επαρ. Οδ. Ορμου Αγ. Ιωάννη", "Επαρχιακή Οδός Μυκόνου - Άνω Μεράς 1422"]
    resolved = stops(resolve(labels, elements, island="Mykonos"))
    assert [s["physical_stop_id"] for s in resolved] == ["osm:node:1", "osm:node:1", None, None,
                                                        "osm:node:4", None, None]
    assert all(s["spatial_status"] == "AMBIGUOUS" for s in resolved[2:4])
    assert not any(s["spatial_candidates"] for s in resolved[5:])
    assert stops(resolve(["Άγιος Ιωάννης"], [node(1, "Agios Ioannis")]))[0]["physical_stop_id"] is None


def test_numbered_local_ref_does_not_match_locality_or_other_number():
    elements = [node(1, local_ref="Γαλησσάς1"), node(2, local_ref="Γαλησσάς2"),
                node(3, "ΠΥΡΓΟΣ ΚΟΥΛΟΥΡΗ", local_ref="ΠοσειδωνΙα 3")]
    labels = ["ΓΑΛΗΣΣΆΣ1", "Γαλησσάς2", "Γαλησσάς", "Πωσειδωνία 3", "Πωσειδωνία 2", "Πωσειδωνία"]
    assert [s["physical_stop_id"] for s in stops(resolve(labels, elements))] == [
        "osm:node:1", "osm:node:2", None, "osm:node:3", None, None]


def municipal(labels, elements, code="MUNI_1"):
    return resolve(labels, elements, agency="SYR_MINI", code=code)


def test_relation_4594448_disambiguates_direction_and_repeated_named_occurrences():
    elements = [node(1, "Δόξα"), node(2, "ΙΚΑ"), node(3, "ΙΚΑ", lat=37.43),
                node(4, "5ο Δημοτικό"), relation(4594448, [1, 2, 3, 4]),
                relation(4594447, [4, 3, 2, 1])]
    result = municipal(["Δόξα", "ΙΚΑ", "ΙΚΑ", "5ο Δημοτικό"], elements)
    assert [s["physical_stop_id"] for s in stops(result)] == [f"osm:node:{i}" for i in (1, 2, 3, 4)]
    assert result["routes"][0]["spatial_relation_review"]["relation_id"] == "osm:relation:4594448"
    other = municipal(["Δόξα", "ΙΚΑ", "5ο Δημοτικό"], elements, code="MUNI_2")
    assert stops(other)[1]["physical_stop_id"] is None
    multiple = municipal(["Δόξα", "ΙΚΑ", "5ο Δημοτικό"], elements)
    assert stops(multiple)[1]["physical_stop_id"] is None


def test_conflicting_relation_never_overrides_names_or_uses_reverse_relation():
    elements = [node(1, "Δόξα"), node(2, "ΙΚΑ"), node(3, "ΙΚΑ", lat=37.43),
                node(4, "5ο Δημοτικό"), relation(4594448, [4, 2, 1]), relation(4594447, [1, 3, 4])]
    result = municipal(["Δόξα", "ΙΚΑ", "5ο Δημοτικό"], elements)
    assert stops(result)[1]["physical_stop_id"] is None
    assert result["routes"][0]["spatial_relation_review"]["status"] == "ORDER_CONFLICT_OR_INCOMPLETE_MEMBERS"


def test_relation_adjacent_position_platform_pair_with_competing_nearby_platform():
    position = node(2, "ΙΚΑ", public_transport="stop_position", bus="yes")
    position["tags"].pop("highway")
    elements = [node(1, "Δόξα"), position, node(3, "ΙΚΑ", lat=37.44001),
                node(4, "ΙΚΑ", lat=37.44002), node(5, "5ο Δημοτικό"),
                relation(4594448, [1, 2, 3, 5])]
    elements[-1]["members"][1]["role"] = "stop"
    result = municipal(["Δόξα", "ΙΚΑ", "5ο Δημοτικό"], elements)
    assert stops(result)[1]["physical_stop_id"] == "osm:node:3"
    assert stops(result)[1]["resolution_evidence"][0]["candidate_cluster"] == ["osm:node:2", "osm:node:3"]


def test_generic_relation_requires_unique_brackets_exact_count_and_all_labels_accounted():
    elements = [node(1, "Δόξα"), node(2), node(3, "5ο Δημοτικό"), relation(4594448, [1, 2, 3])]
    result = municipal(["Δόξα", "Στάση", "5ο Δημοτικό"], elements)
    assert stops(result)[1]["physical_stop_id"] == "osm:node:2"
    assert stops(result)[1]["resolution_method"] == "UNIQUE_BRACKETED_OSM_RELATION_MEMBER"
    for labels in (["Δόξα", "Στάση", "Στάση", "5ο Δημοτικό"],
                   ["Δόξα", "Road 1422", "5ο Δημοτικό"],
                   ["Unknown", "Δόξα", "Στάση", "5ο Δημοτικό"],
                   ["Στάση", "Δόξα", "5ο Δημοτικό"],
                   ["Στάση", "Δόξα", "Στάση", "5ο Δημοτικό"]):
        result = municipal(labels, elements)
        assert all(s["coordinates"] is None for s in stops(result) if s["label"] in ("Στάση", "Road 1422"))
    elements[-1]["members"].insert(1, {"type": "node", "ref": 999, "role": "stop"})
    assert stops(municipal(["Δόξα", "Στάση", "5ο Δημοτικό"], elements))[1]["coordinates"] is None


def test_existing_preview_preserves_all_311_occurrences_without_catalog():
    path = Path(__file__).resolve().parents[1] / "data/review/ISLAND_PROVISIONAL_SCHEDULE_2026-10-22.json"
    if not path.exists():
        pytest.skip("Local review preview not installed")
    schedule = json.loads(path.read_text(encoding="utf-8"))
    result = resolve_osm_stops(schedule, {"elements": []})
    assert result["spatial_coverage"]["stop_occurrences"] == 311
    assert result["spatial_coverage"]["unresolved"] == 311
    assert [s["internal_reference_occurrence_id"] for r in result["routes"] for s in r["stops"]] == [
        s["internal_reference_occurrence_id"] for r in schedule["routes"] for s in r["stops"]]


def test_external_catalog_coverage():
    root = Path(__file__).resolve().parents[1]
    value = os.getenv("PERIX_ISLAND_OSM_CATALOG")
    path = Path(value) if value else root / "data/review/ISLAND_OSM_STOP_CATALOG_2026-10-22.json"
    if not path.exists():
        pytest.skip("Local catalog not installed; set PERIX_ISLAND_OSM_CATALOG for offline integration")
    schedule = json.loads((root / "data/review/ISLAND_PROVISIONAL_SCHEDULE_2026-10-22.json").read_text(encoding="utf-8"))
    catalog = json.loads(path.read_text(encoding="utf-8"))
    before = deepcopy((schedule, catalog))
    result = resolve_osm_stops(schedule, catalog)
    coverage = result["spatial_coverage"]
    assert coverage["matched"] + coverage["ambiguous"] + coverage["unresolved"] == coverage["stop_occurrences"] == 311
    assert (schedule, catalog) == before
    assert result["active"] is result["runtime_eligible"] is False
    for route, original in zip(result["routes"], schedule["routes"]):
        assert route["source_reference"] == original["source_reference"]
        for stop, source in zip(route["stops"], original["stops"]):
            assert stop["internal_reference_occurrence_id"] == source["internal_reference_occurrence_id"]
            assert stop["estimated_offset_seconds"] == source["estimated_offset_seconds"]
    if catalog.get("source", {}).get("sha256") == "511ff70e9b11b980688567cdfd3072c5c07171990089ac72b04cd354e1445adf":
        assert (coverage["matched"], coverage["ambiguous"], coverage["unresolved"]) == (33, 25, 253)
        assert coverage["routes_all_stops_resolved"] == 0
        all_stops = [stop for route in result["routes"] for stop in route["stops"]]
        terminals = [s for s in all_stops if s["label"] == "Αφετηρία Κτελ Σύρου"]
        assert len(terminals) == 9
        assert all(s["physical_stop_id"] == "osm:node:3578181775" and s["platform_id"] is None
                   and s["coordinate_level"] == "station" for s in terminals)
        ports = [s for s in all_stops if s["label"] == "Παλιό Λιμάνι"]
        assert len(ports) == 2
        assert all(s["platform_id"] == "osm:node:6534142968" for s in ports)
        ioannis = [s for s in all_stops if s["label"] in ("Άγιος Ιωάννης", "Άγιος Ιωάννης Διακόφτης")]
        assert len(ioannis) == 3
        assert all(s["physical_stop_id"] is None and {c["osm_id"] for c in s["spatial_candidates"]} == {
            "osm:node:9887401131", "osm:node:9887401817"} for s in ioannis)
    print(json.dumps(coverage, sort_keys=True))


def test_external_full_pbf_coverage():
    value = os.getenv("PERIX_ISLAND_OSM_PBF")
    if not value:
        pytest.skip("Set PERIX_ISLAND_OSM_PBF for full local PBF integration")
    osmium = pytest.importorskip("osmium")
    elements = []

    class TransportCatalog(osmium.SimpleHandler):
        def node(self, n):
            lat, lon = n.location.lat, n.location.lon
            scoped = (37.32 <= lat <= 37.55 and 24.80 <= lon <= 25.07
                      or 37.34 <= lat <= 37.52 and 25.23 <= lon <= 25.51)
            if scoped and (n.tags.get("highway") == "bus_stop"
                           or n.tags.get("public_transport") in ("platform", "stop_position", "station")
                           or n.tags.get("amenity") == "bus_station"):
                elements.append({"type": "node", "id": n.id, "lat": lat, "lon": lon, "tags": dict(n.tags)})

        def relation(self, r):
            if r.id in (4594447, 4594448):
                elements.append({"type": "relation", "id": r.id, "tags": dict(r.tags), "members": [
                    {"type": {"n": "node", "w": "way", "r": "relation"}[m.type], "ref": m.ref, "role": m.role}
                    for m in r.members]})

    TransportCatalog().apply_file(value)
    root = Path(__file__).resolve().parents[1]
    schedule = json.loads((root / "data/review/ISLAND_PROVISIONAL_SCHEDULE_2026-10-22.json").read_text(encoding="utf-8"))
    result = resolve_osm_stops(schedule, {"elements": elements, "source": {"pbf": Path(value).name}})
    assert result["spatial_coverage"]["stop_occurrences"] == 311
    print(json.dumps({"point_catalog_coverage": result["spatial_coverage"],
                      "routes": [{"id": r["reference_id"], "coverage": r["spatial_coverage"],
                                  "relation": r["spatial_relation_review"]} for r in result["routes"]
                                 if r["source_reference"]["route_code"] == "MUNI_1"]}, ensure_ascii=True))
