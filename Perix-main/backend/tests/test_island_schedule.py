"""Synthetic compiler tests and opt-in checks of the unchanged external bundle."""
from collections import Counter
import csv
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest

from mobility.island_schedule import align_names, compile_island_schedule, compile_timing, normalize_name
from scripts.validate_island_review import PROVISIONAL_STOP_COLUMNS, validate_output_paths, validate_review


def excerpt(name, clock, ordinal, sample="sample"):
    return {"sample_id": sample, "stop_name": name, "observed_clock": clock,
            "stop_ordinal_in_excerpt": ordinal, "reference_departure_clock": "06:00",
            "offset_minutes_from_departure": 999, "agency_id": "TEST", "route_code": "R"}


def test_named_interpolation_not_excerpt_array_position_or_departure_offsets():
    result = compile_timing(["A", "unnamed", "B", "C", "B", "D"], [
        excerpt("D", "08:10", 4), excerpt("A", "08:00", 1),
        excerpt("B", "08:04", 2), excerpt("B", "08:08", 3),
    ])
    assert [leg["seconds"] for leg in result["legs"]] == [120] * 5
    assert result["offset_seconds_from_reference_start"] == [0, 120, 240, 360, 480, 600]
    assert [match["stop_index"] for match in result["timing_anchor_reviews"][0]["matches"]] == [0, 2, 4, 5]
    assert all(leg["method"] == "ESTIMATED_PIECEWISE_LINEAR_NAMED_ANCHORS" for leg in result["legs"])


def test_normalization_does_not_collapse_addresses_or_different_labels():
    assert normalize_name("  Στάση\t  ΝΈΑ ") == normalize_name("Σταση νεα")
    assert normalize_name("Road 1422") != normalize_name("Road")
    assert align_names(["A", "B", "A"], ["A", "A"])["matches"][-1]["stop_index"] == 2


def test_missing_names_are_not_index_joined_and_reversal_rejected():
    result = compile_timing(["A", "B", "C"], [excerpt("C", "08:00", 1), excerpt("A", "08:10", 2)])
    assert result["coverage_status"] == "UNRESOLVED"
    assert result["timing_anchor_reviews"][0]["status"] == "ORDER_CONFLICT"
    assert all(leg["seconds"] is None for leg in result["legs"])
    missing = compile_timing(["A", "B", "C", "D"], [
        excerpt("A", "08:00", 1), excerpt("NOT B", "08:01", 2), excerpt("C", "08:06", 3)])
    assert missing["timing_anchor_reviews"][0]["missing_name_indices"] == [1]
    assert [leg["seconds"] for leg in missing["legs"]] == [180, 180, 180]
    assert missing["legs"][-1]["method"] == "MODELLED_PER_STOP_FALLBACK"


def test_origin_reset_is_not_arrival_or_overnight_unwrap():
    result = compile_timing(["A", "B", "C", "A"], [
        excerpt("A", "08:00", 1), excerpt("B", "08:10", 2),
        excerpt("C", "08:20", 3), excerpt("A", "08:00", 4)])
    assert result["offset_seconds_from_reference_start"] == [0, 600, 1200, 1800]
    assert result["legs"][-1]["method"] == "MODELLED_PER_STOP_FALLBACK"
    assert len(result["timing_anchor_reviews"][0]["excluded_clocks"]) == 1


def test_no_duration_stays_null_and_total_fallback_is_explicit():
    unresolved = compile_timing(["A", "B", "C"], [excerpt("A", "08:00", 1)])
    assert unresolved["offset_seconds_from_reference_start"] == [0, None, None]
    result = compile_timing(["A", "B", "C", "D"], [], {"total_seconds": 100, "method": "INTERNAL_ASSUMPTION"})
    assert result["offset_seconds_from_reference_start"] == [0, 33, 67, 100]
    assert all(leg["confidence"] == "LOW_MODELLED" for leg in result["legs"])


def test_prefix_and_tail_are_modelled_not_forced_to_excerpt_departure():
    result = compile_timing(["start", "A", "B", "end"], [
        excerpt("A", "08:00", 1), excerpt("B", "08:10", 2)], {"total_seconds": 900})
    assert result["offset_seconds_from_reference_start"] == [0, 300, 900, 1200]
    assert [leg["method"] for leg in result["legs"]] == [
        "MODELLED_PER_STOP_FALLBACK", "ESTIMATED_PIECEWISE_LINEAR_NAMED_ANCHORS",
        "MODELLED_PER_STOP_FALLBACK"]


