"""GTFS zip parser: converts a standard GTFS feed into Perix Mobility data.

Agency selection and timezone are supplied by the active mobility region, so
the parser is reusable across cities without city-specific code branches.
"""
import csv
import io
import zipfile
from collections import defaultdict
from datetime import datetime, date
from typing import Optional
from zoneinfo import ZoneInfo
from mobility.regions import get_active_region

TRAM_TYPES = {"0"}
BUS_TYPES = {"3"}
TROLLEYBUS_TYPES = {"11"}


def _rows(zf: zipfile.ZipFile, name: str) -> list:
    names = {n.lower(): n for n in zf.namelist()}
    actual = names.get(name.lower())
    if not actual:
        return []
    raw = zf.open(actual, "r")
    text = io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")
    return list(csv.DictReader(text))


def _iter_rows(zf: zipfile.ZipFile, name: str):
    """Streaming row iterator for huge files (stop_times/shapes) - never
    materializes the whole file in memory."""
    names = {n.lower(): n for n in zf.namelist()}
    actual = names.get(name.lower())
    if not actual:
        return iter(())
    raw = zf.open(actual, "r")
    text = io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")
    return csv.DictReader(text)


def _gtfs_date(s: str) -> date:
    return datetime.strptime(s, "%Y%m%d").date()


def _hhmm(s: str) -> str:
    if not s:
        return ""
    p = str(s).strip().split(":")
    if len(p) < 2:
        return str(s).strip()
    result = f"{int(p[0]):02d}:{int(p[1]):02d}"
    return f"{result}:{int(p[2]):02d}" if len(p) == 3 and int(p[2]) else result


def _time_seconds(value: str, context: str) -> int:
    parts = value.strip().split(":")
    if (
        len(parts) not in (2, 3)
        or any(not p.isascii() or not p.isdigit() for p in parts)
        or int(parts[1]) >= 60
        or (len(parts) == 3 and int(parts[2]) >= 60)
    ):
        raise ValueError(f"{context}: invalid GTFS time {value!r}")
    return int(parts[0]) * 3600 + int(parts[1]) * 60 + (int(parts[2]) if len(parts) == 3 else 0)


def _active_service_ids(zf: zipfile.ZipFile, service_date: date) -> set:
    active = set()
    weekday = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"][
        service_date.weekday()
    ]
    for r in _rows(zf, "calendar.txt"):
        try:
            if not r.get("service_id") or r.get(weekday) != "1":
                continue
            if _gtfs_date(r["start_date"]) <= service_date <= _gtfs_date(r["end_date"]):
                active.add(r["service_id"])
        except Exception:
            continue
    target = service_date.strftime("%Y%m%d")
    for r in _rows(zf, "calendar_dates.txt"):
        if r.get("date") != target or not r.get("service_id"):
            continue
        if r.get("exception_type") == "1":
            active.add(r["service_id"])
        elif r.get("exception_type") == "2":
            active.discard(r["service_id"])
    return active


def parse_gtfs_zip(
    content: bytes,
    service_date: Optional[str] = None,
    agency_regex: Optional[str] = None,
    timezone: Optional[str] = None,
) -> dict:
    """Return one active region's bus/tram network payload."""
    return _parse_zip(io.BytesIO(content), service_date, agency_regex, timezone)


def parse_gtfs_zip_path(
    path,
    service_date: Optional[str] = None,
    agency_regex: Optional[str] = None,
    timezone: Optional[str] = None,
) -> dict:
    """Path-based equivalent used by the background static worker."""
    return _parse_zip(path, service_date, agency_regex, timezone)


