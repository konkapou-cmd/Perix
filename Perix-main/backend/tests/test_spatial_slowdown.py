import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from mobility.motion import engine
from mobility.motion.bus import build_bus_leg
from mobility.motion.tram import build_tram_leg
from mobility.motion.config import motion_config_for
from mobility.motion.common import sample_trajectory, trajectory_time_at_progress, spatial_slowdown_spans

POINTS=[{'progress_m':p,'kind':'MODELED_SIGNAL_APPROACH'} for p in (1000,2200,3200)]


def test_continuous_spans_do_not_bridge_distinct_obstacles_or_raise_hard_caps():
    config=motion_config_for('bus',SimpleNamespace(motion={}))
    original=[{'from_m':0,'to_m':4000,'speed_cap_kmh':25}]
    spans=spatial_slowdown_spans(original,POINTS,0,4000,config,0,1)
    assert spans and all(0<s['speed_cap_kmh']<=25 for s in spans)
    assert not any(s['from_m']<1800<s['to_m'] for s in spans)
    for anchor in (1000,2200,3200):
        zones=sorted((s for s in spans if anchor-90<=s['from_m']<anchor+25),key=lambda s:s['from_m'])
        assert zones[0]['from_m']==anchor-90
        assert zones[-1]['to_m']==anchor+25
        assert all(a['to_m']==b['from_m'] for a,b in zip(zones,zones[1:]))


def make_builder(mode='bus',start=0,initial=0,points=POINTS,traffic=None,end=4000):
    region=SimpleNamespace(motion={})
    config={**motion_config_for(mode,region),'road_signal_enabled':False,'rail_signal_enabled':False}
    def builder(ratio,strength=0,remaining_strength=0):
        args=dict(edges=[{'edge_id':'road','from_m':0,'to_m':end,
                   'way':{'highway':'primary','railway':'tram','maxspeed_kmh':50}}],signals=[],
                  start_m=start,end_m=end,departure_service_s=0,config=config,
                  recovery_ratio=ratio,initial_speed_kmh=initial,slowdowns=points,slowdown_strength=strength,
                  remaining_strength=remaining_strength)
        return (build_bus_leg(**args,traffic_by_edge=traffic or {}) if mode=='bus' else build_tram_leg(**args))
    return builder,config


def speed_at(trajectory,p):
    t=trajectory_time_at_progress(trajectory,p)
    return sample_trajectory(trajectory,t)['speed_kmh']


def check_physics(trajectory,config,initial=0):
    assert trajectory['segments'][0]['v0']*3.6==pytest.approx(initial,abs=.05)
    for s in trajectory['segments']:
        assert s['state']=='MOVING'  # No invented signal/queue stop.
        assert max(s['v0'],s['v1'])*3.6<=50.000001
        if s['p0']>trajectory['start_m'] and s['p1']<trajectory['end_m']:
            assert s['v0']>0 and s['v1']>0
        dt=s['t1']-s['t0']
        a=(s['v1']-s['v0'])/dt
        assert -config['braking_mps2']-1e-6<=a<=config['acceleration_mps2']+1e-6


@pytest.mark.parametrize('mode',['bus','tram'])
def test_5_to_8_minutes_delay_is_at_obstacles_not_uniformly_on_the_road(mode):
    builder,config=make_builder(mode)
    baseline=engine._fit_leg(builder,480,10)
    fitted=engine._fit_leg(builder,480,10,spatial_builder=builder)
    assert baseline['time_scale']>1.5
    assert fitted['fit']=='SPATIAL_SLOWDOWN' and fitted['time_scale']==1
    assert 0<=480-fitted['trajectory']['duration_s']<.1
    assert speed_at(fitted['trajectory'],500)==pytest.approx(50,abs=.01)
    assert speed_at(fitted['trajectory'],1800)==pytest.approx(50,abs=.01)
    assert speed_at(fitted['trajectory'],1000)<15
    assert speed_at(fitted['trajectory'],2200)<15
    assert speed_at(fitted['trajectory'],3200)<15
    check_physics(fitted['trajectory'],config)


