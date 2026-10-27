"""Initial estimates come from the line's current temporal interval."""
import pytest
from test_effective_eta_physics import physical
from mobility.motion import engine
from mobility.motion.source_reconciliation import initial_source_index


@pytest.mark.parametrize('now,expected',[(5,0),(20,1),(25,1),(40,1),(55,1),(80,1)])
def test_source_interval_retains_pending_departure_and_never_uses_a_future_stop(now,expected):
    timeline=[{'predicted_arrival':0,'predicted_departure':0},
              {'predicted_arrival':20,'predicted_departure':40},
              {'predicted_arrival':60,'predicted_departure':60}]
    assert initial_source_index(timeline,now)==expected


@pytest.mark.asyncio
@pytest.mark.parametrize('mode',['bus','tram'])
async def test_initial_inverse_uses_remaining_arrival_not_historic_simulated_lateness(physical,monkeypatch,mode):
    monkeypatch.setenv('MOBILITY_SPATIAL_SLOWDOWN_ENABLED','true')
    physical.kwargs['mode']=mode
    result=await engine.position_for_trip(**physical.kwargs,initial_sync=True)
    assert result['progress_m']>800
    assert result['effective_timeline'][1]['predicted_arrival']==1020
    assert result['initialization']['basis']=='SOURCE_LEG_REMAINING_TIME_INVERSION'
    assert 0<result['speed_kmh']<=50.000001
    plan=next(reversed(engine._PLAN_CACHE.values()))['plan']
    move=next(s for s in plan['segments'] if s['kind']=='MOVE')
    assert move['time_scale']==1
    assert move['trajectory']['start_m']==pytest.approx(result['progress_m'])
    for segment in move['trajectory']['segments']:
        assert max(segment['v0'],segment['v1'])*3.6<=50.000001


@pytest.mark.asyncio
async def test_initial_alignment_can_correct_a_cached_estimate_over_100m(physical,monkeypatch):
    monkeypatch.setenv('MOBILITY_SPATIAL_SLOWDOWN_ENABLED','true')
    before=await engine.position_for_trip(**physical.kwargs)
    physical.clock.mono+=3
    after=await engine.position_for_trip(**physical.kwargs,initial_sync=True)
    assert after['progress_m']-before['progress_m']>100
    assert after['estimate_revision']!=before['estimate_revision']
    assert after['motion_plan_revision']!=before['motion_plan_revision']
    assert after['source_correction']['reason']=='INITIAL_SOURCE_ALIGNMENT'


@pytest.mark.asyncio
async def test_initial_alignment_can_correct_a_backward_target_over_100m(physical,monkeypatch):
    monkeypatch.setenv('MOBILITY_SPATIAL_SLOWDOWN_ENABLED','true')
    physical.kwargs['timeline'][0].update(predicted_arrival=890,predicted_departure=900)
    physical.kwargs['timeline'][1].update(predicted_arrival=1200,predicted_departure=1220)
    physical.kwargs['timeline'][2].update(predicted_arrival=1500,predicted_departure=1510)
    before=await engine.position_for_trip(**physical.kwargs)
    physical.kwargs['timeline'][0].update(predicted_arrival=990,predicted_departure=1000)
    physical.clock.mono+=3
    after=await engine.position_for_trip(**physical.kwargs,initial_sync=True)
    assert before['progress_m']-after['progress_m']>100
    assert after['initialization']['correction_m'] < -100
    assert after['estimate_revision']!=before['estimate_revision']


@pytest.mark.asyncio
async def test_small_initial_difference_retains_now_position_and_speed(physical,monkeypatch):
    monkeypatch.setenv('MOBILITY_SPATIAL_SLOWDOWN_ENABLED','true')
    physical.kwargs['timeline'][1].update(predicted_arrival=1200,predicted_departure=1220)
    physical.kwargs['timeline'][2].update(predicted_arrival=1500,predicted_departure=1510)
    before=await engine.position_for_trip(**physical.kwargs)
    physical.clock.mono+=3
    after=await engine.position_for_trip(**physical.kwargs,initial_sync=True)
    assert after['progress_m']==pytest.approx(before['progress_m'],abs=1e-6)
    assert after['speed_kmh']==pytest.approx(before['speed_kmh'],abs=.05)
    assert after['estimate_revision']==before['estimate_revision']


@pytest.mark.asyncio
async def test_small_backward_target_is_absorbed_without_moving_the_marker_back(physical,monkeypatch):
    monkeypatch.setenv('MOBILITY_SPATIAL_SLOWDOWN_ENABLED','true')
    physical.kwargs['timeline'][0].update(predicted_arrival=980,predicted_departure=990)
    physical.kwargs['timeline'][1].update(predicted_arrival=1200,predicted_departure=1220)
    physical.kwargs['timeline'][2].update(predicted_arrival=1500,predicted_departure=1510)
    before=await engine.position_for_trip(**physical.kwargs)
    physical.kwargs['timeline'][0].update(predicted_arrival=990,predicted_departure=1000)
    physical.clock.mono+=3
    after=await engine.position_for_trip(**physical.kwargs,initial_sync=True)
    assert after['progress_m']==pytest.approx(before['progress_m'],abs=1e-6)
    assert after['speed_kmh']==pytest.approx(before['speed_kmh'],abs=.05)
    assert after['estimate_revision']==before['estimate_revision']


