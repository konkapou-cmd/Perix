from copy import deepcopy

import pytest

from mobility.motion import wait_recovery
from mobility.motion.common import build_speed_trajectory
from mobility.motion.engine import _sample_trip_plan

EPOCH = 1793044000.0


def evidence(stamp=EPOCH - 5, arrival=True, departure=True):
    return {"source": "GTFS_RT", "source_timestamp": stamp,
            "arrival_explicit": arrival, "departure_explicit": departure}


def fixture(mode="bus", hold=30.0):
    trajectory = build_speed_trajectory(
        start_m=0, end_m=400, spans=[{"from_m": 0, "to_m": 400, "speed_cap_kmh": 36}],
        mandatory_stops=[{"progress_m": 150, "hold_s": hold, "state": "SIGNAL_HOLD"}],
        acceleration_mps2=1, braking_mps2=1, step_m=10,
    )
    end = 1000 + trajectory["duration_s"]
    timeline = [
        {"stop_id": "a", "scheduled_arrival": 900, "scheduled_departure": 900,
         "predicted_arrival": 1000, "predicted_departure": 1000},
        {"stop_id": "b", "scheduled_arrival": 950, "scheduled_departure": 950,
         "predicted_arrival": end, "predicted_departure": end},
    ]
    for entry in timeline:
        entry.update(raw_predicted_arrival=entry["predicted_arrival"],
                     raw_predicted_departure=entry["predicted_departure"],
                     motion_prediction=evidence(EPOCH - 30))
    plan = {"mode": mode, "effective_timeline": timeline, "start_s": 1000, "end_s": end,
            "segments": [{"kind": "MOVE", "t0": 1000, "t1": end, "trajectory": trajectory,
                          "time_scale": 1, "from_timeline_index": 0, "next_timeline_index": 1}]}
    incoming = deepcopy(timeline)
    for entry in incoming:
        entry.pop("raw_predicted_arrival")
        entry.pop("raw_predicted_departure")
        entry["motion_prediction"] = evidence()
    incoming[1]["predicted_arrival"] -= 20
    incoming[1]["predicted_departure"] -= 20
    return plan, incoming


def reconcile(plan, incoming, now=1005, **kwargs):
    return wait_recovery.reconcile_waits(plan, incoming, now_s=now, now_epoch=EPOCH, **kwargs)


def moving_phases(plan):
    return [(s["p0"], s["p1"], s["v0"], s["v1"], s["t1"] - s["t0"])
            for leg in plan["segments"] if leg["kind"] == "MOVE"
            for s in leg["trajectory"]["segments"] if s["state"] == "MOVING"]


@pytest.mark.parametrize("mode", ["bus", "tram"])
def test_release_wait_without_changing_any_moving_phase(mode):
    plan, incoming = fixture(mode)
    original = deepcopy(plan)
    result = reconcile(plan, incoming)
    assert plan == original
    assert result["wait_only_recovery"]["released_wait_s"] == pytest.approx(20)
    assert result["end_s"] == pytest.approx(plan["end_s"] - 20)
    assert moving_phases(result) == pytest.approx(moving_phases(plan))
    assert result["segments"][0]["time_scale"] == plan["segments"][0]["time_scale"]
    assert result["wait_only_recovery"]["passage_inferred"] is False
    for now in (1000, 1001, 1005):
        before = _sample_trip_plan(plan, now, incoming, [0, 400])
        after = _sample_trip_plan(result, now, incoming, [0, 400])
        assert after["progress_m"] == pytest.approx(before["progress_m"])
        assert after["speed_kmh"] == pytest.approx(before["speed_kmh"])


@pytest.mark.parametrize("mode", ["bus", "tram"])
def test_no_wait_means_no_speedup_even_for_impossible_eta(mode):
    plan, incoming = fixture(mode, hold=0)
    incoming[1]["predicted_arrival"] = 1001
    result = reconcile(plan, incoming)
    assert result["end_s"] == plan["end_s"]
    assert moving_phases(result) == moving_phases(plan)
    assert result["wait_only_recovery"]["released_wait_s"] == 0
    assert result["final_arrival_target_error_s"] > 0


