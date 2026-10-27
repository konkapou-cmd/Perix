"""Server-side OSM snapshot verification for operator-approved closures.

A submitted OSM way or directed edge ID is not a verified closure simply
because an operator supplies `verified=true`. Require active local graph node
membership and a spatial match to the declared closure geometry.
"""
from __future__ import annotations

import math
from typing import Any


def _parse_edge(value: Any) -> tuple[int, int, int]:
    try:
        parts = str(value).split(':')
        if len(parts) != 3:
            raise ValueError('Expected way:node:node')
        way, a, b = map(int, parts)
        if a == b:
            raise ValueError('Same start/end node')
        return way, a, b
    except (TypeError, ValueError) as exc:
        raise ValueError(f'Invalid OSM edge ID: {value!r}') from exc


def _distance_to_segment_m(p: list, a: list, b: list) -> float:
    # Short urban segments: local tangent plane about input latitude.
    lat_scale = 111195.0
    lng_scale = lat_scale * math.cos(math.radians(float(p[0])))
    dx = (float(b[1]) - float(a[1])) * lng_scale
    dy = (float(b[0]) - float(a[0])) * lat_scale
    px = (float(p[1]) - float(a[1])) * lng_scale
    py = (float(p[0]) - float(a[0])) * lat_scale
    divisor = dx * dx + dy * dy
    t = max(0.0, min(1.0, (px * dx + py * dy) / divisor)) if divisor else 0.0
    return math.hypot(px - t * dx, py - t * dy)


def _near_polyline(points: list, geometry: list, tolerance_m: float = 100.0) -> bool:
    if len(points) < 2 or len(geometry) < 2:
        return False
    for p in geometry:
        for i in range(len(points) - 1):
            if _distance_to_segment_m(p, points[i], points[i+1]) <= tolerance_m:
                return True
    # Also covers a geometry line long enough to intersect a very short way.
    for p in points:
        for j in range(len(geometry) - 1):
            if _distance_to_segment_m(p, geometry[j], geometry[j+1]) <= tolerance_m:
                return True
    return False


def verify_graph_ids(*, ways: list[dict], blocked_way_ids: set[int],
                     blocked_edge_ids: set[str], geometry: list,
                     tolerance_m: float = 100.0) -> None:
    """Validate exact way/node adjacency and proximity on *one* OSM mode graph."""
    by_id = {int(w.get('id')): w for w in ways if w.get('id') is not None}
    if not (blocked_way_ids or blocked_edge_ids):
        raise ValueError('At least one OSM way or edge is required')
    if blocked_way_ids - set(by_id):
        raise ValueError(f'OSM way IDs absent from current graph: {sorted(blocked_way_ids-set(by_id))}')
    for wid in blocked_way_ids:
        way = by_id[wid]
        if not _near_polyline(way.get('points') or [], geometry, tolerance_m):
            raise ValueError(f'OSM way {wid} does not match the declared closure location')
    for raw in blocked_edge_ids:
        wid, n1, n2 = _parse_edge(raw)
        way = by_id.get(wid)
        if way is None:
            raise ValueError(f'OSM edge way {wid} absent from current graph')
        nodes = [int(n) for n in (way.get('nodes') or [])]
        indices = [i for i in range(len(nodes)-1)
                   if (nodes[i],nodes[i+1]) in ((n1,n2),(n2,n1))]
        if not indices:
            raise ValueError(f'OSM edge {raw} is not a consecutive node pair')
        points = way.get('points') or []
        if not any(i+1 < len(points) and
                   _near_polyline(points[i:i+2], geometry, tolerance_m)
                   for i in indices):
            raise ValueError(f'OSM edge {raw} is not near the declared closure')


async def verify_closure_osm(*, geometry: list, blocked_way_ids: set[int],
                             blocked_edge_ids: set[str], blocked_modes: list,
                             allowed_modes: list) -> int:
    """Only trust a closure that exists on each affected local bus/tram graph."""
    from mobility.osm_store import active_version, get_local_ways_by_ids
    from mobility.regions import get_active_region
    from mobility.restrictions import restriction_blocks_mode

    region = get_active_region()
    graph_v = await active_version(region.region_id)
    if graph_v is None:
        raise ValueError('Cannot verify: no active local OSM graph snapshot')
    selector = {'blocked_modes': blocked_modes, 'allowed_modes': allowed_modes}
    modes = [m for m in ('bus','tram') if m in region.modes and restriction_blocks_mode(selector,m)]
    if not modes:
        raise ValueError('No affected bus/tram mode to verify')
    wids = set(blocked_way_ids)
    wids.update(_parse_edge(e)[0] for e in blocked_edge_ids)
    for mode in modes:
        matched = await get_local_ways_by_ids(list(wids), mode, graph_v=int(graph_v))
        verify_graph_ids(ways=matched, blocked_way_ids=set(blocked_way_ids),
                         blocked_edge_ids=set(blocked_edge_ids), geometry=geometry)
    return int(graph_v)
