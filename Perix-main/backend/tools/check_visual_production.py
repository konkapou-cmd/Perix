"""Low-rate, read-only production web checks; not a capacity/SLO test."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import time
from urllib.parse import quote

import httpx

from visual_production_release import ORIGIN


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release',type=Path,required=True)
    parser.add_argument('--skip-osm-export',action='store_true',
        help='Do not repeat the large data download for a frontend-only correction; not a new export pass')
    parser.add_argument('--visual-preview-seconds',type=int,choices=(8,45),default=8)
    args = parser.parse_args()
    manifest = json.loads((args.release/'runtime-manifest.json').read_text())
    checks = []
    def get(client,path):
        start = time.monotonic()
        response = client.get(path)
        checks.append(dict(path=path,status=response.status_code,seconds=round(time.monotonic()-start,3),bytes=len(response.content)))
        response.raise_for_status()
        return response
    result = dict(origin=ORIGIN,checks=checks,capacity_test=False)
    try:
        with httpx.Client(base_url=ORIGIN,timeout=90,trust_env=False) as client:
            for path in ('/app','/locator?tab=mobility'):
                page = get(client,path)
                assert manifest['frontend_entry'] in page.text
            entry = get(client,'/_expo/static/js/web/'+manifest['frontend_entry'])
            assert hashlib.sha256(entry.content).hexdigest()==manifest['frontend_entry_sha256']
            assert ORIGIN in entry.text and 'backend-staging-staging-7ada.up.railway.app' not in entry.text
            networks = get(client,'/api/mobility/v2/networks').json()
            assert networks and all(n.get('service_date') for n in networks)
            result['networks'] = networks
            fleets = []
            selected = None
            for _ in range(3):
                path='/api/mobility/v2/vehicles'+('?visual_preview_seconds=45' if args.visual_preview_seconds==45 else '')
                rows = get(client,path).json()
                estimates = [r for r in rows if r.get('estimated')]
                assert estimates
                assert any((r.get('motion') or {}).get('publication_status')=='READY'
                    and (r.get('motion') or {}).get('preview') for r in estimates)
                registered = [r for r in rows if not r.get('estimated')]
                assert all(r.get('identity_kind')=='PHYSICAL'
                    and (r.get('motion') or {}).get('model')!='TIME_NORMALIZED_VISUAL_ESTIMATE' for r in registered)
                for row in estimates:
                    motion = row.get('motion') or {}
                    assert motion.get('model')=='TIME_NORMALIZED_VISUAL_ESTIMATE'
                    assert motion.get('physical_speed_assurance') is False
                    assert motion.get('observed_arrival') is False
                    assert motion.get('speed_kmh') is None
                    assert row.get('next_stop_predicted_arrival')==row.get('source_next_stop_predicted_arrival')
                fleets.append(dict(estimated=len(estimates),registered_gps=len(registered),
                    preview_horizons_s=[round((p['valid_until_ms']-p['sampled_at_ms'])/1000,3)
                        for r in estimates if (p:=(r.get('motion') or {}).get('preview'))],
                    publication=dict(Counter((r.get('motion') or {}).get('publication_status') for r in estimates)),
                    source_statuses=dict(Counter((r.get('timing_evidence') or {}).get('source_status') for r in estimates)),
                    modes=dict(Counter(r.get('mode') for r in estimates))))
                selected = next((r for r in estimates if r.get('next_stop_id') and (r.get('next_stop_eta_seconds') or 0)>90),None)
            result['fleets'] = fleets
            map_data = get(client,'/api/mobility/v2/map').json()
            assert map_data.get('lines')
            result['map'] = dict(lines=len(map_data['lines']),valid=sum(r.get('valid') is True for r in map_data['lines']))
            notice = get(client,'/api/mobility/v2/data-sources')
            assert 'ODbL' in notice.text and 'not measured GPS' in notice.text
            if not args.skip_osm_export:
                offered = get(client,'/api/mobility/v2/osm-derived').json()
                assert offered['licence']=='ODbL-1.0' and offered['patterns']
                assert all(p['geometry']['source'] in ('OSM_ROADS','OSM_RAIL','OSM_ROADS_SEGMENTS','OSM_RAIL_SEGMENTS') for p in offered['patterns'])
                result['export_patterns'] = len(offered['patterns'])
            else:
                result['osm_export_check'] = 'NOT_REPEATED; not a new export pass'
            if selected:
                board = get(client,'/api/mobility/v2/stops/'+quote(selected['next_stop_id'],safe='')+'/arrivals').json()
                match = next((r for r in board if r.get('trip_instance_id')==selected['trip_instance_id']),None)
                if match:
                    assert match['observed_arrival'] is False
                    assert match['predicted_arrival']==match['source_predicted_arrival']
                    result['board_check'] = dict(matching_trip=True,source_clock_equal=True,
                        target_unchanged_since_fleet=match['predicted_arrival']==selected['next_stop_predicted_arrival'])
                else:
                    result['board_check'] = dict(matching_trip=False,reason='No same-trip row in limited/current source board; not asserted')
                details = get(client,'/api/mobility/vehicles/'+quote(selected['vehicle_id'],safe='')+'/trip').json()
                result['trip_details_available'] = bool(details.get('stops'))
            result['passed'] = True
    except Exception as exc:
        result['passed'] = False
        result['error_type'] = type(exc).__name__
        raise
    finally:
        path = args.release/('production-public-check-'+str(time.time_ns())+'.json')
        path.write_text(json.dumps(result,indent=2),encoding='utf-8')
        print(json.dumps(result))


if __name__=='__main__':
    main()
