"""Derived per-pattern road/rail infrastructure.

The canonical pattern geometry already stores the exact directed OSM edge ids
used between consecutive stops. This module enriches those edges with OSM way
attributes and attaches OSM signal nodes at a deterministic progress_m.

Important boundaries:
- OSM import/storage stays in mobility.osm_store.
- GTFS/realtime timing stays in routes.mobility + mobility_workers.
- This module derives static infrastructure only; it does not move vehicles.
"""
import math
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from database import db
from mobility.osm_store import active_version, get_local_signals, get_local_ways_by_ids
from mobility.regions import get_active_region, get_region
from mobility.signals import RAIL_SIGNAL, ROAD_SIGNAL

INFRA_SCHEMA_VERSION = 1
GEOMETRY_SCHEMA_VERSION = 3
BUS_SPATIAL_SIGNAL_MAX_M = 8.0
TRAM_SPATIAL_SIGNAL_MAX_M = 12.0


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _parse_edge_id(edge_id: str) -> Optional[Tuple[int, int, int]]:
    try:
        way_id, from_node, to_node = str(edge_id).split(":", 2)
        return int(way_id), int(from_node), int(to_node)
    except Exception:
        return None


def _int_tag(value) -> Optional[int]:
    if value is None:
        return None
    try:
        text = str(value).strip().split(";", 1)[0]
        return int(float(text))
    except Exception:
        return None


def _maxspeed_kmh(value) -> Optional[float]:
    if value is None:
        return None
    text = str(value).strip().lower()
    if not text or text in {"none", "signals", "variable", "walk"}:
        return None
    try:
        if "mph" in text:
            return round(float(text.replace("mph", "").strip()) * 1.609344, 1)
        return float(text.split(" ", 1)[0])
    except Exception:
        return None


def _edge_follows_way(way: dict, from_node: int, to_node: int) -> Optional[bool]:
    nodes = [int(x) for x in (way.get("nodes") or [])]
    try:
        a = nodes.index(int(from_node))
        b = nodes.index(int(to_node))
    except ValueError:
        return None
    if abs(a - b) != 1:
        return None
    return b > a


def _directional_lanes(tags: dict, follows_way: Optional[bool]) -> Optional[int]:
    if follows_way is True:
        directional = _int_tag(tags.get("lanes:forward"))
        if directional is not None:
            return max(1, directional)
    elif follows_way is False:
        directional = _int_tag(tags.get("lanes:backward"))
        if directional is not None:
            return max(1, directional)

    total = _int_tag(tags.get("lanes"))
    if total is None:
        return None

    oneway = str(tags.get("oneway") or "").lower() in {"yes", "1", "-1", "reverse"}
    if oneway:
        return max(1, total)
    return max(1, int(math.ceil(total / 2.0)))


def _bus_lane(tags: dict) -> bool:
    values = " ".join(
        str(tags.get(key) or "")
        for key in (
            "busway",
            "busway:left",
            "busway:right",
            "bus:lanes",
            "bus:lanes:forward",
            "bus:lanes:backward",
            "psv:lanes",
            "psv:lanes:forward",
            "psv:lanes:backward",
        )
    ).lower()
    return any(token in values for token in ("lane", "designated", "yes"))


def _way_attributes(way: dict, mode: str, from_node: int, to_node: int) -> dict:
    tags = way.get("tags") or {}
    follows_way = _edge_follows_way(way, from_node, to_node)
    common = {
        "name": way.get("name") or tags.get("name"),
        "maxspeed_kmh": _maxspeed_kmh(tags.get("maxspeed")),
        "follows_osm_way": follows_way,
    }

    if mode == "tram":
        return {
            **common,
            "railway": tags.get("railway"),
            "service": tags.get("service"),
            "embedded_rails": tags.get("embedded_rails"),
            "track_mode": "UNKNOWN",
        }

    return {
        **common,
        "highway": tags.get("highway"),
        "lanes": _int_tag(tags.get("lanes")),
        "lanes_forward": _int_tag(tags.get("lanes:forward")),
        "lanes_backward": _int_tag(tags.get("lanes:backward")),
        "directional_lanes": _directional_lanes(tags, follows_way),
        "oneway": str(tags.get("oneway") or "").lower() in {"yes", "1", "-1", "reverse"},
        "bus_lane": _bus_lane(tags),
        "surface": tags.get("surface"),
        "junction": tags.get("junction"),
        "embedded_rails": tags.get("embedded_rails"),
    }


