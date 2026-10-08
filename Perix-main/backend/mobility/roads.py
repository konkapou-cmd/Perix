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


async def _fetch_ways_detailed(bbox: Tuple[float, float, float, float], mode: str) -> List[dict]:
    """Overpass ways with their ids: [{id, points}]."""
    s, w, n, e = bbox
    if mode == "tram":
        query = (
            f'[out:json][timeout:90];way["railway"~"{RAILWAY_FILTER}"]({s},{w},{n},{e});out geom;'
        )
    else:
        query = (
            f'[out:json][timeout:90];way["highway"~"{HIGHWAY_FILTER}"]({s},{w},{n},{e});out geom;'
        )
    last_err: Optional[Exception] = None
    for url in OVERPASS_URLS:
        for attempt in range(3):
            try:
                async with httpx.AsyncClient(
                    timeout=150, headers={"User-Agent": "PerixMobility/1.0 (app.perixapp.com)"}
                ) as client:
                    resp = await client.get(url, params={"data": query})
                    resp.raise_for_status()
                    data = resp.json()
                ways = []
                for el in data.get("elements", []):
                    if el.get("type") == "way" and el.get("geometry"):
                        ways.append(
                            {
                                "id": int(el.get("id") or 0),
                                "points": [[p.get("lat"), p.get("lon")] for p in el["geometry"]],
                            }
                        )
                return ways
            except Exception as err:
                last_err = err
                await asyncio.sleep(2 * (attempt + 1))
    raise RuntimeError(f"Overpass failed: {last_err}")


def _build_graph(ways: List[list]) -> Tuple[Dict[int, Tuple[float, float]], Dict[int, List[Tuple[int, float]]]]:
    nodes, adj, _ = _build_graph_detailed([{"id": 0, "points": w} for w in ways])
    return nodes, adj


def _build_graph_detailed(
    ways: List[dict],
) -> Tuple[Dict[int, Tuple[float, float]], Dict[int, List[Tuple[int, float]]], Dict[tuple, int]]:
    """Nodes are road vertices; edges carry meters. Bidirectional. Every
    edge remembers which OSM way it came from so closures can block the
    EXACT edges (never parallel streets by proximity)."""
    coord_to_id: Dict[str, int] = {}
    nodes: Dict[int, Tuple[float, float]] = {}
    adj: Dict[int, List[Tuple[int, float]]] = {}
    edge_way: Dict[tuple, int] = {}

    def node_id(lat: float, lng: float) -> int:
        k = _key(lat, lng)
        if k not in coord_to_id:
            nid = len(nodes)
            coord_to_id[k] = nid
            nodes[nid] = (lat, lng)
            adj[nid] = []
        return coord_to_id[k]

    for way in ways:
        wid = int(way.get("id") or 0)
        pts = way.get("points") or []
        for i in range(len(pts) - 1):
            a = node_id(pts[i][0], pts[i][1])
            b = node_id(pts[i + 1][0], pts[i + 1][1])
            d = _haversine_m(nodes[a][0], nodes[a][1], nodes[b][0], nodes[b][1])
            adj[a].append((b, d))
            adj[b].append((a, d))
            edge_way[(a, b)] = wid
            edge_way[(b, a)] = wid
    return nodes, adj, edge_way


def _nearest_node(nodes: Dict[int, Tuple[float, float]], lat: float, lng: float) -> int:
    best, best_d = -1, float("inf")
    for nid, (nlat, nlng) in nodes.items():
        d = _haversine_m(lat, lng, nlat, nlng)
        if d < best_d:
            best, best_d = nid, d
    return best


def _astar(
    adj: Dict[int, List[Tuple[int, float]]],
    nodes: Dict[int, Tuple[float, float]],
    start: int,
    goal: int,
    blocked_edges: Optional[set] = None,
) -> List[int]:
    if start == goal:
        return [start]
    blocked_edges = blocked_edges or set()
    open_heap = [(0.0, start)]
    g = {start: 0.0}
    came = {}
    while open_heap:
        _, cur = heapq.heappop(open_heap)
        if cur == goal:
            break
        cur_g = g[cur]
        for nxt, d in adj.get(cur, []):
            if (cur, nxt) in blocked_edges:
                continue
            ng = cur_g + d
            if ng < g.get(nxt, float("inf")):
                g[nxt] = ng
                glat, glng = nodes[goal]
                nlat, nlng = nodes[nxt]
                came[nxt] = cur
                heapq.heappush(open_heap, (ng + _haversine_m(nlat, nlng, glat, glng), nxt))
    if goal not in came and start != goal:
        return []
    path = [goal]
    while path[-1] != start:
        path.append(came[path[-1]])
    return path[::-1]


def _route_stops_sync(stops: List[Tuple[float, float]], ways: List[list]) -> List[list]:
    res = _route_stops_segments_sync(stops, ways)
    return res["full"] or []


def _route_stops_segments_sync(
    stops: List[Tuple[float, float]],
    ways: List[list],
    blocked_way_ids: Optional[set] = None,
) -> dict:
    """Route each consecutive stop pair independently (segment registry).

    One failed pair NEVER rejects the whole pattern: every successful
    pair keeps its own real road/rail geometry, so the pattern becomes
    complete as soon as the last missing pair resolves (manual overlay,
    larger search area, updated OSM data)."""
    nodes, adj, edge_way = _build_graph_detailed(
        [
            {"id": (w.get("id") if isinstance(w, dict) else i), "points": (w.get("points") if isinstance(w, dict) else w)}
            for i, w in enumerate(ways)
        ]
    )
    blocked_way_ids = blocked_way_ids or set()
    blocked_edges = set()
    for (a, b), wid in edge_way.items():
        if wid in blocked_way_ids:
            blocked_edges.add((a, b))
    segments = []
    for i in range(len(stops) - 1):
        if len(nodes) < 2:
            segments.append({"a_idx": i, "b_idx": i + 1, "points": [], "ok": False})
            continue
        a = _nearest_node(nodes, stops[i][0], stops[i][1])
        b = _nearest_node(nodes, stops[i + 1][0], stops[i + 1][1])
        seg = _astar(adj, nodes, a, b, blocked_edges)
        if not seg:
            # Discontinuity: NEVER join unconnected segments with a
            # straight line (it would cross buildings). Mark unresolved.
            segments.append({"a_idx": i, "b_idx": i + 1, "points": [], "ok": False})
            continue
        coords = [[nodes[nid][0], nodes[nid][1]] for nid in seg]
        segments.append({"a_idx": i, "b_idx": i + 1, "points": coords, "ok": True})

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
        try:
            from mobility.restrictions import blocked_way_ids_for, get_active_restrictions

            restrictions = await get_active_restrictions()
            if restrictions:
                blocked_way_ids = await blocked_way_ids_for(mode, restrictions)
        except Exception:
            pass
        if not ways_detailed:
            continue
        loop = asyncio.get_event_loop()
        res = await loop.run_in_executor(
            None, _route_stops_segments_sync, pts, ways_detailed, blocked_way_ids
        )
        if res["full"]:
            return res
        if res["segments"]:
            return res
    return {"segments": [], "full": None, "missing_pairs": [[i, i + 1] for i in range(len(pts) - 1)]}
