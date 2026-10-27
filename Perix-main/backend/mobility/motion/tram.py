"""Tram-specific motion model over canonical OSM rail edges."""
from __future__ import annotations

from mobility.motion.common import (
    build_speed_trajectory,
    kmh_to_mps,
    deterministic_signal_hold_seconds,
    trajectory_time_at_progress,
    turn_angle_degrees,
    turn_speed_cap_kmh,
    spatial_slowdown_spans,
    remaining_eta_spans,
)

MODEL_NAME = "TRAM_PHYSICS_V1"


def _hard_speed_kmh(edge: dict, config: dict) -> float:
    way = edge.get("way") or {}
    posted = way.get("maxspeed_kmh")
    rail_cap = float(posted) if posted not in (None, "") else float(config["default_speed_kmh"])
    return max(5.0, min(float(config["max_speed_kmh"]), rail_cap))


def _overlap_edges(edges: list[dict], start_m: float, end_m: float) -> list[dict]:
    return [
        edge
        for edge in edges
        if float(edge.get("to_m") or 0.0) > float(start_m)
        and float(edge.get("from_m") or 0.0) < float(end_m)
    ]


def build_tram_leg(
    *,
    edges: list[dict],
    signals: list[dict],
    start_m: float,
    end_m: float,
    departure_service_s: float,
    config: dict,
    recovery_ratio: float = 0.0,
    initial_speed_kmh: float = 0.0,
    slowdowns: list | None = None,
    slowdown_strength: float = 0.0,
    remaining_strength: float = 0.0,
) -> dict:
    """Build one tram leg.

    Road traffic is deliberately absent in V1. Rail-signal periodic timing is
    disabled by default because real tram signal logic is operator-specific.
    """
    ratio = max(0.0, min(1.0, float(recovery_ratio)))
    leg_edges = _overlap_edges(edges, start_m, end_m)
    if not leg_edges:
        return {"model": MODEL_NAME, "duration_s": 0.0, "segments": []}

    spans = [
        {
            "from_m": max(float(start_m), float(edge["from_m"])),
            "to_m": min(float(end_m), float(edge["to_m"])),
            "speed_cap_kmh": _hard_speed_kmh(edge, config),
            "edge_id": str(edge.get("edge_id")),
        }
        for edge in leg_edges
    ]

    point_caps = []
    turn_rules = config.get("turn_speed_kmh") or {}
    for a, b in zip(leg_edges, leg_edges[1:]):
        boundary = float(a.get("to_m") or 0.0)
        if not (float(start_m) < boundary < float(end_m)):
            continue
        cap = turn_speed_cap_kmh(turn_angle_degrees(a, b), turn_rules)
        if cap is not None:
            point_caps.append({"progress_m": boundary, "speed_cap_kmh": cap})

    remaining = remaining_eta_spans(spans,start_m,end_m,config,initial_speed_kmh,remaining_strength)
    spans.extend(spatial_slowdown_spans(spans,slowdowns,start_m,end_m,config,initial_speed_kmh,slowdown_strength))
    spans.extend(remaining)

    preliminary = build_speed_trajectory(
        start_m=start_m,
        end_m=end_m,
        spans=spans,
        point_speed_caps=point_caps,
        mandatory_stops=[],
        acceleration_mps2=float(config["acceleration_mps2"]),
        braking_mps2=float(config["braking_mps2"]),
        step_m=float(config["trajectory_step_m"]),
        initial_speed_mps=kmh_to_mps(initial_speed_kmh),
    )

    mandatory = []
    cumulative_hold = 0.0
    if bool(config.get("rail_signal_enabled", False)):
        for signal in sorted(signals or [], key=lambda x: float(x.get("progress_m") or 0.0)):
            kinds = set(signal.get("kinds") or [])
            progress = float(signal.get("progress_m") or 0.0)
            if (
                "RAIL_SIGNAL" not in kinds
                or not signal.get("usable_for_motion")
                or not (float(start_m) < progress < float(end_m))
            ):
                continue
            arrival_elapsed = trajectory_time_at_progress(preliminary, progress) + cumulative_hold
            hold = deterministic_signal_hold_seconds(
                signal.get("signal_instance_id") or signal.get("signal_id"),
                float(departure_service_s) + arrival_elapsed,
                cycle_s=float(config["rail_signal_cycle_s"]),
                green_ratio=float(config["rail_signal_green_ratio"]),
                max_hold_s=float(config["rail_signal_max_hold_s"]),
            )
            hold *= 1.0 - ratio
            if hold < float(config["rail_signal_min_stop_s"]):
                continue
            mandatory.append(
                {
                    "progress_m": progress,
                    "hold_s": hold,
                    "state": "RAIL_SIGNAL_HOLD",
                    "id": signal.get("signal_instance_id") or signal.get("signal_id"),
                }
            )
            cumulative_hold += hold

    trajectory = preliminary if not mandatory else build_speed_trajectory(
        start_m=start_m,
        end_m=end_m,
        spans=spans,
        point_speed_caps=point_caps,
        mandatory_stops=mandatory,
        acceleration_mps2=float(config["acceleration_mps2"]),
        braking_mps2=float(config["braking_mps2"]),
        step_m=float(config["trajectory_step_m"]),
        initial_speed_mps=kmh_to_mps(initial_speed_kmh),
    )
    return {
        **trajectory,
        "model": MODEL_NAME,
        "recovery_ratio": ratio,
        "traffic_edge_count": 0,
        "signal_stop_count": len(mandatory),
    }
