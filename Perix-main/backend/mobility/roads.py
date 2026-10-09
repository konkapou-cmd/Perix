"""OSM road-graph reconstruction (Phase 2 refinement).

Rebuilds a pattern's geometry by routing between CONSECUTIVE stops over
real OSM road centerlines (highway=* ways). The result always follows the
middle of actual streets - never a straight line across buildings. Used
as a geometry source when the route relation shape is unavailable or no
longer matches the current timetable (e.g. diversions).
"""
import asyncio
import heapq
import math
from typing import Dict, List, Optional, Tuple

import httpx

OVERPASS_URLS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.osm.ch/api/interpreter",
]

HIGHWAY_FILTER = (
    "^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street)$"
)
RAILWAY_FILTER = "^(tram|light_rail)$"


def _haversine_m(lat1, lng1, lat2, lng2) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _key(lat: float, lng: float) -> str:
    return f"{round(lat, 5)}:{round(lng, 5)}"


async def _fetch_ways(bbox: Tuple[float, float, float, float], mode: str) -> List[list]:
    return [w["points"] for w in await _fetch_ways_detailed(bbox, mode)]


async def _fetch_ways_detailed(bbox: Tuple[float, float, float, float], mode: str, with_names: bool = False) -> List[dict]:
    """Overpass ways with OSM node ids and tags: [{id, nodes, points, name, tags}]."""
    s, w, n, e = bbox
    # 'out body geom;' always: node refs + tags + geometry. Node ids are
    # REQUIRED for way connectivity - a plain 'out geom;' has no node refs,
    # so every way would get synthetic node ids and the graph would be cut
    # at every way junction (segments failing without reason).
    out_stmt = "out body geom;"
    if mode == "tram":
        query = (
            f'[out:json][timeout:90];way["railway"~"{RAILWAY_FILTER}"]({s},{w},{n},{e});{out_stmt}'
        )
    else:
        query = (
            f'[out:json][timeout:90];way["highway"~"{HIGHWAY_FILTER}"]({s},{w},{n},{e});{out_stmt}'
        )
    last_err: Optional[Exception] = None
    for url in OVERPASS_URLS:
        for attempt in range(2):
            try:
                async with httpx.AsyncClient(
                    timeout=150, headers={"User-Agent": "PerixMobility/1.0 (app.perixapp.com)"}
                ) as client:
                    resp = await client.get(url, params={"data": query})
                    resp.raise_for_status()
                    data = resp.json()
                ways = []
                for el in data.get("elements", []):
                    if el.get("type") != "way":
                        continue
                    pts = [[p.get("lat"), p.get("lon")] for p in (el.get("geometry") or [])]
                    if len(pts) < 2:
                        continue
                    ways.append(
                        {
                            "id": int(el.get("id") or 0),
                            "nodes": [int(x) for x in (el.get("nodes") or [])],
                            "points": pts,
                            "name": (el.get("tags") or {}).get("name") or None,
                            "tags": el.get("tags") or {},
                        }
                    )
                if ways:
                    return ways
                # A 200 with zero ways means a stale/empty mirror - treat it
                # as a failure and try the next mirror instead of returning
                # an empty graph silently.
                last_err = RuntimeError("empty response (0 ways)")
                await asyncio.sleep(5 * (attempt + 1))
            except Exception as err:
                last_err = err
                await asyncio.sleep(5 * (attempt + 1))
    raise RuntimeError(f"Overpass failed: {last_err}")


def _build_graph(ways: List[list]) -> Tuple[Dict[int, Tuple[float, float]], Dict[int, List[Tuple[int, float]]]]:
    nodes, adj, _ = _build_graph_detailed([{"id": i, "points": w, "nodes": [], "tags": {}} for i, w in enumerate(ways)], "bus")
    return nodes, {k: [(t, d) for (t, d, _e) in v] for k, v in adj.items()}


def _way_oneway(tags: dict, mode: str) -> Optional[str]:
    """Effective oneway for this mode: oneway:bus/psv overrides oneway.
    Returns 'yes' (forward only), '-1' (backward only) or None."""
    if mode in ("bus", "taxi"):
        for key in ("oneway:bus", "oneway:psv"):
            if tags.get(key) in ("yes", "-1"):
                return tags[key]
        if tags.get("busway") in ("opposite_lane",):
            return "-1"
    ow = tags.get("oneway")
    if ow in ("yes", "1"):
        return "yes"
    if ow in ("-1", "reverse"):
        return "-1"
    return None


