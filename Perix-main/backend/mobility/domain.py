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
from datetime import datetime
from typing import List, Optional
from zoneinfo import ZoneInfo

from mobility.regions import get_active_region

_ACTIVE_REGION = get_active_region()
NETWORK_ID = _ACTIVE_REGION.network_id
NETWORK_TIMEZONE = _ACTIVE_REGION.timezone
NETWORK_COUNTRY = _ACTIVE_REGION.country
SERVICE_DAY_START_HOUR = _ACTIVE_REGION.service_day_start_hour

_DOMAIN_CACHE: dict = {}


def _haversine_km(lat1, lng1, lat2, lng2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _hhmm_to_sec(value) -> Optional[int]:
    from mobility.realtime_trip_identity import _time_seconds
    return _time_seconds(value)


def _pattern_key(trip: dict) -> str:
    # A reusable shape is not a direction identity. Retain the existing
    # shapeless IDs, but bind shaped trips to their ordered platform sequence.
    ordered = f"{trip.get('headsign') or ''}:{'>'.join(str(x) for x in (trip.get('stop_ids') or []))}"
    return f"shape:{trip['shape_id']}:{ordered}" if trip.get('shape_id') else ordered


def pattern_source_for_trip(route: dict, trip: dict) -> dict:
    """The line's directed source definition; not a marker-selected geometry."""
    shape_id = trip.get('shape_id')
    shapes = route.get('shapes') or {}
    hint = shapes.get(shape_id) if shape_id else None
    if not isinstance(hint, list) or len(hint) < 3:
        hint = route.get('shape')
    return dict(route_number=str(route.get('route_number')),
        mode=route.get('mode') if route.get('mode') in (
            'bus', 'tram', 'trolleybus', 'subway', 's-bahn', 'rail', 'ferry') else 'bus',
        direction=str(trip.get('headsign') or ''), stop_ids=[str(x) for x in trip.get('stop_ids') or []],
        shape_id=shape_id, points=[[float(p[0]),float(p[1])] for p in hint] if isinstance(hint,list) and len(hint)>2 else [])


def _direction_inputs_fingerprint(network):
    import json
    inputs=[]
    for route in network.get('routes') or []:
        definitions={};bindings=[]
        for trip in route.get('trips') or []:
            key=_pattern_key(trip)
            bindings.append([str(trip.get('trip_id') or ''),key])
            if key not in definitions:definitions[key]=pattern_source_for_trip(route,trip)
        inputs.append([route.get('route_number'),route.get('mode'),bindings,definitions,
            [[s.get('stop_id'),s.get('lat'),s.get('lng')] for s in route.get('stops') or []]])
    return hashlib.sha256(json.dumps(inputs,sort_keys=True,separators=(',',':'),default=str).encode()).hexdigest()


def _stop_catalogue_fingerprint(network):
    """Label/grouping cache input, deliberately separate from route geometry."""
    import json
    fields = ('stop_id', 'name', 'parent_station', 'platform_code', 'location_type', 'lat', 'lng')
    inputs = [[r.get('route_number'), r.get('mode'),
               [[s.get(field) for field in fields] for s in r.get('stops') or []]]
              for r in network.get('routes') or []]
    inputs.append(['stop_catalogue', network.get('stop_catalogue') or []])
    return hashlib.sha256(json.dumps(inputs, sort_keys=True, separators=(',', ':'), default=str).encode()).hexdigest()


def _pattern_id(route_number: str, key: str) -> str:
    h = hashlib.sha1(key.encode("utf-8")).hexdigest()[:10]
    return f"{route_number}:{h}"


def _service_date(network: dict) -> str:
    if network.get("service_date"):
        return str(network["service_date"])
    name = str(network.get("name") or "")
    m = re.search(r"(\d{4}-\d{2}-\d{2})", name)
    if m:
        return m.group(1)
    imported = str(network.get("imported_at") or "")
    if imported:
        try:
            dt = datetime.fromisoformat(imported).astimezone(ZoneInfo(NETWORK_TIMEZONE))
            return dt.date().isoformat()
        except Exception:
            pass
    return datetime.now(ZoneInfo(NETWORK_TIMEZONE)).date().isoformat()


def _stop_name_key(value) -> str:
    """Comparison only: preserve the provider's display name and punctuation."""
    import unicodedata
    return unicodedata.normalize('NFC', ' '.join(str(value or '').split())).casefold()


def _physical_stop_group_key(groups: dict, platform_groups: dict, stop: dict) -> str:
    """Same provider platform first, then parent, then same-name/80 m fallback.

    Preserve existing ordinary IDs. Only a genuinely distant name collision
    receives a platform-qualified key; a failed proximity lookup is not a match.
    """
    sid = str(stop.get('stop_id') or '')
    if sid in platform_groups:
        return platform_groups[sid]
    parent = stop.get('parent_station')
    if parent:
        return f'p:{parent}'
    name = _stop_name_key(stop.get('name'))
    key = f"n:{str(stop.get('name') or '').strip().lower()}" if name else f'n:unnamed:{sid}'
    if name:
        for gkey, group in groups.items():
            if (gkey.startswith('n:') and _stop_name_key(group.get('name')) == name
                    and _haversine_km(group['latitude'], group['longitude'], stop['lat'], stop['lng']) < 0.08):
                return gkey
    if key in groups:
        key += f':platform:{sid}'
    return key


def _physical_catalogue_routes(network):
    routes = list(network.get('routes') or [])
    for mode in ('bus', 'tram', 'trolleybus'):
        routes.append(dict(mode=mode, route_number='', trips=[], stops=[
            s for s in network.get('stop_catalogue') or [] if mode in (s.get('modes') or [])]))
    return routes


def _stop_kind_for(modes: set, region_id: str) -> str:
    """Map a physical stop's modes to the region's stop artwork kind."""
    if region_id == "berlin":
        if "subway" in modes:
            return "berlin_u_bahn_stop"
        if "s-bahn" in modes:
            return "berlin_s_bahn_stop"
        return "bus_stop"
    if region_id == "attica":
        if "subway" in modes:
            return "athens_metro_stop"
        if "s-bahn" in modes or "rail" in modes:
            return "athens_isap_stop"
        if "bus" in modes or "trolleybus" in modes:
            return "athens_bus_stop"
        return "bus_stop"
    return "bus_stop"


def _physical_stops(network: dict) -> List[dict]:
    """Group raw GTFS platforms into physical stops (parent_station, or
    same name within 80m - same-name stops far apart never merge)."""
    groups: dict = {}
    platform_groups: dict = {}
    for route in _physical_catalogue_routes(network):
        mode = (
            route.get("mode")
            if route.get("mode") in (
                "bus", "tram", "trolleybus", "subway", "s-bahn", "rail", "ferry"
            )
            else "bus"
        )
        rn = str(route.get("route_number"))
        # stop_id -> set of headsigns of trips that REALLY stop there:
        # a platform must never inherit directions of trips that do not
        # serve it (opposite direction stops on the other road got
        # overloaded with every headsign of the line).
        stop_trips = {}
        for t in route.get("trips") or []:
            hs = str(t.get("headsign") or "")
            for t_sid in t.get("stop_ids") or []:
                stop_trips.setdefault(str(t_sid), set()).add(hs)
        for s in route.get("stops", []):
            sid = str(s.get("stop_id") or "")
            if not sid or s.get("lat") is None or s.get("lng") is None:
                continue
            key = _physical_stop_group_key(groups, platform_groups, s)
            platform_groups[sid] = key
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
                    "routes": set(),
                    "modes": set(),
                },
            )
            # Directions/Routes SPECIFIC to this platform (trips that
            # actually include this stop), not the whole line.
            plat["directions"] |= stop_trips.get(sid, set())
            plat['modes'].add(mode)
            # The physical catalogue is not proof of dated trip service.
            if sid in stop_trips:
                plat["routes"].add(rn)
                entry = g["routes"].setdefault((mode, rn), {"route_number": rn, "mode": mode, "directions": set()})
                entry["directions"] |= stop_trips[sid]
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
                        "routes": sorted(r for r in p["routes"]),
                        "modes": sorted(p['modes']),
                    }
                    for p in g["platforms"].values()
                ],
                "name": g["name"],
                "latitude": g["latitude"],
                "longitude": g["longitude"],
                "modes": sorted(g["modes"]),
                "stop_kind": _stop_kind_for(g["modes"], str(network.get("region_id") or "")),
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
    return _cluster_stop_places(out)


