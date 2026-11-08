"""Pure trial contracts. Synthetic inputs only; no providers/DB/runtime writes."""
from copy import deepcopy

import pytest

from tools.infranode_trial import evaluate_capture
from tools.capture_infranode_trial import capture_one, MAX_BYTES
import httpx

NOW = 1793870400  # Explicit controlled clock, not live provider evidence.
SHA = 'a'*64


def fixture():
    network = dict(region_id='magdeburg', network_id='de-magdeburg-mvb', version_id='v5',
        service_date='2026-11-05', timezone='Europe/Berlin', static_input={'sha256': SHA},
        routes=[dict(route_number='5', mode='tram', trips=[dict(trip_id='t1', gtfs_route_id='r5',
            start='12:00', direction_id=0, stop_ids=['A', 'B', 'C'], stop_sequences=[1, 2, 3],
            source_time_seconds_preserved=True, stop_times_sequence=[
                dict(stop_id='A', stop_sequence=1, departure_time='12:00:17'),
                dict(stop_id='B', stop_sequence=2, departure_time='12:02:00'),
                dict(stop_id='C', stop_sequence=3, departure_time='12:04:00')])])])
    bindings = {k: network[k] for k in ('region_id', 'network_id', 'version_id', 'service_date')}
    bindings.update(trip_namespace='FOREIGN', stops=[dict(source_stop_id='x'+s, target_stop_id=s,
        status='REVIEWED') for s in ('A', 'B', 'C')],
        routes=[dict(source_route_id='xroute', target_route_id='r5', status='REVIEWED')],
        trips=[dict(source_trip_id='xtrip', target_trip_id='t1', status='REVIEWED')])
    row = dict(trip_id='xtrip', route_id='xroute', route_short_name='5', stop_sequence=2,
        start_date='20261105', start_time='12:00:17', trip_schedule_relationship='SCHEDULED',
        stop_relationship='SCHEDULED', arrival_delay_seconds=60, departure_delay_seconds=80)
    envelope = dict(data=dict(city_slug='magdeburg', source='gtfs_rt', observed_at=NOW-10,
        retrieved_at=NOW, payload=dict(kind='transit_departure', stop_id='xB', departures=[row])),
        meta=dict(source_status='ok', as_of=NOW-10, feed_timestamp=NOW-10))
    return network, bindings, [envelope]


def run(values=None, reference=None):
    return evaluate_capture(*(values or fixture()), now_epoch=NOW, reference=reference)


def record(result):
    return result['records'][0]


def test_trial_preserves_inputs_and_distinct_events_without_publishing_anything():
    values = fixture(); before = deepcopy(values)
    result = run(values)
    assert result['counts']['accepted_for_comparison'] == 1
    assert record(result)['event_delays_seconds'] == {'arrival': 60, 'departure': 80}
    assert record(result)['identity_basis'] == 'REVIEWED_DATED_CROSSWALK'
    assert result['read_only'] and not result['production_ingestion_authorized']
    assert values == before


def test_actual_departure_response_shape_is_not_promoted_by_current_receipt():
    network, bindings, captures = fixture()
    bindings['trips'] = []
    captures[0]['data']['observed_at'] = None; captures[0]['meta']['as_of'] = None
    captures[0]['meta'].pop('feed_timestamp')
    captures[0]['data']['payload']['departures'] = [dict(trip_id='3467234366', route_id='xroute',
        route_short_name='5', stop_sequence=2, delay_s=-30, departure_time=0)]
    result = run((network, bindings, captures))
    assert result['counts']['accepted_for_comparison'] == 0
    assert {'SOURCE_CLOCK_MISSING', 'SERVICE_DATE_MISSING_OR_INVALID', 'TRIP_IDENTITY_UNRESOLVED',
            'TRIP_RELATIONSHIP_UNAVAILABLE_OR_UNSUPPORTED',
            'STOP_RELATIONSHIP_UNAVAILABLE_OR_UNSUPPORTED'} <= set(record(result)['rejection_reasons'])
    assert record(result)['source_observation_epoch'] is None


