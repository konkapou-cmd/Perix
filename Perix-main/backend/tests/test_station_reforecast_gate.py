"""Arrival must wait for a new relevant forecast before departure selection."""
from datetime import datetime, timedelta, timezone

import pytest
from test_effective_eta_physics import physical
from mobility.motion import engine

EPOCH=datetime(2026,10,27,tzinfo=timezone.utc)


@pytest.fixture
def station(physical,monkeypatch):
    monkeypatch.setenv('MOBILITY_SPATIAL_SLOWDOWN_ENABLED','true')
    monkeypatch.setenv('MOBILITY_MOTION_PREVIEW_ENABLED','true')
    physical.kwargs['path']['service_date']='2026-10-27'
    physical.kwargs.update(require_station_reforecast=True,source_update_epoch=EPOCH.timestamp()+1010)
    class Clock(datetime):
        @classmethod
        def now(cls,tz=None):return (EPOCH+timedelta(seconds=physical.kwargs['now_sec'])).astimezone(tz or timezone.utc)
    monkeypatch.setattr(engine,'datetime',Clock)
    return physical


async def at(case,now,**extra):
    case.clock.mono+=3
    case.kwargs['now_sec']=now
    return await engine.position_for_trip(**case.kwargs,**extra)


@pytest.mark.asyncio
async def test_arrival_stays_at_stop_after_ten_seconds_old_departure_and_page_reload(station):
    await at(station,1010,initial_sync=True)
    arrived=await at(station,1021)
    later=await at(station,1060,initial_sync=True)
    for row in (arrived,later):
        assert row['progress_m']==1000 and row['speed_kmh']==0
        assert row['motion_state']=='DWELL' and row['station_forecast_pending'] is True
        assert row['motion_preview'] is None


@pytest.mark.asyncio
async def test_new_relevant_forecast_replans_from_the_stop_and_honors_binding_departure(station):
    await at(station,1010,initial_sync=True)
    await at(station,1021)
    station.kwargs['timeline'][1].update(predicted_departure=1065,
        provider_predicted_departure_s=1065,departure_timing_basis='DIRECT_STOP_UPDATE')
    station.kwargs['source_update_epoch']=EPOCH.timestamp()+1062
    waiting=await at(station,1062)
    assert waiting['progress_m']==1000 and waiting['speed_kmh']==0
    assert not waiting.get('station_forecast_pending',False)
    moving=await at(station,1066)
    assert moving['progress_m']>1000 and 0<moving['speed_kmh']<=50
    assert moving['effective_timeline'][1]['predicted_departure']==1065


@pytest.mark.asyncio
async def test_same_value_requires_a_post_arrival_relevant_source_clock_not_feed_freshness(station):
    station.kwargs['timeline'][1].update(provider_predicted_departure_s=1040,
        departure_timing_basis='DIRECT_STOP_UPDATE')
    await at(station,1010,initial_sync=True)
    station.kwargs['source_update_epoch']=EPOCH.timestamp()+1018
    before_new_forecast=await at(station,1022)
    assert before_new_forecast['station_forecast_pending']
    station.kwargs['source_update_epoch']=EPOCH.timestamp()+1030
    confirmed=await at(station,1030)
    assert confirmed['progress_m']==1000 and not confirmed.get('station_forecast_pending',False)
    assert (await at(station,1041))['progress_m']>1000


@pytest.mark.asyncio
async def test_cached_send_time_sampling_cannot_cross_the_station_gate(station):
    first=await at(station,1010,initial_sync=True)
    sample=engine.sample_cached_publication(trip_id='T',version_id='v',pattern_id='p',
        service_date='2026-10-27',revision=first['motion_plan_revision'],
        estimate_revision=first['estimate_revision'],now_local=EPOCH+timedelta(seconds=1060),
        minimum_progress_m=first['progress_m'])
    assert sample['progress_m']==1000 and sample['speed_kmh']==0
    assert sample['motion_state']=='DWELL' and sample['station_forecast_pending']
    assert sample['motion_preview'] is None
