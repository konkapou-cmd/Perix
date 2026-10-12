from mobility.motion.engine import _fit_leg


def _fake_builder(recovery_ratio: float):
    duration = 120.0 - 40.0 * float(recovery_ratio)
    return {
        "duration_s": duration,
        "segments": [],
        "model": "TEST",
        "recovery_ratio": float(recovery_ratio),
    }


def test_fit_leg_exposes_natural_duration_without_changing_stretch_behavior():
    fitted = _fit_leg(_fake_builder, 150.0, 10)
    assert fitted["fit"] == "NATURAL_STRETCH"
    assert fitted["time_scale"] == 1.25
    assert fitted["natural_duration_s"] == 120.0
    assert fitted["fastest_duration_s"] is None
    assert fitted["recovery_ratio"] == 0.0


def test_fit_leg_exposes_fastest_duration_when_physics_limited():
    fitted = _fit_leg(_fake_builder, 60.0, 10)
    assert fitted["fit"] == "PHYSICS_LIMITED"
    assert fitted["natural_duration_s"] == 120.0
    assert fitted["fastest_duration_s"] == 80.0
    assert fitted["physics_limited_s"] == 20.0
    assert fitted["recovery_ratio"] == 1.0


def test_fit_leg_recovery_blend_still_never_compresses():
    fitted = _fit_leg(_fake_builder, 100.0, 12)
    duration = fitted["trajectory"]["duration_s"] * fitted["time_scale"]
    assert fitted["fit"] == "RECOVERY_BLEND"
    assert fitted["time_scale"] >= 1.0
    assert duration >= 100.0 - 0.1
    assert 0.0 <= fitted["recovery_ratio"] <= 1.0