def fixture_tables():
    reference = {"routes": [{"operator": "TEST", "route_code": "R", "source_page_identifier": "page",
                              "direction_as_listed": "A -> B -> A",
                              "ordered_stops": ["A", "B", "A"], "issues": []}]}
    observation = {"observation_id": "o", "agency_id": "TEST", "route_id": "source",
                   "direction": "loop", "origin": "A", "departure": "12:00", "day_rule": "UNSPECIFIED",
                   "operator_day_rule_original": "UNSPECIFIED", "valid_from_as_printed": "unknown",
                   "moovit_route_family_review_candidates": "R", "not_served_cells": "0"}
    timeline = [{"observation_id": "o", "stop_sequence": str(index + 1), "stop_label": name,
                 "baseline_time_seconds": str(43200 + 300 * index), "basis": "INTERNAL_ASSUMPTION"}
                for index, name in enumerate(["A", "B", "A"])]
    return reference, {"research_only_evidence_excerpts": []}, [observation], timeline, [], []


def test_synthetic_compiler_preserves_evidence_calendar_and_internal_occurrences():
    tables = fixture_tables()
    before = json.dumps(tables, sort_keys=True)
    result = compile_island_schedule(*tables)
    assert before == json.dumps(tables, sort_keys=True)
    assert result["source_observations"] == tables[2]
    assert result["coverage"]["matched_observations"] == 1
    assert result["calendars"][0]["source_day_rule"] == "UNSPECIFIED"
    assert result["calendars"][0]["preview_policy"] == "ALL_DAYS_INTERNAL_PREVIEW_NOT_EVIDENCE"
    stops = result["routes"][0]["stops"]
    assert [stop["normalized_label_occurrence"] for stop in stops] == [1, 1, 2]
    assert len({stop["internal_reference_occurrence_id"] for stop in stops}) == 3
    assert all(stop["physical_stop_id"] is None and stop["coordinates"] is None for stop in stops)
    assert result["active"] is result["runtime_eligible"] is False


def test_no_reverse_or_shortened_observation_projection():
    tables = fixture_tables()
    tables[2][0]["origin"] = "B"
    result = compile_island_schedule(*tables)
    assert result["source_route_joins"][0]["status"] == "ORIGIN_OR_DIRECTION_MISMATCH"
    assert result["coverage"]["matched_observations"] == 0
    tables[2][0].update(origin="A", not_served_cells="5")
    result = compile_island_schedule(*tables)
    assert result["source_route_joins"][0]["status"] == "SHORT_WORKING_NOT_FULL_REFERENCE_VARIANT"


def test_unjoined_direction_total_is_model_only_not_departure_alignment():
    tables = fixture_tables()
    tables[0]["routes"][0].update(ordered_stops=["unverified platform", "B"], direction_as_listed="A")
    for row in tables[3]:
        row["time_kind"] = "PERIX_INTERNAL_COARSE_ESTIMATE"
    result = compile_island_schedule(*tables)
    assert result["coverage"]["matched_observations"] == 0
    route = result["routes"][0]
    assert route["legs"][0]["seconds"] == 600
    assert route["legs"][0]["method"] == "MODELLED_PER_STOP_FALLBACK"
    assert "MODEL_ONLY" in route["fallback_calibration"]["evidence"][0]["scope"]
    tables[3][0]["time_kind"] = "PUBLISHED_PASSAGE"
    result = compile_island_schedule(*tables)
    assert result["routes"][0]["legs"][0]["seconds"] is None


def test_distinctive_anchor_selects_variant_not_similar_family_code():
    tables = fixture_tables()
    tables[0]["routes"].append({**tables[0]["routes"][0], "route_code": "R_VIA",
                                "source_page_identifier": "via", "ordered_stops": ["A", "X", "B", "A"]})
    tables[0]["routes"][0]["ordered_stops"] = ["A", "B", "A"]
    tables[2][0]["moovit_route_family_review_candidates"] = "R;R_VIA"
    tables[3].insert(1, {**tables[3][0], "stop_sequence": "2", "stop_label": "X"})
    for index, row in enumerate(tables[3]):
        row["stop_sequence"] = str(index + 1)
    result = compile_island_schedule(*tables)
    assert result["source_route_joins"][0]["status"] == "DISTINCTIVE_NAMED_ANCHOR_MISSING"
    assert result["source_route_joins"][1]["accepted"] is True


