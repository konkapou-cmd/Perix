import asyncio
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from mobility import generations, motion
from mobility.motion import engine


@pytest.fixture
def scenario(monkeypatch):
    clock = SimpleNamespace(now=datetime(2026, 10, 21, 12, tzinfo=timezone.utc), mono=100.0)

    class ClockDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return clock.now.astimezone(tz)

    region = SimpleNamespace(region_id="r", network_id="n", timezone="UTC", motion={},
                             service_day_start_hour=4)
    infra = {"total_m": 3000.0, "edges": [{
        "edge_id": "edge", "from_m": 0.0, "to_m": 3000.0,
        "way": {"highway": "primary", "railway": "tram", "maxspeed_kmh": 50.0},
    }], "signals": []}
    find = AsyncMock(return_value=infra)
    traffic = AsyncMock(return_value={"by_edge": {}})
    monkeypatch.setattr(engine, "db", SimpleNamespace(
        mobility_pattern_infrastructure=SimpleNamespace(find_one=find)))
    monkeypatch.setattr(engine, "get_active_region", lambda: region)
    monkeypatch.setattr(engine, "datetime", ClockDatetime)
    monkeypatch.setattr(engine, "time", SimpleNamespace(monotonic=lambda: clock.mono))
    monkeypatch.setattr(engine, "traffic_snapshot_for_edges", traffic)
    monkeypatch.setattr(engine, "_PLAN_CACHE", {})
    monkeypatch.setattr(engine, "_HANDOVER_STATE", {})
    monkeypatch.setattr(generations, "atomic_generations_enabled", lambda: False)
    monkeypatch.setenv("MOBILITY_PLAN_HANDOVER_ENABLED", "true")
    monkeypatch.setenv("MOBILITY_SIGNAL_SEMANTICS_ENABLED", "false")
    trip = dict(trip_id="t", mode="bus", version_id="v", now_sec=1010,
                path={"pattern_id": "p", "derived_generation": "g1", "total_m": 3000.0,
                      "stop_progress": [0.0, 1000.0, 3000.0]},
                timeline=[
                    {"stop_id": "A", "scheduled_arrival": 990, "scheduled_departure": 1000,
                     "predicted_arrival": 990, "predicted_departure": 1000, "source": "REALTIME"},
                    {"stop_id": "B", "scheduled_arrival": 1020, "scheduled_departure": 1040,
                     "predicted_arrival": 1020, "predicted_departure": 1040},
                    {"stop_id": "C", "scheduled_arrival": 1070, "scheduled_departure": 1080,
                     "predicted_arrival": 1070, "predicted_departure": 1080},
                ])
    return SimpleNamespace(clock=clock, trip=trip, find=find, traffic=traffic)


@pytest.mark.parametrize("mode", ["bus", "tram"])
def test_effective_clocks_match_plan_and_position_without_mutating_source(scenario, mode):
    s = scenario
    s.trip["mode"] = mode
    original = deepcopy(s.trip["timeline"])
    effective = asyncio.run(motion.effective_timeline_for_trip(**s.trip))
    assert engine._HANDOVER_STATE == {}
    plan = next(iter(engine._PLAN_CACHE.values()))["plan"]
    moves = [segment for segment in plan["segments"] if segment["kind"] == "MOVE"]
    for leg in moves:
        assert effective[leg["from_timeline_index"]]["predicted_departure"] == leg["t0"]
        assert effective[leg["next_timeline_index"]]["predicted_arrival"] == leg["t1"]
    assert effective[-1]["predicted_arrival"] > original[-1]["predicted_arrival"]
    for raw, entry in zip(original, effective):
        assert entry["raw_predicted_arrival"] == raw["predicted_arrival"]
        assert entry["raw_predicted_departure"] == raw["predicted_departure"]
        assert entry["delay_seconds"] == entry["predicted_arrival"] - raw["scheduled_arrival"]
        assert entry["predicted_departure"] >= entry["predicted_arrival"] + raw["scheduled_departure"] - raw["scheduled_arrival"]
    assert effective[0]["source"] == "REALTIME"
    position = asyncio.run(engine.position_for_trip(**s.trip, allow_live_fetch=False))
    assert position["effective_timeline"] == effective
    assert s.find.await_count == 1
    if mode == "bus":
        assert s.traffic.await_args.kwargs["allow_live_fetch"] is False
    assert s.trip["timeline"] == original
    effective[1]["predicted_arrival"] = -1
    position["effective_timeline"][1]["predicted_arrival"] = -2
    again = asyncio.run(engine.effective_timeline_for_trip(**s.trip))
    assert again[1]["predicted_arrival"] > 1020
    assert asyncio.run(engine.effective_timeline_for_trip(**{**s.trip, "timeline": again})) == again
    assert s.find.await_count == 1


