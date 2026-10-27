"""Opt-in, ephemeral Google Routes estimates for verified straight OSM edges.

All gates are required: ENABLED=true, dedicated GOOGLE_ROUTES_API_KEY, a
comma-separated MOBILITY_GOOGLE_TRAFFIC_REGIONS allowlist, and positive
MOBILITY_GOOGLE_TRAFFIC_REQUESTS_PER_MINUTE (default 0, capped at 600).
Callers must additionally opt into billable refresh with allow_live_fetch=True.
The rolling attempt budget is PER PROCESS, not a hard account billing cap.
No Google payloads or credentials are persisted or logged by this adapter.
Only nonnegative duration-staticDuration congestion is exported, never car
speed or geometry. Faster-than-static responses cannot relax bus physics.
"""
from __future__ import annotations

import asyncio
from collections import OrderedDict, deque
from concurrent.futures import Future
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import hashlib
import math
import os
import re
import threading
import time

import httpx

PROVIDER_NAME = "GOOGLE_ROUTES"
URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
FIELD_MASK = (
    "routes.duration,routes.staticDuration,routes.distanceMeters,routes.polyline.geoJsonLinestring,"
    "fallbackInfo"
)
TTL_SECONDS = 60
NEGATIVE_TTL_SECONDS = 15
SNAPSHOT_DEADLINE_SECONDS = 2.0
MAX_REQUESTS_PER_SNAPSHOT = 2
MAX_CACHE_ENTRIES = 512
MAX_INFLIGHT = 32
_LOCK = threading.Lock()
_CACHE = OrderedDict()
_INFLIGHT = {}
_ATTEMPTS = deque()


def _utcnow():
    return datetime.now(timezone.utc)


def observation_revision(region_id, network_id):
    """Fingerprint current observations, not the wall-clock traffic bucket.

    Include adapter gates so disabling it immediately invalidates derived plans.
    This is cache-only and never reserves budget or performs I/O.
    """
    key = os.getenv("GOOGLE_ROUTES_API_KEY", "").strip()
    regions = {r.strip() for r in os.getenv("MOBILITY_GOOGLE_TRAFFIC_REGIONS", "").split(",") if r.strip()}
    try:
        enabled = (os.getenv("MOBILITY_GOOGLE_TRAFFIC_ENABLED", "false").strip().lower() == "true"
                   and key and region_id in regions and network_id
                   and int(os.getenv("MOBILITY_GOOGLE_TRAFFIC_REQUESTS_PER_MINUTE", "0")) > 0)
    except ValueError:
        enabled = False
    if not enabled:
        return "disabled"
    key_identity = hashlib.sha256(key.encode()).digest()
    with _LOCK:
        observations = sorted(
            (repr(cache_key[3:]), repr(value))
            for cache_key, (expiry, value) in _CACHE.items()
            if cache_key[:3] == (region_id, network_id, key_identity)
            and expiry > time.monotonic() and value is not None
        )
    return hashlib.sha256(repr(observations).encode()).hexdigest()[:16]


def _number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("not a finite number")
    value = float(value)
    if not math.isfinite(value):
        raise ValueError("not a finite number")
    return value


def _point(value):
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        raise ValueError("not a coordinate pair")
    lat, lon = map(_number, value)
    if not (-90 < lat < 90 and -180 <= lon <= 180):
        raise ValueError("coordinate out of range")
    return lat, lon


def _distance(a, b):
    lat1, lat2 = math.radians(a[0]), math.radians(b[0])
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2)
         * math.sin(math.radians(b[1] - a[1]) / 2) ** 2)
    return 6371000 * 2 * math.asin(math.sqrt(min(1.0, h)))


def _canonical(edge):
    """Reject short, non-road, noncanonical, or inconsistent edge geometry."""
    try:
        edge_id = edge["edge_id"]
        ids = tuple(int(part) for part in edge_id.split(":"))
        if len(ids) != 3 or edge_id != ":".join(map(str, ids)):
            return None
        if ids != (edge["way_id"], edge["from_node"], edge["to_node"]):
            return None
        if any(n <= 0 for n in ids) or ids[1] == ids[2]:
            return None
        way = edge.get("way") or {}
        if edge.get("bus_lane") or way.get("bus_lane") or not way.get("highway"):
            return None
        a, b = _point(edge["from_point"]), _point(edge["to_point"])
        length = _number(edge["length_m"])
        chord = _distance(a, b)
        # Projection is deliberately local; polar/dateline/very long edges are ambiguous.
        if (length < 50 or chord < 50 or length > 10000
                or abs(a[0]) > 85 or abs(b[0]) > 85 or abs(a[1] - b[1]) > 1
                or abs(chord - length) > max(1.0, length * 0.01)):
            return None
        return edge_id, a, b, length
    except (KeyError, TypeError, ValueError, AttributeError, OverflowError):
        return None


