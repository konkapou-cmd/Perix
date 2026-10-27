import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from mobility.motion import engine

EPOCH = datetime(2026, 10, 27, tzinfo=timezone.utc)


@pytest.fixture
def plan(monkeypatch):
    from mobility import generations
    region = SimpleNamespace(region_id="r", network_id="n", timezone="UTC", motion={})
    monkeypatch.setattr(engine, "get_active_region", lambda: region)
    monkeypatch.setattr(generations, "atomic_generations_enabled", lambda: False)
    monkeypatch.setattr(engine, "db", SimpleNamespace(mobility_pattern_infrastructure=SimpleNamespace(
        find_one=AsyncMock(return_value={"total_m": 800, "edges": [{"edge_id": "road", "from_m": 0,
            "to_m": 800, "way": {"highway": "primary", "railway": "tram", "maxspeed_kmh": 50}}], "signals": []}))))
    monkeypatch.setattr(engine, "traffic_snapshot_for_edges", AsyncMock(return_value={"by_edge": {}}))
    monkeypatch.setenv("MOBILITY_MOTION_PREVIEW_ENABLED", "true")
    path = {"pattern_id": "p", "total_m": 800, "stop_progress": [0, 400, 800], "service_date": "2026-10-27"}
    timeline = [{"stop_id": str(i), "scheduled_arrival": t, "scheduled_departure": t + dwell,
                 "predicted_arrival": t, "predicted_departure": t + dwell}
                for i, (t, dwell) in enumerate([(0, 0), (60, 2), (120, 0)])]
    def build(mode="bus"):
        return asyncio.run(engine._build_trip_plan(trip_id="t", version_id="v", mode=mode,
            path=path, timeline=timeline, now_local=EPOCH))
    return build, path, timeline


def at(preview, elapsed):
    phase = next((p for p in preview["phases"] if elapsed <= p["t1"]), preview["phases"][-1])
    t = max(0, min(phase["t1"] - phase["t0"], elapsed - phase["t0"]))
    return max(phase["p0"], min(phase["p1"], phase["p0"] + phase["v0"] * t + .5 * phase["a"] * t * t))


@pytest.mark.parametrize("mode", ["bus", "tram"])
@pytest.mark.parametrize("now", [0, 15, 52, 59, 60, 61, 62, 63, 100, 120])
def test_preview_is_exact_existing_trajectory_and_stops_at_boundary(plan, mode, now):
    build, path, timeline = plan
    current = build(mode)
    sampled = engine._sample_trip_plan(current, now, timeline, path["stop_progress"])
    preview = engine._motion_preview(current, now, EPOCH + timedelta(seconds=now), path, "revision", "journey", sampled["progress_m"])
    if not preview:
        assert now in (60, 62, 120)
        return
    assert preview["revision"] == "revision" and preview["journey_id"] == "journey"
    assert preview["sampled_at_ms"] == pytest.approx((EPOCH.timestamp() + now) * 1000)
    duration = preview["phases"][-1]["t1"]
    assert 0 < duration <= 8
    for i in range(101):
        elapsed = duration * i / 100
        expected = engine._sample_trip_plan(current, now + elapsed, timeline, path["stop_progress"])
        assert at(preview, elapsed) == pytest.approx(expected["progress_m"], abs=1e-6)
    if now < 60:
        assert now + duration <= 60
        assert at(preview, duration) <= 400
    if now == 61:
        assert duration == 1 and at(preview, duration) == 400


def test_default_off_and_untrusted_clock_or_progress_fail_closed(plan, monkeypatch):
    build, path, timeline = plan
    current = build()
    now = 15
    progress = engine._sample_trip_plan(current, now, timeline, path["stop_progress"])["progress_m"]
    def preview(local=EPOCH + timedelta(seconds=15), p=path, distance=progress):
        return engine._motion_preview(current, now, local, p, "r", "j", distance)
    monkeypatch.delenv("MOBILITY_MOTION_PREVIEW_ENABLED")
    assert preview() is None
    monkeypatch.setenv("MOBILITY_MOTION_PREVIEW_ENABLED", "true")
    assert preview(p={**path, "service_date": None}) is None
    assert preview(local=datetime(2026, 10, 27, 0, 0, 15)) is None
    assert preview(local=EPOCH + timedelta(seconds=50)) is None
    assert preview(distance=progress + 1) is None


def test_maximum_payload_clips_validity_instead_of_extrapolating(plan):
    _, path, _ = plan
    phases = [{"t0": i / 10, "t1": (i + 1) / 10, "p0": i, "p1": i + 1,
               "v0": 10, "v1": 10, "state": "MOVING"} for i in range(100)]
    current = {"end_s": 10, "segments": [{"kind": "MOVE", "t0": 0, "t1": 10,
                "trajectory": {"segments": phases}, "time_scale": 1,"next_timeline_index":1}],
                "effective_timeline":[{}, {"predicted_arrival":10}]}
    preview = engine._motion_preview(current, 0, EPOCH, path, "r", "j", 0)
    assert len(preview["phases"]) == 32
    assert preview["phases"][-1]["t1"] == 3.2
    assert preview["valid_until_ms"] == EPOCH.timestamp() * 1000 + 3200