STOP_PLACE_MERGE_KM = 0.08  # 80 meters - same-NAME stops only


def _cluster_stop_places(stops: List[dict]) -> List[dict]:
    """Second level: STOP PLACES for the passenger map - SAME NAME only.

    Two stops merge ONLY when their names match (normalized) and they are
    within 80m. Differently-named stops NEVER merge by distance: a stop
    on road A and a differently-named stop on the parallel road B are
    different places, even 10m apart. (Explicit parent_station or a
    manual alias is the only way to join differently-named stops.)"""
    if len(stops) <= 1:
        return stops
    places: List[dict] = []
    for s in stops:
        merged = None
        s_name = _stop_name_key(s.get("name"))
        for pl in places:
            if not s_name or _stop_name_key(pl.get("name")) != s_name:
                continue
            if (
                pl.get("latitude") is not None
                and s.get("latitude") is not None
                and _haversine_km(pl["latitude"], pl["longitude"], s["latitude"], s["longitude"]) < STOP_PLACE_MERGE_KM
            ):
                merged = pl
                break
        if merged is None:
            places.append(
                {
                    "stop_id": s["stop_id"],
                    "stop_place_id": f"place:{s['stop_id'].split(':', 1)[-1][:40]}",
                    "stop_ids": list(s.get("stop_ids") or []),
                    "platforms": list(s.get("platforms") or []),
                    "name": s.get("name") or s["stop_id"],
                    "aliases": [s.get("name")] if s.get("name") else [],
                    "members": [
                        {
                            "stop_id": s["stop_id"],
                            "name": s.get("name") or s["stop_id"],
                            "latitude": s.get("latitude"),
                            "longitude": s.get("longitude"),
                        }
                    ],
                    "latitude": s.get("latitude"),
                    "longitude": s.get("longitude"),
                    "modes": set(s.get("modes") or []),
                    "routes": {(r.get("mode"), r.get("route_number")): dict(r) for r in (s.get("routes") or [])},
                }
            )
            continue
        merged["stop_ids"].extend(x for x in (s.get("stop_ids") or []) if x not in merged["stop_ids"])
        merged["members"].append(
            {
                "stop_id": s["stop_id"],
                "name": s.get("name") or s["stop_id"],
                "latitude": s.get("latitude"),
                "longitude": s.get("longitude"),
            }
        )
        for p in s.get("platforms") or []:
            if not any(pp.get("platform_id") == p.get("platform_id") for pp in merged["platforms"]):
                merged["platforms"].append(p)
        for nm in [s.get("name")]:
            if nm and nm not in merged["aliases"]:
                merged["aliases"].append(nm)
        merged["modes"].update(s.get("modes") or [])
        for r in s.get("routes") or []:
            rn = (r.get("mode"), r.get("route_number"))
            if rn not in merged["routes"]:
                merged["routes"][rn] = dict(r)
            else:
                existing = merged['routes'][rn]
                existing['directions'] = sorted(set(existing.get('directions') or []) | set(r.get('directions') or []))
        # Anchor the place at the FIRST (main) stop - keeps a stable point.
    for pl in places:
        pl["modes"] = sorted(pl["modes"])
        pl["routes"] = sorted(pl["routes"].values(), key=lambda x: (x["mode"] != "tram", x["route_number"]))
        if len(pl["aliases"]) > 1:
            pl["name"] = pl["aliases"][0]
    return places