def _build_graph_detailed(
    ways: List[dict], mode: str = "bus"
) -> Tuple[Dict[int, Tuple[float, float]], Dict[int, List[Tuple[int, float, str]]], Dict[tuple, int]]:
    """Directed graph over REAL OSM node ids. Each edge carries its stable
    id '{way_id}:{from_node}:{to_node}' and respects oneway/access tags,
    so buses drive legally and tram connectivity is rail-connectivity."""
    nodes: Dict[int, Tuple[float, float]] = {}
    adj: Dict[int, List[Tuple[int, float, str]]] = {}
    edge_way: Dict[tuple, int] = {}

    def ensure_node(nid: int, lat: float, lng: float) -> None:
        if nid not in nodes:
            nodes[nid] = (lat, lng)
            adj[nid] = []

    for way in ways:
        wid = int(way.get("id") or 0)
        pts = way.get("points") or []
        nids = way.get("nodes") or []
        tags = way.get("tags") or {}
        if mode == "tram":
            oneway = None
        else:
            oneway = _way_oneway(tags, mode)
        for i in range(len(pts) - 1):
            lat_a, lng_a = pts[i]
            lat_b, lng_b = pts[i + 1]
            na = nids[i] if i < len(nids) else -(10**9 + i)
            nb = nids[i + 1] if i + 1 < len(nids) else -(10**9 + i + 1)
            ensure_node(na, lat_a, lng_a)
            ensure_node(nb, lat_b, lng_b)
            d = _haversine_m(lat_a, lng_a, lat_b, lng_b)
            eid = f"{wid}:{na}:{nb}"
            if oneway == "-1":
                adj[nb].append((na, d, eid))
                edge_way[(nb, na)] = wid
            elif oneway == "yes":
                adj[na].append((nb, d, eid))
                edge_way[(na, nb)] = wid
            else:
                adj[na].append((nb, d, eid))
                adj[nb].append((na, d, eid))
                edge_way[(na, nb)] = wid
                edge_way[(nb, na)] = wid
    return nodes, adj, edge_way


def _nearest_node(nodes: Dict[int, Tuple[float, float]], lat: float, lng: float) -> int:
    best, best_d = -1, float("inf")
    for nid, (nlat, nlng) in nodes.items():
        d = _haversine_m(lat, lng, nlat, nlng)
        if d < best_d:
            best, best_d = nid, d
    return best


def _astar(
    adj: Dict[int, List[Tuple[int, float, str]]],
    nodes: Dict[int, Tuple[float, float]],
    start: int,
    goal: int,
    blocked_edges: Optional[set] = None,
) -> List[int]:
    if start == goal:
        return [start], []
    blocked_edges = blocked_edges or set()
    open_heap = [(0.0, start)]
    g = {start: 0.0}
    came = {}
    came_edge = {}
    while open_heap:
        _, cur = heapq.heappop(open_heap)
        if cur == goal:
            break
        cur_g = g[cur]
        for nxt, d, eid in adj.get(cur, []):
            if (cur, nxt) in blocked_edges or eid in blocked_edges:
                continue
            ng = cur_g + d
            if ng < g.get(nxt, float("inf")):
                g[nxt] = ng
                glat, glng = nodes[goal]
                nlat, nlng = nodes[nxt]
                came[nxt] = cur
                came_edge[nxt] = eid
                heapq.heappush(open_heap, (ng + _haversine_m(nlat, nlng, glat, glng), nxt))
    if goal not in came and start != goal:
        return []
    path = [goal]
    edges = []
    while path[-1] != start:
        cur = path[-1]
        edges.append(came_edge.get(cur))
        path.append(came[cur])
    path.reverse()
    edges.reverse()
    return path, edges


def _route_stops_sync(stops: List[Tuple[float, float]], ways: List[list]) -> List[list]:
    res = _route_stops_segments_sync(stops, ways)
    return res["full"] or []


