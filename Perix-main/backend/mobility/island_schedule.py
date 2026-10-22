"""Pure, offline compilation of review records, never an importer or runtime feed.

All IDs below identify local reference occurrences, not physical stops. Timing
estimates have no geometry, traffic, vehicle-continuity or accuracy guarantees.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from statistics import median
import unicodedata


def normalize_name(value: str) -> str:
    """Only case, Greek diacritics and whitespace; no fuzzy/address matching."""
    return " ".join("".join(
        char for char in unicodedata.normalize("NFD", value.casefold())
        if not unicodedata.combining(char)
    ).split())


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