@pytest.mark.parametrize('mode',['bus','tram'])
def test_new_30s_earlier_arrival_reduces_the_upcoming_slowdowns_without_a_jump(mode):
    builder,config=make_builder(mode)
    old=engine._fit_leg(builder,480,10,spatial_builder=builder)
    now=trajectory_time_at_progress(old['trajectory'],650)
    state=sample_trajectory(old['trajectory'],now)
    next_builder,_=make_builder(mode,start=state['progress_m'],initial=state['speed_kmh'])
    new=engine._fit_leg(next_builder,450-now,10,spatial_builder=next_builder,initial_speed_kmh=state['speed_kmh'])
    assert new['fit']=='SPATIAL_SLOWDOWN'
    assert new['spatial_slowdown']['strength']<old['spatial_slowdown']['strength']
    assert new['trajectory']['start_m']==pytest.approx(state['progress_m'])
    assert now+new['trajectory']['duration_s']==pytest.approx(450,abs=.1)
    check_physics(new['trajectory'],config,state['speed_kmh'])


def test_new_close_signal_cannot_force_instantaneous_braking():
    builder,config=make_builder(start=995,initial=50)
    fitted=engine._fit_leg(builder,350,10,spatial_builder=builder,initial_speed_kmh=50)
    assert fitted['fit']=='SPATIAL_SLOWDOWN'
    assert speed_at(fitted['trajectory'],1000)>45
    check_physics(fitted['trajectory'],config,50)


@pytest.mark.parametrize('kind',['MODELED_SIGNAL_APPROACH','MODELED_JUNCTION_APPROACH'])
def test_slowing_is_upstream_and_recovery_starts_when_crossing_the_mapped_obstacle(kind):
    points=[{'progress_m':p,'kind':kind} for p in (1000,2200,3200)]
    builder,config=make_builder(points=points)
    fit=engine._fit_leg(builder,480,10,spatial_builder=builder)
    trajectory=fit['trajectory']
    assert fit['fit']=='SPATIAL_SLOWDOWN'
    for anchor in (1000,2200,3200):
        assert speed_at(trajectory,anchor-75)>speed_at(trajectory,anchor-20)
        assert speed_at(trajectory,anchor+5)>speed_at(trajectory,anchor)
        assert speed_at(trajectory,anchor+25)>speed_at(trajectory,anchor+5)
    check_physics(trajectory,config)


def test_impossible_3_to_1_5_minutes_keeps_the_hard_limits():
    builder,_=make_builder(end=2000,points=[{'progress_m':1000,'kind':'MODELED_SIGNAL_APPROACH'}])
    original=engine._fit_leg(builder,180,10,spatial_builder=builder)
    assert original['fit']=='SPATIAL_SLOWDOWN'
    assert original['trajectory']['duration_s']==pytest.approx(180,abs=.1)
    fitted=engine._fit_leg(builder,90,10,spatial_builder=builder)
    assert fitted['fit']=='PHYSICS_LIMITED' and fitted['physics_limited_s']>0
    assert fitted['time_scale']==1
    assert max(max(s['v0'],s['v1'])*3.6 for s in fitted['trajectory']['segments'])<=50.000001


@pytest.mark.parametrize('mode',['bus','tram'])
@pytest.mark.parametrize('start',[651.234567,987.654321])
def test_non_aligned_now_grid_has_no_acceleration_waves_in_slow_plateau(mode,start):
    builder,config=make_builder(mode,start=start,initial=50)
    fitted=engine._fit_leg(builder,450,10,spatial_builder=builder,initial_speed_kmh=50)
    assert fitted['fit']=='SPATIAL_SLOWDOWN'
    trajectory=fitted['trajectory']
    for anchor in (2200,3200):
        speeds=[speed_at(trajectory,anchor-30+i*.5) for i in range(51)]
        assert max(speeds)-min(speeds)<1e-6
    check_physics(trajectory,config,50)