@pytest.mark.parametrize("case", ["old", "missing", "future", "poll_only", "propagated", "no_data", "same_revision"])
def test_untrusted_or_nonexplicit_update_releases_nothing(case):
    plan, incoming = fixture()
    metadata = incoming[1]["motion_prediction"]
    if case == "old": metadata["source_timestamp"] = EPOCH - 100
    if case == "missing": metadata.pop("source_timestamp")
    if case == "future": metadata["source_timestamp"] = EPOCH + 1
    if case == "poll_only": metadata.update(source_timestamp=None, updated_at=EPOCH)
    if case == "propagated": metadata["arrival_explicit"] = False
    if case == "no_data":
        incoming[1]["relationship"] = "NO_DATA"
        plan["effective_timeline"][1]["relationship"] = "NO_DATA"
    if case == "same_revision": metadata["source_timestamp"] = EPOCH - 30
    result = reconcile(plan, incoming)
    assert result["end_s"] == plan["end_s"]
    assert result["wait_only_recovery"]["source_accepted"] is False


def test_countdown_and_small_jitter_do_not_release_wait():
    plan, incoming = fixture()
    incoming[1]["predicted_arrival"] = plan["end_s"] - 1
    incoming[1]["predicted_departure"] = plan["end_s"] - 1
    assert reconcile(plan, incoming)["end_s"] == plan["end_s"]
    incoming[1]["predicted_arrival"] = plan["end_s"]
    incoming[1]["predicted_departure"] = plan["end_s"]
    assert reconcile(plan, incoming, now=1015)["end_s"] == plan["end_s"]


def test_identical_prediction_cannot_spend_the_same_gain_twice():
    plan, incoming = fixture()
    once = reconcile(plan, incoming)
    twice = reconcile(once, incoming, now=1006)
    assert twice["end_s"] == once["end_s"]
    assert twice["wait_only_recovery"]["released_wait_s"] == 0
    assert moving_phases(twice) == moving_phases(once)


def test_only_unelapsed_part_of_current_hold_can_be_removed():
    plan, incoming = fixture()
    hold = next(s for s in plan["segments"][0]["trajectory"]["segments"] if s["state"] == "SIGNAL_HOLD")
    now = 1000 + hold["t1"] - 5
    result = reconcile(plan, incoming, now=now)
    assert result["wait_only_recovery"]["released_wait_s"] == pytest.approx(5)
    for t in (now - 2, now):
        a = _sample_trip_plan(plan, t, incoming, [0, 400])
        b = _sample_trip_plan(result, t, incoming, [0, 400])
        assert a["progress_m"] == b["progress_m"]
        assert a["speed_kmh"] == b["speed_kmh"] == 0
    assert _sample_trip_plan(result, now + 1, incoming, [0, 400])["progress_m"] > hold["p0"]


def test_observed_or_unknown_hold_is_not_removed():
    plan, incoming = fixture()
    for segment in plan["segments"][0]["trajectory"]["segments"]:
        if segment["state"] == "SIGNAL_HOLD": segment["state"] = "OBSERVED_RED"
    assert reconcile(plan, incoming)["end_s"] == plan["end_s"]


@pytest.mark.parametrize("change", ["stop", "schedule", "relationship", "repeated_stop"])
def test_changed_topology_or_schedule_declines_reuse(change):
    plan, incoming = fixture()
    if change == "stop": incoming[1]["stop_id"] = "c"
    if change == "schedule": incoming[1]["scheduled_departure"] += 1
    if change == "relationship": incoming[1]["relationship"] = "SKIPPED"
    if change == "repeated_stop":
        incoming[1]["stop_id"] = incoming[0]["stop_id"]
        plan["effective_timeline"][1]["stop_id"] = incoming[0]["stop_id"]
    assert reconcile(plan, incoming) is None


