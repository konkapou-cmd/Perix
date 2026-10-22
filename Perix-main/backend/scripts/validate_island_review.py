"""Offline research validation and internal provisional previews, never a feed export."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import csv
import hashlib
import json
from pathlib import Path
import sys


SELECTED_SYROS_ROUTES = {"SYR_KTEL_L3_WD", "SYR_KTEL_L1_WE", "SYR_KTEL_L3_WE"}
EMPTY_ROUTES = {
    "MYK_OLD_KALAFATIS", "MYK_OLD_KALO_LIVADI", "MYK_OLD_PANORMOS",
    "MYK_FAB_SUPERPARADISE",
}
EXCEPTION_COLUMNS = (
    "observation_id", "candidate_trip_id", "stop_label", "stop_id", "platform_id",
    "pattern_id", "geometry_verified", "day_rule_verified", "status", "evidence",
)
PROVISIONAL_STOP_COLUMNS = (
    "island", "agency", "route_reference", "direction", "sequence", "label",
    "from_previous_seconds", "offset_seconds", "method", "confidence",
    "physical_stop_id", "coordinates", "source", "departure_observation_count",
    "spatial_status", "candidate_osm_ids", "coordinate_source",
)


def extract_island_stop_catalog(pbf_path: Path) -> dict:
    """Read the existing local OSM snapshot only; no roads, network or DB writes."""
    try:
        import osmium
    except ImportError as exc:
        raise RuntimeError("--osm-pbf requires optional PyOsmium; install `osmium>=4,<5`.") from exc

    path = Path(pbf_path)
    before = path.stat()
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    bboxes = {"syros": (37.32, 24.80, 37.55, 25.07),
              "mykonos": (37.34, 25.23, 37.52, 25.51)}
    nodes, selected, ways, relations = {}, {}, {}, {}
    tag_keys = {"name", "name:el", "name:en", "alt_name", "alt_name:el", "alt_name:en",
                "official_name", "short_name", "int_name", "ref", "local_ref", "highway", "public_transport",
                "bus", "amenity", "type", "route", "from", "to", "via", "operator", "network",
                "wheelchair", "shelter", "bench", "covered", "area", "building", "access"}

    def tags_of(obj):
        return {key: value for key, value in obj.tags if key in tag_keys}

    def is_stop(tags):
        return (tags.get("highway") == "bus_stop" or tags.get("amenity") == "bus_station"
                or (tags.get("public_transport") in {"platform", "stop_position"}
                    and (tags.get("bus") == "yes" or
                         (tags.get("public_transport") == "platform" and "bus" not in tags))))

    class Handler(osmium.SimpleHandler):
        def node(self, node):
            if not node.location.valid():
                return
            lat, lon = node.location.lat, node.location.lon
            island = next((name for name, (s, w, n, e) in bboxes.items()
                           if s <= lat <= n and w <= lon <= e), None)
            if island is None:
                return
            tags = tags_of(node)
            record = {"type": "node", "id": int(node.id), "lat": lat, "lon": lon,
                      "tags": tags, "island": island}
            nodes[node.id] = record
            if is_stop(tags):
                selected[node.id] = record

        def way(self, way):
            tags = tags_of(way)
            if not is_stop(tags):
                return
            refs = [int(node.ref) for node in way.nodes]
            points = [nodes[ref] for ref in refs if ref in nodes]
            islands = {point["island"] for point in points}
            if len(islands) != 1:
                return
            record = {"type": "way", "id": int(way.id), "nodes": refs,
                      "tags": tags, "island": islands.pop()}
            # Partial polygons are not complete geometry, and never become a centroid.
            if len(points) == len(refs) and points:
                record["geometry"] = [{"lat": point["lat"], "lon": point["lon"]} for point in points]
            ways[way.id] = record

        def relation(self, relation):
            tags = tags_of(relation)
            if tags.get("route") != "bus" and relation.id not in {4594447, 4594448}:
                return
            members = [{"type": {"n": "node", "w": "way", "r": "relation"}[member.type],
                        "ref": int(member.ref), "role": member.role} for member in relation.members]
            islands = {nodes[member["ref"]]["island"] for member in members
                       if member["type"] == "node" and member["ref"] in nodes}
            islands.update(ways[member["ref"]]["island"] for member in members
                           if member["type"] == "way" and member["ref"] in ways)
            if len(islands) != 1:
                return
            for member in members:
                if (member["type"] == "node" and member["ref"] in nodes
                        and (member["role"].startswith(("stop", "platform"))
                             or member["ref"] in selected)):
                    selected[member["ref"]] = nodes[member["ref"]]
            relations[relation.id] = {"type": "relation", "id": int(relation.id),
                                      "members": members, "tags": tags, "island": islands.pop()}

    with osmium.io.Reader(str(path)) as reader:
        header = reader.header()
        snapshot = {key: header.get(key) for key in (
            "osmosis_replication_timestamp", "osmosis_replication_sequence_number", "generator")
                    if header.get(key)}
    Handler().apply_file(str(path))
    after = path.stat()
    require((before.st_size, before.st_mtime_ns) == (after.st_size, after.st_mtime_ns),
            "OSM source changed during catalog extraction")
    return {"source": {"path": path.name, "sha256": digest.hexdigest(), "size_bytes": before.st_size,
                       "snapshot": snapshot, "attribution": "OpenStreetMap contributors",
                       "license": "ODbL-1.0", "license_url": "https://www.openstreetmap.org/copyright",
                       "bboxes": {key: list(value) for key, value in bboxes.items()}},
            "elements": [record for records in (selected, ways, relations)
                         for _, record in sorted(records.items())]}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_review(root: Path, manifests: Path | None = None,
                    date_evidence: Path | None = None, *, provisional_schedule: bool = False,
                    osm_catalog: dict | None = None) -> dict:
    names = [
        "FULL_342_DEPARTURES.csv", "FULL_988_BASELINE_TIMELINES.csv",
        "FULL_31_ROUTE_REVIEW.csv",
        "PERIX_ISLAND_SCHEDULE_OBSERVATIONS_2026-10-22.json",
        "PERIX_ISLAND_OBSERVATION_GTFS_CROSSWALK_2026-10-22.json",
    ]
    hashes = {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in names}
    registry = json.loads((root / "03_SELECTED_FILES_SHA256_MANIFEST.json").read_text(encoding="utf-8"))
    expected = {item["name"]: item["sha256"] for item in registry["files"]}
    for name in names:
        require(hashes[name] == expected.get(name), f"Source checksum mismatch: {name}")

    tables = []
    for name in names[:3]:
        with (root / name).open(encoding="utf-8-sig", newline="") as stream:
            tables.append(list(csv.DictReader(stream)))
    observations, anchors, routes = tables
    source = json.loads((root / names[3]).read_text(encoding="utf-8"))
    crosswalk = json.loads((root / names[4]).read_text(encoding="utf-8"))
    by_id = {row["observation_id"]: row for row in observations}
    require(len(observations) == len(by_id) == 342, "Expected 342 unique observations")
    require(Counter(row["agency_id"] for row in observations) == {
        "SYR_KTEL": 17, "SYR_MINI": 88, "MYK_KTEL": 237,
    }, "Agency coverage changed")
    for records, fields in [
        (source["departure_observations"], {
            "agency_id": "agency_id", "route_id": "route_id", "direction": "direction",
            "departure": "departure", "day_rule": "day_rule", "origin": "origin",
        }),
        (crosswalk["source_observations"], {
            "agency_id": "agency_id_source", "route_id": "route_id_source",
            "direction": "direction_source", "departure": "published_origin_departure",
            "day_rule": "day_rule_source", "origin": "origin_source",
        }),
    ]:
        require(len(records) == 342 and {r["observation_id"] for r in records} == set(by_id),
                "Source/crosswalk observation IDs changed")
        for record in records:
            require(all(by_id[record["observation_id"]][key] == record[value]
                        for key, value in fields.items()), "Observation provenance mismatch")
    require(all(row[key] == "False" for row in observations for key in (
        "confirmed_gtfs_trip", "public_release_allowed", "maps_physical_gps",
        "can_render_as_confirmed_live_trip",
    )), "Research observation promoted to active/confirmed data")

    grouped = defaultdict(list)
    for row in anchors:
        require(row["observation_id"] in by_id, "Orphan timeline entry")
        parent = by_id[row["observation_id"]]
        require(all(row[key] == parent[key] for key in ("agency_id", "route_id")),
                "Timeline agency/route mismatch")
        require(not row["stop_id"] and row["platform_verified"] == "False",
                "Unverified platform promoted or stop ID invented")
        grouped[row["observation_id"]].append(row)
    require(len(anchors) == 988 and set(grouped) == set(by_id), "Timeline coverage changed")
    for oid, entries in grouped.items():
        entries.sort(key=lambda row: int(row["stop_sequence"]))
        require([int(row["stop_sequence"]) for row in entries] == list(range(1, len(entries) + 1)),
                f"Invalid timeline sequence: {oid}")
        seconds = [int(row["baseline_time_seconds"]) for row in entries]
        require(seconds == sorted(seconds), f"Time reversal: {oid}")
        require(len(entries) == int(by_id[oid]["timeline_entries"]), "Timeline count mismatch")

    published = [row for row in anchors if row["time_kind"] == "PUBLISHED_PASSAGE"]
    original = [row for row in source["published_syros_ktel_stop_times"] if row["served"] == "YES"]
    signature = lambda row: (row["observation_id"], int(row["stop_sequence"]),
                             row.get("stop_label", row.get("stop_name")),
                             row.get("baseline_time", row.get("published_time")))
    require(len(published) == 160 and Counter(map(signature, published)) == Counter(map(signature, original)),
            "Published passage anchors changed")
    require(sum(row["served"] != "YES" for row in source["published_syros_ktel_stop_times"]) == 10,
            "Explicit not-served cells changed")
    selected = [row for row in observations if row["route_id"] in SELECTED_SYROS_ROUTES]
    selected_anchors = [row for row in published if row["route_id"] in SELECTED_SYROS_ROUTES]
    require(len(selected) == 11 and len(selected_anchors) == 105, "Selected Syros coverage changed")

    route_ids = {row["route_id"] for row in routes}
    require(len(routes) == len(route_ids) == 31, "Expected 31 unique source route groups")
    require({row["route_id"] for row in observations} <= route_ids,
            "Observation route missing from review")
    counts = Counter(row["route_id"] for row in observations)
    require({row["route_id"] for row in routes if not counts[row["route_id"]]} == EMPTY_ROUTES,
            "Empty reference groups changed")
    for row in routes:
        require(int(row["published_departures"]) == counts[row["route_id"]], "Route count mismatch")
        require(row["public_activation_allowed"] == row["gtfs_approved"] == "False",
                "Route reference activated")
    require(all(row["day_rule"] == row["operator_day_rule_original"] == "UNSPECIFIED"
                for row in observations if row["agency_id"] == "MYK_KTEL"),
            "Unknown Mykonos calendar inferred")

    columns = defaultdict(list)
    for row in observations:
        if row["route_id"] == "MYK_FAB_ORNOS_AGIO":
            columns[row["direction"]].append(row)
    require(set(columns) == {"FROM_FABRIKA", "FROM_ORNOS", "FROM_AGIO"}
            and all(len(rows) == 14 for rows in columns.values()), "Expected 42 independent FROM observations")
    minutes = lambda value: sum(int(part) * factor for part, factor in zip(value.split(":"), (60, 1)))
    indices = {direction: {minutes(row["departure"]): row for row in rows}
               for direction, rows in columns.items()}
    candidates = []
    for start in sorted(indices["FROM_FABRIKA"]):
        require(start + 10 in indices["FROM_ORNOS"] and start + 15 in indices["FROM_AGIO"],
                "Mykonos +10/+15 candidate relationship changed")
        candidates.append({
            "observation_ids": [indices[direction][start + offset]["observation_id"]
                                for direction, offset in (("FROM_FABRIKA", 0), ("FROM_ORNOS", 10), ("FROM_AGIO", 15))],
            "offset_minutes": [0, 10, 15], "active": False,
            "status": "CLOCK_RELATION_ONLY_NOT_TRIP_OR_VEHICLE_CONTINUITY",
        })

    date_rows = {}
    date_hash = None
    if date_evidence is not None:
        date_hash = hashlib.sha256(date_evidence.read_bytes()).hexdigest()
        with date_evidence.open(encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream)
            fixed = {
                "original_date_field": "CONFLICT:2025-10-07_vs_2026-10-07",
                "source_current_indexed_header": "MON_FRI_FROM_2025-10-07",
                "source_date_as_printed": "2025-10-07",
                "source_date_conflict_status": "PRINTED_SOURCE_HEADER_RESOLVED_INDEXED_2026-10-22",
                "service_validity_oct_2026": "UNCONFIRMED",
                "calendar_rule": "MON_FRI_FROM_OBSERVATION_ONLY",
                "activation_allowed": "NO",
                "official_source_url": "https://ktelsyrou.gr/dromologia/",
            }
            fields = {"observation_id", "route_id", "departure", "note"} | fixed.keys()
            require(reader.fieldnames is not None and set(reader.fieldnames) == fields
                    and len(reader.fieldnames) == len(fields), "Malformed date evidence columns")
            delta = list(reader)
        expected_dates = {row["observation_id"]: row for row in observations
                          if row["route_id"] in {"SYR_KTEL_L1_WD", "SYR_KTEL_L3_WD"}}
        require(len(delta) == 10 and {row["observation_id"] for row in delta} == set(expected_dates),
                "Date evidence must contain exactly the 10 weekday observation IDs")
        for row in delta:
            parent = expected_dates[row["observation_id"]]
            require(set(row) == fields and all(row[key] == value for key, value in fixed.items())
                    and all(row[key] == parent[key] for key in ("route_id", "departure"))
                    and row["original_date_field"] == parent["valid_from_as_printed"]
                    and bool(row["note"]), "Date evidence provenance/activation mismatch")
            date_rows[row["observation_id"]] = row

    manifest_status = "NOT_CHECKED_NO_PATH_SUPPLIED"
    drafts = {}
    manifest_hashes = {}
    if manifests is not None:
        for agency, name in zip(("SYR_KTEL", "SYR_MINI", "MYK_KTEL"), (
            "syros_ktel_review_draft.json", "syros_municipal_review_draft.json", "mykonos_ktel_review_draft.json",
        )):
            draft = json.loads((manifests / name).read_text(encoding="utf-8"))
            manifest_hashes[name] = hashlib.sha256((manifests / name).read_bytes()).hexdigest()
            require(all(draft.get(key) is False for key in (
                "reviewed_and_approved", "rights_confirmed", "coordinates_verified",
            )) and draft.get("trips") == [], f"Draft approval/trips changed: {name}")
            require(not draft.get("patterns") and not draft.get("canonical_patterns"),
                    f"Draft canonical patterns changed: {name}")
            require(all(stop.get("stop_lat") is None and stop.get("stop_lon") is None
                        and not any(stop.get(key) for key in (
                            "platform_verified", "geometry_verified", "operator_platform_verified",
                        )) for stop in draft["stops"]), f"Active draft coordinates changed: {name}")
            metadata = draft["review_metadata"]
            require(set(metadata["source_route_aliases"].values()) <= {
                row["route_id"] for row in draft["routes"]
            }, f"Draft alias target missing: {name}")
            refs = [ref for refs in metadata.get("stop_candidates", {}).values() for ref in refs]
            refs += list(metadata.get("station_area_references", {}).values())
            refs += metadata.get("osm_relation_candidates", [])
            require(all(ref.get("operator_platform_verified") is False for ref in refs),
                    f"OSM candidate promoted to confirmed platform: {name}")
            drafts[agency] = draft
        manifest_status = "THREE_DRAFTS_UNAPPROVED_EMPTY_TRIPS_NULL_COORDINATES"

    exceptions = []
    alias_counts = Counter()
    for row in observations:
        draft = drafts.get(row["agency_id"], {})
        metadata = draft.get("review_metadata", {})
        alias = metadata.get("source_route_aliases", {}).get(row["route_id"])
        if alias:
            alias_counts[row["agency_id"]] += 1
        evidence = {key: row[key] for key in (
            "agency_id", "route_id", "route_name", "direction", "origin", "departure",
            "day_rule", "valid_from_as_printed", "source_url", "review_flags",
        )}
        evidence["candidate_scope"] = "UNVERIFIED_DRAFT_LABELS_NOT_STOP_PLATFORM_PATTERN_OR_TRIP_JOINS"
        evidence["draft_route_candidate"] = next(
            (route for route in draft.get("routes", []) if route["route_id"] == alias), None)
        # These are agency-level inventories, not inferred direction/origin matches.
        # KTEL published served labels narrow its inventory without adding excluded visits.
        stops = draft.get("stops", [])
        if row["agency_id"] == "SYR_KTEL":
            labels = {anchor["stop_label"] for anchor in grouped[row["observation_id"]]}
            stops = [stop for stop in stops if stop["stop_name"] in labels]
        evidence["draft_stop_candidates"] = [
            {"draft_stop_id": stop["stop_id"], "stop_label": stop["stop_name"],
             "status": "UNVERIFIED_AGENCY_INVENTORY_NOT_OBSERVATION_ASSIGNMENT",
             "osm_candidates": metadata.get("stop_candidates", {}).get(stop["stop_id"], [])}
            for stop in stops
        ]
        evidence["station_area_references_unverified_not_platforms"] = metadata.get("station_area_references", {})
        if alias:
            evidence["osm_relation_candidates_unverified_not_patterns"] = metadata.get("osm_relation_candidates", [])
        evidence["synthetic_web_observer_gtfs"] = "EXCLUDED_example.invalid_FABRICATED_IDS_DAILY_CALENDARS_FALSE_ORNOS_CONTINUITY"
        if row["observation_id"] in date_rows:
            evidence["additive_date_evidence"] = date_rows[row["observation_id"]]
        exceptions.append({
            "observation_id": row["observation_id"], "candidate_trip_id": "",
            "stop_label": row["origin"], "stop_id": "", "platform_id": "", "pattern_id": "",
            "geometry_verified": False, "day_rule_verified": False,
            "status": "BLOCKED_NO_AUTHORITATIVE_TRIP_PLATFORM_PATTERN" if alias else "BLOCKED_NO_DRAFT_ROUTE_ALIAS_OR_AUTHORITATIVE_JOIN",
            "evidence": json.dumps(evidence, ensure_ascii=True, sort_keys=True),
        })
    report = {
        "status": "VALIDATED_RESEARCH_ONLY_NOT_ACTIVATABLE", "active": False,
        "source_sha256": hashes, "observations_preserved": len(by_id),
        "published_anchors_preserved": len(published), "internal_assumptions": 828,
        "selected_syros_routes": sorted(SELECTED_SYROS_ROUTES),
        "selected_syros_departures": len(selected), "selected_syros_anchors": len(selected_anchors),
        "selected_syros_pending_anchors": [
            {
                "observation_id": row["observation_id"], "route_id": row["route_id"],
                "stop_sequence": int(row["stop_sequence"]), "stop_label": row["stop_label"],
                "published_time": row["baseline_time"], "verified_stop_id": None,
                "verified_pattern_id": None, "approval_status": "PENDING_STOP_GEOMETRY_JOIN",
            }
            for row in selected_anchors
        ],
        "selected_syros_date_blockers": [
            {
                "observation_id": oid, "route_id": row["route_id"],
                "status": "BLOCKED_OCT_2026_OPERATION_UNCONFIRMED",
                "original_date_field": by_id[oid]["valid_from_as_printed"],
                "source_date_as_printed": row["source_date_as_printed"],
                "printed_conflict_status": row["source_date_conflict_status"],
                "service_validity_oct_2026": "UNCONFIRMED",
                "resolved_valid_from": None, "public_activation_allowed": False,
            } for oid, row in date_rows.items()
        ] if date_rows else [
            {
                "route_id": "SYR_KTEL_L3_WD", "status": "BLOCKED_UNRESOLVED_DATE_CONFLICT",
                "valid_from_as_printed": sorted({row["valid_from_as_printed"] for row in selected
                                                 if row["route_id"] == "SYR_KTEL_L3_WD"}),
                "resolved_valid_from": None, "public_activation_allowed": False,
            }
        ],
        "mykonos_independent_observations": 42, "mykonos_calendar": "UNSPECIFIED",
        "mykonos_candidate_groups": candidates,
        "inactive_empty_groups": sorted(EMPTY_ROUTES), "manifest_status": manifest_status,
        "manifest_sha256": manifest_hashes, "date_evidence_sha256": date_hash,
        "date_evidence_observations": len(date_rows),
        "candidate_route_alias_counts": dict(alias_counts),
        "candidate_route_alias_observations": sum(alias_counts.values()),
        "unmatched_route_alias_observations": 342 - sum(alias_counts.values()),
        "confirmed_exact_mykonos_trips": 0, "confirmed_exact_ornos_trips": 0,
        "authoritative_trips": 0, "canonical_patterns": 0, "virtual_trips_created": 0,
        "synthetic_web_observer_gtfs": "EXCLUDED_NOT_AN_AUTHORITATIVE_INPUT",
        "exceptions": exceptions,
        "observation_ids": sorted(by_id),
    }
    if provisional_schedule:
        # The same validated records feed a pure preview compiler, not a second importer.
        from mobility.island_schedule import compile_island_schedule

        extra_names = ["PERIX_SYROS_MYKONOS_ROUTE_STOP_REFERENCE_2026-10-22.json",
                       "PERIX_SYROS_MYKONOS_ETA_RESEARCH_V2_2026-10-22.json"]
        documents = []
        for name in extra_names:
            digest = hashlib.sha256((root / name).read_bytes()).hexdigest()
            require(digest == expected.get(name), f"Source checksum mismatch: {name}")
            hashes[name] = digest
            documents.append(json.loads((root / name).read_text(encoding="utf-8")))
        schedule = compile_island_schedule(*documents, observations, anchors, routes, candidates)
        require(schedule["coverage"]["reference_variants"] == 27
                and schedule["coverage"]["stop_occurrences"] == 311
                and schedule["coverage"]["source_clock_excerpts"] == 34,
                "Provisional reference/excerpt coverage changed")
        schedule["source_sha256"] = dict(hashes)
        schedule["manifest_sha256"] = manifest_hashes
        schedule["date_evidence_sha256"] = date_hash
        if osm_catalog is not None:
            from mobility.island_schedule import resolve_osm_stops

            schedule = resolve_osm_stops(schedule, osm_catalog)
            for route in schedule["routes"]:
                for stop in route["stops"]:
                    stop["candidate_osm_ids"] = [candidate["osm_id"]
                                                  for candidate in stop["spatial_candidates"]]
                    stop["coordinate_source"] = ({
                        "osm_id": stop["physical_stop_id"], "path": osm_catalog["source"]["path"],
                        "sha256": osm_catalog["source"]["sha256"],
                        "method": stop["resolution_method"],
                    } if stop["coordinates"] is not None else None)
        report["provisional_schedule"] = schedule
    return report


def validate_output_paths(source: Path, manifests: Path | None, date_evidence: Path | None,
                          outputs: list[Path], *, osm_pbf: Path | None = None) -> None:
    """Check every destination before writing anything, including output collisions."""
    resolved = [path.resolve() for path in outputs]
    require(len(set(resolved)) == len(resolved), "Review outputs must use distinct paths")
    require(all(not first.exists() or not second.exists() or not first.samefile(second)
                for index, first in enumerate(resolved) for second in resolved[index + 1:]),
            "Review outputs must use distinct paths")
    for output in resolved:
        for directory in (source, manifests):
            if directory is not None:
                protected = directory.resolve()
                require(output != protected and protected not in output.parents,
                        "Review output must not overwrite an input or write inside an input directory")
                if directory.exists():
                    require(all(not path.is_file() or not output.exists() or not output.samefile(path)
                                for path in directory.iterdir()), "Review output must not overwrite an input")
        for input_path in (date_evidence, osm_pbf):
            if input_path is not None:
                require(output != input_path.resolve()
                        and (not output.exists() or not output.samefile(input_path)),
                        "Review output must not overwrite an input")
        require(output.parent.is_dir(), f"Review output parent does not exist: {output.parent}")


if __name__ == "__main__":
    # Support direct script invocation as well as backend package imports.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--manifests", type=Path)
    parser.add_argument("--date-evidence", type=Path)
    parser.add_argument("--exceptions-csv", type=Path)
    parser.add_argument("--provisional-schedule", type=Path,
                        help="Write internal provisional JSON only; never a runtime feed")
    parser.add_argument("--provisional-stop-times", type=Path,
                        help="Write all local reference occurrences as internal provisional UTF-8 CSV")
    parser.add_argument("--osm-pbf", type=Path, help="Read a local OSM snapshot offline for stop resolution")
    parser.add_argument("--osm-catalog-output", type=Path, help="Write the extracted Overpass-style stop catalog")
    args = parser.parse_args()
    if args.osm_catalog_output is not None and args.osm_pbf is None:
        parser.error("--osm-catalog-output requires --osm-pbf")
    validate_output_paths(args.source, args.manifests, args.date_evidence,
                          [path for path in (args.exceptions_csv, args.provisional_schedule,
                                             args.provisional_stop_times, args.osm_catalog_output) if path is not None],
                          osm_pbf=args.osm_pbf)
    catalog = extract_island_stop_catalog(args.osm_pbf) if args.osm_pbf is not None else None
    report = validate_review(args.source, args.manifests, args.date_evidence,
                             provisional_schedule=(args.provisional_schedule is not None
                                                   or args.provisional_stop_times is not None),
                             osm_catalog=catalog)
    if args.osm_catalog_output is not None:
        args.osm_catalog_output.write_text(json.dumps(catalog, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    if catalog is not None:
        report["osm_catalog_source"] = catalog["source"]
        report["osm_catalog_elements"] = dict(Counter(element["type"] for element in catalog["elements"]))
    if "provisional_schedule" in report:
        schedule = report.pop("provisional_schedule")
        if args.provisional_schedule is not None:
            args.provisional_schedule.write_text(json.dumps(schedule, indent=2, ensure_ascii=True) + "\n",
                                                 encoding="utf-8")
        if args.provisional_stop_times is not None:
            with args.provisional_stop_times.open("w", encoding="utf-8", newline="") as stream:
                writer = csv.DictWriter(stream, fieldnames=PROVISIONAL_STOP_COLUMNS)
                writer.writeheader()
                for route in schedule["routes"]:
                    reference = route["source_reference"]
                    for index, stop in enumerate(route["stops"]):
                        leg = route["legs"][index - 1] if index else None
                        writer.writerow({
                            "island": reference["city"], "agency": reference["operator"],
                            "route_reference": route["reference_id"], "direction": reference["direction_as_listed"],
                            "sequence": stop["sequence"], "label": stop["label"],
                            "from_previous_seconds": leg["seconds"] if leg else 0,
                            "offset_seconds": stop["estimated_offset_seconds"],
                            "method": leg["method"] if leg else "REFERENCE_START_ZERO_NOT_PUBLISHED_ARRIVAL",
                            "confidence": leg["confidence"] if leg else "LOCAL_REFERENCE_ORIGIN_ONLY",
                            "physical_stop_id": stop.get("physical_stop_id") or "",
                            "coordinates": json.dumps(stop["coordinates"], sort_keys=True) if stop.get("coordinates") is not None else "",
                            "spatial_status": stop.get("spatial_status", ""),
                            "candidate_osm_ids": json.dumps(stop.get("candidate_osm_ids", [])),
                            "coordinate_source": json.dumps(stop["coordinate_source"], sort_keys=True) if stop.get("coordinate_source") is not None else "",
                            "source": json.dumps(leg["source"] if leg else {
                                "source_label": "LOCAL_REFERENCE_START_NOT_PHYSICAL_STOP", "reference_id": route["reference_id"]
                            }, ensure_ascii=False, sort_keys=True),
                            "departure_observation_count": len(route["matched_observation_departures"]),
                        })
        report["provisional_schedule_coverage"] = schedule["coverage"]
    if args.exceptions_csv is not None:
        with args.exceptions_csv.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=EXCEPTION_COLUMNS)
            writer.writeheader()
            writer.writerows(report["exceptions"])
    print(json.dumps(report, indent=2))