@pytest.mark.parametrize('cap',[2,12])
def test_real_nonrecoverable_edge_flow_is_not_removed_or_counted_twice(cap):
    builder,_=make_builder(traffic={'road':{'expected_speed_kmh':cap,'constraint':'NON_RECOVERABLE'}})
    fitted=engine._fit_leg(builder,480,10,spatial_builder=builder)
    assert fitted['physics_limited_s']>0
    assert max(max(s['v0'],s['v1'])*3.6 for s in fitted['trajectory']['segments'])<=cap+.000001


def test_only_upcoming_exact_mode_correct_priors_are_used():
    signals=[{'progress_m':p,'kinds':[family],'usable_for_motion':usable,'match_method':method,'signal_id':i}
             for i,(p,family,usable,method) in enumerate([(90,'ROAD_SIGNAL',True,'NODE_EXACT'),
               (250,'ROAD_SIGNAL',True,'NODE_EXACT'),(450,'ROAD_SIGNAL',False,'SPATIAL_NEAR_PATH'),
               (650,'RAIL_SIGNAL',True,'NODE_EXACT'),(995,'ROAD_SIGNAL',True,'NODE_EXACT')])]
    infra={'signals':signals,'edges':[]}
    priors=engine._spatial_slowdown_priors(infra,'bus',100,1000,{}, {'turn_speed_kmh':{}})
    assert [p['progress_m'] for p in priors]==[250]
    priors=engine._spatial_slowdown_priors(infra,'tram',100,1000,{}, {'turn_speed_kmh':{}})
    assert [p['progress_m'] for p in priors]==[650]


def test_one_intersection_is_not_added_twice_and_covered_signal_delay_is_not_repeated():
    event={'progress_m':250,'kinds':['ROAD_SIGNAL'],'usable_for_motion':True,'match_method':'NODE_EXACT'}
    infra={'signals':[event,{**event,'progress_m':252}], 'edges':[{'edge_id':'e','from_m':0,'to_m':1000}]}
    config={'turn_speed_kmh':{}}
    assert len(engine._spatial_slowdown_priors(infra,'bus',0,1000,{},config))==1
    remaining=engine._spatial_slowdown_priors(infra,'bus',0,1000,{'e':{'includes_signal_delay':True,'constraint':'NON_RECOVERABLE'}},config)
    assert all(p['kind']!='MODELED_SIGNAL_APPROACH' for p in remaining)


def test_no_supported_points_never_invents_a_delay_zone_or_uniform_stretch():
    builder,_=make_builder(points=[])
    old=engine._fit_leg(builder,480,10)
    fallback=engine._fit_leg(builder,480,10,spatial_builder=builder)
    # Recovery-ratio metadata changes from 0 to 1; the road has no flow delay,
    # so compare the actual motion rather than requiring identical metadata.
    assert fallback['trajectory']['segments']==old['trajectory']['segments']
    assert fallback['trajectory']['duration_s']==old['trajectory']['duration_s']
    assert old['time_scale']>1
    assert fallback['time_scale']==1
    assert fallback['fit']=='LOCAL_DELAY_UNALLOCATED'
    assert fallback['spatial_slowdown']['unallocated_delay_s']>0
    assert fallback['spatial_slowdown']['fallback']=='INSUFFICIENT_LOCAL_DELAY_CAPACITY'


@pytest.mark.parametrize('mode',['bus','tram'])
def test_revised_eta_without_another_obstacle_adjusts_only_the_untravelled_leg(mode):
    builder,config=make_builder(mode,start=651.234567,initial=50,points=[])
    fitted=engine._fit_leg(builder,450,10,spatial_builder=builder,
        remaining_builder=lambda strength:builder(1,0,strength),initial_speed_kmh=50)
    assert fitted['fit']=='REMAINING_ETA_ADJUSTMENT'
    assert fitted['time_scale']==1
    assert fitted['trajectory']['start_m']==651.234567
    assert fitted['trajectory']['duration_s']==pytest.approx(450,abs=.1)
    assert fitted['spatial_slowdown']['allocation_basis']=='UPDATED_ETA_REMAINING_MOTION'
    check_physics(fitted['trajectory'],config,50)
    assert speed_at(fitted['trajectory'],660)>45
    assert speed_at(fitted['trajectory'],1000)>0


