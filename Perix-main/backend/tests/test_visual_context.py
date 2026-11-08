"""Static optical context is shared, frozen and never an observed queue."""
import asyncio
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from pymongo.errors import DuplicateKeyError, ConnectionFailure

from mobility.motion import visual_context, visual_runtime
from test_visual_runtime import runtime, MemoryState, bind_runtime_direction


@pytest.fixture(autouse=True)
def clear_cache():
    visual_runtime.clear_visual_cache()
    yield
    visual_runtime.clear_visual_cache()


@pytest.mark.asyncio
async def test_bus_static_traffic_shapes_curve_but_never_changes_source_clocks(runtime, monkeypatch):
    kwargs, bundle, _ = runtime
    kwargs['mode'] = 'bus'
    bind_runtime_direction(kwargs,bundle)
    kwargs['region'].timezone = 'Europe/Berlin'
    edges = bundle['infrastructure']['edges']
    traffic = {str(edges[-1]['edge_id']): dict(expected_speed_kmh=7, profile_version='counts-v1',
        model='BPR_V1_UNCALIBRATED', calibrated=False)}
    lookup = AsyncMock(return_value=dict(provider='STATIC_PROFILE_V1', profile_versions=['counts-v1'], by_edge=traffic))
    monkeypatch.setattr(visual_context, 'traffic_snapshot_for_edges', lookup)
    original = deepcopy(kwargs['timeline'])
    busy = await visual_runtime.visual_position(**kwargs)
    assert busy['timeline'] == original
    assert busy['visual_context']['traffic_edge_counts'] == [1]
    assert busy['visual_context']['traffic_profile_versions'] == ['counts-v1']
    assert busy['visual_context']['density_model'] is False
    assert busy['speed_kmh'] is None
    assert busy['next_stop_eta_seconds'] == 5
    assert lookup.call_args.args[1].isoformat() == '2026-11-02T00:01:50+01:00'

    # A new worker and a changed database must still use the winning snapshot.
    visual_runtime.clear_visual_cache()
    lookup.return_value = dict(provider='STATIC_PROFILE_V1', profile_versions=[], by_edge={})
    same = await visual_runtime.visual_position(**kwargs)
    assert same['progress_m'] == pytest.approx(busy['progress_m'])
    assert same['revision'] == busy['revision']
    assert lookup.await_count == 1
    revised = deepcopy(original)
    revised[1].update(predicted_arrival=140, predicted_departure=150)
    delayed = await visual_runtime.visual_position(**{**kwargs, 'timeline': revised, 'source_order': (0, 101)})
    assert delayed['progress_m'] == pytest.approx(busy['progress_m'])
    assert delayed['next_stop_eta_seconds'] == 25
    assert lookup.await_count == 1
    assert (await visual_runtime.visual_position(**{**kwargs, 'timeline': revised,
        'source_order': (0, 101), 'now_s': 140}))['progress_m'] == kwargs['path']['stop_progress'][-1]

    # A different trip with no counts has a genuinely different shape, but the
    # same source ETA. Absence of data never manufactures a traffic estimate.
    free = await visual_runtime.visual_position(**{**kwargs, 'trip_id': 'free'})
    assert free['visual_context']['traffic_edge_counts'] == [0]
    assert abs(free['progress_m']-busy['progress_m']) > 1
    assert free['next_stop_eta_seconds'] == busy['next_stop_eta_seconds']


@pytest.mark.asyncio
async def test_mapped_approach_changes_shape_without_inventing_signal_stop(runtime, monkeypatch):
    kwargs, bundle, _ = runtime
    # Mapped exact rail signal: positive-speed slowing, no inferred phase.
    bundle['infrastructure']['signals'] = [dict(progress_m=350, kinds=['RAIL_SIGNAL'],
        usable_for_motion=True, match_method='NODE_EXACT', signal_id='s')]
    result = await visual_runtime.visual_position(**kwargs)
    plan = next(iter(visual_runtime._PLANS.values()))['plan']
    assert result is not None
    assert plan['legs'][0]['profile']['signal_stop_count'] == 0
    assert all(s['p1'] > s['p0'] for s in plan['legs'][0]['profile']['segments'])
    kwargs['region'].motion = {'tram': {'visual_spatial_slowdown_strength': 0}}
    free = await visual_runtime.visual_position(**{**kwargs, 'trip_id': 'no-prior'})
    assert abs(result['progress_m']-free['progress_m']) > 0.1
    assert result['next_stop_eta_seconds'] == free['next_stop_eta_seconds'] == 5