def _parse_zip(source, service_date, agency_regex, timezone) -> dict:
    import re

    region = get_active_region()
    resolved_agency_regex = str(agency_regex or region.agency_regex)
    resolved_timezone = str(timezone or region.timezone)
    sd = (
        datetime.strptime(service_date, "%Y-%m-%d").date()
        if service_date
        else datetime.now(ZoneInfo(resolved_timezone)).date()
    )
    agency_re = re.compile(resolved_agency_regex, re.I)

    with zipfile.ZipFile(source) as zf:
        agencies = _rows(zf, "agency.txt")
        agency_ids = {
            r.get("agency_id", "") for r in agencies if agency_re.search(r.get("agency_name", "") or "")
        }
        if not agency_ids:
            raise ValueError(f"No agency matched /{resolved_agency_regex}/ in agency.txt")

        service_ids = _active_service_ids(zf, sd)
        if not service_ids:
            raise ValueError(f"No active services for {sd}")

        selected_routes = {}
        for r in _rows(zf, "routes.txt"):
            if r.get("agency_id", "") not in agency_ids:
                continue
            rt = str(r.get("route_type", "")).strip()
            if rt not in TRAM_TYPES | BUS_TYPES | TROLLEYBUS_TYPES:
                continue
            if rt in TRAM_TYPES:
                mode = "tram"
            elif rt in TROLLEYBUS_TYPES:
                mode = "trolleybus"
            else:
                mode = "bus"
            selected_routes[r["route_id"]] = {
                "agency_id": r.get("agency_id", ""),
                "route_number": (r.get("route_short_name") or r.get("route_long_name") or r["route_id"]).strip(),
                "name": (r.get("route_long_name") or "").strip(),
                "mode": mode,
            }

        trips = {}
        for r in _rows(zf, "trips.txt"):
            if r.get("route_id") not in selected_routes or r.get("service_id") not in service_ids:
                continue
            trips[r["trip_id"]] = {
                "route_id": r["route_id"],
                "direction_id": (r.get("direction_id") or "").strip(),
                "service_id": r["service_id"],
                "headsign": (r.get("trip_headsign") or "").strip(),
                "shape_id": (r.get("shape_id") or "").strip(),
                "block_id": (r.get("block_id") or "").strip() or None,
                "times": [],
            }

        stops = {}
        for r in _rows(zf, "stops.txt"):
            if not r.get("stop_id"):
                continue
            try:
                stops[r["stop_id"]] = {
                    "stop_id": r["stop_id"],
                    "name": (r.get("stop_name") or r["stop_id"]).strip(),
                    "lat": float(r["stop_lat"]),
                    "lng": float(r["stop_lon"]),
                    "parent_station": (r.get("parent_station") or "").strip() or None,
                    "location_type": (r.get("location_type") or "0").strip(),
                    "platform_code": (r.get("platform_code") or "").strip() or None,
                }
            except Exception:
                continue

        # Stop times (streaming - the nationwide file has millions of rows).
        # Arrival and departure are kept SEPARATE: a vehicle arrives, dwells
        # and then departs - realistic stop behavior, not one shared time.
        for r in _iter_rows(zf, "stop_times.txt"):
            tid = r.get("trip_id")
            if tid not in trips or r.get("stop_id") not in stops:
                continue
            arr = r.get("arrival_time") or ""
            dep = r.get("departure_time") or arr
            if not dep:
                continue
            context = f"trip {tid!r}, stop {r['stop_id']!r}, stop_sequence {r.get('stop_sequence')!r}"
            _time_seconds(arr or dep, f"{context}, arrival_time")
            _time_seconds(dep, f"{context}, departure_time")
            try:
                sequence = int(r.get("stop_sequence") or 0)
            except ValueError as exc:
                raise ValueError(f"{context}: invalid stop_sequence") from exc
            trips[tid]["times"].append(
                (sequence, r["stop_id"], _hhmm(arr or dep), _hhmm(dep))
            )

        # Shapes (streaming, keep only shapes referenced by the selected trips)
        needed_shape_ids = {t["shape_id"] for t in trips.values() if t.get("shape_id")}
        shapes = defaultdict(list)
        for r in _iter_rows(zf, "shapes.txt"):
            sid = r.get("shape_id")
            if sid not in needed_shape_ids:
                continue
            try:
                shapes[sid].append(
                    (int(r.get("shape_pt_sequence") or 0), float(r["shape_pt_lat"]), float(r["shape_pt_lon"]))
                )
            except Exception:
                continue
        for sid in shapes:
            shapes[sid] = [[lat, lng] for _, lat, lng in sorted(shapes[sid], key=lambda x: x[0])]

        # Keep legacy public labels unless different agencies share one.
        public_agencies = defaultdict(set)
        for base in selected_routes.values():
            public_agencies[(base["route_number"], base["mode"])].add(base["agency_id"])
        grouped = {}
        for tid, t in trips.items():
            base = selected_routes[t["route_id"]]
            public_key = (base["route_number"], base["mode"])
            label = (
                f"{base['agency_id']}/{base['route_number']}"
                if len(public_agencies[public_key]) > 1 else base["route_number"]
            )
            key = (label, base["mode"], base["agency_id"])
            seqs = sorted(t["times"], key=lambda x: x[0])
            previous_departure = None
            for sequence, sid, arr, dep in seqs:
                context = f"trip {tid!r}, stop {sid!r}, stop_sequence {sequence}"
                arrival = _time_seconds(arr, context)
                departure = _time_seconds(dep, context)
                if departure < arrival:
                    raise ValueError(f"{context}: departure_time {dep!r} precedes arrival_time {arr!r}")
                if previous_departure is not None and arrival < previous_departure:
                    raise ValueError(f"{context}: arrival_time {arr!r} precedes previous departure_time")
                previous_departure = departure
            if len(seqs) < 2:
                continue
            g = grouped.setdefault(
                key,
                {
                    "route_number": label,
                    "public_route_number": base["route_number"],
                    "agency_id": base["agency_id"],
                    "name": base["name"] or base["route_number"],
                    "mode": base["mode"],
                    "_stop_ids": [],
                    "_seen": set(),
                    "trips": [],
                    "shape_id": t["shape_id"] or None,
                },
            )
            if not g["shape_id"] and t["shape_id"]:
                g["shape_id"] = t["shape_id"]
            stop_times = {}
            stop_times_arrival = {}
            for _seq, sid, _arr, dep in seqs:
                stop_times.setdefault(sid, dep)
                if sid not in g["_seen"]:
                    g["_seen"].add(sid)
                    g["_stop_ids"].append(sid)
            for _seq, sid, arr, _dep in seqs:
                stop_times_arrival.setdefault(sid, arr)
            headsign = t["headsign"] or stops[seqs[-1][1]]["name"]
            g["trips"].append(
                {
                    "trip_id": tid,
                    "agency_id": base["agency_id"],
                    "gtfs_route_id": t["route_id"],
                    "direction_id": t["direction_id"],
                    "service_id": t["service_id"],
                    "headsign": headsign,
                    "start": seqs[0][3],
                    "end": seqs[-1][3],
                    "block_id": t["block_id"],
                    # Exact GTFS stop_sequence order for THIS trip.
                    # route.stops below is only a union for discovery/UI
                    # and must not define direction or progress.
                    "stop_ids": [sid for _seq, sid, _arr, _dep in seqs],
                    "stop_sequences": [seq for seq, _sid, _arr, _dep in seqs],
                    "stop_times_sequence": [
                        {"stop_sequence": seq, "stop_id": sid, "arrival_time": arr, "departure_time": dep}
                        for seq, sid, arr, dep in seqs
                    ],
                    "stop_times": stop_times,
                    "stop_times_arrival": stop_times_arrival,
                    "shape_id": t["shape_id"] or None,
                }
            )

        routes_out = []
        for key, g in sorted(grouped.items(), key=lambda kv: (kv[0][1], kv[0][0])):
            route = {
                "route_number": g["route_number"],
                "public_route_number": g["public_route_number"],
                "agency_id": g["agency_id"],
                "name": g["name"],
                "mode": g["mode"],
                "stops": [stops[sid] for sid in g["_stop_ids"] if sid in stops],
                "trips": sorted(g["trips"], key=lambda t: (t["start"], t["headsign"], t["trip_id"])),
            }
            # Preserve every geometry referenced by this public line.
            # Opposite directions/branches often use different shape_id
            # values even though route_number is identical.
            shape_ids = {
                t.get("shape_id")
                for t in g["trips"]
                if t.get("shape_id") and shapes.get(t.get("shape_id"))
            }
            if shape_ids:
                route["shapes"] = {sid: shapes[sid] for sid in sorted(shape_ids)}

            # Backward-compatible representative geometry for older clients.
            shape = shapes.get(g["shape_id"] or "")
            if shape:
                route["shape"] = [[lat, lng] for lat, lng in shape]
            routes_out.append(route)

        return {
            "name": f"{region.city} transit {sd.isoformat()}",
            "source": "GTFS",
            "region_id": region.region_id,
            "network_id": region.network_id,
            "service_date": sd.isoformat(),
            "timezone": resolved_timezone,
            "country": region.country,
            "routes": routes_out,
        }
