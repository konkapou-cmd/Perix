import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from mobility import generations
from mobility.motion import bus, engine, traffic


@pytest.fixture
def fusion(monkeypatch):
    now = datetime(2026, 10, 21, 12, tzinfo=timezone.utc)
    clock = SimpleNamespace(now=now, monotonic=100.0)

    class ClockDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return clock.now.astimezone(tz)

    region = SimpleNamespace(region_id="r", network_id="n", timezone="UTC", motion={})
    edge = {
        "edge_id": "1:10:20", "from_m": 0.0, "to_m": 500.0,
        "way": {"highway": "primary", "maxspeed_kmh": 50.0},
    }
    signals = [{
        "signal_id": "signal", "progress_m": 250.0,
        "kinds": ["ROAD_SIGNAL"], "usable_for_motion": True,
    }]
    infra = {"total_m": 500.0, "edges": [edge], "signals": signals}
    find_infra = AsyncMock(return_value=infra)
    monkeypatch.setattr(engine, "db", SimpleNamespace(
        mobility_pattern_infrastructure=SimpleNamespace(find_one=find_infra),
    ))
    monkeypatch.setattr(engine, "get_active_region", lambda: region)
    monkeypatch.setattr(generations, "atomic_generations_enabled", lambda: False)
    monkeypatch.setattr(engine, "datetime", ClockDatetime)
    monkeypatch.setattr(engine, "time", SimpleNamespace(monotonic=lambda: clock.monotonic))
    monkeypatch.setattr(engine, "_PLAN_CACHE", {})
    monkeypatch.setattr(engine, "_HANDOVER_STATE", {})
    monkeypatch.setenv("MOBILITY_PLAN_HANDOVER_ENABLED", "false")
    monkeypatch.setenv("MOBILITY_SIGNAL_SEMANTICS_ENABLED", "false")
    hold = Mock(return_value=20.0)
    monkeypatch.setattr(bus, "deterministic_signal_hold_seconds", hold)
    observation = {
        "traffic_delay_s": 150.0,
        "canonical_length_m": 500.0,
        "constraint": "NON_RECOVERABLE",
        "includes_signal_delay": True,
        "provider": "GOOGLE_ROUTES",
        "fetched_at": now.isoformat(),
        "expires_at": (now + timedelta(seconds=60)).isoformat(),
    }

    async def google_snapshot(edges, when, **kwargs):
        if when < datetime.fromisoformat(observation["expires_at"]):
            return {edge["edge_id"]: dict(observation)}
        return {}

    google = AsyncMock(side_effect=google_snapshot)
    static = AsyncMock(return_value={})
    monkeypatch.setattr(traffic, "google_traffic_for_edges", google)
    monkeypatch.setattr(traffic, "traffic_for_edges", static)
    # Keep the real facade, plan builder, fitter, bus model and sampler in the path.
    facade = AsyncMock(wraps=traffic.traffic_snapshot_for_edges)
    monkeypatch.setattr(engine, "traffic_snapshot_for_edges", facade)
    trip = {
        "traffic_context": "google_locator",
        "trip_id": "trip", "mode": "bus", "version_id": "version",
        "path": {"pattern_id": "pattern", "total_m": 500.0, "stop_progress": [0.0, 500.0]},
        "timeline": [
            {"stop_id": "A", "scheduled_arrival": 43190, "scheduled_departure": 43200,
             "predicted_arrival": 43250, "predicted_departure": 43260},
            {"stop_id": "B", "scheduled_arrival": 43320, "scheduled_departure": 43330,
             "predicted_arrival": 43320, "predicted_departure": 43330},
        ],
    }
    return SimpleNamespace(
        clock=clock, observation=observation, edge=edge, infra=infra, trip=trip,
        google=google, static=static, facade=facade, find_infra=find_infra, hold=hold,
        config=engine.motion_config_for("bus", region),
    )


