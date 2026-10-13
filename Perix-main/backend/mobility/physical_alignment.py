"""Physical alignment evidence for canonical transit geometry.

Evidence layers:
1. canonical OSM generation (rendering + motion authority),
2. operator/reference geometry (currently trip-specific GTFS shape),
3. raw physical GPS observations from mobility_position_observations.

Raw GPS is never replaced by its snapped coordinate for validation. The
snapped edge is used only to identify which canonical edge the raw fix was
measured against.
"""
from __future__ import annotations

import math
from collections import Counter
from typing import Optional

ALIGNMENT_SCHEMA_VERSION = 1

MIN_GPS_SAMPLES = 12
MIN_INDEPENDENT_TRIPS = 3
HIGH_CONFIDENCE_P95_M = 10.0
LIKELY_ALIGNED_P95_M = 20.0
SYSTEMATIC_OFFSET_MEDIAN_M = 10.0
REFERENCE_GOOD_P95_M = 15.0


def _f(value, default=0.0) -> float:
    try:
        return float(value)
    except Exception:
        return float(default)


def _percentile(values: list[float], q: float) -> Optional[float]:
    clean = sorted(float(v) for v in values if v is not None)
    if not clean:
        return None
    if len(clean) == 1:
        return clean[0]
    pos = max(0.0, min(1.0, float(q))) * (len(clean) - 1)
    lo = int(math.floor(pos))
    hi = int(math.ceil(pos))
    if lo == hi:
        return clean[lo]
    weight = pos - lo
    return clean[lo] * (1.0 - weight) + clean[hi] * weight


def _heading_diff(a, b) -> Optional[float]:
    if a is None or b is None:
        return None
    try:
        return abs(((float(a) - float(b) + 180.0) % 360.0) - 180.0)
    except Exception:
        return None


def _nearest_distance_to_polyline(lat: float, lng: float, points: list[list]) -> Optional[float]:
    if not points or len(points) < 2:
        return None
    from mobility.map_match import nearest_segment

    projected = nearest_segment(float(lat), float(lng), points)
    return float(projected[2]) if projected else None


def edge_id_for_segment_index(bundle: dict, segment_idx: Optional[int]) -> Optional[str]:
    if segment_idx is None:
        return None
    target = int(segment_idx)
    cursor = 0
    ordered = sorted(
        bundle.get("segments") or [],
        key=lambda item: (
            int(item.get("a_idx") or 0),
            int(item.get("b_idx") or 0),
        ),
    )
    for segment in ordered:
        edge_ids = [str(x) for x in (segment.get("edge_ids") or [])]
        if cursor <= target < cursor + len(edge_ids):
            return edge_ids[target - cursor]
        cursor += len(edge_ids)
    return None


def operator_reference_summary(
    canonical_points: list[list],
    operator_points: list[list],
) -> dict:
    if not operator_points or len(operator_points) < 2:
        return {
            "available": False,
            "operator_to_osm_sample_count": 0,
            "osm_to_operator_sample_count": 0,
            "p50_m": None,
            "p95_m": None,
            "max_m": None,
            "classification": "NO_OPERATOR_REFERENCE",
        }

    operator_to_osm = []
    for point in operator_points:
        distance = _nearest_distance_to_polyline(
            float(point[0]),
            float(point[1]),
            canonical_points,
        )
        if distance is not None:
            operator_to_osm.append(distance)

    osm_to_operator = []
    for point in canonical_points:
        distance = _nearest_distance_to_polyline(
            float(point[0]),
            float(point[1]),
            operator_points,
        )
        if distance is not None:
            osm_to_operator.append(distance)

    combined = operator_to_osm + osm_to_operator
    p50 = _percentile(combined, 0.50)
    p95 = _percentile(combined, 0.95)
    maximum = max(combined) if combined else None
    if p95 is None:
        classification = "NO_OPERATOR_REFERENCE"
    elif p95 <= REFERENCE_GOOD_P95_M:
        classification = "REFERENCE_ALIGNED"
    else:
        classification = "OPERATOR_REFERENCE_CONFLICT"

    return {
        "available": bool(combined),
        "operator_to_osm_sample_count": len(operator_to_osm),
        "osm_to_operator_sample_count": len(osm_to_operator),
        "p50_m": round(p50, 2) if p50 is not None else None,
        "p95_m": round(p95, 2) if p95 is not None else None,
        "max_m": round(maximum, 2) if maximum is not None else None,
        "classification": classification,
    }