def station_fixture():
    plan, incoming = fixture(hold=0)
    plan["segments"].insert(0, {"kind": "DWELL", "t0": 940, "t1": 1000,
                                "timeline_index": 0, "next_timeline_index": 0, "progress_m": 0})
    old = plan["effective_timeline"][0]
    old.update(predicted_arrival=940, raw_predicted_arrival=940,
               scheduled_arrival=900, scheduled_departure=910)
    incoming[0].update(scheduled_arrival=900, scheduled_departure=910,
                       predicted_arrival=940, predicted_departure=960)
    return plan, incoming


@pytest.mark.parametrize("mode", ["bus", "tram"])
def test_at_station_release_only_remaining_wait_and_start_without_jump(mode):
    plan, incoming = station_fixture()
    plan["mode"] = mode
    result = reconcile(plan, incoming, now=970)
    assert result["segments"][0]["t0"] == 940
    assert result["segments"][0]["t1"] == 970
    assert result["segments"][1]["t0"] == 970
    assert moving_phases(result) == pytest.approx(moving_phases(plan))
    assert _sample_trip_plan(result, 970, incoming, [0, 400])["speed_kmh"] == 0
    assert _sample_trip_plan(result, 971, incoming, [0, 400])["progress_m"] > 0


def test_mandatory_service_and_departure_floor_are_preserved():
    plan, incoming = station_fixture()
    incoming[0]["predicted_departure"] = 990  # Service lasts 50s from actual arrival at 940.
    result = reconcile(plan, incoming, now=970)
    assert result["segments"][0]["t1"] == 990
    assert reconcile(plan, incoming, now=970, departure_floor_s=995)["segments"][0]["t1"] == 995


def test_arrival_only_prediction_cannot_release_station_wait():
    plan, incoming = station_fixture()
    incoming[0]["motion_prediction"]["departure_explicit"] = False
    assert reconcile(plan, incoming, now=970)["segments"][0]["t1"] == 1000


def test_future_timetable_hold_absorbs_advance_without_skipping_service():
    plan, incoming = fixture()
    end = plan["end_s"]
    for entry in (plan["effective_timeline"][1], incoming[1]):
        entry.update(scheduled_arrival=end, scheduled_departure=end + 10, predicted_departure=end + 10)
    plan["effective_timeline"][1]["raw_predicted_departure"] = end + 10
    plan["segments"].append({"kind": "DWELL", "t0": end, "t1": end + 10,
                             "timeline_index": 1, "next_timeline_index": 1, "progress_m": 400})
    plan["end_s"] = end + 10
    result = reconcile(plan, incoming)
    assert result["segments"][0]["t1"] == end - 20
    assert result["segments"][1]["t0"] == end - 20
    assert result["segments"][1]["t1"] == end + 10
    assert result["end_s"] == plan["end_s"]


def test_scaled_trajectory_releases_wall_clock_wait_not_movement():
    plan, incoming = fixture()
    leg = plan["segments"][0]
    leg["time_scale"] = 2
    leg["t1"] = 1000 + leg["trajectory"]["duration_s"] * 2
    plan["end_s"] = leg["t1"]
    plan["effective_timeline"][1].update(predicted_arrival=leg["t1"], raw_predicted_arrival=leg["t1"],
                                        predicted_departure=leg["t1"], raw_predicted_departure=leg["t1"])
    incoming[1]["predicted_arrival"] = leg["t1"] - 20
    incoming[1]["predicted_departure"] = leg["t1"] - 20
    result = reconcile(plan, incoming)
    assert result["end_s"] == plan["end_s"] - 20
    assert moving_phases(result) == pytest.approx(moving_phases(plan))
    assert result["segments"][0]["time_scale"] == 2


def test_feature_is_default_off(monkeypatch):
    monkeypatch.delenv("MOBILITY_WAIT_ONLY_RECOVERY_ENABLED", raising=False)
    assert not wait_recovery.enabled()


def test_expired_provider_data_is_not_extended():
    plan, incoming = fixture()
    plan["traffic_expires_at"] = EPOCH
    assert reconcile(plan, incoming) is None


