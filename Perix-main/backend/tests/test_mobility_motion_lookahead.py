import asyncio
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from mobility.motion import engine

BASE = 12 * 3600
NOW = datetime(2026, 1, 1, 12, 1, 10, tzinfo=timezone.utc)


def evidence(age=0):
    return {"source": "GTFS_RT", "source_timestamp": NOW.timestamp() - age,
            "arrival_explicit": True, "departure_explicit": True}


def timelines():
    old = [{"stop_id": name, "scheduled_arrival": BASE + scheduled,
            "scheduled_departure": BASE + scheduled + (10 if i == 0 else 0),
            "predicted_arrival": BASE + predicted,
            "predicted_departure": BASE + (100 if i == 0 else predicted),
            "relationship": "SCHEDULED", "motion_prediction": evidence(30)}
           for i, (name, scheduled, predicted) in enumerate([
               ("A", -100, 0), ("B", 0, 135), ("C", 100, 250), ("D", 200, 370)])]
    new = deepcopy(old)
    new[0]["predicted_departure"] = BASE + 60
    for i, entry in enumerate(new):
        entry["motion_prediction"] = evidence()
        if i:
            entry["predicted_arrival"] -= 15
            entry["predicted_departure"] -= 15
    return old, new


@pytest.fixture
def scenario(monkeypatch):
    from mobility import generations
    region = SimpleNamespace(region_id="r", network_id="n", timezone="UTC", motion={})
    path = {"pattern_id": "p", "total_m": 600.0, "stop_progress": [0, 200, 400, 600]}
    infra = {"total_m": 600.0, "edges": [{"edge_id": "e", "from_m": 0, "to_m": 600,
             "way": {"highway": "primary", "railway": "tram", "maxspeed_kmh": 50}}], "signals": []}
    monkeypatch.setattr(engine, "get_active_region", lambda: region)
    monkeypatch.setattr(generations, "atomic_generations_enabled", lambda: False)
    monkeypatch.setattr(engine, "db", SimpleNamespace(mobility_pattern_infrastructure=SimpleNamespace(
        find_one=AsyncMock(side_effect=lambda *a, **k: deepcopy(infra)))))
    monkeypatch.setattr(engine, "traffic_snapshot_for_edges", AsyncMock(return_value={
        "provider": "STATIC_PROFILE_V1", "by_edge": {"e": {"expected_speed_kmh": 18}}}))
    monkeypatch.setenv("MOBILITY_WAIT_ONLY_RECOVERY_ENABLED", "false")
    monkeypatch.setenv("MOBILITY_TIME_ALLOCATION_ENABLED", "false")

    def build(timeline, previous=None, enabled=True, mode="bus", **kwargs):
        region.motion = {"common": {"arrival_lookahead_enabled": enabled}}
        args = dict(trip_id="t", version_id="v", mode=mode, timeline=deepcopy(timeline),
                    path=path, now_local=NOW, now_service_s=BASE + 70,
                    previous_plan=previous, history_index=0 if previous else None)
        args.update(kwargs)
        return asyncio.run(engine._build_trip_plan(**args))
    return SimpleNamespace(build=build, path=path, infra=infra, region=region)


def moves(plan):
    return [s for s in plan["segments"] if s["kind"] == "MOVE"]


def without_hint(plan):
    result = deepcopy(plan)
    result.pop("arrival_lookahead_scope", None)
    for s in result["segments"]:
        s.pop("arrival_lookahead", None)
    return result


@pytest.mark.parametrize("mode", ["bus", "tram"])
def test_coherent_three_arrivals_release_only_cached_optional_wait(scenario, mode):
    old, new = timelines()
    previous = scenario.build(old, mode=mode)
    frozen = deepcopy(previous)
    baseline = scenario.build(new, previous, enabled=False, mode=mode)
    improved = scenario.build(new, previous, mode=mode)
    before, after = moves(baseline)[0], moves(improved)[0]
    released = after["arrival_lookahead"]["released_cached_wait_s"]
    assert 0 < released <= 15
    assert before["recovery_ratio"] == 1  # Soft recovery tried before dwell.
    assert after["t0"] == pytest.approx(before["t0"] - released)
    assert after["t0"] >= BASE + 70  # Neither depart retroactively nor teleport.
    assert after["t0"] >= engine._stop_departure(new[0], BASE)
    assert after["t1"] < before["t1"]
    assert after["physics_limited_s"] < before["physics_limited_s"]
    assert improved["effective_timeline"][1]["predicted_arrival"] == after["t1"]
    sample = engine._sample_trip_plan(improved, after["t1"], new, scenario.path["stop_progress"])
    assert sample["progress_m"] == pytest.approx(200)
    assert previous == frozen


