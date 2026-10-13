"""Pure calibration/observability helpers for the Perix motion engine.

This module MUST NOT choose vehicle positions or mutate physics parameters.
It explains what the existing Phase-2 engine did: timeline timing, carried
lateness, trajectory composition, input coverage and current fleet health.
"""
from __future__ import annotations

from collections import Counter
from typing import Optional

from mobility.motion.common import turn_angle_degrees, turn_speed_cap_kmh
from mobility.signal_semantics import signal_coverage_for_leg

DIAGNOSTICS_SCHEMA_VERSION = 2


def _round(value, digits: int = 3):
    if value is None:
        return None
    return round(float(value), digits)


def _ratio(numerator: float, denominator: float) -> float:
    if float(denominator) <= 0:
        return 0.0
    return max(0.0, min(1.0, float(numerator) / float(denominator)))


def _percentile(values: list[float], percentile: float) -> Optional[float]:
    ordered = sorted(float(x) for x in values)
    if not ordered:
        return None
    if len(ordered) == 1:
        return ordered[0]
    p = max(0.0, min(1.0, float(percentile)))
    position = p * (len(ordered) - 1)
    lower = int(position)
    upper = min(len(ordered) - 1, lower + 1)
    frac = position - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * frac


def timeline_leg_contract(current_entry: dict, next_entry: dict) -> dict:
    """Timing contract for the physical leg current DEPARTURE -> next ARRIVAL.

    This deliberately does not use arrival->arrival delay deltas. Dwell at the
    current stop belongs to the stop, not to the following road/rail leg.
    """
    scheduled_departure = float(
        current_entry.get("scheduled_departure")
        or current_entry.get("scheduled")
        or current_entry.get("predicted_departure")
        or 0.0
    )
    predicted_departure = float(
        current_entry.get("predicted_departure")
        or scheduled_departure
    )
    scheduled_arrival = float(
        next_entry.get("scheduled_arrival")
        or next_entry.get("scheduled")
        or next_entry.get("predicted_arrival")
        or predicted_departure
    )
    predicted_arrival = float(
        next_entry.get("predicted_arrival")
        or scheduled_arrival
    )

    scheduled_duration = max(1.0, scheduled_arrival - scheduled_departure)
    predicted_duration = max(1.0, predicted_arrival - predicted_departure)
    departure_delay = predicted_departure - scheduled_departure
    arrival_delay = predicted_arrival - scheduled_arrival

    return {
        "scheduled_departure_s": _round(scheduled_departure),
        "predicted_departure_s": _round(predicted_departure),
        "scheduled_arrival_s": _round(scheduled_arrival),
        "predicted_arrival_s": _round(predicted_arrival),
        "scheduled_duration_s": _round(scheduled_duration),
        "predicted_leg_duration_s": _round(predicted_duration),
        "departure_delay_s": _round(departure_delay),
        "arrival_delay_s": _round(arrival_delay),
        "delay_delta_s": int(round(arrival_delay - departure_delay)),
    }


def lateness_flow(
    *,
    predicted_departure_s: float,
    effective_departure_s: float,
    predicted_arrival_s: float,
    effective_arrival_s: float,
) -> dict:
    """Separate carried lateness from new physics limitation on one leg."""
    carried = max(0.0, float(effective_departure_s) - float(predicted_departure_s))
    arrival_error = max(0.0, float(effective_arrival_s) - float(predicted_arrival_s))
    incremental = max(0.0, arrival_error - carried)
    recovered = max(0.0, carried - arrival_error)
    return {
        "carried_lateness_s": _round(carried),
        "arrival_target_error_s": _round(arrival_error),
        "incremental_physics_limited_s": _round(incremental),
        "recovered_lateness_s": _round(recovered),
    }