def test_failure_returns_original_copies(scenario):
    s = scenario
    s.find.return_value = None
    result = asyncio.run(engine.effective_timeline_for_trip(**s.trip))
    assert result == s.trip["timeline"]
    assert all(a is not b for a, b in zip(result, s.trip["timeline"]))
    assert engine._HANDOVER_STATE == {}
    assert not engine._PLAN_CACHE


def test_departure_floor_shifts_physical_suffix_without_compounding(scenario):
    s = scenario
    s.trip["now_sec"] = 900
    baseline = asyncio.run(engine.effective_timeline_for_trip(**s.trip))
    floor = 1300.0
    result = asyncio.run(engine.effective_timeline_for_trip(**s.trip, departure_floor_s=floor))
    assert result[0]["predicted_arrival"] == 990
    assert result[0]["predicted_departure"] == floor
    assert result[1]["predicted_arrival"] > floor
    assert result[-1]["predicted_arrival"] > baseline[-1]["predicted_arrival"]
    assert len(engine._PLAN_CACHE) == 1
    s.trip["now_sec"] = 1010
    position = asyncio.run(engine.position_for_trip(
        **s.trip, departure_floor_s=floor, allow_live_fetch=False))
    assert position["motion_state"] == "DWELL"
    assert position["effective_timeline"] == result
    s.clock.mono += 13
    s.trip["now_sec"] += 13
    rebuilt = asyncio.run(engine.effective_timeline_for_trip(
        **{**s.trip, "timeline": result}, departure_floor_s=floor))
    assert rebuilt == result


@pytest.mark.parametrize("field,value", [
    ("mode", "tram"), ("generation", "g2"), ("day", None),
    ("geometry", None),
])
def test_cache_identity_boundaries(scenario, field, value):
    s = scenario
    asyncio.run(engine.effective_timeline_for_trip(**s.trip))
    kwargs = dict(s.trip)
    if field == "generation":
        kwargs["path"] = {**kwargs["path"], "derived_generation": value}
    elif field == "geometry":
        kwargs["path"] = {**kwargs["path"], "stop_progress": [0, 1100, 3000]}
    elif field == "day":
        s.clock.now += timedelta(days=1)
    else:
        kwargs[field] = value
    asyncio.run(engine.effective_timeline_for_trip(**kwargs))
    assert s.find.await_count == 2
    assert len(engine._PLAN_CACHE) == 2
    assert not next(reversed(engine._PLAN_CACHE.values()))["plan"]["handover_applied"]


def test_timing_rebuild_advances_prior_plan_and_preserves_history(scenario):
    s = scenario
    first = asyncio.run(engine.effective_timeline_for_trip(**s.trip))
    prior_plan = next(iter(engine._PLAN_CACHE.values()))["plan"]
    s.clock.mono += 13
    s.trip["now_sec"] += 13
    expected = engine._sample_trip_plan(prior_plan, s.trip["now_sec"], s.trip["timeline"],
                                        s.trip["path"]["stop_progress"])
    effective = asyncio.run(engine.effective_timeline_for_trip(**s.trip))
    assert engine._HANDOVER_STATE == {}
    assert effective[0] == first[0]
    position = asyncio.run(engine.position_for_trip(**s.trip, allow_live_fetch=False))
    assert position["progress_m"] == pytest.approx(expected["progress_m"])
    assert position["effective_timeline"] == effective
    assert position["continuity_clamp_m"] == 0


@pytest.mark.parametrize("invalid", ["service_old", "backdated", "monotonic_old", "monotonic_backdated"])
def test_invalid_source_clock_does_not_handover_or_clamp(scenario, invalid):
    s = scenario
    asyncio.run(engine.position_for_trip(**s.trip, allow_live_fetch=False))
    state = next(iter(engine._HANDOVER_STATE.values()))
    state["progress_m"] = 2900
    if invalid == "service_old":
        s.trip["now_sec"] += 91
    elif invalid == "backdated":
        s.trip["now_sec"] -= 1
    elif invalid == "monotonic_old":
        state["updated_mono"] -= 91
    else:
        state["updated_mono"] += 1
    s.trip["timeline"][-1]["predicted_arrival"] += 1
    result = asyncio.run(engine.position_for_trip(**s.trip, allow_live_fetch=False))
    assert not result["handover_applied"]
    assert result["continuity_clamp_m"] == 0


