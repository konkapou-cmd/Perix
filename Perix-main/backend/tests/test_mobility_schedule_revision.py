"""Phase4 schedule-day and temporary-stop safety tests (pure Python)."""
import copy
from mobility.schedule_revision import audit_schedule, choose_contract, service_day_for, seconds_until_next_service_day


def sample():
    return {
        'region_id': 'magdeburg', 'network_id': 'de-magdeburg-mvb',
        'service_date': '2026-10-18',
        'routes': [{
            'route_number': '9N', 'mode': 'tram',
            'stops': [
                {'stop_id': 'A', 'name': 'A', 'lat': 52.10, 'lng': 11.60},
                {'stop_id': 'B', 'name': 'B', 'lat': 52.11, 'lng': 11.61},
                {'stop_id': 'TMP', 'name': 'Temporary stop', 'lat': 52.12, 'lng': 11.62},
            ],
            'trips': [{
                'trip_id': 'trip-9n-demo', 'headsign': 'Demo Terminus',
                'stop_ids': ['A', 'B', 'TMP'],
                'stop_times_arrival': {'A': '23:52', 'B': '24:03', 'TMP': '24:11'},
                'stop_times': {'A': '23:53', 'B': '24:04', 'TMP': '24:12'},
            }],
        }],
    }


def manifest():
    return {
        'schema_version': 1, 'region_id': 'magdeburg',
        'network_id': 'de-magdeburg-mvb',
        'valid_from': '2026-10-17', 'valid_until': '2026-11-01',
        'approved_by': 'operator-review-label',
        'source_url': 'https://example.org/operator-feed-review',
        'required_routes': [{
            'route_number': '9N', 'mode': 'tram', 'minimum_trips': 1,
            'required_patterns': [{'headsign': 'Demo Terminus', 'stop_ids': ['A', 'B', 'TMP']}],
        }],
        'temporary_stops': [{'stop_id': 'TMP', 'latitude': 52.12, 'longitude': 11.62}],
    }


def test_correct_special_day_and_stop_order_passes():
    data = sample()
    contract = choose_contract(manifest(), region_id='magdeburg', network_id='de-magdeburg-mvb', service_date=data['service_date'])
    result = audit_schedule(data, contract=contract)
    assert result['ready_to_import'] is True
    assert result['contract_applied'] is True


def test_special_manifest_expires_outside_window():
    assert choose_contract(manifest(), region_id='magdeburg', network_id='de-magdeburg-mvb', service_date='2026-11-02') is None


def test_missing_split_line_is_blocking():
    rule = manifest()
    rule['required_routes'].append({'route_number': '9S', 'mode': 'tram'})
    result = audit_schedule(sample(), contract=rule)
    assert 'REQUIRED_ROUTE_MISSING' in [x['code'] for x in result['blocking_errors']]


def test_opposite_stop_sequence_does_not_pass():
    rule = manifest()
    rule['required_routes'][0]['required_patterns'][0]['stop_ids'] = ['TMP', 'B', 'A']
    assert 'REQUIRED_PATTERN_MISSING' in [x['code'] for x in audit_schedule(sample(), contract=rule)['blocking_errors']]


def test_wrong_headsign_does_not_pass():
    rule = manifest()
    rule['required_routes'][0]['required_patterns'][0]['headsign'] = 'Wrong'
    assert audit_schedule(sample(), contract=rule)['ready_to_import'] is False


def test_temporary_stop_wrong_coordinate_blocks():
    rule = manifest()
    rule['temporary_stops'][0]['latitude'] = 52.14
    assert 'TEMPORARY_STOP_POSITION_MISMATCH' in [x['code'] for x in audit_schedule(sample(), contract=rule)['blocking_errors']]


def test_arrival_after_departure_is_rejected():
    s = sample()
    s['routes'][0]['trips'][0]['stop_times']['B'] = '23:58'
    assert 'INVALID_TRIP_TIMELINE' in [x['code'] for x in audit_schedule(s)['blocking_errors']]


def test_duplicate_trip_ids_rejected():
    s = sample()
    s['routes'][0]['trips'].append(copy.deepcopy(s['routes'][0]['trips'][0]))
    assert 'DUPLICATE_OR_MISSING_TRIP_ID' in [x['code'] for x in audit_schedule(s)['blocking_errors']]


def test_repeated_stop_loops_warning_instead_of_inventing_times():
    s = sample()
    s['routes'][0]['trips'][0]['stop_ids'] = ['A','B','A']
    result = audit_schedule(s)
    assert 'REPEATED_STOP_ID_UNSUPPORTED' in [x['code'] for x in result['warnings']]


def test_moved_stop_detected_not_fabricated():
    now = sample()
    old = sample()
    old['routes'][0]['stops'][2]['lat'] = 52.119
    result = audit_schedule(now, previous=old)
    assert result['moved_stop_candidates'][0]['stop_id'] == 'TMP'


def test_contract_wrong_region_fails_loudly():
    import pytest
    with pytest.raises(ValueError, match='wrong region'):
        choose_contract(manifest(), region_id='berlin', network_id='de-berlin', service_date='2026-10-18')