def _apply_stop_overrides(stops: List[dict], overrides: Optional[List[dict]]) -> List[dict]:
    """Operator overrides over imported stops (rename / move / deactivate /
    manual stop / add platform). Imported data is never mutated - the
    effective stop list is derived, so a future GTFS import always starts
    from the clean imported base again."""
    if not overrides:
        return stops
    by_id = {str(s.get("stop_id")): s for s in stops}
    for ov in overrides:
        kind = str(ov.get("kind") or "")
        target = str(ov.get("target_stop_id") or "")
        if kind == "manual_stop":
            sid = str(ov.get("stop_id") or ov.get("override_id") or "")
            if sid and sid not in by_id:
                by_id[sid] = {
                    "stop_id": sid,
                    "stop_ids": [],
                    "platforms": [
                        {
                            "platform_id": p.get("platform_id"),
                            "latitude": p.get("latitude"),
                            "longitude": p.get("longitude"),
                            "name": p.get("name") or ov.get("name") or "Platform",
                            "platform_code": p.get("platform_code"),
                            "directions": p.get("directions") or [],
                        }
                        for p in (ov.get("platforms") or [])
                        if p.get("platform_id") and p.get("latitude") is not None and p.get("longitude") is not None
                    ],
                    "name": ov.get("name") or sid,
                    "latitude": ov.get("latitude"),
                    "longitude": ov.get("longitude"),
                    "modes": [m for m in (ov.get("modes") or []) if m in ("bus", "tram")],
                    "routes": ov.get("routes") or [],
                    "manual": True,
                }
                if by_id[sid].get("latitude") is None:
                    plats = by_id[sid]["platforms"]
                    if plats:
                        by_id[sid]["latitude"] = plats[0]["latitude"]
                        by_id[sid]["longitude"] = plats[0]["longitude"]
            continue
        if target not in by_id:
            continue
        stop = by_id[target]
        if kind == "rename":
            if ov.get("name"):
                stop["name"] = ov.get("name")
        elif kind == "move":
            if ov.get("latitude") is not None and ov.get("longitude") is not None:
                stop["latitude"] = ov.get("latitude")
                stop["longitude"] = ov.get("longitude")
        elif kind == "deactivate":
            stop["active"] = False
        elif kind == "activate":
            stop["active"] = True
        elif kind == "add_platform":
            plat = ov.get("platform")
            if plat and plat.get("platform_id") and plat.get("latitude") is not None and plat.get("longitude") is not None:
                if str(plat.get("platform_id")) not in stop.get("stop_ids", []):
                    stop.setdefault("stop_ids", []).append(str(plat["platform_id"]))
                stop.setdefault("platforms", []).append(
                    {
                        "platform_id": str(plat.get("platform_id")),
                        "latitude": plat.get("latitude"),
                        "longitude": plat.get("longitude"),
                        "name": plat.get("name") or stop.get("name") or "Platform",
                        "platform_code": plat.get("platform_code"),
                        "directions": plat.get("directions") or [],
                    }
                )
                stop["manual"] = True
    return [s for s in by_id.values() if s.get("active", True)]


