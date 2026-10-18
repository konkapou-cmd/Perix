"""Synthetic replay of official *public list* transcription (not MVB trip evidence)."""
from copy import deepcopy
import json
from pathlib import Path

from mobility.official_route_audit import normalize_stop_name, official_route_audit

REF = Path(__file__).with_name('MVB_OFFICIAL_2026-10-17_2026-11-01_UNREVIEWED.json')
# In the repository this fixture is stored under tools/references; the installer
# copies the same object into tests/fixtures for deterministic unit tests.


def official():
    return json.loads(REF.read_text(encoding='utf-8'))


def network_from_reference():
    """Synthetic GTFS: IDs and trips INVENTED solely for unit testing."""
    data = official()
    groups = {}
    for i, item in enumerate(data['routes']):
        rn = item['route_number']
        route = groups.setdefault(rn, {'route_number': rn, 'mode': 'tram', 'stops': [], 'trips': []})
        seq = []
        for name in item['stop_names']:
            normalized = normalize_stop_name(name)
            sid = f'SYNTHETIC_{rn}_{normalized}'
            seq.append(sid)
            if sid not in {x['stop_id'] for x in route['stops']}:
                route['stops'].append({'stop_id': sid, 'name': name})
        route['trips'].append({'trip_id': f'FAKE_{rn}_{i}', 'stop_ids': seq, 'headsign': item['to']})
    return {'region_id': 'magdeburg', 'network_id': 'de-magdeburg-mvb',
            'service_date': '2026-10-18', 'routes': list(groups.values())}


def test_all_eight_official_directions_compare_but_do_not_auto_approve():
    report = official_route_audit(network_from_reference(), official())
    assert report['matched_variants'] == report['total_variants'] == 8
    assert report['status'] == 'INSUFFICIENT_EVIDENCE'
    assert not report['errors']
    assert 'operator_approval_of_transcription_and_gtfs_stop_mapping' in report['missing_evidence']


def test_approval_metadata_changes_evidence_status_but_is_not_signature():
    r = official()
    r['operator_approved'] = True
    report = official_route_audit(network_from_reference(), r)
    assert report['status'] == 'STOP_LIST_TECHNICAL_MATCH'
    assert 'No timetable times' in report['what_is_proven']


def test_swapped_middle_stops_are_blocked():
    network = network_from_reference()
    trip = next(x for x in network['routes'] if x['route_number'] == '9N')['trips'][0]
    trip['stop_ids'][8:10] = list(reversed(trip['stop_ids'][8:10]))
    assert official_route_audit(network, official())['status'] == 'BLOCKED'


def test_reverse_9s_uses_stops_not_inconsistent_mvb_heading():
    r = official()
    nine = [x for x in r['routes'] if x['route_number'] == '9S' and x['from'] == 'Reform'][0]
    assert nine['stop_names'][0] == 'Reform'
    assert nine['stop_names'][-1] == 'Hauptbahnhof/Willy-Brandt-Platz'
    assert '9S reverse' in ' '.join(r['editorial_discrepancies'])


def test_only_documented_aliases_are_allowed():
    assert normalize_stop_name('Pablo-Piccasso-Straße') == normalize_stop_name('Pablo-Picasso-Straße')
    assert normalize_stop_name('Turmschanzenstraße/Friedensbr.') == normalize_stop_name('Turmschanzenstraße/Friedensbrücke')
    assert normalize_stop_name('Cracau (Pechauer Platz)') == normalize_stop_name('Cracau')
    assert normalize_stop_name('G.-Hauptmann-Straße') == normalize_stop_name('Gerhart-Hauptmann-Straße')
    assert normalize_stop_name('City Carré') != normalize_stop_name('Hauptbahnhof')


def test_missing_special_line_is_not_silently_mapped_to_normal_line():
    network = network_from_reference()
    network['routes'] = [r for r in network['routes'] if r['route_number'] != '9S']
    report = official_route_audit(network, official())
    assert report['status'] == 'BLOCKED'
    assert any(x['code'] == 'NO_ROUTE_NUMBER_IN_ACTIVE_GTFS' for x in report['errors'])


def test_wrong_transport_mode_fails():
    network = network_from_reference()
    network['routes'][0]['mode'] = 'bus'
    report = official_route_audit(network, official())
    assert any(x['code'] == 'ROUTE_MODE_MISMATCH' for x in report['errors'])


def test_outdated_reference_cannot_certify_new_day():
    network = network_from_reference()
    network['service_date'] = '2026-11-02'
    report = official_route_audit(network, official())
    assert report['status'] == 'OUTSIDE_REFERENCE_WINDOW'
    assert 'reference_for_current_service_date' in report['missing_evidence']


def test_missing_stop_name_fails_instead_of_guessing():
    network = network_from_reference()
    route = next(r for r in network['routes'] if r['route_number'] == '1S')
    route['stops'][1]['name'] = ''
    report = official_route_audit(network, official())
    assert report['matched_variants'] < 8
    assert report['status'] == 'BLOCKED'


def test_ambiguous_short_turn_is_reported_for_manual_review():
    network = network_from_reference()
    route = next(r for r in network['routes'] if r['route_number'] == '9N')
    route['trips'].extend([
        {'trip_id': 'SYNTHETIC_SHORT1', 'stop_ids': route['trips'][0]['stop_ids'][:7]},
        {'trip_id': 'SYNTHETIC_SHORT2', 'stop_ids': route['trips'][0]['stop_ids'][:8]},
    ])
    result = official_route_audit(network, official())
    assert result['matched_variants'] == 8
    assert any(x['code'] == 'ADDITIONAL_TRIP_PATTERNS_NEED_OPERATOR_REVIEW' for x in result['warnings'])
    assert result['status'] == 'INSUFFICIENT_EVIDENCE'


def test_missing_reference_date_is_evidence_not_a_fabricated_match():
    r = official()
    del r['valid_until']
    report = official_route_audit(network_from_reference(), r)
    assert 'dated_network_and_reference' in report['missing_evidence']


def test_wrong_region_blocks():
    network = network_from_reference()
    network['region_id'] = 'other-region'
    result = official_route_audit(network, official())
    assert result['status'] == 'BLOCKED'
    assert result['errors'][0]['code'] == 'SCOPE_MISMATCH'