def _time_at_or_above_speed(
    v0_kmh: float,
    v1_kmh: float,
    duration_s: float,
    threshold_kmh: float,
) -> float:
    duration = max(0.0, float(duration_s))
    threshold = max(0.0, float(threshold_kmh))
    a = float(v0_kmh)
    b = float(v1_kmh)
    if duration <= 0:
        return 0.0
    if a >= threshold and b >= threshold:
        return duration
    if a < threshold and b < threshold:
        return 0.0
    if abs(b - a) < 1e-9:
        return duration if a >= threshold else 0.0

    crossing_fraction = (threshold - a) / (b - a)
    crossing_fraction = max(0.0, min(1.0, crossing_fraction))
    if b > a:
        return duration * (1.0 - crossing_fraction)
    return duration * crossing_fraction


def trajectory_metrics(
    trajectory: dict,
    *,
    time_scale: float = 1.0,
    global_cap_kmh: Optional[float] = None,
) -> dict:
    """Summarize one trajectory, including cap pressure and time composition."""
    scale = max(1.0, float(time_scale))
    moving_s = 0.0
    hold_s = 0.0
    accel_s = 0.0
    cruise_s = 0.0
    braking_s = 0.0
    distance_m = 0.0
    max_speed_kmh = 0.0
    time_at_global_cap_s = 0.0
    hold_states: Counter = Counter()

    threshold = None
    if global_cap_kmh is not None:
        threshold = max(0.0, float(global_cap_kmh)) * 0.98

    for segment in trajectory.get("segments") or []:
        raw_dt = max(0.0, float(segment.get("t1") or 0.0) - float(segment.get("t0") or 0.0))
        dt = raw_dt * scale
        p0 = float(segment.get("p0") or 0.0)
        p1 = float(segment.get("p1") or p0)
        state = str(segment.get("state") or "MOVING")
        v0_kmh = max(0.0, float(segment.get("v0") or 0.0) * 3.6 / scale)
        v1_kmh = max(0.0, float(segment.get("v1") or 0.0) * 3.6 / scale)

        max_speed_kmh = max(max_speed_kmh, v0_kmh, v1_kmh)
        if p1 <= p0 + 0.001 or state != "MOVING":
            hold_s += dt
            hold_states[state] += dt
            continue

        moving_s += dt
        distance_m += max(0.0, p1 - p0)
        delta = v1_kmh - v0_kmh
        if delta > 0.25:
            accel_s += dt
        elif delta < -0.25:
            braking_s += dt
        else:
            cruise_s += dt

        if threshold is not None:
            time_at_global_cap_s += _time_at_or_above_speed(
                v0_kmh,
                v1_kmh,
                dt,
                threshold,
            )

    total_s = moving_s + hold_s
    avg_speed_kmh = (
        distance_m / total_s * 3.6
        if total_s > 0
        else 0.0
    )
    return {
        "duration_s": _round(total_s),
        "distance_m": _round(distance_m),
        "average_speed_kmh": _round(avg_speed_kmh, 2),
        "max_speed_kmh": _round(max_speed_kmh, 2),
        "moving_s": _round(moving_s),
        "hold_s": _round(hold_s),
        "acceleration_s": _round(accel_s),
        "cruise_s": _round(cruise_s),
        "braking_s": _round(braking_s),
        "time_at_global_cap_s": _round(time_at_global_cap_s),
        "global_cap_pressure_ratio": _round(
            _ratio(time_at_global_cap_s, moving_s),
            4,
        ),
        "hold_states_s": {
            key: _round(value)
            for key, value in sorted(hold_states.items())
        },
    }


def _overlap_m(edge: dict, start_m: float, end_m: float) -> float:
    start = max(float(start_m), float(edge.get("from_m") or 0.0))
    end = min(float(end_m), float(edge.get("to_m") or 0.0))
    return max(0.0, end - start)


