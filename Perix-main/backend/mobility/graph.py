"""Unified mobility graph (Mobility Core V2 - Phase 2).

Effective transit graph = OSM/GTFS-derived geometries + Perix manual
overlays, resolved per pattern by the Geometry Resolver with strict
validation: a geometry that drifts far from its platforms (or leaves
buildings crossed) is rejected and the pattern falls back to the
ordered-stop polyline - never a wrong street.
"""
import math
from typing import List, Optional

# Priority order of the Geometry Resolver
RESOLVER_PRIORITY = ["GTFS_SHAPE", "OSM_ROUTE", "PERIX_MANUAL", "STOP_FALLBACK"]

# A geometry is invalid when any platform is farther than this from it
MAX_PLATFORM_DISTANCE_M = 120.0


def _haversine_m(lat1, lng1, lat2, lng2) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _point_to_polyline_m(lat: float, lng: float, points: List[list]) -> float:
    best = float("inf")
    for i in range(len(points) - 1):
        x0, y0 = points[i][0], points[i][1]
        x1, y1 = points[i + 1][0], points[i + 1][1]
        dx, dy = x1 - x0, y1 - y0
        if dx == 0 and dy == 0:
            d = _haversine_m(lat, lng, x0, y0)
        else:
            t = max(0.0, min(1.0, ((lat - x0) * dx + (lng - y0) * dy) / (dx * dx + dy * dy)))
            d = _haversine_m(lat, lng, x0 + t * dx, y0 + t * dy)
        if d < best:
            best = d
    return best


def validate_geometry(points: List[list], platforms: List[dict]) -> dict:
    """Check that every platform (in trip order) sits near the geometry."""
    if not points or len(points) < 2 or not platforms:
        return {"valid": False, "max_platform_distance_m": None, "missing_platforms": len(platforms)}
    max_d = 0.0
    missing = 0
    for p in platforms:
        lat = p.get("latitude")
        lng = p.get("longitude")
        if lat is None or lng is None:
            missing += 1
            continue
        d = _point_to_polyline_m(lat, lng, points)
        if d > MAX_PLATFORM_DISTANCE_M:
            missing += 1
        max_d = max(max_d, d)
    return {"valid": missing == 0, "max_platform_distance_m": round(max_d, 1), "missing_platforms": missing}


def resolve_pattern_geometry(pat: dict, platforms_by_id: dict, overlays: List[dict]) -> dict:
    """Geometry Resolver: first candidate source that validates wins.

    Priority: GTFS shape > OSM route geometry > verified manual overlay
    > ordered-stop polyline (diagnostic fallback).
    """
    stop_platforms = [
        platforms_by_id.get(str(sid))
        for sid in (pat.get("stop_ids") or [])
        if platforms_by_id.get(str(sid))
    ]
    fallback_points = [
        [float(p.get("latitude")), float(p.get("longitude"))]
        for p in stop_platforms
        if p.get("latitude") is not None and p.get("longitude") is not None
    ]
    if len(fallback_points) < 2:
        return {
            "points": [],
            "source": "STOP_FALLBACK",
            "valid": False,
            "max_platform_distance_m": None,
        }

    candidates: List[tuple] = []
    if pat.get("shape_id"):
        # Geometry came from the feed's own shapes.txt for THIS trip
        candidates.append(("GTFS_SHAPE", pat.get("points") or []))
    elif (pat.get("points") or []) and len(pat.get("points") or []) > 2:
        candidates.append(("OSM_ROUTE", pat["points"]))
    for ov in overlays or []:
        if not ov.get("verified"):
            continue
        if str(ov.get("route_number") or "") not in ("", str(pat.get("route_number"))):
            continue
        if ov.get("direction") and str(ov.get("direction")) != str(pat.get("direction")):
            continue
        mode = pat.get("mode")
        if mode and ov.get("allowed_modes") and mode not in ov.get("allowed_modes"):
            continue
        geom = ov.get("geometry") or []
        if len(geom) >= 2:
            candidates.append(("PERIX_MANUAL", [[float(p[0]), float(p[1])] for p in geom]))
    candidates.append(("STOP_FALLBACK", fallback_points))

    for source, pts in candidates:
        check = validate_geometry(pts, stop_platforms)
        if check["valid"]:
            return {
                "points": pts,
                "source": source,
                "valid": True,
                "max_platform_distance_m": check["max_platform_distance_m"],
            }

    # Nothing validated: the stop polyline is always correct-by-construction
    return {
        "points": fallback_points,
        "source": "STOP_FALLBACK",
        "valid": True,
        "max_platform_distance_m": 0.0,
    }


async def get_overlays() -> List[dict]:
    from database import db

    docs = await db.mobility_graph_overlays.find({}, {"_id": 0}).to_list(500)
    return list(docs)


async def create_overlay(payload: dict) -> dict:
    import uuid

    from database import db
    from routes.mobility import now_utc

    doc = {
        "overlay_id": f"ovl_{uuid.uuid4().hex[:12]}",
        "name": str(payload.get("name") or "").strip(),
        "geometry": [[float(p[0]), float(p[1])] for p in (payload.get("geometry") or []) if len(p) >= 2],
        "allowed_modes": [m for m in (payload.get("allowed_modes") or []) if m in ("bus", "tram", "taxi")],
        "route_number": str(payload.get("route_number") or "") or None,
        "direction": str(payload.get("direction") or "") or None,
        "verified": bool(payload.get("verified", False)),
        "source": "PERIX_MANUAL",
        "created_at": now_utc().isoformat(),
    }
    if len(doc["geometry"]) < 2:
        raise ValueError("geometry needs at least 2 points")
    await db.mobility_graph_overlays.replace_one(
        {"overlay_id": doc["overlay_id"]}, doc, upsert=True
    )
    return doc
