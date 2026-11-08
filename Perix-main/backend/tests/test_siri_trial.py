"""SIRI trial fixtures, no HTTP/Mongo, no clock/date/sequence guesses."""
from copy import deepcopy
from datetime import datetime,timezone
import pytest

from tools.siri_trial import parse_siri,match_snapshot,compare_insa,hafas_epoch,normalize_hafas_board

NOW=datetime(2026,11,5,0,1,tzinfo=timezone.utc).timestamp()


def fixture(seconds=True):
    raw=b'''<Siri xmlns="http://www.siri.org.uk/siri"><ServiceDelivery>
    <ResponseTimestamp>2026-11-05T00:00:50Z</ResponseTimestamp><ProducerRef>NASA</ProducerRef>
    <EstimatedTimetableDelivery><EstimatedJourneyVersionFrame><RecordedAtTime>2026-11-05T00:00:50Z</RecordedAtTime>
    <EstimatedVehicleJourney><RecordedAtTime>2026-11-05T00:00:40Z</RecordedAtTime><OperatorRef>MVB</OperatorRef>
    <LineRef>de:nasa:15003_x124_Strab_x124_N2</LineRef><PublishedLineName>N2</PublishedLineName><DirectionName>South</DirectionName>
    <VehicleJourneyRef>source-1</VehicleJourneyRef><FramedVehicleJourneyRef><DataFrameRef>2026-11-04</DataFrameRef>
    <DatedVehicleJourneyRef>source-day-1</DatedVehicleJourneyRef></FramedVehicleJourneyRef><Monitored>true</Monitored>
    <RecordedCalls><RecordedCall><StopPointRef>de:15003:1::1</StopPointRef><VisitNumber>100</VisitNumber>
    <AimedDepartureTime>2026-11-04T23:59:00Z</AimedDepartureTime></RecordedCall></RecordedCalls>
    <EstimatedCalls><EstimatedCall><StopPointRef>de:15003:2::1</StopPointRef><VisitNumber>100</VisitNumber>
    <AimedDepartureTime>2026-11-05T00:03:00Z</AimedDepartureTime><ExpectedDepartureTime>2026-11-05T00:03:29Z</ExpectedDepartureTime>
    </EstimatedCall></EstimatedCalls><IsCompleteStopSequence>true</IsCompleteStopSequence>
    </EstimatedVehicleJourney></EstimatedJourneyVersionFrame></EstimatedTimetableDelivery></ServiceDelivery></Siri>'''
    n=dict(region_id='magdeburg',network_id='de-magdeburg-mvb',version_id='v5',service_date='2026-11-05',timezone='Europe/Berlin',
        activated_at='2026-11-04T23:00:00Z',generation_state='ACTIVE_READY',
        routes=[dict(route_number='N2',mode='tram',stops=[dict(stop_id='A',lat=52.1,lng=11.6),dict(stop_id='B',lat=52.2,lng=11.7)],
            trips=[dict(trip_id='T',stop_ids=['A','B'],stop_sequences=[10,20],source_time_seconds_preserved=seconds,
                stop_times_sequence=[dict(departure_time='00:59:00' if seconds else '00:59'),
                                     dict(departure_time='01:03:00' if seconds else '01:03')])])])
    catalogue=dict(data=[dict(city_slug='magdeburg',geo={'lat':52.1,'lon':11.6},payload={'stop_id':'de:15003:1::1'}),
                          dict(city_slug='magdeburg',geo={'lat':52.2,'lon':11.7},payload={'stop_id':'de:15003:2::1'})])
    return raw,[n],catalogue


def run(values=None):
    raw,n,c=values or fixture()
    return match_snapshot(parse_siri(raw),n,c,NOW)


def test_absolute_planned_dates_do_not_equal_source_frame_label_and_inputs_unchanged():
    values=fixture();before=deepcopy(values);r=run(values)['journeys'][0]
    assert r['source_frame_ref']=='2026-11-04' and r['match']['gtfs_service_date']=='2026-11-05'
    assert r['eligible_for_marker_trial'] and r['match']['target_stop_sequences']==[10,20]
    assert [c['visit_number'] for c in r['calls']]==['100','100']
    assert values==before


