"""V6 offline acceptance tests. All test data is synthetic, not official MVB."""
from copy import deepcopy
import hashlib
from datetime import datetime
from zoneinfo import ZoneInfo
import pytest

from mobility.release_gate import (
    eta_accuracy_audit, map_geometry_audit, map_pattern_audit, release_gate, realtime_audit,
)


def sample_network():
    return {
        'name': 'Synthetic test network 2026-10-18',
        'region_id': 'magdeburg', 'network_id': 'de-magdeburg-mvb',
        'timezone': 'Europe/Berlin', 'service_day_start_hour': 4,
        'version_id': 'sandbox-v1', 'service_date': '2026-10-18',
        'activated_at': '2026-10-18T17:00:00Z',
        'routes': [{'route_number': 'TEST', 'mode': 'tram',
                    'stops': [
                        {'stop_id': 'A', 'name': 'Alpha', 'lat': 52.13, 'lng': 11.63},
                        {'stop_id': 'B', 'name': 'Beta', 'lat': 52.131, 'lng': 11.631},
                    ], 'trips': [{
                        'trip_id': 'synthetic-t1', 'gtfs_route_id': 'synthetic-route-id',
                        'start': '20:00', 'end': '20:10', 'headsign': 'Beta',
                        'stop_ids': ['A', 'B'], 'stop_sequences': [10, 20],
                        'stop_times': {'A': '20:00', 'B': '20:10'},
                        'stop_times_arrival': {'A': '20:00', 'B': '20:10'},
                    }]}],
    }


def sample_feed():
    ts = int(datetime(2026, 10, 18, 20, 5, tzinfo=ZoneInfo('Europe/Berlin')).timestamp())
    return {'feed_timestamp': ts, 'captured_at': ts + 8, 'trip_updates': [{
        'descriptor': {'trip_id': 'synthetic-t1', 'route_id': 'synthetic-route-id',
                       'start_date': '20261018'},
        'stop_updates': [{'stop_id': 'A', 'stop_sequence': 10}, {'stop_id': 'B', 'stop_sequence': 20}],
    }]}


def sample_map():
    return {'lines': [{
        'route_number': 'TEST', 'pattern_id': 'TEST:' + hashlib.sha1(b'Beta:A>B').hexdigest()[:10],
        'mode': 'tram', 'direction': 'Beta',
        'source': 'GTFS_SHAPE', 'valid': True,
        'points': [{'latitude': 52.13, 'longitude': 11.63},
                   {'latitude': 52.131, 'longitude': 11.631}],
        'stops': [{'stop_id': 'A', 'latitude': 52.13, 'longitude': 11.63},
                  {'stop_id': 'B', 'latitude': 52.131, 'longitude': 11.631}],
    }]}


def contract():
    return {'schema_version': 1, 'region_id': 'magdeburg',
            'network_id': 'de-magdeburg-mvb', 'valid_from': '2026-10-18',
            'valid_until': '2026-10-18', 'approved_by': 'SYNTHETIC TEST REVIEWER',
            'source_url': 'https://example.org/synthetic-test-only',
            'required_routes': [{'route_number': 'TEST', 'required_patterns': [
                {'stop_ids': ['A', 'B'], 'headsign': 'Beta'}], 'strict_patterns': True}],
            'temporary_stops': []}


def observations(n=4):
    return [{
        'service_date': '2026-10-18', 'trip_id': f'synthetic-{i}', 'stop_id': 'A',
        'predicted_utc': f'2026-10-18T18:{(10+i):02d}:00Z',
        'observed_utc': f'2026-10-18T18:{(10+i):02d}:30Z',
        'forecast_issued_utc': f'2026-10-18T18:{(7+i):02d}:00Z',
        'observation_source': 'VALIDATED_GPS', 'eta_source': 'REALTIME',
    } for i in range(n)]


def sample_detours():
    return {'patterns': [{'pattern_id': 'TEST:' + hashlib.sha1(b'Beta:A>B').hexdigest()[:10], 'status': 'READY', 'safe': True}]}


def run_complete(**kw):
    return release_gate(sample_network(), contract=contract(), realtime=sample_feed(),
                        map_payload=sample_map(), observations=observations(),
                        detours=sample_detours(), min_observations=4, **kw)


def test_all_synthetic_evidence_is_only_a_technical_pass():
    report = run_complete()
    assert report['status'] == 'TECHNICAL_PASS'
    assert report['safe_to_deploy_automatically'] is False
    assert report['reports']['eta']['mae_seconds'] == 30


def test_missing_real_world_evidence_never_passes():
    result = release_gate(sample_network())
    assert result['status'] == 'INSUFFICIENT_EVIDENCE'
    assert 'independent_observed_arrivals' in result['missing_evidence']


def test_wrong_special_pattern_blocks():
    c = contract(); c['required_routes'][0]['required_patterns'][0]['stop_ids'] = ['B', 'A']
    out = release_gate(sample_network(), contract=c)
    assert out['status'] == 'BLOCKED'
    assert 'SCHEDULE_VALIDATION_FAILED' in out['blocking']


