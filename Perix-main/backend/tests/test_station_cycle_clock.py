"""Opt-in optical clocks, immutable provider events and rolling occurrences."""
from copy import deepcopy
import io
import zipfile

import pytest

from mobility.motion.visual_progress import (build_visual_plan, apply_station_cycles, sample_visual_plan,
    visual_preview, station_cycle_metadata)
from mobility.motion.visual_shared_state import resolve_shared_visual_plan
from mobility.motion.visual_curve_context import relative_profile
from mobility.motion.config import motion_config_for, visual_scale_parameters
from test_station_relative_patch import MemoryCAS, profile
from test_visual_progress import IDENTITY


def plan(times=(100, 200, 300, 400), *, repeated=False, explicit_dwell=0, conditional=False, mode='bus'):
    timeline = [dict(stop_id=('A' if repeated and i == len(times)-1 else chr(65+i)), stop_sequence=i+1,
        predicted_arrival=t, predicted_departure=t+explicit_dwell,
        scheduled_arrival=t, scheduled_departure=t+explicit_dwell) for i,t in enumerate(times)]
    if conditional:
        timeline[1]['release_condition'] = 'RELEVANT_SOURCE_UPDATE'
    profiles = [relative_profile(profile(i*100), {'relative_motion_rate_per_s':1}) for i in range(len(times)-1)]
    result = build_visual_plan(identity=IDENTITY,timeline=timeline,stop_progress=[i*100 for i in range(len(times))],profiles=profiles)
    result['visual_rule_version'] = 'station-cycle-v2'
    result['visual_parameters'] = visual_scale_parameters({**motion_config_for(mode)['visual'],'visual_rule_version':'station-cycle-v2'})
    return result


def packet(p, now):
    return visual_preview(p, sample_visual_plan(p,now), now_s=now, sampled_at_ms=100000,
                          journey_id='synthetic',horizon_s=45)


@pytest.mark.parametrize('mode', ['bus','tram'])
def test_parked_at_30_then_depart_at_zero_without_changing_provider_eta(mode):
    source = plan(mode=mode); before = deepcopy(source)
    optical = apply_station_cycles(source)
    assert source == before
    assert optical['timeline'] == source['timeline']
    assert optical['visual_parameters']['station_stop_lead_s'] == 30
    assert optical['station_cycles'][1]['approach_started_s'] == 150
    assert optical['station_cycles'][1]['modeled_arrival_s'] == 170
    assert optical['station_cycles'][1]['modeled_departure_s'] == 200
    assert sample_visual_plan(optical,169)['state'] == 'VISUAL_MOVING'
    stopped = sample_visual_plan(optical,170)
    assert stopped['state'] == 'VISUAL_STOP_ESTIMATE' and stopped['progress_m'] == 100
    assert stopped['next_stop_eta_seconds'] == 30  # Provider arrival remains 200.
    for now in (170,180,190,199.99):
        waiting = sample_visual_plan(optical,now)
        assert waiting['state'] == 'VISUAL_STOP_ESTIMATE' and waiting['progress_m'] == 100
    assert sample_visual_plan(optical,199)['progress_m'] == 100
    departure = sample_visual_plan(optical,200)
    assert departure['state'] == 'VISUAL_MOVING' and departure['next_timeline_index'] == 2
    assert departure['progress_m'] == 100
    assert sample_visual_plan(optical,201)['progress_m'] > 100


def test_longer_explicit_provider_dwell_is_not_shortened_to_thirty_seconds():
    optical = apply_station_cycles(plan(explicit_dwell=45))
    cycle = optical['station_cycles'][1]
    assert cycle['modeled_arrival_s'] == 200 and cycle['modeled_departure_s'] == 245
    assert sample_visual_plan(optical,215)['state'] == 'VISUAL_STOP_ESTIMATE'
    assert optical['timeline'][1]['predicted_arrival'] == 200


def test_shorter_provider_dwell_keeps_source_times_but_parks_the_optical_marker_at_thirty():
    source = plan(explicit_dwell=20)
    optical = apply_station_cycles(source)
    assert optical['station_cycles'][1]['modeled_arrival_s'] == 190
    assert optical['station_cycles'][1]['modeled_departure_s'] == 220
    assert optical['timeline'][1]['predicted_arrival'] == 200
    assert optical['timeline'] == source['timeline']