def _verified_estimate(payload, canonical):
    """Verify directed endpoints, corridor, progress, and both reported lengths."""
    try:
        if not isinstance(payload, dict) or "fallbackInfo" in payload:
            return None
        routes = payload["routes"]
        if not isinstance(routes, list) or len(routes) != 1:
            return None
        route = routes[0]
        distance = _number(route["distanceMeters"])
        durations = []
        for field in ("duration", "staticDuration"):
            text = route[field]
            if not isinstance(text, str) or not re.fullmatch(r"\d+(?:\.\d{1,9})?s", text):
                return None
            seconds = float(text[:-1])
            if not math.isfinite(seconds) or seconds <= 0:
                return None
            durations.append(seconds)
        duration, static_duration = durations
        if distance <= 0:
            return None
        geo = route["polyline"]["geoJsonLinestring"]
        if geo["type"] != "LineString":
            return None
        coordinates = geo["coordinates"]
        if not isinstance(coordinates, list) or not 2 <= len(coordinates) <= 10000:
            return None
        points = []
        for pair in coordinates:
            if not isinstance(pair, (list, tuple)) or len(pair) != 2:
                return None
            points.append(_point([pair[1], pair[0]]))
        _, a, b, length = canonical
        start_error, end_error = _distance(a, points[0]), _distance(b, points[-1])
        if max(start_error, end_error) > 10:
            return None
        scale_x = 6371000 * math.cos(math.radians((a[0] + b[0]) / 2))

        def project(point):
            return (math.radians(point[1] - a[1]) * scale_x,
                    math.radians(point[0] - a[0]) * 6371000)

        bx, by = project(b)
        chord = math.hypot(bx, by)
        previous = -math.inf
        max_corridor = 0.0
        for point in points:
            x, y = project(point)
            along = (x * bx + y * by) / chord
            corridor = abs(x * by - y * bx) / chord
            corridor = math.hypot(corridor, max(0.0, -along, along - chord))
            # No backtracking; also constrain projection to the finite edge segment.
            if along < previous or along < -10 or along > chord + 10 or corridor > 10:
                return None
            previous = along
            max_corridor = max(max_corridor, corridor)
        geometry_length = sum(_distance(p, q) for p, q in zip(points, points[1:]))
        tolerance = max(10.0, length * 0.15)
        if (abs(geometry_length - length) > tolerance
                or abs(distance - length) > tolerance
                or abs(distance - geometry_length) > tolerance):
            return None
        fetched = _utcnow()
        return {
            "traffic_delay_s": max(0.0, duration - static_duration),
            "canonical_length_m": length,
            "constraint": "NON_RECOVERABLE",
            "includes_signal_delay": True,
            "provider": PROVIDER_NAME,
            "fetched_at": fetched.isoformat(),
            "expires_at": (fetched + timedelta(seconds=TTL_SECONDS)).isoformat(),
            "geometry_verification": {
                "verified": True,
                "start_error_m": start_error,
                "end_error_m": end_error,
                "max_corridor_m": max_corridor,
                "monotonic": True,
                "canonical_length_m": length,
                "geometry_length_m": geometry_length,
                "route_distance_m": distance,
                "length_tolerance_m": tolerance,
            },
        }
    except (KeyError, TypeError, ValueError, AttributeError, OverflowError):
        return None


