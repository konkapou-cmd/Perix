"""Offline regressions for the observed N8 ETA and Domplatz platform defects."""
import asyncio
from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from routes import mobility as routes
from mobility import arrivals, detour_guard, display_labels, generations, overrides, v2
from mobility.motion import engine


def timeline():
    return [dict(stop_id=sid, scheduled=arrival, scheduled_arrival=arrival,
                 scheduled_departure=departure, predicted_arrival=arrival,
                 predicted_departure=departure, relationship="SCHEDULED", delay_seconds=0)
            for sid, arrival, departure in (("A", 0, 0), ("Q", 60, 90))]


def delayed_plan():
    return {"segments": [
        {"kind": "MOVE", "t0": 0, "t1": 360, "from_timeline_index": 0,
         "next_timeline_index": 1},
        {"kind": "DWELL", "t0": 360, "t1": 380, "timeline_index": 1},
    ], "start_s": 0, "end_s": 380, "motion_model": "TEST"}


def test_projection_preserves_raw_clocks_and_never_compounds_model_delay():
    raw = timeline()
    original = deepcopy(raw)
    plan = delayed_plan()
    effective = engine.effective_timeline_from_plan(raw, plan)
    assert effective[1]["predicted_arrival"] == 360
    assert effective[1]["predicted_departure"] == 380
    assert effective[1]["source_predicted_arrival"] == 60
    assert effective[1]["scheduled_arrival"] == 60
    assert effective[1]["prediction_basis"] == "PERIX_MOTION_PLAN"
    assert engine.effective_timeline_from_plan(effective, plan) == effective
    assert raw == original


def test_partial_handover_keeps_history_and_skipped_occurrences_untouched():
    raw = timeline()
    previous = delayed_plan()
    previous["effective_timeline"] = engine.effective_timeline_from_plan(raw, previous)
    suffix = {"segments": [{"kind": "MOVE", "handover_applied": True,
                            "from_timeline_index": 0, "next_timeline_index": 1,
                            "t0": 100, "t1": 340}]}
    effective = engine.effective_timeline_from_plan(raw, suffix, previous)
    assert effective[0]["predicted_departure"] == 0  # not falsely rewritten to NOW
    assert effective[1]["predicted_arrival"] == 340
    raw[1]["relationship"] = "SKIPPED"
    effective = engine.effective_timeline_from_plan(raw, suffix, previous)
    assert effective[1]["predicted_arrival"] == 60
    assert effective[1]["relationship"] == "SKIPPED"


@pytest.mark.asyncio
async def test_concurrent_polls_share_a_plan_revision_and_date_boundaries(monkeypatch):
    engine.clear_motion_cache()
    monkeypatch.setattr(engine, "handover_enabled", lambda: False)
    calls = []

    async def build(**kwargs):
        calls.append(kwargs)
        await asyncio.sleep(0)
        return delayed_plan()

    monkeypatch.setattr(engine, "_build_trip_plan", build)
    monkeypatch.setattr(engine, "_sample_trip_plan", lambda plan, now, raw, progress: {
        "progress_m": float(now), "speed_kmh": 20, "motion_state": "MOVING", "next_timeline_index": 1})
    path = {"pattern_id": "p", "derived_generation": "g", "service_date": "2026-10-24",
            "stop_progress": [0, 1000], "total_m": 1000}
    args = dict(trip_id="T", mode="bus", version_id="v", timeline=timeline(), path=path, now_sec=100)
    first, second = await asyncio.gather(engine.position_for_trip(**args), engine.position_for_trip(**args))
    assert len(calls) == 1
    assert first["motion_plan_revision"] == second["motion_plan_revision"]
    assert first["effective_timeline"][1]["predicted_arrival"] == 360
    projected_input = {**args, "timeline": first["effective_timeline"]}
    assert (await engine.position_for_trip(**projected_input))["effective_timeline"] == first["effective_timeline"]
    assert len(calls) == 1
    await engine.position_for_trip(**{**args, "path": {**path, "service_date": "2026-10-23"}})
    assert len(calls) == 2
    assert not engine._PLAN_GATES
    engine.clear_motion_cache()


