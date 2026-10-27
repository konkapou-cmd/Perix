"""Data-read and calculation delay must not preserve a batch-start leg clock."""
from unittest.mock import AsyncMock

import pytest
from test_trip_selection_coverage import fleet
from routes import mobility as routes


@pytest.mark.asyncio
async def test_each_journey_uses_now_after_data_receipt_and_previous_calculation(fleet,monkeypatch):
    fleet['routes'][0]['trips'][0]['stop_times']['B']='18:15'
    clock=[18*3600+12*60]
    monkeypatch.setattr(routes,'_now_service_seconds',lambda *args:clock[0])
    async def received(*args,**kwargs):
        clock[0]+=40  # Data was obtained after the original request snapshot.
        return {}
    monkeypatch.setattr(routes,'_realtime_delays_for',received)
    references=[]
    async def estimate(route,trip,now_sec,*args,**kwargs):
        references.append(now_sec)
        clock[0]+=30  # Work for the preceding journey cannot freeze the next.
        return {'latitude':52.13,'longitude':11.62,'delay_minutes':0,
                'position_source':'SCHEDULE_ESTIMATE','pattern_id':'p','progress_m':50,
                '_effective_timeline':None}
    monkeypatch.setattr(routes,'_estimate_trip_position',estimate)
    vehicles=await routes._compute_estimated_transit_vehicles(fleet)
    assert {v['trip_id'] for v in vehicles}=={'out','back'}
    assert references==[18*3600+12*60+40,18*3600+12*60+70]


@pytest.mark.asyncio
async def test_receipt_crossing_trip_end_does_not_publish_an_expired_predecessor(fleet,monkeypatch):
    fleet['routes'][0]['trips'][0]['stop_times']['B']='18:15'
    clock=[18*3600+14*60+55]
    monkeypatch.setattr(routes,'_now_service_seconds',lambda *args:clock[0])
    async def received(*args,**kwargs):
        clock[0]=18*3600+16*60+10  # Beyond the existing 60 s source-edge grace.
        return {}
    monkeypatch.setattr(routes,'_realtime_delays_for',received)
    vehicles=await routes._compute_estimated_transit_vehicles(fleet)
    assert {v['trip_id'] for v in vehicles}=={'back'}
