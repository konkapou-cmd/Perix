"""Pure Phase-5 trip-identity tests: no Mongo / GTFS API / Google dependency."""
from datetime import datetime
from zoneinfo import ZoneInfo
from mobility.realtime_trip_identity import build_trip_index, match_trip_update, stop_id_for_sequence


def sample_network():
    return {
        'name':'Magdeburg transit 2026-10-18','version_id':'v_today',
        'service_date':'2026-10-18',
        'routes':[{ 'route_number':'9S','mode':'tram','trips':[{
            'trip_id':'MV9S-1','gtfs_route_id':'gtfs-999','start':'25:10',
            'direction_id':'1','stop_ids':['A','B','C'],
            'stop_sequences':[10,20,40],
        }]}],
    }


def match(network=None, descriptor=None, stops=None, feed_epoch=None, activated=None):
    net=network or sample_network()
    idx=build_trip_index(net)
    if feed_epoch is None:
        feed_epoch=int(datetime(2026,10,18,20,0,tzinfo=ZoneInfo('Europe/Berlin')).timestamp())
    return match_trip_update(descriptor or {'trip_id':'MV9S-1'},stops if stops is not None else [{'stop_id':'A','stop_sequence':10}],idx,
        feed_timestamp=feed_epoch,timezone_name='Europe/Berlin',service_day_start_hour=4,activated_at=activated)


def test_identity_route_number_is_not_gtfs_route_id():
    assert match(descriptor={'trip_id':'MV9S-1','route_id':'gtfs-999'})[1]=='MATCHED'
    assert match(descriptor={'trip_id':'MV9S-1','route_id':'9S'})[1]=='WRONG_GTFS_ROUTE'


def test_yesterday_service_date_never_matches_today():
    assert match(descriptor={'trip_id':'MV9S-1','start_date':'20261017'})[1]=='WRONG_START_DATE'
    assert match(descriptor={'trip_id':'MV9S-1','start_date':'20261018'})[1]=='MATCHED'


def test_old_feed_after_service_rollover_is_rejected_without_start_date():
    early=int(datetime(2026,10,18,3,59,tzinfo=ZoneInfo('Europe/Berlin')).timestamp())
    ontime=int(datetime(2026,10,18,4,0,tzinfo=ZoneInfo('Europe/Berlin')).timestamp())
    assert match(feed_epoch=early)[1]=='WRONG_FEED_SERVICE_DAY'
    assert match(feed_epoch=ontime)[1]=='MATCHED'


def test_pre_activation_snapshot_rejected_and_new_snapshot_recovers():
    activation='2026-10-18T19:00:00+02:00'
    older=int(datetime(2026,10,18,18,59,tzinfo=ZoneInfo('Europe/Berlin')).timestamp())
    newer=int(datetime(2026,10,18,19,1,tzinfo=ZoneInfo('Europe/Berlin')).timestamp())
    assert match(feed_epoch=older,activated=activation)[1]=='PRE_ACTIVATION_SNAPSHOT'
    assert match(feed_epoch=newer,activated=activation)[1]=='MATCHED'


def test_ordered_stops_and_original_stop_sequence_are_checked():
    assert match(stops=[{'stop_id':'A','stop_sequence':10},{'stop_id':'C','stop_sequence':40}])[1]=='MATCHED'
    assert match(stops=[{'stop_id':'C','stop_sequence':40},{'stop_id':'A','stop_sequence':10}])[1]=='INCOMPATIBLE_STOP_SEQUENCE'
    assert match(stops=[{'stop_id':'A','stop_sequence':11}])[1]=='INCOMPATIBLE_STOP_SEQUENCE'
    assert match(stops=[{'stop_id':'X'}])[1]=='INCOMPATIBLE_STOP_SEQUENCE'


def test_stop_sequence_only_updates_resolve_to_official_gtfs_ids():
    idx=build_trip_index(sample_network())
    assert stop_id_for_sequence(idx['MV9S-1'],20)=='B'
    assert match(stops=[{'stop_sequence':10},{'stop_sequence':40}])[1]=='MATCHED'


def test_start_time_over_midnight_and_direction():
    assert match(descriptor={'trip_id':'MV9S-1','start_time':'25:10:00','direction_id':1})[1]=='MATCHED'
    assert match(descriptor={'trip_id':'MV9S-1','start_time':'01:10:00'})[1]=='WRONG_START_TIME'
    assert match(descriptor={'trip_id':'MV9S-1','direction_id':0})[1]=='WRONG_DIRECTION'


def test_ineligible_ad_hoc_relationship_is_never_synthetic():
    for rel in ('ADDED','UNSCHEDULED','DUPLICATED','REPLACEMENT'):
        assert match(descriptor={'trip_id':'MV9S-1','schedule_relationship':rel})[1]=='UNSUPPORTED_TRIP_RELATIONSHIP'
    assert match(descriptor={'trip_id':'MV9S-1','schedule_relationship':'CANCELED'},stops=[])[1]=='MATCHED'


def test_duplicates_and_missing_version_never_match():
    n=sample_network(); n['routes'][0]['trips'].append(dict(n['routes'][0]['trips'][0]));
    assert match(network=n)[1]=='UNKNOWN_OR_DUPLICATE_TRIP'
    n2=sample_network();n2.pop('version_id')
    assert build_trip_index(n2)=={}


def test_missing_date_and_missing_feed_generation_fail_closed():
    index=build_trip_index(sample_network())
    assert match_trip_update({'trip_id':'MV9S-1'},[],index,feed_timestamp=None,timezone_name='Europe/Berlin',service_day_start_hour=4)[1]=='NO_SERVICE_DATE_EVIDENCE'


def test_explicit_start_date_allows_missing_header_timestamp():
    index=build_trip_index(sample_network())
    assert match_trip_update({'trip_id':'MV9S-1','start_date':'20261018'},[],index,feed_timestamp=None,timezone_name='Europe/Berlin',service_day_start_hour=4)[1]=='MATCHED'


def test_legacy_network_without_gtfs_route_id_cannot_verify_route_id():
    n=sample_network();del n['routes'][0]['trips'][0]['gtfs_route_id']
    assert match(network=n,descriptor={'trip_id':'MV9S-1','route_id':'gtfs-999'})[1]=='WRONG_GTFS_ROUTE'


def test_time_validation_does_not_accept_invalid_gtfs():
    assert match(descriptor={'trip_id':'MV9S-1','start_time':'xx:yy'})[1]=='WRONG_START_TIME'


def test_explicit_start_date_still_rejects_old_pre_activation_feed():
    older = int(datetime(2026,10,18,18,59,tzinfo=ZoneInfo('Europe/Berlin')).timestamp())
    assert match(descriptor={'trip_id':'MV9S-1','start_date':'20261018'},feed_epoch=older,activated='2026-10-18T19:00:00+02:00')[1]=='PRE_ACTIVATION_SNAPSHOT'
