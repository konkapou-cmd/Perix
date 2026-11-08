"""Synthetic dated feed parity is not route or GPS verification."""
import io
import zipfile
from copy import deepcopy

import pytest

from tools.audit_gtfs_network import audit_archive, audit_stop_metadata


@pytest.fixture
def inputs():
    visits = [{'stop_id': sid, 'stop_sequence': i, 'arrival_time': f'10:0{i}', 'departure_time': f'10:0{i}'}
              for i, sid in enumerate(('A', 'B', 'A'))]
    network = {'version_id': 'v', 'name': '2026-11-02', 'routes': [{
        'mode': 'tram', 'route_number': '2', 'gtfs_agency_ids': ['ag'],
        'stops': [{'stop_id': 'A', 'lat': 52, 'lng': 11, 'name': 'Start'},
                  {'stop_id': 'B', 'lat': 52.001, 'lng': 11, 'name': 'Other'}], 'trips': [{
            'trip_id': 'trip', 'gtfs_route_id': 'route', 'service_id': 's', 'stop_ids': ['A', 'B', 'A'],
            'stop_sequences': [0, 1, 2], 'stop_times_sequence': visits}]}]}
    tables = {
        'routes.txt': 'route_id,route_short_name,agency_id,route_type\nroute,2,ag,0\n',
        'trips.txt': 'trip_id,route_id,service_id\ntrip,route,s\n',
        'stops.txt': 'stop_id,stop_name,stop_lat,stop_lon\nA,Start,52,11\nB,Other,52.001,11\n',
        'calendar.txt': 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\ns,1,1,1,1,1,1,1,20261101,20261130\n',
        'calendar_dates.txt': 'service_id,date,exception_type\n',
        'stop_times.txt': 'trip_id,stop_id,stop_sequence,arrival_time,departure_time\ntrip,A,2,10:02:00,10:02:00\ntrip,A,0,10:00:15,10:00:15\ntrip,B,1,10:01:00,10:01:00\n',
    }
    return network, tables


def archive(tables):
    memory = io.BytesIO()
    with zipfile.ZipFile(memory, 'w') as z:
        for name, content in tables.items(): z.writestr(name, content)
    memory.seek(0)
    return zipfile.ZipFile(memory)


def test_repeated_stop_occurrences_and_minute_vs_seconds(inputs):
    network, tables = inputs
    original = deepcopy(network)
    with archive(tables) as z: result = audit_archive(network, z)
    counts = result['counts']
    assert counts['matched_trip_ids'] == counts['date_and_route_identity_matched'] == 1
    assert counts['matched_stop_occurrences'] == counts['matched_minute_time_pairs'] == 3
    assert counts['matched_exact_second_time_pairs'] == 2
    assert result['issues'] == []
    assert network == original


def test_stop_metadata_parity_is_not_physical_platform_verification(inputs):
    network, tables = inputs
    with archive(tables) as z: result = audit_stop_metadata(network, z)
    assert result['counts']['matched_stop_ids'] == result['counts']['coordinates_within_1m'] == 2
    assert result['counts']['names_exact'] == 2
    tables['stops.txt'] = tables['stops.txt'].replace('B,Other,52.001,11', 'B,Other,52.002,11')
    with archive(tables) as z: result = audit_stop_metadata(network, z)
    assert result['counts']['coordinates_over_1m'] == 1
    assert result['issues'][0]['reason'] == 'COORDINATE_DISAGREEMENT'


def test_exception_removal_and_wrong_agency_not_silently_matched(inputs):
    network, tables = inputs
    tables['calendar_dates.txt'] += 's,20261102,2\n'
    with archive(tables) as z: result = audit_archive(network, z)
    assert result['counts']['inactive_or_unknown_service'] == 1
    tables['calendar_dates.txt'] = 'service_id,date,exception_type\n'
    tables['routes.txt'] = 'route_id,route_short_name,agency_id,route_type\nroute,2,wrong,0\n'
    with archive(tables) as z: result = audit_archive(network, z)
    assert result['counts']['trip_identity_mismatch'] == 1


def test_wrong_route_mode_is_reported_not_silently_matched(inputs):
    network, tables = inputs
    tables['routes.txt'] = 'route_id,route_short_name,agency_id,route_type\nroute,2,ag,3\n'
    with archive(tables) as z: result = audit_archive(network, z)
    assert result['counts']['route_mode_mismatch_or_unsupported'] == 1


def test_wrong_sequence_and_changed_time_are_distinct(inputs):
    network, tables = inputs
    tables['stop_times.txt'] = tables['stop_times.txt'].replace('trip,B,1,10:01:00,10:01:00', 'trip,C,1,10:01:00,10:01:00')
    with archive(tables) as z: result = audit_archive(network, z)
    assert result['counts']['stop_occurrence_mismatch_trips'] == 1
    tables['stop_times.txt'] = tables['stop_times.txt'].replace('trip,C,1,10:01:00,10:01:00', 'trip,B,1,10:04:00,10:04:00')
    with archive(tables) as z: result = audit_archive(network, z)
    assert result['counts']['mismatched_minute_time_pairs'] == 1


@pytest.mark.parametrize('bad', ['undated', 'duplicate_trip', 'header', 'duplicate_exception'])
def test_invalid_or_ambiguous_source_fails_closed(inputs, bad):
    network, tables = inputs
    if bad == 'undated': network['name'] = 'missing'
    if bad == 'duplicate_trip': tables['trips.txt'] += 'trip,route,s\n'
    if bad == 'header': tables['stop_times.txt'] = 'trip_id,stop_id\n'
    if bad == 'duplicate_exception': tables['calendar_dates.txt'] += 's,20261102,1\ns,20261102,2\n'
    with archive(tables) as z, pytest.raises(ValueError):
        audit_archive(network, z)