def _source_manifest(network_doc: dict) -> Optional[dict]:
    """Public read-only provenance record bound to this network version.

    Allowlist-copies only known version-bound fields (archive hash,
    ingestion kind, notice presence/hashes, publisher name/URL). Anything
    else on the stored document is never exposed here, so no secret or
    internal field can leak through this manifest. Never infers licences.
    """
    static_input = network_doc.get("static_input")
    if not isinstance(static_input, dict):
        return None
    manifest: dict = {}
    for key in ("kind", "sha256", "ingestion"):
        value = static_input.get(key)
        if isinstance(value, str):
            manifest[key] = value
    notices = static_input.get("notices")
    if isinstance(notices, dict):
        copied = {}
        for name in ("feed_info.txt", "attributions.txt"):
            row = notices.get(name)
            if isinstance(row, dict):
                item = {k: v for k, v in row.items() if k in ("status", "sha256") and isinstance(v, str)}
                if item:
                    copied[name] = item
        if copied:
            manifest["notices"] = copied
    publisher = static_input.get("publisher")
    if isinstance(publisher, dict):
        item = {k: v for k, v in publisher.items()
                if k in ("publisher_name", "publisher_url") and isinstance(v, str)}
        if item:
            manifest["publisher"] = item
    return manifest or None


def build_domain(network_doc: dict, network_id: str = NETWORK_ID, overrides: Optional[List[dict]] = None) -> dict:
    """Derive the full canonical domain from an active network document."""
    version_id = str(network_doc.get("version_id") or "")
    import json as _json

    service_date = _service_date(network_doc)
    manifest = _source_manifest(network_doc)
    cache_key = (
        str(network_doc.get("region_id") or get_active_region().region_id),
        str(network_doc.get("network_id") or network_id), network_id,
        version_id, service_date,
        str(network_doc.get("name") or ""), str(network_doc.get("timezone") or NETWORK_TIMEZONE),
        str(network_doc.get("country") or NETWORK_COUNTRY),
        _json.dumps(manifest or {}, sort_keys=True),
        _json.dumps(overrides or [], sort_keys=True),
        _direction_inputs_fingerprint(network_doc),
        _stop_catalogue_fingerprint(network_doc),
    )
    if cache_key in _DOMAIN_CACHE:
        return _DOMAIN_CACHE[cache_key]

    routes = []
    patterns = []
    trip_templates = []
    for route in network_doc.get("routes", []):
        rn = str(route.get("route_number"))
        mode = (
            route.get("mode")
            if route.get("mode") in (
                "bus", "tram", "trolleybus", "subway", "s-bahn", "rail", "ferry"
            )
            else "bus"
        )
        stop_by_id = {str(s.get("stop_id")): s for s in route.get("stops", []) if s.get("stop_id") is not None}
        route_id = f"route:{rn}"
        pattern_map: dict = {}
        pattern_ids = []
        for trip in route.get("trips", []):
            key = _pattern_key(trip)
            pat = pattern_map.get(key)
            if not pat:
                pat = {
                    **pattern_source_for_trip(route,trip),
                    "pattern_id": _pattern_id(rn, key),
                    "route_id": route_id,
                }
                pattern_map[key] = pat
                pattern_ids.append(pat["pattern_id"])
                patterns.append(pat)
            trip_templates.append(
                {
                    "trip_id": str(trip.get("trip_id") or ""),
                    "trip_instance_id": f"{network_id}:{version_id}:{service_date}:{trip.get('trip_id')}",
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
            "network_id": str(network_doc.get("network_id") or network_id),
            "region_id": str(network_doc.get("region_id") or _ACTIVE_REGION.region_id),
            "name": network_doc.get("name") or network_id,
            "version_id": version_id,
            "service_date": service_date,
            "timezone": str(network_doc.get("timezone") or NETWORK_TIMEZONE),
            "country": str(network_doc.get("country") or NETWORK_COUNTRY),
            "source_manifest": manifest,
        },
        "routes": routes,
        "patterns": patterns,
        "stops": _apply_stop_overrides(_physical_stops(network_doc), overrides),
        "trip_templates": trip_templates,
    }
    if len(_DOMAIN_CACHE) >= 8:
        _DOMAIN_CACHE.pop(next(iter(_DOMAIN_CACHE)))
    _DOMAIN_CACHE[cache_key] = data
    return data
