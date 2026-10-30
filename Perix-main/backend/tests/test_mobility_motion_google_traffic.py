import asyncio
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import importlib.util
import json
import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest

from mobility.motion import google_traffic as google


NOW = datetime(2026, 10, 21, 12, tzinfo=timezone.utc)


def edge(number=1):
    a, b = [52.0, 11.0], [52.001, 11.0]
    return {
        "edge_id": f"{number}:10:20", "way_id": number,
        "from_node": 10, "to_node": 20, "from_point": a, "to_point": b,
        "length_m": google._distance(a, b), "way": {"highway": "primary"},
    }


def payload():
    return {"routes": [{
        "duration": "200s", "staticDuration": "80s", "distanceMeters": edge()["length_m"],
        "polyline": {"geoJsonLinestring": {
            "type": "LineString", "coordinates": [[11.0, 52.0], [11.0, 52.001]],
        }},
    }]}


@pytest.fixture(autouse=True)
def isolated(monkeypatch):
    for name in (
        "MOBILITY_GOOGLE_TRAFFIC_ENABLED", "GOOGLE_ROUTES_API_KEY",
        "MOBILITY_GOOGLE_TRAFFIC_REGIONS", "MOBILITY_GOOGLE_TRAFFIC_REQUESTS_PER_MINUTE",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(google, "_CACHE", google.OrderedDict())
    monkeypatch.setattr(google, "_INFLIGHT", {})
    monkeypatch.setattr(google, "_ATTEMPTS", google.deque())
    monkeypatch.setattr(google, "_utcnow", lambda: NOW)
    clock = [100.0]
    monkeypatch.setattr(google, "time", SimpleNamespace(monotonic=lambda: clock[0]))
    real_client = httpx.AsyncClient
    calls = []
    state = {"body": payload(), "status": 200, "delay": 0, "error": None}

    async def respond(request):
        calls.append(request)
        if state["delay"]:
            await asyncio.sleep(state["delay"])
        if state["error"]:
            raise state["error"]
        return httpx.Response(state["status"], json=state["body"])

    def client(**kwargs):
        # Every test request is intercepted, even if opt-in gates regress.
        return real_client(transport=httpx.MockTransport(respond), **kwargs)

    monkeypatch.setattr(google.httpx, "AsyncClient", client)
    return SimpleNamespace(calls=calls, state=state, clock=clock)


def enable(monkeypatch, budget="20"):
    monkeypatch.setenv("MOBILITY_GOOGLE_TRAFFIC_ENABLED", "true")
    monkeypatch.setenv("GOOGLE_ROUTES_API_KEY", "test-only-not-a-real-key")
    monkeypatch.setenv("MOBILITY_GOOGLE_TRAFFIC_REGIONS", "r, other")
    monkeypatch.setenv("MOBILITY_GOOGLE_TRAFFIC_REQUESTS_PER_MINUTE", budget)


async def fetch(edges=None, when=NOW, live=True, region="r", network="n"):
    return await google.google_traffic_for_edges(
        [edge()] if edges is None else edges, when,
        region_id=region, network_id=network, allow_live_fetch=live,
    )


@pytest.mark.parametrize("gate", [
    "default", "key_only", "public_key", "disabled", "no_key", "zero",
    "missing_budget", "bad_budget", "no_regions", "wrong_region", "no_network", "cache_only",
    "string_opt_in",
])
def test_opt_in_gates(monkeypatch, isolated, gate):
    if gate not in {"default", "key_only"}:
        enable(monkeypatch)
    if gate == "key_only":
        monkeypatch.setenv("GOOGLE_ROUTES_API_KEY", "test-key")
    if gate in {"public_key", "no_key"}:
        monkeypatch.delenv("GOOGLE_ROUTES_API_KEY")
        monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "public-key-must-not-be-used")
        monkeypatch.setenv("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY", "also-not-used")
    if gate == "disabled":
        monkeypatch.setenv("MOBILITY_GOOGLE_TRAFFIC_ENABLED", "false")
    if gate in {"zero", "bad_budget"}:
        monkeypatch.setenv("MOBILITY_GOOGLE_TRAFFIC_REQUESTS_PER_MINUTE", "0" if gate == "zero" else "bad")
    if gate == "missing_budget":
        monkeypatch.delenv("MOBILITY_GOOGLE_TRAFFIC_REQUESTS_PER_MINUTE")
    if gate == "no_regions":
        monkeypatch.setenv("MOBILITY_GOOGLE_TRAFFIC_REGIONS", " , ")
    result = asyncio.run(fetch(
        live="false" if gate == "string_opt_in" else gate != "cache_only",
        region="x" if gate == "wrong_region" else "r",
        network=None if gate == "no_network" else "n",
    ))
    assert result == {}
    assert isolated.calls == []