def _build_edge_chain(segments: List[dict]) -> Optional[dict]:
    """Turn stored stop-pair segments into one ordered directed edge chain."""
    ordered = sorted(
        segments,
        key=lambda s: (int(s.get("a_idx", 0)), int(s.get("b_idx", 0))),
    )
    if not ordered:
        return None

    edges = []
    node_occurrences: Dict[int, List[dict]] = {}
    way_ids = set()
    progress_m = 0.0
    seq = 0
    all_points = []
    previous_end_node = None

    for segment in ordered:
        points = segment.get("points") or []
        edge_ids = segment.get("edge_ids") or []
        if len(points) < 2 or len(edge_ids) != len(points) - 1:
            return None

        start_node = segment.get("start_node_id")
        end_node = segment.get("end_node_id")
        if previous_end_node is not None and start_node is not None:
            if int(previous_end_node) != int(start_node):
                return None
        previous_end_node = end_node

        if not all_points:
            all_points.extend(points)
        else:
            all_points.extend(points[1:])

        for i, edge_id in enumerate(edge_ids):
            parsed = _parse_edge_id(edge_id)
            if not parsed:
                return None
            way_id, from_node, to_node = parsed
            p0 = points[i]
            p1 = points[i + 1]
            length_m = _haversine_m(float(p0[0]), float(p0[1]), float(p1[0]), float(p1[1]))
            from_m = progress_m
            to_m = progress_m + length_m

            from_occurrences = node_occurrences.setdefault(from_node, [])
            if not any(abs(float(x["progress_m"]) - from_m) < 0.01 for x in from_occurrences):
                from_occurrences.append({"progress_m": from_m, "edge_seq": seq})
            to_occurrences = node_occurrences.setdefault(to_node, [])
            if not any(abs(float(x["progress_m"]) - to_m) < 0.01 for x in to_occurrences):
                to_occurrences.append({"progress_m": to_m, "edge_seq": seq})

            edges.append(
                {
                    "seq": seq,
                    "segment_id": segment.get("segment_id"),
                    "a_idx": int(segment.get("a_idx", 0)),
                    "b_idx": int(segment.get("b_idx", 0)),
                    "edge_id": str(edge_id),
                    "way_id": way_id,
                    "from_node": from_node,
                    "to_node": to_node,
                    "from_m": round(from_m, 3),
                    "to_m": round(to_m, 3),
                    "length_m": round(length_m, 3),
                    "from_point": [float(p0[0]), float(p0[1])],
                    "to_point": [float(p1[0]), float(p1[1])],
                }
            )
            way_ids.add(way_id)
            progress_m = to_m
            seq += 1

    if len(all_points) < 2:
        return None

    lats = [float(p[0]) for p in all_points]
    lngs = [float(p[1]) for p in all_points]
    return {
        "edges": edges,
        "node_occurrences": node_occurrences,
        "way_ids": way_ids,
        "total_m": progress_m,
        "bbox": (min(lats), min(lngs), max(lats), max(lngs)),
    }


def _project_signal_to_edge(signal: dict, edge: dict) -> Tuple[float, float]:
    """Return (distance_m, progress_m) for the closest point on one edge."""
    lat = float(signal["latitude"])
    lng = float(signal["longitude"])
    a = edge["from_point"]
    b = edge["to_point"]

    mean_lat = math.radians((lat + float(a[0]) + float(b[0])) / 3.0)
    x_scale = 111320.0 * math.cos(mean_lat)
    y_scale = 110540.0

    ax = (float(a[1]) - lng) * x_scale
    ay = (float(a[0]) - lat) * y_scale
    bx = (float(b[1]) - lng) * x_scale
    by = (float(b[0]) - lat) * y_scale
    dx, dy = bx - ax, by - ay
    denom = dx * dx + dy * dy
    t = 0.0 if denom == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / denom))
    px, py = ax + t * dx, ay + t * dy
    distance_m = math.sqrt(px * px + py * py)
    progress_m = float(edge["from_m"]) + t * float(edge["length_m"])
    return distance_m, progress_m


