"""Send-time samples reuse the exact authorized plan; no new fitting/source I/O."""
import asyncio
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import math
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from test_motion_preview import plan, EPOCH
from routes import mobility as routes
from mobility.motion import engine
from mobility import v2


@pytest.fixture
def publication(plan,monkeypatch):
    build,path,timeline=plan
    current=build()
    path={**path,'points':[[52,11],[52+800/6371000*180/math.pi,11]],'cumulative':[0,800]}
    key=('r','n','v','p','trip','bus',path['service_date'],None,None,None,None,'sig','bucket')
    snapshot={'cached_at':100,'plan':current,'path':path,'source_timeline':deepcopy(timeline),
              'motion_plan_revision':'revision','estimate_revision':'estimate'}
    monkeypatch.setattr(engine,'_PLAN_CACHE',{key:snapshot})
    monkeypatch.setattr(engine,'time',SimpleNamespace(monotonic=lambda:128))
    row={'vehicle_id':'pin','trip_id':'trip','trip_instance_id':'n:v:2026-10-27:trip',
         'estimated':True,'mode':'bus','network_version_id':'v','service_date':path['service_date'],
         'pattern_id':'p','progress_m':0,'motion_plan_revision':'revision','estimate_revision':'estimate',
         'identity_kind':'VIRTUAL_SCHEDULE','position':{'latitude':52,'longitude':11,
             'source':'SCHEDULE_ESTIMATE','quality':'SCHEDULE','age_seconds':0},
         'next_stop_eta_seconds':60,'next_stop_id':'1','prediction_basis':'PERIX_MOTION_PLAN',
         'realtime_feed_timestamp':123,'realtime_updated_at':'original-receipt',
         'timing_evidence':{'source_status':'SCHEDULE_ONLY','feed_timestamp':123,
                           'trip_update_timestamp':100,'received_at':'original-receipt'},
         'motion':{'preview':engine._motion_preview(current,0,EPOCH,path,'revision',
                      'n:v:2026-10-27:trip',0)}}
    return SimpleNamespace(plan=current,path=path,row=row,snapshot=snapshot)


def test_slow_fleet_response_resamples_position_eta_and_window_without_refreshing_source(publication,monkeypatch):
    case=publication
    no_fit=AsyncMock(side_effect=AssertionError('Publication must not rebuild a plan'))
    monkeypatch.setattr(engine,'_build_trip_plan',no_fit)
    before=deepcopy(case.snapshot)
    old_row=deepcopy(case.row)
    now=EPOCH+timedelta(seconds=28)
    refreshed=v2._refresh_estimated_publications([case.row],now)[0]
    expected=engine._sample_trip_plan(case.plan,28,case.plan['effective_timeline'],case.path['stop_progress'])
    assert refreshed['progress_m']==pytest.approx(expected['progress_m'],abs=1e-8)
    assert refreshed['progress_m']>case.row['progress_m']
    assert refreshed['next_stop_eta_seconds']==32
    preview=refreshed['motion']['preview']
    assert preview['sampled_at_ms']==now.timestamp()*1000
    assert now.timestamp()*1000<preview['valid_until_ms']<=now.timestamp()*1000+8000
    assert preview['phases'][0]['p0']==pytest.approx(refreshed['progress_m'])
    assert preview['revision']==refreshed['motion_plan_revision']=='revision'
    assert refreshed['realtime_feed_timestamp']==123
    assert refreshed['timing_evidence']['feed_timestamp']==123
    assert refreshed['timing_evidence']['received_at']=='original-receipt'
    assert refreshed['timing_evidence']['source_status']=='SCHEDULE_ONLY'
    assert case.snapshot==before and case.row==old_row
    no_fit.assert_not_called()


@pytest.mark.parametrize('now',[59,60,61,62,70,120,121])
def test_send_time_sampling_respects_station_and_trip_boundaries(publication,now):
    case=publication
    refreshed=v2._refresh_estimated_publications([case.row],EPOCH+timedelta(seconds=now))[0]
    expected=engine._sample_trip_plan(case.plan,now,case.plan['effective_timeline'],case.path['stop_progress'])
    assert refreshed['progress_m']==pytest.approx(expected['progress_m'],abs=1e-8)
    assert refreshed['next_timeline_index']==expected['next_timeline_index']
    assert refreshed['next_stop_id']==str(expected['next_timeline_index'])
    if now in (60,61,62):
        assert refreshed['progress_m']==400 and refreshed['next_stop_eta_seconds']==0
    if now>=120:
        assert refreshed['progress_m']==800 and refreshed['next_stop_eta_seconds']==0
        assert refreshed['motion']['preview'] is None
    if now==70:
        assert refreshed['next_stop_id']=='2'
        assert refreshed['next_stop_eta_seconds']==50


@pytest.mark.parametrize('field,value',[
    ('trip_id','other'),('network_version_id','other'),('pattern_id','other'),
    ('service_date','2026-10-26'),('motion_plan_revision','other'),('estimate_revision','other')])
def test_send_time_cannot_borrow_a_different_identity_or_revision(publication,field,value):
    row={**publication.row,field:value}
    out=v2._refresh_estimated_publications([row],EPOCH+timedelta(seconds=28))
    assert out[0] is row


