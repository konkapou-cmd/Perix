"""Synthetic V6/V7 release-gate linkage checks; not evidence of real MVB ETA."""
from pathlib import Path
import json

from mobility.release_gate import release_gate
from mobility.official_route_audit import normalize_stop_name

REFERENCE = Path(__file__).with_name('MVB_OFFICIAL_2026-10-17_2026-11-01_UNREVIEWED.json')


def sample():
    ref = json.loads(REFERENCE.read_text(encoding='utf-8'))
    routes = {}
    for i, official in enumerate(ref['routes']):
        key = official['route_number']
        route = routes.setdefault(key, {'route_number': key, 'mode': 'tram', 'stops': [], 'trips': []})
        ids = []
        for name in official['stop_names']:
            sid = key + ':' + normalize_stop_name(name)
            ids.append(sid)
            if sid not in {stop['stop_id'] for stop in route['stops']}:
                route['stops'].append({'stop_id': sid, 'name': name, 'lat': 52.10, 'lng': 11.60})
        route['trips'].append({'trip_id': 'synthetic:' + str(i), 'stop_ids': ids,
                               'headsign': official['to'], 'start': '12:00', 'end': '13:00',
                               'stop_times': {x: '12:05' for x in ids}})
    net = {'region_id': ref['region_id'], 'network_id': ref['network_id'],
           'service_date': '2026-10-18', 'timezone': 'Europe/Berlin',
           'routes': list(routes.values())}
    return net, ref


def test_public_reference_integration_does_not_create_automatic_release():
    network, reference = sample()
    outcome = release_gate(network, official_reference=reference, require_official_reference=True)
    assert outcome['reports']['official_route_stop_order']['matched_variants'] == 8
    assert outcome['status'] == 'INSUFFICIENT_EVIDENCE'
    assert outcome['safe_to_deploy_automatically'] is False


def test_release_requires_reference_when_configured():
    network, _ = sample()
    result = release_gate(network, require_official_reference=True)
    assert 'dated_operator_reviewed_official_stop_list' in result['missing_evidence']


def test_mismatch_is_release_blocker():
    network, reference = sample()
    route = next(r for r in network['routes'] if r['route_number'] == '9S')
    route['trips'][0]['stop_ids'][4], route['trips'][0]['stop_ids'][5] = (
        route['trips'][0]['stop_ids'][5], route['trips'][0]['stop_ids'][4])
    result = release_gate(network, official_reference=reference, require_official_reference=True)
    assert result['status'] == 'BLOCKED'
    assert 'OFFICIAL_ROUTE_STOP_ORDER_CONFLICT' in result['blocking']


def test_old_official_reference_is_not_reused_after_november():
    network, reference = sample()
    network['service_date'] = '2026-11-02'
    outcome = release_gate(network, official_reference=reference, require_official_reference=True)
    assert outcome['status'] == 'INSUFFICIENT_EVIDENCE'
    assert 'official_reference_applicable_to_current_service_date' in outcome['missing_evidence']
