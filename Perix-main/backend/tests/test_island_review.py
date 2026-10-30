"""Opt-in integration checks against the supplied, unmodified research bundle."""
from collections import Counter
import csv
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest

from scripts.validate_island_review import EXCEPTION_COLUMNS, validate_review


@pytest.fixture
def source():
    path = os.getenv("PERIX_ISLAND_REVIEW_SOURCE")
    if not path:
        pytest.skip("Set PERIX_ISLAND_REVIEW_SOURCE to the focused restart research bundle")
    return Path(path)


@pytest.fixture
def manifests():
    path = os.getenv("PERIX_ISLAND_REVIEW_MANIFESTS")
    if not path:
        pytest.skip("Set PERIX_ISLAND_REVIEW_MANIFESTS to the external reviewed draft manifests")
    return Path(path)


@pytest.fixture
def date_evidence():
    return Path(__file__).resolve().parents[1] / "data/review/PERIX_SYROS_10_DATE_EVIDENCE_DELTA_2026-10-22.csv"


def test_research_counts_and_inactive_candidates(source):
    report = validate_review(source)
    assert report["observations_preserved"] == 342
    assert len(report["observation_ids"]) == len(set(report["observation_ids"])) == 342
    assert report["published_anchors_preserved"] == 160
    assert (report["selected_syros_departures"], report["selected_syros_anchors"]) == (11, 105)
    assert report["mykonos_calendar"] == "UNSPECIFIED"
    groups = report["mykonos_candidate_groups"]
    assert len(groups) == 14
    assert len({oid for group in groups for oid in group["observation_ids"]}) == 42
    assert all(group["offset_minutes"] == [0, 10, 15] and group["active"] is False for group in groups)
    assert report["active"] is False and len(report["inactive_empty_groups"]) == 4


def test_reject_changed_source(source, tmp_path):
    # Failure must happen before any potentially changed data is interpreted.
    (tmp_path / "FULL_342_DEPARTURES.csv").write_text("changed", encoding="utf-8")
    for name in (
        "FULL_988_BASELINE_TIMELINES.csv", "FULL_31_ROUTE_REVIEW.csv",
        "PERIX_ISLAND_SCHEDULE_OBSERVATIONS_2026-10-22.json",
        "PERIX_ISLAND_OBSERVATION_GTFS_CROSSWALK_2026-10-22.json",
        "03_SELECTED_FILES_SHA256_MANIFEST.json",
    ):
        (tmp_path / name).write_bytes((source / name).read_bytes())
    with pytest.raises(ValueError, match="Source checksum mismatch: FULL_342"):
        validate_review(tmp_path)


def test_selected_syros_pending_anchors_and_date_blocker(source):
    report = validate_review(source)
    anchors = report["selected_syros_pending_anchors"]
    assert len(anchors) == 105
    assert Counter(row["route_id"] for row in anchors) == {
        "SYR_KTEL_L3_WD": 35, "SYR_KTEL_L1_WE": 40, "SYR_KTEL_L3_WE": 30,
    }
    with (source / "FULL_988_BASELINE_TIMELINES.csv").open(encoding="utf-8-sig", newline="") as stream:
        expected = [
            {
                "observation_id": row["observation_id"], "route_id": row["route_id"],
                "stop_sequence": int(row["stop_sequence"]), "stop_label": row["stop_label"],
                "published_time": row["baseline_time"], "verified_stop_id": None,
                "verified_pattern_id": None, "approval_status": "PENDING_STOP_GEOMETRY_JOIN",
            }
            for row in csv.DictReader(stream)
            if row["route_id"] in report["selected_syros_routes"] and row["time_kind"] == "PUBLISHED_PASSAGE"
        ]
    assert anchors == expected
    assert report["selected_syros_date_blockers"] == [{
        "route_id": "SYR_KTEL_L3_WD", "status": "BLOCKED_UNRESOLVED_DATE_CONFLICT",
        "valid_from_as_printed": ["CONFLICT:2025-10-07_vs_2026-10-07"],
        "resolved_valid_from": None, "public_activation_allowed": False,
    }]


