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


def _verified_block_predecessor_vehicle(network, route, target_trip,
                                        templates_by_trip, route_runs, vehicles):
    """Return one located vehicle on the immediately preceding verified block trip.

    The route estimator has already accepted the vehicle's current trip. This
    additionally requires the same source block, the estimator's own chained
    run topology, an adjacent predecessor (not any older trip), and one exact
    dated vehicle identity. Proximity or route text alone never links trips.
    """
    target_id=str(target_trip.get("trip_id") or "")
    target_block=str(target_trip.get("block_id") or "")
    if not target_id or not target_block:
        return None
    runs_with_target=[]
    for run in route_runs:
        for index,window in enumerate(run.get("trips") or []):
            if str(window.get("trip",{}).get("trip_id") or "")==target_id:
                runs_with_target.append((run,index))
    if len(runs_with_target)!=1:
        return None
    run,index=runs_with_target[0]
    if index<1:
        return None
    previous_trip=run["trips"][index-1]["trip"]
    previous_id=str(previous_trip.get("trip_id") or "")
    previous_block=str(previous_trip.get("block_id") or "")
    if not previous_id or previous_block!=target_block:
        return None
    previous_template=templates_by_trip.get(previous_id) or {}
    expected_version=str(network.get("version_id") or "")
    from routes.mobility import _network_service_date
    expected_date=str(_network_service_date(network) or "")
    route_number=str(route.get("route_number") or "")
    mode=str(route.get("mode") or "")
    from routes.mobility import _estimated_vehicle_id
    expected_run_vehicle_id=_estimated_vehicle_id(
        network,route_number,str(run["trips"][0]["trip"].get("trip_id") or ""))
    eligible=[]
    for vehicle in vehicles:
        if (str(vehicle.get("trip_id") or "")!=previous_id
                or str(vehicle.get("network_version_id") or "")!=expected_version
                or str(vehicle.get("service_date") or "")!=expected_date
                or str(vehicle.get("route_number") or "")!=route_number
                or str(vehicle.get("mode") or "")!=mode
                or vehicle.get("latitude") is None or vehicle.get("longitude") is None):
            continue
        if previous_template.get("pattern_id") and vehicle.get("pattern_id"):
            if str(vehicle["pattern_id"])!=str(previous_template["pattern_id"]):
                continue
        if vehicle.get("estimated"):
            if (vehicle.get("run_identity_basis")!="GTFS_BLOCK"
                    or str(vehicle.get("vehicle_id") or "")!=expected_run_vehicle_id
                    or not previous_template.get("pattern_id")
                    or str(vehicle.get("pattern_id") or "")!=str(previous_template["pattern_id"])):
                continue
        eligible.append(vehicle)
    return eligible[0] if len(eligible)==1 else None


