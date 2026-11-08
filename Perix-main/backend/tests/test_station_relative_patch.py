"""Pure synthetic waiting/coverage contracts, prepared but not executed.

The memory CAS below is not evidence of MongoDB or multi-process correctness.
"""
from copy import deepcopy
from types import SimpleNamespace

import pytest

from mobility.motion.visual_progress import build_visual_plan, sample_visual_plan, visual_preview, bound_visual_preview
from mobility.motion.visual_shared_state import resolve_shared_visual_plan


class MemoryCAS:
    def __init__(self):
        self.rows = {}

    async def find_one(self, query):
        return deepcopy(self.rows.get(query['_id']))

    async def insert_one(self, state):
        from pymongo.errors import DuplicateKeyError
        if state['_id'] in self.rows:
            raise DuplicateKeyError('synthetic collision')
        self.rows[state['_id']] = deepcopy(state)

    async def replace_one(self, query, state):
        row = self.rows.get(query['_id'])
        matched = bool(row and row['revision'] == query['revision'])
        if matched:
            self.rows[state['_id']] = deepcopy(state)
        return SimpleNamespace(matched_count=int(matched))

    async def update_one(self, query, update):
        row = self.rows.get(query['_id'])
        matched = bool(row and row['revision'] == query['revision'])
        if matched:
            row.update(deepcopy(update['$set']))
            row['revision'] += update['$inc']['revision']
        return SimpleNamespace(matched_count=int(matched))


def profile(start):
    return dict(start_m=start, end_m=start+100, duration_s=20, segments=[
        dict(t0=0, t1=10, p0=start, p1=start+50, v0=0, v1=10, state='MOVING'),
        dict(t0=10, t1=20, p0=start+50, p1=start+100, v0=10, v1=0, state='MOVING')])


def plan(c_delay=0, *, conditional=False, missing_next=False):
    timeline = [dict(stop_id='A', stop_sequence=1, predicted_arrival=90, predicted_departure=100),
                dict(stop_id='B', stop_sequence=2, predicted_arrival=120, predicted_departure=125),
                dict(stop_id='C', stop_sequence=3, predicted_arrival=145+c_delay, predicted_departure=155+c_delay)]
    for entry, (arrival, departure) in zip(timeline, [(90, 100), (120, 125), (145, 155)]):
        entry.update(scheduled_arrival=arrival, scheduled_departure=departure)
    if conditional:
        timeline[1]['release_condition'] = 'RELEVANT_SOURCE_UPDATE'
    result = build_visual_plan(identity=dict(region_id='r', network_id='n', version_id='v',
        service_date='2026-11-03', trip_id='trip', pattern_id='pattern', geometry_fingerprint='directed-geometry'),
        timeline=timeline, stop_progress=[0, 100, 200], profiles=[profile(0), None if missing_next else profile(100)])
    result.update(generation_id='generation', visual_rule_version='station-relative-v1',
        visual_parameters=dict(handover_min_ramp_s=2, relative_motion_rate_per_s=1,
                               initial_coverage_s=40, rolling_coverage_s=15))
    return result


@pytest.mark.asyncio
async def test_c_only_lateness_is_waited_at_b_without_delaying_a_to_b_or_double_charging():
    store = MemoryCAS()
    old = await resolve_shared_visual_plan(plan(), store, source_order=(0, 1), now_s=110)
    delayed_source = plan(30)
    source_before = deepcopy(delayed_source['timeline'])
    delayed = await resolve_shared_visual_plan(delayed_source, store, source_order=(0, 2), now_s=110)
    assert sample_visual_plan(delayed, 110)['progress_m'] == sample_visual_plan(old, 110)['progress_m']
    assert sample_visual_plan(delayed, 120)['progress_m'] == 100
    assert delayed['legs'][1]['departure_s'] == 155
    assert delayed['legs'][1]['arrival_s']-delayed['legs'][1]['departure_s'] == 20
    assert delayed['timeline'] == source_before == delayed_source['timeline']
    assert sample_visual_plan(delayed, 140)['state'] == 'VISUAL_STOP_ESTIMATE'
    assert sample_visual_plan(delayed, 140)['wait_state']['waited_s'] == 20
    for header in (3, 4, 5):
        repeated = await resolve_shared_visual_plan(delayed_source, store, source_order=(0, header), now_s=140)
        assert repeated['wait_state']['1']['modeled_departure_s'] == 155
        assert sample_visual_plan(repeated, 140)['wait_state']['waited_s'] == 20
    assert len(store.rows) == 1


@pytest.mark.asyncio
async def test_first_publication_already_containing_c_lateness_allocates_one_station_wait():
    store = MemoryCAS()
    accepted = await resolve_shared_visual_plan(plan(30), store, source_order=(0, 1), now_s=110)
    assert accepted['legs'][0]['arrival_s'] == 120
    assert accepted['legs'][1]['departure_s'] == 155
    assert sample_visual_plan(accepted, 150)['progress_m'] == 100
    assert sample_visual_plan(accepted, 156)['progress_m'] > 100
    assert sample_visual_plan(accepted, 175)['progress_m'] == 200


