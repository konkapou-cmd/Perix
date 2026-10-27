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
import math
import asyncio
import time
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from database import db
from mobility.motion.bus import build_bus_leg
from mobility.motion.common import sample_trajectory
from mobility.motion.config import motion_config_for
from mobility.motion.diagnostics import lateness_flow, timeline_leg_contract
from mobility.motion.traffic import traffic_snapshot_for_edges
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
_PLAN_GATES: dict = {}


def clear_motion_cache() -> None:
    _PLAN_CACHE.clear()
    _HANDOVER_STATE.clear()
    _PLAN_GATES.clear()
    from mobility.motion.timeline_fallback import clear_fallback_cache
    clear_fallback_cache()


def cached_trip_windows(*, region_id: str, network_id: str,
                        version_id: str, service_date: str) -> dict:
    """Candidate retention only; clocks are resolved again from fresh evidence."""
    now = time.monotonic()
    windows = {}
    for key, value in _PLAN_CACHE.items():
        if (len(key) < 7 or key[:3] != (region_id, network_id, str(version_id))
                or key[6] != str(service_date) or not 0 <= now-value.get("cached_at", 0) <= 90):
            continue
        timeline = value["plan"].get("effective_timeline") or []
        if len(timeline) < 2:
            continue
        tid = str(key[4])
        if tid not in windows or value["cached_at"] > windows[tid]["cached_at"]:
            windows[tid] = {"start": timeline[0]["predicted_arrival"],
                            "end": timeline[-1]["predicted_departure"],
                            "cached_at": value["cached_at"]}
    from mobility.motion.timeline_fallback import cached_trip_windows as fallback_windows
    for trip_id, window in fallback_windows(region_id=region_id, network_id=network_id,
            version_id=version_id, service_date=service_date).items():
        if trip_id not in windows or window['cached_at'] > windows[trip_id]['cached_at']:
            windows[trip_id] = window
    return windows


def _timeline_signature(timeline: list[dict]) -> str:
    parts = []
    for entry in timeline:
        parts.append(
            ":".join(
                [
                    str(entry.get("stop_id") or ""),
                    str(int(entry.get("predicted_arrival") or 0)),
                    str(int(entry.get("predicted_departure") or 0)),
                    str(entry.get("scheduled_arrival", entry.get("scheduled", ""))),
                    str(entry.get("scheduled_departure", "")),
                    str(entry.get("relationship") or ""),
                    str(entry.get("stop_sequence")),
                    str(entry.get("timing_basis") or ""),
                    str(entry.get("departure_timing_basis") or ""),
                    str(entry.get("timing_anchor_stop_id") or ""),
                    str(entry.get("timing_anchor_sequence")),
                    str(entry.get("provider_predicted_arrival_s")),
                    str(entry.get("provider_predicted_departure_s")),
                    str(entry.get("timing_order_adjusted") or False),
                    str(entry.get("timing_next_anchor_stop_id") or ""),
                    str(entry.get("timing_next_anchor_sequence")),
                ]
            )
        )
    return hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:16]


def _source_timeline(timeline: list[dict]) -> list[dict]:
    """Never feed a prior effective projection back as new provider evidence."""
    return [{**entry,
             "predicted_arrival": entry.get("source_predicted_arrival", entry["predicted_arrival"]),
             "predicted_departure": entry.get("source_predicted_departure", entry["predicted_departure"])}
            for entry in timeline]


