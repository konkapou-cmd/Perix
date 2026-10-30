"""Realtime-constrained bus/tram motion orchestration.

The engine never drives geometry and never invents route topology. It consumes:
- canonical path progress from routes.mobility,
- canonical edge/signal infrastructure from Phase 1,
- optional static traffic profiles,
- scheduled + GTFS-RT stop anchors.

Absolute lateness does not slow a vehicle. Only the stop-to-stop target duration
changes when delay changes between anchors.
"""
from __future__ import annotations

import hashlib
import time
from datetime import datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from database import db
from mobility.motion.bus import build_bus_leg
from mobility.motion.common import sample_trajectory
from mobility.motion.config import motion_config_for
from mobility.motion.diagnostics import lateness_flow, timeline_leg_contract
from mobility.motion.traffic import TrafficContext, traffic_snapshot_for_edges, validate_traffic_context
from mobility.motion.google_traffic import observation_revision
from mobility.motion import wait_recovery
from mobility.motion.tram import build_tram_leg
from mobility.signal_semantics import motion_signals_for_infrastructure
from mobility.regions import get_active_region
from mobility.motion.handover import (
    continuity_guard,
    find_handover_leg_index,
    handover_anchor_from_state,
    handover_enabled,
    stable_trip_identity,
    state_from_sample,
)

MOTION_SCHEMA_VERSION = 1
_PLAN_CACHE: dict = {}
_HANDOVER_STATE: dict = {}


def clear_motion_cache() -> None:
    _PLAN_CACHE.clear()
    _HANDOVER_STATE.clear()


def _timeline_signature(timeline: list[dict], *, include_prediction_revision: bool = False) -> str:
    parts = []
    for entry in timeline:
        parts.append(
            ":".join(
                [
                    str(entry.get("stop_id") or ""),
                    str(int(entry.get("predicted_arrival") or 0)),
                    str(int(entry.get("predicted_departure") or 0)),
                    str(entry.get("scheduled_arrival")),
                    str(entry.get("scheduled_departure")),
                    str(entry.get("scheduled")),
                    str(entry.get("relationship") or ""),
                ]
            )
        )
        if include_prediction_revision:
            evidence = entry.get("motion_prediction") or {}
            parts.append(repr((evidence.get("source"), evidence.get("source_timestamp"),
                               evidence.get("arrival_explicit"), evidence.get("departure_explicit"))))
    return hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:16]


def _source_timeline(timeline: list[dict]) -> list[dict]:
    # Effective outputs may be passed back by a caller; never fit them twice.
    return [
        {
            **entry,
            **{
                field: entry.get("raw_" + field, entry.get(field))
                for field in ("predicted_arrival", "predicted_departure")
            },
        }
        for entry in timeline
    ]


def _stop_departure(entry: dict, arrival: float) -> float:
    predicted_arrival = float(entry.get("predicted_arrival") or arrival)
    predicted_departure = float(entry.get("predicted_departure") or predicted_arrival)
    scheduled_arrival = float(entry.get("scheduled_arrival", predicted_arrival))
    scheduled_departure = float(entry.get("scheduled_departure", predicted_departure))
    dwell = max(0.0, predicted_departure - predicted_arrival,
                scheduled_departure - scheduled_arrival)
    return max(predicted_departure, scheduled_departure, arrival + dwell)


def _anchors(timeline: list[dict], stop_progress: list[float]) -> list[dict]:
    out = []
    for index, entry in enumerate(timeline):
        if index >= len(stop_progress):
            break
        if str(entry.get("relationship") or "SCHEDULED").upper() == "SKIPPED":
            continue
        out.append(
            {
                "timeline_index": index,
                "entry": entry,
                "progress_m": float(stop_progress[index]),
            }
        )
    return out


def _infra_matches_path(infra: dict, path: dict, config: dict) -> bool:
    infra_total = float(infra.get("total_m") or 0.0)
    path_total = float(path.get("total_m") or 0.0)
    if infra_total <= 0 or path_total <= 0:
        return False
    diff = abs(infra_total - path_total)
    tolerance = max(
        float(config["infrastructure_total_tolerance_m"]),
        path_total * float(config["infrastructure_total_tolerance_ratio"]),
    )
    return diff <= tolerance


def _plan_failure(failure: Optional[dict], reason: str, **details):
    if failure is not None:
        failure.clear()
        failure.update(
            {
                "reason": str(reason),
                "details": details,
            }
        )
    return None


def _arrival_recovery_hint(anchors, index, previous_plan, now_epoch, config):
    """Three fresh absolute revisions corroborate recovery, never a new ETA."""
    upcoming = anchors[index + 1:index + 4]
    threshold = wait_recovery._number(config.get("arrival_lookahead_threshold_s", 3.0))
    spread = wait_recovery._number(config.get("arrival_lookahead_spread_s", 5.0))
    if len(upcoming) != 3 or threshold is None or threshold <= 0 or spread is None or spread < 0:
        return None
    shifts = []
    last_before = last_after = None
    for anchor in upcoming:
        old = previous_plan["effective_timeline"][anchor["timeline_index"]]
        new = anchor["entry"]
        evidence = old.get("motion_prediction") or {}
        stamp = wait_recovery._number(evidence.get("source_timestamp"))
        before = wait_recovery._raw(old, "predicted_arrival")
        after = wait_recovery._raw(new, "predicted_arrival")
        if (evidence.get("source") != "GTFS_RT" or evidence.get("arrival_explicit") is not True or stamp is None
                or not 0 <= now_epoch - stamp <= wait_recovery.MAX_SOURCE_AGE_S
                or not wait_recovery._fresh_explicit(old, new, "arrival", now_epoch)
                or before is None or after is None):
            return None
        if last_before is not None and (before < last_before or after < last_after):
            return None
        last_before, last_after = before, after
        shifts.append(before - after)
    if (max(shifts) - min(shifts) > spread
            or not (min(shifts) >= threshold or max(shifts) <= -threshold)):
        return None
    return {"arrival_advances_s": shifts, "recoverable_s": max(0.0, min(shifts)),
            "released_cached_wait_s": 0.0}