def test_verified_result_request_and_cache(monkeypatch, isolated):
    enable(monkeypatch)
    result = asyncio.run(fetch())
    estimate = result[edge()["edge_id"]]
    assert estimate["traffic_delay_s"] == 120
    assert estimate["canonical_length_m"] == edge()["length_m"]
    assert "expected_speed_kmh" not in estimate
    assert estimate["constraint"] == "NON_RECOVERABLE"
    assert estimate["includes_signal_delay"] is True
    assert estimate["provider"] == "GOOGLE_ROUTES"
    assert estimate["geometry_verification"]["verified"] is True
    assert estimate["geometry_verification"]["max_corridor_m"] == 0
    assert datetime.fromisoformat(estimate["fetched_at"]) == NOW
    assert datetime.fromisoformat(estimate["expires_at"]) == NOW + timedelta(seconds=60)
    assert "observed_at" not in estimate
    request = isolated.calls[0]
    assert request.url == google.URL
    assert request.headers["X-Goog-FieldMask"] == google.FIELD_MASK
    body = json.loads(request.content)
    assert body["travelMode"] == "DRIVE"
    assert body["routingPreference"] == "TRAFFIC_AWARE"
    assert body["polylineQuality"] == "HIGH_QUALITY"
    assert body["polylineEncoding"] == "GEO_JSON_LINESTRING"
    assert "departureTime" not in body
    estimate["geometry_verification"]["verified"] = False
    cached = asyncio.run(fetch(live=False))
    assert cached[edge()["edge_id"]]["geometry_verification"]["verified"] is True
    assert len(isolated.calls) == 1
    assert "test-only-not-a-real-key" not in repr(google._CACHE)
    isolated.clock[0] += 61
    assert asyncio.run(fetch(live=False)) == {}
    assert len(isolated.calls) == 1
    assert asyncio.run(fetch())
    assert len(isolated.calls) == 2


@pytest.mark.parametrize("value", [None, "0s", "-2s", "NaNs", "Infinitys", True, 80, "80", "1e3s"])
def test_invalid_static_duration_fails_closed(monkeypatch, isolated, value):
    enable(monkeypatch)
    route = isolated.state["body"]["routes"][0]
    if value is None:
        del route["staticDuration"]
    else:
        route["staticDuration"] = value
    assert asyncio.run(fetch()) == {}
    assert asyncio.run(fetch(live=False)) == {}
    assert len(isolated.calls) == 1