@pytest.mark.parametrize("case", ["one_update", "only_one_available", "stale", "old_stale", "old_propagated", "missing_clock",
                                  "future_clock", "same_revision", "propagated", "no_departure_evidence", "contradictory", "jitter", "spread"])
def test_insufficient_or_inconsistent_forecasts_preserve_baseline(scenario, case):
    old, new = timelines()
    if case == "old_stale":
        for entry in old: entry["motion_prediction"] = evidence(100)
    if case == "old_propagated": old[2]["motion_prediction"]["arrival_explicit"] = False
    previous = scenario.build(old)
    if case == "one_update":
        for i in (2, 3): new[i] = deepcopy(old[i]);new[i]["motion_prediction"] = evidence()
    if case == "only_one_available":
        for i in (2, 3): new[i]["motion_prediction"]["arrival_explicit"] = False
    if case == "stale": new[2]["motion_prediction"] = evidence(100)
    if case == "missing_clock": new[2]["motion_prediction"].pop("source_timestamp")
    if case == "future_clock": new[2]["motion_prediction"] = evidence(-1)
    if case == "same_revision": new[2]["motion_prediction"] = evidence(30)
    if case == "propagated": new[2]["motion_prediction"]["arrival_explicit"] = False
    if case == "no_departure_evidence": new[0]["motion_prediction"]["departure_explicit"] = False
    if case == "contradictory": new[3]["predicted_arrival"] += 40
    if case == "jitter":
        for i in (1, 2, 3):
            new[i]["predicted_arrival"] = old[i]["predicted_arrival"] - 1
    if case == "spread": new[3]["predicted_arrival"] -= 20
    assert without_hint(scenario.build(new, previous)) == without_hint(scenario.build(new, previous, enabled=False))


@pytest.mark.parametrize("bound", ["scheduled", "source_departure", "confirmed", "previous_confirmed", "initial_floor"])
def test_binding_departures_are_not_shortened(scenario, bound):
    old, new = timelines()
    args = {}
    if bound == "scheduled":
        for t in (old, new): t[0]["scheduled_departure"] = BASE + 100
    if bound == "source_departure": new[0]["predicted_departure"] = BASE + 100
    if bound == "confirmed": new[0]["departure_confirmed"] = True
    if bound == "previous_confirmed": old[0]["departure_confirmed"] = True
    if bound == "initial_floor": args["departure_floor_s"] = BASE + 100
    previous = scenario.build(old, **args)
    result = scenario.build(new, previous, **args)
    baseline = scenario.build(new, previous, enabled=False, **args)
    assert without_hint(result) == without_hint(baseline)
    assert moves(result)[0]["t0"] >= BASE + 100


def test_mandatory_service_and_actual_departure_are_preserved(scenario):
    old, new = timelines()
    previous = scenario.build(old)
    new[0]["predicted_departure"] = BASE + 95  # 95 seconds service from actual arrival.
    result = scenario.build(new, previous)
    assert 0 < moves(result)[0]["arrival_lookahead"]["released_cached_wait_s"] <= 5
    assert moves(result)[0]["t0"] >= BASE + 95


def test_impossible_prediction_keeps_all_physical_caps(scenario):
    old, new = timelines()
    scenario.path.update(total_m=1500, stop_progress=[0, 500, 1000, 1500])
    scenario.infra["total_m"] = scenario.infra["edges"][0]["to_m"] = 1500
    previous = scenario.build(old)
    result = scenario.build(new, previous)
    assert moves(result)[0]["physics_limited_s"] > 0
    for leg in moves(result):
        assert leg["time_scale"] >= 1
        for segment in leg["trajectory"]["segments"]:
            assert max(segment["v0"], segment["v1"]) * 3.6 <= 50.000001
            dt = segment["t1"] - segment["t0"]
            if dt > 0:
                acceleration = (segment["v1"] - segment["v0"]) / dt
                assert -1.200001 <= acceleration <= .950001


