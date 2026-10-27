from mobility.motion.engine import _anchors, _fit_leg


def _fake_builder(recovery_ratio: float):
    duration = 120.0 - 40.0 * float(recovery_ratio)
    return {
        "duration_s": duration,
        "segments": [],
        "model": "TEST",
    }


def test_fit_leg_stretches_when_target_is_slower_than_natural():
    fitted = _fit_leg(_fake_builder, 150.0, 10)
    assert fitted["fit"] == "NATURAL_STRETCH"
    assert fitted["time_scale"] == 1.25
    assert fitted["physics_limited_s"] == 0.0


def test_fit_leg_never_compresses_beyond_fastest_physics():
    fitted = _fit_leg(_fake_builder, 60.0, 10)
    assert fitted["fit"] == "PHYSICS_LIMITED"
    assert fitted["time_scale"] == 1.0
    assert fitted["physics_limited_s"] == 20.0


def test_skipped_stop_is_not_a_motion_anchor():
    timeline = [
        {"stop_id": "A", "relationship": "SCHEDULED"},
        {"stop_id": "B", "relationship": "SKIPPED"},
        {"stop_id": "C", "relationship": "SCHEDULED"},
    ]
    anchors = _anchors(timeline, [0.0, 100.0, 200.0])
    assert [a["timeline_index"] for a in anchors] == [0, 2]
    assert [a["progress_m"] for a in anchors] == [0.0, 200.0]
