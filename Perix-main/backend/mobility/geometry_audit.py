"""Canonical geometry conformance audit.

This proves internal Perix geometry authority:
rendered OSM polyline == atomic generation geometry == assembled stop-pair
segments == directed infrastructure edge chain.

It does NOT claim that OpenStreetMap itself is a perfect survey of reality.
Verified manual overlays are reported separately and never mislabeled as
canonical OSM conformance.
"""
from __future__ import annotations

import math
from typing import Optional

from mobility.graph import validate_geometry

GEOMETRY_AUDIT_SCHEMA_VERSION = 1
POINT_TOLERANCE_M = 0.25


def _haversine_m(a: list, b: list) -> float:
    radius = 6371000.0
    lat1, lon1 = math.radians(float(a[0])), math.radians(float(a[1]))
    lat2, lon2 = math.radians(float(b[0])), math.radians(float(b[1]))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    value = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2.0) ** 2
    )
    return radius * 2.0 * math.atan2(math.sqrt(value), math.sqrt(1.0 - value))


def _parse_edge_id(value: str):
    try:
        way_id, from_node, to_node = str(value).split(":", 2)
        return int(way_id), int(from_node), int(to_node)
    except Exception:
        return None


def assemble_segment_points(segments: list[dict]) -> Optional[list[list]]:
    ordered = sorted(
        segments or [],
        key=lambda item: (int(item.get("a_idx") or 0), int(item.get("b_idx") or 0)),
    )
    if not ordered:
        return None
    out = []
    previous_end = None
    for segment in ordered:
        points = segment.get("points") or []
        if len(points) < 2:
            return None
        start_node = segment.get("start_node_id")
        end_node = segment.get("end_node_id")
        if start_node is None or end_node is None:
            return None
        if previous_end is not None and int(start_node) != int(previous_end):
            return None
        if not out:
            out.extend([[float(p[0]), float(p[1])] for p in points])
        else:
            out.extend([[float(p[0]), float(p[1])] for p in points[1:]])
        previous_end = end_node
    return out if len(out) >= 2 else None


def _max_point_deviation_m(a: list, b: list) -> Optional[float]:
    if len(a or []) != len(b or []) or not a:
        return None
    return max(
        _haversine_m([float(x[0]), float(x[1])], [float(y[0]), float(y[1])])
        for x, y in zip(a, b)
    )


def _segment_edge_integrity(segments: list[dict]) -> dict:
    ordered = sorted(
        segments or [],
        key=lambda item: (int(item.get("a_idx") or 0), int(item.get("b_idx") or 0)),
    )
    flat_edge_ids = []
    previous_edge_to = None
    failures = []

    for segment in ordered:
        points = segment.get("points") or []
        edge_ids = [str(x) for x in (segment.get("edge_ids") or [])]
        if len(edge_ids) != max(0, len(points) - 1):
            failures.append({
                "segment_id": segment.get("segment_id"),
                "reason": "EDGE_POINT_COUNT_MISMATCH",
            })
            continue

        parsed = [_parse_edge_id(edge_id) for edge_id in edge_ids]
        if any(value is None for value in parsed):
            failures.append({
                "segment_id": segment.get("segment_id"),
                "reason": "INVALID_EDGE_ID",
            })
            continue

        if parsed:
            if int(segment.get("start_node_id")) != parsed[0][1]:
                failures.append({
                    "segment_id": segment.get("segment_id"),
                    "reason": "SEGMENT_START_NODE_MISMATCH",
                })
            if int(segment.get("end_node_id")) != parsed[-1][2]:
                failures.append({
                    "segment_id": segment.get("segment_id"),
                    "reason": "SEGMENT_END_NODE_MISMATCH",
                })

        for parsed_edge in parsed:
            _, from_node, to_node = parsed_edge
            if previous_edge_to is not None and int(from_node) != int(previous_edge_to):
                failures.append({
                    "segment_id": segment.get("segment_id"),
                    "reason": "EDGE_CHAIN_DISCONNECTED",
                    "expected_from_node": previous_edge_to,
                    "actual_from_node": from_node,
                })
            previous_edge_to = to_node
        flat_edge_ids.extend(edge_ids)

    return {
        "valid": len(failures) == 0,
        "edge_ids": flat_edge_ids,
        "failures": failures,
    }


