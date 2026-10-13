"""On-demand motion calibration report builder.

This module is intentionally outside the hot vehicle-position path. It may
build several trajectory variants per leg in order to explain why a trip is
limited. The normal motion engine does not pay this cost.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from database import db
from mobility.motion.bus import build_bus_leg
from mobility.motion.config import motion_config_for
from mobility.motion.diagnostics import (
    DIAGNOSTICS_SCHEMA_VERSION,
    diagnostic_warnings,
    leg_input_coverage,
    lateness_flow,
    timeline_leg_contract,
    trajectory_metrics,
)
from mobility.motion.engine import _build_trip_plan
from mobility.motion.traffic import traffic_snapshot_for_edges
from mobility.motion.tram import build_tram_leg
from mobility.regions import get_active_region


def _round(value, digits: int = 3):
    if value is None:
        return None
    return round(float(value), digits)


def _average_speed_kmh(distance_m: float, duration_s: float) -> float:
    if float(duration_s) <= 0:
        return 0.0
    return float(distance_m) / float(duration_s) * 3.6


def _soft_components(
    *,
    mode: str,
    natural_duration_s: float,
    fastest_duration_s: float,
    traffic_only_duration_s: Optional[float],
    signal_only_duration_s: Optional[float],
) -> dict:
    soft_total = max(0.0, float(natural_duration_s) - float(fastest_duration_s))
    if str(mode) != "bus":
        return {
            "soft_total_s": _round(soft_total),
            "traffic_marginal_s": 0.0,
            "signal_marginal_s": _round(soft_total),
            "interaction_s": 0.0,
        }

    traffic_only = float(
        traffic_only_duration_s
        if traffic_only_duration_s is not None
        else fastest_duration_s
    )
    signal_only = float(
        signal_only_duration_s
        if signal_only_duration_s is not None
        else fastest_duration_s
    )
    traffic_marginal = max(0.0, float(natural_duration_s) - signal_only)
    signal_marginal = max(0.0, float(natural_duration_s) - traffic_only)
    interaction = soft_total - traffic_marginal - signal_marginal
    return {
        "soft_total_s": _round(soft_total),
        "traffic_marginal_s": _round(traffic_marginal),
        "signal_marginal_s": _round(signal_marginal),
        "interaction_s": _round(interaction),
    }


def _trip_summary(legs: list[dict]) -> dict:
    if not legs:
        return {
            "leg_count": 0,
            "limited_leg_count": 0,
            "final_arrival_target_error_s": 0.0,
            "max_arrival_target_error_s": 0.0,
            "incremental_physics_limited_s": 0.0,
            "recovered_lateness_s": 0.0,
            "scheduled_below_fastest_leg_count": 0,
            "distance_m": 0.0,
        }

    total_distance = sum(float(leg.get("distance_m") or 0.0) for leg in legs)
    total_scheduled = sum(float(leg.get("scheduled_duration_s") or 0.0) for leg in legs)
    total_predicted = sum(float(leg.get("predicted_leg_duration_s") or 0.0) for leg in legs)
    total_effective = sum(float(leg.get("effective_duration_s") or 0.0) for leg in legs)
    total_natural = sum(float(leg.get("natural_duration_s") or 0.0) for leg in legs)
    total_fastest = sum(float(leg.get("fastest_duration_s") or 0.0) for leg in legs)
    incremental = sum(
        float(leg.get("incremental_physics_limited_s") or 0.0)
        for leg in legs
    )
    recovered = sum(float(leg.get("recovered_lateness_s") or 0.0) for leg in legs)
    max_error = max(float(leg.get("arrival_target_error_s") or 0.0) for leg in legs)
    final_error = float(legs[-1].get("arrival_target_error_s") or 0.0)
    limited_count = sum(
        1 for leg in legs if float(leg.get("arrival_target_error_s") or 0.0) > 1.0
    )
    below_floor = sum(
        1
        for leg in legs
        if float(leg.get("scheduled_floor_margin_s") or 0.0) < -2.0
    )

    way_m = sum(
        float((leg.get("coverage") or {}).get("way_attribute_distance_m") or 0.0)
        for leg in legs
    )
    maxspeed_m = sum(
        float((leg.get("coverage") or {}).get("maxspeed_tagged_distance_m") or 0.0)
        for leg in legs
    )
    traffic_m = sum(
        float((leg.get("coverage") or {}).get("traffic_profile_distance_m") or 0.0)
        for leg in legs
    )
    top_limited = sorted(
        (
            {
                "from_stop_id": leg.get("from_stop_id"),
                "to_stop_id": leg.get("to_stop_id"),
                "arrival_target_error_s": leg.get("arrival_target_error_s"),
                "incremental_physics_limited_s": leg.get(
                    "incremental_physics_limited_s"
                ),
                "scheduled_floor_margin_s": leg.get("scheduled_floor_margin_s"),
                "warnings": leg.get("warnings") or [],
            }
            for leg in legs
            if float(leg.get("arrival_target_error_s") or 0.0) > 1.0
        ),
        key=lambda item: float(item.get("arrival_target_error_s") or 0.0),
        reverse=True,
    )

    return {
        "leg_count": len(legs),
        "limited_leg_count": limited_count,
        "final_arrival_target_error_s": _round(final_error),
        "max_arrival_target_error_s": _round(max_error),
        "incremental_physics_limited_s": _round(incremental),
        "recovered_lateness_s": _round(recovered),
        "scheduled_below_fastest_leg_count": below_floor,
        "distance_m": _round(total_distance),
        "scheduled_duration_s": _round(total_scheduled),
        "predicted_leg_duration_s": _round(total_predicted),
        "effective_duration_s": _round(total_effective),
        "natural_duration_s": _round(total_natural),
        "fastest_duration_s": _round(total_fastest),
        "way_attribute_coverage_ratio": _round(
            way_m / total_distance if total_distance > 0 else 0.0,
            4,
        ),
        "maxspeed_coverage_ratio": _round(
            maxspeed_m / total_distance if total_distance > 0 else 0.0,
            4,
        ),
        "traffic_profile_coverage_ratio": _round(
            traffic_m / total_distance if total_distance > 0 else 0.0,
            4,
        ),
        "signal_candidate_count": sum(
            int((leg.get("coverage") or {}).get("signal_candidate_count") or 0)
            for leg in legs
        ),
        "signal_hold_count": sum(
            int(leg.get("signal_hold_count") or 0)
            for leg in legs
        ),
        "top_limited_legs": top_limited[:10],
    }


async def explain_trip_plan(
    *,
    trip_id: str,
    mode: str,
    version_id: str,
    timeline: list[dict],
    path: dict,
    now_local: Optional[datetime] = None,
) -> dict:
    """Build a full, on-demand report without changing the live trajectory."""
    region = get_active_region()
    local_now = now_local or datetime.now(ZoneInfo(region.timezone))
    config = motion_config_for(mode, region)
    failure: dict = {}

    plan = await _build_trip_plan(
        trip_id=str(trip_id),
        mode=str(mode),
        version_id=str(version_id),
        timeline=timeline,
        path=path,
        now_local=local_now,
        failure=failure,
    )
    if not plan:
        return {
            "schema_v": DIAGNOSTICS_SCHEMA_VERSION,
            "available": False,
            "trip_id": str(trip_id),
            "pattern_id": str(path.get("pattern_id") or ""),
            "mode": str(mode),
            "fallback_reason": failure.get("reason") or "PLAN_BUILD_FAILED",
            "fallback_details": failure.get("details") or {},
            "legs": [],
        }

    from mobility.generations import (
        atomic_generations_enabled,
        get_pattern_generation,
    )

    if atomic_generations_enabled():
        bundle = await get_pattern_generation(
            str(path.get("pattern_id") or ""),
            str(version_id),
            region_id=region.region_id,
            network_id=region.network_id,
        )
        infra = (bundle or {}).get("infrastructure")
    else:
        infra = await db.mobility_pattern_infrastructure.find_one(
            {
                "pattern_id": str(path.get("pattern_id") or ""),
                "version_id": str(version_id),
                "region_id": region.region_id,
                "network_id": region.network_id,
            },
            {"_id": 0},
        )
    if not infra:
        return {
            "schema_v": DIAGNOSTICS_SCHEMA_VERSION,
            "available": False,
            "trip_id": str(trip_id),
            "pattern_id": str(path.get("pattern_id") or ""),
            "mode": str(mode),
            "fallback_reason": "INFRASTRUCTURE_NOT_FOUND_AFTER_PLAN",
            "fallback_details": {},
            "legs": [],
        }

    traffic_snapshot = {"provider": None, "profile_versions": [], "by_edge": {}}
    if str(mode) == "bus":
        traffic_snapshot = await traffic_snapshot_for_edges(
            infra.get("edges") or [],
            local_now,
            region_id=region.region_id,
            network_id=region.network_id,
        )
    traffic_by_edge = traffic_snapshot.get("by_edge") or {}

    legs = []
    for segment in plan.get("segments") or []:
        if segment.get("kind") != "MOVE":
            continue

        current_index = int(segment.get("from_timeline_index") or 0)
        next_index = int(segment.get("next_timeline_index") or current_index)
        if not (0 <= current_index < len(timeline) and 0 <= next_index < len(timeline)):
            continue

        current_entry = timeline[current_index]
        next_entry = timeline[next_index]
        trajectory = segment.get("trajectory") or {}
        start_m = float(trajectory.get("start_m") or 0.0)
        end_m = float(trajectory.get("end_m") or start_m)
        distance_m = max(0.0, end_m - start_m)
        effective_departure = float(segment.get("t0") or 0.0)
        effective_arrival = float(segment.get("t1") or effective_departure)

        contract = timeline_leg_contract(current_entry, next_entry)
        flow = lateness_flow(
            predicted_departure_s=float(contract["predicted_departure_s"]),
            effective_departure_s=effective_departure,
            predicted_arrival_s=float(contract["predicted_arrival_s"]),
            effective_arrival_s=effective_arrival,
        )

        if str(mode) == "tram":
            def build_variant(recovery_ratio: float, *, signals=None):
                return build_tram_leg(
                    edges=infra.get("edges") or [],
                    signals=infra.get("signals") if signals is None else signals,
                    start_m=start_m,
                    end_m=end_m,
                    departure_service_s=effective_departure,
                    config=config,
                    recovery_ratio=recovery_ratio,
                )

            natural = build_variant(0.0)
            fastest = build_variant(1.0)
            traffic_only = None
            signal_only = natural
        else:
            def build_variant(
                recovery_ratio: float,
                *,
                traffic=None,
                signals=None,
            ):
                return build_bus_leg(
                    edges=infra.get("edges") or [],
                    signals=infra.get("signals") if signals is None else signals,
                    traffic_by_edge=traffic_by_edge if traffic is None else traffic,
                    start_m=start_m,
                    end_m=end_m,
                    departure_service_s=effective_departure,
                    config=config,
                    recovery_ratio=recovery_ratio,
                )

            natural = build_variant(0.0)
            fastest = build_variant(1.0)
            traffic_only = build_variant(0.0, signals=[])
            signal_only = build_variant(0.0, traffic={})

        natural_duration = float(natural.get("duration_s") or 0.0)
        fastest_duration = float(fastest.get("duration_s") or 0.0)
        traffic_only_duration = (
            float(traffic_only.get("duration_s") or 0.0)
            if traffic_only is not None
            else None
        )
        signal_only_duration = (
            float(signal_only.get("duration_s") or 0.0)
            if signal_only is not None
            else None
        )
        time_scale = float(segment.get("time_scale") or 1.0)

        selected_metrics = trajectory_metrics(
            trajectory,
            time_scale=time_scale,
            global_cap_kmh=float(config["max_speed_kmh"]),
        )
        natural_metrics = trajectory_metrics(
            natural,
            global_cap_kmh=float(config["max_speed_kmh"]),
        )
        fastest_metrics = trajectory_metrics(
            fastest,
            global_cap_kmh=float(config["max_speed_kmh"]),
        )
        coverage = leg_input_coverage(
            infra=infra,
            start_m=start_m,
            end_m=end_m,
            mode=str(mode),
            traffic_by_edge=traffic_by_edge,
            config=config,
        )

        scheduled_duration = float(contract["scheduled_duration_s"])
        predicted_duration = float(contract["predicted_leg_duration_s"])
        engine_window = max(
            1.0,
            float(contract["predicted_arrival_s"]) - effective_departure,
        )
        scheduled_floor_margin = scheduled_duration - fastest_duration
        predicted_floor_margin = predicted_duration - fastest_duration
        engine_window_margin = engine_window - fastest_duration

        warnings = diagnostic_warnings(
            scheduled_duration_s=scheduled_duration,
            fastest_duration_s=fastest_duration,
            coverage=coverage,
            fastest_metrics=fastest_metrics,
            arrival_target_error_s=float(flow["arrival_target_error_s"]),
            mode=str(mode),
        )

        legs.append(
            {
                "from_timeline_index": current_index,
                "next_timeline_index": next_index,
                "from_stop_id": current_entry.get("stop_id"),
                "from_stop_name": (current_entry.get("stop") or {}).get("name"),
                "to_stop_id": next_entry.get("stop_id"),
                "to_stop_name": (next_entry.get("stop") or {}).get("name"),
                "distance_m": _round(distance_m),
                **contract,
                "engine_available_duration_s": _round(engine_window),
                "effective_duration_s": _round(effective_arrival - effective_departure),
                "natural_duration_s": _round(natural_duration),
                "fastest_duration_s": _round(fastest_duration),
                "selected_raw_duration_s": _round(
                    float(trajectory.get("duration_s") or 0.0)
                ),
                "time_scale": _round(time_scale, 6),
                "recovery_ratio": _round(
                    float(trajectory.get("recovery_ratio") or 0.0),
                    6,
                ),
                **flow,
                "physics_limited_s": flow["arrival_target_error_s"],
                "scheduled_floor_margin_s": _round(scheduled_floor_margin),
                "predicted_floor_margin_s": _round(predicted_floor_margin),
                "engine_window_margin_s": _round(engine_window_margin),
                "scheduled_required_average_kmh": _round(
                    _average_speed_kmh(distance_m, scheduled_duration),
                    2,
                ),
                "predicted_required_average_kmh": _round(
                    _average_speed_kmh(distance_m, predicted_duration),
                    2,
                ),
                "engine_required_average_kmh": _round(
                    _average_speed_kmh(distance_m, engine_window),
                    2,
                ),
                "natural_average_kmh": _round(
                    _average_speed_kmh(distance_m, natural_duration),
                    2,
                ),
                "fastest_average_kmh": _round(
                    _average_speed_kmh(distance_m, fastest_duration),
                    2,
                ),
                "selected_metrics": selected_metrics,
                "natural_metrics": natural_metrics,
                "fastest_metrics": fastest_metrics,
                "soft_components": _soft_components(
                    mode=str(mode),
                    natural_duration_s=natural_duration,
                    fastest_duration_s=fastest_duration,
                    traffic_only_duration_s=traffic_only_duration,
                    signal_only_duration_s=signal_only_duration,
                ),
                "coverage": coverage,
                "fit": segment.get("fit"),
                "traffic_edge_count": int(
                    trajectory.get("traffic_edge_count") or 0
                ),
                "signal_hold_count": int(
                    trajectory.get("signal_stop_count") or 0
                ),
                "warnings": warnings,
            }
        )

    return {
        "schema_v": DIAGNOSTICS_SCHEMA_VERSION,
        "available": True,
        "region_id": region.region_id,
        "network_id": region.network_id,
        "trip_id": str(trip_id),
        "pattern_id": str(path.get("pattern_id") or ""),
        "mode": str(mode),
        "motion_model": plan.get("motion_model"),
        "motion_quality": plan.get("motion_quality"),
        "traffic_provider": traffic_snapshot.get("provider"),
        "traffic_profile_versions": traffic_snapshot.get("profile_versions") or [],
        "plan": {
            "start_s": _round(plan.get("start_s")),
            "end_s": _round(plan.get("end_s")),
            "final_arrival_target_error_s": _round(
                plan.get("final_arrival_target_error_s")
            ),
            "max_arrival_target_error_s": _round(
                plan.get("max_arrival_target_error_s")
            ),
            "incremental_physics_limited_s": _round(
                plan.get("incremental_physics_limited_s")
            ),
        },
        "summary": _trip_summary(legs),
        "legs": legs,
    }