def test_source_date_04_can_also_match_a_true_24_hour_gtfs_trip_without_modulo_wrap():
    raw,n,c=fixture();n[0]['service_date']='2026-11-04'
    n[0]['routes'][0]['trips'][0]['stop_times_sequence']=[dict(departure_time='24:59:00'),dict(departure_time='25:03:00')]
    assert run((raw,n,c))['journeys'][0]['match']['gtfs_service_date']=='2026-11-04'


def test_matching_networks_are_not_merged_and_duplicate_absolute_identity_is_ambiguous():
    raw,n,c=fixture();other=deepcopy(n[0]);other.update(version_id='v4',service_date='2026-11-04')
    other['routes'][0]['trips'][0]['stop_times_sequence']=[dict(departure_time='24:59:00'),dict(departure_time='25:03:00')]
    r=run((raw,n+[other],c))['journeys'][0]
    assert r['signature_candidate_count']==2 and not r['eligible_for_reference_comparison']


def test_legacy_minute_matching_is_not_second_precision_marker_acceptance():
    r=run(fixture(False))['journeys'][0]
    assert r['eligible_for_reference_comparison'] and not r['eligible_for_marker_trial']
    assert r['match']['precision']=='LEGACY_MINUTES'


@pytest.mark.parametrize('old,new,reason',[(b'00:00:40Z',b'23:00:40Z','TRIP_CLOCK_UNAVAILABLE_OR_STALE'),
    (b'<Monitored>true',b'<Monitored>false','UNMONITORED'),
    (b'<IsCompleteStopSequence>true',b'<IsCompleteStopSequence>false','PARTIAL_STOP_SEQUENCE')])
def test_stale_and_unmonitored_or_partial_sources_never_enter_reference_comparison(old,new,reason):
    raw,n,c=fixture();raw=raw.replace(old,new)
    r=run((raw,n,c))['journeys'][0]
    assert reason in r['rejection_reasons'] and not r['eligible_for_reference_comparison']


def test_duplicate_visits_and_journeys_are_not_merged_or_selected_by_newest_clock():
    raw,n,c=fixture();s=parse_siri(raw);s['journeys'].append(deepcopy(s['journeys'][0]))
    assert all('DUPLICATE_SOURCE_JOURNEY' in j['rejection_reasons'] for j in match_snapshot(s,n,c,NOW)['journeys'])
    s=parse_siri(raw);s['journeys'][0]['calls'].append(deepcopy(s['journeys'][0]['calls'][0]))
    assert 'DUPLICATE_SOURCE_VISIT' in match_snapshot(s,n,c,NOW)['journeys'][0]['rejection_reasons']


def test_platform_overlap_requires_full_unique_timetable_context_not_nearest_choice():
    raw,n,c=fixture();n[0]['routes'][0]['stops'].append(dict(stop_id='AX',lat=52.1,lng=11.6))
    assert run((raw,n,c))['journeys'][0]['match']['target_stop_ids']==['A','B']
    other=deepcopy(n[0]['routes'][0]['trips'][0]);other['trip_id']='other';other['stop_ids'][0]='AX'
    n[0]['routes'][0]['trips'].append(other)
    assert not run((raw,n,c))['journeys'][0]['eligible_for_reference_comparison']


def test_insa_compares_source_epochs_with_a_display_threshold_not_clock_gate_widening():
    t=run();b=[dict(captured_epoch=NOW,rows=[dict(line='N2',source_stop_ref='de:15003:2::1',
        aimed_departure_epoch=NOW+120,expected_departure_epoch=NOW+150,direction='South')])]
    r=compare_insa(t,b,NOW)['comparisons'][0]
    assert r['difference_seconds']==-1 and r['within_60_seconds'] and not r['exact_seconds_equal']
    b[0]['captured_epoch']=NOW-31
    assert compare_insa(t,b,NOW)['counts']['rows']==0