def test_google_constraint_survives_facade_realtime_fit_and_sampling(fusion):
    f = fusion
    # A static profile for the same edge must not replace the accepted observation.
    f.static.return_value = {f.edge["edge_id"]: {
        "expected_speed_kmh": 30.0, "profile_version": "static-v1",
    }}
    sample = asyncio.run(engine.position_for_trip(
        **f.trip, now_sec=43290, allow_live_fetch=True,
    ))
    plan = next(iter(engine._PLAN_CACHE.values()))["plan"]
    leg = next(segment for segment in plan["segments"] if segment["kind"] == "MOVE")

    f.find_infra.assert_awaited_once()
    f.facade.assert_awaited_once_with(
        f.infra["edges"], f.clock.now, region_id="r", network_id="n", allow_live_fetch=True,
        traffic_context="google_locator",
    )
    f.google.assert_awaited_once_with(
        f.infra["edges"], f.clock.now, region_id="r", network_id="n", allow_live_fetch=True,
    )
    f.static.assert_awaited_once_with(
        f.infra["edges"], f.clock.now, region_id="r", network_id="n",
    )
    assert sample["motion_available"] is True
    assert sample["motion_state"] == "MOVING"
    assert 0.0 < sample["progress_m"] < 500.0
    assert sample["fit"] == leg["fit"] == "PHYSICS_LIMITED"
    assert sample["scheduled_duration_s"] == 120.0
    assert sample["predicted_leg_duration_s"] == sample["engine_available_duration_s"] == 60.0
    assert sample["delay_delta_s"] == -60
    assert leg["time_scale"] == 1.0
    assert leg["recovery_ratio"] == 1.0
    assert leg["natural_duration_s"] == leg["fastest_duration_s"]
    assert leg["fastest_duration_s"] > 60.0
    assert sample["arrival_target_error_s"] == pytest.approx(
        leg["fastest_duration_s"] - 60.0, abs=0.01,
    )
    assert sample["traffic_provider"] == "GOOGLE_ROUTES"
    assert sample["traffic_profile_versions"] == []
    assert sample["motion_quality"] == "PHYSICS_TRAFFIC"
    assert sample["traffic_edge_count"] == 1
    assert plan["traffic_expires_at"] == datetime.fromisoformat(f.observation["expires_at"]).timestamp()
    assert sample["signal_stop_count"] == 0
    f.hold.assert_not_called()
    assert 0.0 < sample["speed_kmh"] <= 50.0
    for step in range(101):
        sampled = engine._sample_trip_plan(
            plan, leg["t0"] + (leg["t1"] - leg["t0"]) * step / 100,
            f.trip["timeline"], f.trip["path"]["stop_progress"],
        )
        assert sampled["speed_kmh"] <= 50.0


def test_observation_expiry_and_live_permission_refresh_share_canonical_plan(fusion):
    f = fusion
    expiry = f.clock.now + timedelta(seconds=1)
    f.observation["expires_at"] = expiry.isoformat()
    assert f.config["plan_cache_seconds"] == 12.0

    async def sample(live, service_s=43290):
        return await engine.position_for_trip(
            **f.trip, now_sec=service_s, allow_live_fetch=live,
        )

    cache_only = asyncio.run(sample(False))
    assert cache_only["traffic_provider"] == "GOOGLE_ROUTES"
    assert f.find_infra.await_count == 1
    cached = asyncio.run(sample(False))
    assert cached == cache_only
    assert f.find_infra.await_count == 1

    live = asyncio.run(sample(True))
    assert live["traffic_provider"] == "GOOGLE_ROUTES"
    assert f.find_infra.await_count == 2
    assert len(engine._PLAN_CACHE) == 1
    assert next(iter(engine._PLAN_CACHE.values()))["allow_live_fetch"] is True
    assert all(entry["plan"]["traffic_expires_at"] == expiry.timestamp()
               for entry in engine._PLAN_CACHE.values())
    asyncio.run(sample(True))
    assert f.find_infra.await_count == 2
    assert asyncio.run(sample(False)) == live
    assert f.find_infra.await_count == 2

    f.clock.now += timedelta(seconds=2)
    f.clock.monotonic += 2.0
    fallback = asyncio.run(sample(True, 43292))
    assert f.find_infra.await_count == 3
    assert f.facade.await_count == f.google.await_count == f.static.await_count == 3
    assert [call.kwargs["allow_live_fetch"] for call in f.facade.await_args_list] == [False, True, True]
    assert [call.kwargs["allow_live_fetch"] for call in f.google.await_args_list] == [False, True, True]
    assert f.google.await_args.args[1] == f.clock.now
    assert fallback["motion_available"] is True
    assert fallback["traffic_provider"] == "STATIC_PROFILE_V1"
    assert fallback["motion_quality"] == "PHYSICS_BASELINE"
    assert fallback["traffic_edge_count"] == 0
    assert fallback["speed_kmh"] > live["speed_kmh"]
    assert f.hold.call_count > 0
    live_entry = next(iter(engine._PLAN_CACHE.values()))
    assert live_entry["cached_at"] == f.clock.monotonic
    assert live_entry["plan"]["traffic_expires_at"] is None
    asyncio.run(sample(True, 43292))
    assert f.find_infra.await_count == 3


def test_delta_does_not_stretch_uncovered_signal_holds(fusion):
    f = fusion
    first = {**f.edge, "to_m": 250.0}
    second = {**f.edge, "edge_id": "2:20:30", "from_m": 250.0}
    args = dict(edges=[first, second], signals=[{
        "signal_id": "uncovered", "progress_m": 375.0,
        "kinds": ["ROAD_SIGNAL"], "usable_for_motion": True,
    }], start_m=0.0, end_m=500.0, departure_service_s=43200, config=f.config)
    base = bus.build_bus_leg(**args, traffic_by_edge={})
    projected = bus.build_bus_leg(**args, traffic_by_edge={first["edge_id"]: {
        **f.observation, "canonical_length_m": 250.0,
    }})
    holds = lambda leg: [s["t1"] - s["t0"] for s in leg["segments"] if s["state"] == "SIGNAL_HOLD"]
    assert holds(base) == holds(projected) == [20.0]
    assert projected["duration_s"] == pytest.approx(base["duration_s"] + 150.0)