def effective_timeline_from_plan(timeline: list[dict], plan: dict,
                                 previous_plan: Optional[dict] = None) -> list[dict]:
    """Project clocks from this exact plan; raw/scheduled anchors stay intact."""
    source = _source_timeline(timeline)
    result = [{**entry, "source_predicted_arrival": entry["predicted_arrival"],
               "source_predicted_departure": entry["predicted_departure"],
               "prediction_basis": "SOURCE_TIMELINE"} for entry in source]
    segments = plan.get("segments") or []
    first = next((s for s in segments if s.get("kind") == "MOVE"), None)
    origin = int(first["from_timeline_index"]) if first else plan.get("history_index")
    history = (previous_plan or {}).get("effective_timeline") or []
    if (origin is not None and len(history) == len(result)
            and [e.get("stop_id") for e in history] == [e.get("stop_id") for e in result]):
        for index in range(origin + 1):
            if str(result[index].get("relationship")).upper() != "SKIPPED":
                for key in ("predicted_arrival", "predicted_departure", "prediction_basis"):
                    result[index][key] = history[index].get(key, result[index].get(key))

    def update(index, field, value):
        if type(index) is not int or not 0 <= index < len(result):
            raise ValueError("Invalid motion timeline occurrence")
        if str(result[index].get("relationship")).upper() == "SKIPPED":
            return
        result[index][field] = int(math.ceil(float(value)))
        result[index]["prediction_basis"] = "PERIX_MOTION_PLAN"

    for segment in segments:
        if segment.get("kind") == "MOVE":
            if not segment.get("handover_applied"):
                update(segment["from_timeline_index"], "predicted_departure", segment["t0"])
            update(segment["next_timeline_index"], "predicted_arrival", segment["t1"])
        elif segment.get("kind") == "DWELL":
            update(segment["timeline_index"], "predicted_arrival", segment["t0"])
            update(segment["timeline_index"], "predicted_departure", segment["t1"])
    for entry in result:
        entry["predicted_departure"] = max(entry["predicted_arrival"], entry["predicted_departure"])
        scheduled = entry.get("scheduled_arrival", entry.get("scheduled"))
        if scheduled is not None:
            entry["delay_seconds"] = entry["predicted_arrival"] - scheduled
    return result


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
    previous_plan: Optional[dict] = None,
    history_index: Optional[int] = None,
    source_anchor_index: Optional[int] = None,
) -> Optional[dict]:
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

    if atomic_generations_enabled():
        bundle = await get_pattern_generation(
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

    handover_leg_index = None
    if handover is not None:
        handover_leg_index = find_handover_leg_index(
            anchors,
            float(handover.get("progress_m") or 0.0),
        )
        if handover_leg_index is None:
            handover = None

    history_leg = next((i for i, anchor in enumerate(anchors)
                        if anchor["timeline_index"] == history_index), None)
    source_leg = next((i for i, anchor in enumerate(anchors)
                       if anchor["timeline_index"] == source_anchor_index), None)
    loop_start = (handover_leg_index if handover_leg_index is not None
                  else source_leg if source_leg is not None else history_leg or 0)

    traffic_snapshot = {"provider": None, "profile_versions": [], "by_edge": {}}
    if str(mode) == "bus":
        traffic_snapshot = await traffic_snapshot_for_edges(
            infra.get("edges") or [],
            now_local,
            region_id=region.region_id,
            network_id=region.network_id,
        )
    traffic_by_edge = traffic_snapshot.get("by_edge") or {}

    trip_segments = []
    effective_arrival = (
        float(handover.get("service_s"))
        if handover is not None
        else float(anchors[loop_start]["entry"]["predicted_arrival"])
    )
    if history_leg is not None and previous_plan:
        effective_arrival = float(previous_plan["effective_timeline"][history_index]["predicted_arrival"])
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

        predicted_departure = float(
            current_entry.get("predicted_departure") or effective_arrival
        )
        source_dwell = max(0.0, predicted_departure - float(current_entry["predicted_arrival"]))
        if history_leg is not None and index == history_leg and now_service_s is not None:
            predicted_departure = max(predicted_departure, float(now_service_s))
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
            # A physically late arrival must not erase the source's explicit
            # boarding dwell. Shift its duration with arrival, not only its
            # expired wall clock. Zero-duration source stops remain unchanged.
            source_departure = float(current_entry["predicted_departure"])
            dwell_floor = effective_arrival + source_dwell if source_departure <= effective_arrival else effective_arrival
            effective_departure = max(dwell_floor, predicted_departure)
            current_arrival_target_error = max(
                0.0,
                effective_arrival
                - float(
                    current_entry.get("predicted_arrival")
                    or effective_arrival
                ),
            )

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
    source_final_departure = float(final_entry["predicted_departure"])
    final_dwell = max(0.0, source_final_departure - float(final_entry["predicted_arrival"]))
    final_departure = (effective_arrival + final_dwell if source_final_departure <= effective_arrival
                       else source_final_departure)
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

    plan = {
        "schema_v": MOTION_SCHEMA_VERSION,
        "trip_id": str(trip_id),
        "pattern_id": pattern_id,
        "mode": str(mode),
        "segments": trip_segments,
        "history_index": history_index,
        "source_anchor_index": source_anchor_index,
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
        "traffic_profile_versions": traffic_snapshot.get("profile_versions") or [],
        "handover_applied": bool(handover is not None),
        "handover_from_progress_m": (
            round(float(handover["progress_m"]), 3)
            if handover is not None
            else None
        ),
    }
    plan["effective_timeline"] = effective_timeline_from_plan(timeline, plan, previous_plan)
    return plan


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
    # At a handover's exact t0, sample the partial trajectory's actual start;
    # returning the original stop here causes a backward clamp and extra lag.
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
        if float(segment["t0"]) <= now_value <= float(segment["t1"]):
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


async def position_for_trip(**kwargs) -> Optional[dict]:
    """Serialize one dated trip's plan replacement, not the whole fleet."""
    region = get_active_region()
    path = kwargs.get("path") or {}
    key = (region.region_id, region.network_id, str(kwargs.get("version_id")),
           str(kwargs.get("trip_id")), str(kwargs.get("mode")),
           str(path.get("service_date") or ""), str(path.get("pattern_id") or ""),
           str(path.get("derived_generation") or ""))
    gate = _PLAN_GATES.setdefault(key, {"lock": asyncio.Lock(), "users": 0})
    gate["users"] += 1
    try:
        async with gate["lock"]:
            return await _position_for_trip_locked(**kwargs)
    finally:
        gate["users"] -= 1
        if gate["users"] == 0 and _PLAN_GATES.get(key) is gate:
            _PLAN_GATES.pop(key, None)


async def _position_for_trip_locked(
    *,
    trip_id: str,
    mode: str,
    version_id: str,
    timeline: list[dict],
    path: dict,
    now_sec: int,
    include_failure_reason: bool = False,
) -> Optional[dict]:
    """Return physics progress, or an optional explainable legacy-fallback reason."""
    timeline = _source_timeline(timeline)
    region = get_active_region()
    config = motion_config_for(mode, region)
    timeline_signature = _timeline_signature(timeline)
    identity = stable_trip_identity(
        region_id=region.region_id,
        network_id=region.network_id,
        version_id=str(version_id),
        pattern_id=str(path.get("pattern_id") or ""),
        trip_id=str(trip_id),
        derived_generation=path.get("derived_generation"),
    )
    identity = (*identity, str(path.get("service_date") or ""))
    previous_state = _HANDOVER_STATE.get(identity)
    now_local = datetime.now(ZoneInfo(region.timezone))
    traffic_bucket = f"{now_local.date().isoformat()}:{now_local.hour:02d}:{now_local.minute // 15}"
    key = (
        region.region_id,
        region.network_id,
        str(version_id),
        str(path.get("pattern_id") or ""),
        str(trip_id),
        str(mode),
        str(path.get("service_date") or ""),
        path.get("derived_generation"),
        path.get("geometry_fingerprint"),
        path.get("geometry_source"),
        path.get("osm_snapshot_v"),
        timeline_signature,
        traffic_bucket,
    )

    now_mono = time.monotonic()
    if previous_state and not (
        0 <= float(now_sec) - float(previous_state.get("service_s", 0)) <= 90
        and 0 <= now_mono - float(previous_state.get("updated_mono", 0)) <= 90
    ):
        previous_state = None
    cached = _PLAN_CACHE.get(key)
    failure: dict = {}
    source_correction = None
    reconciled_now = False
    from mobility.motion.source_reconciliation import estimate_revision, source_frontier_conflict, source_start_index, MODEL_EPOCH
    revision_token = estimate_revision(identity)
    if cached and now_mono - float(cached.get("cached_at") or 0.0) <= float(config["plan_cache_seconds"]):
        plan = cached["plan"]
        revision_token = cached.get("estimate_revision") or revision_token
        source_correction = cached.get("source_correction")
    else:
        handover_anchor = None
        previous_plan = None
        history_index = None
        prior = None
        old_progress = None
        prior = next((value for value in reversed(list(_PLAN_CACHE.values()))
                      if value.get("identity") == identity
                      and 0 <= now_mono - value.get("cached_at", 0) <= 90), None)
        if prior:
            candidate = prior["plan"]
            revision_token = prior.get("estimate_revision") or revision_token
            if (candidate.get("effective_timeline")
                    and [e.get("stop_id") for e in candidate["effective_timeline"]] == [e.get("stop_id") for e in timeline]
                    and float(now_sec) >= candidate["start_s"]):
                sample = _sample_trip_plan(candidate, now_sec, timeline, path.get("stop_progress") or [])
                if sample:
                    old_progress = float(sample["progress_m"])
                    previous_source = prior.get("source_timeline") or _source_timeline(candidate["effective_timeline"])
                    source_correction = source_frontier_conflict(previous_source, timeline,
                        path.get("stop_progress") or [], old_progress, float(now_sec))
                    if source_correction:
                        previous_state = None
                        reconciled_now = True
                        revision_token = estimate_revision(identity, timeline_signature)
                    elif handover_enabled():
                        previous_plan = candidate
                        if sample.get("motion_state") in ("DWELL", "AT_STOP"):
                            history_index = int(sample["next_timeline_index"])
                        else:
                            # Sample NOW, not an older poll relabelled with now.
                            handover_anchor = handover_anchor_from_state(
                                state_from_sample(sample=sample, service_s=float(now_sec), timeline_signature=timeline_signature),
                                now_service_s=float(now_sec), total_m=float(path.get("total_m") or 0.0))
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
            previous_plan=previous_plan,
            history_index=history_index,
            source_anchor_index=source_start_index(timeline, now_sec) if previous_plan is None and handover_anchor is None else None,
        )
        if not plan:
            if include_failure_reason:
                return {
                    "motion_available": False,
                    "fallback_reason": failure.get("reason") or "PLAN_BUILD_FAILED",
                    "fallback_details": failure.get("details") or {},
                }
            return None
        for stale_key, stale_value in list(_PLAN_CACHE.items()):
            if now_mono - float(stale_value.get("cached_at") or 0.0) > 60.0:
                _PLAN_CACHE.pop(stale_key, None)
        if source_correction:
            for stale_key, value in list(_PLAN_CACHE.items()):
                if value.get("identity") == identity:
                    _PLAN_CACHE.pop(stale_key, None)
        _PLAN_CACHE[key] = {"cached_at": now_mono, "plan": plan, "identity": identity,
                            "source_timeline": [dict(e) for e in timeline],
                            "estimate_revision": revision_token, "source_correction": source_correction,
                            "source_signature": timeline_signature,
                            "diagnostic_at": (prior or {}).get("diagnostic_at", 0)}
        from mobility.source_diagnostics import record_source_event
        if (not prior or prior.get("source_signature") != timeline_signature or source_correction
                or now_mono - prior.get("diagnostic_at", 0) >= 60):
            _PLAN_CACHE[key]["diagnostic_at"] = now_mono
            record_source_event({"kind": "ESTIMATE_CORRECTED" if source_correction else "SOURCE_PLAN_REFRESH",
            "region_id": region.region_id, "network_id": region.network_id, "version_id": str(version_id),
            "service_date": str(path.get("service_date") or ""), "trip_id": str(trip_id),
            "pattern_id": str(path.get("pattern_id") or ""), "source_signature": timeline_signature,
            "model_epoch": MODEL_EPOCH, **(source_correction or {}),
            "model_timeline": [[e.get("stop_id"), e.get("stop_sequence"), e["predicted_arrival"], e["predicted_departure"]]
                               for e in plan.get("effective_timeline") or []],
            "timeline": [[e.get("stop_id"), e.get("stop_sequence"), e.get("scheduled_arrival", e.get("scheduled")), e.get("scheduled_departure", e.get("scheduled")),
                e["predicted_arrival"], e["predicted_departure"], e.get("timing_basis"),
                e.get("timing_anchor_stop_id"), e.get("timing_anchor_delay_seconds")] for e in timeline]})

    # A refresh produces a new revision; every consumer receives clocks from it.
    cached_at = _PLAN_CACHE[key]["cached_at"]
    revision = hashlib.sha256(repr((key, cached_at)).encode()).hexdigest()[:20]
    effective_timeline = plan.get("effective_timeline") or effective_timeline_from_plan(timeline, plan)

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

    if handover_enabled() and not reconciled_now:
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
    if reconciled_now:
        from mobility.source_diagnostics import record_source_event
        record_source_event({"kind": "RECONCILIATION_RESULT", "region_id": region.region_id,
            "network_id": region.network_id, "version_id": str(version_id),
            "service_date": str(path.get("service_date") or ""), "trip_id": str(trip_id),
            "pattern_id": str(path.get("pattern_id") or ""), "source_signature": timeline_signature,
            "old_progress_m": old_progress, "new_progress_m": progress, **(source_correction or {})})
    _HANDOVER_STATE[identity] = {
        **state_from_sample(
            sample=sampled,
            service_s=float(now_sec),
            timeline_signature=timeline_signature,
        ),
        "updated_mono": now_mono,
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
        "effective_timeline": [dict(entry) for entry in effective_timeline],
        "motion_plan_revision": revision,
        "motion_available": True,
        "estimate_revision": revision_token,
        "source_correction": source_correction,
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