def _fit_leg(builder, desired_duration_s: float, iterations: int) -> dict:
    """Fit soft traffic/signal delays without exceeding hard physical caps.

    Phase 2.1 adds observability fields only; the trajectory-selection behavior
    remains identical to Phase 2.
    """
    desired = max(1.0, float(desired_duration_s))
    natural = builder(0.0)
    natural_duration = float(natural.get("duration_s") or 0.0)
    if natural_duration <= 0:
        return {
            "trajectory": natural,
            "time_scale": 1.0,
            "physics_limited_s": 0.0,
            "fit": "EMPTY",
            "natural_duration_s": natural_duration,
            "fastest_duration_s": None,
            "recovery_ratio": float(natural.get("recovery_ratio") or 0.0),
        }

    if desired >= natural_duration:
        return {
            "trajectory": natural,
            "time_scale": desired / natural_duration,
            "physics_limited_s": 0.0,
            "fit": "NATURAL_STRETCH",
            "natural_duration_s": natural_duration,
            "fastest_duration_s": None,
            "recovery_ratio": float(natural.get("recovery_ratio") or 0.0),
        }

    fastest = builder(1.0)
    fastest_duration = float(fastest.get("duration_s") or natural_duration)
    if desired <= fastest_duration:
        return {
            "trajectory": fastest,
            "time_scale": 1.0,
            "physics_limited_s": max(0.0, fastest_duration - desired),
            "fit": "PHYSICS_LIMITED",
            "natural_duration_s": natural_duration,
            "fastest_duration_s": fastest_duration,
            "recovery_ratio": float(fastest.get("recovery_ratio") or 1.0),
        }

    low, high = 0.0, 1.0
    best = fastest
    for _ in range(max(1, int(iterations))):
        mid = (low + high) / 2.0
        candidate = builder(mid)
        duration = float(candidate.get("duration_s") or 0.0)
        if duration > desired:
            low = mid
        else:
            best = candidate
            high = mid

    best_duration = max(0.001, float(best.get("duration_s") or 0.001))
    return {
        "trajectory": best,
        # Stretching is safe; compression is never used.
        "time_scale": max(1.0, desired / best_duration),
        "physics_limited_s": 0.0,
        "fit": "RECOVERY_BLEND",
        "natural_duration_s": natural_duration,
        "fastest_duration_s": fastest_duration,
        "recovery_ratio": float(best.get("recovery_ratio") or 0.0),
    }


