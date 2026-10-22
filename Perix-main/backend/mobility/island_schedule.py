"""Pure, offline compilation of review records, never an importer or runtime feed.

All IDs below identify local reference occurrences, not physical stops. Timing
estimates have no geometry, traffic, vehicle-continuity or accuracy guarantees.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from copy import deepcopy
from math import cos, hypot, isfinite, radians
from statistics import median
import unicodedata


def normalize_name(value: str) -> str:
    """Only case, Greek diacritics and whitespace; no fuzzy/address matching."""
    return " ".join("".join(
        char for char in unicodedata.normalize("NFD", value.casefold())
        if not unicodedata.combining(char)
    ).split())


# Explicit label vocabulary, not a general transliterator. Numbered labels and
# street addresses deliberately have no locality/prefix fallback.
_OSM_ALIAS_GROUPS = {
    "Syros": [
        ("Κίνι", "Kini"), ("Δανακός", "Danakos"),
        ("Αζόλιμνο", "Αζόλιμνος", "Azolimnos"),
        ("Πωσειδωνία", "Ποσειδωνία", "Poseidonia", "Posidonia"),
        ("Φοίνικας", "Finikas", "Foinikas"),
        ("Γεωργίου (Βάρη)", "Βάρη", "Vari"),
        ("Τάλαντα", "Talanta"), ("Επισκοπείο", "Episkopio"),
        ("Πάγο", "Πάγος", "Pagos"), ("Βήσσα", "Vissa"),
        ("Αξαρλη", "Αξαρλή"),
        ("Δόξα", "ΔΟΞΑ - ΤΕΡΜΑΤΙΚΟΣ ΣΤΑΘΜΟΣ", "Doxa"),
        ("Κλειστό Γυμναστήριο Δημήτριος Βικέλας", "Κλειστό Γυμναστήριο"),
        ("Αφετηρία Κτελ Σύρου", "Αφετηρία Υπεραστικών Συγκοινωνιών ΚΤΕΛ Σύρου",
         "Central Bus Station KTEL"),
    ] + [(f"Φοίνικας {n}", f"Finikas {n}", f"Foinikas {n}") for n in (1, 2, 3)]
      + [(f"Ποσειδωνία {n}", f"Πωσειδωνία {n}", f"Poseidonia {n}") for n in (1, 2, 3, 4)],
    "Mykonos": [
        ("Νέο Λιμάνι", "New Port"), ("Παλιό Λιμάνι", "Παλαιό Λιμάνι", "Old Port"),
        ("Όρνος", "Ορνός", "Ornos"),
        ("Πλατύς Γιαλός", "Platys Gialos", "Platis Gialos"),
        ("Paradise", "Paradise Beach"), ("Παράγκα", "Paraga"),
        ("Άνω Μέρα", "Ano Mera"), ("Ελιά", "Elia"),
        ("Καλαφάτη", "Kalafati", "Kalafatis"),
        ("Καλό Λιβάδι", "Kalo Livadi"), ("Πάνορμος", "Panormos"),
        ("Άγιος Στέφανος", "Agios Stefanos"),
        # Mykonos locality only; never expand the source's road labels to it.
        ("Άγιος Ιωάννης", "Άγιος Ιωάννης Διακόφτης", "Agios Ioannis", "Agios Ioannis Diakoftis"),
        ("Δραφάκι", "Drafaki"), ("Μαράθι", "Marathi"),
        ("Αμυγδαλίδι", "Amygdalidi"),
    ],
}
_ISLAND_BBOXES = {"Syros": (37.32, 24.80, 37.55, 25.07),
                  "Mykonos": (37.34, 25.23, 37.52, 25.51)}
_GENERIC_STOP_NAMES = {normalize_name(name) for name in
                       ("Στάση", "stop", "bus stop", "bus_stop", "public bus", "unnamed", "")}
_OSM_NAME_KEYS = ("name", "official_name", "name:el", "name:en", "int_name", "local_ref")


def resolve_osm_stops(schedule: dict, catalog: dict) -> dict:
    """Return an independent, inactive preview with provisional OSM evidence.

    Catalog is an offline Overpass-shaped {elements: [...], source: {...}}.
    Only bus features are considered; polygons remain candidates without point
    coordinates. No geocoding, nearest-stop inference or operator IDs are used.
    """
    result = deepcopy(schedule)
    aliases = {island: {normalize_name(label): normalize_name(group[0])
                        for group in groups for label in group}
               for island, groups in _OSM_ALIAS_GROUPS.items()}

    def canonical(value, island):
        key = normalize_name(value)
        return aliases.get(island, {}).get(key, key)

    def inside(point, island):
        box = _ISLAND_BBOXES.get(island)
        return bool(box and point and box[0] <= point[0] <= box[2]
                    and box[1] <= point[1] <= box[3])

    features = {island: [] for island in _ISLAND_BBOXES}
    for element in catalog.get("elements", []):
        tags = element.get("tags", {})
        if tags.get("bus") == "no" or tags.get("access") in ("private", "no"):
            continue
        station = tags.get("amenity") == "bus_station" or (
            tags.get("public_transport") == "station" and tags.get("bus") == "yes")
        platform = tags.get("highway") == "bus_stop" or (
            tags.get("public_transport") == "platform" and tags.get("bus") == "yes")
        position = tags.get("public_transport") == "stop_position" and tags.get("bus") == "yes"
        if not (station or platform or position) or element.get("type") not in ("node", "way", "relation"):
            continue
        point = None
        if element["type"] == "node":
            lat, lon = element.get("lat"), element.get("lon")
            if (isinstance(lat, (int, float)) and isinstance(lon, (int, float))
                    and isfinite(lat) and isfinite(lon)):
                point = [lat, lon]
        geometry = element.get("geometry", [])
        for island in features:
            # All polygon vertices must be scoped; never use an Overpass centre.
            if not inside(point, island) and not (point is None and geometry and all(
                    inside([p.get("lat", -90), p.get("lon", -180)], island) for p in geometry)):
                continue
            names = [{"tag": key, "value": tags[key], "normalized": canonical(tags[key], island)}
                     for key in _OSM_NAME_KEYS if isinstance(tags.get(key), str)
                     and normalize_name(tags[key]) not in _GENERIC_STOP_NAMES]
            features[island].append({
                "osm_id": f"osm:{element['type']}:{element['id']}",
                "osm_type": element["type"], "osm_ref": element["id"],
                "coordinates": point, "level": "station" if station else "platform" if platform else "stop_position",
                "names": names, "tags": deepcopy(tags), "candidate_cluster": [],
                "station_geometry": deepcopy(geometry) if station and point is None else [],
            })

    # A platform/road-position pair is not two boarding sides. Only unique
    # reciprocal pairs with equal names within 20 m can share candidate evidence.
    for island, items in features.items():
        partners = defaultdict(list)
        for left in items:
            if left["level"] != "stop_position" or not left["coordinates"]:
                continue
            for right in items:
                if right["level"] != "platform" or not right["coordinates"]:
                    continue
                common = {n["normalized"] for n in left["names"]} & {n["normalized"] for n in right["names"]}
                a, b = left["coordinates"], right["coordinates"]
                distance = 111195 * hypot(a[0] - b[0], (a[1] - b[1]) * cos(radians(a[0])))
                if common and distance <= 20:
                    partners[left["osm_id"]].append(right)
                    partners[right["osm_id"]].append(left)
        for item in items:
            pair = partners[item["osm_id"]]
            if len(pair) == 1 and len(partners[pair[0]["osm_id"]]) == 1:
                item["candidate_cluster"] = sorted([item["osm_id"], pair[0]["osm_id"]])

    def candidates_for(label, island):
        if normalize_name(label) in _GENERIC_STOP_NAMES:
            return []
        key = canonical(label, island)
        found = []
        for item in features.get(island, []):
            evidence = [n for n in item["names"] if n["normalized"] == key]
            if evidence:
                found.append({**deepcopy(item), "matched_names": evidence})
        platform_ids = {item["osm_id"] for item in found if item["level"] == "platform"}
        found = [item for item in found if not (item["level"] == "stop_position"
                 and platform_ids.intersection(item["candidate_cluster"]))]
        # A matching station is context, not another boarding platform, only
        # when physically associated. Remote same-name stations remain rivals.
        context_ids = set()
        for item in found:
            if not item["coordinates"] or item["level"] not in ("platform", "station"):
                continue
            for station in found:
                if station["level"] != "station" or station is item:
                    continue
                a, b = item["coordinates"], station["coordinates"]
                if item["level"] == "station" and b:
                    continue
                associated = bool(b and 111195 * hypot(
                    a[0] - b[0], (a[1] - b[1]) * cos(radians(a[0]))) <= 100)
                polygon = station["station_geometry"]
                if len(polygon) >= 4 and polygon[0] == polygon[-1]:
                    # Point-in-footprint, not its centroid or bounding-box centre.
                    contained = False
                    for left, right in zip(polygon, polygon[1:]):
                        if (left["lat"] > a[0]) != (right["lat"] > a[0]):
                            crossing = left["lon"] + (a[0] - left["lat"]) * (
                                right["lon"] - left["lon"]) / (right["lat"] - left["lat"])
                            if a[1] < crossing:
                                contained = not contained
                    associated = contained
                if associated:
                    item.setdefault("station_context", []).append(deepcopy(station))
                    context_ids.add(station["osm_id"])
        return sorted([item for item in found if item["osm_id"] not in context_ids],
                      key=lambda item: item["osm_id"])

    def assign(stop, candidate, method, evidence):
        stop.update(physical_stop_id=candidate["osm_id"], coordinates=list(candidate["coordinates"]),
                    platform_id=candidate["osm_id"] if candidate["level"] == "platform" else None,
                    spatial_status="MATCHED_OSM_STATION_CANDIDATE" if candidate["level"] == "station"
                    else "MATCHED_OSM_NAMED_CANDIDATE" if method == "EXACT_NORMALIZED_OSM_NAME"
                    else "MATCHED_OSM_RELATION_CANDIDATE",
                    resolution_method=method, resolution_evidence=evidence,
                    coordinate_level=candidate["level"])

    relations = {str(e["id"]): e for e in catalog.get("elements", []) if e.get("type") == "relation"}
    for route in result.get("routes", []):
        source = route.get("source_reference", {})
        island = source.get("city")
        stops = route["stops"]
        for stop in stops:
            candidates = candidates_for(stop["label"], island)
            stop.update(physical_stop_id=None, platform_id=None, coordinates=None, coordinate_level=None,
                        authoritative=False, spatial_status="AMBIGUOUS" if candidates else "UNRESOLVED",
                        resolution_method="NONE", resolution_evidence=[], spatial_candidates=candidates)
            if len(candidates) == 1 and candidates[0]["coordinates"]:
                evidence = deepcopy(candidates[0]["matched_names"])
                if candidates[0].get("station_context"):
                    evidence.append({"station_context": deepcopy(candidates[0]["station_context"]),
                                     "basis": "SAME_NORMALIZED_NAME_AND_PROXIMITY_OR_CONTAINING_FOOTPRINT"})
                assign(stop, candidates[0], "EXACT_NORMALIZED_OSM_NAME", evidence)

        # Known A/B corridor only. MUNI_1 actually lists Doxa -> sports centre,
        # hence 4594448, not the opposite direction 4594447. Other municipal
        # neighbourhood loops cannot inherit this association.
        relation_id = "4594448" if (source.get("operator") == "SYR_MINI"
                                      and source.get("route_code") == "MUNI_1" and island == "Syros") else None
        relation = relations.get(relation_id)
        review = {"relation_id": f"osm:relation:{relation_id}" if relation_id else None,
                  "status": "NOT_APPLICABLE" if not relation_id else "RELATION_NOT_AVAILABLE"}
        if relation and relation.get("tags", {}).get("route") == "bus":
            lookup = {item["osm_id"]: item for item in features[island]}
            members, invalid = [], False
            for member in relation.get("members", []):
                role = member.get("role", "")
                if role not in ("stop", "platform", "stop_entry_only", "stop_exit_only",
                                "platform_entry_only", "platform_exit_only"):
                    continue
                item = lookup.get(f"osm:{member['type']}:{member['ref']}")
                if not item or not item["coordinates"]:
                    invalid = True
                    break
                paired = False
                if members and {item["level"], members[-1]["level"]} == {"platform", "stop_position"}:
                    previous = members[-1]
                    a, b = item["coordinates"], previous["coordinates"]
                    common = {n["normalized"] for n in item["names"]} & {
                        n["normalized"] for n in previous["names"]}
                    paired = bool(common and 111195 * hypot(
                        a[0] - b[0], (a[1] - b[1]) * cos(radians(a[0]))) <= 20)
                if paired:
                    cluster = sorted([members[-1]["osm_id"], item["osm_id"]])
                    if item["level"] == "platform":
                        members[-1] = deepcopy(item)
                    else:
                        members[-1] = deepcopy(members[-1])
                    members[-1]["candidate_cluster"] = cluster
                    continue
                members.append(item)
            anchors = []
            for index, stop in enumerate(stops):
                ids = {c["osm_id"] for c in stop["spatial_candidates"]}
                ids.update(cid for c in stop["spatial_candidates"] for cid in c["candidate_cluster"])
                if ids:
                    anchors.append((index, [j for j, item in enumerate(members)
                                            if item["osm_id"] in ids or ids.intersection(item["candidate_cluster"])]))
            # Retain every possible ordered alignment, not a greedy choice of
            # the first repeated name. Forward/backward reachability is linear
            # in anchors * members and detects direction conflicts.
            forward, backward = [], []
            for _, choices in anchors:
                forward.append([j for j in choices if not forward or any(k < j for k in forward[-1])])
            for _, choices in reversed(anchors):
                backward.append([j for j in choices if not backward or any(k > j for k in backward[-1])])
            allowed = [sorted(set(a) & set(b)) for a, b in zip(forward, reversed(backward))]
            compatible = not invalid and len(anchors) >= 2 and all(allowed)
            review["status"] = "ORDERED_NAMED_ANCHORS" if compatible else "ORDER_CONFLICT_OR_INCOMPLETE_MEMBERS"
            review["anchors"] = [{"stop_index": i, "member_indices": choices}
                                 for (i, _), choices in zip(anchors, allowed)]
            if compatible:
                assigned = {}
                for (index, _), choices in zip(anchors, allowed):
                    if len(choices) == 1:
                        assigned[index] = choices[0]
                        assign(stops[index], members[choices[0]], "ORDERED_OSM_RELATION_NAMED_ANCHORS",
                               [{"relation_id": review["relation_id"], "member_index": choices[0],
                                 "osm_id": members[choices[0]]["osm_id"],
                                 "candidate_cluster": members[choices[0]]["candidate_cluster"],
                                 "normalized_label": canonical(stops[index]["label"], island)}])
                # Generic occurrences need a unique bracket and an exact count
                # of intervening members. Unknown named/address labels block it.
                bracketed = {}
                for left, right in zip(sorted(assigned), sorted(assigned)[1:]):
                    if assigned[right] - assigned[left] == right - left:
                        bracketed.update({i: (left, right) for i in range(left + 1, right)
                                          if normalize_name(stops[i]["label"]) in _GENERIC_STOP_NAMES})
                all_accounted = all(i in assigned or i in bracketed for i in range(len(stops)))
                if all_accounted:
                    for index, (left, right) in bracketed.items():
                        member_index = assigned[left] + index - left
                        assign(stops[index], members[member_index], "UNIQUE_BRACKETED_OSM_RELATION_MEMBER",
                               [{"relation_id": review["relation_id"], "member_index": member_index,
                                 "preceding_sequence": stops[left]["sequence"],
                                 "following_sequence": stops[right]["sequence"]}])
        route["spatial_relation_review"] = review
        counts = Counter("matched" if stop["physical_stop_id"] else "ambiguous"
                         if stop["spatial_candidates"] else "unresolved" for stop in stops)
        route["spatial_coverage"] = {key: counts[key] for key in ("matched", "ambiguous", "unresolved")}
        route["spatial_coverage"].update(stop_occurrences=len(stops),
                                          all_stops_resolved=bool(stops) and counts["matched"] == len(stops))
    routes = result.get("routes", [])
    coverage = {key: sum(r["spatial_coverage"][key] for r in routes)
                for key in ("matched", "ambiguous", "unresolved", "stop_occurrences")}
    coverage["routes_all_stops_resolved"] = sum(r["spatial_coverage"]["all_stops_resolved"] for r in routes)
    coverage["reference_variants"] = len(routes)
    coverage["by_island"] = {
        island: {key: sum(r["spatial_coverage"][key] for r in routes
                          if r.get("source_reference", {}).get("city") == island)
                 for key in ("matched", "ambiguous", "unresolved", "stop_occurrences")}
        for island in sorted(_ISLAND_BBOXES)
    }
    result["spatial_coverage"] = coverage
    result.setdefault("coverage", {})["spatial"] = deepcopy(coverage)
    result["spatial_resolution"] = {
        "schema_version": 1, "status": "PROVISIONAL_OSM_NOT_OPERATOR_CONFIRMED", "authoritative": False,
        "source": deepcopy(catalog.get("source", {})), "coordinate_order": ["latitude", "longitude"],
        "policy": "Exact normalized names and explicit label aliases within island bounding boxes; "
                  "no fuzzy addresses, polygon centroids, nearest-stop interpolation or boarding-side inference.",
        "attribution": "OpenStreetMap contributors, ODbL https://www.openstreetmap.org/copyright",
    }
    result.update(active=False, runtime_eligible=False, public_release_allowed=False)
    return result


def _clock(value: str) -> int:
    hour, minute = map(int, value.split(":"))
    if hour < 0 or not 0 <= minute < 60:
        raise ValueError(f"Invalid source clock: {value}")
    return hour * 3600 + minute * 60


def _join_name(value: str, agency: str) -> str:
    # Explicit locality-label equivalences only, never platform equivalences.
    aliases = {
        "SYR_KTEL": {
            "Ερμούπολη (αφετηρία)": "Ερμούπολη",
            "Ερμούπολη (τέρμα)": "Ερμούπολη",
            "Αφετηρία Κτελ Σύρου": "Ερμούπολη",
            "Αζόλιμνο": "Αζόλιμνος",
            "Πωσειδωνία": "Ποσειδωνία",
            "Γεωργίου (Βάρη)": "Βάρη",
        },
    }
    mapping = {normalize_name(key): normalize_name(target)
               for key, target in aliases.get(agency, {}).items()}
    name = normalize_name(value)
    return mapping.get(name, name)


def align_names(stops: list[str], names: list[str]) -> dict:
    """Match names as an ordered subsequence, consuming repeated occurrences.

    Missing names stay missing. A known name that cannot be consumed in order
    invalidates the alignment instead of silently reversing or skipping it.
    """
    normalized = [normalize_name(stop) for stop in stops]
    cursor = 0
    matched, missing = [], []
    for ordinal, name in enumerate(names):
        key = normalize_name(name)
        if key not in normalized:
            missing.append(ordinal)
            continue
        index = next((i for i in range(cursor, len(stops)) if normalized[i] == key), None)
        if index is None:
            return {"status": "ORDER_CONFLICT", "matches": matched,
                    "missing_name_indices": missing, "conflict_name_index": ordinal}
        matched.append({"name_index": ordinal, "stop_index": index})
        cursor = index + 1
    return {"status": "ORDERED" if len(matched) >= 2 else "INSUFFICIENT_NAMED_ANCHORS",
            "matches": matched, "missing_name_indices": missing}


def compile_timing(stops: list[str], excerpts: list[dict],
                   fallback: dict | None = None) -> dict:
    """Interpolate excerpt *deltas*, with explicitly modelled uncovered legs."""
    samples = defaultdict(list)
    for excerpt in excerpts:
        samples[excerpt["sample_id"]].append(excerpt)
    candidates, reviews = [], []
    for sample_id, rows in sorted(samples.items()):
        rows = sorted(rows, key=lambda row: int(row["stop_ordinal_in_excerpt"]))
        usable, excluded = [], []
        previous = None
        for row in rows:
            clock = _clock(row["observed_clock"])
            # A circular origin-key reset is not an overnight return arrival.
            if previous is not None and clock < previous:
                excluded.append({"excerpt": row, "reason": "CLOCK_REVERSAL_OR_ORIGIN_RESET_NOT_ARRIVAL"})
                continue
            previous = clock
            usable.append(row)
        alignment = align_names(stops, [row["stop_name"] for row in usable])
        review = {"sample_id": sample_id, **alignment, "excluded_clocks": excluded}
        reviews.append(review)
        if alignment["status"] == "ORDERED":
            anchors = [{**match, "clock_seconds": _clock(usable[match["name_index"]]["observed_clock"]),
                        "excerpt": usable[match["name_index"]]}
                       for match in alignment["matches"]]
            candidates.append((anchors, sample_id))

    # Do not blend conflicting snapshots into a fictitious measured profile.
    # Prefer the sample covering the most named anchors; report all alternatives.
    candidates.sort(key=lambda item: (-len(item[0]), item[1]))
    anchors, sample_id = candidates[0] if candidates else ([], None)
    leg_count = max(0, len(stops) - 1)
    rate, calibration = None, None
    if fallback and fallback["total_seconds"] > 0 and leg_count:
        rate = fallback["total_seconds"] / leg_count
        calibration = fallback
    elif len(anchors) >= 2:
        span = anchors[-1]["stop_index"] - anchors[0]["stop_index"]
        duration = anchors[-1]["clock_seconds"] - anchors[0]["clock_seconds"]
        if duration > 0:
            rate = duration / span
            calibration = {"method": "ORDERED_EXCERPT_SPAN_PER_STOP_FALLBACK",
                           "sample_id": sample_id, "span_seconds": duration, "span_legs": span}
    legs = [{"from_sequence": i + 1, "to_sequence": i + 2,
             "seconds": None if rate is None else round((i + 1) * rate) - round(i * rate),
             "method": "UNRESOLVED" if rate is None else "MODELLED_PER_STOP_FALLBACK",
             "confidence": "NONE" if rate is None else "LOW_MODELLED",
             "source": calibration} for i in range(leg_count)]
    for left, right in zip(anchors, anchors[1:]):
        start, end = left["stop_index"], right["stop_index"]
        delta = right["clock_seconds"] - left["clock_seconds"]
        for index in range(start, end):
            legs[index].update({
                "seconds": round(delta * (index + 1 - start) / (end - start))
                           - round(delta * (index - start) / (end - start)),
                "method": "ESTIMATED_PIECEWISE_LINEAR_NAMED_ANCHORS",
                "confidence": "LOW_SCHEDULE_BENCHMARK_NOT_MEASURED",
                "source": {"sample_id": sample_id, "left_excerpt": left["excerpt"],
                           "right_excerpt": right["excerpt"], "benchmark_delta_seconds": delta},
            })
    offsets = [0] if stops else []
    for leg in legs:
        offsets.append(None if offsets[-1] is None or leg["seconds"] is None
                       else offsets[-1] + leg["seconds"])
    return {"legs": legs, "offset_seconds_from_reference_start": offsets,
            "coverage_status": "UNRESOLVED" if any(leg["seconds"] is None for leg in legs)
                               else "COMPLETE_PROVISIONAL_ESTIMATES",
            "timing_anchor_reviews": reviews, "selected_sample_id": sample_id,
            "fallback_calibration": calibration}


def compile_island_schedule(reference: dict, research: dict, observations: list[dict],
                            timelines: list[dict], source_routes: list[dict],
                            clock_relationships: list[dict], *, agency_prior: bool = True) -> dict:
    """Compile existing validated tables without modifying evidence or calendars."""
    grouped = defaultdict(list)
    for row in timelines:
        grouped[row["observation_id"]].append(row)
    for rows in grouped.values():
        rows.sort(key=lambda row: int(row["stop_sequence"]))
    excerpts = research["research_only_evidence_excerpts"]
    variants = reference["routes"]
    joins, routes = [], []
    accepted = defaultdict(list)
    for observation in observations:
        agency = observation["agency_id"]
        codes = observation.get("moovit_route_family_review_candidates", "").split(";")
        choices = [route for route in variants
                   if route["operator"] == agency and route["route_code"] in codes]
        timeline = grouped[observation["observation_id"]]
        names = [_join_name(row["stop_label"], agency) for row in timeline]
        union = {_join_name(stop, agency) for route in choices for stop in route["ordered_stops"]}
        for route in choices:
            stops = [_join_name(stop, agency) for stop in route["ordered_stops"]]
            alignment = align_names(stops, names)
            origin = _join_name(observation["origin"], agency)
            missing_distinctive = sorted((set(names) & union) - set(stops))
            if observation["route_id"] == "MYK_FAB_ORNOS_AGIO":
                status = "INDEPENDENT_FROM_COLUMN_NO_TRIP_JOIN"
            elif int(observation.get("not_served_cells", 0)):
                status = "SHORT_WORKING_NOT_FULL_REFERENCE_VARIANT"
            elif origin != stops[0]:
                status = "ORIGIN_OR_DIRECTION_MISMATCH"
            elif missing_distinctive:
                status = "DISTINCTIVE_NAMED_ANCHOR_MISSING"
            elif alignment["status"] != "ORDERED":
                status = alignment["status"]
            else:
                status = "PROVISIONAL_ORDERED_NAMED_ALIGNMENT_NOT_PLATFORM_OR_TRIP"
            join = {"observation_id": observation["observation_id"],
                    "source_route_id": observation["route_id"], "source_direction": observation["direction"],
                    "source_origin": observation["origin"],
                    "reference_id": f"{agency}:{route['route_code']}:{route['source_page_identifier']}",
                    "status": status, "named_alignment": alignment,
                    "missing_distinctive_names_normalized": missing_distinctive,
                    "accepted": status.startswith("PROVISIONAL_ORDERED")}
            joins.append(join)
            if join["accepted"]:
                accepted[join["reference_id"]].append(observation)

    for route in variants:
        agency, code = route["operator"], route["route_code"]
        rid = f"{agency}:{code}:{route['source_page_identifier']}"
        matched = accepted[rid]
        calibrations = []
        for observation in matched:
            rows = grouped[observation["observation_id"]]
            duration = int(rows[-1]["baseline_time_seconds"]) - int(rows[0]["baseline_time_seconds"])
            if duration > 0:
                calibrations.append({"observation_id": observation["observation_id"],
                                     "source_route_id": observation["route_id"],
                                     "direction": observation["direction"], "total_seconds": duration,
                                     "basis": sorted({row["basis"] for row in rows})})
        # A source route/direction total can calibrate a declared model without
        # claiming that its departure is joined to the reference's first stop.
        # Require the listed direction origin, not just a family-code overlap.
        title_conflict = any("CRITICAL" in issue for issue in route.get("issues", []))
        if not calibrations and not title_conflict:
            listed_origin = route["direction_as_listed"].split("\u2192")[0].strip()
            for observation in observations:
                if (observation["agency_id"] != agency
                        or code not in observation.get("moovit_route_family_review_candidates", "").split(";")
                        or normalize_name(observation["origin"]) != normalize_name(listed_origin)
                        or int(observation.get("not_served_cells", 0))):
                    continue
                rows = grouped[observation["observation_id"]]
                # Published totals from an unaligned official pattern must not
                # be projected onto another Moovit variant (notably line 3/2).
                if any(row.get("time_kind") != "PERIX_INTERNAL_COARSE_ESTIMATE" for row in rows):
                    continue
                duration = int(rows[-1]["baseline_time_seconds"]) - int(rows[0]["baseline_time_seconds"])
                if duration > 0:
                    calibrations.append({"observation_id": observation["observation_id"],
                                         "source_route_id": observation["route_id"],
                                         "direction": observation["direction"], "total_seconds": duration,
                                         "basis": sorted({row["basis"] for row in rows}),
                                         "scope": "SOURCE_FAMILY_LISTED_ORIGIN_DURATION_MODEL_ONLY_NO_STOP_OR_DEPARTURE_JOIN"})
        fallback = None
        if calibrations:
            fallback = {"method": "FULL988_ROUTE_DIRECTION_MEDIAN_TOTAL_UNIFORM_PER_STOP",
                        "total_seconds": median(row["total_seconds"] for row in calibrations),
                        "evidence": calibrations, "confidence": "LOW_MODELLED_NOT_PUBLISHED"}
        timing = compile_timing(route["ordered_stops"], [row for row in excerpts
                                if row["agency_id"] == agency and row["route_code"] == code], fallback)
        occurrences = Counter()
        stops = []
        for index, label in enumerate(route["ordered_stops"]):
            key = normalize_name(label)
            occurrences[key] += 1
            stops.append({"internal_reference_occurrence_id": f"{rid}:occurrence:{index + 1}",
                          "sequence": index + 1, "label": label,
                          "normalized_label_occurrence": occurrences[key],
                          "physical_stop_id": None, "coordinates": None,
                          "estimated_offset_seconds": timing["offset_seconds_from_reference_start"][index]})
        routes.append({"reference_id": rid, "source_reference": route, "stops": stops, **timing,
                       "matched_observation_departures": [{
                           "observation_id": row["observation_id"], "source_route_id": row["route_id"],
                           "direction": row["direction"], "origin": row["origin"],
                           "departure": row["departure"], "calendar_evidence": row["day_rule"],
                           "status": "DEPARTURE_OBSERVATION_NOT_CONFIRMED_TRIP",
                       } for row in matched]})
    # Freeze first-pass evidence coverage before filling gaps. Each complete
    # variant contributes one mean leg duration; prior-filled routes never seed
    # other priors, and no departure alignment is created by this model.
    agency_calibrations = defaultdict(list)
    for route in routes:
        route["evidence_coverage_status"] = route["coverage_status"]
        route["evidence_legs"] = [dict(leg) for leg in route["legs"]]
        route["evidence_offset_seconds_from_reference_start"] = list(route["offset_seconds_from_reference_start"])
        if route["coverage_status"] == "COMPLETE_PROVISIONAL_ESTIMATES" and route["legs"]:
            seconds = sum(leg["seconds"] for leg in route["legs"])
            if seconds > 0:
                agency_calibrations[route["source_reference"]["operator"]].append({
                    "reference_id": route["reference_id"], "total_seconds": seconds,
                    "reference_legs": len(route["legs"]),
                    "seconds_per_reference_leg": seconds / len(route["legs"]),
                    "leg_methods": dict(Counter(leg["method"] for leg in route["legs"])),
                })
    for route in routes:
        donors = agency_calibrations[route["source_reference"]["operator"]]
        prior = None
        if agency_prior and donors:
            prior = {"method": "CROSS_VARIANT_AGENCY_MEDIAN_PER_STOP_PRIOR",
                     "agency": route["source_reference"]["operator"],
                     "seconds_per_reference_leg": median(row["seconds_per_reference_leg"] for row in donors),
                     "calibrating_variants": donors,
                     "source_label": "INTERNAL_MODEL_PRIOR_NOT_MOOVIT_MEASURED_OR_PUBLISHED",
                     "scope": "SAME_AGENCY_CROSS_VARIANT_APPROXIMATION_NO_GEOMETRY_OR_DEPARTURE_JOIN"}
        for index, leg in enumerate(route["legs"]):
            if leg["seconds"] is None and prior is not None:
                rate = prior["seconds_per_reference_leg"]
                leg.update(seconds=round((index + 1) * rate) - round(index * rate),
                           method=prior["method"], confidence="LOW_MODELLED_CROSS_VARIANT_PRIOR", source=prior)
        offsets = [0] if route["stops"] else []
        for leg in route["legs"]:
            offsets.append(None if offsets[-1] is None or leg["seconds"] is None else offsets[-1] + leg["seconds"])
        route["offset_seconds_from_reference_start"] = offsets
        for stop, offset in zip(route["stops"], offsets):
            stop["estimated_offset_seconds"] = offset
        route["coverage_status"] = ("UNRESOLVED" if any(leg["seconds"] is None for leg in route["legs"])
                                    else "COMPLETE_PROVISIONAL_ESTIMATES")
        route["model_coverage_status"] = route["coverage_status"]
    matched_ids = {row["observation_id"] for rows in accepted.values() for row in rows}
    unmatched = []
    for row in observations:
        if row["observation_id"] not in matched_ids:
            reasons = sorted({join["status"] for join in joins
                              if join["observation_id"] == row["observation_id"]})
            unmatched.append({"observation_id": row["observation_id"], "source_route_id": row["route_id"],
                              "direction": row["direction"], "origin": row["origin"],
                              "reasons": reasons or ["NO_SOURCE_ROUTE_REFERENCE_CANDIDATE"]})
    return {
        "schema_version": 1, "status": "INTERNAL_PROVISIONAL_PREVIEW_ONLY",
        "active": False, "runtime_eligible": False, "public_release_allowed": False,
        "activation_blockers": ["UNVERIFIED_GEOMETRY_AND_PHYSICAL_STOPS", "SOURCE_REUSE_RIGHTS",
                                "UNCONFIRMED_SERVICE_VALIDITY_AND_CALENDARS", "NO_AUTHORITATIVE_TRIP_JOINS"],
        "policy": {
            "timing": "Named ordered excerpt clock deltas only; equal per-stop interpolation between anchors. "
                      "Gaps use FULL988 median route/direction total / reference legs, else ordered excerpt span / span legs. "
                      "Unjoined internal coarse totals require a source family candidate and identical listed direction origin; "
                      "this calibrates a model only, not a stop/departure join or a measured variant duration. "
                      "First-pass missing duration stays null in evidence_legs; no reverse, midnight unwrap or loop clock reset inferred.",
            "agency_prior": {"enabled": agency_prior,
                             "method": "CROSS_VARIANT_AGENCY_MEDIAN_PER_STOP_PRIOR",
                             "description": "Fill only null legs using the median of mean seconds per reference leg "
                                            "from first-pass complete variants of the same agency, equally weighted per variant. "
                                            "No same-agency donor means null. Donors may themselves include modelled gaps. "
                                            "Not route-specific evidence, published timing, measured travel or geographic accuracy; "
                                            "anchor conflicts and departure joins remain unchanged."},
            "precision": "Integer seconds are arithmetic estimates, not sub-minute accuracy or geography claims. "
                         "All derived legs are estimated/modelled, never published passage or measured Moovit travel.",
            "occurrence_ids": "LOCAL_REFERENCE_OCCURRENCES_NOT_PHYSICAL_STOP_IDS",
            "joins": "Explicit source candidate families + normalized origin + ordered shared named anchors; "
                     "partial named alignment is provisional, not proof of all served stops or vehicle continuity.",
            "normalization": "Case/Greek diacritics/whitespace only; explicit Syros KTEL locality aliases; "
                             "no fuzzy, address truncation, generic-stop identity or municipal/port equivalence.",
        },
        "source_observations": observations, "source_baseline_timelines": timelines,
        "source_route_inventory": source_routes, "source_clock_excerpts": excerpts,
        "source_reference_metadata": {key: value for key, value in reference.items() if key != "routes"},
        "source_research_metadata": {key: value for key, value in research.items()
                                     if key != "research_only_evidence_excerpts"},
        "routes": routes, "source_route_joins": joins,
        "unmatched_observations": unmatched,
        "calendars": [{"observation_id": row["observation_id"],
                       "source_day_rule": row["day_rule"],
                       "source_operator_day_rule_original": row["operator_day_rule_original"],
                       "source_valid_from_as_printed": row["valid_from_as_printed"],
                       "preview_policy": "ALL_DAYS_INTERNAL_PREVIEW_NOT_EVIDENCE" if row["day_rule"] == "UNSPECIFIED"
                                         else "SOURCE_DAY_RULE_INTERNAL_PREVIEW_VALIDITY_UNCONFIRMED",
                       "verified_service_calendar": False} for row in observations],
        "ornos": {"independent_columns": {direction: [row["observation_id"] for row in observations
                   if row["route_id"] == "MYK_FAB_ORNOS_AGIO" and row["direction"] == direction]
                   for direction in ("FROM_FABRIKA", "FROM_ORNOS", "FROM_AGIO")},
                  "clock_relationships": clock_relationships, "trips_derived": 0,
                  "vehicle_continuity_inferred": False},
        "coverage": {"reference_variants": len(routes), "stop_occurrences": sum(len(row["stops"]) for row in routes),
                     "source_observations": len(observations), "source_baseline_rows": len(timelines),
                     "source_clock_excerpts": len(excerpts), "matched_observations": len(matched_ids),
                     "unmatched_observations": len(unmatched),
                     "evidence_route_timing_status": dict(Counter(row["evidence_coverage_status"] for row in routes)),
                     "evidence_leg_methods": dict(Counter(leg["method"] for row in routes for leg in row["evidence_legs"])),
                     "route_timing_status": dict(Counter(row["coverage_status"] for row in routes)),
                     "by_island": {island: {
                         "reference_variants": sum(row["source_reference"].get("city") == island for row in routes),
                         "stop_occurrences": sum(len(row["stops"]) for row in routes if row["source_reference"].get("city") == island),
                         "legs": sum(len(row["legs"]) for row in routes if row["source_reference"].get("city") == island),
                         "known_legs": sum(leg["seconds"] is not None for row in routes
                                           if row["source_reference"].get("city") == island for leg in row["legs"]),
                         "leg_methods": dict(Counter(leg["method"] for row in routes
                                             if row["source_reference"].get("city") == island for leg in row["legs"])),
                     } for island in sorted({row["source_reference"].get("city", "UNSPECIFIED") for row in routes})},
                     "leg_methods": dict(Counter(leg["method"] for row in routes for leg in row["legs"]))},
    }