@pytest.mark.parametrize('stamp,reason', [(NOW-181, 'SOURCE_CLOCK_STALE'),
    (NOW+121, 'SOURCE_CLOCK_FUTURE'), ('2026-11-05T12:00:00', 'SOURCE_CLOCK_INVALID'),
    (True, 'SOURCE_CLOCK_INVALID')])
def test_source_clock_never_uses_receipt_or_naive_timestamp(stamp, reason):
    values = fixture(); values[2][0]['meta']['as_of'] = stamp
    values[2][0]['data']['observed_at'] = stamp
    assert reason in record(run(values))['rejection_reasons']


def test_conflicting_source_clocks_fail_closed():
    values = fixture(); values[2][0]['meta']['as_of'] = NOW-20
    assert 'SOURCE_CLOCK_CONFLICT' in record(run(values))['rejection_reasons']


@pytest.mark.parametrize('field,value', [('version_id','old'), ('service_date','2026-11-04'),
    ('region_id','other'), ('network_id','other')])
def test_reviewed_bindings_are_not_reused_across_scope(field, value):
    values = fixture(); values[1][field] = value
    assert 'BINDING_SCOPE_MISMATCH' in record(run(values))['rejection_reasons']


def test_wrong_source_date_is_not_assigned_to_current_day():
    values = fixture(); values[2][0]['data']['payload']['departures'][0]['start_date'] = '20261104'
    assert 'WRONG_SERVICE_DATE' in record(run(values))['rejection_reasons']


def test_pre_activation_source_observation_is_rejected():
    values = fixture(); values[0]['activated_at'] = NOW-5
    assert 'PRE_ACTIVATION_SNAPSHOT' in record(run(values))['rejection_reasons']


def test_same_numeric_id_in_a_foreign_namespace_is_not_identity_evidence():
    values = fixture(); values[1]['trips'] = []
    values[2][0]['data']['payload']['departures'][0]['trip_id'] = 't1'
    assert 'TRIP_IDENTITY_UNRESOLVED' in record(run(values))['rejection_reasons']


def test_verified_same_archive_ids_reuse_the_existing_identity_matcher():
    network, bindings, captures = fixture()
    bindings.update(trip_namespace='SAME_GTFS_ARCHIVE', source_static_input_sha256=SHA, trips=[])
    captures[0]['data']['payload']['stop_id'] = 'B'
    row = captures[0]['data']['payload']['departures'][0]
    row.update(trip_id='t1', route_id='r5')
    assert record(run((network,bindings,captures)))['identity_basis'] == 'SAME_VERIFIED_GTFS_ARCHIVE'
    bindings['source_static_input_sha256'] = 'b'*64
    assert not record(run((network,bindings,captures)))['accepted_for_comparison']


def test_complete_dated_second_preserved_signature_can_match_without_trip_crosswalk():
    values = fixture(); values[1]['trips'] = []
    row = values[2][0]['data']['payload']['departures'][0]
    row.update(stops_complete=True, stop_time_updates=[dict(stop_id='x'+s,stop_sequence=i)
               for i,s in enumerate(('A','B','C'),1)])
    assert record(run(values))['identity_basis'] == 'EXACT_DATED_FULL_SIGNATURE'
    assert record(run(values))['accepted_for_comparison']
    # Source first-stop seconds, unlike legacy trip.start, are identity evidence.
    row['start_time'] = '12:00:18'
    assert not record(run(values))['accepted_for_comparison']


@pytest.mark.parametrize('change', ['incomplete', 'reverse', 'unpreserved_seconds', 'minute_only', 'duplicate'])
def test_incomplete_or_ambiguous_signature_is_never_nearest_time_matching(change):
    values = fixture(); values[1]['trips'] = []
    row = values[2][0]['data']['payload']['departures'][0]
    row.update(stops_complete=True,stop_time_updates=[dict(stop_id='x'+s,stop_sequence=i)
        for i,s in enumerate(('A','B','C'),1)])
    if change == 'incomplete': row['stops_complete'] = False
    if change == 'reverse': row['stop_time_updates'].reverse()
    if change == 'unpreserved_seconds': values[0]['routes'][0]['trips'][0]['source_time_seconds_preserved'] = False
    if change == 'minute_only': row['start_time'] = '12:00'
    if change == 'duplicate':
        other = deepcopy(values[0]['routes'][0]['trips'][0]); other['trip_id'] = 't2'
        values[0]['routes'][0]['trips'].append(other)
    assert not record(run(values))['accepted_for_comparison']


