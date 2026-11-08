"""Offline geometry triage never claims that a line is physically wrong."""
from copy import deepcopy
from pathlib import Path
import json
import os
import subprocess
import sys

import pytest

from mobility.approach import path_fingerprint
from mobility.domain import _pattern_id, _pattern_key
from tools.audit_transit_geometry import audit_snapshots, reverse_runs


@pytest.fixture
def snapshots():
    trip = {'trip_id': 'T', 'headsign': 'End', 'stop_ids': ['A', 'B', 'C']}
    route = {'route_number': 'N8', 'mode': 'tram', 'trips': [trip]}
    network = {'version_id': 'v1', 'name': 'Example 2026-11-02', 'routes': [route]}
    points = [[52, 11], [52.001, 11], [52.002, 11], [52.003, 11],
              [52.002, 11], [52.001, 11], [52, 11], [52, 11.001]]
    stops = [{'stop_id': 'A', 'latitude': 52, 'longitude': 11},
             {'stop_id': 'B', 'latitude': 52.003, 'longitude': 11},
             {'stop_id': 'C', 'latitude': 52, 'longitude': 11.001}]
    line = {'pattern_id': _pattern_id('N8', _pattern_key(trip)), 'route_number': 'N8',
            'mode': 'tram', 'network_version_id': 'v1', 'service_date': '2026-11-02',
            'direction': 'End', 'valid': True, 'source': 'OSM_RAIL',
            'points': [{'latitude': p[0], 'longitude': p[1]} for p in points],
            'approach_geometry_fingerprint': path_fingerprint(points), 'stops': stops}
    return network, {'lines': [line]}


def test_reverse_run_is_review_only_not_an_accusation_or_changed_geometry(snapshots):
    network, map_data = snapshots
    original = deepcopy(map_data)
    result = audit_snapshots(network, map_data)
    line = result['patterns'][0]
    assert result['scope']['expected_dated_patterns'] == 1
    assert result['counts']['review_flagged_patterns'] == 1
    assert line['review_flags'] == ['EXACT_REVERSE_RUN_REVIEW']
    assert line['reverse_runs'][0]['edges_each_direction'] == 3
    assert line['reverse_runs'][0]['repeated_distance_m'] > 300
    assert line['physical_accuracy_verified'] is False
    assert result['method']['not_a_physical_accuracy_or_route_correctness_test'] is True
    assert map_data == original


def test_opposite_edges_far_apart_are_not_immediate_reversal():
    points = [[52, 11], [52.001, 11], [52.002, 11], [52.002, 11.001],
              [52.001, 11.001], [52.001, 11], [52, 11]]
    assert reverse_runs(points) == []


def test_projection_disagreement_is_distinguished_from_actual_gps(snapshots):
    network, map_data = snapshots
    points = [[52, 11], [52.001, 11], [52.002, 11],
              [52.001, 11.00002], [52, 11.00002], [52.003, 11.00002]]
    line = map_data['lines'][0]
    line['points'] = [{'latitude': p[0], 'longitude': p[1]} for p in points]
    line['approach_geometry_fingerprint'] = path_fingerprint(points)
    line['stops'][1].update(latitude=52.001, longitude=11.00002)
    line['stops'][2].update(latitude=52.003, longitude=11.00002)
    result = audit_snapshots(network, map_data)
    row = result['patterns'][0]
    assert 'STOP_PROJECTION_DISAGREEMENT_REVIEW' in row['review_flags']
    assert row['max_projection_disagreement_m'] > 100
    assert not row['physical_accuracy_verified']


@pytest.mark.parametrize('bad,reason', [
    ('fingerprint', 'GEOMETRY_FINGERPRINT_MISMATCH'),
    ('missing_fingerprint', 'MISSING_GEOMETRY_FINGERPRINT'),
    ('stop', 'STOP_OCCURRENCE_MISMATCH'),
    ('invalid', 'MAP_GEOMETRY_NOT_VALIDATED'),
    ('coordinate', 'INVALID_POINTS'),
])
def test_identity_and_untrusted_inputs_are_reported(snapshots, bad, reason):
    network, map_data = snapshots
    line = map_data['lines'][0]
    if bad == 'fingerprint': line['approach_geometry_fingerprint'] = 'other'
    if bad == 'missing_fingerprint': line.pop('approach_geometry_fingerprint')
    if bad == 'stop': line['stops'][1]['stop_id'] = 'X'
    if bad == 'invalid': line['valid'] = False
    if bad == 'coordinate': line['points'][0]['latitude'] = float('nan')
    assert reason in audit_snapshots(network, map_data)['patterns'][0]['technical_issues']


def test_missing_dated_patterns_and_other_day_are_not_silently_merged(snapshots):
    network, map_data = snapshots
    extra_trip = {'trip_id': 'T2', 'headsign': 'Other', 'stop_ids': ['A', 'B']}
    network['routes'][0]['trips'].append(extra_trip)
    foreign = deepcopy(map_data['lines'][0]); foreign['service_date'] = '2026-11-03'
    map_data['lines'].append(foreign)
    result = audit_snapshots(network, map_data)
    assert result['scope']['foreign_dated_map_rows_excluded'] == 1
    assert result['counts']['patterns_absent_from_map'] == 1
    assert len(result['patterns']) == 1


def test_no_matching_date_and_missing_network_date_fail_closed(snapshots):
    network, map_data = snapshots
    map_data['lines'][0]['service_date'] = '2026-11-03'
    with pytest.raises(ValueError, match='no map lines match'):
        audit_snapshots(network, map_data)
    network['name'] = 'undated'
    with pytest.raises(ValueError, match='dated identity'):
        audit_snapshots(network, map_data)


def test_duplicate_patterns_and_mode_mismatch_are_not_verified(snapshots):
    network, map_data = snapshots
    map_data['lines'].append(deepcopy(map_data['lines'][0]))
    wrong_mode = deepcopy(map_data['lines'][0]); wrong_mode['mode'] = 'bus'
    map_data['lines'].append(wrong_mode)
    rows = audit_snapshots(network, map_data)['patterns']
    assert 'DUPLICATE_PATTERN_IDENTITY' in rows[1]['technical_issues']
    assert 'PATTERN_NOT_IN_DATED_NETWORK' in rows[2]['technical_issues']


def test_cli_refuses_to_overwrite_a_report(snapshots, tmp_path):
    network, map_data = snapshots
    p = tmp_path / 'network.json'; p.write_text(json.dumps(network), encoding='utf-8')
    q = tmp_path / 'map.json'; q.write_text(json.dumps(map_data), encoding='utf-8')
    out = tmp_path / 'existing.json'; out.write_text('keep', encoding='utf-8')
    script = Path(__file__).resolve().parents[1] / 'tools' / 'audit_transit_geometry.py'
    env = {**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'}
    run = subprocess.run([sys.executable, '-B', str(script), '--network', str(p), '--map', str(q),
                          '--output', str(out)], capture_output=True, text=True, env=env, timeout=30)
    assert run.returncode != 0
    assert out.read_text(encoding='utf-8') == 'keep'