def test_wrong_insa_direction_or_duplicate_event_is_not_confirmed_agreement():
    t=run();row=dict(line='N2',source_stop_ref='de:15003:2::1',aimed_departure_epoch=NOW+120,
        expected_departure_epoch=NOW+150,direction='North')
    b=[dict(captured_epoch=NOW,rows=[row])]
    assert compare_insa(t,b,NOW)['counts']['compared']==0
    row['direction']='South';b[0]['rows'].append(deepcopy(row))
    assert compare_insa(t,b,NOW)['counts']['compared']==0
    assert compare_insa(t,b,NOW)['counts']['time_values_compared']==1
    b[0]['rows'][1]['expected_departure_epoch']+=60
    assert compare_insa(t,b,NOW)['counts']['time_values_compared']==0


def test_unsupported_or_entity_xml_is_rejected_without_io():
    for raw in (b'<Other/>',b'<!DOCTYPE Siri [<!ENTITY x "x">]><Siri/>'):
        with pytest.raises(ValueError):parse_siri(raw)


def test_destination_place_id_can_verify_different_direction_display_names():
    t=run();b=[dict(captured_epoch=NOW,rows=[dict(line='N2',source_stop_ref='de:15003:2::1',
        aimed_departure_epoch=NOW+120,expected_departure_epoch=NOW+150,direction='Terminal display',
        destination_stop_refs=['de:15003:2'])])]
    assert compare_insa(t,b,NOW)['counts']['compared']==1


def test_hafas_clock_is_not_read_in_browser_timezone_or_coerced_to_today():
    assert hafas_epoch('20261104','250300',60)==NOW+120
    assert hafas_epoch('20261105','010300',60)==NOW+120
    assert hafas_epoch('20261104','010300',60)!=NOW+120
    assert hafas_epoch('20261105','010300',None) is None
    assert hafas_epoch('20261105','010300',True) is None


def test_hafas_normalization_reports_bad_rows_and_never_falls_back_to_schedule_for_realtime():
    response={'svcResL':[{'meth':'StationBoard','res':{'common':{
        'locL':[{'globalIdL':[{'type':'A','id':'de:15003:2::1'}]}],
        'prodL':[{'nameS':'N2'}]},'jnyL':[{'date':'20261105','prodX':0,
            'stbStop':{'locX':0,'dTimeS':'010300','dTZOffset':60},'prodL':[]}]}}]}
    board=normalize_hafas_board({'response':response,'captured_epoch':NOW})
    assert len(board['rows'])==1 and board['rows'][0]['expected_departure_epoch'] is None
    assert board['rows'][0]['aimed_departure_epoch']==NOW+120
    response['svcResL'][0]['res']['jnyL'][0]['stbStop']['dTZOffset']=None
    board=normalize_hafas_board({'response':response,'captured_epoch':NOW})
    assert board['rows']==[] and board['normalization_errors']


@pytest.mark.parametrize('change,reason',[('activation','PRE_ACTIVATION_SOURCE_DOCUMENT'),
    ('readiness','GTFS_NETWORK_NOT_READY')])
def test_activated_network_gates_are_not_bypassed_by_a_signature(change,reason):
    raw,n,c=fixture()
    if change=='activation':n[0]['activated_at']='2026-11-05T00:00:55Z'
    else:n[0]['generation_state']='BUILDING'
    result=run((raw,n,c))['journeys'][0]
    assert not result['eligible_for_reference_comparison'] and reason in result['rejection_reasons']


def test_trip_clock_cannot_exceed_document_clock_by_more_than_existing_bound():
    raw,n,c=fixture();s=parse_siri(raw)
    s['journeys'][0]['trip_timestamp']='2026-11-05T00:02:51Z'
    result=match_snapshot(s,n,c,NOW)['journeys'][0]
    assert 'TRIP_CLOCK_AFTER_DOCUMENT_BOUND' in result['rejection_reasons']


def test_an_unactivated_snapshot_is_not_accepted_because_its_times_match():
    raw,n,c=fixture();n[0].pop('activated_at')
    result=run((raw,n,c))['journeys'][0]
    assert 'GTFS_ACTIVATION_UNAVAILABLE' in result['rejection_reasons']
    assert not result['eligible_for_reference_comparison']
