from copy import deepcopy

import pytest

from mobility.motion.visual_progress import visual_preview, bound_visual_preview, sample_visual_plan
from test_visual_progress import plan


def at(preview,t):
    phase=next(p for p in preview['phases'] if p['t0']<=t<=p['t1'])
    dt=t-phase['t0']
    return phase['p0']+phase['v0']*dt+.5*phase['a']*dt*dt


def test_long_visual_publication_is_the_same_source_curve_not_extrapolation():
    p=plan(120);before=deepcopy(p);now=115
    sample=sample_visual_plan(p,now)
    long=visual_preview(p,sample,now_s=now,sampled_at_ms=1000000,journey_id='j',horizon_s=45)
    old=visual_preview(p,sample,now_s=now,sampled_at_ms=1000000,journey_id='j')
    bounded=bound_visual_preview(long)
    assert p==before
    assert long['valid_until_ms']==1000000+45000
    assert bounded['valid_until_ms']==old['valid_until_ms']==1000000+8000
    assert bounded['effective_arrival_at_ms']==long['effective_arrival_at_ms']==old['effective_arrival_at_ms']
    for t in (0,1,7.99):
        assert at(bounded,t)==pytest.approx(at(old,t))
    for t in (0,1,12,30,44.99):
        assert at(long,t)==pytest.approx(sample_visual_plan(p,now+t)['progress_m'])


def test_extended_window_still_stops_at_exact_source_arrival():
    p=plan(20);sample=sample_visual_plan(p,115)
    packet=visual_preview(p,sample,now_s=115,sampled_at_ms=1000000,journey_id='j',horizon_s=45)
    assert packet['valid_until_ms']==packet['effective_arrival_at_ms']==1015000
    assert packet['phases'][-1]['p1']==pytest.approx(500)
    assert max(x['p1'] for x in packet['phases'])<=500.0001
    assert packet['physical_speed_assurance'] is False


def test_publication_bound_is_copy_on_write_and_legacy_requests_keep_32_phase_cap():
    packet=dict(schema=2,sampled_at_ms=1000,effective_arrival_at_ms=100000,
        phases=[dict(t0=i*.1,t1=(i+1)*.1,p0=i,p1=i+1,v0=10,a=0) for i in range(128)])
    before=deepcopy(packet)
    old=bound_visual_preview(packet)
    assert len(old['phases'])==32
    assert old['valid_until_ms']==pytest.approx(4200)
    assert len(bound_visual_preview(packet,45)['phases'])==128
    assert bound_visual_preview(packet,9999)==old
    assert packet==before


@pytest.mark.asyncio
async def test_public_clock_bridge_does_not_read_or_modify_forecast_data():
    import time
    from routes import mobility as routes
    from mobility.v2 import v2_clock
    before=time.time()*1000
    packet=await v2_clock()
    after=time.time()*1000
    assert set(packet)=={'server_received_at_ms','server_sent_at_ms'}
    assert before<=packet['server_received_at_ms']<=packet['server_sent_at_ms']<=after