@pytest.mark.parametrize("flag", ["reviewed_and_approved", "rights_confirmed", "coordinates_verified"])
def test_reject_approved_manifest(source, tmp_path, flag):
    (tmp_path / "syros_ktel_review_draft.json").write_text(json.dumps({
        "reviewed_and_approved": False, "rights_confirmed": False,
        "coordinates_verified": False, "trips": [], flag: True,
    }), encoding="utf-8")
    with pytest.raises(ValueError, match="Draft approval/trips changed"):
        validate_review(source, tmp_path)


def test_missing_bundle_reports_exact_file(tmp_path):
    with pytest.raises(FileNotFoundError, match="FULL_342_DEPARTURES.csv"):
        validate_review(tmp_path)


def test_actual_manifest_joins_and_exception_safety(source, manifests, date_evidence):
    report = validate_review(source, manifests, date_evidence)
    assert report["candidate_route_alias_counts"] == {"SYR_KTEL": 17, "SYR_MINI": 68, "MYK_KTEL": 121}
    assert report["candidate_route_alias_observations"] == 206
    assert report["unmatched_route_alias_observations"] == 136
    assert report["confirmed_exact_mykonos_trips"] == report["confirmed_exact_ornos_trips"] == 0
    assert report["authoritative_trips"] == report["canonical_patterns"] == report["virtual_trips_created"] == 0
    rows = report["exceptions"]
    assert len(rows) == len({row["observation_id"] for row in rows}) == 342
    assert all(tuple(row) == EXCEPTION_COLUMNS for row in rows)
    assert all(not row[key] for row in rows for key in (
        "candidate_trip_id", "stop_id", "platform_id", "pattern_id", "geometry_verified", "day_rule_verified",
    ))
    with (source / "FULL_342_DEPARTURES.csv").open(encoding="utf-8-sig", newline="") as stream:
        originals = {row["observation_id"]: row for row in csv.DictReader(stream)}
    for row in rows:
        evidence = json.loads(row["evidence"])
        original = originals[row["observation_id"]]
        assert all(evidence[key] == original[key] for key in (
            "route_id", "route_name", "direction", "origin", "departure", "valid_from_as_printed",
        ))
        assert "EXCLUDED" in evidence["synthetic_web_observer_gtfs"]
        assert row["stop_label"] == original["origin"]
    text = json.dumps(rows)
    for ref in ("node/13597767508", "relation/4594447", "way/736284303", "node/3578181775"):
        assert ref in text
    assert "node/1846917015" not in text
    assert "UNVERIFIED" in text
    short = json.loads(next(row["evidence"] for row in rows
                           if row["observation_id"] == "SYR_KTEL_L1_WD-loop-1200-01"))
    assert len(short["draft_stop_candidates"]) == 5
    assert short["draft_stop_candidates"][-1]["draft_stop_id"] == "SYR_FINIKAS"
    ornos = [row for row in rows if originals[row["observation_id"]]["route_id"] == "MYK_FAB_ORNOS_AGIO"]
    assert len(ornos) == 42
    assert len(report["mykonos_candidate_groups"]) == 14
    assert all(group["active"] is False for group in report["mykonos_candidate_groups"])
    artifact = date_evidence.with_name("PERIX_ISLAND_REVIEW_EXCEPTIONS_2026-10-22.csv")
    with artifact.open(encoding="utf-8", newline="") as stream:
        saved = list(csv.DictReader(stream))
    assert saved == [{key: str(value) for key, value in row.items()} for row in rows]


def test_additive_date_delta_includes_l1_and_never_activates(source, date_evidence):
    report = validate_review(source, date_evidence=date_evidence)
    assert report["date_evidence_observations"] == 10
    blockers = report["selected_syros_date_blockers"]
    assert Counter(row["route_id"] for row in blockers) == {"SYR_KTEL_L1_WD": 6, "SYR_KTEL_L3_WD": 4}
    assert all(row["source_date_as_printed"] == "2025-10-07"
               and row["original_date_field"] == "CONFLICT:2025-10-07_vs_2026-10-07"
               and row["service_validity_oct_2026"] == "UNCONFIRMED"
               and row["resolved_valid_from"] is None and row["public_activation_allowed"] is False
               and row["status"] == "BLOCKED_OCT_2026_OPERATION_UNCONFIRMED" for row in blockers)
    assert len([row for row in report["exceptions"] if "additive_date_evidence" in json.loads(row["evidence"])]) == 10