def test_wrong_contract_date_is_rejected():
    m = manifest()
    m['valid_from'], m['valid_until'] = m['valid_until'], m['valid_from']
    import pytest
    with pytest.raises(ValueError, match='reversed'):
        choose_contract(m, region_id='magdeburg', network_id='de-magdeburg-mvb', service_date='2026-10-18')


def test_unverified_manifest_missing_reviewer_rejected():
    m = manifest()
    m['approved_by'] = ''
    import pytest
    with pytest.raises(ValueError, match='reviewer'):
        choose_contract(m, region_id='magdeburg', network_id='de-magdeburg-mvb', service_date='2026-10-18')


def test_strict_special_line_rejects_unapproved_legacy_trip():
    s = sample()
    other = copy.deepcopy(s['routes'][0]['trips'][0])
    other['trip_id'] = 'trip-legacy'
    other['headsign'] = 'Old Terminus'
    s['routes'][0]['trips'].append(other)
    rule = manifest()
    rule['required_routes'][0]['strict_patterns'] = True
    result = audit_schedule(s, contract=rule)
    assert 'UNAPPROVED_PATTERN_ON_SPECIAL_LINE' in [x['code'] for x in result['blocking_errors']]


def test_feed_pinned_sha_must_match():
    rule = manifest()
    rule['feed_sha256'] = 'a' * 64
    assert 'OFFICIAL_FEED_HASH_MISMATCH' in [x['code'] for x in audit_schedule(sample(), contract=rule, source_sha256='b'*64)['blocking_errors']]
    assert audit_schedule(sample(), contract=rule, source_sha256='a'*64)['ready_to_import'] is True


def test_temporary_stop_must_be_served_on_claimed_route():
    rule = manifest()
    rule['temporary_stops'][0]['served_by_route'] = '9S'
    assert 'TEMPORARY_STOP_NOT_SERVED_BY_REQUIRED_ROUTE' in [x['code'] for x in audit_schedule(sample(), contract=rule)['blocking_errors']]


def test_prohibited_legacy_route_rejected_if_present():
    rule = manifest()
    rule['prohibited_routes'] = ['9N']
    assert 'PROHIBITED_ROUTE_PRESENT' in [x['code'] for x in audit_schedule(sample(), contract=rule)['blocking_errors']]


def test_gtfs_service_day_before_0400_is_previous_date():
    from datetime import datetime
    from zoneinfo import ZoneInfo
    early = datetime(2026, 10, 19, 3, 40, tzinfo=ZoneInfo('Europe/Berlin'))
    assert service_day_for(early).isoformat() == '2026-10-18'
    assert seconds_until_next_service_day(early) == 20 * 60
    later = datetime(2026, 10, 19, 4, 1, tzinfo=ZoneInfo('Europe/Berlin'))
    assert service_day_for(later).isoformat() == '2026-10-19'


def _trip_with_times(times):
    stops = [{'stop_id': f'S{i}', 'name': f'S{i}', 'lat': 52.0, 'lng': 11.0} for i in range(len(times))]
    return {
        'region_id': 'magdeburg', 'network_id': 'de-magdeburg-mvb',
        'service_date': '2026-10-18',
        'routes': [{
            'route_number': '54', 'mode': 'bus', 'stops': stops,
            'trips': [{
                'trip_id': 't1', 'stop_ids': [s['stop_id'] for s in stops],
                'stop_times': {s['stop_id']: t for s, t in zip(stops, times)},
            }],
        }],
    }


def test_raw_gtfs_24xx_then_00xx_is_rejected_without_rollover_guess():
    result = audit_schedule(_trip_with_times(['24:30', '00:35', '00:40']))
    assert result['ready_to_import'] is False


def test_4am_boundary_crossing_is_accepted():
    # A trip crossing the 04:00 service-day boundary must not be rejected by
    # the old "add 24h to hours < 4" heuristic.
    result = audit_schedule(_trip_with_times(['03:50', '04:00']))
    assert result['ready_to_import'] is True


def test_midnight_crossing_requires_explicit_24xx():
    result = audit_schedule(_trip_with_times(['23:50', '00:05']))
    assert result['ready_to_import'] is False
    assert audit_schedule(_trip_with_times(['23:50', '24:05']))['ready_to_import'] is True


def test_genuinely_backwards_24xx_then_00xx_is_rejected():
    # "24:30" (00:30 next day) followed by "00:05" (00:05 next day) is
    # genuinely backwards and must still be rejected (fail-closed).
    result = audit_schedule(_trip_with_times(['24:30', '00:05']))
    assert 'INVALID_TRIP_TIMELINE' in [x['code'] for x in result['blocking_errors']]


def test_backwards_same_day_is_rejected():
    # "23:50" -> "23:40" is genuinely backwards (same day) and must be rejected.
    result = audit_schedule(_trip_with_times(['23:50', '23:40']))
    assert 'INVALID_TRIP_TIMELINE' in [x['code'] for x in result['blocking_errors']]