def test_conflicting_crosswalks_and_platforms_are_rejected():
    values = fixture(); values[1]['trips'].append(dict(source_trip_id='xtrip',target_trip_id='t2',status='REVIEWED'))
    assert 'TRIP_CROSSWALK_AMBIGUOUS' in record(run(values))['rejection_reasons']
    values = fixture(); values[1]['stops'].append(dict(source_stop_id='xB',target_stop_id='C',status='REVIEWED'))
    assert 'PLATFORM_BINDING_AMBIGUOUS' in record(run(values))['rejection_reasons']


@pytest.mark.parametrize('change', ['wrong_line', 'wrong_sequence', 'bool_sequence', 'wrong_direction', 'wrong_route'])
def test_crosswalk_never_overrides_contradictory_source_fields(change):
    values = fixture(); row = values[2][0]['data']['payload']['departures'][0]
    if change == 'wrong_line': row['route_short_name'] = '9'
    if change == 'wrong_sequence': row['stop_sequence'] = 3
    if change == 'bool_sequence': row['stop_sequence'] = True
    if change == 'wrong_direction': row['direction_id'] = 1
    if change == 'wrong_route': row['route_id'] = 'other'
    assert not record(run(values))['accepted_for_comparison']


@pytest.mark.parametrize('trip_rel,stop_rel', [('CANCELED','SCHEDULED'),('DELETED','SCHEDULED'),
    ('SCHEDULED','SKIPPED'),('SCHEDULED','NO_DATA')])
def test_operational_exceptions_are_preserved_not_turned_into_timed_release(trip_rel,stop_rel):
    values = fixture(); row = values[2][0]['data']['payload']['departures'][0]
    row.update(trip_schedule_relationship=trip_rel,stop_relationship=stop_rel)
    result = record(run(values))
    assert result['accepted_for_comparison']
    assert result['event_delays_seconds'] == {}
    assert result['trip_schedule_relationship'] == trip_rel and result['stop_relationship'] == stop_rel


def test_only_accepted_exact_occurrences_compare_with_fresh_insa_reference():
    ref = dict(source='INSA',target_trip_id='t1',target_stop_id='B',stop_sequence=2,
        region_id='magdeburg',network_id='de-magdeburg-mvb',network_version_id='v5',
        service_date='2026-11-05',captured_at=NOW-5,arrival_delay_seconds=55,departure_delay_seconds=75)
    assert record(run(reference=[ref]))['insa_comparison']['delay_difference_seconds'] == {'arrival':5,'departure':5}
    ref['captured_at'] = NOW-31
    assert record(run(reference=[ref]))['insa_comparison']['status'] == 'STALE_OR_INVALID'
    ref['captured_at'] = NOW-5; ref['target_trip_id'] = 'other'
    assert record(run(reference=[ref]))['insa_comparison']['status'] == 'MISSING'


def test_empty_feed_or_disabled_response_does_not_cancel_any_trip():
    network, bindings, _ = fixture()
    result = run((network, bindings, [dict(data=None,meta={'source_status':'no_data'})]))
    assert result['counts']['records'] == 0 and result['records'] == []
    assert 'SOURCE_STATUS_NO_DATA' in result['envelopes'][0]['issues']


def test_conflicting_explicit_dates_are_not_resolved_by_current_wall_clock():
    values = fixture()
    values[2][0]['data']['payload']['departures'][0]['service_date'] = '2026-11-04'
    assert 'SERVICE_DATE_MISSING_OR_INVALID' in record(run(values))['rejection_reasons']


