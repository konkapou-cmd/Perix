"""Operational restrictions (mode-aware closures).

A restriction blocks specific MODES on a segment - e.g. the Halberstädter
Straße works close the street for cars/buses while trams keep running:
{blocked_modes: [bus, taxi], allowed_modes: [tram]}. Applied by the road/
rail reconstruction so closed edges never participate in routing for the
blocked mode. Imported data stays untouched.
"""
import hashlib
import json
from datetime import datetime
from typing import List
from zoneinfo import ZoneInfo

from database import db
from mobility.regions import get_active_region


def _now_utc() -> datetime:
    return datetime.now(ZoneInfo("UTC"))


def _active(ov: dict) -> bool:
    now = _now_utc()
    try:
        if ov.get("valid_from"):
            f = datetime.fromisoformat(str(ov["valid_from"]))
            if f.tzinfo is None:
                f = f.replace(tzinfo=ZoneInfo("UTC"))
            if now < f:
                return False
        if ov.get("valid_until"):
            u = datetime.fromisoformat(str(ov["valid_until"]))
            if u.tzinfo is None:
                u = u.replace(tzinfo=ZoneInfo("UTC"))
            if now > u:
                return False
    except ValueError:
        pass
    return True


async def get_active_restrictions() -> List[dict]:
    region = get_active_region()
    docs = await db.mobility_restrictions.find(
        {"region_id": region.region_id, "network_id": region.network_id},
        {"_id": 0},
    ).to_list(500)
    return [d for d in docs if _active(d)]


def restriction_blocks_mode(r: dict, mode: str) -> bool:
    blocked = [str(m) for m in (r.get("blocked_modes") or [])]
    allowed = [str(m) for m in (r.get("allowed_modes") or [])]
    if blocked and mode in blocked:
        return True
    if allowed and mode not in allowed:
        return True
    return False


def restriction_edges_for_pattern(
    restrictions: List[dict], *, mode: str, route_number: str, direction: str
) -> tuple[set[int], set[str]]:
    """Apply only verified, active OSM edge/way closures to this pattern.

    GTFS-RT text alerts are NOT geometry: a closure requires verified graph ids.
    The route/direction filters matter; a detour on route 9 must not reroute 10.
    """
    ways: set[int] = set()
    edges: set[str] = set()
    for restriction in restrictions:
        if not restriction.get("verified") or not _active(restriction):
            continue
        if not restriction_blocks_mode(restriction, mode):
            continue
        routes = {str(x) for x in (restriction.get("route_numbers") or [])}
        if routes and str(route_number) not in routes:
            continue
        restricted_direction = str(restriction.get("direction") or "both")
        if restricted_direction not in ("both", "") and restricted_direction != str(direction):
            continue
        for value in restriction.get("blocked_way_ids") or []:
            try:
                ways.add(int(value))
            except (ValueError, TypeError):
                continue
        for value in restriction.get("blocked_edge_ids") or []:
            bits = str(value).split(":")
            if len(bits) != 3:
                continue
            try:
                [int(x) for x in bits]
            except ValueError:
                continue
            edges.add(str(value))
    return ways, edges


def restriction_signature(
    restrictions: List[dict], *, mode: str, route_number: str, direction: str
) -> str:
    """A stable value for detecting activation AND expiration of detours."""
    ways, edges = restriction_edges_for_pattern(
        restrictions, mode=mode, route_number=route_number, direction=direction
    )
    if not ways and not edges:
        return ""  # Compatible with existing generations before this change.
    payload = json.dumps(
        {"ways": sorted(ways), "edges": sorted(edges)},
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:24]


async def blocked_way_ids_for(mode: str, restrictions: List[dict]) -> set:
    """OSM way ids closed for this mode - ONLY from map-matched (verified)
    restrictions. Proximity guessing is gone: a parallel street must never
    get blocked because it sits near a closed one."""
    blocked: set = set()
    for r in restrictions:
        if not r.get("verified", False):
            continue
        if r.get("route_numbers"):
            continue
        if not restriction_blocks_mode(r, mode):
            continue
        for wid in (r.get("blocked_way_ids") or []):
            try:
                blocked.add(int(wid))
            except (TypeError, ValueError):
                continue
    return blocked


async def blocked_edge_ids_for(mode: str, restrictions: List[dict]) -> set:
    """Exact graph edge ids ('{way}:{node}:{node}') closed for this mode -
    the closure blocks ONLY the incident section, not the whole way."""
    blocked: set = set()
    for r in restrictions:
        if not r.get("verified", False):
            continue
        if r.get("route_numbers"):
            continue
        if not restriction_blocks_mode(r, mode):
            continue
        for eid in (r.get("blocked_edge_ids") or []):
            blocked.add(str(eid))
    return blocked


async def invalidate_geometries(restriction: dict) -> None:
    """Queue all matching patterns; retain last-known-good until validated.

    No stop-distance heuristic: a closure can be midway between stops.
    This handles rail closures too, but never reroutes an allowed mode.
    """
    if not restriction.get("verified"):
        return
    if not (restriction.get("blocked_way_ids") or restriction.get("blocked_edge_ids")):
        return

    from routes.mobility import _get_active_network
    from mobility.domain import NETWORK_ID, build_domain
    from utils.mobility_workers import request_precompute

    network = await _get_active_network()
    if not network:
        return
    domain = build_domain(network, NETWORK_ID)
    routes = {str(x) for x in (restriction.get("route_numbers") or [])}
    restricted_direction = str(restriction.get("direction") or "both")
    affected = {
        str(pattern.get("pattern_id"))
        for pattern in domain.get("patterns", [])
        if restriction_blocks_mode(restriction, str(pattern.get("mode") or "bus"))
        and (not routes or str(pattern.get("route_number")) in routes)
        and (restricted_direction in ("both", "") or
             restricted_direction == str(pattern.get("direction") or ""))
    }
    if affected:
        request_precompute(affected, reason="RESTRICTION_CHANGED")