@pytest.mark.asyncio
async def test_rebuild_samples_prior_plan_at_now_not_last_poll_position(monkeypatch):
    engine.clear_motion_cache()
    mono = [100.0]
    monkeypatch.setattr(engine, "time", SimpleNamespace(monotonic=lambda: mono[0]))
    monkeypatch.setattr(engine, "handover_enabled", lambda: True)
    calls = []

    async def build(**kwargs):
        calls.append(kwargs)
        plan = delayed_plan()
        plan["effective_timeline"] = engine.effective_timeline_from_plan(kwargs["timeline"], plan)
        return plan

    monkeypatch.setattr(engine, "_build_trip_plan", build)
    monkeypatch.setattr(engine, "_sample_trip_plan", lambda plan, now, raw, progress: {
        "progress_m": float(now), "speed_kmh": 20, "motion_state": "MOVING", "next_timeline_index": 1})
    args = dict(trip_id="T", mode="bus", version_id="v", timeline=timeline(), now_sec=100,
                path={"pattern_id": "p", "derived_generation": "g", "service_date": "2026-10-24",
                      "stop_progress": [0, 1000], "total_m": 1000})
    await engine.position_for_trip(**args)
    mono[0] += 13
    await engine.position_for_trip(**{**args, "now_sec": 113})
    assert calls[-1]["handover"]["progress_m"] == 113
    assert calls[-1]["handover"]["progress_m"] != 100
    assert calls[-1]["previous_plan"] is not None
    engine.clear_motion_cache()


@pytest.fixture
def endpoints(monkeypatch):
    a = {"stop_id": "A", "name": "Origin", "lat": 52.12, "lng": 11.63}
    q = {"stop_id": "Q", "name": "Domplatz", "lat": 52.124092, "lng": 11.631216}
    p = {"stop_id": "P", "name": "Domplatz", "lat": 52.125275, "lng": 11.63184}
    trip = {"trip_id": "T", "stop_ids": ["A", "Q"], "start": "00:00", "end": "00:01",
            "stop_times": {"A": "00:00", "Q": "00:01"},
            "stop_times_arrival": {"A": "00:00", "Q": "00:01"}, "headsign": "Center"}
    route = {"route_number": "N2", "mode": "bus", "stops": [a, q, p], "trips": [trip]}
    network = {"version_id": "v", "service_date": "2026-10-24", "region_id": "magdeburg",
               "network_id": "de-magdeburg-mvb", "routes": [route]}
    rt = {"trip_delay_observed": True, "delay_seconds": 0,
          "feed_timestamp": 1792795280, "updated_at": "2026-10-24T00:41:32+02:00"}
    raw = routes._predicted_stop_timeline(route, trip, rt)
    effective = engine.effective_timeline_from_plan(raw, delayed_plan())
    vehicle = {"vehicle_id": "est_test", "network_version_id": "v", "service_date": "2026-10-24",
               "mode": "bus", "route_number": "N2", "route_direction": "Center", "trip_id": "T",
               "estimated": True, "position_source": "REALTIME_ESTIMATE", "pattern_id": "p",
               "latitude": 52.124, "longitude": 11.6312,
               "_effective_timeline": effective, "_motion_plan_revision": "revision-one",
               "_motion_next_timeline_index": 1, "_prediction_realtime": rt,
               "next_stop_eta_seconds": 260, "next_stop_predicted_arrival": "00:06",
               "source_next_stop_predicted_arrival": "00:01", "prediction_basis": "PERIX_MOTION_PLAN"}
    domain = {"network": network,
              "stops": [{"stop_id": "physical:station", "stop_ids": ["P", "Q"], "name": "Domplatz",
                         "latitude": p["lat"], "longitude": p["lng"], "platforms": [
                             {"platform_id": s["stop_id"], "name": s["name"], "latitude": s["lat"], "longitude": s["lng"]}
                             for s in (p, q)]}],
              "patterns": [{"pattern_id": "p", "route_number": "N2", "mode": "bus", "stop_ids": ["A", "Q"]}],
              "trip_templates": [{"trip_id": "T", "trip_instance_id": "v:2026-10-24:T", "pattern_id": "p",
                                  "route_number": "N2", "mode": "bus", "stop_ids": ["A", "Q"]}]}
    monkeypatch.setattr(v2, "_domain", AsyncMock(return_value=domain))
    monkeypatch.setattr(routes, "_all_active_vehicles", AsyncMock(return_value=[vehicle]))
    monkeypatch.setattr(routes, "networks_for_journey_window", AsyncMock(return_value=[network]))
    monkeypatch.setattr(routes, "_realtime_delays_for", AsyncMock(return_value={"T": rt}))
    monkeypatch.setattr(routes, "_now_service_seconds", lambda *args: 100)
    monkeypatch.setattr(overrides, "canceled_trip_ids", AsyncMock(return_value=set()))
    monkeypatch.setattr(overrides, "skipped_stop_ids", AsyncMock(return_value={}))
    monkeypatch.setattr(display_labels, "display_alias", lambda *args, **kwargs: {})
    monkeypatch.setattr(detour_guard, "detour_states_for_domain", AsyncMock(return_value={}))
    monkeypatch.setattr(arrivals, "db", SimpleNamespace(mobility_vehicle_state=SimpleNamespace(
        find=lambda *args: SimpleNamespace(to_list=AsyncMock(return_value=[])))))
    monkeypatch.setattr(routes, "db", SimpleNamespace(mobility_live=SimpleNamespace(find_one=AsyncMock(return_value=None))))
    return SimpleNamespace(vehicle=vehicle, raw=raw, effective=effective, rt=rt, network=network, domain=domain)


