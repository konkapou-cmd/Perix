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


def _haversine_m(lat1, lng1, lat2, lng2) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _key(lat: float, lng: float) -> str:
    return f"{round(lat, 5)}:{round(lng, 5)}"


async def _fetch_ways(bbox: Tuple[float, float, float, float]) -> List[list]:
    s, w, n, e = bbox
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
                        ways.append([[p.get("lat"), p.get("lon")] for p in el["geometry"]])
                return ways
            except Exception as err:
                last_err = err
                await asyncio.sleep(2 * (attempt + 1))
    raise RuntimeError(f"Overpass failed: {last_err}")


def _build_graph(ways: List[list]) -> Tuple[Dict[int, Tuple[float, float]], Dict[int, List[Tuple[int, float]]]]:
    """Nodes are road vertices; edges carry meters. Bidirectional."""
    coord_to_id: Dict[str, int] = {}
    nodes: Dict[int, Tuple[float, float]] = {}
    adj: Dict[int, List[Tuple[int, float]]] = {}

    def node_id(lat: float, lng: float) -> int:
        k = _key(lat, lng)
        if k not in coord_to_id:
            nid = len(nodes)
            coord_to_id[k] = nid
            nodes[nid] = (lat, lng)
            adj[nid] = []
        return coord_to_id[k]

    for way in ways:
        for i in range(len(way) - 1):
            a = node_id(way[i][0], way[i][1])
            b = node_id(way[i + 1][0], way[i + 1][1])
            d = _haversine_m(nodes[a][0], nodes[a][1], nodes[b][0], nodes[b][1])
            adj[a].append((b, d))
            adj[b].append((a, d))
    return nodes, adj


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
) -> List[int]:
    if start == goal:
        return [start]
    open_heap = [(0.0, start)]
    g = {start: 0.0}
    came = {}
    while open_heap:
        _, cur = heapq.heappop(open_heap)
        if cur == goal:
            break
        cur_g = g[cur]
        for nxt, d in adj.get(cur, []):
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
    nodes, adj = _build_graph(ways)
    if len(nodes) < 2:
        return []
    path: List[list] = []
    for i in range(len(stops) - 1):
        a = _nearest_node(nodes, stops[i][0], stops[i][1])
        b = _nearest_node(nodes, stops[i + 1][0], stops[i + 1][1])
        seg = _astar(adj, nodes, a, b)
        if not seg:
            # Street not connected in this tile - keep going with the next pair
            continue
        coords = [[nodes[nid][0], nodes[nid][1]] for nid in seg]
        if path and coords:
            path.extend(coords[1:])
        else:
            path.extend(coords)
    return path


async def compute_pattern_geometry(stops: List[dict]) -> List[list]:
    """Route the pattern over real OSM roads. `stops` = [{lat, lng}, ...]."""
    pts = [
        (float(s.get("latitude") or s.get("lat")), float(s.get("longitude") or s.get("lng")))
        for s in stops
        if (s.get("latitude") or s.get("lat")) is not None and (s.get("longitude") or s.get("lng")) is not None
    ]
    if len(pts) < 2:
        return []
    lats = [p[0] for p in pts]
    lngs = [p[1] for p in pts]
    margin = 0.004
    bbox = (min(lats) - margin, min(lngs) - margin, max(lats) + margin, max(lngs) + margin)
    ways = await _fetch_ways(bbox)
    if not ways:
        return []
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _route_stops_sync, pts, ways)