def test_remaining_adaptation_cannot_raise_the_museum_service_road_fallback():
    config={**motion_config_for('bus',SimpleNamespace(motion={})), 'road_signal_enabled':False}
    def builder(ratio,strength=0,remaining_strength=0):
        return build_bus_leg(edges=[{'edge_id':'museum','from_m':0,'to_m':1000,
            'way':{'highway':'service'}}],signals=[],traffic_by_edge={},start_m=0,end_m=1000,
            departure_service_s=0,config=config,recovery_ratio=ratio,
            remaining_strength=remaining_strength)
    fitted=engine._fit_leg(builder,300,10,spatial_builder=builder,
        remaining_builder=lambda strength:builder(1,0,strength))
    assert fitted['fit']=='REMAINING_ETA_ADJUSTMENT'
    assert fitted['trajectory']['duration_s']==pytest.approx(300,abs=.1)
    assert max(max(s['v0'],s['v1'])*3.6 for s in fitted['trajectory']['segments'])<=25.000001


def test_straight_road_has_no_station_delay_fallback_and_keeps_real_terminal_braking():
    priors=engine._spatial_slowdown_priors({'edges':[],'signals':[]},'bus',0,4000,{}, {'turn_speed_kmh':{}})
    assert priors==[]
    builder,config=make_builder(points=priors)
    fit=engine._fit_leg(builder,480,10,spatial_builder=builder)
    assert fit['fit']=='LOCAL_DELAY_UNALLOCATED' and fit['time_scale']==1
    assert speed_at(fit['trajectory'],2000)==pytest.approx(50,abs=.01)
    assert fit['trajectory']['segments'][-1]['v1']==0
    assert fit['trajectory']['duration_s']<480
    assert fit['spatial_slowdown']['unallocated_delay_s']>0
    check_physics(fit['trajectory'],config)


@pytest.mark.parametrize('mode',['bus','tram'])
def test_a_turn_b_straight_c_junction_d_station_share_one_five_minute_budget(mode):
    config={**motion_config_for(mode,SimpleNamespace(motion={})),
            'road_signal_enabled':False,'rail_signal_enabled':False}
    coords=[[52,11],[52.00899,11],[52.00899,11.0205],[52.00899,11.0366]]
    boundaries=[0,1000,2400,3500]
    edges=[{'edge_id':str(i),'from_m':boundaries[i],'to_m':boundaries[i+1],
            'from_node':i,'to_node':i+1,'from_point':coords[i],'to_point':coords[i+1],
            'way':{'highway':'primary','railway':'tram','maxspeed_kmh':50}} for i in range(3)]
    family='RAIL_SIGNAL' if mode=='tram' else 'ROAD_SIGNAL'
    infra={'edges':edges,'signals':[{'progress_m':2400,'kinds':[family],'usable_for_motion':True,
                                    'match_method':'NODE_EXACT','signal_id':1}]}
    priors=engine._spatial_slowdown_priors(infra,mode,0,3500,{},config)
    assert any(p['kind']=='MODELED_TURN' and p['angle_deg']>80 for p in priors)
    assert any(p['kind']=='MODELED_SIGNAL_APPROACH' for p in priors)
    def builder(ratio,strength=0):
        args=dict(edges=edges,signals=[],start_m=0,end_m=3500,departure_service_s=0,config=config,
                  recovery_ratio=ratio,slowdowns=priors,slowdown_strength=strength)
        return build_bus_leg(**args,traffic_by_edge={}) if mode=='bus' else build_tram_leg(**args)
    fitted=engine._fit_leg(builder,300,10,spatial_builder=builder)
    assert fitted['fit']=='SPATIAL_SLOWDOWN' and fitted['time_scale']==1
    assert fitted['trajectory']['duration_s']==pytest.approx(300,abs=.1)
    assert speed_at(fitted['trajectory'],1000)<=config['turn_speed_kmh']['70']+.01
    assert speed_at(fitted['trajectory'],1500)==pytest.approx(50,abs=.01)
    assert 0<speed_at(fitted['trajectory'],2400)<50
    assert speed_at(fitted['trajectory'],2800)==pytest.approx(50,abs=.01)
    assert fitted['trajectory']['segments'][-1]['v1']==0
    check_physics(fitted['trajectory'],config)


