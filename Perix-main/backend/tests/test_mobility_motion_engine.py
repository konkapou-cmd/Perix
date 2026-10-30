import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from mobility.motion import engine
from mobility.motion.common import build_speed_trajectory
from mobility.motion.engine import _anchors, _fit_leg, _sample_trip_plan


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


@pytest.mark.parametrize("progress_m", [1368.0, 1542.0])
@pytest.mark.parametrize("offset_s", [0.0, 0.001])
def test_sample_handover_at_plan_start(progress_m, offset_s):
    trajectory = build_speed_trajectory(
        start_m=progress_m,
        end_m=3000.0,
        spans=[{"from_m": progress_m, "to_m": 3000.0, "speed_cap_kmh": 50.0}],
        acceleration_mps2=1.0,
        braking_mps2=1.2,
        initial_speed_mps=30.0 / 3.6,
    )
    plan = {"segments": [{
        "kind": "MOVE",
        "t0": 1012.0,
        "t1": 1012.0 + trajectory["duration_s"],
        "trajectory": trajectory,
        "from_timeline_index": 1,
        "next_timeline_index": 2,
        "handover_applied": True,
        "handover_from_progress_m": progress_m,
        "handover_initial_speed_kmh": 30.0,
        "carried_lateness_s": 9.8,
    }]}

    sample = _sample_trip_plan(plan, 1012.0 + offset_s, [{}, {}, {}], [0, 1000, 3000])

    assert sample["progress_m"] == pytest.approx(progress_m + offset_s * 30.0 / 3.6, abs=0.001)
    assert sample["speed_kmh"] == pytest.approx(30.0, abs=0.01)
    assert sample["motion_state"] == "MOVING"
    assert sample["next_timeline_index"] == 2
    assert sample["handover_applied"] is True
    assert sample["handover_from_progress_m"] == progress_m
    assert sample["handover_initial_speed_kmh"] == 30.0
    assert sample["carried_lateness_s"] == 9.8


@pytest.mark.parametrize("now_sec, expected_state", [(999.999, "AT_STOP"), (1000.0, "DWELL"), (1005.0, "DWELL")])
def test_sample_initial_dwell_boundary(now_sec, expected_state):
    plan = {"segments": [{
        "kind": "DWELL",
        "t0": 1000.0,
        "t1": 1010.0,
        "progress_m": 1000.0,
        "timeline_index": 1,
    }]}

    sample = _sample_trip_plan(plan, now_sec, [{}, {}, {}], [0, 1000, 3000])

    assert sample["motion_state"] == expected_state
    assert sample["progress_m"] == 1000.0
    assert sample["speed_kmh"] == 0.0
    assert sample["next_timeline_index"] == 1


@pytest.mark.parametrize("mode", ["bus", "tram"])
@pytest.mark.parametrize("rebuild_reason", ["cache_expiry", "timeline_change"])
def test_plan_rebuild_keeps_moving_without_continuity_clamp(monkeypatch, mode, rebuild_reason):
    from mobility import generations

    region = SimpleNamespace(region_id="r", network_id="n", timezone="UTC", motion={})
    infra = {
        "total_m": 3000.0,
        "edges": [{
            "edge_id": "edge",
            "from_m": 0.0,
            "to_m": 3000.0,
            "way": {"highway": "primary", "railway": "tram", "maxspeed_kmh": 50.0},
        }],
        "signals": [],
    }
    find_infra = AsyncMock(return_value=infra)
    monkeypatch.setattr(engine, "db", SimpleNamespace(
        mobility_pattern_infrastructure=SimpleNamespace(find_one=find_infra),
    ))
    monkeypatch.setattr(engine, "get_active_region", lambda: region)
    monkeypatch.setattr(engine, "datetime", SimpleNamespace(
        now=lambda tz: datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc),
    ))
    monkeypatch.setattr(generations, "atomic_generations_enabled", lambda: False)
    monkeypatch.setattr(engine, "traffic_snapshot_for_edges", AsyncMock(return_value={"by_edge": {}}))
    monkeypatch.setenv("MOBILITY_PLAN_HANDOVER_ENABLED", "true")
    monkeypatch.setattr(engine, "_PLAN_CACHE", {})
    monkeypatch.setattr(engine, "_HANDOVER_STATE", {})
    clock = [100.0]
    monkeypatch.setattr(engine, "time", SimpleNamespace(monotonic=lambda: clock[0]))

    timeline = [
        {"stop_id": "A", "predicted_arrival": 700, "predicted_departure": 710},
        {"stop_id": "B", "predicted_arrival": 890, "predicted_departure": 900},
        {"stop_id": "C", "predicted_arrival": 1120, "predicted_departure": 1130},
    ]
    path = {"pattern_id": "p", "total_m": 3000.0, "stop_progress": [0, 1000, 3000]}
    async def sample(now_sec):
        return await engine.position_for_trip(
            trip_id="t", mode=mode, version_id="v", timeline=timeline, path=path, now_sec=now_sec,
        )

    first = asyncio.run(sample(1000))
    clock[0] = 103.0
    moving = asyncio.run(sample(1003))
    assert find_infra.await_count == 1
    assert moving["progress_m"] > first["progress_m"]

    clock[0] = 113.0 if rebuild_reason == "cache_expiry" else 106.0
    if rebuild_reason == "timeline_change":
        timeline[-1]["predicted_arrival"] += 1
    rebuild_time = 1013 if rebuild_reason == "cache_expiry" else 1006
    previous_plan = next(iter(engine._PLAN_CACHE.values()))["plan"]
    expected = _sample_trip_plan(previous_plan, rebuild_time, timeline, path["stop_progress"])
    rebuilt = asyncio.run(sample(rebuild_time))

    assert find_infra.await_count == 2
    assert rebuilt["progress_m"] > moving["progress_m"]
    assert rebuilt["progress_m"] == pytest.approx(expected["progress_m"])
    assert rebuilt["motion_state"] == "MOVING"
    assert rebuilt["speed_kmh"] > 0.0
    assert rebuilt["next_stop_id"] == "C"
    assert rebuilt["handover_applied"] is True
    assert rebuilt["handover_from_progress_m"] == pytest.approx(expected["progress_m"], abs=0.001)
    assert rebuilt["carried_lateness_s"] == expected["carried_lateness_s"]
    assert rebuilt["effective_timeline"][:2] == first["effective_timeline"][:2]
    assert rebuilt["continuity_clamp_m"] == 0.0
    assert rebuilt["backward_resample_prevented_m"] == 0.0

    clock[0] += 3.0
    following = asyncio.run(sample(rebuild_time + 3))
    assert following["progress_m"] > rebuilt["progress_m"]
    assert following["motion_state"] == "MOVING"
    assert find_infra.await_count == 2