def _signal_instances(chain: dict, signals: List[dict], mode: str) -> List[dict]:
    edges = chain["edges"]
    node_occurrences = chain["node_occurrences"]
    out = []
    exact_signal_ids = set()

    for signal in signals:
        signal_id = int(signal.get("signal_id") or 0)
        occurrences = node_occurrences.get(signal_id) or []
        if not occurrences:
            continue
        exact_signal_ids.add(signal_id)
        for occurrence_no, occurrence in enumerate(occurrences):
            out.append(
                {
                    "signal_instance_id": f"{signal_id}:{occurrence_no}",
                    "signal_id": signal_id,
                    "kinds": signal.get("kinds") or [],
                    "progress_m": round(float(occurrence["progress_m"]), 3),
                    "edge_seq": int(occurrence["edge_seq"]),
                    "match_method": "NODE_EXACT",
                    "distance_from_path_m": 0.0,
                    "confidence": 1.0,
                    "usable_for_motion": True,
                    "direction_tag": (signal.get("tags") or {}).get("traffic_signals:direction")
                    or (signal.get("tags") or {}).get("railway:signal:direction"),
                    "tags": signal.get("tags") or {},
                }
            )

    threshold = TRAM_SPATIAL_SIGNAL_MAX_M if mode == "tram" else BUS_SPATIAL_SIGNAL_MAX_M
    for signal in signals:
        signal_id = int(signal.get("signal_id") or 0)
        if signal_id in exact_signal_ids:
            continue

        kinds = set(signal.get("kinds") or [])
        if mode == "bus" and ROAD_SIGNAL not in kinds:
            continue
        if mode == "tram" and not ({ROAD_SIGNAL, RAIL_SIGNAL} & kinds):
            continue

        best = None
        for edge in edges:
            distance_m, progress_m = _project_signal_to_edge(signal, edge)
            if best is None or distance_m < best[0]:
                best = (distance_m, progress_m, edge)
        if best is None or best[0] > threshold:
            continue

        distance_m, progress_m, edge = best
        out.append(
            {
                "signal_instance_id": f"{signal_id}:spatial",
                "signal_id": signal_id,
                "kinds": signal.get("kinds") or [],
                "progress_m": round(progress_m, 3),
                "edge_seq": int(edge["seq"]),
                "match_method": "SPATIAL_NEAR_PATH",
                "distance_from_path_m": round(distance_m, 3),
                "confidence": round(max(0.0, 1.0 - distance_m / max(1.0, threshold)), 3),
                "usable_for_motion": False,
                "direction_tag": (signal.get("tags") or {}).get("traffic_signals:direction")
                or (signal.get("tags") or {}).get("railway:signal:direction"),
                "tags": signal.get("tags") or {},
            }
        )

    return sorted(out, key=lambda x: (float(x["progress_m"]), int(x["signal_id"])))