def test_short_source_leg_is_marked_limited_not_made_negative_to_force_dwell():
    optical = apply_station_cycles(plan((100,105,110)))
    assert optical['station_cycles'][1]['cycle_limited']
    assert optical['station_cycles'][1]['modeled_arrival_s'] == 105
    assert optical['legs'][0]['arrival_s'] > optical['legs'][0]['departure_s']
    assert optical['timeline'][1]['predicted_departure'] == 105


def test_rolling_three_occurrences_do_not_reset_clock_progress_or_loop_identity():
    optical = apply_station_cycles(plan((100,200,300,400,500),repeated=True))
    a,b,c = packet(optical,169),packet(optical,200),packet(optical,300)
    assert [s['stop_occurrence_index'] for s in a['station_window']] == [0,1,2]
    assert [s['stop_occurrence_index'] for s in b['station_window']] == [1,2,3]
    assert [s['stop_occurrence_index'] for s in c['station_window']] == [2,3,4]
    assert c['station_window'][-1]['stop_id'] == 'A'
    assert c['station_window'][-1]['stop_occurrence_index'] != a['station_window'][0]['stop_occurrence_index']
    assert sample_visual_plan(optical,301)['progress_m'] > sample_visual_plan(optical,201)['progress_m']
    end = packet(optical,495)
    assert [s['stop_occurrence_index'] for s in end['station_window']] == [4]
    assert end['coverage_end_reason'] == 'SOURCE_TRIP_END'


def test_three_is_not_a_preview_cap_when_further_authorized_phases_fit_the_window():
    optical = apply_station_cycles(plan((100,115,130,145,160,175)))
    preview = packet(optical,110)
    assert len(preview['station_window']) == 3
    assert max(p['stop_occurrence_index'] for p in preview['phases']) >= 4
    assert preview['valid_until_ms'] == 145000


@pytest.mark.asyncio
async def test_c_only_delay_keeps_b_arrival_and_is_not_charged_twice():
    store = MemoryCAS()
    old = await resolve_shared_visual_plan(plan(),store,source_order=(0,1),now_s=150)
    changed = plan((100,200,330,430))
    accepted = await resolve_shared_visual_plan(changed,store,source_order=(0,2),now_s=150)
    assert accepted['station_cycles'][1]['modeled_arrival_s'] == old['station_cycles'][1]['modeled_arrival_s'] == 170
    assert accepted['station_cycles'][1]['modeled_departure_s'] == 230
    assert accepted['timeline'][1]['predicted_departure'] == 200
    assert accepted['legs'][1]['arrival_s']-accepted['legs'][1]['departure_s'] == 70
    assert sample_visual_plan(accepted,190)['progress_m'] == 100


@pytest.mark.asyncio
async def test_later_b_forecast_keeps_an_already_displayed_platform_anchor_across_cold_read():
    store = MemoryCAS()
    old = await resolve_shared_visual_plan(plan(),store,source_order=(0,1),now_s=195)
    assert sample_visual_plan(old,195)['state'] == 'VISUAL_STOP_ESTIMATE'
    later = plan((100,230,330,430))
    accepted = await resolve_shared_visual_plan(later,store,source_order=(0,2),now_s=195)
    assert sample_visual_plan(accepted,195)['progress_m'] == 100
    assert accepted['station_cycles'][1]['modeled_arrival_s'] == 170
    assert accepted['station_cycles'][1]['modeled_departure_s'] == 230
    cold = await resolve_shared_visual_plan(plan((100,230,330,430)),store,source_order=(0,3),now_s=196)
    assert sample_visual_plan(cold,196)['progress_m'] == 100
    assert len(store.rows) == 1


@pytest.mark.asyncio
async def test_conditional_departure_never_unlocks_from_zero_or_a_new_header_alone():
    store = MemoryCAS()
    accepted = await resolve_shared_visual_plan(plan(conditional=True),store,source_order=(0,1),now_s=195)
    again = await resolve_shared_visual_plan(plan(conditional=True),store,source_order=(0,2),now_s=210)
    assert sample_visual_plan(again,210)['state'] == 'VISUAL_STOP_ESTIMATE'
    clock = station_cycle_metadata(again,1,210,100000)
    assert clock['countdown_target_at_ms'] is None
    assert clock['countdown_event'] == 'WAITING_FOR_SOURCE_UPDATE'