@pytest.mark.parametrize("duration,expected_delta", [("200s", 120.0), ("80s", 0.0), ("60s", 0.0)])
def test_verified_delta_adds_once_to_bus_travel_not_car_duration(monkeypatch, isolated, duration, expected_delta):
    from mobility.motion.bus import build_bus_leg
    from mobility.motion.config import motion_config_for

    enable(monkeypatch)
    isolated.state["body"]["routes"][0]["duration"] = duration
    observation = asyncio.run(fetch())
    item = {**edge(), "from_m": 0.0, "to_m": edge()["length_m"]}
    config = motion_config_for("bus", SimpleNamespace(motion={}))
    args = dict(edges=[item], signals=[], start_m=0.0, end_m=item["to_m"],
                departure_service_s=1000, config=config)
    base = build_bus_leg(**args, traffic_by_edge={})
    projected = build_bus_leg(**args, traffic_by_edge=observation)
    assert projected["duration_s"] == pytest.approx(base["duration_s"] + expected_delta)
    assert projected["duration_s"] != float(duration[:-1])
    assert build_bus_leg(**args, traffic_by_edge=observation) == projected
    recovered = build_bus_leg(**args, traffic_by_edge=observation, recovery_ratio=1)
    assert recovered["duration_s"] == pytest.approx(projected["duration_s"])
    # Historical speed and signal simulation on the covered edge must not stack.
    mixed = {item["edge_id"]: {"expected_speed_kmh": 5.0, **observation[item["edge_id"]]}}
    signals = [{"signal_id": "s", "progress_m": item["to_m"] / 2,
                "kinds": ["ROAD_SIGNAL"], "usable_for_motion": True}]
    assert build_bus_leg(**{**args, "signals": signals}, traffic_by_edge=mixed) == projected
    for segment in projected["segments"]:
        assert max(segment["v0"], segment["v1"]) * 3.6 <= config["max_speed_kmh"]
        acceleration = (segment["v1"] - segment["v0"]) / (segment["t1"] - segment["t0"])
        assert -config["braking_mps2"] - 1e-8 <= acceleration <= config["acceleration_mps2"] + 1e-8
    partial = build_bus_leg(**{**args, "end_m": item["to_m"] / 2}, traffic_by_edge=observation)
    partial_base = build_bus_leg(**{**args, "end_m": item["to_m"] / 2}, traffic_by_edge={})
    assert partial["duration_s"] == pytest.approx(partial_base["duration_s"] + expected_delta / 2)
    assert len(isolated.calls) == 1


@pytest.mark.parametrize("failure", ["http", "timeout", "malformed", "fallback"])
def test_negative_cache_and_expiry(monkeypatch, isolated, failure):
    enable(monkeypatch)
    if failure == "http":
        isolated.state["status"] = 503
    elif failure == "timeout":
        isolated.state["error"] = httpx.ReadTimeout("mock timeout")
    elif failure == "malformed":
        isolated.state["body"] = {"routes": [None]}
    else:
        isolated.state["body"]["fallbackInfo"] = {}
    assert asyncio.run(fetch()) == {}
    assert asyncio.run(fetch()) == {}
    assert len(isolated.calls) == 1
    assert len(google._ATTEMPTS) == 1
    isolated.clock[0] += 16
    assert asyncio.run(fetch()) == {}
    assert len(isolated.calls) == 2


@pytest.mark.parametrize("bad", [
    "reverse", "detour", "backtrack", "nan", "out_of_range", "wrong_type",
    "one_point", "bad_pair", "far_endpoint", "distance", "distance_nan",
    "distance_bool", "zero_duration", "nan_duration", "negative_duration",
    "missing_duration", "multiple_routes", "geometry_length",
])
def test_rejects_unverified_response(monkeypatch, isolated, bad):
    enable(monkeypatch)
    data = isolated.state["body"]
    route = data["routes"][0]
    geo = route["polyline"]["geoJsonLinestring"]
    coords = geo["coordinates"]
    if bad == "reverse":
        coords.reverse()
    elif bad == "detour":
        coords.insert(1, [11.001, 52.0005])
    elif bad == "backtrack":
        coords[1:1] = [[11, 52.0008], [11, 52.0002]]
    elif bad == "nan":
        coords.insert(1, [float("nan"), 52.0005])
    elif bad == "out_of_range":
        coords[0] = [181, 52]
    elif bad == "wrong_type":
        geo["type"] = "MultiLineString"
    elif bad == "one_point":
        coords.pop()
    elif bad == "bad_pair":
        coords[0] = [11]
    elif bad == "far_endpoint":
        coords[0] = [11, 52.0002]
    elif bad.startswith("distance"):
        route["distanceMeters"] = {"distance": 500, "distance_nan": float("inf"), "distance_bool": True}[bad]
    elif bad.endswith("duration"):
        route["duration"] = {"zero_duration": "0s", "nan_duration": "NaNs", "negative_duration": "-2s", "missing_duration": None}[bad]
    elif bad == "multiple_routes":
        data["routes"].append(deepcopy(route))
    elif bad == "geometry_length":
        # In-corridor, monotonically advancing zigzags still fail length verification.
        coords[1:1] = [[11 + (0.00013 if i % 2 else -0.00013), 52 + i * 0.00005] for i in range(1, 20)]
    assert asyncio.run(fetch()) == {}
    assert len(isolated.calls) == 1


