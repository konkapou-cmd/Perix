import math

import pytest

from mobility.motion.common import (
    build_speed_trajectory,
    deterministic_signal_hold_seconds,
    sample_trajectory,
    trajectory_time_at_progress,
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


@pytest.mark.parametrize(
    "distance,accel,brake,cap_kmh",
    [(0.01, 1.0, 1.0, 36.0), (2.0, 0.6, 1.4, 36.0),
     (2.0, 0.6, 1.4, 0.36), (2.0, 0.6, 1.4, 0.1), (2.0, 0.6, 1.4, 0.0001)],
)
def test_short_rest_to_rest_interval(distance, accel, brake, cap_kmh):
    trajectory = build_speed_trajectory(
        start_m=10.0,
        end_m=10.0 + distance,
        spans=[{"from_m": 10.0, "to_m": 10.0 + distance, "speed_cap_kmh": cap_kmh}],
        acceleration_mps2=accel,
        braking_mps2=brake,
    )
    peak = min(cap_kmh / 3.6, math.sqrt(2.0 * distance * accel * brake / (accel + brake)))
    accel_s, brake_s = peak / accel, peak / brake
    cruise_s = max(0.0, (distance - peak * (accel_s + brake_s) / 2.0) / peak)
    duration = accel_s + cruise_s + brake_s
    assert trajectory["duration_s"] == pytest.approx(duration)
    segments = trajectory["segments"]
    assert len(segments) == (3 if cruise_s > 1e-9 else 2)
    assert segments[0]["v0"] == 0.0
    assert segments[-1]["v1"] == 0.0
    assert max(max(s["v0"], s["v1"]) for s in segments) == pytest.approx(peak)
    for index, segment in enumerate(segments):
        dt = segment["t1"] - segment["t0"]
        rate = (segment["v1"] - segment["v0"]) / dt
        assert -brake - 1e-9 <= rate <= accel + 1e-9
        assert segment["p1"] - segment["p0"] == pytest.approx(
            (segment["v0"] + segment["v1"]) * dt / 2.0
        )
        if index:
            assert segment["t0"] == segments[index - 1]["t1"]
            assert segment["p0"] == segments[index - 1]["p1"]
            assert segment["v0"] == segments[index - 1]["v1"]
    assert (segments[0]["v1"] / (segments[0]["t1"] - segments[0]["t0"])) == pytest.approx(accel)
    assert (segments[-1]["v0"] / (segments[-1]["t1"] - segments[-1]["t0"])) == pytest.approx(brake)

    midpoint = duration / 2.0
    if midpoint <= accel_s:
        expected_distance = accel * midpoint**2 / 2.0
    elif midpoint <= accel_s + cruise_s:
        expected_distance = peak * accel_s / 2.0 + peak * (midpoint - accel_s)
    else:
        expected_distance = distance - brake * (duration - midpoint)**2 / 2.0
    assert sample_trajectory(trajectory, midpoint)["progress_m"] == pytest.approx(10.0 + expected_distance)
    end = sample_trajectory(trajectory, trajectory["duration_s"])
    assert end["progress_m"] == pytest.approx(10.0 + distance)
    assert end["speed_kmh"] == pytest.approx(0.0)
    samples = [sample_trajectory(trajectory, duration * i / 100.0) for i in range(101)]
    progress = [sample["progress_m"] for sample in samples]
    assert progress == sorted(progress)
    assert all(0.0 <= sample["speed_kmh"] <= cap_kmh + 1e-9 for sample in samples)
    assert sample_trajectory(trajectory, accel_s)["speed_kmh"] == pytest.approx(peak * 3.6)
    for segment in segments:
        elapsed = (segment["t0"] + segment["t1"]) / 2.0
        progress = sample_trajectory(trajectory, elapsed)["progress_m"]
        assert trajectory_time_at_progress(trajectory, progress) == pytest.approx(elapsed, rel=1e-4)


@pytest.mark.parametrize("cap_kmh", [0.1, 0.0001])
@pytest.mark.parametrize("initial_speed_mps", [0.0, 10.0])
@pytest.mark.parametrize("span_start", [0.0, 200.0])
def test_positive_span_cap_is_preserved_including_fallback_and_initial_speed(
    cap_kmh, initial_speed_mps, span_start,
):
    trajectory = build_speed_trajectory(
        start_m=0.0,
        end_m=100.0,
        spans=[{"from_m": span_start, "to_m": span_start + 100.0, "speed_cap_kmh": cap_kmh}],
        acceleration_mps2=1.0,
        braking_mps2=1.0,
        initial_speed_mps=initial_speed_mps,
    )
    assert math.isfinite(trajectory["duration_s"])
    assert trajectory["duration_s"] >= 100.0 / (cap_kmh / 3.6)
    assert max(s[key] * 3.6 for s in trajectory["segments"] for key in ("v0", "v1")) <= cap_kmh + 1e-12
    assert sample_trajectory(trajectory, 0.0)["speed_kmh"] == pytest.approx(
        min(initial_speed_mps * 3.6, cap_kmh)
    )


@pytest.mark.parametrize("cap_kmh", [0.36, 0.1])
def test_short_rest_to_rest_intervals_preserve_mandatory_hold(cap_kmh):
    trajectory = build_speed_trajectory(
        start_m=0.0,
        end_m=4.0,
        spans=[{"from_m": 0.0, "to_m": 4.0, "speed_cap_kmh": cap_kmh}],
        mandatory_stops=[{"progress_m": 2.0, "hold_s": 3.0, "state": "SIGNAL_HOLD", "id": "short-stop"}],
        acceleration_mps2=0.6,
        braking_mps2=1.4,
    )
    hold = next(s for s in trajectory["segments"] if s["state"] == "SIGNAL_HOLD")
    assert hold["t1"] - hold["t0"] == pytest.approx(3.0)
    assert hold["hold_id"] == "short-stop"
    for fraction in (0.0, 0.5, 1.0):
        sampled = sample_trajectory(trajectory, hold["t0"] + fraction * 3.0)
        assert sampled["progress_m"] == pytest.approx(2.0)
        assert sampled["speed_kmh"] == pytest.approx(0.0)
    assert sample_trajectory(trajectory, hold["t0"] + 1.5)["state"] == "SIGNAL_HOLD"
    assert 0.0 < sample_trajectory(trajectory, hold["t0"] / 2.0)["progress_m"] < 2.0
    assert 2.0 < sample_trajectory(trajectory, (hold["t1"] + trajectory["duration_s"]) / 2.0)["progress_m"] < 4.0
    assert sample_trajectory(trajectory, trajectory["duration_s"])["progress_m"] == pytest.approx(4.0)
    samples = [sample_trajectory(trajectory, trajectory["duration_s"] * i / 100.0) for i in range(101)]
    progress = [sample["progress_m"] for sample in samples]
    assert progress == sorted(progress)


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