async def _build_trip_plan(
    *,
    trip_id: str,
    mode: str,
    version_id: str,
    timeline: list[dict],
    path: dict,
    now_local: datetime,
    failure: Optional[dict] = None,
    handover: Optional[dict] = None,
    now_service_s: Optional[float] = None,
    allow_live_fetch: bool = False,
    traffic_snapshot_out: Optional[dict] = None,
    departure_floor_s: Optional[float] = None,
    previous_plan: Optional[dict] = None,
    history_index: Optional[int] = None,
    traffic_context: TrafficContext = "baseline",
    frozen_bundle: Optional[dict] = None,
    provider_free: bool = False,
    native_recalibration: bool = False,
    allocation_research: bool = False,
) -> Optional[dict]:
    validate_traffic_context(traffic_context)
    if mode not in ("bus", "tram"):
        return _plan_failure(failure, "UNSUPPORTED_MODE")
    region = get_active_region()
    config = motion_config_for(mode, region)
    pattern_id = str(path.get("pattern_id") or "")
    if not version_id:
        return _plan_failure(failure, "NO_VERSION_ID")
    if not pattern_id:
        return _plan_failure(failure, "NO_PATTERN_ID")

    from mobility.generations import (
        atomic_generations_enabled,
        generation_matches_path,
        get_pattern_generation,
    )

    if frozen_bundle is not None or atomic_generations_enabled():
        bundle = frozen_bundle if frozen_bundle is not None else await get_pattern_generation(
            pattern_id,
            str(version_id),
            region_id=region.region_id,
            network_id=region.network_id,
        )
        if not bundle:
            return _plan_failure(
                failure,
                "GENERATION_NOT_FOUND",
                pattern_id=pattern_id,
                version_id=str(version_id),
            )
        if frozen_bundle is not None and (not bundle.get('ready') or any(
            str(bundle.get(k) or '') != str(v) for k, v in dict(region_id=region.region_id,
                network_id=region.network_id, version_id=version_id, pattern_id=pattern_id, mode=mode).items())
                or (bundle.get('geometry') or {}).get('validation', {}).get('valid') is not True):
            return _plan_failure(failure, 'FROZEN_SCOPE_MISMATCH')
        if not generation_matches_path(bundle, path):
            return _plan_failure(
                failure,
                "GENERATION_MISMATCH",
                path_generation=path.get("derived_generation"),
                bundle_generation=bundle.get("generation_id"),
                path_source=path.get("geometry_source"),
            )
        infra = bundle.get("infrastructure") or {}
    else:
        infra = await db.mobility_pattern_infrastructure.find_one(
            {
                "pattern_id": pattern_id,
                "version_id": str(version_id),
                "region_id": region.region_id,
                "network_id": region.network_id,
            },
            {"_id": 0},
        )
        if not infra:
            return _plan_failure(
                failure,
                "INFRASTRUCTURE_NOT_FOUND",
                pattern_id=pattern_id,
                version_id=str(version_id),
            )
    if not _infra_matches_path(infra, path, config):
        infra_total = float(infra.get("total_m") or 0.0)
        path_total = float(path.get("total_m") or 0.0)
        tolerance = max(
            float(config["infrastructure_total_tolerance_m"]),
            path_total * float(config["infrastructure_total_tolerance_ratio"]),
        )
        return _plan_failure(
            failure,
            "INFRASTRUCTURE_PATH_MISMATCH",
            infra_total_m=round(infra_total, 3),
            path_total_m=round(path_total, 3),
            difference_m=round(abs(infra_total - path_total), 3),
            tolerance_m=round(tolerance, 3),
        )

    stop_progress = path.get("stop_progress") or []
    anchors = _anchors(timeline, stop_progress)
    if len(anchors) < 2:
        return _plan_failure(
            failure,
            "INSUFFICIENT_MOTION_ANCHORS",
            anchor_count=len(anchors),
        )

    lookahead_scope = None
    lookahead_previous = None
    if (config.get("arrival_lookahead_enabled", False) and traffic_context == "baseline"
            and not native_recalibration and not allocation_research and not wait_recovery.enabled()
            and now_local.tzinfo is not None):
        # Same scope as existing cached handover; do not compare across journeys.
        day = (now_local.astimezone(ZoneInfo(region.timezone)) - timedelta(
            hours=getattr(region, "service_day_start_hour", 4))).date().isoformat()
        lookahead_scope = hashlib.sha1(repr((region.region_id, region.network_id, version_id,
            trip_id, mode, pattern_id, path.get("derived_generation"), path.get("geometry_source"),
            path.get("geometry_fingerprint"), path.get("total_m"), stop_progress, day)).encode()).hexdigest()
        if (previous_plan and previous_plan.get("arrival_lookahead_scope") == lookahead_scope
                and wait_recovery._same_topology(previous_plan["effective_timeline"], timeline)):
            lookahead_previous = previous_plan

    handover_leg_index = None
    if handover is not None:
        handover_leg_index = find_handover_leg_index(
            anchors,
            float(handover.get("progress_m") or 0.0),
        )
        if handover_leg_index is None:
            handover = None

    loop_start = handover_leg_index if handover_leg_index is not None else 0
    if handover_leg_index is None and history_index is not None:
        loop_start = next(
            (i for i, anchor in enumerate(anchors)
             if anchor["timeline_index"] == history_index), 0,
        )

    traffic_snapshot = {"provider": None, "profile_versions": [], "by_edge": {}}
    if str(mode) == "bus" and not provider_free:
        traffic_edges_input = infra.get("edges") or []
        traffic_snapshot = await traffic_snapshot_for_edges(
            traffic_edges_input,
            now_local,
            region_id=region.region_id,
            network_id=region.network_id,
            allow_live_fetch=allow_live_fetch,
            traffic_context=traffic_context,
        )
    traffic_by_edge = traffic_snapshot.get("by_edge") or {}
    traffic_expires_at = min(
        (datetime.fromisoformat(value["expires_at"]).timestamp()
         for value in traffic_by_edge.values()
         if value.get("provider") == "GOOGLE_ROUTES" and value.get("expires_at")),
        default=None,
    )
    if traffic_snapshot_out is not None:
        traffic_snapshot_out.update(traffic_snapshot)

    effective_timeline = [
        {**entry, "raw_predicted_arrival": entry.get("predicted_arrival"),
         "raw_predicted_departure": entry.get("predicted_departure")}
        for entry in timeline
    ]
    trip_segments = []
    origin_index = int(anchors[loop_start]["timeline_index"])
    if previous_plan is not None:
        for index in range(origin_index + 1):
            previous_entry = previous_plan["effective_timeline"][index]
            for field in ("predicted_arrival", "predicted_departure"):
                effective_timeline[index][field] = previous_entry[field]
        for segment in previous_plan["segments"]:
            if float(segment["t0"]) >= float(now_service_s):
                break
            if (int(segment["next_timeline_index"]) < origin_index
                    or (segment["kind"] == "MOVE"
                        and int(segment["next_timeline_index"]) <= origin_index)
                    or (handover is not None and float(segment["t0"]) < float(now_service_s))):
                trip_segments.append({**segment, "t1": min(float(segment["t1"]), float(now_service_s))})
    effective_arrival = float(effective_timeline[origin_index]["predicted_arrival"])
    final_arrival_target_error = 0.0
    max_arrival_target_error = 0.0
    total_incremental_physics_limited = 0.0
    total_recovered_lateness = 0.0
    models = set()
    traffic_edges = 0
    signal_stops = 0

    for index in range(loop_start, len(anchors) - 1):
        current = anchors[index]
        nxt = anchors[index + 1]
        current_entry = current["entry"]
        next_entry = nxt["entry"]

        is_handover_leg = (
            handover is not None
            and handover_leg_index is not None
            and index == handover_leg_index
        )
        leg_start_m = (
            max(
                float(current["progress_m"]),
                min(
                    float(handover.get("progress_m") or 0.0),
                    float(nxt["progress_m"]) - 0.001,
                ),
            )
            if is_handover_leg
            else float(current["progress_m"])
        )
        initial_speed_kmh = (
            max(0.0, float(handover.get("speed_kmh") or 0.0))
            if is_handover_leg
            else 0.0
        )

        if is_handover_leg:
            effective_departure = float(
                now_service_s
                if now_service_s is not None
                else handover.get("service_s")
            )
            current_arrival_target_error = max(
                0.0,
                float(handover.get("carried_lateness_s") or 0.0),
            )
        else:
            effective_departure = _stop_departure(current_entry, effective_arrival)
            departure_without_cached_wait = effective_departure
            if previous_plan is not None and index == loop_start:
                effective_departure = max(
                    effective_departure,
                    float(effective_timeline[origin_index]["predicted_departure"]),
                )
            if index == 0 and departure_floor_s is not None:
                effective_departure = max(effective_departure, float(departure_floor_s))
            current_arrival_target_error = max(
                0.0,
                effective_arrival
                - float(
                    current_entry.get("predicted_arrival")
                    or effective_arrival
                ),
            )

        if not is_handover_leg:
            effective_timeline[int(current["timeline_index"])]["predicted_arrival"] = effective_arrival
            effective_timeline[int(current["timeline_index"])]["predicted_departure"] = effective_departure

        if not is_handover_leg and effective_departure > effective_arrival:
            trip_segments.append(
                {
                    "kind": "DWELL",
                    "t0": effective_arrival,
                    "t1": effective_departure,
                    "progress_m": float(current["progress_m"]),
                    "timeline_index": int(current["timeline_index"]),
                    "next_timeline_index": int(current["timeline_index"]),
                    "arrival_target_error_s": round(current_arrival_target_error, 3),
                    "physics_limited_s": round(current_arrival_target_error, 3),
                }
            )

        desired_arrival = float(
            next_entry.get("predicted_arrival") or effective_departure + 1.0
        )
        desired_duration = max(1.0, desired_arrival - effective_departure)
        contract = timeline_leg_contract(current_entry, next_entry)
        scheduled_duration = float(contract["scheduled_duration_s"])
        delay_delta = int(contract["delay_delta_s"])

        motion_signals = motion_signals_for_infrastructure(
            infra,
            str(mode),
        )

        if str(mode) == "tram":
            def builder(recovery_ratio: float):
                return build_tram_leg(
                    edges=infra.get("edges") or [],
                    signals=motion_signals,
                    start_m=leg_start_m,
                    end_m=float(nxt["progress_m"]),
                    departure_service_s=effective_departure,
                    config=config,
                    recovery_ratio=recovery_ratio,
                    initial_speed_kmh=initial_speed_kmh,
                )
        else:
            def builder(recovery_ratio: float):
                return build_bus_leg(
                    edges=infra.get("edges") or [],
                    signals=motion_signals,
                    traffic_by_edge=traffic_by_edge,
                    start_m=leg_start_m,
                    end_m=float(nxt["progress_m"]),
                    departure_service_s=effective_departure,
                    config=config,
                    recovery_ratio=recovery_ratio,
                    initial_speed_kmh=initial_speed_kmh,
                )

        fitted = _fit_leg(
            builder,
            desired_duration,
            int(config["calibration_iterations"]),
        )
        lookahead = (_arrival_recovery_hint(anchors, index, lookahead_previous, now_local.timestamp(), config)
                     if lookahead_previous is not None else None)
        if (lookahead and lookahead["recoverable_s"] > 0 and not is_handover_leg and index == loop_start
                and wait_recovery._fresh_explicit(previous_plan["effective_timeline"][origin_index],
                                                  current_entry, "departure", now_local.timestamp())
                and not current_entry.get("departure_confirmed")
                and not previous_plan["effective_timeline"][origin_index].get("departure_confirmed")):
            # The normal fitter has already exhausted soft recovery if limited.
            # Only the obsolete cached hold is optional, never source/minimum dwell.
            floor = max(departure_without_cached_wait, float(now_service_s),
                        float(departure_floor_s) if index == 0 and departure_floor_s is not None else 0.0)
            release = min(lookahead["recoverable_s"], float(fitted["physics_limited_s"]),
                          max(0.0, effective_departure - floor))
            if release > 0:
                prior_departure = effective_departure
                effective_departure -= release
                duration_target = max(1.0, desired_arrival - effective_departure)
                candidate = _fit_leg(builder, duration_target, int(config["calibration_iterations"]))
                if (effective_departure + candidate["trajectory"]["duration_s"] * candidate["time_scale"]
                        <= prior_departure + fitted["trajectory"]["duration_s"] * fitted["time_scale"]):
                    fitted, desired_duration = candidate, duration_target
                    effective_timeline[origin_index]["predicted_departure"] = effective_departure
                    trip_segments[-1]["t1"] = effective_departure
                    lookahead["released_cached_wait_s"] = release
                else:
                    effective_departure = prior_departure
        allocation_report = None
        from mobility.motion import time_allocation
        if (time_allocation.enabled() or allocation_research) and not native_recalibration:
            def scenario_builder(scenario, evidence):
                args = dict(edges=infra.get('edges') or [],
                    signals=time_allocation.eligible_signals(infra, str(mode), leg_start_m, float(nxt['progress_m']),
                        float(config.get('allocation_stop_buffer_m', 20.0))),
                    start_m=scenario.get('candidate_start_m',leg_start_m), end_m=float(nxt['progress_m']),
                    departure_service_s=effective_departure, config=config,
                    initial_speed_kmh=scenario.get('candidate_initial_speed_kmh',initial_speed_kmh), scenario=scenario)
                if mode == 'bus':
                    args['recovery_ratio'] = scenario.get('candidate_recovery_ratio',0.)
                if mode == 'tram':
                    return build_tram_leg(**args)
                return build_bus_leg(**args, traffic_by_edge={**traffic_by_edge, **evidence})

            comparison_baseline = fitted
            if fitted.get('fastest_duration_s') is None:
                comparison_baseline = {**fitted, 'fastest_duration_s': builder(1.0).get('duration_s')}
            allocated, allocation_report = time_allocation.allocate(comparison_baseline, scenario_builder,
                desired_duration, infra=infra, mode=str(mode), start_m=leg_start_m,
                end_m=float(nxt['progress_m']), config=config,
                initial_speed_kmh=initial_speed_kmh,
                **({'shadow_elapsed_s':float(now_service_s)-effective_departure}
                   if mode=='bus' and now_service_s is not None else {}))
            allocation_report['shadow_only'] = True  # Research remains non-passenger.
        # Recalibrate only the active remaining leg. Later stop constraints are
        # still resolved sequentially by the existing fitter, carrying any
        # physical miss forward. Do not run a new nonlinear fit at every future
        # stop before the vehicle has even reached it.
        if native_recalibration and provider_free and mode == 'bus' and index == loop_start:
            from mobility.motion.native_recalibration import fit_remaining_leg
            prior_leg = next((s for s in (previous_plan or {}).get('segments', [])
                if s['kind'] == 'MOVE' and s['next_timeline_index'] == int(nxt['timeline_index'])
                and is_handover_leg and s['t0'] <= effective_departure < s['t1']), None)
            try:
                fitted = fit_remaining_leg(infra=infra, start_m=leg_start_m,
                    end_m=float(nxt['progress_m']), initial_speed_kmh=initial_speed_kmh,
                    target_s=desired_arrival-effective_departure, departure_service_s=effective_departure,
                    config=config, previous_leg=prior_leg,
                    retain_previous=bool(prior_leg and previous_plan and abs(float(
                        previous_plan['effective_timeline'][int(nxt['timeline_index'])].get(
                            'raw_predicted_arrival', previous_plan['effective_timeline'][int(nxt['timeline_index'])]['predicted_arrival']))
                        - desired_arrival) < 1e-6))
            except ValueError as exc:
                return _plan_failure(failure, str(exc))
        trajectory = fitted["trajectory"]
        duration = (
            float(trajectory.get("duration_s") or 0.0)
            * float(fitted["time_scale"])
        )
        if duration <= 0:
            return _plan_failure(
                failure,
                "EMPTY_LEG_TRAJECTORY",
                from_timeline_index=int(current["timeline_index"]),
                next_timeline_index=int(nxt["timeline_index"]),
                from_stop_id=current_entry.get("stop_id"),
                to_stop_id=next_entry.get("stop_id"),
            )

        effective_next_arrival = effective_departure + duration
        if is_handover_leg:
            carried = max(
                0.0,
                float(handover.get("carried_lateness_s") or 0.0),
            )
            arrival_target_error = max(
                0.0,
                effective_next_arrival
                - float(contract["predicted_arrival_s"]),
            )
            flow = {
                "carried_lateness_s": round(carried, 3),
                "arrival_target_error_s": round(
                    arrival_target_error,
                    3,
                ),
                "incremental_physics_limited_s": round(
                    max(0.0, arrival_target_error - carried),
                    3,
                ),
                "recovered_lateness_s": round(
                    max(0.0, carried - arrival_target_error),
                    3,
                ),
            }
        else:
            flow = lateness_flow(
                predicted_departure_s=float(
                    contract["predicted_departure_s"]
                ),
                effective_departure_s=effective_departure,
                predicted_arrival_s=float(
                    contract["predicted_arrival_s"]
                ),
                effective_arrival_s=effective_next_arrival,
            )
        arrival_target_error = float(flow["arrival_target_error_s"])
        incremental_physics_limited = float(flow["incremental_physics_limited_s"])
        recovered_lateness = float(flow["recovered_lateness_s"])

        final_arrival_target_error = arrival_target_error
        max_arrival_target_error = max(
            max_arrival_target_error,
            arrival_target_error,
        )
        total_incremental_physics_limited += incremental_physics_limited
        total_recovered_lateness += recovered_lateness
        models.add(str(trajectory.get("model") or ""))
        traffic_edges += int(trajectory.get("traffic_edge_count") or 0)
        signal_stops += int(trajectory.get("signal_stop_count") or 0)

        trip_segments.append(
            {
                "kind": "MOVE",
                "t0": effective_departure,
                "t1": effective_next_arrival,
                "trajectory": trajectory,
                "time_scale": float(fitted["time_scale"]),
                "from_timeline_index": int(current["timeline_index"]),
                "next_timeline_index": int(nxt["timeline_index"]),
                "from_stop_id": current_entry.get("stop_id"),
                "to_stop_id": next_entry.get("stop_id"),
                "requested_duration_s": round(desired_duration, 3),
                "predicted_leg_duration_s": contract["predicted_leg_duration_s"],
                "scheduled_duration_s": round(scheduled_duration, 3),
                "natural_duration_s": round(
                    float(fitted.get("natural_duration_s") or 0.0),
                    3,
                ),
                "fastest_duration_s": (
                    round(float(fitted["fastest_duration_s"]), 3)
                    if fitted.get("fastest_duration_s") is not None
                    else None
                ),
                "recovery_ratio": round(
                    float(fitted.get("recovery_ratio") or 0.0),
                    6,
                ),
                "delay_delta_s": delay_delta,
                "handover_applied": bool(is_handover_leg),
                "handover_from_progress_m": (
                    round(float(handover["progress_m"]), 3)
                    if is_handover_leg
                    else None
                ),
                "handover_initial_speed_kmh": (
                    round(initial_speed_kmh, 3)
                    if is_handover_leg
                    else None
                ),
                **flow,
                # Backward-compatible diagnostic alias: this is the amount
                # by which the effective arrival misses the realtime target.
                "physics_limited_s": round(arrival_target_error, 3),
                "fit": fitted.get("fit"),
                **({"arrival_lookahead": lookahead} if lookahead is not None else {}),
                **({'native_recalibration': fitted['native_recalibration']}
                   if 'native_recalibration' in fitted else {}),
                **({'time_allocation': allocation_report} if allocation_report is not None else {}),
            }
        )
        effective_arrival = effective_next_arrival

    final = anchors[-1]
    final_entry = final["entry"]
    final_arrival_target_error = max(
        0.0,
        effective_arrival - float(final_entry.get("predicted_arrival") or effective_arrival),
    )
    max_arrival_target_error = max(
        max_arrival_target_error,
        final_arrival_target_error,
    )
    final_departure = _stop_departure(final_entry, effective_arrival)
    if previous_plan is not None and loop_start == len(anchors) - 1:
        final_departure = max(final_departure, float(effective_timeline[origin_index]["predicted_departure"]))
    effective_timeline[int(final["timeline_index"])]["predicted_arrival"] = effective_arrival
    effective_timeline[int(final["timeline_index"])]["predicted_departure"] = final_departure
    for entry in effective_timeline:
        scheduled = entry.get("scheduled_arrival", entry.get("scheduled"))
        if scheduled is not None:
            entry["delay_seconds"] = float(entry["predicted_arrival"]) - float(scheduled)
    if final_departure > effective_arrival:
        trip_segments.append(
            {
                "kind": "DWELL",
                "t0": effective_arrival,
                "t1": final_departure,
                "progress_m": float(final["progress_m"]),
                "timeline_index": int(final["timeline_index"]),
                "next_timeline_index": int(final["timeline_index"]),
                "arrival_target_error_s": round(final_arrival_target_error, 3),
                "physics_limited_s": round(final_arrival_target_error, 3),
            }
        )

    return {
        "schema_v": MOTION_SCHEMA_VERSION,
        **({"arrival_lookahead_scope": lookahead_scope} if lookahead_scope is not None else {}),
        "trip_id": str(trip_id),
        "pattern_id": pattern_id,
        "mode": str(mode),
        "segments": trip_segments,
        "effective_timeline": effective_timeline,
        "start_s": float(trip_segments[0]["t0"]) if trip_segments else effective_arrival,
        "end_s": float(trip_segments[-1]["t1"]) if trip_segments else final_departure,
        "traffic_edge_count": traffic_edges,
        "signal_stop_count": signal_stops,
        # Do not sum per-leg target misses: later legs contain carried
        # lateness from previous legs. Keep final/max/incremental separately.
        "physics_limited_s": round(final_arrival_target_error, 3),
        "final_arrival_target_error_s": round(final_arrival_target_error, 3),
        "max_arrival_target_error_s": round(max_arrival_target_error, 3),
        "incremental_physics_limited_s": round(
            total_incremental_physics_limited,
            3,
        ),
        "recovered_lateness_s": round(total_recovered_lateness, 3),
        "motion_model": (
            next(iter(models))
            if len(models) == 1
            else "+".join(sorted(x for x in models if x))
        ),
        "motion_quality": "PHYSICS_TRAFFIC" if traffic_edges else "PHYSICS_BASELINE",
        "traffic_provider": traffic_snapshot.get("provider"),
        "traffic_expires_at": traffic_expires_at,
        "traffic_profile_versions": traffic_snapshot.get("profile_versions") or [],
        "handover_applied": bool(handover is not None),
        "handover_from_progress_m": (
            round(float(handover["progress_m"]), 3)
            if handover is not None
            else None
        ),
    }


