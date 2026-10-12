"""Bus-specific motion model over canonical OSM road edges."""
from __future__ import annotations

from mobility.motion.common import (
    build_speed_trajectory,
    deterministic_signal_hold_seconds,
    trajectory_time_at_progress,
    turn_angle_degrees,
    turn_speed_cap_kmh,
)

MODEL_NAME = "BUS_PHYSICS_V1"


def _hard_speed_kmh(edge: dict, config: dict) -> float:
    way = edge.get("way") or {}
    highway = str(way.get("highway") or "unclassified")
    configured = (config.get("default_speed_kmh") or {}).get(highway)
    fallback = float(configured if configured is not None else 40.0)
    posted = way.get("maxspeed_kmh")
    road_cap = float(posted) if posted not in (None, "") else fallback
    return max(5.0, min(float(config["max_speed_kmh"]), road_cap))


def _overlap_edges(edges: list[dict], start_m: float, end_m: float) -> list[dict]:
    return [
        edge
        for edge in edges
        if float(edge.get("to_m") or 0.0) > float(start_m)
        and float(edge.get("from_m") or 0.0) < float(end_m)
    ]


def build_bus_leg(
    *,
    edges: list[dict],
    signals: list[dict],
    traffic_by_edge: dict,
    start_m: float,
    end_m: float,
    departure_service_s: float,
    config: dict,
    recovery_ratio: float = 0.0,
) -> dict:
    """Build one physical bus leg.

    recovery_ratio=0 uses static traffic + modeled signal phases.
    recovery_ratio=1 removes those soft delays but never exceeds road or
    vehicle hard speed limits.
    """
    ratio = max(0.0, min(1.0, float(recovery_ratio)))
    leg_edges = _overlap_edges(edges, start_m, end_m)
    if not leg_edges:
        return {"model": MODEL_NAME, "duration_s": 0.0, "segments": []}

    spans = []
    traffic_edges = 0
    for edge in leg_edges:
        hard = _hard_speed_kmh(edge, config)
        traffic = traffic_by_edge.get(str(edge.get("edge_id"))) or {}
        observed = traffic.get("expected_speed_kmh")
        natural = hard
        if observed not in (None, ""):
            natural = min(hard, max(5.0, float(observed)))
            traffic_edges += 1
        cap = natural + ratio * (hard - natural)
        spans.append(
            {
                "from_m": max(float(start_m), float(edge["from_m"])),
                "to_m": min(float(end_m), float(edge["to_m"])),
                "speed_cap_kmh": cap,
                "edge_id": str(edge.get("edge_id")),
            }
        )

    point_caps = []
    turn_rules = config.get("turn_speed_kmh") or {}
    for a, b in zip(leg_edges, leg_edges[1:]):
        boundary = float(a.get("to_m") or 0.0)
        if not (float(start_m) < boundary < float(end_m)):
            continue
        cap = turn_speed_cap_kmh(turn_angle_degrees(a, b), turn_rules)
        if cap is not None:
            point_caps.append({"progress_m": boundary, "speed_cap_kmh": cap})

    preliminary = build_speed_trajectory(
        start_m=start_m,
        end_m=end_m,
        spans=spans,
        point_speed_caps=point_caps,
        mandatory_stops=[],
        acceleration_mps2=float(config["acceleration_mps2"]),
        braking_mps2=float(config["braking_mps2"]),
        step_m=float(config["trajectory_step_m"]),
    )

    mandatory = []
    cumulative_hold = 0.0
    if bool(config.get("road_signal_enabled", True)):
        for signal in sorted(signals or [], key=lambda x: float(x.get("progress_m") or 0.0)):
            kinds = set(signal.get("kinds") or [])
            progress = float(signal.get("progress_m") or 0.0)
            if (
                "ROAD_SIGNAL" not in kinds
                or not signal.get("usable_for_motion")
                or not (float(start_m) < progress < float(end_m))
            ):
                continue
            arrival_elapsed = trajectory_time_at_progress(preliminary, progress) + cumulative_hold
            hold = deterministic_signal_hold_seconds(
                signal.get("signal_instance_id") or signal.get("signal_id"),
                float(departure_service_s) + arrival_elapsed,
                cycle_s=float(config["road_signal_cycle_s"]),
                green_ratio=float(config["road_signal_green_ratio"]),
                max_hold_s=float(config["road_signal_max_hold_s"]),
            )
            hold *= 1.0 - ratio
            if hold < float(config["road_signal_min_stop_s"]):
                continue
            mandatory.append(
                {
                    "progress_m": progress,
                    "hold_s": hold,
                    "state": "SIGNAL_HOLD",
                    "id": signal.get("signal_instance_id") or signal.get("signal_id"),
                }
            )
            cumulative_hold += hold

    trajectory = build_speed_trajectory(
        start_m=start_m,
        end_m=end_m,
        spans=spans,
        point_speed_caps=point_caps,
        mandatory_stops=mandatory,
        acceleration_mps2=float(config["acceleration_mps2"]),
        braking_mps2=float(config["braking_mps2"]),
        step_m=float(config["trajectory_step_m"]),
    )
    return {
        **trajectory,
        "model": MODEL_NAME,
        "recovery_ratio": ratio,
        "traffic_edge_count": traffic_edges,
        "signal_stop_count": len(mandatory),
    }
