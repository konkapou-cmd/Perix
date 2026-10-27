"""Exercise the real existing bus/tram physics with an offline infrastructure."""
from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from mobility import generations
from mobility.motion import engine


@pytest.fixture
def physical(monkeypatch):
    clock = SimpleNamespace(mono=100.0)
    region = SimpleNamespace(region_id='r', network_id='n', timezone='UTC', motion={}, service_day_start_hour=4)
    infra = {'total_m': 3000.0, 'edges': [{
        'edge_id': 'edge', 'from_m': 0.0, 'to_m': 3000.0,
        'way': {'highway': 'primary', 'railway': 'tram', 'maxspeed_kmh': 50.0},
    }], 'signals': []}
    find = AsyncMock(return_value=infra)
    monkeypatch.setattr(engine, 'db', SimpleNamespace(mobility_pattern_infrastructure=SimpleNamespace(find_one=find)))
    monkeypatch.setattr(engine, 'get_active_region', lambda: region)
    monkeypatch.setattr(engine, 'time', SimpleNamespace(monotonic=lambda: clock.mono))
    monkeypatch.setattr(engine, 'traffic_snapshot_for_edges', AsyncMock(return_value={'by_edge': {}}))
    monkeypatch.setattr(generations, 'atomic_generations_enabled', lambda: False)
    monkeypatch.setenv('MOBILITY_PLAN_HANDOVER_ENABLED', 'true')
    monkeypatch.setenv('MOBILITY_SIGNAL_SEMANTICS_ENABLED', 'false')
    engine.clear_motion_cache()
    kwargs = dict(trip_id='T', mode='bus', version_id='v', now_sec=1010,
        path={'pattern_id':'p', 'derived_generation':'g', 'service_date':'2026-10-24',
              'total_m':3000.0, 'stop_progress':[0.0,1000.0,3000.0]},
        timeline=[{'stop_id':sid,'scheduled':arr,'scheduled_arrival':arr,'scheduled_departure':dep,
                   'predicted_arrival':arr,'predicted_departure':dep,'relationship':'SCHEDULED'}
                  for sid,arr,dep in [('A',990,1000),('B',1020,1040),('C',1070,1080)]])
    yield SimpleNamespace(clock=clock, kwargs=kwargs, find=find)
    engine.clear_motion_cache()


@pytest.mark.asyncio
@pytest.mark.parametrize('mode',['bus','tram'])
async def test_real_plan_has_one_projected_timeline_and_respects_speed_caps(physical,mode):
    s=physical
    s.kwargs['mode']=mode
    original=deepcopy(s.kwargs['timeline'])
    first=await engine.position_for_trip(**s.kwargs)
    assert first is not None
    assert first['effective_timeline'][1]['predicted_arrival']>1020
    assert first['effective_timeline'][1]['source_predicted_arrival']==1020
    assert 0<=first['speed_kmh']<=50.01
    for i in range(1,3):
        assert first['effective_timeline'][i]['predicted_departure']>=first['effective_timeline'][i]['predicted_arrival']
    s.clock.mono+=4
    s.kwargs['now_sec']+=4
    second=await engine.position_for_trip(**s.kwargs)
    assert second['motion_plan_revision']==first['motion_plan_revision']
    assert second['effective_timeline']==first['effective_timeline']
    assert second['progress_m']>=first['progress_m']
    assert s.kwargs['timeline']==original
    assert s.find.await_count==1


@pytest.mark.asyncio
async def test_repeated_cache_refresh_does_not_keep_adding_a_poll_delay(physical):
    s=physical
    first=await engine.position_for_trip(**s.kwargs)
    clocks=[first['effective_timeline'][-1]['predicted_arrival']]
    previous=first
    for _ in range(5):
        old_plan=next(reversed(engine._PLAN_CACHE.values()))['plan']
        s.clock.mono+=13
        s.kwargs['now_sec']+=13
        expected=engine._sample_trip_plan(old_plan,s.kwargs['now_sec'],s.kwargs['timeline'],s.kwargs['path']['stop_progress'])
        result=await engine.position_for_trip(**s.kwargs)
        assert result['progress_m']==pytest.approx(expected['progress_m'],abs=0.1)
        assert result['progress_m']>=previous['progress_m']
        assert 0<=result['speed_kmh']<=50.01
        clocks.append(result['effective_timeline'][-1]['predicted_arrival'])
        previous=result
    assert max(clocks)-min(clocks)<=5  # not 13 seconds per replan


