"""Concurrent read-only comparisons avoid treating normal plan refresh as mismatch."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import quote, urlencode
import json

ROOT = Path(__file__).parent / 'perix-neighbor-timing-release'
ORIGIN = 'https://app.perix.eu'
def get(path):
    with urlopen(Request(ORIGIN + '/api' + path, headers={'Cache-Control': 'no-cache'}), timeout=90) as response:
        return json.load(response)

stops = get('/mobility/v2/stops')
reports = []
for mode in ('bus', 'tram'):
    fleet = get('/mobility/v2/vehicles')
    choices = [v for v in fleet if v.get('estimated') and v.get('mode') == mode
        and v.get('motion_plan_revision') and (v.get('next_stop_eta_seconds') or 0) >= 90
        and (v.get('distance_to_next_stop_m') or 0) > 20]
    if not choices:
        reports.append({'mode': mode, 'tested': False, 'reason': 'No suitable active moving sample'})
        continue
    choices.sort(key=lambda v: ((v.get('route') or {}).get('number') == '13',
        (v.get('timing_evidence') or {}).get('timing_basis') != 'BETWEEN_STOP_UPDATES',
        v['next_stop_eta_seconds']))
    selected = choices[0]
    platform = str(selected['next_stop_id'])
    physical = next((s for s in stops if platform in [str(p) for p in s.get('stop_ids', [])]
        or any(str(p.get('platform_id')) == platform for p in s.get('platforms', []))), None)
    assert physical, 'Exact physical platform lookup unavailable'
    board_url = '/mobility/v2/stops/' + quote(str(physical['stop_id']), safe='') + '/arrivals?' + urlencode({'platform_id': platform})
    attempts = []
    for attempt in range(2):
        with ThreadPoolExecutor(max_workers=3) as pool:
            f = pool.submit(get, '/mobility/v2/vehicles')
            d = pool.submit(get, '/mobility/vehicles/' + quote(selected['vehicle_id'], safe='') + '/trip')
            b = pool.submit(get, board_url)
            current, detail, board = f.result(), d.result(), b.result()
        marker = next(v for v in current if v['vehicle_id'] == selected['vehicle_id'])
        row = next((a for a in board if str(a.get('trip_id')) == str(marker['trip_id'])
            and a.get('service_date') == marker['service_date']
            and a.get('network_version_id') == marker['network_version_id']), None)
        same_plan = (row is not None and marker['motion_plan_revision'] == detail.get('motion_plan_revision') == row.get('motion_plan_revision'))
        sample = {'attempt': attempt + 1, 'same_plan': same_plan,
            'same_revision_as_detail': marker.get('estimate_revision') == detail.get('estimate_revision'),
            'dated_board_row_present': row is not None}
        if same_plan:
            index = detail['next_timeline_index']
            assert detail['stops'][index]['stop_id'] == marker['next_stop_id'] == platform
            assert not detail['stops'][index]['passed']
            assert marker['next_stop_predicted_arrival'] == detail['stops'][index]['predicted'] == row['predicted_arrival']
            assert abs(row['eta_seconds'] - marker['next_stop_eta_seconds']) <= 5
            assert marker['distance_to_next_stop_m'] > 0
            sample.update(clock_consistency_passed=True, next_stop_id=platform,
                predicted_arrival=marker['next_stop_predicted_arrival'], eta_seconds=marker['next_stop_eta_seconds'],
                board_eta_seconds=row['eta_seconds'], distance_to_next_stop_m=marker['distance_to_next_stop_m'],
                timing_basis=marker['timing_evidence']['timing_basis'])
        attempts.append(sample)
        if same_plan:
            break
    reports.append({'mode': mode, 'tested': True, 'trip_id': selected['trip_id'],
        'route_number': (selected.get('route') or {}).get('number'),
        'service_date': selected['service_date'], 'network_version_id': selected['network_version_id'],
        'attempts': attempts, 'coherent_snapshot_observed': any(a['same_plan'] for a in attempts)})
result = {'origin': ORIGIN, 'read_only': True, 'synthetic_live_updates_inserted': False,
          'samples': reports, 'all_available_samples_coherent': all(s.get('coherent_snapshot_observed', False)
               for s in reports if s['tested'])}
(ROOT / 'production-consistency-verification.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, indent=2))
assert result['all_available_samples_coherent'], 'Could not obtain a shared-plan snapshot; inspect changing source clocks'