def test_repeated_stop_visits_do_not_compare_with_an_earlier_occurrence():
    values = fixture(); trip = values[0]['routes'][0]['trips'][0]
    trip['stop_ids'] = ['A','B','A']
    values[2][0]['data']['payload']['stop_id'] = 'xA'
    values[2][0]['data']['payload']['departures'][0]['stop_sequence'] = 3
    ref = dict(source='INSA',target_trip_id='t1',target_stop_id='A',stop_sequence=1,
        region_id='magdeburg',network_id='de-magdeburg-mvb',network_version_id='v5',
        service_date='2026-11-05',captured_at=NOW,departure_delay_seconds=80)
    result = record(run(values,reference=[ref]))
    assert result['accepted_for_comparison'] and result['stop_sequence'] == 3
    assert result['insa_comparison']['status'] == 'MISSING'


def test_city_label_and_explicit_event_types_are_required():
    values = fixture(); values[2][0]['data']['city_slug'] = 'koeln'
    assert 'SOURCE_SCOPE_INVALID' in record(run(values))['rejection_reasons']
    values = fixture(); row = values[2][0]['data']['payload']['departures'][0]
    row['departure_delay_seconds'] = True
    assert 'EVENT_DELAY_INVALID' in record(run(values))['rejection_reasons']


def test_http_error_with_a_plausible_payload_is_not_accepted():
    network, bindings, captures = fixture()
    result = run((network,bindings,[{'http_status':503,'response':captures[0]}]))
    assert 'HTTP_RESPONSE_NOT_OK' in record(result)['rejection_reasons']


def test_capture_uses_fixed_host_and_preserves_status_without_a_real_request():
    def handler(request):
        assert request.url.host == 'infranode.dev'
        assert request.url.params['stop_id'] == 'de:15003:7330::03'
        return httpx.Response(200,json={'data':None,'meta':{'source_status':'no_data'}})
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        value = capture_one(client,'de:15003:7330::03')
    assert value['http_status'] == 200 and value['response']['data'] is None
    assert value['captured_at'] and value['body_sha256']


@pytest.mark.parametrize('stop', ['https://private', 'de:11000:123', 'de:15003:7330?other=1'])
def test_capture_rejects_foreign_or_injected_stop_identifiers(stop):
    with httpx.Client(transport=httpx.MockTransport(lambda r: pytest.fail('Must not request'))) as client:
        with pytest.raises(ValueError): capture_one(client,stop)


def test_capture_body_limit_and_invalid_json_do_not_create_updates():
    for body in (b'x'*(MAX_BYTES+1), b'{"meta":NaN}'):
        with httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200,content=body))) as client:
            value = capture_one(client,'de:15003:7330::03')
        assert value['response']['meta']['source_status'] == 'capture_failed'


def test_generic_provider_observation_is_not_relabelled_as_a_feed_generation():
    values = fixture(); values[2][0]['meta'].pop('feed_timestamp')
    result = record(run(values))
    assert result['source_observation_epoch'] == NOW-10
    assert result['feed_generation_epoch'] is None
    assert 'FEED_GENERATION_MISSING' in result['rejection_reasons']
    assert not result['accepted_for_comparison']


@pytest.mark.parametrize('clock,reason', [(NOW-181,'FEED_GENERATION_STALE'),
    (NOW+121,'FEED_GENERATION_FUTURE'),(True,'FEED_GENERATION_INVALID_OR_CONFLICTING')])
def test_feed_clock_cannot_be_replaced_by_a_current_observation(clock,reason):
    values = fixture(); values[2][0]['meta']['feed_timestamp'] = clock
    assert reason in record(run(values))['rejection_reasons']


def test_known_old_trip_timestamp_is_not_refreshed_by_the_feed():
    values = fixture()
    values[2][0]['data']['payload']['departures'][0]['trip_update_timestamp'] = NOW-181
    assert 'TRIP_UPDATE_CLOCK_INVALID_OR_STALE' in record(run(values))['rejection_reasons']


@pytest.mark.parametrize('version,duplicate', [('old',False),('v5',True)])
def test_reference_version_and_unique_record_are_required(version,duplicate):
    ref = dict(source='INSA',region_id='magdeburg',network_id='de-magdeburg-mvb',
        network_version_id=version,target_trip_id='t1',target_stop_id='B',stop_sequence=2,
        service_date='2026-11-05',captured_at=NOW-5,departure_delay_seconds=80)
    references = [ref,deepcopy(ref)] if duplicate else [ref]
    assert record(run(reference=references))['insa_comparison']['status'] == ('AMBIGUOUS' if duplicate else 'MISSING')