@pytest.mark.asyncio
async def test_later_source_allocates_more_optical_time_near_upcoming_junction(runtime):
    from mobility.motion.common import trajectory_time_at_progress
    from mobility.motion.visual_curve_context import remaining_profile
    kwargs, bundle, _ = runtime
    bundle['infrastructure']['signals'] = [dict(progress_m=350, kinds=['RAIL_SIGNAL'],
        usable_for_motion=True, match_method='NODE_EXACT', signal_id='s')]
    first = await visual_runtime.visual_position(**kwargs)
    revised = deepcopy(kwargs['timeline'])
    revised[1].update(predicted_arrival=140, predicted_departure=150)
    delayed = await visual_runtime.visual_position(**{**kwargs, 'timeline': revised, 'source_order': (0, 101)})
    assert delayed['progress_m'] == pytest.approx(first['progress_m'])
    assert delayed['next_stop_eta_seconds'] == 25
    state = next(iter(kwargs['state_collection'].rows.values()))
    parameters = state['curve_override']['profile_parameters']
    assert parameters['strength'] > 0.35
    assert delayed['visual_context']['optical_delay_allocation'] == 'UPCOMING_MAPPED_APPROACHES'
    assert delayed['visual_context']['active_spatial_strength'] == parameters['strength']
    assert parameters['start_m'] == pytest.approx(first['progress_m'])
    plan = list(visual_runtime._PLANS.values())[-1]['plan']
    strong, priors = remaining_profile(plan, 0, parameters)
    base, _ = remaining_profile(plan, 0, {**parameters, 'strength': 0.35})
    assert all(p['progress_m'] > first['progress_m'] for p in priors)
    def share(profile):
        return (trajectory_time_at_progress(profile, 350)-trajectory_time_at_progress(profile, 315))/profile['duration_s']
    assert share(strong) > share(base)
    assert strong['signal_stop_count'] == 0
    assert strong['segments'][0]['v0'] == pytest.approx(base['segments'][0]['v0'])
    # A fresh worker reconstructs the exact winning curve, not a local guess.
    visual_runtime.clear_visual_cache()
    again = await visual_runtime.visual_position(**{**kwargs, 'timeline': revised, 'source_order': (0, 101)})
    assert again['progress_m'] == pytest.approx(delayed['progress_m'])
    assert again['revision'] == delayed['revision']
    metadata_only = deepcopy(revised)
    metadata_only[1]['source_note'] = 'same clocks, newer packet'
    kept = await visual_runtime.visual_position(**{**kwargs, 'timeline': metadata_only,
        'source_order': (0, 102)})
    assert kept['progress_m'] == pytest.approx(delayed['progress_m'])
    assert kept['visual_context']['active_spatial_strength'] == parameters['strength']
    at_stop = await visual_runtime.visual_position(**{**kwargs, 'timeline': revised,
        'source_order': (0, 103), 'now_s': 140})
    assert at_stop['progress_m'] == kwargs['path']['stop_progress'][-1] and at_stop['next_stop_eta_seconds'] == 0


@pytest.mark.asyncio
async def test_delay_never_allocates_to_already_passed_signal(runtime):
    kwargs, bundle, _ = runtime
    # Geometry is straight here, so no remaining turn can supply another prior.
    edges = bundle['infrastructure']['edges']
    edges[1]['from_point'] = [52.10, 11.603]
    edges[1]['to_point'] = [52.10, 11.606]
    bundle['infrastructure']['signals'] = [dict(progress_m=50, kinds=['RAIL_SIGNAL'],
        usable_for_motion=True, match_method='NODE_EXACT', signal_id='past')]
    first = await visual_runtime.visual_position(**kwargs)
    assert first['progress_m'] > 50
    revised = deepcopy(kwargs['timeline'])
    revised[1].update(predicted_arrival=140, predicted_departure=150)
    delayed = await visual_runtime.visual_position(**{**kwargs, 'timeline': revised, 'source_order': (0, 101)})
    assert delayed['progress_m'] == pytest.approx(first['progress_m'])
    state = next(iter(kwargs['state_collection'].rows.values()))
    assert 'profile_parameters' not in state['curve_override']


@pytest.mark.asyncio
async def test_bus_context_failure_hides_pin_instead_of_local_fallback(runtime, monkeypatch):
    kwargs, bundle, _ = runtime
    kwargs['mode'] = 'bus'
    bind_runtime_direction(kwargs,bundle)
    kwargs['region'].timezone = 'Europe/Berlin'
    monkeypatch.setattr(visual_context, 'traffic_snapshot_for_edges', AsyncMock(side_effect=ConnectionFailure('offline')))
    assert await visual_runtime.visual_position(**kwargs) is None


@pytest.mark.asyncio
async def test_context_race_uses_one_snapshot_and_scheduled_extended_service_hour(monkeypatch):
    from test_visual_progress import IDENTITY
    class UniqueState(MemoryState):
        async def insert_one(self, state):
            if state['_id'] in self.rows:
                raise DuplicateKeyError('race')
            await super().insert_one(state)

    entered = 0
    ready = asyncio.Event()
    async def lookup(edges, when, **kwargs):
        nonlocal entered
        entered += 1
        value = entered
        if entered == 2:
            ready.set()
        await ready.wait()
        assert when.isoformat() == '2026-11-03T01:00:00+01:00'
        return dict(provider='STATIC_PROFILE_V1', profile_versions=[str(value)], by_edge={})
    monkeypatch.setattr(visual_context, 'traffic_snapshot_for_edges', lookup)
    args = dict(identity={**IDENTITY, 'service_date': '2026-11-02'}, generation_id='g',
        timeline=[dict(scheduled_departure=90000, predicted_departure=91000), {}], progress=[0, 500],
        edges=[], region=SimpleNamespace(timezone='Europe/Berlin', region_id='r', network_id='n'),
        collection=UniqueState())
    a, b = await asyncio.gather(visual_context.shared_traffic_context(**args), visual_context.shared_traffic_context(**args))
    assert a == b
    assert entered == 2
    assert len(args['collection'].rows) == 1
