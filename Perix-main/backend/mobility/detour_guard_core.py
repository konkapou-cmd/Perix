"""Pure safety decisions for Perix verified-detour generations.

Only operator-verified graph IDs count as physical closures. GTFS-RT alerts
are notices, not evidence of a map-matched closure or an alternate timetable.
This module intentionally has no database, FastAPI or network dependencies.
"""
from __future__ import annotations

from typing import Any


def undirected_edge_key(edge_id: Any) -> tuple[int, int, int] | None:
    """OSM physical edge identity, regardless of traversal order.

    A closure of 10:1:2 covers the same rail/road segment as 10:2:1 for
    detection. Pattern/direction restrictions are applied before this step.
    """
    try:
        bits = str(edge_id).split(":")
        if len(bits) != 3:
            return None
        way, a, b = map(int, bits)
        if a == b:
            return None
        return (way, min(a, b), max(a, b))
    except (ValueError, TypeError):
        return None


def audit_generation(*, expected_signature: str, blocked_way_ids: set,
                     blocked_edge_ids: set, bundle: dict | None,
                     atomic_enabled: bool) -> dict:
    """Fail closed when a verified detour cannot be proven in the active path.

    No verified closure: legacy operation stays unaffected unless a retained
    *diversion* generation has a now-expired fingerprint. An active closure
    requires an atomic generation built under the exact current restrictions,
    plus segment-level edge evidence that the blocked graph was avoided.
    """
    expected_signature = str(expected_signature or "")
    has_closure = bool(blocked_way_ids or blocked_edge_ids)
    previous_signature = str((bundle or {}).get("restriction_fingerprint") or "")

    if not has_closure and not expected_signature:
        if atomic_enabled and bundle and previous_signature:
            return {"safe": False, "status": "REBUILD_AFTER_EXPIRY", "details": []}
        return {"safe": True, "status": "NO_VERIFIED_CLOSURE", "details": []}

    if not has_closure or not expected_signature:
        return {"safe": False, "status": "INCOMPLETE_RESTRICTION", "details": []}
    if not atomic_enabled:
        return {"safe": False, "status": "ATOMIC_GENERATIONS_REQUIRED", "details": []}
    if not bundle or not bundle.get("ready"):
        return {"safe": False, "status": "GENERATION_PENDING", "details": []}
    if previous_signature != expected_signature:
        return {"safe": False, "status": "REBUILD_FOR_DETOUR", "details": []}

    segments = bundle.get("segments") or []
    if not segments or any(not (s.get("edge_ids") or []) for s in segments):
        return {"safe": False, "status": "MISSING_OSM_EDGE_EVIDENCE", "details": []}

    blocked_way_ids = {int(x) for x in blocked_way_ids}
    blocked_keys = {k for eid in blocked_edge_ids if (k := undirected_edge_key(eid)) is not None}
    hits = set()
    for segment in segments:
        for eid in segment.get("edge_ids") or []:
            key = undirected_edge_key(eid)
            if key is None:
                return {"safe": False, "status": "INVALID_OSM_EDGE_EVIDENCE", "details": []}
            if key[0] in blocked_way_ids or key in blocked_keys:
                hits.add(str(eid))
    if hits:
        return {"safe": False, "status": "CLOSED_EDGE_IN_GENERATION", "details": sorted(hits)[:20]}
    return {"safe": True, "status": "VERIFIED_DETOUR_READY", "details": []}


def audit_line_split(*, active_route_numbers: list[str], expected_route_numbers: list[str]) -> dict:
    """Operator reference vs imported GTFS public line labels (diagnostic only).

    Never create or reroute trips from an expected label. A mismatch requires
    a refreshed/verified timetable; an expectation is not a substitute GTFS.
    """
    active = {str(n).strip().upper() for n in active_route_numbers if str(n).strip()}
    expected = {str(n).strip().upper() for n in expected_route_numbers if str(n).strip()}
    missing = sorted(expected - active)
    return {"match": not missing and bool(expected), "expected": sorted(expected),
            "present": sorted(expected & active), "missing": missing}
