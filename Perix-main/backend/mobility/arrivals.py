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
                "vehicle_id": (gps or {}).get("vehicle_id") if gps else f"est_{tt.get('route_number')}_{tid}",
            }
        )
    out.sort(key=lambda x: x["eta_seconds"])
    return out[:limit]
