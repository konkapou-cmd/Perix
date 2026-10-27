from mobility.motion.explain import _soft_components, _trip_summary


def test_soft_components_are_reported_as_marginals_not_claimed_additive_truth():
    components = _soft_components(
        mode="bus",
        natural_duration_s=130.0,
        fastest_duration_s=100.0,
        traffic_only_duration_s=120.0,
        signal_only_duration_s=110.0,
    )
    assert components["soft_total_s"] == 30.0
    assert components["traffic_marginal_s"] == 20.0
    assert components["signal_marginal_s"] == 10.0
    assert components["interaction_s"] == 0.0


def test_trip_summary_uses_final_error_and_incremental_error_separately():
    legs = [
        {
            "from_stop_id": "A",
            "to_stop_id": "B",
            "distance_m": 1000.0,
            "scheduled_duration_s": 100.0,
            "predicted_leg_duration_s": 100.0,
            "effective_duration_s": 110.0,
            "natural_duration_s": 120.0,
            "fastest_duration_s": 110.0,
            "arrival_target_error_s": 10.0,
            "incremental_physics_limited_s": 10.0,
            "recovered_lateness_s": 0.0,
            "scheduled_floor_margin_s": -10.0,
            "coverage": {
                "way_attribute_distance_m": 1000.0,
                "maxspeed_tagged_distance_m": 800.0,
                "traffic_profile_distance_m": 0.0,
                "signal_candidate_count": 0,
            },
            "signal_hold_count": 0,
            "warnings": ["SCHEDULE_BELOW_FASTEST_MODEL"],
        },
        {
            "from_stop_id": "B",
            "to_stop_id": "C",
            "distance_m": 1000.0,
            "scheduled_duration_s": 100.0,
            "predicted_leg_duration_s": 100.0,
            "effective_duration_s": 110.0,
            "natural_duration_s": 120.0,
            "fastest_duration_s": 100.0,
            # 10 seconds are carried, no new limitation is added.
            "arrival_target_error_s": 20.0,
            "incremental_physics_limited_s": 10.0,
            "recovered_lateness_s": 0.0,
            "scheduled_floor_margin_s": 0.0,
            "coverage": {
                "way_attribute_distance_m": 1000.0,
                "maxspeed_tagged_distance_m": 1000.0,
                "traffic_profile_distance_m": 0.0,
                "signal_candidate_count": 0,
            },
            "signal_hold_count": 0,
            "warnings": ["ARRIVAL_TARGET_MISSED"],
        },
    ]
    summary = _trip_summary(legs)
    assert summary["final_arrival_target_error_s"] == 20.0
    assert summary["max_arrival_target_error_s"] == 20.0
    assert summary["incremental_physics_limited_s"] == 20.0
    assert summary["scheduled_below_fastest_leg_count"] == 1
    assert summary["maxspeed_coverage_ratio"] == 0.9
