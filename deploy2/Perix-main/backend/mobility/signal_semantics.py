"""Direction-aware OSM signal semantics and intersection-event clustering.

Raw OSM signal nodes remain available for diagnostics. This module derives a
second layer of movement-relevant signal EVENTS:

raw exact signal nodes
    -> direction resolution against the directed Perix edge chain
    -> short-range intersection clustering
    -> one deterministic control event per movement/intersection

The clustering thresholds are modeling assumptions, not measured intersection
dimensions. Phase 2.3 deploys them in shadow mode first.
"""
from __future__ import annotations

from collections import Counter
import hashlib
import math
import os
from typing import Optional

ROAD_SIGNAL = "ROAD_SIGNAL"
RAIL_SIGNAL = "RAIL_SIGNAL"

SIGNAL_SEMANTICS_SCHEMA_VERSION = 1
DEFAULT_CLUSTER_PROGRESS_M = 35.0
DEFAULT_CLUSTER_SPATIAL_M = 35.0
_ENDPOINT_PROGRESS_TOLERANCE_M = 0.75


def signal_semantics_enabled() -> bool:
    return os.getenv("MOBILITY_SIGNAL_SEMANTICS_ENABLED", "false").lower() == "true"


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6371000.0
    p1 = math.radians(float(lat1))
    p2 = math.radians(float(lat2))
    dp = math.radians(float(lat2) - float(lat1))
    dl = math.radians(float(lng2) - float(lng1))
    a = (
        math.sin(dp / 2.0) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(dl / 2.0) ** 2
    )
    return radius * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def _family_for_mode(mode: str) -> str:
    return RAIL_SIGNAL if str(mode).lower() == "tram" else ROAD_SIGNAL


def _raw_direction_tag(instance: dict, family: str) -> Optional[str]:
    tags = instance.get("tags") or {}
    if family == RAIL_SIGNAL:
        raw = tags.get("railway:signal:direction")
    else:
        raw = tags.get("traffic_signals:direction") or tags.get("direction")
    if raw is None:
        return None
    value = str(raw).strip().lower()
    return value or None


def _edge_endpoint_progress(edge: dict, signal_id: int) -> Optional[float]:
    if int(edge.get("from_node") or -1) == int(signal_id):
        return float(edge.get("from_m") or 0.0)
    if int(edge.get("to_node") or -1) == int(signal_id):
        return float(edge.get("to_m") or 0.0)
    return None


def _touching_direction_basis(instance: dict, edges: list[dict]) -> dict:
    signal_id = int(instance.get("signal_id") or 0)
    progress = float(instance.get("progress_m") or 0.0)
    touching = []
    relations = set()
    way_ids = set()

    for edge in edges or []:
        endpoint_progress = _edge_endpoint_progress(edge, signal_id)
        if endpoint_progress is None:
            continue
        if abs(endpoint_progress - progress) > _ENDPOINT_PROGRESS_TOLERANCE_M:
            continue
        touching.append(str(edge.get("edge_id") or ""))
        if edge.get("way_id") is not None:
            way_ids.add(int(edge.get("way_id")))
        relation = (edge.get("way") or {}).get("follows_osm_way")
        if isinstance(relation, bool):
            relations.add(relation)

    relation = next(iter(relations)) if len(relations) == 1 else None
    return {
        "edge_ids": sorted(x for x in touching if x),
        "way_ids": sorted(way_ids),
        "relation": relation,
        "relation_count": len(relations),
    }


def resolve_signal_instance(
    instance: dict,
    edges: list[dict],
    *,
    mode: str,
) -> dict:
    """Resolve one raw signal instance against pattern travel direction."""
    out = dict(instance)
    family = _family_for_mode(mode)
    kinds = set(instance.get("kinds") or [])
    out["semantic_family"] = family

    if family not in kinds:
        out.update(
            {
                "semantic_eligible": False,
                "direction_status": "NOT_RELEVANT_TO_MODE",
                "resolved_direction_tag": None,
                "path_osm_direction": None,
                "direction_basis_edge_ids": [],
                "direction_basis_way_ids": [],
            }
        )
        return out

    if str(instance.get("match_method") or "") != "NODE_EXACT":
        out.update(
            {
                "semantic_eligible": False,
                "direction_status": "SPATIAL_DIAGNOSTIC",
                "resolved_direction_tag": _raw_direction_tag(instance, family),
                "path_osm_direction": None,
                "direction_basis_edge_ids": [],
                "direction_basis_way_ids": [],
            }
        )
        return out

    direction_tag = _raw_direction_tag(instance, family)
    basis = _touching_direction_basis(instance, edges)
    relation = basis["relation"]
    path_direction = (
        "forward" if relation is True else "backward" if relation is False else None
    )

    if direction_tag is None:
        status = "UNTAGGED_EXACT"
        eligible = True
    elif direction_tag == "both":
        status = "BOTH"
        eligible = True
    elif direction_tag not in {"forward", "backward"}:
        status = "INVALID_DIRECTION_TAG"
        eligible = False
    elif relation is None:
        status = "AMBIGUOUS_PATH_DIRECTION"
        eligible = False
    else:
        expected_forward = direction_tag == "forward"
        if bool(relation) == expected_forward:
            status = "MATCH"
            eligible = True
        else:
            status = "MISMATCH"
            eligible = False

    out.update(
        {
            "semantic_eligible": bool(eligible),
            "direction_status": status,
            "resolved_direction_tag": direction_tag,
            "path_osm_direction": path_direction,
            "direction_basis_edge_ids": basis["edge_ids"],
            "direction_basis_way_ids": basis["way_ids"],
        }
    )
    return out


