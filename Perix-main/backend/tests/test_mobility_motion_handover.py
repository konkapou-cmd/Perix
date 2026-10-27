from mobility.motion.handover import (
    continuity_guard,
    find_handover_leg_index,
    handover_anchor_from_state,
    stable_trip_identity,
)


def test_identity_changes_at_trip_or_generation_boundary():
    base = dict(region_id="r", network_id="n", version_id="v", pattern_id="p")
    a = stable_trip_identity(**base, trip_id="t1", derived_generation="g1")
    b = stable_trip_identity(**base, trip_id="t2", derived_generation="g1")
    c = stable_trip_identity(**base, trip_id="t1", derived_generation="g2")
    assert a != b
    assert a != c


def test_handover_anchors_at_last_emitted_progress():
    anchor = handover_anchor_from_state(
        {
            "progress_m": 450.0,
            "speed_kmh": 31.0,
            "service_s": 1000.0,
            "carried_lateness_s": 9.8,
        },
        now_service_s=1012.0,
        total_m=2000.0,
    )
    assert anchor["progress_m"] == 450.0
    assert anchor["speed_kmh"] == 31.0
    assert anchor["service_s"] == 1012.0


def test_handover_finds_current_leg():
    anchors = [{"progress_m": 0.0}, {"progress_m": 300.0}, {"progress_m": 800.0}]
    assert find_handover_leg_index(anchors, 450.0) == 1


def test_717m_backward_resample_can_never_be_emitted():
    guarded = continuity_guard(
        {"progress_m": 120.0, "speed_kmh": 35.0, "motion_state": "MOVING"},
        {"progress_m": 837.0},
    )
    assert guarded["progress_m"] == 837.0
    assert guarded["backward_resample_prevented_m"] == 717.0
    assert guarded["motion_state"] == "CONTINUITY_GUARD"


def test_turnaround_new_trip_can_restart():
    sampled = continuity_guard(
        {"progress_m": 0.0, "speed_kmh": 0.0, "motion_state": "AT_STOP"},
        None,
    )
    assert sampled["progress_m"] == 0.0
