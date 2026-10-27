from mobility.motion.bus import build_bus_leg
from mobility.motion.tram import build_tram_leg


def _edges():
    return [
        {
            "edge_id": "100:1:2",
            "from_m": 0.0,
            "to_m": 250.0,
            "from_point": [52.10, 11.60],
            "to_point": [52.10, 11.603],
            "way": {
                "highway": "primary",
                "railway": "tram",
                "maxspeed_kmh": 50.0,
            },
        },
        {
            "edge_id": "101:2:3",
            "from_m": 250.0,
            "to_m": 500.0,
            "from_point": [52.10, 11.603],
            "to_point": [52.102, 11.603],
            "way": {
                "highway": "secondary",
                "railway": "tram",
                "maxspeed_kmh": 50.0,
            },
        },
    ]


BUS_CONFIG = {
    "acceleration_mps2": 0.95,
    "braking_mps2": 1.20,
    "max_speed_kmh": 50.0,
    "default_speed_kmh": {"primary": 50.0, "secondary": 50.0},
    "turn_speed_kmh": {"20": 35.0, "40": 25.0, "70": 15.0},
    "road_signal_enabled": False,
    "road_signal_cycle_s": 90.0,
    "road_signal_green_ratio": 0.55,
    "road_signal_max_hold_s": 50.0,
    "road_signal_min_stop_s": 4.0,
    "trajectory_step_m": 5.0,
}

TRAM_CONFIG = {
    "acceleration_mps2": 0.80,
    "braking_mps2": 1.00,
    "max_speed_kmh": 55.0,
    "default_speed_kmh": 45.0,
    "turn_speed_kmh": {"20": 35.0, "40": 28.0, "70": 20.0},
    "rail_signal_enabled": False,
    "rail_signal_cycle_s": 60.0,
    "rail_signal_green_ratio": 0.75,
    "rail_signal_max_hold_s": 30.0,
    "rail_signal_min_stop_s": 3.0,
    "trajectory_step_m": 5.0,
}


def test_bus_recovery_never_slower_than_traffic_plan():
    traffic = {
        "100:1:2": {"expected_speed_kmh": 15.0},
        "101:2:3": {"expected_speed_kmh": 20.0},
    }
    natural = build_bus_leg(
        edges=_edges(),
        signals=[],
        traffic_by_edge=traffic,
        start_m=0.0,
        end_m=500.0,
        departure_service_s=36000,
        config=BUS_CONFIG,
        recovery_ratio=0.0,
    )
    recovery = build_bus_leg(
        edges=_edges(),
        signals=[],
        traffic_by_edge=traffic,
        start_m=0.0,
        end_m=500.0,
        departure_service_s=36000,
        config=BUS_CONFIG,
        recovery_ratio=1.0,
    )
    assert recovery["duration_s"] <= natural["duration_s"]
    assert natural["traffic_edge_count"] == 2


def test_tram_v1_does_not_depend_on_road_traffic():
    trajectory = build_tram_leg(
        edges=_edges(),
        signals=[],
        start_m=0.0,
        end_m=500.0,
        departure_service_s=36000,
        config=TRAM_CONFIG,
        recovery_ratio=0.0,
    )
    assert trajectory["duration_s"] > 0
    assert trajectory["traffic_edge_count"] == 0
