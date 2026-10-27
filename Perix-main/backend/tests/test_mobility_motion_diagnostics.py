from mobility.motion.common import build_speed_trajectory
from mobility.motion.diagnostics import (
    leg_input_coverage,
    summarize_vehicle_motion,
    trajectory_metrics,
)


def test_trajectory_metrics_measure_cap_pressure_and_hold_time():
    trajectory = build_speed_trajectory(
        start_m=0.0,
        end_m=300.0,
        spans=[{"from_m": 0.0, "to_m": 300.0, "speed_cap_kmh": 36.0}],
        mandatory_stops=[
            {
                "progress_m": 150.0,
                "hold_s": 10.0,
                "state": "SIGNAL_HOLD",
                "id": "s1",
            }
        ],
        acceleration_mps2=1.0,
        braking_mps2=1.0,
        step_m=5.0,
    )
    metrics = trajectory_metrics(
        trajectory,
        global_cap_kmh=36.0,
    )
    assert metrics["distance_m"] == 300.0
    assert metrics["hold_s"] >= 10.0
    assert metrics["hold_states_s"]["SIGNAL_HOLD"] >= 10.0
    assert metrics["max_speed_kmh"] <= 36.01
    assert 0.0 <= metrics["global_cap_pressure_ratio"] <= 1.0


def test_input_coverage_is_distance_weighted():
    infra = {
        "edges": [
            {
                "edge_id": "100:1:2",
                "from_m": 0.0,
                "to_m": 100.0,
                "from_point": [52.1, 11.6],
                "to_point": [52.1, 11.601],
                "way": {"highway": "primary", "maxspeed_kmh": 50.0},
            },
            {
                "edge_id": "101:2:3",
                "from_m": 100.0,
                "to_m": 300.0,
                "from_point": [52.1, 11.601],
                "to_point": [52.1, 11.603],
                "way": {"highway": "secondary", "maxspeed_kmh": None},
            },
        ],
        "signals": [
            {
                "signal_id": 2,
                "kinds": ["ROAD_SIGNAL"],
                "progress_m": 100.0,
                "usable_for_motion": True,
                "resolved_direction_tag": "forward",
            }
        ],
    }
    coverage = leg_input_coverage(
        infra=infra,
        start_m=0.0,
        end_m=300.0,
        mode="bus",
        traffic_by_edge={"101:2:3": {"expected_speed_kmh": 25.0}},
        config={"max_speed_kmh": 50.0, "turn_speed_kmh": {"20": 35.0, "40": 25.0, "70": 15.0}},
    )
    assert coverage["distance_m"] == 300.0
    assert coverage["maxspeed_coverage_ratio"] == round(100.0 / 300.0, 4)
    assert coverage["traffic_profile_coverage_ratio"] == round(200.0 / 300.0, 4)
    assert coverage["signal_candidate_count"] == 1
    assert coverage["direction_tagged_signal_count"] == 1


def test_vehicle_summary_separates_physics_and_fallback():
    vehicles = [
        {
            "vehicle_id": "v1",
            "trip_id": "t1",
            "route_number": "52",
            "mode": "bus",
            "estimated": True,
            "motion": {
                "model": "BUS_PHYSICS_V1",
                "quality": "PHYSICS_BASELINE",
                "state": "MOVING",
                "speed_kmh": 30.0,
                "fit": "PHYSICS_LIMITED",
                "arrival_target_error_s": 40.0,
                "incremental_physics_limited_s": 10.0,
                "carried_lateness_s": 30.0,
            },
        },
        {
            "vehicle_id": "v2",
            "trip_id": "t2",
            "route_number": "9",
            "mode": "tram",
            "estimated": True,
            "motion": {
                "model": None,
                "quality": "LEGACY_FALLBACK",
                "state": "LEGACY_FALLBACK",
                "fallback_reason": "INFRASTRUCTURE_NOT_FOUND",
            },
        },
    ]
    summary = summarize_vehicle_motion(vehicles)
    assert summary["physics_vehicles"] == 1
    assert summary["legacy_fallback_vehicles"] == 1
    assert summary["fallback_reasons"]["INFRASTRUCTURE_NOT_FOUND"] == 1
    assert summary["limited_vehicle_count"] == 1