def test_independent_columns_never_become_trips_even_with_exact_names():
    tables = fixture_tables()
    tables[2][0].update(route_id="MYK_FAB_ORNOS_AGIO", direction="FROM_FABRIKA")
    tables[5].append({"observation_ids": ["o", "other", "third"], "active": False,
                     "status": "CLOCK_RELATION_ONLY_NOT_TRIP_OR_VEHICLE_CONTINUITY"})
    result = compile_island_schedule(*tables)
    assert result["coverage"]["matched_observations"] == 0
    assert result["ornos"]["independent_columns"]["FROM_FABRIKA"] == ["o"]
    assert result["ornos"]["clock_relationships"] == tables[5]
    assert result["ornos"]["trips_derived"] == 0


def test_title_conflict_blocks_unjoined_family_duration_transfer():
    tables = fixture_tables()
    tables[0]["routes"][0].update(ordered_stops=["platform", "B"], direction_as_listed="A",
                                 issues=["CRITICAL title and stop sequence conflict"])
    for row in tables[3]:
        row["time_kind"] = "PERIX_INTERNAL_COARSE_ESTIMATE"
    result = compile_island_schedule(*tables)
    assert result["routes"][0]["legs"][0]["seconds"] is None


def test_agency_prior_fills_only_gaps_preserves_conflicts_and_does_not_join():
    tables = fixture_tables()
    tables[0]["routes"] += [
        {**tables[0]["routes"][0], "route_code": "OTHER", "source_page_identifier": "other",
         "ordered_stops": ["C", "D", "C"], "issues": ["CRITICAL conflicting title"]},
        {**tables[0]["routes"][0], "route_code": "OTHER2", "source_page_identifier": "other2",
         "ordered_stops": ["E", "F"]},
        {**tables[0]["routes"][0], "operator": "NO_DONOR", "route_code": "UNRESOLVED"},
    ]
    tables[1]["research_only_evidence_excerpts"] = [
        {**excerpt("D", "08:00", 1), "route_code": "OTHER"},
        {**excerpt("C", "08:05", 2), "route_code": "OTHER"},
        {**excerpt("D", "08:10", 3), "route_code": "OTHER"},
    ]
    before = json.dumps(tables, sort_keys=True)
    schedule = compile_island_schedule(*tables)
    assert json.dumps(tables, sort_keys=True) == before
    donor, filled, second_filled, unresolved = schedule["routes"]
    assert [leg["seconds"] for leg in donor["legs"]] == [300, 300]
    assert [leg["seconds"] for leg in filled["legs"]] == [300, 300]
    assert filled["evidence_coverage_status"] == "UNRESOLVED"
    assert filled["model_coverage_status"] == "COMPLETE_PROVISIONAL_ESTIMATES"
    assert filled["evidence_offset_seconds_from_reference_start"] == [0, None, None]
    assert filled["offset_seconds_from_reference_start"] == [0, 300, 600]
    assert filled["timing_anchor_reviews"][0]["status"] == "ORDER_CONFLICT"
    assert all(leg["seconds"] is None for leg in filled["evidence_legs"])
    assert schedule["coverage"]["matched_observations"] == 1
    assert filled["matched_observation_departures"] == []
    assert unresolved["legs"][0]["seconds"] is None
    for route in (filled, second_filled):
        for leg in route["legs"]:
            assert leg["method"] == "CROSS_VARIANT_AGENCY_MEDIAN_PER_STOP_PRIOR"
            assert leg["confidence"] == "LOW_MODELLED_CROSS_VARIANT_PRIOR"
            assert leg["source"]["source_label"] == "INTERNAL_MODEL_PRIOR_NOT_MOOVIT_MEASURED_OR_PUBLISHED"
            assert len(leg["source"]["calibrating_variants"]) == 1
    disabled = compile_island_schedule(*tables, agency_prior=False)
    assert disabled["routes"][1]["legs"][0]["seconds"] is None
    assert disabled["source_route_joins"] == schedule["source_route_joins"]