@pytest.mark.asyncio
async def test_marker_board_and_trip_use_the_same_effective_time_and_revision(endpoints):
    s = endpoints
    before = deepcopy(s.rt)
    marker = (await v2.v2_vehicles(None))[0]
    board = (await arrivals.unified_arrivals("physical:station"))[0]
    details = await routes.vehicle_trip_progress("est_test", None)
    assert marker["next_stop_predicted_arrival"] == board["predicted_arrival"] == details["stops"][1]["predicted"] == "00:06"
    assert marker["motion_plan_revision"] == board["motion_plan_revision"] == details["motion_plan_revision"] == "revision-one"
    assert board["eta_seconds"] == marker["next_stop_eta_seconds"] == 260
    assert board["source_predicted_arrival"] == details["stops"][1]["source_predicted"] == "00:01"
    assert board["eta_source"] == "PERIX_ESTIMATE" and board["source_eta_source"] == "REALTIME"
    assert details["stops"][0]["passed"] and not details["stops"][1]["passed"]
    assert s.rt == before


@pytest.mark.asyncio
async def test_domplatz_distance_uses_the_served_platform_not_the_group_point(endpoints):
    result = (await arrivals.unified_arrivals("physical:station", platform_id="Q"))[0]
    assert result["platform_id"] == "Q"
    assert result["platform_latitude"] == 52.124092
    assert result["distance_to_stop_m"] < 15  # group point would be roughly 150m
    assert await arrivals.unified_arrivals("physical:station", platform_id="P") == []
    assert await arrivals.unified_arrivals("physical:station", platform_id="wrong-station") == []


@pytest.mark.asyncio
async def test_dwell_is_still_boardable_and_becomes_zero_only_at_the_model_stop(endpoints, monkeypatch):
    s = endpoints
    monkeypatch.setattr(routes, "_now_service_seconds", lambda *args: 370)
    s.vehicle.update(latitude=52.124092, longitude=11.631216)
    result = (await arrivals.unified_arrivals("physical:station"))[0]
    assert result["eta_seconds"] == 0
    assert result["distance_to_stop_m"] == 0
    monkeypatch.setattr(routes, "_now_service_seconds", lambda *args: 381)
    assert await arrivals.unified_arrivals("physical:station") == []


@pytest.mark.asyncio
async def test_gps_coordinates_and_provider_eta_are_not_replaced_by_a_model(endpoints, monkeypatch):
    s = endpoints
    s.vehicle.update(estimated=False, position_source="VEHICLE_GPS")
    monkeypatch.setattr(routes, "_now_service_seconds", lambda *args: 50)
    marker = (await v2.v2_vehicles(None))[0]
    result = (await arrivals.unified_arrivals("physical:station"))[0]
    assert marker["position"]["latitude"] == s.vehicle["latitude"]
    assert marker["position"]["longitude"] == s.vehicle["longitude"]
    assert marker["motion_plan_revision"] is None
    assert result["eta_seconds"] == 10 and result["predicted_arrival"] == "00:01"
    assert result["eta_source"] == "REALTIME" and result["position_source"] == "LIVE"
    assert result["motion_plan_revision"] is None


@pytest.mark.asyncio
async def test_cancellation_and_skip_overrides_remain_authoritative(endpoints, monkeypatch):
    monkeypatch.setattr(overrides, "canceled_trip_ids", AsyncMock(return_value={"T"}))
    assert await arrivals.unified_arrivals("physical:station") == []
    monkeypatch.setattr(overrides, "canceled_trip_ids", AsyncMock(return_value=set()))
    monkeypatch.setattr(overrides, "skipped_stop_ids", AsyncMock(return_value={"T": {"Q"}}))
    assert await arrivals.unified_arrivals("physical:station") == []


def test_known_motion_window_keeps_a_delayed_trip_but_not_a_new_identity():
    route = {"route_number": "N8", "stops": [
        {"stop_id": "A", "name": "A", "lat": 52, "lng": 11},
        {"stop_id": "Q", "name": "Q", "lat": 52.01, "lng": 11}],
        "trips": [{"trip_id": "T", "stop_ids": ["A", "Q"],
                   "stop_times": {"A": "00:00", "Q": "00:01"}}]}
    baseline = routes._chain_trips(route)
    delayed = routes._chain_trips(route, effective_windows={"T": {"start": 0, "end": 360}})
    assert baseline[0]["trips"][0]["trip"]["trip_id"] == delayed[0]["trips"][0]["trip"]["trip_id"]
    assert baseline[0]["end"] == 60 and delayed[0]["end"] == 360
    assert len(delayed) == len(baseline) == 1