@pytest.mark.parametrize("stop_index", [0, 1, 2])
def test_rebuild_during_dwell_does_not_bypass_remaining_dwell(scenario, stop_index):
    s = scenario
    first = asyncio.run(engine.effective_timeline_for_trip(**s.trip))
    s.trip["now_sec"] = first[stop_index]["predicted_arrival"] + 2
    asyncio.run(engine.position_for_trip(**s.trip, allow_live_fetch=False))
    s.clock.mono += 13
    s.trip["now_sec"] += 1
    s.trip["timeline"][-1]["predicted_arrival"] += 1
    result = asyncio.run(engine.position_for_trip(**s.trip, allow_live_fetch=False))
    assert result["motion_state"] == "DWELL"
    assert result["next_timeline_index"] == stop_index
    assert not result["handover_applied"]
    for index in range(stop_index + 1):
        assert result["effective_timeline"][index]["predicted_arrival"] == first[index]["predicted_arrival"]
        assert result["effective_timeline"][index]["predicted_departure"] >= first[index]["predicted_departure"]


def test_skipped_entries_stay_aligned_and_are_not_dwell_anchors(scenario):
    s = scenario
    s.trip["timeline"][1]["relationship"] = "SKIPPED"
    effective = asyncio.run(engine.effective_timeline_for_trip(**s.trip))
    assert len(effective) == 3
    assert effective[1]["predicted_arrival"] == s.trip["timeline"][1]["predicted_arrival"]
    plan = next(iter(engine._PLAN_CACHE.values()))["plan"]
    moves = [segment for segment in plan["segments"] if segment["kind"] == "MOVE"]
    assert len(moves) == 1
    assert moves[0]["next_timeline_index"] == 2


def test_scheduled_dwell_change_invalidates_cached_plan(scenario):
    s = scenario
    first = asyncio.run(engine.effective_timeline_for_trip(**s.trip))
    s.trip["timeline"][1]["scheduled_departure"] += 30
    second = asyncio.run(engine.effective_timeline_for_trip(**s.trip))
    assert s.find.await_count == 2
    assert second[1]["predicted_departure"] >= second[1]["predicted_arrival"] + 50
    assert second[-1]["predicted_arrival"] > first[-1]["predicted_arrival"]


def test_service_date_rolls_at_service_boundary_not_midnight(scenario):
    s = scenario
    s.clock.now = s.clock.now.replace(hour=23, minute=59)
    asyncio.run(engine.effective_timeline_for_trip(**s.trip))
    first_identity = next(iter(engine._PLAN_CACHE.values()))["identity"]
    s.clock.now += timedelta(minutes=2)
    asyncio.run(engine.effective_timeline_for_trip(**s.trip))
    assert next(reversed(engine._PLAN_CACHE.values()))["identity"] == first_identity
    s.clock.now = s.clock.now.replace(hour=4)
    asyncio.run(engine.effective_timeline_for_trip(**s.trip))
    assert next(reversed(engine._PLAN_CACHE.values()))["identity"] != first_identity


def test_rebuilt_plan_retains_historical_position_samples(scenario):
    s = scenario
    asyncio.run(engine.effective_timeline_for_trip(**s.trip))
    first_plan = next(iter(engine._PLAN_CACHE.values()))["plan"]
    expected = engine._sample_trip_plan(first_plan, 1005, s.trip["timeline"],
                                        s.trip["path"]["stop_progress"])
    for _ in range(3):
        s.clock.mono += 13
        s.trip["now_sec"] += 13
        asyncio.run(engine.effective_timeline_for_trip(**s.trip))
    latest = next(reversed(engine._PLAN_CACHE.values()))["plan"]
    actual = engine._sample_trip_plan(latest, 1005, s.trip["timeline"],
                                      s.trip["path"]["stop_progress"])
    assert actual == expected