def test_active_stop_triad_changes_via_existing_cache_and_handover(monkeypatch):
    from mobility import generations,source_diagnostics
    now=[10];cache_clock_offset=[0];epoch=datetime(2026,10,27,tzinfo=timezone.utc)
    class Clock(datetime):
        @classmethod
        def now(cls,tz=None):return (epoch+timedelta(seconds=now[0])).astimezone(tz or timezone.utc)
    region=SimpleNamespace(region_id='r',network_id='n',timezone='UTC',motion={})
    monkeypatch.setattr(engine,'get_active_region',lambda:region)
    monkeypatch.setattr(engine,'datetime',Clock)
    monkeypatch.setattr(engine,'time',SimpleNamespace(monotonic=lambda:10000+now[0]+cache_clock_offset[0]))
    monkeypatch.setattr(source_diagnostics,'record_source_event',lambda event:None)
    monkeypatch.setattr(generations,'atomic_generations_enabled',lambda:False)
    monkeypatch.setenv('MOBILITY_SPATIAL_SLOWDOWN_ENABLED','true')
    monkeypatch.setenv('MOBILITY_PLAN_HANDOVER_ENABLED','true')
    monkeypatch.setattr(engine,'_PLAN_CACHE',{});monkeypatch.setattr(engine,'_HANDOVER_STATE',{})
    signals=[{'progress_m':p,'kinds':['ROAD_SIGNAL'],'usable_for_motion':True,'match_method':'NODE_EXACT','signal_id':i}
             for i,p in enumerate([200,600,1000])]
    infra={'total_m':1200,'edges':[{'edge_id':'road','from_m':0,'to_m':1200,'way':{'highway':'primary','maxspeed_kmh':50}}],'signals':signals}
    monkeypatch.setattr(engine,'db',SimpleNamespace(mobility_pattern_infrastructure=SimpleNamespace(find_one=AsyncMock(return_value=infra))))
    monkeypatch.setattr(engine,'traffic_snapshot_for_edges',AsyncMock(return_value={'by_edge':{}}))
    timeline=[{'stop_id':str(i),'predicted_arrival':t,'predicted_departure':t+(2 if i==1 else 0),
               'scheduled_arrival':t,'scheduled_departure':t+(2 if i==1 else 0)} for i,t in enumerate([0,80,160,240])]
    path={'pattern_id':'p','service_date':'2026-10-27','total_m':1200,'stop_progress':[0,400,800,1200]}
    async def sample(t):
        now[0]=t
        return await engine.position_for_trip(trip_id='trip',mode='bus',version_id='v',timeline=timeline,path=path,now_sec=t)
    first=asyncio.run(sample(10))
    assert first['fit']=='SPATIAL_SLOWDOWN'
    original_plan=next(iter(engine._PLAN_CACHE.values()))['plan']
    # Expire the 12 s cache, not the independent 90 s stale-state safeguard.
    cache_clock_offset[0]=20
    refreshed=asyncio.run(sample(10))
    assert next(iter(engine._PLAN_CACHE.values()))['plan'] is original_plan
    assert refreshed['progress_m']==pytest.approx(first['progress_m'],abs=1e-8)
    asyncio.run(sample(79))
    at_stop=asyncio.run(sample(81))
    assert at_stop['progress_m']==pytest.approx(400,abs=1e-5)
    assert at_stop['motion_state']=='DWELL'
    moving=asyncio.run(sample(83))
    assert moving['progress_m']>400 and moving['next_timeline_index']==2
    assert moving['fit']=='SPATIAL_SLOWDOWN'
    assert moving['spatial_slowdown']['priors'][0]['progress_m']==600
