from mobility.motion.diagnostics import lateness_flow, timeline_leg_contract


def test_leg_delay_delta_uses_departure_to_next_arrival():
    current = {
        "scheduled": 1000,
        "scheduled_arrival": 1000,
        "scheduled_departure": 1060,
        # Arrival delay is +60 but departure delay is +120.
        "predicted_arrival": 1060,
        "predicted_departure": 1180,
        "delay_seconds": 60,
    }
    nxt = {
        "scheduled": 1600,
        "scheduled_arrival": 1600,
        "scheduled_departure": 1600,
        # Next arrival delay is +300.
        "predicted_arrival": 1900,
        "predicted_departure": 1900,
        "delay_seconds": 300,
    }
    contract = timeline_leg_contract(current, nxt)
    assert contract["departure_delay_s"] == 120.0
    assert contract["arrival_delay_s"] == 300.0
    assert contract["delay_delta_s"] == 180
    assert contract["scheduled_duration_s"] == 540.0
    assert contract["predicted_leg_duration_s"] == 720.0


def test_lateness_flow_does_not_double_count_carried_delay():
    flow = lateness_flow(
        predicted_departure_s=1000,
        effective_departure_s=1030,
        predicted_arrival_s=1100,
        effective_arrival_s=1150,
    )
    assert flow["carried_lateness_s"] == 30.0
    assert flow["arrival_target_error_s"] == 50.0
    assert flow["incremental_physics_limited_s"] == 20.0
    assert flow["recovered_lateness_s"] == 0.0


def test_lateness_flow_detects_recovery():
    flow = lateness_flow(
        predicted_departure_s=1000,
        effective_departure_s=1060,
        predicted_arrival_s=1100,
        effective_arrival_s=1120,
    )
    assert flow["carried_lateness_s"] == 60.0
    assert flow["arrival_target_error_s"] == 20.0
    assert flow["incremental_physics_limited_s"] == 0.0
    assert flow["recovered_lateness_s"] == 40.0