def test_stale_and_future_feeds_block():
    f = sample_feed(); f['captured_at'] = f['feed_timestamp'] + 900
    assert realtime_audit(sample_network(), f)['errors'][0]['code'] == 'STALE_OR_FUTURE_FEED'
    f['captured_at'] = f['feed_timestamp'] - 100
    assert realtime_audit(sample_network(), f)['errors'][0]['code'] == 'STALE_OR_FUTURE_FEED'


def test_old_service_day_trip_rejected():
    f = sample_feed(); f['trip_updates'][0]['descriptor']['start_date'] = '20261017'
    assert realtime_audit(sample_network(), f)['reasons']['WRONG_START_DATE'] == 1


def test_network_wide_feed_does_not_deflate_eligible_ratio():
    f = sample_feed(); f['trip_updates'].append({'descriptor': {'trip_id': 'unrelated-trip'}, 'stop_updates': []})
    a = realtime_audit(sample_network(), f)
    assert a['eligible_updates'] == 1
    assert a['accepted_eligible_pct'] == 100


def test_duplicate_trip_updates_block():
    f = sample_feed(); f['trip_updates'].append(deepcopy(f['trip_updates'][0]))
    assert any(e['code'] == 'DUPLICATE_REALTIME_TRIP_UPDATES' for e in realtime_audit(sample_network(), f)['errors'])


def test_reversed_stop_order_fails():
    m = sample_map(); m['lines'][0]['stops'].reverse()
    assert 'REVERSED_STOP_ORDER' in [e['code'] for e in map_geometry_audit(m)['errors']]


def test_off_route_temporary_stop_fails():
    m = sample_map(); m['lines'][0]['stops'][1]['latitude'] += .012
    assert 'STOP_OFF_ROUTE' in [e['code'] for e in map_geometry_audit(m)['errors']]


def test_no_map_lines_is_an_error():
    assert map_geometry_audit({'lines': []})['errors'][0]['code'] == 'NO_PUBLISHED_LINES'


def test_observations_come_from_independent_source():
    rows = observations(); rows[0]['observation_source'] = 'GOOGLE_PREDICTION'
    result = eta_accuracy_audit(rows, min_observations=3)
    assert 'OBSERVATION_GROUND_TRUTH_UNVERIFIED' in [e['code'] for e in result['errors']]


def test_no_future_leakage_from_forecast():
    rows = observations(); rows[0]['forecast_issued_utc'] = '2026-10-18T18:11:00Z'
    assert any(e['code'] == 'BAD_OBSERVATION_TIMESTAMP' for e in eta_accuracy_audit(rows, min_observations=3)['errors'])


def test_mae_threshold_blocks():
    rows = observations(); rows[0]['observed_utc'] = '2026-10-18T18:13:00Z'
    x = eta_accuracy_audit(rows, min_observations=4, max_mae_seconds=45)
    assert any(e['code'] == 'ETA_MAE_EXCEEDS_THRESHOLD' for e in x['errors'])


def test_missing_or_unsafe_detour_diagnostic_fails_closed():
    result = release_gate(sample_network(), contract=contract(), realtime=sample_feed(),
                          map_payload=sample_map(), observations=observations(),
                          detours={'patterns': [{'safe': False, 'status': 'STALE'}]}, min_observations=4)
    assert result['status'] == 'BLOCKED'


def test_bad_observation_identity_blocks():
    rows = observations(); rows[0]['service_date'] = ''
    assert any(e['code'] == 'OBSERVATION_IDENTITY_INCOMPLETE'
               for e in eta_accuracy_audit(rows, min_observations=3)['errors'])


def test_wrong_map_trip_direction_blocks_even_if_geometry_is_valid():
    m = sample_map(); m['lines'][0]['direction'] = 'Alpha'
    assert map_geometry_audit(m)['errors'] == []
    assert map_pattern_audit(sample_network(), m)['errors'][0]['code'] == 'MAP_TRIP_PATTERN_MISMATCH'
    result = release_gate(sample_network(), map_payload=m)
    assert 'GEOMETRY_ALIGNMENT_FAILED' in result['blocking']


def test_missing_active_pattern_blocks_release():
    m = sample_map(); m['lines'][0]['pattern_id'] = 'unknown-pattern'
    names = {e['code'] for e in map_pattern_audit(sample_network(), m)['errors']}
    assert 'MISSING_ACTIVE_GTFS_PATTERN' in names
    assert 'MAP_PATTERN_NOT_IN_ACTIVE_GTFS' in names


def test_rt_eligible_match_ratio_is_not_silently_accepted():
    feed = sample_feed()
    feed['trip_updates'][0]['descriptor']['start_date'] = '20261017'
    out = realtime_audit(sample_network(), feed, min_acceptance_pct=80)
    assert 'LOW_REALTIME_IDENTITY_ACCEPTANCE' in {e['code'] for e in out['errors']}


def test_missing_activation_time_cannot_prove_version_handover():
    net = sample_network(); net.pop('activated_at')
    result = release_gate(net, contract=contract(), realtime=sample_feed(),
                          map_payload=sample_map(), observations=observations(),
                          detours=sample_detours(), min_observations=4)
    assert result['status'] == 'INSUFFICIENT_EVIDENCE'
    assert 'active_network_activation_timestamp' in result['missing_evidence']
