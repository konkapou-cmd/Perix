"""A replaced cached revision must become one coherent update or explicit pending.

Existing strict identity/revision rejection assertions remain unchanged.
"""
from copy import deepcopy
import asyncio
from datetime import timedelta
from unittest.mock import AsyncMock

import pytest
from test_publication_sampling import publication, plan, EPOCH
from mobility.motion import engine
from mobility import v2


@pytest.fixture
def bound_publication(publication):
    case=publication
    case.snapshot['identity']=('r','n','v','p','trip','g','2026-10-27')
    case.row['motion']['publication_binding']=engine._publication_binding(case.snapshot)
    return case


def replace(case,**changes):
    key=next(iter(engine._PLAN_CACHE))
    latest={**deepcopy(case.snapshot),'cached_at':120,'motion_plan_revision':'new-revision',**changes}
    engine._PLAN_CACHE[key]=latest
    return latest


def test_replaced_revision_publishes_latest_authorized_packet_atomically(bound_publication):
    case=bound_publication
    replace(case)
    original=deepcopy(case.row)
    out=v2._refresh_estimated_publications([case.row],EPOCH+timedelta(seconds=28))[0]
    assert out['motion_plan_revision']=='new-revision'
    assert out['motion']['preview']['revision']=='new-revision'
    assert out['motion']['preview']['valid_until_ms']>(EPOCH+timedelta(seconds=28)).timestamp()*1000
    assert out['progress_m']>original['progress_m'] and out['next_stop_eta_seconds']==32
    assert out['motion']['publication_status']=='READY'
    assert out['motion']['publication_revision_replaced'] is True
    assert out['estimate_revision']=='estimate'
    assert out['timing_evidence']['received_at']=='original-receipt'
    assert out['realtime_feed_timestamp']==123
    assert case.row==original


@pytest.mark.parametrize('change',[
    {'estimate_revision':'new-estimate'},
    {'identity':('r','n','v','p','trip','different-generation','2026-10-27')},
    {'cached_at':99},
    {'motion_plan_revision':None},
])
def test_unready_vehicle_is_pending_not_borrowed_or_labeled_fresh(bound_publication,change):
    case=bound_publication
    replace(case,**change)
    out=v2._refresh_estimated_publications([case.row],EPOCH+timedelta(seconds=28))[0]
    assert out['motion']['publication_status']=='PENDING'
    assert out['motion']['preview'] is None
    assert out['progress_m']==case.row['progress_m']
    assert out['motion_plan_revision']=='revision'
    assert out['timing_evidence']['received_at']=='original-receipt'


@pytest.mark.parametrize('field,value',[
    ('identity_hash','wrong'),('geometry_hash','wrong'),('plan_revision','wrong'),('estimate_revision','wrong'),('cached_at',200)
])
def test_binding_cannot_authorize_another_identity_revision_or_future_snapshot(bound_publication,field,value):
    case=bound_publication
    replace(case)
    case.row['motion']['publication_binding'][field]=value
    out=v2._refresh_estimated_publications([case.row],EPOCH+timedelta(seconds=28))[0]
    assert out['motion']['publication_status']=='PENDING'
    assert out['motion']['preview'] is None


def test_publication_does_not_replace_a_forward_safe_position_with_a_backward_sample(bound_publication):
    case=bound_publication
    replace(case)
    case.row['progress_m']=600
    out=v2._refresh_estimated_publications([case.row],EPOCH+timedelta(seconds=28))[0]
    assert out['motion']['publication_status']=='PENDING'
    assert out['progress_m']==600 and out['motion']['preview'] is None


def test_one_pending_journey_does_not_block_ready_journeys_or_resurrect_removals(bound_publication):
    case=bound_publication
    ready={**case.row,'motion':{**case.row['motion']}}
    pending={**case.row,'vehicle_id':'other','trip_id':'other','motion':{**case.row['motion']}}
    result=v2._refresh_estimated_publications([ready,pending],EPOCH+timedelta(seconds=28))
    assert result[0]['motion']['publication_status']=='READY'
    assert result[1]['motion']['publication_status']=='PENDING'
    assert len(result)==2
    assert v2._refresh_estimated_publications([],EPOCH+timedelta(seconds=29))==[]


def test_newest_authorized_revision_wins_even_if_old_source_key_is_retained(bound_publication):
    case=bound_publication
    key=next(iter(engine._PLAN_CACHE))
    latest={**deepcopy(case.snapshot),'cached_at':120,'motion_plan_revision':'new-revision'}
    engine._PLAN_CACHE[(*key,'new-source')]=latest
    out=v2._refresh_estimated_publications([case.row],EPOCH+timedelta(seconds=28))[0]
    assert out['motion_plan_revision']=='new-revision'
    assert out['motion']['preview']['revision']=='new-revision'


def test_last_send_guard_removes_expired_curve_without_mutating_the_cached_row(publication,monkeypatch):
    from routes import mobility
    import time
    row=publication.row
    original=deepcopy(row)
    monkeypatch.setenv('MOBILITY_MOTION_PREVIEW_ENABLED','false')
    monkeypatch.setattr(time,'time',lambda:(EPOCH+timedelta(seconds=28)).timestamp())
    monkeypatch.setattr(mobility,'networks_for_journey_window',AsyncMock(return_value=[{'version_id':'v'}]))
    monkeypatch.setattr(mobility,'_all_active_vehicles',AsyncMock(return_value=[row]))
    monkeypatch.setattr(mobility,'_vehicle_in_network',lambda *args:True)
    monkeypatch.setattr(v2,'_dated_vehicles',AsyncMock(side_effect=lambda network,rows:[{**r} for r in rows]))
    result=asyncio.run(v2.v2_vehicles(None))[0]
    assert result['motion']['publication_status']=='PENDING'
    assert result['motion']['preview'] is None
    assert result['motion']['publication_pending_reason']=='WINDOW_NOT_VALID_AT_SEND'
    assert row==original


def test_binding_cannot_hide_a_changed_canonical_geometry_in_the_same_identity(bound_publication):
    case=bound_publication
    latest=replace(case)
    latest['path']['geometry_fingerprint']='new-geometry'
    result=v2._refresh_estimated_publications([case.row],EPOCH+timedelta(seconds=28))[0]
    assert result['motion']['publication_status']=='PENDING'
    assert result['motion']['preview'] is None