@pytest.mark.parametrize("mode", ["bus", "tram"])
@pytest.mark.parametrize("context", ["baseline", "google_locator"])
@pytest.mark.parametrize("boundary", ["none", "trip", "version", "generation", "service_date"])
def test_engine_integration_is_scoped_and_does_not_refit_wait_only(monkeypatch, mode, context, boundary):
    import asyncio
    from datetime import datetime, timezone
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    from mobility.motion import engine

    plan, incoming = fixture(mode)
    region = SimpleNamespace(region_id="r", network_id="n", timezone="UTC", motion={})
    monkeypatch.setattr(engine, "get_active_region", lambda: region)
    monkeypatch.setattr(engine, "motion_config_for", lambda *a: {"plan_cache_seconds": 1})
    wall = [EPOCH]
    monkeypatch.setattr(engine, "datetime", SimpleNamespace(now=lambda tz: datetime.fromtimestamp(wall[0], timezone.utc)))
    monkeypatch.setenv("MOBILITY_WAIT_ONLY_RECOVERY_ENABLED", "true")
    monkeypatch.setenv("MOBILITY_PLAN_HANDOVER_ENABLED", "false")
    monkeypatch.setattr(engine, "_PLAN_CACHE", {})
    monkeypatch.setattr(engine, "_HANDOVER_STATE", {})
    clock = [100.0]
    monkeypatch.setattr(engine, "time", SimpleNamespace(monotonic=lambda: clock[0]))
    builder = AsyncMock(side_effect=lambda **kw: deepcopy(plan))
    monkeypatch.setattr(engine, "_build_trip_plan", builder)
    path = {"pattern_id": "p", "total_m": 400, "stop_progress": [0, 400]}
    scope = {"trip_id": "t", "version_id": "v"}
    async def sample(timeline, now):
        return await engine.position_for_trip(**scope, mode=mode,
                                              timeline=timeline, path=path, now_sec=now, traffic_context=context)
    first = asyncio.run(sample(plan["effective_timeline"], 1005))
    clock[0] = 102
    if boundary == "trip": scope["trip_id"] = "other"
    if boundary == "version": scope["version_id"] = "other"
    if boundary == "generation": path["derived_generation"] = "other"
    if boundary == "service_date": wall[0] += 86400
    second = asyncio.run(sample(incoming, 1006))
    if context == "baseline" and boundary == "none":
        assert builder.await_count == 1
        assert second["wait_only_recovery"]["released_wait_s"] == pytest.approx(20)
        before = _sample_trip_plan(plan, 1006, incoming, [0, 400])
        assert second["speed_kmh"] == before["speed_kmh"]
        assert second["progress_m"] == before["progress_m"]
        assert second["progress_m"] > first["progress_m"]
        # Effective outputs can be fed back without spending the gain again.
        clock[0] = 104
        third = asyncio.run(sample(second["effective_timeline"], 1007))
        assert builder.await_count == 1
        assert third["wait_only_recovery"]["released_wait_s"] == 0
    else:
        assert builder.await_count == 2
        assert "wait_only_recovery" not in second


def test_route_provenance_distinguishes_explicit_from_propagated_predictions():
    from routes.mobility import _predicted_stop_timeline
    route = {"stops": [{"stop_id": "a"}, {"stop_id": "b"}]}
    trip = {"stop_ids": ["a", "b"], "stop_times": {"a": "08:00", "b": "08:10"}}
    rt = {"source": "GTFS_RT", "source_timestamp": EPOCH - 5, "updated_at": "poll-time",
          "stop_predictions": {"a": {"arrival_delay_seconds": 0}}}
    timeline = _predicted_stop_timeline(route, trip, rt)
    assert timeline[0]["motion_prediction"] == evidence(arrival=True, departure=False)
    assert timeline[1]["motion_prediction"] == evidence(arrival=False, departure=False)
    rt.pop("source_timestamp")
    assert _predicted_stop_timeline(route, trip, rt)[0]["motion_prediction"]["source_timestamp"] is None


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), True, "123"])
def test_invalid_prediction_clocks_are_not_used(bad):
    plan, incoming = fixture()
    incoming[1]["predicted_arrival"] = bad
    assert reconcile(plan, incoming) is None