@pytest.mark.asyncio
async def test_known_departure_releases_but_header_only_update_does_not_release_conditional_wait():
    known_store, conditional_store = MemoryCAS(), MemoryCAS()
    known = await resolve_shared_visual_plan(plan(), known_store, source_order=(0, 1), now_s=122)
    assert sample_visual_plan(known, 126)['state'] == 'VISUAL_MOVING'
    source = plan(conditional=True)
    conditional = await resolve_shared_visual_plan(source, conditional_store, source_order=(0, 1), now_s=122)
    assert sample_visual_plan(conditional, 130)['state'] == 'VISUAL_STOP_ESTIMATE'
    same = await resolve_shared_visual_plan(source, conditional_store, source_order=(0, 2), now_s=130)
    assert same['wait_state']['1']['release_condition'] == 'RELEVANT_SOURCE_UPDATE'
    assert sample_visual_plan(same, 130)['progress_m'] == 100
    released = await resolve_shared_visual_plan(plan(5), conditional_store, source_order=(0, 3), now_s=130)
    assert sample_visual_plan(released, 130)['progress_m'] == 100
    assert sample_visual_plan(released, 131)['progress_m'] > 100


@pytest.mark.asyncio
async def test_visual_rule_version_namespaces_shared_anchors_not_geometry():
    store = MemoryCAS()
    original = plan()
    await resolve_shared_visual_plan(original, store, source_order=(0, 1), now_s=110)
    revised = deepcopy(original)
    revised['visual_rule_version'] = 'future-rule-for-test-only'
    await resolve_shared_visual_plan(revised, store, source_order=(0, 1), now_s=110)
    assert len(store.rows) == 2
    assert original['identity'] == revised['identity']
    assert original['generation_id'] == revised['generation_id']


def packet(source, now=110):
    return visual_preview(source, sample_visual_plan(source, now), now_s=now,
                          sampled_at_ms=100000, journey_id='dated-trip', horizon_s=45)


def test_long_preview_contains_actual_stops_and_directed_legs_not_only_a_later_expiry():
    source = plan()
    # Use the approved relative copy, not physical km/h relabeling.
    from mobility.motion.visual_curve_context import relative_profile
    for leg in source['legs']:
        leg['profile'] = relative_profile(leg['profile'], source['visual_parameters'])
    before = deepcopy(source)
    preview = packet(source)
    assert preview['valid_until_ms'] == 145000
    assert {p['stop_occurrence_index'] for p in preview['phases']} == {1, 2}
    assert any(p['state'] == 'VISUAL_STOP_ESTIMATE' for p in preview['phases'])
    assert preview['stop_progress_by_occurrence_m'] == [0, 100, 200]
    for phase in preview['phases']:
        index = phase['stop_occurrence_index']
        assert phase['stop_progress_m'] == source['stop_progress'][index]
        assert phase['start_progress_m'] <= phase['p0'] <= phase['p1'] <= phase['stop_progress_m']+1e-6
        dt = phase['t1']-phase['t0']
        assert phase['p1'] == pytest.approx(phase['p0']+phase['v0']*dt+phase['a']*dt*dt/2)
        if phase['state'] == 'VISUAL_STOP_ESTIMATE':
            assert phase['v0'] == phase['a'] == 0
    assert source == before
    modern = bound_visual_preview(preview, 45, occurrence_aware=True)
    legacy = bound_visual_preview(preview, 45)
    assert modern['valid_until_ms'] == 145000
    assert legacy['valid_until_ms'] == 110000
    assert all(p['stop_occurrence_index'] == 1 for p in legacy['phases'])


def test_unknown_next_leg_does_not_authorize_a_station_or_bridge_geometry_gap():
    preview = packet(plan(missing_next=True))
    assert preview['valid_until_ms'] == preview['effective_arrival_at_ms'] == 110000
    assert all(p['stop_occurrence_index'] == 1 and p['p1'] <= 100 for p in preview['phases'])


def test_conditional_wait_preview_does_not_outlive_its_source_trip_authority():
    source = plan(conditional=True)
    source['wait_state'] = {'1': dict(release_condition='RELEVANT_SOURCE_UPDATE', modeled_departure_s=125,
                                   wait_started_s=120, relevant_source_revision='synthetic')}
    preview = packet(source, now=130)
    assert preview['coverage_end_reason'] == 'SOURCE_TRIP_END'
    assert preview['valid_until_ms'] == 125000  # 25 remaining seconds at service clock 130.


def test_relative_envelope_is_continuous_includes_level_four_and_leaves_physics_untouched():
    from mobility.motion.visual_curve_context import relative_profile
    physical = profile(0)
    before = deepcopy(physical)
    relative = relative_profile(physical, dict(relative_motion_rate_per_s=1))
    assert physical == before
    assert relative['relative_motion_levels'] == [1, 2, 3, 4, 5, 6]
    assert relative['segments'][0]['v0'] == relative['segments'][-1]['v1'] == 0
    assert any(min(s['v0'], s['v1']) <= 4 <= max(s['v0'], s['v1']) for s in relative['segments'])
    for a, b in zip(relative['segments'], relative['segments'][1:]):
        assert a['v1'] == b['v0']
        assert a['p1'] == b['p0']
    for segment in relative['segments']:
        assert abs(segment['v1']-segment['v0'])/(segment['t1']-segment['t0']) <= 1+1e-9