def test_explicit_absolute_events_compare_without_a_new_prediction_engine():
    values = fixture(); row = values[2][0]['data']['payload']['departures'][0]
    row.pop('arrival_delay_seconds'); row.pop('departure_delay_seconds')
    row.update(arrival_time=NOW+60,departure_time=NOW+80)
    ref = dict(source='INSA',region_id='magdeburg',network_id='de-magdeburg-mvb',
        network_version_id='v5',target_trip_id='t1',target_stop_id='B',stop_sequence=2,
        service_date='2026-11-05',captured_at=NOW,arrival_epoch=NOW+60,departure_epoch=NOW+79)
    result = record(run(values,reference=[ref]))
    assert result['accepted_for_comparison'] and result['event_delays_seconds'] == {}
    assert result['event_times_epoch'] == {'arrival':NOW+60,'departure':NOW+80}
    assert result['insa_comparison']['time_difference_seconds'] == {'arrival':0,'departure':1}


def test_absolute_eta_is_not_a_source_freshness_clock():
    values = fixture(); row = values[2][0]['data']['payload']['departures'][0]
    row.update(arrival_time=NOW+60,departure_time=NOW+80)
    values[2][0]['meta']['as_of'] = None; values[2][0]['data']['observed_at'] = None
    values[2][0]['meta'].pop('feed_timestamp')
    result = record(run(values))
    assert not result['accepted_for_comparison'] and result['source_observation_epoch'] is None


def test_trip_response_preserves_each_occurrence_and_raw_stop_relationship():
    network, bindings, captures = fixture(); payload = captures[0]['data']['payload']
    row = payload['departures'][0]
    captures[0]['data']['payload'] = {**row,'kind':'transit_trip',
        'stop_time_updates':[dict(stop_id='x'+s,stop_sequence=i,arrival_delay=10*i,
            departure_delay=10*i+2,schedule_relationship=0) for i,s in enumerate(('A','B','C'),1)]}
    result = run((network,bindings,captures))
    assert result['counts']['accepted_for_comparison'] == 3
    assert [r['stop_sequence'] for r in result['records']] == [1,2,3]
    assert result['records'][1]['event_delays_seconds'] == {'arrival':20,'departure':22}
    # No delay supplied at A: trip-level arrival/departure values cannot fill it.
    captures[0]['data']['payload']['stop_time_updates'][0].pop('arrival_delay')
    captures[0]['data']['payload']['stop_time_updates'][0].pop('departure_delay')
    result = run((network,bindings,captures))
    assert not result['records'][0]['accepted_for_comparison']
    assert result['records'][0]['event_delays_seconds'] == {}


def test_raw_skip_in_a_trip_response_does_not_inherit_scheduled_stop_state():
    network, bindings, captures = fixture(); row = captures[0]['data']['payload']['departures'][0]
    captures[0]['data']['payload'] = {**row,'kind':'transit_trip','stop_time_updates':[
        dict(stop_id='xB',stop_sequence=2,schedule_relationship=1,departure_time=NOW+80)]}
    result = record(run((network,bindings,captures)))
    assert result['accepted_for_comparison'] and result['stop_relationship'] == 'SKIPPED'
    assert result['event_times_epoch'] == {} and result['event_delays_seconds'] == {}


@pytest.mark.parametrize('payload,reason', [(None,'PAYLOAD_SCHEMA_UNSUPPORTED'),
    ({'kind':'other'},'PAYLOAD_SCHEMA_UNSUPPORTED'),
    ({'kind':'transit_departure','departures':None},'PAYLOAD_RECORDS_INVALID')])
def test_unsupported_payload_is_explicit_not_a_silent_empty_success(payload,reason):
    values = fixture(); values[2][0]['data']['payload'] = payload
    result = run(values)
    assert result['counts']['accepted_for_comparison'] == 0
    assert reason in result['envelopes'][0]['issues']