@pytest.mark.parametrize("mode", ["bus", "tram"])
def test_moving_handover_and_past_motion_are_not_rewritten(scenario, mode):
    old, new = timelines()
    previous = scenario.build(old, mode=mode)
    now = BASE + 110
    sample = engine._sample_trip_plan(previous, now, old, scenario.path["stop_progress"])
    anchor = {**sample, "service_s": now}
    args = dict(mode=mode, handover=anchor, now_service_s=now)
    result = scenario.build(new, previous, **args)
    baseline = scenario.build(new, previous, enabled=False, **args)
    assert without_hint(result) == without_hint(baseline)
    at_boundary = engine._sample_trip_plan(result, now, new, scenario.path["stop_progress"])
    assert at_boundary["progress_m"] == pytest.approx(sample["progress_m"])
    assert at_boundary["speed_kmh"] == pytest.approx(sample["speed_kmh"], abs=.01)
    positions = [engine._sample_trip_plan(result, now + i, new, scenario.path["stop_progress"])["progress_m"] for i in range(10)]
    assert positions == sorted(positions)


def test_repeated_forecast_does_not_spend_gain_twice(scenario):
    old, new = timelines()
    previous = scenario.build(old)
    once = scenario.build(new, previous)
    twice = scenario.build(new, once)
    assert moves(twice)[0]["t0"] == moves(once)[0]["t0"]
    assert "arrival_lookahead" not in moves(twice)[0]


@pytest.mark.parametrize("boundary", ["trip", "version", "day", "geometry", "context"])
def test_foreign_scope_never_reuses_forecast_history(scenario, boundary):
    old, new = timelines()
    previous = scenario.build(old)
    args = {}
    if boundary == "trip": args["trip_id"] = "other"
    if boundary == "version": args["version_id"] = "other"
    if boundary == "day": args["now_local"] = NOW + timedelta(days=1)
    if boundary == "geometry": scenario.path["derived_generation"] = "other"
    if boundary == "context": args["traffic_context"] = "google_locator"
    result = scenario.build(new, previous, **args)
    assert all("arrival_lookahead" not in s for s in moves(result))
    assert without_hint(result) == without_hint(scenario.build(new, previous, enabled=False, **args))


def test_new_anchor_triad_is_selected_by_existing_loop():
    old, new = timelines()
    for timeline in (old, new):
        timeline.append({**timeline[-1], "stop_id": "E", "scheduled_arrival": BASE + 300,
                         "scheduled_departure": BASE + 300,
                         "predicted_arrival": timeline[-1]["predicted_arrival"] + 100,
                         "predicted_departure": timeline[-1]["predicted_arrival"] + 100})
    previous = {"effective_timeline": old}
    anchors = engine._anchors(new, [0, 200, 400, 600, 800])
    assert engine._arrival_recovery_hint(anchors, 0, previous, NOW.timestamp(), {})["recoverable_s"] == 15
    assert engine._arrival_recovery_hint(anchors, 1, previous, NOW.timestamp(), {})["recoverable_s"] == 15
    assert engine._arrival_recovery_hint(anchors, 2, previous, NOW.timestamp(), {}) is None


def test_configurable_threshold_and_spread_and_worsening_forecasts():
    old, new = timelines()
    previous = {"effective_timeline": old}
    anchors = engine._anchors(new, [0, 200, 400, 600])
    assert engine._arrival_recovery_hint(anchors, 0, previous, NOW.timestamp(), {"arrival_lookahead_threshold_s": 20}) is None
    new[3]["predicted_arrival"] += 4
    assert engine._arrival_recovery_hint(anchors, 0, previous, NOW.timestamp(), {"arrival_lookahead_spread_s": 3}) is None
    for i in (1, 2, 3): new[i]["predicted_arrival"] = old[i]["predicted_arrival"] + 15
    assert engine._arrival_recovery_hint(anchors, 0, previous, NOW.timestamp(), {})["recoverable_s"] == 0


def test_default_config_is_off():
    from mobility.motion.config import DEFAULT_MOTION_CONFIG
    assert DEFAULT_MOTION_CONFIG["common"]["arrival_lookahead_enabled"] is False


def test_single_remaining_arrival_is_exactly_baseline(scenario):
    old, new = (t[:2] for t in timelines())
    scenario.path.update(total_m=200, stop_progress=[0, 200])
    scenario.infra["total_m"] = scenario.infra["edges"][0]["to_m"] = 200
    previous = scenario.build(old)
    assert without_hint(scenario.build(new, previous)) == without_hint(scenario.build(new, previous, enabled=False))
