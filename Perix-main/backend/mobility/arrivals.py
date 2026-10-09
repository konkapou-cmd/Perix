"""Unified Arrivals engine (Mobility Core V2 - Phase 6).

ONE arrival computation for GPS, realtime and schedule vehicles: the same
predicted stop timeline drives the marker, the ETA and this list. Honors
GTFS-RT operational states AND operator overrides (canceled trips,
skipped stops). Live GPS vehicles mark their trip's arrival as LIVE.
"""
from typing import List, Optional

from database import db


def _fmt_service_time(sec: int) -> str:
    sec = int(sec) % (24 * 3600)
    h, m = sec // 3600, (sec % 3600) // 60
    return f"{h:02d}:{m:02d}"


async def unified_arrivals(stop_id: str, limit: int = 20) -> List[dict]:
    from mobility.domain import NETWORK_ID, build_domain
    from mobility.overrides import canceled_trip_ids, skipped_stop_ids
    from routes.mobility import (
        _get_active_network,
        _now_service_seconds,
        _predicted_stop_timeline,
        _realtime_delays_for,
    )

    network = await _get_active_network()
    if not network:
        return []
    domain = build_domain(network, NETWORK_ID)

    platform_ids = set()
    for stop in domain["stops"]:
        ids = {str(x) for x in stop.get("stop_ids", [])}
        if str(stop.get("stop_id")) == str(stop_id) or str(stop_id) in ids:
            platform_ids = ids
            break
    if not platform_ids:
        return []

    routes_by_num = {str(r.get("route_number")): r for r in network.get("routes", [])}
    candidates = [
        t
        for t in domain["trip_templates"]
        if platform_ids & {str(x) for x in (t.get("stop_ids") or [])}
    ]
    trip_ids = [t["trip_id"] for t in candidates]
    delays = await _realtime_delays_for(trip_ids)
    canceled = await canceled_trip_ids()
    skipped_ov = await skipped_stop_ids()
    now = _now_service_seconds()

    # Fresh GPS states -> LIVE quality per trip
    states = await db.mobility_vehicle_state.find({}, {"_id": 0}).to_list(200)
    gps_by_trip = {}
    for st in states:
        if not st.get("trip_id") or st.get("quality") != "LIVE":
            continue
        try:
            from datetime import datetime

            from zoneinfo import ZoneInfo

            dt = datetime.fromisoformat(str(st.get("updated_at") or ""))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=ZoneInfo("UTC"))
            if (datetime.now(ZoneInfo("UTC")) - dt).total_seconds() > 90:
                continue
        except ValueError:
            continue
        gps_by_trip[str(st.get("trip_id"))] = st

    # Current positions of every active vehicle (for real distances)
    from routes.mobility import _all_active_vehicles

    pos_by_id = {}
    for v in await _all_active_vehicles():
        if v.get("latitude") is not None and v.get("longitude") is not None:
            pos_by_id[str(v.get("vehicle_id"))] = v

    stop_lat = stop_lng = None
    for stop in domain.get("stops", []):
        ids = {str(x) for x in stop.get("stop_ids", [])}
        if str(stop.get("stop_id")) == str(stop_id) or str(stop_id) in ids:
            stop_lat = stop.get("latitude")
            stop_lng = stop.get("longitude")
            break

    def _hav_m(a_lat, a_lng, b_lat, b_lng):
        import math

        r = 6371000.0
        p1, p2 = math.radians(a_lat), math.radians(b_lat)
        dp, dl = math.radians(b_lat - a_lat), math.radians(b_lng - a_lng)
        x = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        return r * 2 * math.atan2(math.sqrt(x), math.sqrt(1 - x))

    out = []
    for tt in candidates:
        tid = str(tt.get("trip_id") or "")
        if tid in canceled:
            continue
        route = routes_by_num.get(str(tt.get("route_number")))
        if not route:
            continue
        trip = next((x for x in route.get("trips", []) if str(x.get("trip_id")) == tid), None)
        if not trip:
            continue
        rt = delays.get(tid)
        if rt and str(rt.get("trip_schedule_relationship") or "").upper() in ("CANCELED", "DELETED"):
            continue
        timeline = _predicted_stop_timeline(route, trip, rt)
        skipped = skipped_ov.get(tid, set())
        entry = next(
            (
                e
                for e in timeline
                if str(e.get("stop_id")) in platform_ids
                and e.get("relationship") != "SKIPPED"
                and str(e.get("stop_id")) not in skipped
                and int(e.get("predicted_arrival", 0)) >= now
            ),
            None,
        )
        if not entry:
            continue
        gps = gps_by_trip.get(tid)
        if gps and gps.get("vehicle_id"):
            vehicle_id = str(gps["vehicle_id"])
        else:
            # Use the SAME identity as the map: find the active vehicle
            # currently on this trip (est_ vehicles are keyed by run).
            matched = next(
                (
                    v.get("vehicle_id")
                    for v in pos_by_id.values()
                    if str(v.get("trip_id") or "") == tid
                ),
                None,
            )
            vehicle_id = matched or f"est_{tt.get('route_number')}_{tid}"
        distance_m = None
        if stop_lat is not None:
            veh = pos_by_id.get(vehicle_id)
            if veh:
                distance_m = round(_hav_m(veh["latitude"], veh["longitude"], stop_lat, stop_lng))
        out.append(
            {
                "trip_instance_id": tt.get("trip_instance_id"),
                "trip_id": tid,
                "route_number": tt.get("route_number"),
                "direction": trip.get("headsign"),
                "mode": tt.get("mode"),
                "eta_seconds": max(0, int(entry["predicted_arrival"]) - now),
                "predicted": _fmt_service_time(int(entry["predicted_arrival"])),
                "delay_seconds": int(entry.get("delay_seconds") or 0),
                "source": "LIVE" if gps else ("REALTIME" if rt else "SCHEDULE"),
                "vehicle_id": vehicle_id,
                "distance_to_stop_m": distance_m,
            }
        )
    out.sort(key=lambda x: x["eta_seconds"])
    return out[:limit]
