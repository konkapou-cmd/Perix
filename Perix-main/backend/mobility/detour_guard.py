"""Verified detour read guard for map and vehicle payloads.

Safety: a rendered line/virtual vehicle may only use an audited generation
that matches the current operator-verified OSM edge closure. Public alerts
are not geographic closure evidence.
"""
from __future__ import annotations

from mobility.detour_guard_core import audit_generation


async def detour_states_for_domain(domain: dict) -> dict[str, dict]:
    from database import db
    from mobility.generations import atomic_generations_enabled
    from mobility.restrictions import (
        get_active_restrictions, restriction_edges_for_pattern, restriction_signature,
    )
    from mobility.regions import get_active_region

    if not domain:
        return {}
    region = get_active_region()
    version_id = str((domain.get("network") or {}).get("version_id") or "")
    atomic = atomic_generations_enabled()
    restrictions = await get_active_restrictions()
    patterns = domain.get("patterns") or []
    scoped = {}
    affected_pids = []
    for pat in patterns:
        pid = str(pat.get("pattern_id") or "")
        selector = {
            "mode": str(pat.get("mode") or "bus"),
            "route_number": str(pat.get("route_number") or ""),
            "direction": str(pat.get("direction") or ""),
        }
        ways, edges = restriction_edges_for_pattern(restrictions, **selector)
        signature = restriction_signature(restrictions, **selector)
        scoped[pid] = (selector, ways, edges, signature)
        if ways or edges:
            affected_pids.append(pid)

    bundles = {}
    if atomic and version_id:
        key = {
            "region_id": region.region_id, "network_id": region.network_id,
            "version_id": version_id,
        }
        # GET /vehicles runs frequently: only fetch full edge chains for
        # affected patterns, and only lightweight signatures for old detours.
        if affected_pids:
            docs = await db.mobility_pattern_generations.find(
                {**key, "pattern_id": {"$in": affected_pids}},
                {"_id": 0, "pattern_id": 1, "ready": 1,
                 "restriction_fingerprint": 1, "segments.edge_ids": 1},
            ).to_list(len(affected_pids))
            bundles.update({str(x.get("pattern_id")): x for x in docs})
        old_docs = await db.mobility_pattern_generations.find(
            {**key, "restriction_fingerprint": {"$exists": True, "$nin": ["", None]}},
            {"_id": 0, "pattern_id": 1, "ready": 1, "restriction_fingerprint": 1},
        ).to_list(max(1000, len(patterns)))
        for record in old_docs:
            bundles.setdefault(str(record.get("pattern_id")), record)

    # Server proof must correspond to this *current* OSM snapshot. Legacy
    # manually flagged `verified` records lack snapshot provenance and must
    # be re-reviewed instead of being presumed accurate.
    current_osm_v = None
    if affected_pids:
        from mobility.osm_store import active_version
        current_osm_v = await active_version(region.region_id)
    from mobility.restrictions import restriction_blocks_mode

    states = {}
    for pid, (selector, ways, edges, signature) in scoped.items():
        unproven = False
        if ways or edges:
            for record in restrictions:
                if not record.get("verified") or not restriction_blocks_mode(record, selector["mode"]):
                    continue
                routes = {str(x) for x in (record.get("route_numbers") or [])}
                if routes and selector["route_number"] not in routes:
                    continue
                direction = str(record.get("direction") or "both")
                if direction not in ("", "both", selector["direction"]):
                    continue
                if not (record.get("blocked_way_ids") or record.get("blocked_edge_ids")):
                    continue
                if current_osm_v is None or str(record.get("verified_osm_snapshot_v") or "") != str(current_osm_v):
                    unproven = True
                    break
        result = audit_generation(
            expected_signature=signature, blocked_way_ids=ways,
            blocked_edge_ids=edges, bundle=bundles.get(pid),
            atomic_enabled=atomic,
        )
        if unproven:
            result = {"safe": False, "status": "OSM_VERIFICATION_REQUIRED", "details": []}
        states[pid] = {
            **result, "pattern_id": pid, "mode": selector["mode"],
            "route_number": selector["route_number"], "direction": selector["direction"],
            "verified_closed_way_count": len(ways), "verified_closed_edge_count": len(edges),
        }
    return states