@pytest.mark.parametrize("first_live", [False, True])
def test_fetch_permission_shares_current_plan_and_retimed_history(scenario, first_live):
    s = scenario
    first = asyncio.run(engine.position_for_trip(**s.trip, allow_live_fetch=first_live))
    s.clock.mono += 5
    s.trip["now_sec"] += 5
    for entry in s.trip["timeline"]:
        entry["predicted_arrival"] += 300
        entry["predicted_departure"] += 300
    retimed = asyncio.run(engine.position_for_trip(**s.trip, allow_live_fetch=first_live))
    assert retimed["handover_applied"]
    assert retimed["effective_timeline"][0]["predicted_departure"] == first["effective_timeline"][0]["predicted_departure"]
    effective = asyncio.run(engine.effective_timeline_for_trip(**s.trip))
    assert effective == retimed["effective_timeline"]
    count = s.find.await_count
    promoted = asyncio.run(engine.position_for_trip(**s.trip, allow_live_fetch=True))
    assert s.find.await_count == count + (not first_live)
    assert promoted["effective_timeline"] == effective
    assert asyncio.run(engine.effective_timeline_for_trip(**s.trip)) == effective
    asyncio.run(engine.position_for_trip(**s.trip, allow_live_fetch=True))
    assert s.find.await_count == count + (not first_live)
    assert len(engine._PLAN_CACHE) == 1
    assert len(engine._HANDOVER_STATE) == 1
    assert next(reversed(engine._PLAN_CACHE.values()))["allow_live_fetch"] is True


@pytest.mark.parametrize("observed_position", [False, True])
def test_changed_floor_preserves_departure_of_moving_successor(scenario, observed_position):
    s = scenario
    if observed_position:
        asyncio.run(engine.position_for_trip(**s.trip, departure_floor_s=1000,
                                             allow_live_fetch=False))
    effective = asyncio.run(engine.effective_timeline_for_trip(**s.trip, departure_floor_s=1000))
    prior_plan = next(iter(engine._PLAN_CACHE.values()))["plan"]
    identity = next(iter(engine._PLAN_CACHE.values()))["identity"]
    s.clock.mono += 5
    s.trip["now_sec"] += 5
    expected = engine._sample_trip_plan(prior_plan, s.trip["now_sec"], s.trip["timeline"],
                                        s.trip["path"]["stop_progress"])
    result = asyncio.run(engine.position_for_trip(**s.trip, departure_floor_s=1300,
                                                  allow_live_fetch=False))
    assert result["motion_state"] == "MOVING"
    assert result["handover_applied"]
    assert result["progress_m"] == pytest.approx(expected["progress_m"])
    assert result["effective_timeline"][0] == effective[0]
    assert result["continuity_clamp_m"] == 0
    assert next(reversed(engine._PLAN_CACHE.values()))["identity"] == identity
    assert len(engine._PLAN_CACHE) == 1
    assert len(engine._HANDOVER_STATE) == 1


@pytest.mark.parametrize("prewarm_position", [False, True])
def test_retimed_future_prewarm_has_no_observed_history(scenario, prewarm_position):
    s = scenario
    s.trip["now_sec"] = 900
    if prewarm_position:
        asyncio.run(engine.position_for_trip(**s.trip, allow_live_fetch=False))
    else:
        asyncio.run(engine.effective_timeline_for_trip(**s.trip))
    s.trip["now_sec"] = 905
    s.clock.mono += 5
    for entry in s.trip["timeline"]:
        entry["predicted_arrival"] += 300
        entry["predicted_departure"] += 300
    effective = asyncio.run(engine.effective_timeline_for_trip(**s.trip))
    assert effective[0]["predicted_arrival"] == 1290
    assert effective[0]["predicted_departure"] == 1300
    plan = next(reversed(engine._PLAN_CACHE.values()))["plan"]
    assert plan["start_s"] == 1290
    assert not plan["handover_applied"]
    assert asyncio.run(engine.position_for_trip(**s.trip, allow_live_fetch=False))["effective_timeline"] == effective