@pytest.mark.parametrize("bad", ["short", "nan", "bus_lane", "rail", "noncanonical", "ids", "length"])
def test_rejects_ineligible_edges_before_request(monkeypatch, isolated, bad):
    enable(monkeypatch)
    item = edge()
    if bad == "short":
        item["to_point"] = [52.0001, 11]
        item["length_m"] = google._distance(item["from_point"], item["to_point"])
    elif bad == "nan":
        item["from_point"][0] = float("nan")
    elif bad == "bus_lane":
        item["way"]["bus_lane"] = "yes"
    elif bad == "rail":
        item["way"] = {"railway": "tram"}
    elif bad == "noncanonical":
        item["edge_id"] = "trip-segment"
    elif bad == "ids":
        item["from_node"] = 30
    else:
        item["length_m"] *= 2
    assert asyncio.run(fetch([item])) == {}
    assert isolated.calls == []


@pytest.mark.parametrize("when", [NOW.replace(tzinfo=None), NOW - timedelta(seconds=61), NOW + timedelta(seconds=6)])
def test_freshness_also_gates_cache(monkeypatch, isolated, when):
    enable(monkeypatch)
    assert asyncio.run(fetch())
    assert asyncio.run(fetch(when=when)) == {}
    assert asyncio.run(fetch(when=when, live=False)) == {}
    assert len(isolated.calls) == 1


def test_scope_and_key_rotation(monkeypatch, isolated):
    enable(monkeypatch)
    assert asyncio.run(fetch())
    assert asyncio.run(fetch(network="different", live=False)) == {}
    assert asyncio.run(fetch(region="other", live=False)) == {}
    changed = edge()
    changed["from_point"][1] += 0.00001
    changed["to_point"][1] += 0.00001
    assert asyncio.run(fetch([changed], live=False)) == {}
    monkeypatch.setenv("GOOGLE_ROUTES_API_KEY", "rotated-test-key")
    assert asyncio.run(fetch(live=False)) == {}
    assert asyncio.run(fetch())
    assert len(isolated.calls) == 2


def test_snapshot_cap_and_shared_attempt_budget(monkeypatch, isolated):
    enable(monkeypatch, "3")
    assert len(asyncio.run(fetch([edge(i) for i in range(1, 6)]))) == 2
    assert len(isolated.calls) == 2
    isolated.state["status"] = 500
    assert asyncio.run(fetch([edge(6), edge(7)])) == {}
    assert len(isolated.calls) == 3
    assert asyncio.run(fetch([edge(8)])) == {}
    assert len(isolated.calls) == 3
    isolated.clock[0] += 61
    assert asyncio.run(fetch([edge(8)])) == {}
    assert len(isolated.calls) == 4


def test_concurrent_singleflight_and_budget(monkeypatch, isolated):
    enable(monkeypatch, "1")
    isolated.state["delay"] = 0.02

    async def run():
        results = await asyncio.gather(*(fetch() for _ in range(12)))
        assert all(result == results[0] and result for result in results)
        assert await fetch([edge(2)]) == {}

    asyncio.run(run())
    assert len(isolated.calls) == 1
    assert len(google._ATTEMPTS) == 1
    assert not google._INFLIGHT


def test_concurrent_distinct_edges_share_budget(monkeypatch, isolated):
    enable(monkeypatch, "2")
    isolated.state["delay"] = 0.02

    async def run():
        results = await asyncio.gather(*(fetch([edge(i)]) for i in range(1, 12)))
        assert sum(bool(result) for result in results) == 2

    asyncio.run(run())
    assert len(isolated.calls) == 2
    assert len(google._ATTEMPTS) == 2


def test_follower_cancellation_does_not_cancel_shared_result(monkeypatch, isolated):
    enable(monkeypatch)
    isolated.state["delay"] = 0.03

    async def run():
        leader = asyncio.create_task(fetch())
        await asyncio.sleep(0.005)
        follower = asyncio.create_task(fetch())
        await asyncio.sleep(0.005)
        follower.cancel()
        with pytest.raises(asyncio.CancelledError):
            await follower
        assert await leader
        assert await fetch(live=False)

    asyncio.run(run())
    assert len(isolated.calls) == 1
    assert not google._INFLIGHT


