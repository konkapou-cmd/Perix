"""Read-only production smoke: actual dated vehicles, details and exact platforms."""
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from collections import Counter
import json
import math
import time

ROOT = Path(__file__).parent / 'perix-neighbor-timing-release'
ORIGIN = 'https://app.perix.eu'
requests = []

def get(path):
    start = time.monotonic()
    try:
        with urlopen(Request(ORIGIN + '/api' + path, headers={'Cache-Control': 'no-cache'}), timeout=90) as response:
            status, body = response.status, json.load(response)
    except HTTPError as error:
        status, body = error.code, json.loads(error.read())
    elapsed = time.monotonic() - start
    requests.append({'endpoint': path.split('?')[0], 'status': status, 'ms': round(elapsed * 1000, 2)})
    return status, body

status, fleet = get('/mobility/v2/vehicles')
assert status == 200 and isinstance(fleet, list)
virtual = [v for v in fleet if v.get('estimated')]
gps = [v for v in fleet if not v.get('estimated')]
anchored = [v for v in virtual if v.get('position_state') in ('TURNAROUND_ANCHOR', 'STOP_ANCHOR')]
moving = [v for v in virtual if v not in anchored and not v.get('geometry_pending')]
assert all(v.get('timing_evidence') and v.get('estimate_revision') for v in moving)
assert all(v.get('estimate_revision') is None and v.get('timing_evidence') is None for v in gps)
assert len({v['vehicle_id'] for v in fleet}) == len(fleet)
status, stops = get('/mobility/v2/stops')
assert status == 200 and isinstance(stops, list)
status, history = get('/mobility/v2/diagnostic/source-timing?limit=10')
assert status == 200 and history['retention'] == 'WORKER_MEMORY_BOUNDED'
assert (history['max_events'], history['max_bytes'], history['ttl_seconds']) == (2048, 4194304, 900)
assert not any(set(e) & {'latitude', 'longitude', 'vehicle_id', 'user_id', 'api_key'} for e in history['events'])
for query in ('trip_id=T', 'limit=101', 'service_date=not-a-date'):
    assert get('/mobility/v2/diagnostic/source-timing?' + query)[0] == 422

samples = []
for mode in ('bus', 'tram'):
    candidates = [v for v in moving if v.get('mode') == mode and (v.get('next_stop_eta_seconds') or 0) >= 90]
    if not candidates:
        samples.append({'mode': mode, 'tested': False, 'reason': 'No suitable active dated sample'})
        continue
    candidates.sort(key=lambda v: ((v['timing_evidence'].get('timing_basis') != 'BETWEEN_STOP_UPDATES'),
                                    v.get('next_stop_eta_seconds') or 0))
    v = candidates[0]
    start = time.monotonic()
    status, detail = get('/mobility/vehicles/' + quote(v['vehicle_id'], safe='') + '/trip')
    assert status == 200, 'Selected journey detail unavailable'
    assert detail['trip_id'] == v['trip_id'] and detail['vehicle_id'] == v['vehicle_id']
    assert detail.get('service_date') == v['service_date']
    assert detail.get('network_version_id') == v['network_version_id']
    assert detail['estimated'] and detail.get('timing_evidence')
    same_plan = detail.get('motion_plan_revision') == v.get('motion_plan_revision')
    same_revision = detail.get('estimate_revision') == v.get('estimate_revision')
    index = detail.get('next_timeline_index')
    if same_plan:
        assert type(index) is int and 0 <= index < len(detail['stops'])
        assert detail['stops'][index]['stop_id'] == v['next_stop_id']
        assert detail['stops'][index]['predicted'] == v['next_stop_predicted_arrival']
        assert not detail['stops'][index]['passed']
    platform = str(v.get('next_stop_id') or '')
    physical = next((s for s in stops if platform in [str(x) for x in s.get('stop_ids', [])]
        or any(str(p.get('platform_id')) == platform for p in s.get('platforms', []))), None)
    board_match = None
    if physical:
        status, board = get('/mobility/v2/stops/' + quote(str(physical['stop_id']), safe='') +
                            '/arrivals?' + urlencode({'platform_id': platform}))
        assert status == 200 and isinstance(board, list)
        board_match = next((a for a in board if str(a.get('trip_id')) == str(v['trip_id'])
            and a.get('service_date') == v['service_date']
            and a.get('network_version_id') == v['network_version_id']), None)
        if board_match:
            assert str(board_match['platform_id']) == platform
            if board_match.get('motion_plan_revision') == v.get('motion_plan_revision'):
                assert board_match['predicted_arrival'] == v['next_stop_predicted_arrival']
                if board_match.get('eta_seconds') is not None:
                    assert abs(board_match['eta_seconds'] - v['next_stop_eta_seconds']) <= max(15, math.ceil(time.monotonic() - start) + 5)
    scope = urlencode({'trip_id': v['trip_id'], 'service_date': v['service_date'],
                       'network_version_id': v['network_version_id'], 'limit': 10})
    assert get('/mobility/v2/diagnostic/source-timing?' + scope)[0] == 200
    samples.append({'mode': mode, 'tested': True, 'trip_id': v['trip_id'],
        'vehicle_id': v['vehicle_id'], 'service_date': v['service_date'],
        'version_id': v['network_version_id'], 'timing_basis': v['timing_evidence'].get('timing_basis'),
        'source_status': v['timing_evidence'].get('source_status'),
        'position_assurance': v['timing_evidence'].get('position_assurance'),
        'same_plan_as_detail': same_plan, 'same_estimate_revision_as_detail': same_revision,
        'platform_lookup_available': bool(physical), 'dated_trip_present_on_board': bool(board_match),
        'board_same_plan_as_marker': bool(board_match and board_match.get('motion_plan_revision') == v.get('motion_plan_revision'))})

result = {'origin': ORIGIN, 'read_only': True, 'production_changed': True,
    'fleet_count': len(fleet), 'virtual_count': len(virtual), 'moving_with_evidence': len(moving),
    'schedule_anchor_count': len(anchored), 'gps_count': len(gps),
    'live_gps_observation_tested': bool(gps), 'gps_virtual_fields_absent': True,
    'timing_basis_counts': dict(Counter((v.get('timing_evidence') or {}).get('timing_basis', 'UNAVAILABLE_ANCHOR') for v in virtual)),
    'motion_quality_counts': dict(Counter((v.get('motion') or {}).get('quality', 'UNAVAILABLE_ANCHOR') for v in virtual)),
    'samples': samples, 'requests': requests, 'diagnostic_scope_checks_passed': True,
    'history_retained_events': history['retained_events'], 'history_dropped_events': history['dropped_events'],
    'synthetic_live_updates_inserted': False, 'database_writes': False}
(ROOT / 'production-api-verification.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, indent=2))