def _route_stops_segments_sync(
    stops: List[Tuple[float, float]],
    ways: List[dict],
    blocked_way_ids: Optional[set] = None,
    mode: str = "bus",
    blocked_eids: Optional[set] = None,
) -> dict:
    """Route each consecutive stop pair independently (segment registry).

    One failed pair NEVER rejects the whole pattern. Every segment records
    its start/end OSM node and the exact edge chain, so joining segments
    later REQUIRES a shared graph node (no arbitrary coordinate joins)."""
    nodes, adj, edge_way = _build_graph_detailed(
        [
            w if isinstance(w, dict) else {"id": i, "points": w, "nodes": [], "tags": {}}
            for i, w in enumerate(ways)
        ],
        mode,
    )
    blocked_way_ids = blocked_way_ids or set()
    blocked_eids = blocked_eids or set()
    blocked_edges = set()
    for (a, b), wid in edge_way.items():
        if wid in blocked_way_ids:
            blocked_edges.add((a, b))
            for nxt, d, eid in adj.get(a, []):
                if nxt == b and edge_way.get((a, b)) == wid:
                    blocked_edges.add(eid)
    for eid in blocked_eids:
        blocked_edges.add(eid)
    segments = []
    for i in range(len(stops) - 1):
        if len(nodes) < 2:
            segments.append({"a_idx": i, "b_idx": i + 1, "points": [], "ok": False})
            continue
        a = _nearest_node(nodes, stops[i][0], stops[i][1])
        b = _nearest_node(nodes, stops[i + 1][0], stops[i + 1][1])
        result = _astar(adj, nodes, a, b, blocked_edges)
        if not result:
            segments.append({"a_idx": i, "b_idx": i + 1, "points": [], "ok": False})
            continue
        path, edges = result
        coords = [[nodes[nid][0], nodes[nid][1]] for nid in path]
        segments.append(
            {
                "a_idx": i,
                "b_idx": i + 1,
                "points": coords,
                "ok": True,
                "start_node_id": path[0] if path else None,
                "end_node_id": path[-1] if path else None,
                "edge_ids": edges,
            }
        )

    full = []
    if segments and all(s["ok"] for s in segments):
        for i, s in enumerate(segments):
            if i == 0:
                full.extend(s["points"])
            else:
                full.extend(s["points"][1:])
    missing = [[s["a_idx"], s["b_idx"]] for s in segments if not s["ok"]]
    return {"segments": segments, "full": full or None, "missing_pairs": missing}


async def compute_pattern_geometry(stops: List[dict], mode: str = "bus") -> List[list]:
    """Route the pattern over real OSM roads (bus/taxi) or rails (tram).
    Closed edges for this mode (operational restrictions) never
    participate in the routing. `stops` = [{lat, lng}, ...]."""
    res = await compute_pattern_segments(stops, mode)
    return res.get("full") or []


async def compute_pattern_segments(stops: List[dict], mode: str = "bus") -> dict:
    """Per stop-pair routing (segment registry) with a larger retry bbox:
    rail networks can leave the immediate stop corridor, so a first pass
    with a tight bbox may fail while a wider one succeeds."""
    pts = [
        (float(s.get("latitude") or s.get("lat")), float(s.get("longitude") or s.get("lng")))
        for s in stops
        if (s.get("latitude") or s.get("lat")) is not None and (s.get("longitude") or s.get("lng")) is not None
    ]
    if len(pts) < 2:
        return {"segments": [], "full": None, "missing_pairs": []}
    lats = [p[0] for p in pts]
    lngs = [p[1] for p in pts]
    margins = [0.004, 0.02] if mode == "tram" else [0.004]
    best_partial = None
    for margin in margins:
        bbox = (min(lats) - margin, min(lngs) - margin, max(lats) + margin, max(lngs) + margin)
        try:
            ways_detailed = await _fetch_ways_detailed(bbox, mode)
        except Exception:
            ways_detailed = []
        if not ways_detailed:
            continue
        # Mode-aware closures: block the EXACT matched OSM edges for this
        # mode (verified only - proximity-based blocking is gone, it kept
        # closing parallel streets by accident).
        blocked_way_ids: set = set()
        blocked_eids: set = set()
        try:
            from mobility.restrictions import (
                blocked_edge_ids_for,
                blocked_way_ids_for,
                get_active_restrictions,
            )

            restrictions = await get_active_restrictions()
            if restrictions:
                blocked_way_ids = await blocked_way_ids_for(mode, restrictions)
                blocked_eids = await blocked_edge_ids_for(mode, restrictions)
        except Exception:
            pass
        loop = asyncio.get_event_loop()
        res = await loop.run_in_executor(
            None,
            _route_stops_segments_sync,
            pts,
            ways_detailed,
            blocked_way_ids,
            mode,
            blocked_eids,
        )
        if res["full"]:
            return res
        # Keep the best partial and CONTINUE to the wider bbox - a near
        # complete tram pattern must still try the larger search area for
        # its missing pairs (the old code returned early and left gaps).
        ok_best = len([s for s in (best_partial or {}).get("segments", []) if s.get("ok")])
        ok_cur = len([s for s in res.get("segments", []) if s.get("ok")])
        if best_partial is None or ok_cur > ok_best:
            best_partial = res
    if best_partial:
        return best_partial
    return {"segments": [], "full": None, "missing_pairs": [[i, i + 1] for i in range(len(pts) - 1)]}
