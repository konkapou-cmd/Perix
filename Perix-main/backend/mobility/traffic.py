"""TomTom Traffic Incidents adapter (Orbis Maps v2).

Fetches live traffic incidents around the active network's area and maps
them into the canonical restriction model:
- roadClosed  -> road_closed  (blocked: car, taxi, bus; trams unaffected)
- laneClosed / accident / jam / roadWorks -> informational incidents
  (stored, exposed via /v2/traffic)

The restriction documents carry source=TOMTOM_TRAFFIC and are refreshed
every poll (stale ones removed), so closures always reflect reality.
"""
import asyncio
import math
import os
from typing import List, Optional

import httpx

TOMTOM_KEY = os.getenv("TOMTOM_API_KEY", "")
INCIDENTS_URL = "https://api.tomtom.com/maps/orbis/traffic/incidents/details"

# Magdeburg area (minLon, minLat, maxLon, maxLat)
MAGDEBURG_BBOX = "11.45,52.00,11.80,52.25"

ATTRIBUTES = (
    "incidents(type,geometry(type,coordinates),properties(id,iconCategory,"
    "magnitudeOfDelay,startTime,endTime,from,to,lengthInMeters,delayInSeconds,"
    "roadNumbers,events(description,code,iconCategory),probabilityOfOccurrence))"
)


