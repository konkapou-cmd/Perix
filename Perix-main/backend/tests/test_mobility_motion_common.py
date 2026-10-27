from mobility.motion.common import (
    build_speed_trajectory,
    deterministic_signal_hold_seconds,
    sample_trajectory,
)


def _straight_trajectory(hold_s=0.0):
    mandatory = []
    if hold_s:
        mandatory = [
            {
                "progress_m": 50.0,
                "hold_s": hold_s,
                "state": "SIGNAL_HOLD",
                "id": "signal-1",
            }
        ]
    return build_speed_trajectory(
        start_m=0.0,
        end_m=100.0,
        spans=[{"from_m": 0.0, "to_m": 100.0, "speed_cap_kmh": 36.0}],
        mandatory_stops=mandatory,
        acceleration_mps2=1.0,
        braking_mps2=1.0,
        step_m=5.0,
    )


def test_speed_trajectory_starts_and_ends_stopped():
    trajectory = _straight_trajectory()
    start = sample_trajectory(trajectory, 0.0)
    end = sample_trajectory(trajectory, trajectory["duration_s"])
    assert start["progress_m"] == 0.0
    assert start["speed_kmh"] == 0.0
    assert end["progress_m"] == 100.0
    assert end["speed_kmh"] == 0.0


def test_mandatory_hold_freezes_progress():
    trajectory = _straight_trajectory(hold_s=12.0)
    hold = next(s for s in trajectory["segments"] if s["state"] == "SIGNAL_HOLD")
    middle = (hold["t0"] + hold["t1"]) / 2.0
    sampled = sample_trajectory(trajectory, middle)
    assert sampled["progress_m"] == 50.0
    assert sampled["speed_kmh"] == 0.0
    assert sampled["state"] == "SIGNAL_HOLD"


def test_signal_phase_is_deterministic():
    a = deterministic_signal_hold_seconds(
        "signal-123",
        36000,
        cycle_s=90,
        green_ratio=0.55,
        max_hold_s=50,
    )
    b = deterministic_signal_hold_seconds(
        "signal-123",
        36000,
        cycle_s=90,
        green_ratio=0.55,
        max_hold_s=50,
    )
    assert a == b
    assert 0.0 <= a <= 50.0