@pytest.mark.parametrize("trip_stamp, feed_stamp, expected", [(100, 200, 100), (0, 200, 200), (0, 0, 0)])
def test_worker_preserves_source_timestamp_not_poll_time(monkeypatch, trip_stamp, feed_stamp, expected):
    import asyncio
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    from google.transit import gtfs_realtime_pb2
    from utils import mobility_workers as workers

    feed = gtfs_realtime_pb2.FeedMessage()
    feed.header.gtfs_realtime_version = "2.0"
    feed.header.timestamp = feed_stamp
    entity = feed.entity.add()
    entity.id = "e"
    entity.trip_update.trip.trip_id = "t"
    entity.trip_update.timestamp = trip_stamp
    stop = entity.trip_update.stop_time_update.add()
    stop.stop_id = "a"
    stop.arrival.delay = 0
    response = SimpleNamespace(content=feed.SerializeToString(), raise_for_status=lambda: None)
    client = AsyncMock()
    client.get.return_value = response
    manager = AsyncMock()
    manager.__aenter__.return_value = client
    monkeypatch.setattr(workers.httpx, "AsyncClient", lambda **kwargs: manager)
    monkeypatch.setattr(workers, "REALTIME_URL", "https://example.invalid/test-feed")
    monkeypatch.setattr(workers, "_ACTIVE_REGION", SimpleNamespace(realtime_type="GTFS_RT", region_id="r", network_id="n"))
    monkeypatch.setattr(workers, "_active_trip_ids", AsyncMock(return_value={"t"}))
    bulk = AsyncMock()
    monkeypatch.setattr(workers, "db", SimpleNamespace(mobility_realtime=SimpleNamespace(bulk_write=bulk)))
    monkeypatch.setattr(workers.asyncio, "sleep", AsyncMock(side_effect=asyncio.CancelledError))
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(workers._realtime_worker())
    assert bulk.await_count == 1
    doc = bulk.call_args.args[0][0]._doc["$set"]
    assert doc["source_timestamp"] == expected
    assert doc["updated_at"] != expected


def test_foreign_provider_plan_is_not_rewritten():
    plan, incoming = fixture()
    plan["traffic_provider"] = "GOOGLE_ROUTES"
    assert reconcile(plan, incoming) is None


def test_source_revision_affects_cache_only_when_policy_is_enabled(monkeypatch):
    from mobility.motion.engine import _timeline_signature
    plan, incoming = fixture()
    old = deepcopy(incoming)
    incoming[1]["motion_prediction"]["source_timestamp"] += 1
    assert _timeline_signature(old) == _timeline_signature(incoming)
    assert _timeline_signature(old, include_prediction_revision=True) != _timeline_signature(incoming, include_prediction_revision=True)


def test_fresh_later_constraint_is_not_silently_ignored():
    plan, incoming = fixture()
    incoming[1]["predicted_arrival"] = plan["end_s"] + 20
    incoming[1]["predicted_departure"] = plan["end_s"] + 20
    assert reconcile(plan, incoming) is None


def test_departure_before_arrival_is_rejected():
    plan, incoming = fixture()
    incoming[1]["predicted_departure"] = incoming[1]["predicted_arrival"] - 1
    assert reconcile(plan, incoming) is None


def test_future_explicit_service_window_is_not_shortened():
    plan, incoming = fixture()
    end = plan["end_s"]
    plan["effective_timeline"][1].update(predicted_departure=end + 10, raw_predicted_departure=end + 10)
    incoming[1]["predicted_departure"] = end + 5
    plan["segments"].append({"kind": "DWELL", "t0": end, "t1": end + 10,
                             "timeline_index": 1, "next_timeline_index": 1, "progress_m": 400})
    plan["end_s"] = end + 10
    result = reconcile(plan, incoming)
    assert result["segments"][1]["t0"] == end - 20
    assert result["segments"][1]["t1"] == end + 5
    assert result["wait_only_recovery"]["arrival_advance_at_end_s"] == 5
