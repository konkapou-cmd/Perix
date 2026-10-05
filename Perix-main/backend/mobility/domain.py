"""Canonical Mobility domain (Mobility Core V2 - Phase 1).

Entities: Network, Route, Pattern, PhysicalStop, Platform, TripTemplate,
TripInstance - all derived from the active network document for now.
Storage migrates to dedicated collections in a later phase; the rest of
Perix must consume ONLY the outputs of this module (via the /mobility/v2
API), so future GPS devices, phone trackers and manual networks never
touch V1 internals.
"""
import hashlib
import math
import re
from datetime import datetime, timedelta
from typing import List, Optional
from zoneinfo import ZoneInfo

NETWORK_ID = "magdeburg_mvb"
NETWORK_TIMEZONE = "Europe/Berlin"
NETWORK_COUNTRY = "DE"
SERVICE_DAY_START_HOUR = 4

_DOMAIN_CACHE: dict = {"version_id": None, "data": None}


def _haversine_km(lat1, lng1, lat2, lng2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _hhmm_to_sec(value) -> Optional[int]:
    try:
        h, m = str(value).split(":")
        h = int(h)
        if h < SERVICE_DAY_START_HOUR:
            h += 24
        return h * 3600 + int(m) * 60
    except Exception:
        return None


def _pattern_key(trip: dict) -> str:
    return str(
        trip.get("shape_id")
        or f"{trip.get('headsign') or ''}:{'>'.join(str(x) for x in (trip.get('stop_ids') or []))}"
    )


def _pattern_id(route_number: str, key: str) -> str:
    h = hashlib.sha1(key.encode("utf-8")).hexdigest()[:10]
    return f"{route_number}:{h}"


def _service_date(network: dict) -> str:
    name = str(network.get("name") or "")
    m = re.search(r"(\d{4}-\d{2}-\d{2})", name)
    if m:
        return m.group(1)
    imported = str(network.get("imported_at") or "")
    if imported:
        try:
            dt = datetime.fromisoformat(imported).astimezone(ZoneInfo(NETWORK_TIMEZONE))
            if dt.hour < SERVICE_DAY_START_HOUR:
                dt = dt - timedelta(days=1)
            return dt.date().isoformat()
        except Exception:
            pass
    return datetime.now(ZoneInfo(NETWORK_TIMEZONE)).date().isoformat()


def _physical_stops(network: dict) -> List[dict]:
    """Group raw GTFS platforms into physical stops (parent_station, or
    same name within 80m - same-name stops far apart never merge)."""
    groups: dict = {}
    for route in network.get("routes", []):
        mode = route.get("mode") if route.get("mode") in ("bus", "tram") else "bus"
        rn = str(route.get("route_number"))
        directions = {
            str(t.get("headsign") or "")
            for t in (route.get("trips") or [])
            if t.get("headsign")
        }
        for s in route.get("stops", []):
            sid = str(s.get("stop_id") or "")
            if not sid or s.get("lat") is None or s.get("lng") is None:
                continue
            parent = s.get("parent_station")
            key = f"p:{parent}" if parent else f"n:{str(s.get('name')).strip().lower()}"
            if not parent:
                for gkey, g in groups.items():
                    if not gkey.startswith("n:"):
                        continue
                    if str(g.get("name") or "").strip().lower() != str(s.get("name")).strip().lower():
                        continue
                    if _haversine_km(g.get("latitude"), g.get("longitude"), s.get("lat"), s.get("lng")) < 0.08:
                        key = gkey
                        break
            g = groups.get(key)
            if not g:
                g = {
                    "stop_id": f"physical:{key[2:]}",
                    "stop_ids": [],
                    "platforms": {},
                    "name": str(s.get("name") or "").strip(),
                    "latitude": s.get("lat"),
                    "longitude": s.get("lng"),
                    "modes": set(),
                    "routes": {},
                }
                groups[key] = g
            if sid not in g["stop_ids"]:
                g["stop_ids"].append(sid)
            g["modes"].add(mode)
            plat = g["platforms"].setdefault(
                sid,
                {
                    "platform_id": sid,
                    "latitude": s.get("lat"),
                    "longitude": s.get("lng"),
                    "name": str(s.get("name") or "").strip(),
                    "platform_code": s.get("platform_code"),
                    "directions": set(),
                },
            )
            plat["directions"] |= directions
            entry = g["routes"].setdefault(rn, {"route_number": rn, "mode": mode, "directions": set()})
            entry["directions"] |= directions
    out = []
    for g in groups.values():
        out.append(
            {
                "stop_id": g["stop_id"],
                "stop_ids": g["stop_ids"],
                "platforms": [
                    {
                        "platform_id": p["platform_id"],
                        "latitude": p["latitude"],
                        "longitude": p["longitude"],
                        "name": p["name"],
                        "platform_code": p.get("platform_code"),
                        "directions": sorted(d for d in p["directions"] if d),
                    }
                    for p in g["platforms"].values()
                ],
                "name": g["name"],
                "latitude": g["latitude"],
                "longitude": g["longitude"],
                "modes": sorted(g["modes"]),
                "routes": [
                    {
                        "route_number": r["route_number"],
                        "mode": r["mode"],
                        "directions": sorted(d for d in r["directions"] if d),
                    }
                    for r in sorted(g["routes"].values(), key=lambda x: (x["mode"] != "tram", x["route_number"]))
                ],
            }
        )
    return out


def build_domain(network_doc: dict, network_id: str = NETWORK_ID) -> dict:
    """Derive the full canonical domain from an active network document."""
    version_id = str(network_doc.get("version_id") or "")
    if _DOMAIN_CACHE.get("version_id") == version_id and _DOMAIN_CACHE.get("data") is not None:
        return _DOMAIN_CACHE["data"]
    service_date = _service_date(network_doc)

    routes = []
    patterns = []
    trip_templates = []
    for route in network_doc.get("routes", []):
        rn = str(route.get("route_number"))
        mode = route.get("mode") if route.get("mode") in ("bus", "tram") else "bus"
        stop_by_id = {str(s.get("stop_id")): s for s in route.get("stops", []) if s.get("stop_id") is not None}
        route_id = f"route:{rn}"
        pattern_map: dict = {}
        pattern_ids = []
        for trip in route.get("trips", []):
            key = _pattern_key(trip)
            pat = pattern_map.get(key)
            if not pat:
                stop_ids = [str(x) for x in (trip.get("stop_ids") or [])]
                shape_id = trip.get("shape_id")
                points = []
                shapes = route.get("shapes") or {}
                if shape_id and isinstance(shapes.get(shape_id), list) and len(shapes[shape_id]) > 2:
                    points = [[float(p[0]), float(p[1])] for p in shapes[shape_id]]
                elif isinstance(route.get("shape"), list) and len(route["shape"]) > 2:
                    points = [[float(p[0]), float(p[1])] for p in route["shape"]]
                else:
                    points = [
                        [float(stop_by_id.get(sid, {}).get("lat")), float(stop_by_id.get(sid, {}).get("lng"))]
                        for sid in stop_ids
                        if sid in stop_by_id
                    ]
                pat = {
                    "pattern_id": _pattern_id(rn, key),
                    "route_id": route_id,
                    "route_number": rn,
                    "mode": mode,
                    "direction": str(trip.get("headsign") or ""),
                    "stop_ids": stop_ids,
                    "shape_id": shape_id,
                    "points": points,
                }
                pattern_map[key] = pat
                pattern_ids.append(pat["pattern_id"])
                patterns.append(pat)
            trip_templates.append(
                {
                    "trip_id": str(trip.get("trip_id") or ""),
                    "trip_instance_id": f"{network_id}:{service_date}:{trip.get('trip_id')}",
                    "route_id": route_id,
                    "route_number": rn,
                    "mode": mode,
                    "headsign": trip.get("headsign"),
                    "pattern_id": pattern_map[key]["pattern_id"],
                    "start": _hhmm_to_sec(trip.get("start")),
                    "end": _hhmm_to_sec(trip.get("end")),
                    "stop_ids": [str(x) for x in (trip.get("stop_ids") or [])],
                    "shape_id": trip.get("shape_id"),
                }
            )
        routes.append(
            {
                "route_id": route_id,
                "number": rn,
                "name": route.get("name") or rn,
                "mode": mode,
                "pattern_ids": pattern_ids,
            }
        )

    data = {
        "network": {
            "network_id": network_id,
            "name": network_doc.get("name") or network_id,
            "version_id": version_id,
            "service_date": service_date,
            "timezone": NETWORK_TIMEZONE,
            "country": NETWORK_COUNTRY,
        },
        "routes": routes,
        "patterns": patterns,
        "stops": _physical_stops(network_doc),
        "trip_templates": trip_templates,
    }
    _DOMAIN_CACHE["version_id"] = version_id
    _DOMAIN_CACHE["data"] = data
    return data