def leg_input_coverage(
    *,
    infra: dict,
    start_m: float,
    end_m: float,
    mode: str,
    traffic_by_edge: dict,
    config: dict,
) -> dict:
    """Distance-weighted coverage for the exact canonical edges of one leg."""
    edges = [
        edge
        for edge in (infra.get("edges") or [])
        if _overlap_m(edge, start_m, end_m) > 0
    ]
    total_m = sum(_overlap_m(edge, start_m, end_m) for edge in edges)
    way_attrs_m = 0.0
    maxspeed_tagged_m = 0.0
    traffic_m = 0.0
    posted_above_vehicle_cap_m = 0.0
    road_classes: Counter = Counter()

    for edge in edges:
        overlap = _overlap_m(edge, start_m, end_m)
        way = edge.get("way")
        if way:
            way_attrs_m += overlap
        posted = (way or {}).get("maxspeed_kmh")
        if posted not in (None, ""):
            maxspeed_tagged_m += overlap
            if float(posted) > float(config.get("max_speed_kmh") or 0.0):
                posted_above_vehicle_cap_m += overlap
        if str(edge.get("edge_id") or "") in (traffic_by_edge or {}):
            traffic_m += overlap
        road_class = (
            (way or {}).get("highway")
            if str(mode) != "tram"
            else (way or {}).get("railway")
        ) or "UNKNOWN"
        road_classes[str(road_class)] += overlap

    signal_coverage = signal_coverage_for_leg(
        infra=infra,
        start_m=start_m,
        end_m=end_m,
        mode=str(mode),
    )

    turn_caps = []
    turn_rules = config.get("turn_speed_kmh") or {}
    for first, second in zip(edges, edges[1:]):
        boundary = float(first.get("to_m") or 0.0)
        if not (float(start_m) < boundary < float(end_m)):
            continue
        cap = turn_speed_cap_kmh(
            turn_angle_degrees(first, second),
            turn_rules,
        )
        if cap is not None:
            turn_caps.append(float(cap))

    return {
        "edge_count": len(edges),
        "distance_m": _round(total_m),
        "way_attribute_distance_m": _round(way_attrs_m),
        "way_attribute_coverage_ratio": _round(_ratio(way_attrs_m, total_m), 4),
        "maxspeed_tagged_distance_m": _round(maxspeed_tagged_m),
        "maxspeed_coverage_ratio": _round(_ratio(maxspeed_tagged_m, total_m), 4),
        "default_speed_distance_m": _round(max(0.0, total_m - maxspeed_tagged_m)),
        "posted_above_vehicle_cap_distance_m": _round(posted_above_vehicle_cap_m),
        "posted_above_vehicle_cap_ratio": _round(
            _ratio(posted_above_vehicle_cap_m, total_m),
            4,
        ),
        "global_vehicle_cap_kmh": _round(config.get("max_speed_kmh"), 2),
        "traffic_profile_distance_m": _round(traffic_m),
        "traffic_profile_coverage_ratio": _round(_ratio(traffic_m, total_m), 4),
        **signal_coverage,
        "turn_cap_count": len(turn_caps),
        "minimum_turn_cap_kmh": _round(min(turn_caps), 2) if turn_caps else None,
        "road_class_distance_m": {
            key: _round(value)
            for key, value in sorted(road_classes.items())
        },
    }


def diagnostic_warnings(
    *,
    scheduled_duration_s: float,
    fastest_duration_s: float,
    coverage: dict,
    fastest_metrics: dict,
    arrival_target_error_s: float,
    mode: str,
) -> list[str]:
    warnings = []
    if float(scheduled_duration_s) + 2.0 < float(fastest_duration_s):
        warnings.append("SCHEDULE_BELOW_FASTEST_MODEL")
    if float(coverage.get("way_attribute_coverage_ratio") or 0.0) < 0.98:
        warnings.append("WAY_ATTRIBUTE_COVERAGE_LOW")
    if float(coverage.get("maxspeed_coverage_ratio") or 0.0) < 0.70:
        warnings.append("OSM_MAXSPEED_COVERAGE_LOW")
    traffic_ratio = float(coverage.get("traffic_profile_coverage_ratio") or 0.0)
    if str(mode) == "bus" and 0.0 < traffic_ratio < 0.70:
        warnings.append("TRAFFIC_PROFILE_COVERAGE_PARTIAL")
    if int(coverage.get("signal_direction_ambiguous_count") or 0) > 0:
        warnings.append("SIGNAL_DIRECTION_AMBIGUOUS")
    if int(coverage.get("signal_direction_mismatch_count") or 0) > 0:
        warnings.append("SIGNAL_DIRECTION_FILTERED")
    if (
        coverage.get("signal_semantics_enabled")
        and not coverage.get("signal_semantics_ready")
    ):
        warnings.append("SIGNAL_SEMANTICS_NOT_READY")
    if float(fastest_metrics.get("global_cap_pressure_ratio") or 0.0) >= 0.25:
        warnings.append("GLOBAL_CAP_PRESSURE_HIGH")
    if float(coverage.get("posted_above_vehicle_cap_ratio") or 0.0) > 0.0:
        warnings.append("POSTED_SPEED_ABOVE_MODEL_CAP")
    if float(arrival_target_error_s) > 1.0:
        warnings.append("ARRIVAL_TARGET_MISSED")
    return warnings