async def unified_arrivals(stop_id: str, limit: int = 20, *, dated_context: Optional[dict] = None,
                            platform_id: Optional[str] = None, visual_rule_version: Optional[str] = None) -> List[dict]:
    from mobility.domain import NETWORK_ID, build_domain
    from mobility.overrides import canceled_trip_ids, skipped_stop_ids
    from mobility.eta_quality import eta_source_for_stop
    from mobility.eta_position import position_eta_consistency
    from mobility.display_labels import display_alias
    from routes.mobility import (
        _get_active_network,
        _now_service_seconds,
        _network_service_date,
        _predicted_stop_timeline,
        _timeline_for_vehicle,
        _realtime_delays_for,
    )

    if dated_context is None:
        from routes.mobility import networks_for_journey_window
        out = []
        for network in await networks_for_journey_window():
            out.extend(await unified_arrivals(stop_id, limit, dated_context=network, platform_id=platform_id,
                visual_rule_version=visual_rule_version))
        out.sort(key=lambda x: x["eta_seconds"])
        return out[:limit]
    network = dated_context
    if not network:
        return []
    from mobility.v2 import _domain
    domain = await _domain(network=network)
    if not domain:
        return []
    net = domain.get('network') or {}
    pat_by_id = {str(p.get('pattern_id')): p for p in domain.get('patterns') or []}

    platform_ids = set()
    for stop in domain["stops"]:
        ids = {str(x) for x in stop.get("stop_ids", [])}
        if str(stop.get("stop_id")) == str(stop_id) or str(stop_id) in ids:
            platform_ids = ids
            break
    if not platform_ids:
        return []
    if platform_id is not None:
        if str(platform_id) not in platform_ids:
            return []
        platform_ids = {str(platform_id)}

    # Route number alone is not a trip identity (branches/short turns share it).
    trips_by_id = {
        str(trip.get("trip_id")): (route, trip)
        for route in network.get("routes", [])
        for trip in (route.get("trips") or [])
        if trip.get("trip_id") is not None
    }
    templates_by_trip={str(template.get("trip_id") or ""):template
                       for template in domain.get("trip_templates") or []}
    candidates = [
        t
        for t in domain["trip_templates"]
        if platform_ids & {str(x) for x in (t.get("stop_ids") or [])}
    ]
    if not candidates:
        return []  # Physical inventory does not imply a trip or require a fleet fit.
    trip_ids = [t["trip_id"] for t in candidates]
    # Split networks: hydrate only the candidate routes' windows + times.
    if network.get("routes_split"):
        from mobility.network_store import attach_route_times as _attach_times
        from mobility.network_store import attach_route_windows as _attach_windows

        needed_routes = {str(tt.get("route_number")) for tt in candidates}
        routes_holder = network.get("routes") or []
        await _attach_windows(routes_holder, str(network.get("version_id") or ""), route_numbers=needed_routes)
        await _attach_times(routes_holder, str(network.get("version_id") or ""), route_numbers=needed_routes)
    delays = await _realtime_delays_for(trip_ids, network=network)
    canceled = await canceled_trip_ids()
    skipped_ov = await skipped_stop_ids()
    now = _now_service_seconds(_network_service_date(network))
    import time
    eta_sampled_at_ms = time.time()*1000

    # Fresh GPS states -> LIVE quality per trip
    states = await db.mobility_vehicle_state.find({}, {"_id": 0}).to_list(200)
    gps_by_trip = {}
    for st in states:
        from routes.mobility import _vehicle_in_network
        if not _vehicle_in_network(st, network):
            continue
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
    for v in await _all_active_vehicles(network=network,
            **({'visual_rule_version':visual_rule_version} if visual_rule_version == 'station-cycle-v2' else {})):
        if v.get("latitude") is not None and v.get("longitude") is not None:
            pos_by_id[str(v.get("vehicle_id"))] = v
    pos_by_trip = {str(v.get("trip_id")): v for v in pos_by_id.values() if v.get("trip_id")}
    platform_by_id = {str(p.get("platform_id")): p for s in domain.get("stops", [])
                      for p in s.get("platforms", [])}
    route_runs_cache={}

    def route_runs(route):
        key=id(route)
        if key not in route_runs_cache:
            from routes.mobility import _chain_trips
            route_runs_cache[key]=_chain_trips(route,delays,canceled)
        return route_runs_cache[key]

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
        trip_match = trips_by_id.get(tid)
        if not trip_match:
            continue
        route, trip = trip_match
        rt = delays.get(tid)
        if rt and str(rt.get("trip_schedule_relationship") or "").upper() in ("CANCELED", "DELETED"):
            continue
        active_vehicle = pos_by_trip.get(tid)
        timeline = _timeline_for_vehicle(route, trip, rt, active_vehicle)
        revision = (active_vehicle or {}).get("_motion_plan_revision") if (active_vehicle or {}).get("estimated") else None
        if revision:
            rt = active_vehicle.get("_prediction_realtime") or rt
        physical_next_index = (active_vehicle or {}).get("_motion_next_timeline_index") if revision else None
        visual_motion = (active_vehicle or {}).get('motion') or {}
        visual = revision and visual_motion.get('model') == 'TIME_NORMALIZED_VISUAL_ESTIMATE'
        visual_waiting_index = None
        preview = visual_motion.get('preview') or {}
        current_ms = time.time()*1000
        if (visual and preview.get('sampled_at_ms', current_ms+1) <= current_ms < preview.get('valid_until_ms', 0)):
            elapsed = (current_ms-preview['sampled_at_ms'])/1000
            phase = next((p for p in preview.get('phases', []) if p['t0'] <= elapsed < p['t1']), None)
            if phase:
                physical_next_index = phase.get('stop_occurrence_index', preview.get('stop_occurrence_index'))
                if phase.get('state') == 'VISUAL_STOP_ESTIMATE':
                    visual_waiting_index = physical_next_index
        skipped = skipped_ov.get(tid, set())
        entry = next(
            (
                e
                for index, e in enumerate(timeline)
                if str(e.get("stop_id")) in platform_ids
                and e.get("relationship") != "SKIPPED"
                and str(e.get("stop_id")) not in skipped
                and (type(physical_next_index) is not int or index >= physical_next_index)
                and (int(e.get("predicted_departure", 0)) >= now or index == visual_waiting_index)
            ),
            None,
        )
        if not entry:
            continue
        gps = gps_by_trip.get(tid)
        position_vehicle=pos_by_id.get(str(gps.get("vehicle_id"))) if gps and gps.get("vehicle_id") else active_vehicle
        if position_vehicle and not (
            str(position_vehicle.get("trip_id") or "") == tid
            and str(position_vehicle.get("network_version_id") or "") == str(network.get("version_id") or "")
            and str(position_vehicle.get("service_date") or "") == str(_network_service_date(network) or "")
            and str(position_vehicle.get("pattern_id") or "") == str(tt.get("pattern_id") or "")
        ):
            position_vehicle=None
        vehicle_link_basis="EXACT_TRIP" if position_vehicle else None
        if position_vehicle is None:
            position_vehicle=_verified_block_predecessor_vehicle(
                network,route,trip,templates_by_trip,route_runs(route),pos_by_id.values())
            if position_vehicle:
                vehicle_link_basis="VERIFIED_BLOCK_PREDECESSOR"
        from routes.mobility import _estimated_vehicle_id
        vehicle_id=(str(position_vehicle.get("vehicle_id")) if position_vehicle else
            str(gps.get("vehicle_id")) if gps and gps.get("vehicle_id") else
            _estimated_vehicle_id(network,tt.get('route_number'),tid))
        distance_m = None
        actual_platform = platform_by_id.get(str(entry["stop_id"])) or {}
        target_lat = actual_platform.get("latitude", (entry.get("stop") or {}).get("lat"))
        target_lng = actual_platform.get("longitude", (entry.get("stop") or {}).get("lng"))
        matched_vehicle = position_vehicle
        if target_lat is not None and target_lng is not None:
            veh = matched_vehicle
            if veh:
                distance_m = round(_hav_m(veh["latitude"], veh["longitude"], target_lat, target_lng))
        raw_eta_source = eta_source_for_stop(rt, entry.get("stop_id"), entry)
        from mobility.timing_evidence import timing_evidence
        modelled = revision and entry.get("prediction_basis") == "PERIX_MOTION_PLAN"
        eta_source = "PERIX_ESTIMATE" if modelled else raw_eta_source
        eta_seconds = max(0, int(entry['predicted_arrival']) - now)
        cycle = next((c for c in (active_vehicle or {}).get('_visual_station_cycles') or []
            if c.get('stop_occurrence_index') == timeline.index(entry)), None) if visual else None
        countdown_target = cycle.get('countdown_target_at_ms') if cycle else eta_sampled_at_ms+(entry['predicted_arrival']-now)*1000
        consistency = position_eta_consistency(tt.get('mode'), eta_seconds, distance_m)
        if visual:
            consistency = {'status': 'NOT_APPLICABLE_VISUAL_PROGRESS', 'required_kmh': None}
        # Preserve the estimate and flag discrepancies; hiding distance must not
        # make an inconsistent virtual position appear verified.
        pat = pat_by_id.get(str(tt.get('pattern_id'))) or {}
        alias = display_alias(
            tt.get('pattern_id'), tt.get('route_number'), tt.get('mode'),
            pat.get('stop_ids') or [], net.get('service_date'),
            net.get('region_id'), net.get('network_id')) or {}
        out.append(
            {
                "trip_instance_id": tt.get("trip_instance_id"),
                "trip_id": tid,
                "pattern_id": tt.get("pattern_id"),
                "network_version_id": network.get("version_id"),
                "service_date": _network_service_date(network),
                "route_number": tt.get("route_number"),
                "direction": trip.get("headsign"),
                "mode": tt.get("mode"),
                "eta_seconds": eta_seconds,
                "eta_sampled_at_ms": eta_sampled_at_ms,
                "effective_arrival_at_ms": eta_sampled_at_ms+(entry['predicted_arrival']-now)*1000,
                "countdown_event": cycle['countdown_event'] if cycle else 'ARRIVAL',
                "countdown_target_at_ms": countdown_target,
                "countdown_seconds": max(0,(countdown_target-time.time()*1000)/1000) if countdown_target is not None else None,
                **({'station_cycle': cycle} if cycle else {}),
                **alias,
                "position_eta_consistency": consistency['status'],
                "position_required_kmh": consistency['required_kmh'],
                "predicted": _fmt_service_time(int(entry["predicted_arrival"])),
                "scheduled_arrival": _fmt_service_time(int(entry["scheduled_arrival"])),
                "scheduled_departure": _fmt_service_time(int(entry["scheduled_departure"])),
                "predicted_arrival": _fmt_service_time(int(entry["predicted_arrival"])),
                "predicted_departure": _fmt_service_time(int(entry["predicted_departure"])),
                "delay_seconds": int(entry.get("delay_seconds") or 0),
                "departure_delay_seconds": int(entry["predicted_departure"] - entry["scheduled_departure"]),
                "source": eta_source,  # source of the TIME, not the position
                "eta_source": eta_source,
                "source_eta_source": raw_eta_source,
                "timing_evidence": timing_evidence(entry),
                "provider_predicted_arrival": _fmt_service_time(entry["provider_predicted_arrival_s"]) if entry.get("provider_predicted_arrival_s") is not None else None,
                "provider_predicted_departure": _fmt_service_time(entry["provider_predicted_departure_s"]) if entry.get("provider_predicted_departure_s") is not None else None,
                "source_predicted_arrival": _fmt_service_time(int(entry.get("source_predicted_arrival", entry["predicted_arrival"]))),
                "source_predicted_departure": _fmt_service_time(int(entry.get("source_predicted_departure", entry["predicted_departure"]))),
                "prediction_basis": entry.get("prediction_basis", "SOURCE_TIMELINE"),
                "motion_plan_revision": revision if modelled or visual else None,
                **({'position_assurance': 'TIME_NORMALIZED_VISUAL_ESTIMATE', 'observed_arrival': False}
                   if visual else {}),
                "platform_id": str(entry["stop_id"]),
                "platform_latitude": target_lat,
                "platform_longitude": target_lng,
                "position_source": "LIVE" if gps or (position_vehicle and not position_vehicle.get("estimated")) else "ESTIMATED",
                "realtime_updated_at": rt.get("updated_at") if raw_eta_source.startswith("REALTIME") else None,
                "realtime_feed_timestamp": rt.get("feed_timestamp") if raw_eta_source.startswith("REALTIME") else None,
                "vehicle_id": vehicle_id,
                **({"vehicle_link_basis":vehicle_link_basis,
                    "position_trip_id":str(position_vehicle.get("trip_id")),
                    "position_trip_instance_id":f"{NETWORK_ID}:{network.get('version_id')}:{_network_service_date(network)}:{position_vehicle.get('trip_id')}",
                    "position_pattern_id":position_vehicle.get("pattern_id"),
                    "position_route_number":position_vehicle.get("route_number"),
                    "position_mode":position_vehicle.get("mode"),
                    "position_assurance":((position_vehicle.get("motion") or {}).get("model")),
                    "position_motion_plan_revision":position_vehicle.get("_motion_plan_revision")}
                    if position_vehicle else {}),
                "platform_code": actual_platform.get("platform_code"),
                "position_latitude": matched_vehicle.get("latitude") if matched_vehicle else None,
                "position_longitude": matched_vehicle.get("longitude") if matched_vehicle else None,
                "next_stop_id": matched_vehicle.get("next_stop_id") if matched_vehicle else None,
                "next_stop_name": matched_vehicle.get("next_stop_name") if matched_vehicle else None,
                "distance_to_stop_m": distance_m,
                "distance_kind": "STRAIGHT_LINE" if distance_m is not None else None,
            }
        )
    out.sort(key=lambda x: x["eta_seconds"])
    return out[:limit]