def _sample_trip_plan(
    plan: dict,
    now_sec: float,
    timeline: list[dict],
    stop_progress: list[float],
) -> dict:
    segments = plan.get("segments") or []
    if not segments:
        return {}

    now_value = float(now_sec)
    # At t0, sample the segment itself: a handover can already be mid-leg.
    if now_value < float(segments[0]["t0"]):
        first_index = int(
            segments[0].get("from_timeline_index")
            or segments[0].get("timeline_index")
            or 0
        )
        return {
            "progress_m": float(stop_progress[first_index]),
            "speed_kmh": 0.0,
            "motion_state": "AT_STOP",
            "next_timeline_index": first_index,
        }

    selected = None
    for segment in segments:
        if (float(segment["t0"]) <= now_value < float(segment["t1"])
                or (segment is segments[-1] and now_value == float(segment["t1"]))):
            selected = segment
            break
    if selected is None:
        last_index = int(
            segments[-1].get("next_timeline_index")
            or segments[-1].get("timeline_index")
            or (len(timeline) - 1)
        )
        return {
            "progress_m": float(stop_progress[last_index]),
            "speed_kmh": 0.0,
            "motion_state": "AT_STOP",
            "next_timeline_index": last_index,
        }

    if selected["kind"] == "DWELL":
        index = int(selected["timeline_index"])
        target_error = round(
            float(selected.get("arrival_target_error_s") or 0.0),
            2,
        )
        return {
            "progress_m": float(selected["progress_m"]),
            "speed_kmh": 0.0,
            "motion_state": "DWELL",
            "next_timeline_index": index,
            "delay_delta_s": 0,
            "physics_limited_s": target_error,
            "arrival_target_error_s": target_error,
            "incremental_physics_limited_s": 0.0,
            "carried_lateness_s": target_error,
            "recovered_lateness_s": 0.0,
            "fit": "DWELL",
            "handover_applied": False,
            "handover_from_progress_m": None,
            "handover_initial_speed_kmh": None,
        }

    sample = sample_trajectory(
        selected["trajectory"],
        now_value - float(selected["t0"]),
        float(selected.get("time_scale") or 1.0),
    )
    return {
        "progress_m": float(sample["progress_m"]),
        "speed_kmh": round(float(sample["speed_kmh"]), 2),
        "motion_state": str(sample.get("state") or "MOVING"),
        "next_timeline_index": int(selected["next_timeline_index"]),
        "leg_from_stop_id": selected.get("from_stop_id"),
        "leg_to_stop_id": selected.get("to_stop_id"),
        "delay_delta_s": int(selected.get("delay_delta_s") or 0),
        "scheduled_duration_s": selected.get("scheduled_duration_s"),
        "predicted_leg_duration_s": selected.get("predicted_leg_duration_s"),
        "engine_available_duration_s": selected.get("requested_duration_s"),
        "natural_duration_s": selected.get("natural_duration_s"),
        "fastest_duration_s": selected.get("fastest_duration_s"),
        "recovery_ratio": selected.get("recovery_ratio"),
        "physics_limited_s": round(
            float(selected.get("physics_limited_s") or 0.0),
            2,
        ),
        "arrival_target_error_s": round(
            float(selected.get("arrival_target_error_s") or 0.0),
            2,
        ),
        "incremental_physics_limited_s": round(
            float(selected.get("incremental_physics_limited_s") or 0.0),
            2,
        ),
        "carried_lateness_s": round(
            float(selected.get("carried_lateness_s") or 0.0),
            2,
        ),
        "recovered_lateness_s": round(
            float(selected.get("recovered_lateness_s") or 0.0),
            2,
        ),
        "handover_applied": bool(selected.get("handover_applied")),
        "handover_from_progress_m": selected.get(
            "handover_from_progress_m"
        ),
        "handover_initial_speed_kmh": selected.get(
            "handover_initial_speed_kmh"
        ),
        "fit": selected.get("fit"),
    }