def summarize_vehicle_motion(vehicles: list[dict]) -> dict:
    """Compact network snapshot from the already-computed live vehicle records."""
    models: Counter = Counter()
    states: Counter = Counter()
    fits: Counter = Counter()
    fallback_reasons: Counter = Counter()
    speeds = []
    limited = []
    estimated = 0
    physics = 0
    fallback = 0

    for vehicle in vehicles or []:
        if vehicle.get("estimated"):
            estimated += 1
        motion = vehicle.get("motion") or {}
        model = motion.get("model")
        quality = str(motion.get("quality") or "")
        if model:
            physics += 1
            models[str(model)] += 1
            if motion.get("state"):
                states[str(motion.get("state"))] += 1
            if motion.get("fit"):
                fits[str(motion.get("fit"))] += 1
            if motion.get("speed_kmh") is not None:
                speeds.append(float(motion.get("speed_kmh") or 0.0))
            miss = float(
                motion.get("arrival_target_error_s")
                if motion.get("arrival_target_error_s") is not None
                else motion.get("physics_limited_s") or 0.0
            )
            if miss > 1.0:
                limited.append(
                    {
                        "vehicle_id": vehicle.get("vehicle_id"),
                        "trip_id": vehicle.get("trip_id"),
                        "route_number": vehicle.get("route_number"),
                        "mode": vehicle.get("mode"),
                        "arrival_target_error_s": round(miss, 2),
                        "incremental_physics_limited_s": round(
                            float(motion.get("incremental_physics_limited_s") or 0.0),
                            2,
                        ),
                        "carried_lateness_s": round(
                            float(motion.get("carried_lateness_s") or 0.0),
                            2,
                        ),
                        "fit": motion.get("fit"),
                    }
                )
        elif quality == "LEGACY_FALLBACK":
            fallback += 1
            fallback_reasons[str(motion.get("fallback_reason") or "UNKNOWN")] += 1

    limited.sort(
        key=lambda item: float(item["arrival_target_error_s"]),
        reverse=True,
    )
    total = len(vehicles or [])
    return {
        "schema_v": DIAGNOSTICS_SCHEMA_VERSION,
        "total_vehicles": total,
        "estimated_vehicles": estimated,
        "physics_vehicles": physics,
        "legacy_fallback_vehicles": fallback,
        "physics_coverage_ratio": round(
            physics / max(1, estimated),
            4,
        ),
        "models": dict(sorted(models.items())),
        "states": dict(sorted(states.items())),
        "fits": dict(sorted(fits.items())),
        "fallback_reasons": dict(sorted(fallback_reasons.items())),
        "speed_kmh": {
            "p50": _round(_percentile(speeds, 0.50), 2),
            "p90": _round(_percentile(speeds, 0.90), 2),
            "p95": _round(_percentile(speeds, 0.95), 2),
            "max": _round(max(speeds), 2) if speeds else None,
        },
        "limited_vehicle_count": len(limited),
        "top_limited": limited[:20],
    }