def annotate_signal_instances(
    instances: list[dict],
    edges: list[dict],
    *,
    mode: str,
) -> list[dict]:
    return [
        resolve_signal_instance(instance, edges, mode=mode)
        for instance in (instances or [])
    ]


def _instance_distance_m(a: dict, b: dict) -> Optional[float]:
    required = ("latitude", "longitude")
    if not all(a.get(key) is not None and b.get(key) is not None for key in required):
        return None
    return _haversine_m(
        float(a["latitude"]),
        float(a["longitude"]),
        float(b["latitude"]),
        float(b["longitude"]),
    )


def _same_cluster(
    previous: dict,
    current: dict,
    *,
    progress_threshold_m: float,
    spatial_threshold_m: float,
) -> bool:
    progress_gap = abs(
        float(current.get("progress_m") or 0.0)
        - float(previous.get("progress_m") or 0.0)
    )
    if progress_gap > float(progress_threshold_m):
        return False

    if int(previous.get("signal_id") or -1) == int(current.get("signal_id") or -2):
        return True

    spatial = _instance_distance_m(previous, current)
    if spatial is None:
        return False
    return spatial <= float(spatial_threshold_m)


def _event_id(family: str, members: list[dict]) -> str:
    parts = sorted(str(x.get("signal_instance_id") or "") for x in members)
    digest = hashlib.sha1(
        (str(family) + "|" + "|".join(parts)).encode("utf-8")
    ).hexdigest()[:16]
    return f"signal_event:{family.lower()}:{digest}"


def _build_event(family: str, members: list[dict]) -> dict:
    eligible = [x for x in members if x.get("semantic_eligible")]
    progress_source = eligible or members
    progress = min(float(x.get("progress_m") or 0.0) for x in progress_source)
    first = min(progress_source, key=lambda x: float(x.get("progress_m") or 0.0))
    all_progress = [float(x.get("progress_m") or 0.0) for x in members]
    statuses = Counter(str(x.get("direction_status") or "UNKNOWN") for x in members)
    event_id = _event_id(family, members)

    confidence = 1.0
    if any(x.get("direction_status") == "UNTAGGED_EXACT" for x in eligible):
        confidence = 0.9
    if len(eligible) < len(members):
        confidence = min(confidence, 0.8)

    return {
        "signal_event_id": event_id,
        "signal_instance_id": event_id,
        "signal_id": first.get("signal_id"),
        "kinds": [family],
        "progress_m": round(progress, 3),
        "latitude": first.get("latitude"),
        "longitude": first.get("longitude"),
        "edge_seq": first.get("edge_seq"),
        "match_method": "SEMANTIC_CLUSTER",
        "distance_from_path_m": 0.0,
        "confidence": round(confidence, 3),
        "usable_for_motion": bool(eligible),
        "semantic_eligible": bool(eligible),
        "member_count": len(members),
        "eligible_member_count": len(eligible),
        "rejected_member_count": len(members) - len(eligible),
        "member_signal_ids": sorted(
            {int(x.get("signal_id") or 0) for x in members}
        ),
        "member_instance_ids": sorted(
            str(x.get("signal_instance_id") or "") for x in members
        ),
        "direction_status_counts": dict(sorted(statuses.items())),
        "cluster_span_m": round(max(all_progress) - min(all_progress), 3),
        "tags": {},
    }


def build_signal_semantics(
    instances: list[dict],
    edges: list[dict],
    *,
    mode: str,
    cluster_progress_m: float = DEFAULT_CLUSTER_PROGRESS_M,
    cluster_spatial_m: float = DEFAULT_CLUSTER_SPATIAL_M,
) -> dict:
    annotated = annotate_signal_instances(instances, edges, mode=mode)
    family = _family_for_mode(mode)
    candidates = [
        x
        for x in annotated
        if family in set(x.get("kinds") or [])
        and str(x.get("match_method") or "") == "NODE_EXACT"
    ]
    candidates.sort(
        key=lambda x: (
            float(x.get("progress_m") or 0.0),
            int(x.get("signal_id") or 0),
        )
    )

    clusters: list[list[dict]] = []
    for item in candidates:
        if not clusters:
            clusters.append([item])
            continue
        if _same_cluster(
            clusters[-1][-1],
            item,
            progress_threshold_m=float(cluster_progress_m),
            spatial_threshold_m=float(cluster_spatial_m),
        ):
            clusters[-1].append(item)
        else:
            clusters.append([item])

    events = [_build_event(family, members) for members in clusters]
    return {
        "schema_v": SIGNAL_SEMANTICS_SCHEMA_VERSION,
        "family": family,
        "cluster_progress_m": float(cluster_progress_m),
        "cluster_spatial_m": float(cluster_spatial_m),
        "instances": annotated,
        "events": events,
        "summary": signal_semantics_summary(annotated, events, mode=mode),
    }