async def _acquire_trip_plan(
    *,
    trip_id: str,
    mode: str,
    version_id: str,
    timeline: list[dict],
    path: dict,
    now_sec: int,
    allow_live_fetch: bool,
    departure_floor_s: Optional[float],
    traffic_context: TrafficContext,
) -> tuple:
    validate_traffic_context(traffic_context)
    region = get_active_region()
    config = motion_config_for(mode, region)
    wait_only = wait_recovery.enabled() and traffic_context == "baseline"
    timeline_signature = _timeline_signature(timeline, include_prediction_revision=wait_only)
    identity = stable_trip_identity(
        region_id=region.region_id,
        network_id=region.network_id,
        version_id=str(version_id),
        pattern_id=str(path.get("pattern_id") or ""),
        trip_id=str(trip_id),
        derived_generation=path.get("derived_generation"),
    )
    now_local = datetime.now(ZoneInfo(region.timezone))
    service_date = (now_local - timedelta(
        hours=getattr(region, "service_day_start_hour", 4),
    )).date().isoformat()
    geometry = (str(path.get("geometry_source") or ""),
                float(path.get("total_m") or 0.0),
                tuple(path.get("stop_progress") or []))
    identity += (service_date, str(mode), geometry, traffic_context)
    if wait_only:
        identity += ("WAIT_ONLY_V1",)
    revision = observation_revision(region.region_id, region.network_id) if traffic_context == "google_locator" and mode == "bus" else None
    traffic_bucket = (f"{now_local.date().isoformat()}:{now_local.hour:02d}:{now_local.minute // 15}"
                      if traffic_context == "baseline" else None)
    key = (
        region.region_id,
        region.network_id,
        str(version_id),
        str(path.get("pattern_id") or ""),
        str(trip_id),
        str(mode),
        path.get("derived_generation"),
        service_date,
        geometry,
        departure_floor_s,
        timeline_signature,
        traffic_bucket,
        traffic_context,
        revision,
    )
    if wait_only:
        key += ("WAIT_ONLY_V1",)
    now_mono = time.monotonic()
    previous_state = _HANDOVER_STATE.get(identity)
    state_present = previous_state is not None
    if previous_state is not None and not (
        0.0 <= float(now_sec) - float(previous_state["service_s"]) <= 90.0
        and 0.0 <= now_mono - float(previous_state["updated_mono"]) <= 90.0
    ):
        previous_state = None
    cached = _PLAN_CACHE.get(key)
    failure: dict = {}
    traffic_expiry = (cached or {}).get("plan", {}).get("traffic_expires_at")
    if (cached
            and (not allow_live_fetch or cached.get("allow_live_fetch", False))
            and 0.0 <= now_mono - float(cached.get("cached_at") or 0.0) <= float(config["plan_cache_seconds"])
            and (traffic_expiry is None or now_local.timestamp() < traffic_expiry)):
        plan = cached["plan"]
    else:
        handover_anchor = None
        previous_plan = None
        history_index = None
        if handover_enabled() or wait_only:
            previous_cached = next((value for value in reversed(list(_PLAN_CACHE.values()))
                                    if value.get("identity") == identity), None)
            if state_present and previous_state is None:
                previous_cached = None
            if previous_cached is not None and (
                0.0 <= now_mono - float((previous_state or {}).get("updated_mono", previous_cached["cached_at"])) <= 90.0
                and 0.0 <= float(now_sec) - float((previous_state or {}).get("service_s", previous_cached["service_s"])) <= 90.0
                and previous_cached.get("identity") == identity
            ):
                candidate = previous_cached["plan"]
                # Stop indices cannot be carried across changed stop topology.
                if (float(now_sec) >= float(candidate["start_s"])
                        and [entry.get("stop_id") for entry in candidate["effective_timeline"]]
                        == [entry.get("stop_id") for entry in timeline]):
                    prior_sample = _sample_trip_plan(candidate, now_sec, timeline, path.get("stop_progress") or [])
                    if prior_sample:
                        previous_plan = candidate
                        if prior_sample.get("motion_state") not in {"DWELL", "AT_STOP"}:
                            handover_anchor = handover_anchor_from_state(
                                state_from_sample(sample=prior_sample, service_s=float(now_sec),
                                                  timeline_signature=timeline_signature),
                                now_service_s=float(now_sec),
                                total_m=float(path.get("total_m") or 0.0),
                            )
                        else:
                            history_index = int(prior_sample["next_timeline_index"])
        plan = (wait_recovery.reconcile_waits(
            previous_plan, timeline, now_s=float(now_sec), now_epoch=now_local.timestamp(),
            departure_floor_s=departure_floor_s,
        ) if wait_only and previous_plan is not None else None)
        if plan is None:
            plan = await _build_trip_plan(
                trip_id=str(trip_id),
                mode=str(mode),
                version_id=str(version_id),
                timeline=timeline,
                path=path,
                now_local=now_local,
                failure=failure,
                handover=handover_anchor,
                now_service_s=float(now_sec),
                allow_live_fetch=allow_live_fetch,
                departure_floor_s=departure_floor_s,
                previous_plan=previous_plan,
                history_index=history_index,
                traffic_context=traffic_context,
            )
        if not plan:
            return None, key, identity, previous_state, now_mono, failure
        for stale_key, stale_value in list(_PLAN_CACHE.items()):
            # Only the current plan may be reused, even if raw inputs switch back.
            if stale_value.get("identity") == identity:
                _PLAN_CACHE.pop(stale_key, None)
                continue
            if now_mono - float(stale_value.get("cached_at") or 0.0) > 90.0 and not any(
                state.get("plan_key") == stale_key
                and 0.0 <= now_mono - float(state.get("updated_mono", 0.0)) <= 90.0
                for state in _HANDOVER_STATE.values()
            ):
                _PLAN_CACHE.pop(stale_key, None)
        if traffic_context == "google_locator" and mode == "bus":
            # Google observation revision is at the original key offset, even
            # when a separately scoped experimental cache suffix is present.
            key = (*key[:13], observation_revision(region.region_id, region.network_id), *key[14:])
        _PLAN_CACHE[key] = {"cached_at": now_mono, "plan": plan,
                            "identity": identity, "service_s": float(now_sec),
                            "allow_live_fetch": bool(allow_live_fetch)}

    return plan, key, identity, previous_state, now_mono, failure


