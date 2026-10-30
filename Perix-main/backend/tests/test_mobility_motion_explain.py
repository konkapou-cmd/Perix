from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from mobility.motion.bus import build_bus_leg
from mobility.motion import explain
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


@pytest.mark.asyncio
@pytest.mark.parametrize("mixed", [False, True])
@pytest.mark.parametrize("includes_signal_delay", [False, True])
async def test_explain_retains_hard_traffic_and_snapshot_provenance(
    monkeypatch, mixed, includes_signal_delay,
):
    edges = [
        {
            "edge_id": f"private-edge-{index}",
            "from_m": index * 250.0,
            "to_m": (index + 1) * 250.0,
            "way": {"highway": "primary", "maxspeed_kmh": 50.0},
        }
        for index in range(3)
    ]
    signals = [
        {"signal_id": str(progress), "progress_m": progress,
         "kinds": ["ROAD_SIGNAL"], "usable_for_motion": True}
        for progress in (125.0, 375.0)
    ]
    infra = {"edges": edges, "signals": signals}
    config = {
        "max_speed_kmh": 50.0,
        "acceleration_mps2": 0.95,
        "braking_mps2": 1.2,
        "trajectory_step_m": 5.0,
        "road_signal_enabled": True,
        "road_signal_cycle_s": 90.0,
        "road_signal_green_ratio": 0.55,
        "road_signal_max_hold_s": 50.0,
        "road_signal_min_stop_s": 4.0,
    }
    hard = {
        "expected_speed_kmh": 3.0,
        "constraint": "NON_RECOVERABLE",
        "provider": "GOOGLE_ROUTES_TRAFFIC_V1",
        "includes_signal_delay": includes_signal_delay,
        "fetched_at": "2026-10-21T10:00:00+00:00",
        "expires_at": "2026-10-21T10:05:00+00:00",
        "api_key": "must-not-leak",
    }
    soft = {"expected_speed_kmh": 10.0, "provider": "STATIC_PROFILE_V1",
            "profile_version": "static-v1", "raw_response": "must-not-leak"}
    traffic = {edges[0]["edge_id"]: hard, edges[1]["edge_id"]: soft if mixed else dict(hard),
               edges[2]["edge_id"]: hard, "unrelated-private-key": hard}
    snapshot = {"provider": "GOOGLE_ROUTES_TRAFFIC_V1+STATIC_PROFILE_V1" if mixed else hard["provider"],
                "profile_versions": ["static-v1"] if mixed else [], "by_edge": traffic}
    monkeypatch.setattr("mobility.motion.bus.deterministic_signal_hold_seconds", lambda *a, **kw: 20.0)
    monkeypatch.setattr(explain, "motion_config_for", lambda *a: config)
    monkeypatch.setattr(explain, "motion_signals_for_infrastructure", lambda *a: signals)
    monkeypatch.setattr("mobility.generations.atomic_generations_enabled", lambda: False)
    collection = SimpleNamespace(find_one=AsyncMock(return_value=infra))
    monkeypatch.setattr(explain, "db", SimpleNamespace(mobility_pattern_infrastructure=collection))

    def variant(ratio, observations=traffic, signal_inputs=signals):
        return build_bus_leg(
            edges=edges, signals=signal_inputs, traffic_by_edge=observations,
            start_m=0.0, end_m=500.0, departure_service_s=36000.0,
            config=config, recovery_ratio=ratio,
        )

    fastest = variant(1.0)
    natural = variant(0.0)

    async def build_plan(**kwargs):
        assert kwargs.get("allow_live_fetch", False) is False
        kwargs["traffic_snapshot_out"].update(snapshot)
        return {
            "segments": [{"kind": "MOVE", "from_timeline_index": 0, "next_timeline_index": 1,
                          "trajectory": fastest, "t0": 36000.0,
                          "t1": 36000.0 + fastest["duration_s"], "time_scale": 1.0,
                          "fit": "PHYSICS_LIMITED"}],
        }

    monkeypatch.setattr(explain, "_build_trip_plan", build_plan)
    # Counterfactuals must reuse the snapshot used by the selected plan.
    no_fetch = AsyncMock(side_effect=AssertionError("unexpected traffic fetch"))
    monkeypatch.setattr("mobility.motion.traffic.traffic_snapshot_for_edges", no_fetch)
    report = await explain.explain_trip_plan(
        trip_id="trip", mode="bus", version_id="version", path={"pattern_id": "pattern"},
        timeline=[{"stop_id": "A", "scheduled_departure": 36000.0},
                  {"stop_id": "B", "scheduled_arrival": 36060.0}],
        now_local=datetime(2026, 10, 21, 10, tzinfo=timezone.utc),
    )
    no_fetch.assert_not_awaited()
    collection.find_one.assert_awaited_once()
    assert report["available"]
    assert report["traffic_provider"] == snapshot["provider"]
    assert report["traffic_profile_versions"] == snapshot["profile_versions"]
    leg = report["legs"][0]
    assert leg["fastest_duration_s"] == pytest.approx(fastest["duration_s"], abs=0.001)
    assert leg["natural_duration_s"] == pytest.approx(natural["duration_s"], abs=0.001)
    assert leg["fastest_duration_s"] > variant(1.0, {})["duration_s"]
    assert leg["scheduled_floor_margin_s"] == pytest.approx(60.0 - fastest["duration_s"], abs=0.001)
    assert "SCHEDULE_BELOW_FASTEST_MODEL" in leg["warnings"]
    assert leg["baseline_diagnosis"]["state"] == "SCHEDULE_BELOW_FASTEST_MODEL"
    hard_only = {key: value for key, value in traffic.items() if value.get("constraint") == "NON_RECOVERABLE"}
    expected = _soft_components(
        mode="bus", natural_duration_s=natural["duration_s"],
        fastest_duration_s=fastest["duration_s"],
        traffic_only_duration_s=variant(0.0, signal_inputs=[])["duration_s"],
        signal_only_duration_s=variant(0.0, hard_only)["duration_s"],
    )
    assert leg["soft_components"] == expected
    if mixed:
        assert expected["traffic_marginal_s"] > 0.0
    else:
        assert expected["traffic_marginal_s"] == 0.0
        assert expected["interaction_s"] == 0.0
        if includes_signal_delay:
            assert expected["soft_total_s"] == 0.0
    assert leg["traffic_constraints"][0] == {
        "provider": hard["provider"], "constraint": "NON_RECOVERABLE",
        "edge_count": 1 if mixed else 2,
        "fetched_at": hard["fetched_at"], "expires_at": hard["expires_at"],
    }
    if mixed:
        assert leg["traffic_constraints"][1] == {
            "provider": "STATIC_PROFILE_V1", "constraint": "RECOVERABLE",
            "edge_count": 1, "fetched_at": None, "expires_at": None,
        }
    else:
        assert len(leg["traffic_constraints"]) == 1
    assert "must-not-leak" not in str(report)
    assert "private-edge" not in str(report)
    assert "unrelated-private-key" not in str(report)
