"""Mapped slowing and revised-ETA adaptation after the last obstacle."""
import pytest
from test_effective_eta_physics import physical
from test_effective_eta_physics import (
    test_plus_300_then_minus_120_updates_clocks_without_teleporting as source_clock_case,
)
from mobility.motion import engine


@pytest.mark.asyncio
async def test_original_source_update_assertions_with_mapped_upcoming_signals(physical,monkeypatch):
    monkeypatch.setenv('MOBILITY_SPATIAL_SLOWDOWN_ENABLED','true')
    infrastructure=physical.find.return_value
    infrastructure['signals']=[{'progress_m':p,'signal_id':i,'kinds':['ROAD_SIGNAL'],
        'usable_for_motion':True,'match_method':'NODE_EXACT'}
        for i,p in enumerate((300,550,800))]
    # Reuse the original assertions intact; only the frozen infrastructure has
    # mapped upstream obstacles. No invented stop or station-delay fallback.
    await source_clock_case(physical)


@pytest.mark.asyncio
@pytest.mark.parametrize('mode',['bus','tram'])
async def test_after_last_obstacle_eta_adapts_remaining_motion_without_a_stop(physical,monkeypatch,mode):
    monkeypatch.setenv('MOBILITY_SPATIAL_SLOWDOWN_ENABLED','true')
    physical.kwargs['mode']=mode
    family='RAIL_SIGNAL' if mode=='tram' else 'ROAD_SIGNAL'
    physical.find.return_value['signals']=[{'progress_m':50,'signal_id':'passed',
        'kinds':[family],'usable_for_motion':True,'match_method':'NODE_EXACT'}]
    await engine.position_for_trip(**physical.kwargs)
    old_plan=next(iter(engine._PLAN_CACHE.values()))['plan']
    for entry in physical.kwargs['timeline'][1:]:
        entry['predicted_arrival']+=300
        entry['predicted_departure']+=300
    physical.clock.mono+=4
    physical.kwargs['now_sec']+=4
    expected=engine._precise_handover_sample(old_plan,physical.kwargs['now_sec'],
        physical.kwargs['timeline'],physical.kwargs['path']['stop_progress'])
    assert expected['progress_m']>50
    result=await engine.position_for_trip(**physical.kwargs)
    diagnostic=result['spatial_slowdown']
    assert diagnostic['unallocated_delay_s']<.1
    assert not diagnostic.get('priors')
    assert result['fit']=='REMAINING_ETA_ADJUSTMENT'
    assert result['effective_timeline'][1]['predicted_arrival']==1320
    assert result['progress_m']==pytest.approx(expected['progress_m'],abs=1e-6)
    assert result['speed_kmh']==pytest.approx(expected['speed_kmh'],abs=.05)
    assert result['progress_m']>0 and result['speed_kmh']>0
    plan=next(reversed(engine._PLAN_CACHE.values()))['plan']
    active=next(s for s in plan['segments'] if s['kind']=='MOVE'
                and s['t0']<=physical.kwargs['now_sec']<=s['t1'])
    assert active['time_scale']==1
    assert active['trajectory']['segments'][0]['v0']*3.6==pytest.approx(expected['speed_kmh'],abs=.05)
    for segment in active['trajectory']['segments']:
        assert segment['state']=='MOVING'
        assert max(segment['v0'],segment['v1'])*3.6<=50.000001
        if segment['p0']>active['trajectory']['start_m'] and segment['p1']<active['trajectory']['end_m']:
            assert segment['v0']>0 and segment['v1']>0
