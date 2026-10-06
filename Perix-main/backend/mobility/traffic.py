"""TomTom Traffic Incidents adapter.

Fetches live traffic incidents around the active network's area and maps
them into the canonical restriction model:
- road closures  -> road_closed  (blocked: car, taxi, bus; trams unaffected)
- accidents/jams -> informational incidents (stored, exposed via /v2/alerts)

The restriction documents carry source=TOMTOM_TRAFFIC and are refreshed
every poll (stale ones removed), so closures always reflect reality.
"""
import asyncio
import os
from typing import List, Optional

import httpx

TOMTOM_KEY = os.getenv("TOMTOM_API_KEY", "")
INCIDENTS_URL = "https://api.tomtom.com/traffic/services/v5/incidentDetails"

# Incident icon categories we care about
ROAD_CLOSURE = 6
ACCIDENT = 1
JAM = 2
LANE_CLOSURE = 14

# Magdeburg area (west, south, east, north)
MAGDEBURG_BBOX = "11.45,52.00,11.80,52.25"


async def fetch_incidents(bbox: str = MAGDEBURG_BBOX) -> List[dict]:
    if not TOMTOM_KEY:
        return []
    params = {
        "bbox": bbox,
        "fields": "{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,startTime,endTime,from,to,length,delay,roadNumbers,events{description,code,iconCategory},acB{locationCode,type}}}}",
        "language": "en-GB",
        "categoryFilter": "0,1,2,6,14",
        "timeValidityFilter": "present",
        "key": TOMTOM_KEY,
    }
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(INCIDENTS_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        print(f"[mobility] tomtom fetch failed: {type(e).__name__}: {e}", flush=True)
        return []
    return (data.get("incidents") or [])


def _incident_geometry(incident: dict) -> List[list]:
    geom = incident.get("geometry") or {}
    coords = geom.get("coordinates") or []
    if geom.get("type") == "LineString":
        return [[float(c[1]), float(c[0])] for c in coords]
    if geom.get("type") == "Point":
        return [[float(coords[1]), float(coords[0])]]
    return []


def _iso_from_epoch(epoch) -> Optional[str]:
    if not epoch:
        return None
    from datetime import datetime, timezone

    return datetime.fromtimestamp(int(epoch), tz=timezone.utc).isoformat()


async def sync_tomtom_restrictions() -> dict:
    """Upsert live TomTom restrictions; remove stale TomTom ones."""
    from database import db

    incidents = await fetch_incidents()
    seen_ids = set()
    created = 0
    informational = []
    for inc in incidents:
        props = inc.get("properties") or {}
        inc_id = str(props.get("id") or "")
        if not inc_id:
            continue
        seen_ids.add(inc_id)
        category = int(props.get("iconCategory") or 0)
        geom = _incident_geometry(inc)
        events = props.get("events") or []
        description = "; ".join(e.get("description") or "" for e in events) if events else ""
        from_str = props.get("from") or ""
        to_str = props.get("to") or ""
        if category == ROAD_CLOSURE:
            doc = {
                "restriction_id": f"tomtom:{inc_id}",
                "kind": "road_closed",
                "geometry": geom or None,
                "blocked_modes": ["car", "taxi", "bus"],
                "allowed_modes": ["tram"],
                "route_numbers": [],
                "direction": "both",
                "valid_from": _iso_from_epoch(props.get("startTime")),
                "valid_until": _iso_from_epoch(props.get("endTime")),
                "source": "TOMTOM_TRAFFIC",
                "road_numbers": props.get("roadNumbers") or [],
                "from": from_str,
                "to": to_str,
                "description": description,
                "updated_at": _iso_from_epoch(props.get("startTime")) or "",
            }
            if geom:
                await db.mobility_restrictions.replace_one(
                    {"restriction_id": doc["restriction_id"]}, doc, upsert=True
                )
                created += 1
        elif category in (ACCIDENT, JAM, LANE_CLOSURE):
            informational.append(
                {
                    "id": inc_id,
                    "category": {ACCIDENT: "accident", JAM: "jam", LANE_CLOSURE: "lane_closure"}.get(category, str(category)),
                    "from": from_str,
                    "to": to_str,
                    "description": description,
                    "length_m": props.get("length"),
                    "delay_s": props.get("delay"),
                    "geometry": geom or [],
                    "start_time": _iso_from_epoch(props.get("startTime")),
                    "end_time": _iso_from_epoch(props.get("endTime")),
                }
            )
    # Remove TomTom restrictions that disappeared from the feed
    if seen_ids:
        await db.mobility_restrictions.delete_many(
            {"source": "TOMTOM_TRAFFIC", "restriction_id": {"$nin": [f"tomtom:{i}" for i in seen_ids]}}
        )
    # Store informational incidents for the alerts surface
    if informational:
        from routes.mobility import _berlin_now

        await db.mobility_traffic_incidents.replace_one(
            {"key": "current"},
            {"key": "current", "incidents": informational, "updated_at": _berlin_now().isoformat()},
            upsert=True,
        )
    return {"closures": created, "informational": len(informational)}


async def traffic_worker():
    """Poll TomTom every 5 minutes and keep the restriction overlay fresh."""
    while True:
        try:
            res = await sync_tomtom_restrictions()
            if res.get("closures") or res.get("informational"):
                print(
                    f"[mobility] tomtom: {res['closures']} closures, {res['informational']} informational incidents",
                    flush=True,
                )
                if res.get("closures"):
                    from mobility.restrictions import invalidate_geometries

                    await invalidate_geometries({"route_numbers": []})
        except Exception as e:
            print(f"[mobility] tomtom worker error: {type(e).__name__}: {e}", flush=True)
        await asyncio.sleep(300)
