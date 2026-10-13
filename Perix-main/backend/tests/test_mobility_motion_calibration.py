from mobility.motion.calibration import diagnose_leg_baseline


def _coverage(**overrides):
    base = {
        "way_attribute_coverage_ratio": 1.0,
        "maxspeed_coverage_ratio": 1.0,
        "posted_above_vehicle_cap_ratio": 0.0,
        "turn_cap_count": 0,
        "minimum_turn_cap_kmh": None,
    }
    base.update(overrides)
    return base


def _metrics(**overrides):
    base = {
        "moving_s": 100.0,
        "acceleration_s": 15.0,
        "braking_s": 15.0,
        "global_cap_pressure_ratio": 0.0,
    }
    base.update(overrides)
    return base


def _soft(**overrides):
    base = {
        "soft_total_s": 0.0,
        "signal_marginal_s": 0.0,
        "traffic_marginal_s": 0.0,
    }
    base.update(overrides)
    return base


def test_missing_maxspeed_data_is_prioritized_before_tuning():
    result = diagnose_leg_baseline(
        distance_m=1200,
        scheduled_duration_s=100,
        natural_duration_s=140,
        fastest_duration_s=125,
        coverage=_coverage(maxspeed_coverage_ratio=0.45),
        fastest_metrics=_metrics(),
        soft_components=_soft(signal_marginal_s=15, soft_total_s=15),
    )
    assert result["primary_hypothesis"] == "VERIFY_OSM_SPEED_DATA"


def test_cap_hypothesis_requires_cap_pressure_and_posted_speed_evidence():
    result = diagnose_leg_baseline(
        distance_m=1400,
        scheduled_duration_s=100,
        natural_duration_s=125,
        fastest_duration_s=115,
        coverage=_coverage(posted_above_vehicle_cap_ratio=0.7),
        fastest_metrics=_metrics(global_cap_pressure_ratio=0.4),
        soft_components=_soft(signal_marginal_s=10, soft_total_s=10),
    )
    assert result["primary_hypothesis"] == "VEHICLE_CAP_HYPOTHESIS"


def test_signal_soft_delay_is_not_mislabeled_as_hard_floor():
    result = diagnose_leg_baseline(
        distance_m=1000,
        scheduled_duration_s=120,
        natural_duration_s=145,
        fastest_duration_s=100,
        coverage=_coverage(),
        fastest_metrics=_metrics(),
        soft_components=_soft(
            signal_marginal_s=35,
            traffic_marginal_s=0,
            soft_total_s=45,
        ),
    )
    assert result["state"] == "FASTEST_COMPATIBLE_SOFT_MODEL_SLOW"
    assert result["primary_hypothesis"] == "SOFT_SIGNAL_EXPECTATION_EXCEEDS_MARGIN"


def test_compatible_baseline_has_no_tuning_hypothesis():
    result = diagnose_leg_baseline(
        distance_m=800,
        scheduled_duration_s=120,
        natural_duration_s=121,
        fastest_duration_s=100,
        coverage=_coverage(),
        fastest_metrics=_metrics(),
        soft_components=_soft(soft_total_s=21),
    )
    assert result["state"] == "BASELINE_COMPATIBLE"
    assert result["primary_hypothesis"] is None
