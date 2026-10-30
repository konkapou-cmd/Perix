import math

import pytest

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
    baseline = _bus_leg({})
    assert recovery["duration_s"] < natural["duration_s"]
    assert recovery["segments"] == baseline["segments"]
    assert natural["traffic_edge_count"] == 2


def _bus_leg(traffic, recovery_ratio=0.0, **kwargs):
    return build_bus_leg(
        edges=_edges(),
        signals=kwargs.pop("signals", []),
        traffic_by_edge=traffic,
        start_m=0.0,
        end_m=500.0,
        departure_service_s=36000,
        config=kwargs.pop("config", BUS_CONFIG),
        recovery_ratio=recovery_ratio,
        **kwargs,
    )


@pytest.mark.parametrize("speed_kmh", [0.1, 0.5, 3.0, 15.0, 80.0])
@pytest.mark.parametrize("ratio", [0.0, 0.25, 0.5, 1.0])
@pytest.mark.parametrize("initial_speed_kmh", [0.0, 50.0])
def test_non_recoverable_traffic_caps_every_recovery_ratio(speed_kmh, ratio, initial_speed_kmh):
    traffic = {
        edge["edge_id"]: {
            "expected_speed_kmh": speed_kmh,
            "constraint": "NON_RECOVERABLE",
        }
        for edge in _edges()
    }
    natural = _bus_leg(traffic)
    recovered = _bus_leg(traffic, ratio, initial_speed_kmh=initial_speed_kmh)
    assert _bus_leg(traffic, ratio)["segments"] == natural["segments"]
    assert recovered["traffic_edge_count"] == 2
    effective_cap = min(speed_kmh, BUS_CONFIG["max_speed_kmh"])
    assert max(s[key] * 3.6 for s in recovered["segments"] for key in ("v0", "v1")) <= effective_cap + 1e-9
    assert recovered["segments"][0]["v0"] * 3.6 <= effective_cap + 1e-9
    assert recovered["duration_s"] >= 500.0 / (effective_cap / 3.6)


def test_recovery_keeps_hard_traffic_but_removes_static_slowdown():
    traffic = {
        "100:1:2": {"expected_speed_kmh": 3.0, "constraint": "NON_RECOVERABLE"},
        "101:2:3": {"expected_speed_kmh": 10.0},
    }
    recovered = _bus_leg(traffic, 1.0)
    assert recovered["duration_s"] < _bus_leg(traffic)["duration_s"]
    for segment in recovered["segments"]:
        if segment["p0"] < 250.0:
            assert max(segment["v0"], segment["v1"]) * 3.6 <= 3.0 + 1e-9


def test_impossible_arrival_is_physics_limited_without_removing_congestion(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    from mobility.motion.engine import _fit_leg

    traffic = {
        edge["edge_id"]: {"expected_speed_kmh": 3.0, "constraint": "NON_RECOVERABLE"}
        for edge in _edges()
    }
    natural = _bus_leg(traffic)
    fitted = _fit_leg(lambda ratio: _bus_leg(traffic, ratio), 60.0, 12)
    assert fitted["fit"] == "PHYSICS_LIMITED"
    assert fitted["time_scale"] == 1.0
    assert fitted["trajectory"]["segments"] == natural["segments"]
    assert fitted["physics_limited_s"] == pytest.approx(natural["duration_s"] - 60.0)


def test_realtime_duration_is_a_fit_target_not_added_traffic_delay(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    from mobility.motion.engine import _fit_leg

    traffic = {
        edge["edge_id"]: {"expected_speed_kmh": 15.0, "constraint": "NON_RECOVERABLE"}
        for edge in _edges()
    }
    natural = _bus_leg(traffic)
    # Realtime extends the available stop-to-stop duration, not the traffic input.
    desired = natural["duration_s"] + 30.0
    fitted = _fit_leg(lambda ratio: _bus_leg(traffic, ratio), desired, 12)
    assert fitted["fit"] == "NATURAL_STRETCH"
    assert fitted["trajectory"]["segments"] == natural["segments"]
    assert fitted["trajectory"]["duration_s"] * fitted["time_scale"] == pytest.approx(desired)
    assert fitted["physics_limited_s"] == 0.0


@pytest.mark.parametrize("constraint", [None, "NON_RECOVERABLE"])
@pytest.mark.parametrize("observed", [None, "", "bad", [], {}, True, False, 0, -3, math.nan,
                                      math.inf, -math.inf, "nan", "inf"])
def test_invalid_traffic_is_ignored_without_poisoning_trajectory(observed, constraint):
    traffic = {
        "100:1:2": {
            "expected_speed_kmh": observed,
            "constraint": constraint,
        "includes_signal_delay": True,
        }
    }
    result = _bus_leg(traffic)
    assert result["traffic_edge_count"] == 0
    assert result["segments"] == _bus_leg({})["segments"]
    assert math.isfinite(result["duration_s"])


@pytest.mark.parametrize("covered_edge", ["100:1:2", "101:2:3", "unrelated"])
@pytest.mark.parametrize("include_delay", [True, False])
def test_signal_delay_suppression_is_local_to_valid_covered_edge(monkeypatch, covered_edge, include_delay):
    monkeypatch.setattr("mobility.motion.bus.deterministic_signal_hold_seconds", lambda *a, **kw: 20.0)
    signals = [
        {
            "signal_instance_id": str(progress),
            "progress_m": progress,
            "kinds": ["ROAD_SIGNAL"],
            "usable_for_motion": True,
        }
        for progress in (125.0, 250.0, 375.0)
    ]
    traffic = {
        covered_edge: {
            "expected_speed_kmh": 15.0,
            "constraint": "NON_RECOVERABLE",
            "includes_signal_delay": include_delay,
        }
    }
    result = _bus_leg(traffic, signals=signals, config={**BUS_CONFIG, "road_signal_enabled": True})
    expected = {"125.0", "250.0", "375.0"}
    if include_delay and covered_edge == "100:1:2":
        expected -= {"125.0", "250.0"}
    if include_delay and covered_edge == "101:2:3":
        expected -= {"375.0"}
    holds = [s for s in result["segments"] if s["state"] == "SIGNAL_HOLD"]
    assert {s["hold_id"] for s in holds} == expected
    assert result["signal_stop_count"] == len(expected)


def test_invalid_traffic_does_not_suppress_signal_hold(monkeypatch):
    monkeypatch.setattr("mobility.motion.bus.deterministic_signal_hold_seconds", lambda *a, **kw: 20.0)
    result = _bus_leg(
        {"100:1:2": {"expected_speed_kmh": math.nan, "includes_signal_delay": True}},
        signals=[{"signal_id": "signal", "progress_m": 125.0, "kinds": ["ROAD_SIGNAL"],
                  "usable_for_motion": True}],
        config={**BUS_CONFIG, "road_signal_enabled": True},
    )
    assert result["signal_stop_count"] == 1


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
    recovered = build_tram_leg(
        edges=_edges(),
        signals=[],
        start_m=0.0,
        end_m=500.0,
        departure_service_s=36000,
        config=TRAM_CONFIG,
        recovery_ratio=1.0,
    )
    assert recovered["segments"] == trajectory["segments"]
    assert recovered["traffic_edge_count"] == 0