def test_deadline_cleans_singleflight_and_negative_caches(monkeypatch, isolated):
    enable(monkeypatch)
    monkeypatch.setattr(google, "SNAPSHOT_DEADLINE_SECONDS", 0.02)
    isolated.state["delay"] = 1

    async def run():
        assert await asyncio.gather(fetch(), fetch()) == [{}, {}]
        assert not google._INFLIGHT
        assert await fetch() == {}

    asyncio.run(run())
    assert len(isolated.calls) == 1
    assert len(google._ATTEMPTS) == 1


def test_cache_is_bounded(monkeypatch, isolated):
    enable(monkeypatch)
    monkeypatch.setattr(google, "MAX_CACHE_ENTRIES", 2)
    for i in range(1, 5):
        assert asyncio.run(fetch([edge(i)]))
    assert len(google._CACHE) == 2
    assert asyncio.run(fetch([edge(1)], live=False)) == {}


def test_facade_overlay_and_static_fallback(monkeypatch, isolated):
    # Import the facade without initializing Mongo/config or loading conftest.
    profiles = ModuleType("mobility.traffic_profiles")
    profiles.traffic_for_edges = AsyncMock(return_value={
        edge()["edge_id"]: {"expected_speed_kmh": 30, "profile_version": "v1"},
        edge(2)["edge_id"]: {"expected_speed_kmh": 25, "profile_version": "v2"},
    })
    monkeypatch.setitem(sys.modules, "mobility.traffic_profiles", profiles)
    spec = importlib.util.spec_from_file_location(
        "_isolated_traffic_facade", google.__file__.replace("google_traffic.py", "traffic.py"),
    )
    traffic = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(traffic)
    enable(monkeypatch)

    async def run():
        kwargs = {"region_id": "r", "network_id": "n"}
        static = await traffic.traffic_snapshot_for_edges([edge()], NOW, **kwargs)
        assert static["provider"] == "STATIC_PROFILE_V1"
        assert static["by_edge"][edge()["edge_id"]]["provider"] == "STATIC_PROFILE_V1"
        assert isolated.calls == []
        kwargs["traffic_context"] = "google_locator"
        mixed = await traffic.traffic_snapshot_for_edges([edge()], NOW, allow_live_fetch=True, **kwargs)
        assert mixed["providers"] == ["GOOGLE_ROUTES", "STATIC_PROFILE_V1"]
        assert mixed["provider"] == "GOOGLE_ROUTES+STATIC_PROFILE_V1"
        assert mixed["profile_versions"] == ["v2"]
        assert mixed["by_edge"][edge()["edge_id"]]["provider"] == "GOOGLE_ROUTES"
        assert mixed["by_edge"][edge(2)["edge_id"]]["expected_speed_kmh"] == 25
        baseline = await traffic.traffic_snapshot_for_edges([edge()], NOW, region_id="r", network_id="n")
        assert baseline["provider"] == "STATIC_PROFILE_V1"
        revision = google.observation_revision("r", "n")
        assert revision == google.observation_revision("r", "n")
        assert revision != google.observation_revision("r", "other")
        monkeypatch.setenv("MOBILITY_GOOGLE_TRAFFIC_ENABLED", "false")
        disabled = await traffic.traffic_snapshot_for_edges([edge()], NOW, **kwargs)
        assert disabled["provider"] == "STATIC_PROFILE_V1"
        assert google.observation_revision("r", "n") == "disabled"
        monkeypatch.setenv("MOBILITY_GOOGLE_TRAFFIC_ENABLED", "true")
        assert google.observation_revision("r", "n") == revision
        isolated.clock[0] += 61
        assert google.observation_revision("r", "n") != revision
        isolated.state["status"] = 503
        fallback = await traffic.traffic_snapshot_for_edges([edge()], NOW, allow_live_fetch=True, **kwargs)
        assert fallback["provider"] == "STATIC_PROFILE_V1"
        assert fallback["profile_versions"] == ["v1", "v2"]
        assert fallback["by_edge"][edge()["edge_id"]]["expected_speed_kmh"] == 30

    asyncio.run(run())