async def derive_pattern_infrastructure(
    pattern_id: str,
    version_id: str,
    mode: str,
    *,
    segments: List[dict],
    region_id: Optional[str] = None,
    network_id: Optional[str] = None,
    osm_snapshot_v: Optional[int] = None,
) -> Optional[dict]:
    """Derive infrastructure from an explicit immutable segment set.

    No DB write occurs here. Atomic mobility generations use this helper
    to build geometry + infrastructure in memory before committing one
    generation document.
    """
    region = get_region(region_id) if region_id else get_active_region()
    resolved_network_id = str(network_id or region.network_id)
    snapshot = (
        int(osm_snapshot_v)
        if osm_snapshot_v is not None
        else await active_version(region.region_id)
    )
    if snapshot is None:
        return None

    chain = _build_edge_chain(segments)
    if not chain:
        return None

    ways = await get_local_ways_by_ids(
        list(chain["way_ids"]),
        mode,
        region_id=region.region_id,
        graph_v=int(snapshot),
    )
    ways_by_id = {int(w.get("id") or 0): w for w in ways}

    for edge in chain["edges"]:
        way = ways_by_id.get(int(edge["way_id"]))
        if not way:
            edge["way"] = None
            continue
        edge["way"] = _way_attributes(
            way,
            mode,
            int(edge["from_node"]),
            int(edge["to_node"]),
        )

    s, w, n, e = chain["bbox"]
    signals = await get_local_signals(
        (s - 0.0003, w - 0.0003, n + 0.0003, e + 0.0003),
        region_id=region.region_id,
        graph_v=int(snapshot),
    )
    signal_instances = _signal_instances(chain, signals, mode)

    return {
        "pattern_id": str(pattern_id),
        "version_id": str(version_id),
        "mode": str(mode),
        "region_id": region.region_id,
        "network_id": resolved_network_id,
        "schema_v": INFRA_SCHEMA_VERSION,
        "geometry_schema_v": GEOMETRY_SCHEMA_VERSION,
        "osm_snapshot_v": int(snapshot),
        "total_m": round(float(chain["total_m"]), 3),
        "edges": chain["edges"],
        "signals": signal_instances,
        "edge_count": len(chain["edges"]),
        "signal_count": len(signal_instances),
        "motion_signal_count": sum(
            1 for x in signal_instances if x.get("usable_for_motion")
        ),
        "built_at": datetime.now(timezone.utc).isoformat(),
    }


async def build_pattern_infrastructure(
    pattern_id: str,
    version_id: str,
    mode: str,
    *,
    region_id: Optional[str] = None,
    network_id: Optional[str] = None,
) -> Optional[dict]:
    """Legacy-compatible persisted infrastructure builder."""
    region = get_region(region_id) if region_id else get_active_region()
    resolved_network_id = str(network_id or region.network_id)
    osm_snapshot_v = await active_version(region.region_id)
    if osm_snapshot_v is None:
        return None

    segments = await db.mobility_geometry_segments.find(
        {
            "pattern_id": str(pattern_id),
            "version_id": str(version_id),
            "graph_v": GEOMETRY_SCHEMA_VERSION,
            "osm_snapshot_v": int(osm_snapshot_v),
            "region_id": region.region_id,
            "network_id": resolved_network_id,
        },
        {"_id": 0},
    ).sort([("a_idx", 1), ("b_idx", 1)]).to_list(1000)

    doc = await derive_pattern_infrastructure(
        pattern_id,
        version_id,
        mode,
        segments=segments,
        region_id=region.region_id,
        network_id=resolved_network_id,
        osm_snapshot_v=int(osm_snapshot_v),
    )
    if not doc:
        return None
    await db.mobility_pattern_infrastructure.replace_one(
        {
            "pattern_id": str(pattern_id),
            "version_id": str(version_id),
            "region_id": region.region_id,
        },
        doc,
        upsert=True,
    )
    return doc


async def ensure_pattern_infrastructure(
    pattern_id: str,
    version_id: str,
    mode: str,
    *,
    region_id: Optional[str] = None,
    network_id: Optional[str] = None,
    force: bool = False,
) -> Optional[dict]:
    """Return current infrastructure, rebuilding when versions do not match."""
    region = get_region(region_id) if region_id else get_active_region()
    resolved_network_id = str(network_id or region.network_id)
    osm_snapshot_v = await active_version(region.region_id)
    if osm_snapshot_v is None:
        return None

    if not force:
        existing = await db.mobility_pattern_infrastructure.find_one(
            {
                "pattern_id": str(pattern_id),
                "version_id": str(version_id),
                "schema_v": INFRA_SCHEMA_VERSION,
                "geometry_schema_v": GEOMETRY_SCHEMA_VERSION,
                "osm_snapshot_v": int(osm_snapshot_v),
                "region_id": region.region_id,
                "network_id": resolved_network_id,
            },
            {"_id": 0},
        )
        if existing:
            return existing

    return await build_pattern_infrastructure(
        pattern_id,
        version_id,
        mode,
        region_id=region.region_id,
        network_id=resolved_network_id,
    )