async def google_traffic_for_edges(
    edges: list[dict], when: datetime, *, region_id, network_id,
    allow_live_fetch: bool = False,
) -> dict:
    """Return verified estimates by edge; default calls only read fresh cache.

    Only aware timestamps within the past 60s / next 5s are current. No trip
    identity enters the cache. Failed attempts, including cancellation, are
    negative-cached for 15s. Stale estimates are never served.
    """
    key = os.getenv("GOOGLE_ROUTES_API_KEY", "").strip()
    regions = {r.strip() for r in os.getenv("MOBILITY_GOOGLE_TRAFFIC_REGIONS", "").split(",") if r.strip()}
    try:
        budget = min(600, int(os.getenv("MOBILITY_GOOGLE_TRAFFIC_REQUESTS_PER_MINUTE", "0")))
        age = (_utcnow() - when).total_seconds() if when.utcoffset() is not None else math.inf
    except (TypeError, ValueError, AttributeError, OverflowError):
        return {}
    if (os.getenv("MOBILITY_GOOGLE_TRAFFIC_ENABLED", "false").strip().lower() != "true"
            or not key or budget <= 0 or not regions or region_id not in regions
            or not network_id or not -5 <= age <= 60):
        return {}
    key_identity = hashlib.sha256(key.encode()).digest()
    out = {}

    async def snapshot():
        attempts = 0
        deadline = time.monotonic() + SNAPSHOT_DEADLINE_SECONDS
        for edge in edges or []:
            if time.monotonic() >= deadline:
                break
            canonical = _canonical(edge)
            if canonical is None:
                continue
            edge_id, a, b, length = canonical
            cache_key = (region_id, network_id, key_identity, edge_id, a, b, length)
            leader = False
            with _LOCK:
                now = time.monotonic()
                # Bound memory, including expired entries never requested again.
                for stale in [k for k, (expiry, _) in _CACHE.items() if expiry <= now]:
                    del _CACHE[stale]
                cached = _CACHE.get(cache_key)
                if cached is not None:
                    _CACHE.move_to_end(cache_key)
                    if cached[1] is not None:
                        out[edge_id] = deepcopy(cached[1])
                    continue
                if allow_live_fetch is not True:
                    continue
                pending = _INFLIGHT.get(cache_key)
                if pending is None:
                    while _ATTEMPTS and _ATTEMPTS[0] <= now - 60:
                        _ATTEMPTS.popleft()
                    if (attempts >= MAX_REQUESTS_PER_SNAPSHOT or len(_ATTEMPTS) >= budget
                            or len(_INFLIGHT) >= MAX_INFLIGHT):
                        continue
                    _ATTEMPTS.append(now)  # Count attempts before I/O, even failures.
                    attempts += 1
                    pending = Future()
                    _INFLIGHT[cache_key] = pending
                    leader = True
            if not leader:
                result = await asyncio.shield(asyncio.wrap_future(pending))
                if result is not None:
                    out[edge_id] = deepcopy(result)
                continue
            result = None
            try:
                body = {
                    "origin": {"location": {"latLng": {"latitude": a[0], "longitude": a[1]}}},
                    "destination": {"location": {"latLng": {"latitude": b[0], "longitude": b[1]}}},
                    "travelMode": "DRIVE",
                    "routingPreference": "TRAFFIC_AWARE",
                    "polylineQuality": "HIGH_QUALITY",
                    "polylineEncoding": "GEO_JSON_LINESTRING",
                    "computeAlternativeRoutes": False,
                }
                # Default departure is now, not a potentially past caller timestamp.
                async with httpx.AsyncClient(timeout=1.5, trust_env=False) as client:
                    response = await client.post(URL, json=body, headers={
                        "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK,
                    })
                    response.raise_for_status()
                    result = _verified_estimate(response.json(), canonical)
            except (httpx.HTTPError, ValueError, TypeError, OverflowError):
                pass  # Fail closed without logging payloads, URLs, or credentials.
            finally:
                with _LOCK:
                    ttl = TTL_SECONDS if result is not None else NEGATIVE_TTL_SECONDS
                    _CACHE[cache_key] = (time.monotonic() + ttl, result)
                    _CACHE.move_to_end(cache_key)
                    while len(_CACHE) > MAX_CACHE_ENTRIES:
                        _CACHE.popitem(last=False)
                    _INFLIGHT.pop(cache_key, None)
                    pending.set_result(result)
            if result is not None:
                out[edge_id] = deepcopy(result)

    try:
        await asyncio.wait_for(snapshot(), timeout=SNAPSHOT_DEADLINE_SECONDS)
    except asyncio.TimeoutError:
        pass
    return out
