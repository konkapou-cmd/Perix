"""Large-network route storage with lazy trip timing.

Magdeburg-scale versions fit comfortably in a single 16MB BSON document and
stay EXACTLY as they always were: one doc with an embedded `routes` array.
Cities like Berlin/VBB (264MB) or Athens (500MB+) cannot fit, so the version
is stored as a small header document plus one document per route in
`bus_network_route_blocks` (the largest Berlin route shell is ~2MB, safely
inside the BSON limit).

Big networks split three kinds of per-trip data:
  - `bus_network_route_blocks`: route shells (stops, shapes, trip identity -
    everything the map/domain/read API needs, ~69MB Berlin).
  - `bus_network_trip_windows_blocks`: compact deterministic trip windows
    (start/end/first/last stop ids + ordered "stop_id|arrival" pairs,
    computed at import from the base schedule) for run chaining and window
    checks WITHOUT raw times.
  - `bus_network_trip_times_blocks`: raw timing fields + the precomputed
    base timeline (realtime=None) per trip, fetched ONLY for trips that
    actually need timing (realtime-delayed, selected estimates, arrivals).

Routes are stored ONE AT A TIME (streamed) so the import never holds the
precomputed timelines in RAM. Attach helpers locate routes by
(route_number, mode) - never by position in a passed subset - and hydrate
only what the caller asks for. Assembled dict shapes stay identical to the
single-doc pipeline for downstream consumers.
"""
from __future__ import annotations

import json
from typing import List, Optional

from database import db

# Keep each block chunk well below the 16MB BSON ceiling.
ROUTE_SPLIT_BYTES = 14 * 1024 * 1024
# Trip-count gate below which a version can never approach the BSON ceiling:
# serialization is skipped entirely (Magdeburg ~2.8k, Gardelegen ~2k).
SERIALIZE_TRIP_GATE = 8000

TRIP_TIMING_FIELDS = ("stop_times_sequence", "stop_times", "stop_times_arrival")


def _route_bytes(route: dict) -> int:
    return len(json.dumps(route, ensure_ascii=False, default=str).encode("utf-8"))


def should_split_routes(routes: List[dict]) -> bool:
    total_trips = 0
    for route in routes:
        total_trips += len(route.get("trips") or [])
        if total_trips >= SERIALIZE_TRIP_GATE:
            break
    if total_trips < SERIALIZE_TRIP_GATE:
        return False
    total_bytes = 0
    for route in routes:
        total_bytes += _route_bytes(route)
        if total_bytes > ROUTE_SPLIT_BYTES:
            return True
    return False


def occurrence_timing_present(routes: List[dict]) -> bool:
    """All trips carry both timing representations (True for fresh GTFS)."""
    return all(t.get("stop_times") and t.get("stop_times_sequence")
               for r in routes for t in r.get("trips", []))


def _compact_base_timeline(timeline: list) -> list:
    """Timeline entries without the 'stop' dict; reconstructed on use."""
    return [{k: v for k, v in entry.items() if k != "stop"} for entry in timeline]


async def store_route_block(version: dict, route_index: int, route: dict,
                            windows: dict, base_timelines: dict) -> None:
    """Store ONE route's shell, times and window documents (streamed import)."""
    common = {
        "version_id": version["version_id"],
        "region_id": version["region_id"],
        "network_id": version["network_id"],
    }
    shell_trips = [{k: v for k, v in trip.items() if k not in TRIP_TIMING_FIELDS}
                   for trip in route.get("trips", [])]
    shell_route = {**route, "trips": shell_trips}
    times_trips = []
    window_trips = []
    for trip in route.get("trips", []):
        tid = str(trip.get("trip_id") or "")
        times_trips.append({"trip_id": tid,
                            **{k: trip[k] for k in TRIP_TIMING_FIELDS if k in trip},
                            **({"base_timeline": _compact_base_timeline(base_timelines[(route_index, tid)])}
                               if (route_index, tid) in base_timelines else {})})
        win = windows.get((route_index, tid))
        if win:
            window_trips.append({"trip_id": tid,
                                 **{k: win[k] for k in ("start", "end",
                                                        "first_stop_id", "last_stop_id")},
                                 "ordered": ["%s|%s" % (sid, int(arr)) for sid, arr in win.get("ordered") or []]})
    await db.bus_network_route_blocks.insert_one({
        **common,
        "route_index": route_index,
        "mode": route.get("mode"),
        "route_number": str(route.get("route_number") or ""),
        "route": shell_route,
    })
    await db.bus_network_trip_times_blocks.insert_one({
        **common,
        "route_index": route_index,
        "mode": route.get("mode"),
        "route_number": str(route.get("route_number") or ""),
        "trips": times_trips,
    })
    if window_trips:
        await db.bus_network_trip_windows_blocks.insert_one({
            **common,
            "route_index": route_index,
            "mode": route.get("mode"),
            "route_number": str(route.get("route_number") or ""),
            "trips": window_trips,
        })


