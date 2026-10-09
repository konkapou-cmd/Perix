"""TomTom Traffic Incidents adapter (Orbis Maps v2).

Our map is authoritative. TomTom contributes ONLY the STREET NAMES of a
closure - we look the names up on our own OSM road graph and block those
exact ways:
- roadClosed + street name found      -> verified closure (car/taxi/bus
  blocked, trams unaffected), canonical geometry = OUR road.
- roadClosed but name not on our map  -> informational only (never blocks).
- laneClosed / jam / roadWorks        -> informational incidents.

Refreshed every poll (stale closures removed)."""
import asyncio
import hashlib
import math
import os
import re
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

_WAYS_CACHE = {"at": 0.0, "ways": []}

_STREET_STOPWORDS = {
    "straße", "strasse", "str", "st", "weg", "allee", "platz", "ring",
    "chaussee", "damm", "gasse", "ufer", "brücke", "bruecke", "tor",
}


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


async def _city_road_ways() -> List[dict]:
    """The Perix OSM road graph for Magdeburg - in-memory cache, persisted
    to the database so a restart or an Overpass outage never zeroes the
    name matching (last-known-good ways are always available). The city is
    fetched in quadrant queries: a single city-wide way query times out on
    busy Overpass days, small ones still succeed."""
    import time

    now = time.monotonic()
    if _WAYS_CACHE["ways"] and now - _WAYS_CACHE["at"] < 3600:
        return _WAYS_CACHE["ways"]
    from database import db

    stored = await db.mobility_osm_roads.find_one({"key": "magdeburg_roads"}, {"_id": 0})
    if stored and stored.get("ways"):
        _WAYS_CACHE["ways"] = stored["ways"]
        age = now - float(stored.get("at") or 0)
        if age < 24 * 3600:
            _WAYS_CACHE["at"] = stored.get("at") or now
            return _WAYS_CACHE["ways"]
    try:
        from mobility.roads import _fetch_ways_detailed

        quadrants = [
            (52.00, 11.45, 52.125, 11.625),
            (52.00, 11.625, 52.125, 11.80),
            (52.125, 11.45, 52.25, 11.625),
            (52.125, 11.625, 52.25, 11.80),
        ]
        ways_by_id = {}
        for bbox in quadrants:
            try:
                part = await _fetch_ways_detailed(bbox, "bus", with_names=True)
                for w in part:
                    ways_by_id[int(w.get("id") or 0)] = w
            except Exception as e:
                print(f"[mobility] tomtom: quadrant fetch failed {bbox}: {type(e).__name__}", flush=True)
        if ways_by_id:
            ways = list(ways_by_id.values())
            _WAYS_CACHE["at"] = now
            _WAYS_CACHE["ways"] = ways
            try:
                await db.mobility_osm_roads.replace_one(
                    {"key": "magdeburg_roads"},
                    {"key": "magdeburg_roads", "at": now, "ways": ways},
                    upsert=True,
                )
            except Exception as e:
                print(f"[mobility] tomtom: osm roads persist failed: {type(e).__name__}: {e}", flush=True)
    except Exception as e:
        print(f"[mobility] tomtom: city road fetch failed: {type(e).__name__}: {e}", flush=True)
    return _WAYS_CACHE["ways"]


def _haversine_m(lat1, lng1, lat2, lng2) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _name_tokens(text) -> set:
    out = set()
    for part in re.split(r"[/|,;]+", text or ""):
        for word in re.findall(r"[A-Za-zÄÖÜäöüß]{3,}", part):
            w = word.lower()
            if w not in _STREET_STOPWORDS:
                out.add(w)
    return out


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