@pytest.mark.parametrize("change", ["missing", "duplicate", "extra", "columns", "route_id", "departure",
                                   "source_date_as_printed", "service_validity_oct_2026", "activation_allowed",
                                   "original_date_field", "confirmed_gtfs_trip"])
def test_reject_malformed_or_promoted_date_delta(source, date_evidence, tmp_path, change):
    with date_evidence.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        fields = reader.fieldnames
        rows = list(reader)
    if change == "missing":
        rows.pop()
    elif change == "duplicate":
        rows[-1] = rows[0].copy()
    elif change == "extra":
        rows.append(rows[0].copy())
    elif change == "columns":
        fields = fields[:-1]
        rows = [{key: row[key] for key in fields} for row in rows]
    elif change == "confirmed_gtfs_trip":
        fields = fields + [change]
        for row in rows:
            row[change] = "True"
    else:
        rows[0][change] = "FORGED"
    path = tmp_path / "delta.csv"
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    with pytest.raises(ValueError, match="[Dd]ate evidence"):
        validate_review(source, date_evidence=path)


@pytest.mark.parametrize("change", ["trip", "coordinates", "platform", "osm_confirmation", "pattern"])
def test_reject_forged_manifest_confirmation(source, manifests, tmp_path, change):
    for path in manifests.glob("*_review_draft.json"):
        (tmp_path / path.name).write_bytes(path.read_bytes())
    path = tmp_path / "syros_ktel_review_draft.json"
    draft = json.loads(path.read_text(encoding="utf-8"))
    if change == "trip":
        draft["trips"] = [{"trip_id": "FORGED"}]
    elif change == "coordinates":
        draft["stops"][0]["stop_lat"] = 37.4
    elif change == "platform":
        draft["stops"][0]["platform_verified"] = True
    elif change == "pattern":
        draft["canonical_patterns"] = [{"pattern_id": "FORGED"}]
    else:
        draft["review_metadata"]["stop_candidates"]["SYR_KINI"][0]["operator_platform_verified"] = True
    path.write_text(json.dumps(draft), encoding="utf-8")
    with pytest.raises(ValueError, match="Draft|draft|OSM"):
        validate_review(source, tmp_path)


def test_cli_exception_csv_and_no_source_mutations(source, manifests, date_evidence, tmp_path):
    inputs = [path for directory in (source, manifests) for path in directory.iterdir() if path.is_file()]
    inputs.append(date_evidence)
    before = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in inputs}
    output = tmp_path / "exceptions.csv"
    script = Path(__file__).resolve().parents[1] / "scripts/validate_island_review.py"
    command = [sys.executable, str(script), str(source), "--manifests", str(manifests),
               "--date-evidence", str(date_evidence), "--exceptions-csv", str(output)]
    result = subprocess.run(command, capture_output=True, text=True, check=True)
    report = json.loads(result.stdout)
    with output.open(encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream)
        assert tuple(reader.fieldnames) == EXCEPTION_COLUMNS
        rows = list(reader)
    assert len(rows) == len(report["exceptions"]) == 342
    assert all(row["geometry_verified"] == row["day_rule_verified"] == "False" for row in rows)
    command[-1] = str(date_evidence)
    rejected = subprocess.run(command, capture_output=True, text=True)
    assert rejected.returncode != 0 and "must not overwrite an input" in rejected.stderr
    assert before == {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in inputs}


def test_delta_semantic_copy_matches_external_when_supplied(date_evidence):
    directory = os.getenv("PERIX_ISLAND_DATE_DELTA_SOURCE")
    if not directory:
        pytest.skip("Set PERIX_ISLAND_DATE_DELTA_SOURCE to the verified delta directory")
    original = Path(directory) / date_evidence.name
    assert original.read_text(encoding="utf-8-sig") == date_evidence.read_text(encoding="utf-8-sig")