@pytest.mark.asyncio
async def test_current_source_interval_does_not_inherit_historical_simulation_lateness(physical,monkeypatch):
    monkeypatch.setenv('MOBILITY_SPATIAL_SLOWDOWN_ENABLED','true')
    entries=physical.kwargs['timeline']
    entries[0].update(predicted_arrival=0,predicted_departure=0)
    entries[1].update(predicted_arrival=10,predicted_departure=20)
    entries[2].update(predicted_arrival=200,predicted_departure=210)
    physical.kwargs['now_sec']=150
    result=await engine.position_for_trip(**physical.kwargs,initial_sync=True)
    assert result['initialization']['source_anchor_index']==1
    assert result['next_timeline_index']==2
    assert result['effective_timeline'][2]['predicted_arrival']==200
    assert result['effective_timeline'][1]['predicted_departure']==20
    assert result['progress_m']>1000


@pytest.mark.asyncio
async def test_reference_is_read_inside_the_trip_lock_after_waiting_for_data(physical,monkeypatch):
    monkeypatch.setenv('MOBILITY_SPATIAL_SLOWDOWN_ENABLED','true')
    result=await engine.position_for_trip(**physical.kwargs,initial_sync=True,reference_clock=lambda:1014)
    assert result['reference_service_s']==1014
    assert result['effective_timeline'][1]['predicted_arrival']==1020


@pytest.mark.asyncio
async def test_initial_terminal_interval_is_a_stop_not_another_simulated_drive(physical,monkeypatch):
    monkeypatch.setenv('MOBILITY_SPATIAL_SLOWDOWN_ENABLED','true')
    physical.kwargs['now_sec']=1085
    result=await engine.position_for_trip(**physical.kwargs,initial_sync=True)
    assert result['progress_m']==3000 and result['speed_kmh']==0
    assert result['motion_state']=='AT_STOP'


@pytest.mark.asyncio
async def test_provisional_ten_seconds_dwell_and_later_live_departure(physical,monkeypatch):
    monkeypatch.setenv('MOBILITY_SPATIAL_SLOWDOWN_ENABLED','true')
    physical.kwargs['timeline'][1].update(predicted_arrival=1180,predicted_departure=1180)
    physical.kwargs['timeline'][2].update(predicted_arrival=1480,predicted_departure=1480)
    physical.kwargs['now_sec']=1183
    first=await engine.position_for_trip(**physical.kwargs,initial_sync=True)
    assert first['progress_m']==1000 and first['motion_state']=='DWELL'
    assert first['effective_timeline'][1]['predicted_departure']==1190
    physical.kwargs['timeline'][1].update(predicted_departure=1200,
        provider_predicted_departure_s=1200,departure_timing_basis='DIRECT_STOP_UPDATE')
    physical.clock.mono+=3;physical.kwargs['now_sec']=1184
    updated=await engine.position_for_trip(**physical.kwargs,initial_sync=True)
    assert updated['progress_m']==1000 and updated['motion_state']=='DWELL'
    assert updated['effective_timeline'][1]['predicted_departure']==1200


@pytest.mark.asyncio
async def test_explicit_departure_takes_precedence_over_the_provisional_dwell(physical,monkeypatch):
    monkeypatch.setenv('MOBILITY_SPATIAL_SLOWDOWN_ENABLED','true')
    physical.kwargs['timeline'][1].update(predicted_arrival=1180,predicted_departure=1182,
        provider_predicted_departure_s=1182,departure_timing_basis='DIRECT_STOP_UPDATE')
    physical.kwargs['timeline'][2].update(predicted_arrival=1480,predicted_departure=1480)
    physical.kwargs['now_sec']=1183
    result=await engine.position_for_trip(**physical.kwargs,initial_sync=True)
    assert result['progress_m']>1000 and result['motion_state']=='MOVING'
    assert result['effective_timeline'][1]['predicted_departure']==1182


@pytest.mark.asyncio
async def test_existing_vehicle_endpoint_forwards_initial_sync_explicitly(monkeypatch):
    from unittest.mock import AsyncMock
    from mobility import v2
    from routes import mobility
    network={'version_id':'v'}
    monkeypatch.setattr(mobility,'networks_for_journey_window',AsyncMock(return_value=[network]))
    compute=AsyncMock(return_value=[])
    monkeypatch.setattr(mobility,'_all_active_vehicles',compute)
    monkeypatch.setattr(v2,'_dated_vehicles',AsyncMock(return_value=[]))
    assert await v2.v2_vehicles(None,initial_sync=True)==[]
    compute.assert_awaited_once_with(networks=[network],initial_sync=True)


@pytest.mark.asyncio
async def test_initial_pending_departure_is_not_overridden_by_a_small_moving_estimate(physical,monkeypatch):
    monkeypatch.setenv('MOBILITY_SPATIAL_SLOWDOWN_ENABLED','true')
    physical.kwargs['timeline'][1].update(predicted_arrival=1200,predicted_departure=1220)
    physical.kwargs['timeline'][2].update(predicted_arrival=1500,predicted_departure=1510)
    before=await engine.position_for_trip(**physical.kwargs)
    assert 0<before['progress_m']<100
    physical.kwargs['timeline'][0].update(predicted_departure=1020,
        provider_predicted_departure_s=1020,departure_timing_basis='DIRECT_STOP_UPDATE')
    physical.clock.mono+=3
    after=await engine.position_for_trip(**physical.kwargs,initial_sync=True)
    assert after['progress_m']==0 and after['speed_kmh']==0
    assert after['motion_state']=='DWELL'
    assert after['effective_timeline'][0]['predicted_departure']==1020
    assert after['source_correction']['reason']=='INITIAL_SOURCE_DEPARTURE_BOUND'