def test_agency_prior_is_median_of_variant_means_not_pooled_legs():
    tables = fixture_tables()
    tables[0]["routes"] += [
        {**tables[0]["routes"][0], "route_code": "LONG", "source_page_identifier": "long",
         "ordered_stops": ["C", "D", "E", "F"]},
        {**tables[0]["routes"][0], "route_code": "TARGET", "source_page_identifier": "target",
         "ordered_stops": ["X", "Y"]},
    ]
    tables[1]["research_only_evidence_excerpts"] = [
        {**excerpt("C", "08:00", 1), "route_code": "LONG"},
        {**excerpt("F", "08:03", 2), "route_code": "LONG"},
    ]
    schedule = compile_island_schedule(*tables)
    assert schedule["routes"][-1]["legs"][0]["seconds"] == 180  # median(300, 60)


def test_output_protection_checks_all_destinations_first(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    evidence = tmp_path / "delta.csv"
    evidence.write_text("unchanged", encoding="utf-8")
    for output in (source / "new.json", evidence):
        with pytest.raises(ValueError, match="must not overwrite an input"):
            validate_output_paths(source, None, evidence, [tmp_path / "valid.json", output])
    with pytest.raises(ValueError, match="distinct paths"):
        validate_output_paths(source, None, evidence, [tmp_path / "same", tmp_path / "same"])
    assert not (tmp_path / "valid.json").exists()
    assert evidence.read_text(encoding="utf-8") == "unchanged"


@pytest.fixture
def external_source():
    value = os.getenv("PERIX_ISLAND_REVIEW_SOURCE")
    if not value:
        pytest.skip("Set PERIX_ISLAND_REVIEW_SOURCE for external bundle integration")
    return Path(value)


def test_external_counts_evidence_joins_and_independent_columns(external_source):
    schedule = validate_review(external_source, provisional_schedule=True)["provisional_schedule"]
    coverage = schedule["coverage"]
    assert (coverage["reference_variants"], coverage["stop_occurrences"], coverage["source_observations"],
            coverage["source_baseline_rows"], coverage["source_clock_excerpts"]) == (27, 311, 342, 988, 34)
    for filename, key in (("FULL_342_DEPARTURES.csv", "source_observations"),
                          ("FULL_988_BASELINE_TIMELINES.csv", "source_baseline_timelines")):
        with (external_source / filename).open(encoding="utf-8-sig", newline="") as stream:
            assert schedule[key] == list(csv.DictReader(stream))
    assert coverage["matched_observations"] + coverage["unmatched_observations"] == 342
    assert (coverage["matched_observations"], coverage["unmatched_observations"]) == (23, 319)
    assert coverage["evidence_route_timing_status"] == {"COMPLETE_PROVISIONAL_ESTIMATES": 17, "UNRESOLVED": 10}
    assert coverage["evidence_leg_methods"] == {"ESTIMATED_PIECEWISE_LINEAR_NAMED_ANCHORS": 72,
                                                "MODELLED_PER_STOP_FALLBACK": 124, "UNRESOLVED": 88}
    assert coverage["route_timing_status"] == {"COMPLETE_PROVISIONAL_ESTIMATES": 27}
    assert coverage["leg_methods"] == {"ESTIMATED_PIECEWISE_LINEAR_NAMED_ANCHORS": 72,
                                       "MODELLED_PER_STOP_FALLBACK": 124,
                                       "CROSS_VARIANT_AGENCY_MEDIAN_PER_STOP_PRIOR": 88}
    assert sum(row["known_legs"] for row in coverage["by_island"].values()) == 284
    assert all(not join["accepted"] for join in schedule["source_route_joins"]
               if join["source_route_id"].startswith("SYR_KTEL_L3") and ":KTEL_2:" in join["reference_id"])
    assert all(not join["accepted"] for join in schedule["source_route_joins"]
               if join["source_route_id"] == "MYK_FAB_ORNOS_AGIO")
    assert {key: len(value) for key, value in schedule["ornos"]["independent_columns"].items()} == {
        "FROM_FABRIKA": 14, "FROM_ORNOS": 14, "FROM_AGIO": 14}
    assert len(schedule["ornos"]["clock_relationships"]) == 14
    assert schedule["ornos"]["trips_derived"] == 0
    assert Counter(row["source_day_rule"] for row in schedule["calendars"])["UNSPECIFIED"] == 237
    for route in schedule["routes"]:
        offsets = route["offset_seconds_from_reference_start"]
        known = [offset for offset in offsets if offset is not None]
        assert known == sorted(known)
        assert len(route["legs"]) == len(route["stops"]) - 1
        assert all(leg["seconds"] is None or leg["seconds"] >= 0 for leg in route["legs"])


def test_external_cli_no_source_mutations_and_no_colliding_outputs(external_source, tmp_path):
    inputs = [path for path in external_source.iterdir() if path.is_file()]
    before = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in inputs}
    output = tmp_path / "preview.json"
    command = [sys.executable, str(Path(__file__).resolve().parents[1] / "scripts/validate_island_review.py"),
               str(external_source), "--provisional-schedule", str(output)]
    result = subprocess.run(command, capture_output=True, text=True, check=True)
    assert json.loads(result.stdout)["provisional_schedule_coverage"]["reference_variants"] == 27
    assert json.loads(output.read_text(encoding="utf-8"))["active"] is False
    rejected = subprocess.run(command + ["--exceptions-csv", str(output)], capture_output=True, text=True)
    assert rejected.returncode != 0 and "distinct paths" in rejected.stderr
    command[-1] = str(external_source / "PERIX_SYROS_MYKONOS_ROUTE_STOP_REFERENCE_2026-10-22.json")
    rejected = subprocess.run(command, capture_output=True, text=True)
    assert rejected.returncode != 0 and "must not overwrite an input" in rejected.stderr
    assert before == {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in inputs}


