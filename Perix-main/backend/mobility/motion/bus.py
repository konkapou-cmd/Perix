"""Bus-specific motion model over canonical OSM road edges."""
from __future__ import annotations

import math

from mobility.motion.common import (
    build_speed_trajectory,
    kmh_to_mps,
    deterministic_signal_hold_seconds,
    trajectory_time_at_progress,
    turn_angle_degrees,
    turn_speed_cap_kmh,
    refine_scenario_inputs,
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
    initial_speed_kmh: float = 0.0,
    scenario: dict | None = None,
) -> dict:
    """Build one physical bus leg.

    recovery_ratio=0 uses static traffic + modeled signal phases.
    recovery_ratio=1 removes those soft delays but never exceeds road,
    vehicle, or NON_RECOVERABLE traffic speed limits. Live edge deltas replace
    historical/signal delay on covered edges and stretch movement only.
    """
    ratio = max(0.0, min(1.0, float(recovery_ratio)))
    leg_edges = _overlap_edges(edges, start_m, end_m)
    if not leg_edges:
        return {"model": MODEL_NAME, "duration_s": 0.0, "segments": []}

    spans = []
    traffic_edges = 0
    signal_delay_edges = set()
    traffic_delay_s = 0.0
    for edge in leg_edges:
        hard = _hard_speed_kmh(edge, config)
        traffic = traffic_by_edge.get(str(edge.get("edge_id"))) or {}
        delta = traffic.get("traffic_delay_s")
        length = traffic.get("canonical_length_m")
        if (isinstance(delta, (int, float)) and not isinstance(delta, bool)
                and math.isfinite(delta) and delta >= 0
                and isinstance(length, (int, float)) and not isinstance(length, bool)
                and math.isfinite(length) and length > 0):
            overlap = min(float(end_m), float(edge["to_m"])) - max(float(start_m), float(edge["from_m"]))
            traffic_delay_s += delta * min(1.0, overlap / length)
            traffic_edges += 1
            signal_delay_edges.add(str(edge.get("edge_id")))
            # The live delta replaces historical traffic and synthetic signals.
            traffic = {}
        try:
            observed = float(traffic.get("expected_speed_kmh"))
        except (TypeError, ValueError, OverflowError):
            observed = math.nan
        natural = hard
        non_recoverable = traffic.get("constraint") == "NON_RECOVERABLE"
        if (
            math.isfinite(observed)
            and observed > 0.0
            and not isinstance(traffic.get("expected_speed_kmh"), bool)
        ):
            natural = min(hard, observed if non_recoverable or scenario is not None else max(5.0, observed))
            if non_recoverable:
                hard = natural
            traffic_edges += 1
            if traffic.get("includes_signal_delay") is True:
                signal_delay_edges.add(str(edge.get("edge_id")))
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

    if scenario is not None:
        spans, point_caps = refine_scenario_inputs(spans, leg_edges, point_caps, scenario, config, start_m, end_m)

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
            if scenario is not None:
                event_id = str(signal.get('signal_instance_id') or signal.get('signal_id'))
                if event_id != scenario.get('hold_event_id'):
                    continue
            # A boundary signal belongs to the incoming edge, not the next edge.
            if any(
                span["edge_id"] in signal_delay_edges
                and span["from_m"] < progress <= span["to_m"]
                for span in spans
            ):
                continue
            arrival_elapsed = trajectory_time_at_progress(preliminary, progress) + cumulative_hold
            hold = scenario.get('hold_s', 0.0) if scenario is not None else deterministic_signal_hold_seconds(
                signal.get("signal_instance_id") or signal.get("signal_id"),
                float(departure_service_s) + arrival_elapsed,
                cycle_s=float(config["road_signal_cycle_s"]),
                green_ratio=float(config["road_signal_green_ratio"]),
                max_hold_s=float(config["road_signal_max_hold_s"]),
            )
            hold *= 1.0 - ratio
            if scenario is None and hold < float(config["road_signal_min_stop_s"]):
                continue
            mandatory.append(
                {
                    "progress_m": progress,
                    "hold_s": hold,
                    "state": "HYPOTHETICAL_SIGNAL_HOLD" if scenario is not None else "SIGNAL_HOLD",
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
        initial_speed_mps=kmh_to_mps(initial_speed_kmh),
    )
    moving_s = sum(s["t1"] - s["t0"] for s in trajectory["segments"] if s["state"] == "MOVING")
    if moving_s > 0 and traffic_delay_s > 0:
        scale = 1.0 + traffic_delay_s / moving_s
        elapsed = 0.0
        for segment in trajectory["segments"]:
            duration = segment["t1"] - segment["t0"]
            if segment["state"] == "MOVING":
                duration *= scale
                segment["v0"] /= scale
                segment["v1"] /= scale
            segment["t0"], segment["t1"] = elapsed, elapsed + duration
            elapsed += duration
        trajectory["duration_s"] = elapsed
    return {
        **trajectory,
        "model": MODEL_NAME,
        "recovery_ratio": ratio,
        "traffic_edge_count": traffic_edges,
        "signal_stop_count": len(mandatory),
        "traffic_delay_s": traffic_delay_s,
        **({'turn_events': point_caps, 'speed_constraints': spans, 'hypothetical': True} if scenario is not None else {}),
    }