@pytest.mark.asyncio
async def test_plus_300_then_minus_120_updates_clocks_without_teleporting(physical):
    s=physical
    await engine.position_for_trip(**s.kwargs)
    for entry in s.kwargs['timeline'][1:]:
        entry['predicted_arrival']+=300
        entry['predicted_departure']+=300
    s.clock.mono+=4
    s.kwargs['now_sec']+=4
    delayed=await engine.position_for_trip(**s.kwargs)
    assert delayed['effective_timeline'][1]['predicted_arrival']>=1320
    old_plan=next(reversed(engine._PLAN_CACHE.values()))['plan']
    s.clock.mono+=4
    s.kwargs['now_sec']+=4
    expected=engine._sample_trip_plan(old_plan,s.kwargs['now_sec'],s.kwargs['timeline'],s.kwargs['path']['stop_progress'])
    for entry in s.kwargs['timeline'][1:]:
        entry['predicted_arrival']-=120
        entry['predicted_departure']-=120
    recovered=await engine.position_for_trip(**s.kwargs)
    assert recovered['progress_m']==pytest.approx(expected['progress_m'],abs=0.1)
    assert 1200<=recovered['effective_timeline'][1]['predicted_arrival']<=delayed['effective_timeline'][1]['predicted_arrival']
    assert recovered['motion_plan_revision']!=delayed['motion_plan_revision']
    assert 0<=recovered['speed_kmh']<=50.01


@pytest.mark.asyncio
async def test_dwell_rebuild_preserves_arrival_and_remaining_departure(physical):
    s=physical
    s.kwargs['timeline'][1]['predicted_departure']=1200
    s.kwargs['timeline'][2].update(predicted_arrival=1400,predicted_departure=1420)
    first=await engine.position_for_trip(**s.kwargs)
    arrival=first['effective_timeline'][1]['predicted_arrival']
    s.clock.mono+=13
    s.kwargs['now_sec']=arrival+2
    at_stop=await engine.position_for_trip(**s.kwargs)
    assert at_stop['motion_state']=='DWELL'
    s.clock.mono+=13
    s.kwargs['now_sec']+=2
    still_at_stop=await engine.position_for_trip(**s.kwargs)
    assert still_at_stop['motion_state']=='DWELL'
    assert still_at_stop['effective_timeline'][1]['predicted_arrival']==arrival
    assert still_at_stop['effective_timeline'][1]['predicted_departure']==1200


@pytest.mark.asyncio
@pytest.mark.parametrize('mode', ['bus', 'tram'])
async def test_every_second_zero_eta_is_at_exact_stop_with_repeated_refreshes(physical, mode):
    s = physical
    s.kwargs['mode'] = mode
    previous = None
    zero_stops = set()
    # Run the whole journey, not only a few conveniently selected snapshots.
    for now in range(990, 1501):
        s.kwargs['now_sec'] = now
        s.clock.mono = 100 + now - 990
        result = await engine.position_for_trip(**s.kwargs)
        assert result is not None
        progress = result['progress_m']
        assert 0 <= result['speed_kmh'] <= 50.01
        if previous is not None:
            assert progress >= previous - 0.1
            assert progress - previous <= 50 / 3.6 + 0.5
        previous = progress
        timeline = result['effective_timeline']
        next_index = result['next_timeline_index']
        for index, entry in enumerate(timeline):
            if index < next_index or entry['predicted_departure'] < now:
                continue
            eta = max(0, entry['predicted_arrival'] - now)
            if eta == 0:
                zero_stops.add(index)
                assert progress == pytest.approx(s.kwargs['path']['stop_progress'][index], abs=0.5), (mode, now, index, result)
        if progress == 3000 and now > timeline[-1]['predicted_departure']:
            break
    assert zero_stops == {0, 1, 2}, (mode, zero_stops)
