"""Evidence-first baseline calibration classification.

This module never changes a motion parameter. It converts Phase-2.1
observability fields into explicit hypotheses that can be reviewed before any
speed/acceleration/turn/signal setting is touched.
"""
from __future__ import annotations


def _f(value, default=0.0) -> float:
    try:
        return float(value)
    except Exception:
        return float(default)


def diagnose_leg_baseline(
    *,
    distance_m: float,
    scheduled_duration_s: float,
    natural_duration_s: float,
    fastest_duration_s: float,
    coverage: dict,
    fastest_metrics: dict,
    soft_components: dict,
) -> dict:
    distance = max(0.0, _f(distance_m))
    scheduled = max(0.0, _f(scheduled_duration_s))
    natural = max(0.0, _f(natural_duration_s))
    fastest = max(0.0, _f(fastest_duration_s))
    floor_margin = scheduled - fastest

    way_coverage = _f(coverage.get("way_attribute_coverage_ratio"))
    maxspeed_coverage = _f(coverage.get("maxspeed_coverage_ratio"))
    posted_above_cap = _f(coverage.get("posted_above_vehicle_cap_ratio"))
    cap_pressure = _f(fastest_metrics.get("global_cap_pressure_ratio"))
    turn_count = int(coverage.get("turn_cap_count") or 0)
    min_turn_cap = coverage.get("minimum_turn_cap_kmh")

    moving_s = max(0.001, _f(fastest_metrics.get("moving_s")))
    accel_brake_share = (
        _f(fastest_metrics.get("acceleration_s"))
        + _f(fastest_metrics.get("braking_s"))
    ) / moving_s

    signal_soft = _f(soft_components.get("signal_marginal_s"))
    traffic_soft = _f(soft_components.get("traffic_marginal_s"))
    soft_total = _f(soft_components.get("soft_total_s"))

    hypotheses = []

    if floor_margin < -2.0:
        if way_coverage < 0.98:
            hypotheses.append(
                {
                    "code": "VERIFY_WAY_ATTRIBUTES",
                    "priority": 100,
                    "evidence": {
                        "way_attribute_coverage_ratio": round(way_coverage, 4),
                    },
                }
            )
        if maxspeed_coverage < 0.70:
            hypotheses.append(
                {
                    "code": "VERIFY_OSM_SPEED_DATA",
                    "priority": 95,
                    "evidence": {
                        "maxspeed_coverage_ratio": round(maxspeed_coverage, 4),
                    },
                }
            )
        if cap_pressure >= 0.25 and posted_above_cap > 0.0:
            hypotheses.append(
                {
                    "code": "VEHICLE_CAP_HYPOTHESIS",
                    "priority": 80,
                    "evidence": {
                        "global_cap_pressure_ratio": round(cap_pressure, 4),
                        "posted_above_vehicle_cap_ratio": round(posted_above_cap, 4),
                    },
                }
            )
        if turn_count >= 3 and min_turn_cap is not None and _f(min_turn_cap) <= 25.0:
            hypotheses.append(
                {
                    "code": "TURN_MODEL_HYPOTHESIS",
                    "priority": 70,
                    "evidence": {
                        "turn_cap_count": turn_count,
                        "minimum_turn_cap_kmh": _f(min_turn_cap),
                    },
                }
            )
        if distance <= 700.0 and accel_brake_share >= 0.55:
            hypotheses.append(
                {
                    "code": "ACCEL_BRAKE_HYPOTHESIS",
                    "priority": 60,
                    "evidence": {
                        "distance_m": round(distance, 1),
                        "accel_brake_share": round(accel_brake_share, 4),
                    },
                }
            )
        if not hypotheses:
            hypotheses.append(
                {
                    "code": "HARD_MODEL_FLOOR_UNEXPLAINED",
                    "priority": 50,
                    "evidence": {
                        "scheduled_floor_margin_s": round(floor_margin, 2),
                    },
                }
            )
        primary = sorted(hypotheses, key=lambda x: -int(x["priority"]))[0]["code"]
        return {
            "state": "SCHEDULE_BELOW_FASTEST_MODEL",
            "primary_hypothesis": primary,
            "scheduled_floor_margin_s": round(floor_margin, 2),
            "hypotheses": sorted(
                hypotheses,
                key=lambda x: (-int(x["priority"]), str(x["code"])),
            ),
        }

    schedule_soft_margin = scheduled - fastest
    modeled_soft_over_schedule = max(0.0, natural - scheduled)
    if modeled_soft_over_schedule > 5.0:
        if signal_soft >= max(5.0, traffic_soft):
            primary = "SOFT_SIGNAL_EXPECTATION_EXCEEDS_MARGIN"
        elif traffic_soft >= 5.0:
            primary = "SOFT_TRAFFIC_EXPECTATION_EXCEEDS_MARGIN"
        else:
            primary = "SOFT_MODEL_EXPECTATION_EXCEEDS_MARGIN"
        return {
            "state": "FASTEST_COMPATIBLE_SOFT_MODEL_SLOW",
            "primary_hypothesis": primary,
            "scheduled_floor_margin_s": round(floor_margin, 2),
            "hypotheses": [
                {
                    "code": primary,
                    "priority": 50,
                    "evidence": {
                        "schedule_soft_margin_s": round(schedule_soft_margin, 2),
                        "modeled_soft_over_schedule_s": round(
                            modeled_soft_over_schedule, 2
                        ),
                        "signal_marginal_s": round(signal_soft, 2),
                        "traffic_marginal_s": round(traffic_soft, 2),
                        "soft_total_s": round(soft_total, 2),
                    },
                }
            ],
        }

    return {
        "state": "BASELINE_COMPATIBLE",
        "primary_hypothesis": None,
        "scheduled_floor_margin_s": round(floor_margin, 2),
        "hypotheses": [],
    }