async def effective_timeline_for_trip(
    *,
    trip_id: str,
    mode: str,
    version_id: str,
    timeline: list[dict],
    path: dict,
    now_sec: int,
    allow_live_fetch: bool = False,
    departure_floor_s: Optional[float] = None,
    traffic_context: TrafficContext = "baseline",
) -> list[dict]:
    """Return effective stop clocks without emitting or clamping vehicle state.

    Failure preserves the caller's entries. Successful outputs retain raw
    prediction aliases and can safely be supplied again without compounding.
    """
    plan, *_ = await _acquire_trip_plan(
        trip_id=trip_id, mode=mode, version_id=version_id,
        timeline=_source_timeline(timeline), path=path, now_sec=now_sec,
        allow_live_fetch=allow_live_fetch, departure_floor_s=departure_floor_s,
        traffic_context=traffic_context,
    )
    return [dict(entry) for entry in (plan["effective_timeline"] if plan else timeline)]


async def position_for_trip(
    *,
    trip_id: str,
    mode: str,
    version_id: str,
    timeline: list[dict],
    path: dict,
    now_sec: int,
    include_failure_reason: bool = False,
    allow_live_fetch: bool = False,
    departure_floor_s: Optional[float] = None,
    traffic_context: TrafficContext = "baseline",
) -> Optional[dict]:
    """Return physics progress, or an optional explainable legacy-fallback reason."""
    timeline = _source_timeline(timeline)
    plan, key, identity, previous_state, now_mono, failure = await _acquire_trip_plan(
        trip_id=trip_id, mode=mode, version_id=version_id, timeline=timeline,
        path=path, now_sec=now_sec, allow_live_fetch=allow_live_fetch,
        departure_floor_s=departure_floor_s,
        traffic_context=traffic_context,
    )
    if not plan:
        if include_failure_reason:
            return {"motion_available": False,
                    "fallback_reason": failure.get("reason") or "PLAN_BUILD_FAILED",
                    "fallback_details": failure.get("details") or {}}
        return None

    stop_progress = path.get("stop_progress") or []
    sampled = _sample_trip_plan(plan, now_sec, timeline, stop_progress)
    if not sampled:
        if include_failure_reason:
            return {
                "motion_available": False,
                "fallback_reason": "PLAN_SAMPLE_EMPTY",
                "fallback_details": {},
            }
        return None

    if handover_enabled():
        sampled = continuity_guard(
            sampled,
            previous_state,
        )

    next_index = max(
        0,
        min(len(timeline) - 1, int(sampled["next_timeline_index"])),
    )
    next_entry = timeline[next_index]
    progress = max(
        0.0,
        min(
            float(path.get("total_m") or 0.0),
            float(sampled["progress_m"]),
        ),
    )
    next_progress = (
        float(stop_progress[next_index])
        if next_index < len(stop_progress)
        else progress
    )
    sampled["progress_m"] = progress
    _HANDOVER_STATE[identity] = {
        **state_from_sample(
            sample=sampled,
            service_s=float(now_sec),
            timeline_signature=_timeline_signature(
                timeline, include_prediction_revision=wait_recovery.enabled() and traffic_context == "baseline",
            ),
        ),
        "updated_mono": now_mono,
        "plan_key": key,
    }
    for stale_identity, stale_state in list(_HANDOVER_STATE.items()):
        if (
            now_mono
            - float(stale_state.get("updated_mono") or now_mono)
            > 300.0
        ):
            _HANDOVER_STATE.pop(stale_identity, None)

    return {
        **sampled,
        "motion_available": True,
        "effective_timeline": [dict(entry) for entry in plan["effective_timeline"]],
        "progress_m": progress,
        "next_timeline_index": next_index,
        "next_stop_id": next_entry.get("stop_id"),
        "next_stop_name": next_entry.get("name")
        or (next_entry.get("stop") or {}).get("name"),
        "distance_to_next_stop_m": max(0.0, next_progress - progress),
        "motion_model": plan.get("motion_model"),
        "motion_quality": plan.get("motion_quality"),
        "traffic_edge_count": int(plan.get("traffic_edge_count") or 0),
        "signal_stop_count": int(plan.get("signal_stop_count") or 0),
        "traffic_provider": plan.get("traffic_provider"),
        **({"wait_only_recovery": dict(plan["wait_only_recovery"])}
           if "wait_only_recovery" in plan else {}),
        "traffic_profile_versions": plan.get("traffic_profile_versions") or [],
        "plan_final_arrival_target_error_s": plan.get(
            "final_arrival_target_error_s"
        ),
        "plan_max_arrival_target_error_s": plan.get(
            "max_arrival_target_error_s"
        ),
        "plan_incremental_physics_limited_s": plan.get(
            "incremental_physics_limited_s"
        ),
        "handover_applied": bool(sampled.get("handover_applied")),
        "handover_from_progress_m": sampled.get(
            "handover_from_progress_m"
        ),
        "handover_initial_speed_kmh": sampled.get(
            "handover_initial_speed_kmh"
        ),
        "continuity_clamp_m": float(
            sampled.get("continuity_clamp_m") or 0.0
        ),
        "backward_resample_prevented_m": float(
            sampled.get("backward_resample_prevented_m") or 0.0
        ),
    }