def summarize_gps_alignment(observations: list[dict]) -> dict:
    accepted = []
    heading_diffs = []
    trip_ids = set()
    vehicles = set()
    dates = set()
    by_edge: dict[str, list[dict]] = {}

    for obs in observations or []:
        distance = obs.get("snapped_distance_m")
        if distance is None:
            continue
        try:
            distance = float(distance)
        except Exception:
            continue

        accepted.append(distance)
        if obs.get("trip_id"):
            trip_ids.add(str(obs.get("trip_id")))
        if obs.get("vehicle_id"):
            vehicles.add(str(obs.get("vehicle_id")))
        observed_at = str(obs.get("observed_at") or "")
        if len(observed_at) >= 10:
            dates.add(observed_at[:10])

        diff = _heading_diff(
            obs.get("heading"),
            obs.get("matched_bearing"),
        )
        if diff is not None:
            heading_diffs.append(diff)

        edge_id = str(obs.get("matched_edge_id") or "")
        if edge_id:
            by_edge.setdefault(edge_id, []).append(
                {
                    "distance_m": distance,
                    "heading_diff": diff,
                    "trip_id": str(obs.get("trip_id") or ""),
                    "vehicle_id": str(obs.get("vehicle_id") or ""),
                }
            )

    count = len(accepted)
    p50 = _percentile(accepted, 0.50)
    p90 = _percentile(accepted, 0.90)
    p95 = _percentile(accepted, 0.95)
    maximum = max(accepted) if accepted else None
    heading_match = (
        sum(1 for value in heading_diffs if value <= 45.0) / len(heading_diffs)
        if heading_diffs
        else None
    )

    if count < MIN_GPS_SAMPLES or len(trip_ids) < MIN_INDEPENDENT_TRIPS:
        classification = "INSUFFICIENT_SAMPLES"
    elif p95 is not None and p95 <= HIGH_CONFIDENCE_P95_M:
        classification = "VERIFIED_ALIGNMENT"
    elif p95 is not None and p95 <= LIKELY_ALIGNED_P95_M:
        classification = "LIKELY_ALIGNED"
    elif p50 is not None and p50 >= SYSTEMATIC_OFFSET_MEDIAN_M:
        classification = "SYSTEMATIC_LATERAL_OFFSET"
    else:
        classification = "GPS_UNCERTAIN"

    edge_alignment = []
    for edge_id, samples in by_edge.items():
        distances = [row["distance_m"] for row in samples]
        diffs = [
            row["heading_diff"]
            for row in samples
            if row["heading_diff"] is not None
        ]
        edge_trips = {row["trip_id"] for row in samples if row["trip_id"]}
        edge_p50 = _percentile(distances, 0.50)
        edge_p95 = _percentile(distances, 0.95)
        if len(samples) < 5 or len(edge_trips) < 2:
            edge_class = "INSUFFICIENT_SAMPLES"
        elif edge_p95 is not None and edge_p95 <= HIGH_CONFIDENCE_P95_M:
            edge_class = "VERIFIED_ALIGNMENT"
        elif edge_p95 is not None and edge_p95 <= LIKELY_ALIGNED_P95_M:
            edge_class = "LIKELY_ALIGNED"
        elif edge_p50 is not None and edge_p50 >= SYSTEMATIC_OFFSET_MEDIAN_M:
            edge_class = "SYSTEMATIC_LATERAL_OFFSET"
        else:
            edge_class = "GPS_UNCERTAIN"
        edge_alignment.append(
            {
                "edge_id": edge_id,
                "sample_count": len(samples),
                "independent_trip_count": len(edge_trips),
                "p50_lateral_error_m": (
                    round(edge_p50, 2) if edge_p50 is not None else None
                ),
                "p95_lateral_error_m": (
                    round(edge_p95, 2) if edge_p95 is not None else None
                ),
                "heading_within_45deg_ratio": (
                    round(
                        sum(1 for value in diffs if value <= 45.0)
                        / len(diffs),
                        4,
                    )
                    if diffs
                    else None
                ),
                "classification": edge_class,
            }
        )
    edge_alignment.sort(
        key=lambda row: (
            row["classification"]
            in {"VERIFIED_ALIGNMENT", "LIKELY_ALIGNED"},
            -(row["p95_lateral_error_m"] or 0.0),
        )
    )

    return {
        "sample_count": count,
        "independent_trip_count": len(trip_ids),
        "vehicle_count": len(vehicles),
        "day_count": len(dates),
        "p50_lateral_error_m": round(p50, 2) if p50 is not None else None,
        "p90_lateral_error_m": round(p90, 2) if p90 is not None else None,
        "p95_lateral_error_m": round(p95, 2) if p95 is not None else None,
        "max_lateral_error_m": round(maximum, 2) if maximum is not None else None,
        "heading_sample_count": len(heading_diffs),
        "heading_within_45deg_ratio": (
            round(heading_match, 4) if heading_match is not None else None
        ),
        "matched_edge_count": len(by_edge),
        "edge_alignment": edge_alignment,
        "classification": classification,
    }


def physical_alignment_report(
    *,
    pattern_id: str,
    generation_id: str,
    canonical_points: list[list],
    operator_points: list[list],
    observations: list[dict],
) -> dict:
    gps = summarize_gps_alignment(observations)
    operator = operator_reference_summary(
        canonical_points,
        operator_points,
    )

    if gps["classification"] in {"VERIFIED_ALIGNMENT", "LIKELY_ALIGNED"}:
        if operator["classification"] == "REFERENCE_ALIGNED":
            triple = "TRIPLE_SOURCE_ALIGNED"
        elif operator["available"]:
            triple = "GPS_OSM_ALIGNED_OPERATOR_CONFLICT"
        else:
            triple = "GPS_OSM_ALIGNED_NO_OPERATOR_REFERENCE"
    elif gps["classification"] == "INSUFFICIENT_SAMPLES":
        triple = "INSUFFICIENT_PHYSICAL_EVIDENCE"
    else:
        triple = "PHYSICAL_REVIEW_REQUIRED"

    return {
        "schema_v": ALIGNMENT_SCHEMA_VERSION,
        "pattern_id": str(pattern_id),
        "generation_id": str(generation_id),
        "canonical_source": "ATOMIC_OSM_GENERATION",
        "operator_reference_source": "GTFS_TRIP_SHAPE",
        "gps_source": "mobility_position_observations.raw_latitude_longitude",
        "gps": gps,
        "operator_reference": operator,
        "overall_classification": triple,
        "claim_boundary": (
            "GPS evidence validates observed vehicle alignment to the canonical "
            "OSM route; it does not prove centimeter-accurate surveying."
        ),
    }