def _match_by_street_name(from_str: str, to_str: str, area: List[list], ways: List[dict]) -> Optional[dict]:
    """Block by STREET NAME - the TomTom names are authoritative.

    A closure reported for 'Halberstädter Straße' blocks Halberstädter
    Straße, never the parallel Carl-Miller-Straße, no matter how offset
    the provider geometry is. Only ways whose name matches AND that sit
    near the incident area are taken."""
    target = _name_tokens(from_str) | _name_tokens(to_str)
    if not target or not area:
        return None
    lats = [p[0] for p in area]
    lngs = [p[1] for p in area]
    slat, nlat = min(lats) - 0.008, max(lats) + 0.008
    wlng, elng = min(lngs) - 0.008, max(lngs) + 0.008
    sample = area[::3] if len(area) > 3 else area
    matched_ways = []
    for w in ways:
        wtokens = _name_tokens(w.get("name"))
        if not (wtokens & target):
            continue
        pts = w.get("points") or []
        if not pts:
            continue
        wlats = [p[0] for p in pts]
        wlngs = [p[1] for p in pts]
        if max(wlats) < slat or min(wlats) > nlat or max(wlngs) < wlng or min(wlngs) > elng:
            continue
        if not any(_haversine_m(p[0], p[1], rp[0], rp[1]) < 80.0 for p in pts for rp in sample):
            continue
        matched_ways.append(w)
    if not matched_ways:
        return None
    geom = []
    for w in matched_ways:
        for p in w["points"]:
            if not geom or _haversine_m(geom[-1][0], geom[-1][1], p[0], p[1]) > 2.0:
                geom.append([round(p[0], 6), round(p[1], 6)])
    if len(geom) < 2:
        return None
    return {
        "geometry": geom,
        "way_ids": sorted({int(w.get("id") or 0) for w in matched_ways if w.get("id")}),
    }


async def sync_tomtom_restrictions() -> dict:
    """Upsert live TomTom restrictions; remove stale TomTom ones."""
    from database import db

    incidents = await fetch_incidents()
    seen_keys = set()
    created = 0
    verified = 0
    verified_docs = []
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

        # Feed ids can repeat across incidents - make the key unique per
        # closure location.
        rid = f"tomtom:{inc_id}:{hashlib.sha1(f'{from_str}|{to_str}|{category}'.encode('utf-8')).hexdigest()[:10]}"
        seen_keys.add(rid)
        if category == "roadClosed":
            match = _match_by_street_name(from_str, to_str, geom, ways) if len(geom) >= 2 else None
            if match:
                doc = {
                    "restriction_id": rid,
                    "kind": "road_closed",
                    "geometry": match["geometry"],
                    "geometry_source": "OSM_NAMED_TOMTOM",
                    "blocked_way_ids": match["way_ids"],
                    "verified": True,
                    "blocked_modes": ["car", "taxi", "bus"],
                    "allowed_modes": ["tram"],
                    "route_numbers": [],
                    "direction": "both",
                    "valid_from": props.get("startTime"),
                    "valid_until": props.get("endTime"),
                    "source": "TOMTOM_TRAFFIC",
                    "from": from_str,
                    "to": to_str,
                    "description": description,
                    "updated_at": props.get("startTime") or "",
                }
                verified += 1
                verified_docs.append(doc)
            else:
                # Street name not found on our map: informational only.
                doc = {
                    "restriction_id": rid,
                    "kind": "road_closed",
                    "geometry": geom or [],
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
    return {"closures": created, "verified": verified, "informational": len(informational), "restrictions": verified_docs}


_PREV_BLOCKED_SIG = None


async def traffic_worker():
    """Poll TomTom every 5 minutes and keep the restriction overlay fresh.

    When the set of blocked OSM ways actually CHANGES, the affected bus
    patterns are rebuilt (targeted, last-known-good) so closures move bus
    routes instead of just drawing a red overlay on top of them."""
    global _PREV_BLOCKED_SIG
    while True:
        try:
            res = await sync_tomtom_restrictions()
            if res.get("closures") or res.get("informational"):
                print(
                    f"[mobility] tomtom: {res['closures']} closures ({res.get('verified', 0)} named), "
                    f"{res['informational']} informational incidents",
                    flush=True,
                )
            new_sig = {
                str(r.get("restriction_id")): set(r.get("blocked_way_ids") or [])
                for r in (res.get("restrictions") or [])
            }
            if new_sig != _PREV_BLOCKED_SIG:
                docs = list(res.get("restrictions") or [])
                if docs:
                    try:
                        from mobility.restrictions import invalidate_geometries

                        union = []
                        for d in docs:
                            union.extend(d.get("geometry") or [])
                        if union:
                            await invalidate_geometries(
                                {
                                    "route_numbers": [],
                                    "geometry": union,
                                    "blocked_modes": ["bus", "car", "taxi"],
                                    "allowed_modes": ["tram"],
                                }
                            )
                            print("[mobility] tomtom: closure set changed - rebuilding affected bus patterns", flush=True)
                    except Exception as e:
                        print(f"[mobility] tomtom: invalidation failed: {type(e).__name__}: {e}", flush=True)
                _PREV_BLOCKED_SIG = new_sig
        except Exception as e:
            print(f"[mobility] tomtom worker error: {type(e).__name__}: {e}", flush=True)
        await asyncio.sleep(300)