def test_origin_early_dwell_is_opt_in_not_a_change_to_source_active_ownership():
    from routes.mobility import _select_visual_run_trip
    route = dict(stops=[dict(stop_id='A'),dict(stop_id='B')])
    trip = dict(trip_id='t',stop_ids=['A','B'],stop_sequences=[1,2],stop_times_sequence=[
        dict(stop_id='A',stop_sequence=1,arrival_time='00:01:40',departure_time='00:01:40'),
        dict(stop_id='B',stop_sequence=2,arrival_time='00:03:20',departure_time='00:03:20')])
    run = dict(trips=[dict(trip=trip,start=100,end=200)])
    assert _select_visual_run_trip(route,run,{},70)[0] is None
    assert _select_visual_run_trip(route,run,{},69,'station-cycle-v2')[0] is None
    selected, reason = _select_visual_run_trip(route,run,{},70,'station-cycle-v2')
    assert selected is not None and reason == 'MODELED_ORIGIN_DWELL'


@pytest.mark.asyncio
async def test_ten_and_thirty_second_policies_cannot_share_cached_anchors_or_revisions():
    store = MemoryCAS()
    legacy = plan()
    legacy['visual_parameters'].update(station_stop_lead_s=10.0,station_approach_lead_s=30.0)
    before = await resolve_shared_visual_plan(legacy,store,source_order=(0,1),now_s=175)
    current = await resolve_shared_visual_plan(plan(),store,source_order=(0,1),now_s=175)
    assert before is not None and current is not None
    assert sample_visual_plan(before,175)['state'] == 'VISUAL_MOVING'
    assert sample_visual_plan(current,175)['state'] == 'VISUAL_STOP_ESTIMATE'
    assert before['revision'] != current['revision']
    assert len(store.rows) == 2
    cold = await resolve_shared_visual_plan(plan(),store,source_order=(0,2),now_s=180)
    assert sample_visual_plan(cold,180)['progress_m'] == 100
    assert cold['station_cycles'][1]['modeled_arrival_s'] == 170


def test_preview_is_already_prepared_across_parking_and_departure_boundaries():
    optical = apply_station_cycles(plan())
    preview = packet(optical,169)
    assert preview is not None
    at_stop = [p for p in preview['phases'] if p['state'] == 'VISUAL_STOP_ESTIMATE']
    assert at_stop and at_stop[0]['t0'] == pytest.approx(1)
    assert at_stop[0]['t1']-at_stop[0]['t0'] == pytest.approx(30)
    assert any(p['stop_occurrence_index'] == 2 and p['state'] == 'VISUAL_MOVING' for p in preview['phases'])
    assert preview['visual_parameters']['station_stop_lead_s'] == 30


def test_source_seconds_are_preserved_while_legacy_fields_stay_hhmm():
    from utils.gtfs import parse_gtfs_zip
    from routes.mobility import _predicted_stop_timeline
    files = {
        'agency.txt':'agency_id,agency_name\np,Magdeburger\n',
        'calendar.txt':'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\ns,1,1,1,1,1,1,1,20261101,20261130\n',
        'routes.txt':'route_id,agency_id,route_short_name,route_type\nr,p,9,0\n',
        'trips.txt':'route_id,service_id,trip_id\nr,s,t\n',
        'stops.txt':'stop_id,stop_name,stop_lat,stop_lon\nA,A,52.1,11.6\nB,B,52.11,11.61\n',
        'stop_times.txt':'trip_id,stop_sequence,stop_id,arrival_time,departure_time\nt,1,A,24:01:17,24:01:29\nt,2,B,24:03:42,24:03:55\n'}
    data = io.BytesIO()
    with zipfile.ZipFile(data,'w') as archive:
        for name,text in files.items(): archive.writestr(name,text)
    route = parse_gtfs_zip(data.getvalue(),'2026-11-04',agency_regex='Magdeburger')['routes'][0]
    trip = route['trips'][0]
    assert trip['start'] == '24:01' and trip['stop_times']['A'] == '24:01'
    assert trip['stop_times_sequence'][0]['arrival_time'] == '24:01:17'
    assert trip['source_time_seconds_preserved'] is True
    timeline = _predicted_stop_timeline(route,trip,None)
    assert timeline[0]['predicted_arrival'] == 86400+77
    assert timeline[1]['predicted_departure'] == 86400+235