def test_external_cli_all_occurrences_csv_and_safe_destinations(external_source, tmp_path):
    script = str(Path(__file__).resolve().parents[1] / "scripts/validate_island_review.py")
    output = tmp_path / "stop_times.csv"
    json_output = tmp_path / "preview.json"
    command = [sys.executable, script, str(external_source), "--provisional-stop-times", str(output)]
    subprocess.run(command, capture_output=True, text=True, check=True)
    # CSV-only mode must compile, not require a JSON output destination.
    assert not json_output.exists()
    result = subprocess.run(command + ["--provisional-schedule", str(json_output)],
                            capture_output=True, text=True, check=True)
    schedule = json.loads(json_output.read_text(encoding="utf-8"))
    assert json.loads(result.stdout)["provisional_schedule_coverage"] == schedule["coverage"]
    with output.open(encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream)
        assert tuple(reader.fieldnames) == PROVISIONAL_STOP_COLUMNS
        rows = list(reader)
    assert len(rows) == 311
    assert len({row["route_reference"] for row in rows}) == 27
    expected = [(route, stop) for route in schedule["routes"] for stop in route["stops"]]
    for row, (route, stop) in zip(rows, expected):
        assert row["label"] == stop["label"]
        assert row["sequence"] == str(stop["sequence"])
        assert row["offset_seconds"] == str(stop["estimated_offset_seconds"])
        assert row["physical_stop_id"] == row["coordinates"] == ""
        assert row["departure_observation_count"] == str(len(route["matched_observation_departures"]))
        assert row["from_previous_seconds"] != ""
        if row["method"] == "CROSS_VARIANT_AGENCY_MEDIAN_PER_STOP_PRIOR":
            assert json.loads(row["source"])["source_label"] == "INTERNAL_MODEL_PRIOR_NOT_MOOVIT_MEASURED_OR_PUBLISHED"
    assert any(any(ord(char) > 127 for char in row["label"]) for row in rows)
    before = output.read_bytes()
    rejected = subprocess.run(command + ["--provisional-schedule", str(output)], capture_output=True, text=True)
    assert rejected.returncode != 0 and "distinct paths" in rejected.stderr
    assert output.read_bytes() == before
    protected = external_source / "FULL_988_BASELINE_TIMELINES.csv"
    before = protected.read_bytes()
    command[-1] = str(protected)
    rejected = subprocess.run(command, capture_output=True, text=True)
    assert rejected.returncode != 0 and "must not overwrite an input" in rejected.stderr
    assert protected.read_bytes() == before
