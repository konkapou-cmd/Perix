from mobility.motion.common import build_speed_trajectory, sample_trajectory


def test_mid_leg_trajectory_accepts_existing_speed():
    trajectory = build_speed_trajectory(
        start_m=450.0,
        end_m=900.0,
        spans=[{"from_m": 450.0, "to_m": 900.0, "speed_cap_kmh": 50.0}],
        acceleration_mps2=1.0,
        braking_mps2=1.2,
        initial_speed_mps=30.0 / 3.6,
    )
    sample = sample_trajectory(trajectory, 0.01)
    assert sample["progress_m"] >= 450.0
    assert sample["speed_kmh"] > 20.0


def test_default_start_remains_zero_speed():
    trajectory = build_speed_trajectory(
        start_m=0.0,
        end_m=200.0,
        spans=[{"from_m": 0.0, "to_m": 200.0, "speed_cap_kmh": 50.0}],
        acceleration_mps2=1.0,
        braking_mps2=1.2,
    )
    assert trajectory["segments"][0]["v0"] == 0.0
