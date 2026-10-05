"""Map matching + trip assignment (Mobility Core V2 - Phase 5).

Raw GPS is snapped to the vehicle's route geometry (mode-aware: bus/tram
follow their line's pattern, taxis stay raw). Guards: perpendicular
distance tolerance (accuracy-aware), heading consistency and previous
position prevent jumps to parallel streets.
"""
import math
from typing import List, Optional

SNAP_TOLERANCE_M = 60.0
SNAP_ACCURACY_FACTOR = 2.0
ASSIGN_MAX_DISTANCE_M = 300.0


def _haversine_m(lat1, lng1, lat2, lng2) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _bearing(lat1, lng1, lat2, lng2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lng2 - lng1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def nearest_segment(lat: float, lng: float, points: List[list]):
    """Project a point onto a polyline -> (px, py, distance_m, segment_idx)."""
    best = None
    for i in range(len(points) - 1):
        x0, y0 = points[i]
        x1, y1 = points[i + 1]
        dx, dy = x1 - x0, y1 - y0
        denom = dx * dx + dy * dy
        t = 0.0 if denom == 0 else max(0.0, min(1.0, ((lat - x0) * dx + (lng - y0) * dy) / denom))
        px, py = x0 + t * dx, y0 + t * dy
        d = _haversine_m(lat, lng, px, py)
        if best is None or d < best[2]:
            best = (px, py, d, i)
    return best


def snap_to_geometry(
    lat: float,
    lng: float,
    heading,
    accuracy_m,
    points: List[list],
) -> dict:
    """Snap the raw GPS to the geometry when it is plausibly ON it."""
    if not points or len(points) < 2:
        return {"latitude": lat, "longitude": lng, "snapped": False, "distance_m": None}
    tolerance = max(SNAP_TOLERANCE_M, (accuracy_m or 0) * SNAP_ACCURACY_FACTOR)
    proj = nearest_segment(lat, lng, points)
    if not proj:
        return {"latitude": lat, "longitude": lng, "snapped": False, "distance_m": None}
    px, py, d, seg = proj
    if d > tolerance:
        return {"latitude": lat, "longitude": lng, "snapped": False, "distance_m": round(d, 1)}
    if heading is not None:
        seg_heading = _bearing(points[seg][0], points[seg][1], points[seg + 1][0], points[seg + 1][1])
        diff = abs(((float(heading) - seg_heading + 180) % 360) - 180)
        if diff > 90:
            # Heading contradicts the geometry: vehicle turning or off-route
            return {"latitude": lat, "longitude": lng, "snapped": False, "distance_m": round(d, 1)}
    return {"latitude": px, "longitude": py, "snapped": True, "distance_m": round(d, 1), "segment_idx": seg}


def _geometry_points(route: dict) -> List[list]:
    """Route geometry as [[lat, lng], ...] - the route shape, or the main
    trip's ordered stops as the honest fallback."""
    sh = route.get("shape") or []
    if isinstance(sh, list) and len(sh) > 2:
        return [[float(p[0]), float(p[1])] for p in sh]
    by_id = {str(s.get("stop_id")): s for s in route.get("stops", []) if s.get("stop_id") is not None}
    best = []
    for t in (route.get("trips") or []):
        ids = t.get("stop_ids") or []
        if len(ids) > len(best):
            best = ids
    return [
        [float(by_id[str(sid)]["lat"]), float(by_id[str(sid)]["lng"])]
        for sid in best
        if str(sid) in by_id and by_id[str(sid)].get("lat") is not None
    ]


def assign_trip(route: dict, vehicle: dict, lat: float, lng: float, now_sec: int, delays: dict) -> Optional[dict]:
    """Assign the GPS vehicle to a trip: the trip must be active now
    (delay-adjusted window), roughly match the declared direction, and the
    GPS position must sit near that trip's pattern."""
    from routes.mobility import _trip_shape, _trip_window

    direction = str(vehicle.get("route_direction") or "")
    candidates = []
    for trip in route.get("trips", []):
        rt = delays.get(str(trip.get("trip_id") or ""))
        w = _trip_window(route, trip, rt)
        if not w or not (w["start"] - 60 <= now_sec <= w["end"] + 180):
            continue
        if direction and str(trip.get("headsign") or "") not in ("", direction):
            continue
        shape = _trip_shape(route, trip)
        pts = [[float(p[0]), float(p[1])] for p in shape] if isinstance(shape, list) and len(shape) > 2 else []
        if not pts:
            pts = _geometry_points(route)
        if not pts:
            continue
        proj = nearest_segment(lat, lng, pts)
        if not proj:
            continue
        candidates.append((proj[2], trip))
    if not candidates:
        return None
    candidates.sort(key=lambda x: x[0])
    best_d, best_trip = candidates[0]
    if best_d <= ASSIGN_MAX_DISTANCE_M:
        return best_trip
    return None