def test_24plus_service_clock_keeps_the_dated_identity(plan):
    _, path, _ = plan
    path = {**path, "service_date": "2026-10-26"}
    current = {"end_s": 90060, "segments": [{"kind": "DWELL", "t0": 90000, "t1": 90060,
                 "progress_m": 400,"timeline_index":1}],"effective_timeline":[{}, {"predicted_arrival":90000}]}
    preview = engine._motion_preview(current, 90015, EPOCH + timedelta(hours=1, seconds=15), path, "r", "old-day-trip", 400)
    assert preview["sampled_at_ms"] == (EPOCH + timedelta(hours=1, seconds=15)).timestamp() * 1000
    assert preview["journey_id"] == "old-day-trip"


def test_early_stationary_preview_reauthorizes_at_source_arrival_without_retiming_motion(plan):
    from copy import deepcopy
    _,path,_=plan
    current={'end_s':62,'segments':[{'kind':'DWELL','t0':40,'t1':62,
        'progress_m':400,'timeline_index':1}],
        'effective_timeline':[{}, {'predicted_arrival':40,'predicted_departure':62,
                                  'source_predicted_arrival':60}]}
    before=deepcopy(current)
    preview=engine._motion_preview(current,59,EPOCH+timedelta(seconds=59),path,'r','j',400)
    assert preview['phases'][-1]['t1']==1
    assert preview['arrival_at_ms']==(EPOCH+timedelta(seconds=40)).timestamp()*1000
    assert all(p['p0']==p['p1']==400 and p['v0']==0 for p in preview['phases'])
    assert current==before
    refreshed=engine._motion_preview(current,61,EPOCH+timedelta(seconds=61),path,'r','j',400)
    assert refreshed['phases'][-1]['t1']==1


def test_longer_eta_retains_baseline_without_spatial_observations():
    def builder(ratio):
        return {"duration_s": 300 - 60 * ratio, "segments": [], "recovery_ratio": ratio}
    fit = engine._fit_leg(builder, 480, 10)
    assert fit["time_scale"] == 1.6 and fit["recovery_ratio"] == 0
    # No invented signal stop/allocation was added to improve apparent accuracy.
    assert fit["trajectory"]["segments"] == []


def test_3min_to_90sec_keeps_the_actual_road_cap(plan):
    from mobility.motion.bus import build_bus_leg
    from mobility.motion.config import motion_config_for
    config = motion_config_for("bus", engine.get_active_region())
    def builder(ratio):
        return build_bus_leg(edges=[{"edge_id": "road", "from_m": 0, "to_m": 2000,
            "way": {"highway": "primary", "maxspeed_kmh": 50}}], signals=[], traffic_by_edge={},
            start_m=0, end_m=2000, departure_service_s=0, config=config, recovery_ratio=ratio)
    fitted = engine._fit_leg(builder, 90, 10)
    assert fitted["physics_limited_s"] > 0 and fitted["time_scale"] == 1
    assert all(max(s["v0"], s["v1"]) * 3.6 <= 50.000001 for s in fitted["trajectory"]["segments"])


def test_response_clock_metadata_does_not_mutate_cached_motion_or_gps(monkeypatch):
    from mobility import v2
    from routes import mobility
    preview = {"schema": 1, "revision": "r"}
    cached = [{"vehicle_id": "estimate", "estimated": True, "motion": {"preview": preview}},
              {"vehicle_id": "gps", "estimated": False, "motion": {"speed_kmh": 10}}]
    monkeypatch.setattr(mobility, "networks_for_journey_window", AsyncMock(return_value=[{"version_id": "v"}]))
    monkeypatch.setattr(mobility, "_all_active_vehicles", AsyncMock(return_value=cached))
    monkeypatch.setattr(mobility, "_vehicle_in_network", lambda row, network: row["estimated"])
    async def dated(network, rows):
        return [{**row} for row in rows]  # Match actual serializer's fresh outer rows.
    monkeypatch.setattr(v2, "_dated_vehicles", dated)
    out = asyncio.run(v2.v2_vehicles(None))
    transmitted = out[0]["motion"]["preview"]
    assert transmitted["server_received_at_ms"] <= transmitted["server_sent_at_ms"]
    assert "server_sent_at_ms" not in preview
    assert cached[0]["motion"]["preview"] is preview
    assert out[1]["motion"] == {"speed_kmh": 10}


@pytest.mark.parametrize("arrival,expected", [(60.0,60),(60.00000000001,60),(60.00001,61),(60.25,61),(59.99999999999,60)])
def test_effective_arrival_rounds_only_floating_noise(arrival, expected):
    timeline = [{"stop_id":"a","predicted_arrival":0,"predicted_departure":0},
                {"stop_id":"b","predicted_arrival":60,"predicted_departure":60}]
    plan = {"segments":[{"kind":"MOVE","from_timeline_index":0,"next_timeline_index":1,
                         "t0":0,"t1":arrival}]}
    effective = engine.effective_timeline_from_plan(timeline,plan)
    assert effective[1]["predicted_arrival"] == expected
    assert effective[1]["source_predicted_arrival"] == 60


def test_short_window_crossing_dst_fails_closed(plan):
    from zoneinfo import ZoneInfo
    _, path, _ = plan
    path = {**path, "service_date":"2026-10-25"}
    local = datetime(2026,10,25,2,59,58,tzinfo=ZoneInfo("Europe/Berlin"),fold=0)
    now = 2*3600+59*60+58
    current={"end_s":now+8,"segments":[{"kind":"DWELL","t0":now,"t1":now+8,
              "progress_m":400,"timeline_index":1}],"effective_timeline":[{}, {"predicted_arrival":now}]}
    assert engine._motion_preview(current,now,local,path,"r","j",400) is None