@pytest.mark.parametrize("change", ["timeline", "floor"])
@pytest.mark.parametrize("reader", ["position", "timing", "mixed"])
@pytest.mark.parametrize("prestart", [False, True])
def test_switchback_rebuilds_from_current_plan_not_superseded_key(scenario, change, reader, prestart):
    s = scenario
    s.trip["now_sec"] = 900 if prestart else 1010
    original = deepcopy(s.trip["timeline"])
    first_key = None
    previous_plan = None
    previous_effective = None
    state_after_first = None
    for step in range(3):
        s.trip["timeline"] = deepcopy(original)
        floor = 1300 if change == "floor" and step == 1 else 1000
        if change == "timeline" and step == 1:
            for entry in s.trip["timeline"]:
                entry["predicted_arrival"] += 300
                entry["predicted_departure"] += 300
        expected = None
        if previous_plan is not None and not prestart:
            expected = engine._sample_trip_plan(previous_plan, s.trip["now_sec"],
                                                s.trip["timeline"], s.trip["path"]["stop_progress"])
        timing_only = reader == "timing" or (reader == "mixed" and step > 0)
        if timing_only:
            effective = asyncio.run(engine.effective_timeline_for_trip(**s.trip, departure_floor_s=floor))
            assert engine._HANDOVER_STATE == (state_after_first or {})
        else:
            position = asyncio.run(engine.position_for_trip(**s.trip, departure_floor_s=floor,
                                                            allow_live_fetch=False))
            effective = position["effective_timeline"]
            if expected is not None:
                assert position["progress_m"] == pytest.approx(expected["progress_m"])
                assert position["next_timeline_index"] == expected["next_timeline_index"]
                assert position["continuity_clamp_m"] == 0
            if step == 0:
                state_after_first = deepcopy(engine._HANDOVER_STATE)
        assert s.find.await_count == step + 1
        assert len(engine._PLAN_CACHE) == 1
        key, entry = next(iter(engine._PLAN_CACHE.items()))
        if step == 0:
            first_key = key
        elif step == 1:
            assert first_key not in engine._PLAN_CACHE
        else:
            assert key == first_key
        current_plan = entry["plan"]
        if expected is not None:
            actual = engine._sample_trip_plan(current_plan, s.trip["now_sec"],
                                              s.trip["timeline"], s.trip["path"]["stop_progress"])
            assert actual["progress_m"] == pytest.approx(expected["progress_m"])
            assert actual["next_timeline_index"] == expected["next_timeline_index"]
            assert effective[0]["predicted_departure"] == previous_effective[0]["predicted_departure"]
        if prestart:
            assert effective[0]["predicted_arrival"] == (1290 if change == "timeline" and step == 1 else 990)
            assert effective[0]["predicted_departure"] == (1300 if step == 1 else 1000)
            assert not current_plan["handover_applied"]
        previous_plan, previous_effective = current_plan, effective
        s.clock.mono += 2
        s.trip["now_sec"] += 2


def test_failed_replacement_retains_current_plan(scenario):
    s = scenario
    asyncio.run(engine.effective_timeline_for_trip(**s.trip))
    current = dict(engine._PLAN_CACHE)
    s.trip["timeline"][-1]["predicted_arrival"] += 300
    s.find.return_value = None
    assert asyncio.run(engine.effective_timeline_for_trip(**s.trip)) == s.trip["timeline"]
    assert engine._PLAN_CACHE == current


def test_context_isolates_plans_and_handover_and_revision_invalidates(scenario, monkeypatch):
    s = scenario
    revision = ["observation-1"]
    monkeypatch.setattr(engine, "observation_revision", lambda *args: revision[0])
    baseline = asyncio.run(engine.position_for_trip(**s.trip))
    google = asyncio.run(engine.position_for_trip(**s.trip, traffic_context="google_locator"))
    assert not google["handover_applied"]
    assert len(engine._PLAN_CACHE) == len(engine._HANDOVER_STATE) == 2
    assert s.find.await_count == 2
    for _ in range(3):
        assert asyncio.run(engine.effective_timeline_for_trip(
            **s.trip, traffic_context="google_locator")) == google["effective_timeline"]
    assert s.find.await_count == 2
    revision[0] = "observation-2"
    asyncio.run(engine.effective_timeline_for_trip(**s.trip, traffic_context="google_locator"))
    assert s.find.await_count == 3
    assert asyncio.run(engine.position_for_trip(**s.trip)) == baseline
    assert s.find.await_count == 3


@pytest.mark.parametrize("mode", ["tram", "taxi", "ferry"])
def test_google_not_eligible_outside_bus(scenario, mode):
    s = scenario
    s.trip["mode"] = mode
    result = asyncio.run(engine.position_for_trip(
        **s.trip, traffic_context="google_locator", include_failure_reason=True))
    s.traffic.assert_not_awaited()
    if mode != "tram":
        assert result["fallback_reason"] == "UNSUPPORTED_MODE"


@pytest.mark.parametrize("shift", [300, -120])
def test_raw_prediction_changes_do_not_compound_on_repeated_polling(scenario, shift):
    s = scenario
    s.trip["now_sec"] = 800
    first = asyncio.run(engine.effective_timeline_for_trip(**s.trip))
    for entry in s.trip["timeline"]:
        entry["predicted_arrival"] += shift
        entry["predicted_departure"] += shift
    changed = asyncio.run(engine.effective_timeline_for_trip(**s.trip))
    assert changed != first
    for _ in range(3):
        assert asyncio.run(engine.effective_timeline_for_trip(
            **{**s.trip, "timeline": changed})) == changed