def test_stale_snapshot_or_backward_wall_clock_retains_safe_packet(publication,monkeypatch):
    row=publication.row
    monkeypatch.setattr(engine,'time',SimpleNamespace(monotonic=lambda:191))
    assert v2._refresh_estimated_publications([row],EPOCH+timedelta(seconds=28))[0] is row
    monkeypatch.setattr(engine,'time',SimpleNamespace(monotonic=lambda:128))
    forward={**row,'progress_m':600}
    assert v2._refresh_estimated_publications([forward],EPOCH+timedelta(seconds=28))[0] is forward


def test_gps_taxis_and_removed_journeys_are_not_rewritten_or_resurrected(publication):
    gps={**publication.row,'estimated':False}
    taxi={**publication.row,'mode':'taxi'}
    out=v2._refresh_estimated_publications([gps,taxi],EPOCH+timedelta(seconds=28))
    assert out[0] is gps and out[1] is taxi
    assert v2._refresh_estimated_publications([],EPOCH+timedelta(seconds=28))==[]


def test_actual_v2_response_clock_follows_send_time_resample(publication,monkeypatch):
    from routes import mobility
    import time
    now=EPOCH+timedelta(seconds=28)
    class Clock(datetime):
        @classmethod
        def now(cls,tz=None):return now.astimezone(tz or timezone.utc)
    monkeypatch.setattr(v2,'datetime',Clock)
    monkeypatch.setattr(time,'time',lambda:now.timestamp())
    monkeypatch.setattr(mobility,'networks_for_journey_window',AsyncMock(return_value=[{'version_id':'v'}]))
    monkeypatch.setattr(mobility,'_all_active_vehicles',AsyncMock(return_value=[publication.row]))
    monkeypatch.setattr(mobility,'_vehicle_in_network',lambda *args:True)
    monkeypatch.setattr(v2,'_dated_vehicles',AsyncMock(side_effect=lambda network,rows:[{**r} for r in rows]))
    out=asyncio.run(v2.v2_vehicles(None))
    preview=out[0]['motion']['preview']
    assert preview['sampled_at_ms']==preview['server_sent_at_ms']==now.timestamp()*1000
    assert preview['valid_until_ms']>preview['server_sent_at_ms']
    assert out[0]['next_stop_eta_seconds']==32


@pytest.mark.parametrize('microseconds',[1,123,123456,333333,500001,999999])
def test_fractional_publication_clock_does_not_randomly_drop_valid_windows(publication,microseconds):
    now=EPOCH+timedelta(seconds=28,microseconds=microseconds)
    refreshed=v2._refresh_estimated_publications([publication.row],now)[0]
    preview=refreshed['motion']['preview']
    assert preview is not None
    assert preview['sampled_at_ms']==pytest.approx(now.timestamp()*1000,abs=.001)
    assert preview['valid_until_ms']>preview['sampled_at_ms']


def test_publication_converts_utc_to_the_service_timezone(publication,monkeypatch):
    from zoneinfo import ZoneInfo
    monkeypatch.setattr(engine,'get_active_region',lambda:SimpleNamespace(
        region_id='r',network_id='n',timezone='Europe/Berlin'))
    now=datetime(2026,10,27,0,0,28,tzinfo=ZoneInfo('Europe/Berlin')).astimezone(timezone.utc)
    refreshed=v2._refresh_estimated_publications([publication.row],now)[0]
    assert refreshed['next_stop_eta_seconds']==32
    assert refreshed['motion']['preview']['sampled_at_ms']==now.timestamp()*1000
    assert refreshed['service_date']=='2026-10-27'


def test_24plus_publication_keeps_the_previous_service_day_identity(publication,monkeypatch):
    case=publication
    plan=deepcopy(case.plan)
    for segment in plan['segments']:
        segment['t0']+=86400;segment['t1']+=86400
    plan['start_s']+=86400;plan['end_s']+=86400
    for entry in plan['effective_timeline']:
        for field in ('predicted_arrival','predicted_departure','source_predicted_arrival','source_predicted_departure'):
            if field in entry:entry[field]+=86400
    key=list(next(iter(engine._PLAN_CACHE)))
    key[6]='2026-10-26'
    snapshot={**case.snapshot,'plan':plan,'path':{**case.path,'service_date':'2026-10-26'}}
    monkeypatch.setattr(engine,'_PLAN_CACHE',{tuple(key):snapshot})
    row={**case.row,'service_date':'2026-10-26','trip_instance_id':'n:v:2026-10-26:trip'}
    refreshed=v2._refresh_estimated_publications([row],EPOCH+timedelta(seconds=28))[0]
    assert refreshed['next_stop_eta_seconds']==32
    assert refreshed['trip_instance_id']=='n:v:2026-10-26:trip'
    assert refreshed['motion']['preview']['journey_id']==refreshed['trip_instance_id']


def test_new_publication_time_never_promotes_stale_source_times_to_current(publication):
    row=deepcopy(publication.row)
    row['timing_evidence']['source_status']='STALE_FEED'
    refreshed=v2._refresh_estimated_publications([row],EPOCH+timedelta(seconds=28))[0]
    assert refreshed['motion']['publication_resampled'] is True
    assert refreshed['timing_evidence']['source_status']=='STALE_FEED'
    assert refreshed['realtime_feed_timestamp']==row['realtime_feed_timestamp']
    assert refreshed['position']['quality']=='SCHEDULE'