def _route_key(route: dict) -> tuple:
    return (str(route.get("route_number") or ""), str(route.get("mode") or ""))


async def _fetch_times_blocks(version_id: str, route_keys: Optional[List[tuple]] = None) -> dict:
    docs = []
    if route_keys is None:
        docs = await db.bus_network_trip_times_blocks.find(
            {"version_id": version_id}, {"_id": 0},
        ).to_list(length=None)
    else:
        for rn, mode in route_keys:
            found = await db.bus_network_trip_times_blocks.find_one(
                {"version_id": version_id, "route_number": rn, "mode": mode}, {"_id": 0})
            if found:
                docs.append(found)
    by_key = {}
    for doc in docs:
        by_key[_route_key(doc)] = {
            str(t.get("trip_id")): {k: v for k, v in t.items() if k != "trip_id"}
            for t in doc.get("trips", []) if t.get("trip_id") is not None
        }
    return by_key


async def _fetch_window_blocks(version_id: str, route_keys: Optional[List[tuple]] = None) -> dict:
    docs = []
    if route_keys is None:
        docs = await db.bus_network_trip_windows_blocks.find(
            {"version_id": version_id}, {"_id": 0},
        ).to_list(length=None)
    else:
        for rn, mode in route_keys:
            found = await db.bus_network_trip_windows_blocks.find_one(
                {"version_id": version_id, "route_number": rn, "mode": mode}, {"_id": 0})
            if found:
                docs.append(found)
    by_key = {}
    for doc in docs:
        by_key[_route_key(doc)] = {
            str(t.get("trip_id")): t for t in doc.get("trips", []) if t.get("trip_id") is not None
        }
    return by_key


async def _fetch_route_blocks(version_id: str) -> List[dict]:
    return await db.bus_network_route_blocks.find(
        {"version_id": version_id}, {"_id": 0},
    ).sort("route_index", 1).to_list(length=None)


async def assemble_network_routes(doc: Optional[dict], *, include_times: bool = False) -> Optional[dict]:
    """Restore the embedded `routes` array.

    Small/single-doc versions pass through byte-identical (their trips keep
    everything). Split versions return light trip shells by default; pass
    include_times=True to re-attach the per-trip timing fields.
    """
    if not doc or not doc.get("routes_split"):
        return doc
    blocks = await _fetch_route_blocks(doc.get("version_id"))
    routes = [block["route"] for block in blocks]
    if include_times:
        times_by_key = await _fetch_times_blocks(doc.get("version_id"))
        for route in routes:
            times = times_by_key.get(_route_key(route))
            if not times:
                continue
            for trip in route.get("trips", []):
                tid = str(trip.get("trip_id") or "")
                extra = times.get(tid)
                if extra:
                    # base_timeline is a runtime fast-path artifact, not part
                    # of the canonical single-doc trip shape.
                    trip.update({k: v for k, v in extra.items() if k != "base_timeline"})
    return {**doc, "routes": routes}


async def attach_route_times(routes: List[dict], version_id: str,
                             route_numbers: Optional[set] = None,
                             trip_ids: Optional[set] = None) -> None:
    """Attach raw timing fields + precomputed base timeline to light routes.

    Filter by route_numbers (whole routes) and/or trip_ids (single trips).
    Routes are located by (route_number, mode), never by list position.
    """
    if not routes:
        return
    trip_filter = {str(t) for t in trip_ids} if trip_ids is not None else None
    wanted_keys = set()
    for route in routes:
        if route_numbers is not None and str(route.get("route_number") or "") not in route_numbers:
            continue
        if trip_filter is not None:
            if not any(str(t.get("trip_id") or "") in trip_filter for t in route.get("trips", [])):
                continue
        wanted_keys.add(_route_key(route))
    if not wanted_keys:
        return
    times_by_key = await _fetch_times_blocks(version_id, sorted(wanted_keys))
    for route in routes:
        times = times_by_key.get(_route_key(route))
        if not times:
            continue
        for trip in route.get("trips", []):
            tid = str(trip.get("trip_id") or "")
            if trip_filter is not None and tid not in trip_filter:
                continue
            extra = times.get(tid)
            if extra:
                trip.update(extra)


async def attach_route_windows(routes: List[dict], version_id: str,
                               route_numbers: Optional[set] = None) -> None:
    """Hydrate light trips with their precomputed compact window (trip['window']).

    The consumer reconstructs stop dicts from the route's own stops."""
    if not routes:
        return
    wanted_keys = set()
    for route in routes:
        if route_numbers is not None and str(route.get("route_number") or "") not in route_numbers:
            continue
        wanted_keys.add(_route_key(route))
    if not wanted_keys:
        return
    windows_by_key = await _fetch_window_blocks(version_id,
                                                None if route_numbers is None else sorted(wanted_keys))
    for route in routes:
        windows = windows_by_key.get(_route_key(route))
        if not windows:
            continue
        for trip in route.get("trips", []):
            tid = str(trip.get("trip_id") or "")
            win = windows.get(tid)
            if win:
                trip["window"] = win