async def fetch_incidents(bbox: str = MAGDEBURG_BBOX) -> List[dict]:
    if not TOMTOM_KEY:
        return []
    params = {
        "apiVersion": "2",
        "bbox": bbox,
        "timeValidity": "present",
        "key": TOMTOM_KEY,
    }
    headers = {
        "TomTom-Api-Key": TOMTOM_KEY,
        "Attributes": ATTRIBUTES,
        "Accept": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(INCIDENTS_URL, params=params, headers=headers)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        print(f"[mobility] tomtom fetch failed: {type(e).__name__}: {e}", flush=True)
        return []
    return data.get("incidents") or []


MAGDEBURG_ROAD_BBOX = (52.00, 11.45, 52.25, 11.80)
MATCH_MAX_ERROR_M = 20.0
MATCH_MIN_COVERAGE = 0.6

_WAYS_CACHE = {"at": 0.0, "ways": []}


async def _city_road_ways() -> List[dict]:
    """The Perix OSM road graph for Magdeburg (cached an hour). Closures
    map-match against THIS network - the same one buses route on - so a
    red line and a blocked edge always mean the exact same road."""
    import time

    now = time.monotonic()
    if _WAYS_CACHE["ways"] and now - _WAYS_CACHE["at"] < 3600:
        return _WAYS_CACHE["ways"]
    try:
        from mobility.roads import _fetch_ways_detailed

        ways = await _fetch_ways_detailed(MAGDEBURG_ROAD_BBOX, "bus")
        if ways:
            _WAYS_CACHE["at"] = now
            _WAYS_CACHE["ways"] = ways
    except Exception as e:
        print(f"[mobility] tomtom: city road fetch failed: {type(e).__name__}: {e}", flush=True)
    return _WAYS_CACHE["ways"]


def _snap_points_to_roads(raw_geom: List[list], ways: List[dict]) -> dict:
    """Project every TomTom point onto the nearest OSM road way.

    Returns {geometry, way_ids, max_error_m, coverage} or None when the
    closure does not sit on our road network (max error > 20m)."""
    if not raw_geom or not ways:
        return None
    # Precompute per-way bbox for fast rejection
    way_boxes = []
    for w in ways:
        pts = w["points"]
        lats = [p[0] for p in pts]
        lngs = [p[1] for p in pts]
        way_boxes.append((min(lats), max(lats), min(lngs), max(lngs)))
    projected = []
    matched_way_ids = set()
    errors = []
    for (lat, lng) in raw_geom:
        best = None  # (dist, px, py, way_id)
        for wi, w in enumerate(ways):
            smin, smax, wmin, wmax = way_boxes[wi]
            if lat < smin - 0.002 or lat > smax + 0.002 or lng < wmin - 0.002 or lng > wmax + 0.002:
                continue
            pts = w["points"]
            for i in range(len(pts) - 1):
                x0, y0 = pts[i]
                x1, y1 = pts[i + 1]
                dx, dy = x1 - x0, y1 - y0
                denom = dx * dx + dy * dy
                t = 0.0 if denom == 0 else max(0.0, min(1.0, ((lat - x0) * dx + (lng - y0) * dy) / denom))
                px, py = x0 + t * dx, y0 + t * dy
                d = _haversine_m(lat, lng, px, py)
                if best is None or d < best[0]:
                    best = (d, px, py, w.get("id"))
        if best is None:
            errors.append(999.0)
            continue
        d, px, py, wid = best
        errors.append(d)
        projected.append((px, py))
        if wid:
            matched_way_ids.add(wid)
    if not projected:
        return None
    max_error = max(errors)
    within = sum(1 for e in errors if e <= MATCH_MAX_ERROR_M)
    coverage = within / max(1, len(errors))
    if max_error > MATCH_MAX_ERROR_M or coverage < MATCH_MIN_COVERAGE:
        return None
    # Dedupe consecutive duplicates and build the snapped line
    geom = []
    for px, py in projected:
        if not geom or _haversine_m(geom[-1][0], geom[-1][1], px, py) > 2.0:
            geom.append([round(px, 6), round(py, 6)])
    if len(geom) < 2:
        return None
    return {
        "geometry": geom,
        "way_ids": sorted(matched_way_ids),
        "max_error_m": round(max_error, 1),
        "coverage": round(coverage, 3),
    }


def _haversine_m(lat1, lng1, lat2, lng2) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _incident_geometry(incident: dict, max_points: int = 60) -> List[list]:
    geom = incident.get("geometry") or {}
    coords = geom.get("coordinates") or []
    stride = max(1, math.ceil(len(coords) / max_points)) if coords else 1
    out = []
    for i in range(0, len(coords), stride):
        c = coords[i]
        try:
            lat, lng = float(c[1]), float(c[0])
        except (TypeError, ValueError, IndexError):
            continue
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            continue
        out.append([round(lat, 6), round(lng, 6)])
    return out


async def sync_tomtom_restrictions() -> dict:
    """Upsert live TomTom restrictions; remove stale TomTom ones.

    Every roadClosed incident is map-matched onto the Perix OSM road
    graph: raw TomTom geometry is kept, but the canonical closure line
    follows OUR road centerlines and blocks the EXACT matched OSM edges
    (never parallel streets by proximity). Unmatched incidents stay
    informational only - they never block routing."""
    from database import db

    incidents = await fetch_incidents()
    seen_keys = set()
    created = 0
    verified = 0
    informational = []
    ways = await _city_road_ways() if any(
        (i.get("properties") or {}).get("iconCategory") == "roadClosed" for i in incidents
    ) else []
    for inc in incidents:
        props = inc.get("properties") or {}
        inc_id = str(props.get("id") or "")
        if not inc_id:
            continue
        category = str(props.get("iconCategory") or "unknown")
        geom = _incident_geometry(inc)
        events = props.get("events") or []
        description = "; ".join(e.get("description") or "" for e in events) if events else ""
        from_str = props.get("from") or ""
        to_str = props.get("to") or ""
        import hashlib

        # Feed ids can repeat across incidents - make the key unique per
        # closure location.
        rid = f"tomtom:{inc_id}:{hashlib.sha1(f'{from_str}|{to_str}|{category}'.encode('utf-8')).hexdigest()[:10]}"
        seen_keys.add(rid)
        if category == "roadClosed":
            match = _snap_points_to_roads(geom, ways) if (geom and len(geom) >= 2) else None
            if match:
                doc = {
                    "restriction_id": rid,
                    "kind": "road_closed",
                    "geometry": match["geometry"],
                    "raw_geometry": geom,
                    "geometry_source": "OSM_MATCHED_TOMTOM",
                    "match_confidence": match["coverage"],
                    "max_match_error_m": match["max_error_m"],
                    "blocked_way_ids": match["way_ids"],
                    "verified": True,
                    "blocked_modes": ["car", "taxi", "bus"],
                    "allowed_modes": ["tram"],
                    "route_numbers": [],
                    "direction": "both",
                    "valid_from": props.get("startTime"),
                    "valid_until": props.get("endTime"),
                    "source": "TOMTOM_TRAFFIC",
                    "road_numbers": props.get("roadNumbers") or [],
                    "from": from_str,
                    "to": to_str,
                    "description": description,
                    "updated_at": props.get("startTime") or "",
                }
                verified += 1
            else:
                # Not matched to our road network: informational only.
                doc = {
                    "restriction_id": rid,
                    "kind": "road_closed",
                    "geometry": geom or [],
                    "raw_geometry": geom or [],
                    "geometry_source": "TOMTOM_TRAFFIC_RAW",
                    "verified": False,
                    "blocked_way_ids": [],
                    "blocked_modes": ["car", "taxi", "bus"],
                    "allowed_modes": ["tram"],
                    "route_numbers": [],
                    "direction": "both",
                    "valid_from": props.get("startTime"),
                    "valid_until": props.get("endTime"),
                    "source": "TOMTOM_TRAFFIC",
                    "road_numbers": props.get("roadNumbers") or [],
                    "from": from_str,
                    "to": to_str,
                    "description": description,
                    "updated_at": props.get("startTime") or "",
                }
            if geom:
                await db.mobility_restrictions.replace_one(
                    {"restriction_id": doc["restriction_id"]}, doc, upsert=True
                )
                created += 1
        else:
            informational.append(
                {
                    "id": inc_id,
                    "category": category,
                    "from": from_str,
                    "to": to_str,
                    "description": description,
                    "length_m": props.get("lengthInMeters"),
                    "delay_s": props.get("delayInSeconds"),
                    "geometry": geom or [],
                    "start_time": props.get("startTime"),
                    "end_time": props.get("endTime"),
                }
            )
    if seen_keys:
        await db.mobility_restrictions.delete_many(
            {"source": "TOMTOM_TRAFFIC", "restriction_id": {"$nin": list(seen_keys)}}
        )
    if informational:
        from routes.mobility import _berlin_now

        await db.mobility_traffic_incidents.replace_one(
            {"key": "current"},
            {"key": "current", "incidents": informational, "updated_at": _berlin_now().isoformat()},
            upsert=True,
        )
    return {"closures": created, "verified": verified, "informational": len(informational)}


async def traffic_worker():
    """Poll TomTom every 5 minutes and keep the restriction overlay fresh.

    Note: no geometry invalidation here. Closures are an informational
    overlay on top of the resolved lines (the resolver does not route
    around them yet), and invalidating would evict the geometry cache
    every cycle - making lines/vehicles flicker for minutes."""
    while True:
        try:
            res = await sync_tomtom_restrictions()
            if res.get("closures") or res.get("informational"):
                print(
                    f"[mobility] tomtom: {res['closures']} closures ({res.get('verified', 0)} OSM-matched), "
                    f"{res['informational']} informational incidents",
                    flush=True,
                )
        except Exception as e:
            print(f"[mobility] tomtom worker error: {type(e).__name__}: {e}", flush=True)
        await asyncio.sleep(300)