def signal_semantics_summary(
    instances: list[dict],
    events: list[dict],
    *,
    mode: str,
) -> dict:
    family = _family_for_mode(mode)
    relevant = [
        x for x in (instances or []) if family in set(x.get("kinds") or [])
    ]
    exact = [
        x
        for x in relevant
        if str(x.get("match_method") or "") == "NODE_EXACT"
    ]
    status_counts = Counter(
        str(x.get("direction_status") or "UNKNOWN") for x in relevant
    )
    motion_events = [x for x in (events or []) if x.get("usable_for_motion")]
    return {
        "signal_family": family,
        "raw_relevant_signal_count": len(relevant),
        "raw_exact_signal_count": len(exact),
        "raw_spatial_signal_count": len(relevant) - len(exact),
        "raw_direction_tagged_count": sum(
            1 for x in relevant if x.get("resolved_direction_tag")
        ),
        "direction_match_count": status_counts["MATCH"] + status_counts["BOTH"],
        "direction_untagged_count": status_counts["UNTAGGED_EXACT"],
        "direction_mismatch_count": status_counts["MISMATCH"],
        "direction_ambiguous_count": status_counts["AMBIGUOUS_PATH_DIRECTION"],
        "direction_invalid_count": status_counts["INVALID_DIRECTION_TAG"],
        "signal_event_count": len(events or []),
        "motion_signal_event_count": len(motion_events),
        "clustered_head_reduction_count": max(0, len(exact) - len(events or [])),
        "direction_status_counts": dict(sorted(status_counts.items())),
    }


def motion_signals_for_infrastructure(infra: dict, mode: str) -> list[dict]:
    """Return the signal layer that the motion engine should consume."""
    if (
        signal_semantics_enabled()
        and int(infra.get("signal_semantics_schema_v") or 0)
        == SIGNAL_SEMANTICS_SCHEMA_VERSION
        and isinstance(infra.get("signal_events"), list)
    ):
        family = _family_for_mode(mode)
        return [
            event
            for event in infra.get("signal_events") or []
            if family in set(event.get("kinds") or [])
            and event.get("usable_for_motion")
        ]
    return list(infra.get("signals") or [])


def signal_coverage_for_leg(
    *,
    infra: dict,
    start_m: float,
    end_m: float,
    mode: str,
) -> dict:
    family = _family_for_mode(mode)
    raw = [
        signal
        for signal in (infra.get("signals") or [])
        if family in set(signal.get("kinds") or [])
        and float(start_m)
        < float(signal.get("progress_m") or 0.0)
        < float(end_m)
    ]
    events = [
        event
        for event in (infra.get("signal_events") or [])
        if family in set(event.get("kinds") or [])
        and float(start_m)
        < float(event.get("progress_m") or 0.0)
        < float(end_m)
    ]
    status_counts = Counter(
        str(signal.get("direction_status") or "UNKNOWN") for signal in raw
    )
    active = motion_signals_for_infrastructure(infra, mode)
    active_in_leg = [
        signal
        for signal in active
        if float(start_m)
        < float(signal.get("progress_m") or 0.0)
        < float(end_m)
        and family in set(signal.get("kinds") or [])
    ]

    semantics_ready = (
        int(infra.get("signal_semantics_schema_v") or 0)
        == SIGNAL_SEMANTICS_SCHEMA_VERSION
    )
    return {
        "signal_candidate_count": len(raw),
        "motion_usable_signal_count": sum(
            1 for signal in raw if signal.get("usable_for_motion")
        ),
        "direction_tagged_signal_count": sum(
            1 for signal in raw if signal.get("resolved_direction_tag")
        ),
        "signal_direction_match_count": (
            status_counts["MATCH"] + status_counts["BOTH"]
        ),
        "signal_direction_untagged_count": status_counts["UNTAGGED_EXACT"],
        "signal_direction_mismatch_count": status_counts["MISMATCH"],
        "signal_direction_ambiguous_count": status_counts[
            "AMBIGUOUS_PATH_DIRECTION"
        ],
        "signal_event_count": len(events),
        "motion_signal_event_count": sum(
            1 for event in events if event.get("usable_for_motion")
        ),
        "active_motion_signal_input_count": len(active_in_leg),
        "signal_semantics_ready": semantics_ready,
        "signal_semantics_enabled": signal_semantics_enabled(),
    }
