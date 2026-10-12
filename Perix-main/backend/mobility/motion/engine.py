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
from mobility.regions import get_active_region

MOTION_SCHEMA_VERSION = 1
_PLAN_CACHE: dict = {}


def clear_motion_cache() -> None:
    _PLAN_CACHE.clear()


def _timeline_signature(timeline: list[dict]) -> str:
    parts = []
    for entry in timeline:
        parts.append(
            ":".join(
                [
                    str(entry.get("stop_id") or ""),
                    str(int(entry.get("predicted_arrival") or 0)),
                    str(int(entry.get("predicted_departure") or 0)),
                    str(entry.get("relationship") or ""),
                ]
            )
        )
    return hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:16]


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
) -> Optional[dict]:
    region = get_active_region()
    config = motion_config_for(mode, region)
    pattern_id = str(path.get("pattern_id") or "")
    if not version_id:
        return _plan_failure(failure, "NO_VERSION_ID")
    if not pattern_id:
        return _plan_failure(failure, "NO_PATTERN_ID")

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
    effective_arrival = float(anchors[0]["entry"]["predicted_arrival"])
    final_arrival_target_error = 0.0
    max_arrival_target_error = 0.0
    total_incremental_physics_limited = 0.0
    total_recovered_lateness = 0.0
    models = set()
    traffic_edges = 0
    signal_stops = 0

    for index in range(len(anchors) - 1):
        current = anchors[index]
        nxt = anchors[index + 1]
        current_entry = current["entry"]
        next_entry = nxt["entry"]

        predicted_departure = float(
            current_entry.get("predicted_departure") or effective_arrival
        )
        effective_departure = max(effective_arrival, predicted_departure)
        current_arrival_target_error = max(
            0.0,
            effective_arrival - float(current_entry.get("predicted_arrival") or effective_arrival),
        )

        if effective_departure > effective_arrival:
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

        if str(mode) == "tram":
            def builder(recovery_ratio: float):
                return build_tram_leg(
                    edges=infra.get("edges") or [],
                    signals=infra.get("signals") or [],
                    start_m=float(current["progress_m"]),
                    end_m=float(nxt["progress_m"]),
                    departure_service_s=effective_departure,
                    config=config,
                    recovery_ratio=recovery_ratio,
                )
        else:
            def builder(recovery_ratio: float):
                return build_bus_leg(
                    edges=infra.get("edges") or [],
                    signals=infra.get("signals") or [],
                    traffic_by_edge=traffic_by_edge,
                    start_m=float(current["progress_m"]),
                    end_m=float(nxt["progress_m"]),
                    departure_service_s=effective_departure,
                    config=config,
                    recovery_ratio=recovery_ratio,
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
        flow = lateness_flow(
            predicted_departure_s=float(contract["predicted_departure_s"]),
            effective_departure_s=effective_departure,
            predicted_arrival_s=float(contract["predicted_arrival_s"]),
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
    final_departure = max(
        effective_arrival,
        float(final_entry.get("predicted_departure") or effective_arrival),
    )
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
        "trip_id": str(trip_id),
        "pattern_id": pattern_id,
        "mode": str(mode),
        "segments": trip_segments,
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
    if now_value <= float(segments[0]["t0"]):
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
        "fit": selected.get("fit"),
    }


async def position_for_trip(
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
    region = get_active_region()
    config = motion_config_for(mode, region)
    now_local = datetime.now(ZoneInfo(region.timezone))
    traffic_bucket = f"{now_local.date().isoformat()}:{now_local.hour:02d}:{now_local.minute // 15}"
    key = (
        region.region_id,
        region.network_id,
        str(version_id),
        str(path.get("pattern_id") or ""),
        str(trip_id),
        _timeline_signature(timeline),
        traffic_bucket,
    )

    now_mono = time.monotonic()
    cached = _PLAN_CACHE.get(key)
    failure: dict = {}
    if cached and now_mono - float(cached.get("cached_at") or 0.0) <= float(config["plan_cache_seconds"]):
        plan = cached["plan"]
    else:
        plan = await _build_trip_plan(
            trip_id=str(trip_id),
            mode=str(mode),
            version_id=str(version_id),
            timeline=timeline,
            path=path,
            now_local=now_local,
            failure=failure,
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
        _PLAN_CACHE[key] = {"cached_at": now_mono, "plan": plan}

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

    return {
        **sampled,
        "motion_available": True,
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
    }
