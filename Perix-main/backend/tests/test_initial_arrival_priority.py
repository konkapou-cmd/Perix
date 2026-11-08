"""Existing-timeline bootstrap priority, no routing or production data calls."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest


@pytest.mark.asyncio
async def test_bootstrap_prioritizes_soonest_source_arrival_then_normal_poll_fills_rest(monkeypatch):
    from routes import mobility as routes
    from mobility import overrides
    from mobility.motion import visual_runtime, visual_windows, config
    monkeypatch.setattr(visual_runtime,'enabled',lambda:True)
    monkeypatch.setattr(visual_windows,'scheduled_windows',lambda *a:[None,None])
    monkeypatch.setattr(overrides,'canceled_trip_ids',AsyncMock(return_value=set()))
    monkeypatch.setattr(routes,'db',SimpleNamespace(mobility_live=SimpleNamespace(find=lambda *a:SimpleNamespace(to_list=AsyncMock(return_value=[])))))
    monkeypatch.setattr(routes,'_realtime_delays_for',AsyncMock(return_value={}))
    monkeypatch.setattr(routes,'_now_service_seconds',lambda *a:100)
    monkeypatch.setattr(config,'motion_config_for',lambda *a:{'visual':{'initial_preparation_budget_s':0.1}})
    trip=lambda tid:dict(trip_id=tid,headsign='terminal',stop_ids=['A','B'])
    network=dict(version_id='v',service_date='2026-11-04',routes=[dict(route_number='9',mode='tram',trips=[trip('later')]),dict(route_number='73',mode='bus',trips=[trip('soon')])])
    def chain(route,*a,**k):
        return [dict(start=90,end=200,trips=[dict(start=90,end=200,trip=route['trips'][0])])]
    monkeypatch.setattr(routes,'_chain_trips',chain)
    monkeypatch.setattr(routes,'_predicted_stop_timeline',lambda r,*a:[dict(predicted_arrival=105 if r['route_number']=='73' else 140,predicted_departure=150)])
    async def estimate(*a,**k):
        await asyncio.sleep(.11)
        return dict(latitude=52.1,longitude=11.6,delay_minutes=0,position_source='SCHEDULE_ESTIMATE',
                    motion={'model':'TIME_NORMALIZED_VISUAL_ESTIMATE','publication_status':'READY'})
    fitted=AsyncMock(side_effect=estimate);monkeypatch.setattr(routes,'_estimate_trip_position',fitted)
    first=await routes._compute_estimated_transit_vehicles(network,initial_sync=True)
    assert len(first)==1 and first[0]['route_number']=='73'
    assert fitted.call_args.args[0]['mode']=='bus'
    fitted.reset_mock()
    complete=await routes._compute_estimated_transit_vehicles(network)
    assert len(complete)==2
    assert {r['mode'] for r in complete}=={'bus','tram'}