def audit_generation_bundle(bundle: dict, *, platforms: Optional[list[dict]] = None) -> dict:
    geometry = bundle.get("geometry") or {}
    geometry_points = geometry.get("points") or []
    segments = bundle.get("segments") or []
    infrastructure = bundle.get("infrastructure") or {}
    infra_edges = infrastructure.get("edges") or []

    assembled = assemble_segment_points(segments)
    point_deviation = (
        _max_point_deviation_m(geometry_points, assembled)
        if assembled is not None else None
    )
    geometry_matches_segments = (
        point_deviation is not None and point_deviation <= POINT_TOLERANCE_M
    )

    edge_integrity = _segment_edge_integrity(segments)
    infra_edge_ids = [str(edge.get("edge_id") or "") for edge in infra_edges]
    infra_matches_segments = (
        edge_integrity["valid"] and edge_integrity["edge_ids"] == infra_edge_ids
    )

    mode = str(bundle.get("mode") or "bus")
    expected_source = "OSM_RAIL" if mode == "tram" else "OSM_ROADS"
    source_is_osm = str(geometry.get("source") or "") == expected_source

    stop_validation = None
    if platforms is not None:
        stop_validation = validate_geometry(geometry_points, platforms)
    stop_order_valid = True if stop_validation is None else bool(stop_validation.get("valid"))

    canonical = bool(
        bundle.get("ready")
        and source_is_osm
        and geometry_matches_segments
        and edge_integrity["valid"]
        and infra_matches_segments
        and stop_order_valid
    )

    failures = []
    if not source_is_osm:
        failures.append("NON_OSM_GENERATION_SOURCE")
    if not geometry_matches_segments:
        failures.append("GEOMETRY_SEGMENT_MISMATCH")
    if not edge_integrity["valid"]:
        failures.append("EDGE_CHAIN_INVALID")
    if not infra_matches_segments:
        failures.append("INFRASTRUCTURE_EDGE_CHAIN_MISMATCH")
    if not stop_order_valid:
        failures.append("STOP_ORDER_VALIDATION_FAILED")

    return {
        "schema_v": GEOMETRY_AUDIT_SCHEMA_VERSION,
        "pattern_id": bundle.get("pattern_id"),
        "generation_id": bundle.get("generation_id"),
        "mode": mode,
        "source": geometry.get("source"),
        "canonical_osm_conformant": canonical,
        "geometry_matches_segments": geometry_matches_segments,
        "max_geometry_segment_deviation_m": (
            round(point_deviation, 4) if point_deviation is not None else None
        ),
        "segment_edge_chain_valid": edge_integrity["valid"],
        "infrastructure_matches_segment_edges": infra_matches_segments,
        "geometry_point_count": len(geometry_points),
        "assembled_point_count": len(assembled or []),
        "segment_count": len(segments),
        "edge_count": len(infra_edges),
        "stop_order_valid": stop_order_valid,
        "max_platform_distance_m": (
            (stop_validation or {}).get("max_platform_distance_m")
        ),
        "failures": failures + [
            item.get("reason")
            for item in edge_integrity["failures"]
            if item.get("reason")
        ],
    }


def audit_rendered_geometry(*, resolved_geometry: dict, bundle: Optional[dict]) -> dict:
    source = str(resolved_geometry.get("source") or "")
    points = resolved_geometry.get("points") or []

    if not resolved_geometry.get("render"):
        return {
            "rendered": False,
            "render_source": source,
            "render_authority": "HIDDEN",
            "rendered_matches_generation": None,
            "canonical_osm_rendered": False,
        }

    if source == "PERIX_MANUAL":
        return {
            "rendered": True,
            "render_source": source,
            "render_authority": "VERIFIED_MANUAL_OVERRIDE",
            "rendered_matches_generation": False,
            "canonical_osm_rendered": False,
        }

    if not bundle:
        return {
            "rendered": True,
            "render_source": source,
            "render_authority": "UNBOUND",
            "rendered_matches_generation": False,
            "canonical_osm_rendered": False,
        }

    generation_points = (bundle.get("geometry") or {}).get("points") or []
    deviation = _max_point_deviation_m(points, generation_points)
    matches = deviation is not None and deviation <= POINT_TOLERANCE_M

    return {
        "rendered": True,
        "render_source": source,
        "render_authority": "ATOMIC_OSM_GENERATION" if matches else "MISMATCH",
        "rendered_matches_generation": matches,
        "canonical_osm_rendered": matches and source in {
            "OSM_ROADS", "OSM_RAIL", "OSM_ROADS_SEGMENTS", "OSM_RAIL_SEGMENTS",
        },
        "max_render_generation_deviation_m": (
            round(deviation, 4) if deviation is not None else None
        ),
    }
