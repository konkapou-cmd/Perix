"""Read-only staging HTTP smoke checks. No synthetic live vehicles/updates."""
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
import json
import time

ROOT=Path(__file__).parent/'perix-sparse-realtime-release'
ORIGIN='https://backend-staging-staging-7ada.up.railway.app'
def get(path):
    start=time.perf_counter()
    try:
        with urlopen(Request(ORIGIN+'/api'+path,headers={'Cache-Control':'no-cache'}),timeout=90) as response:
            status=response.status;body=json.loads(response.read())
    except HTTPError as error:
        status=error.code;body=json.loads(error.read())
    return status,body,round((time.perf_counter()-start)*1000,2)

status,fleet,elapsed=get('/mobility/v2/vehicles')
assert status==200 and isinstance(fleet,list)
virtual=[v for v in fleet if v.get('estimated')]
gps=[v for v in fleet if not v.get('estimated')]
anchored=[v for v in virtual if v.get('position_state') in ('TURNAROUND_ANCHOR','STOP_ANCHOR')]
moving=[v for v in virtual if v not in anchored and not v.get('geometry_pending')]
assert all(v.get('estimate_revision') is None and v.get('timing_evidence') is None for v in gps)
assert all(v.get('timing_evidence') for v in moving)
assert all(v.get('estimate_revision') or v['timing_evidence'].get('position_assurance')=='LEGACY_FALLBACK_UNCERTAIN'
           or v.get('geometry_pending') for v in moving)
status,history,diag_elapsed=get('/mobility/v2/diagnostic/source-timing?limit=10')
assert status==200 and history['retention']=='WORKER_MEMORY_BOUNDED'
assert history['max_events']==2048 and history['max_bytes']==4194304 and history['ttl_seconds']==900
assert not any(set(e)&{'latitude','longitude','vehicle_id','user_id','api_key'} for e in history['events'])
assert get('/mobility/v2/diagnostic/source-timing?trip_id=T')[0]==422
assert get('/mobility/v2/diagnostic/source-timing?limit=101')[0]==422
assert get('/mobility/v2/diagnostic/source-timing?service_date=not-a-date')[0]==422
sample=None
if virtual:
    vehicle=next((v for v in virtual if v.get('estimate_revision') and
        (v.get('timing_evidence') or {}).get('timing_basis')=='PROPAGATED_STOP_DEPARTURE'),
        next((v for v in virtual if v.get('estimate_revision')),virtual[0]))
    status,details,detail_elapsed=get('/mobility/vehicles/'+quote(vehicle['vehicle_id'],safe='')+'/trip')
    assert status==200
    assert details.get('estimated') and details.get('timing_evidence')
    assert details['trip_id']==vehicle['trip_id']
    assert details.get('estimate_revision')==vehicle.get('estimate_revision')
    query=urlencode({'trip_id':vehicle['trip_id'],'service_date':vehicle['service_date'],
                     'network_version_id':vehicle['network_version_id'],'limit':10})
    assert get('/mobility/v2/diagnostic/source-timing?'+query)[0]==200
    sample={'trip_id':vehicle['trip_id'],'version_id':vehicle['network_version_id'],'service_date':vehicle['service_date'],
            'timing_basis':vehicle['timing_evidence'].get('timing_basis'),
            'source_status':vehicle['timing_evidence'].get('source_status'),
            'position_assurance':vehicle['timing_evidence'].get('position_assurance'),
            'estimate_revision_matches_detail':True,'detail_ms':detail_elapsed}
result={'origin':ORIGIN,'read_only':True,'fleet_count':len(fleet),'virtual_count':len(virtual),
        'anchored_schedule_count':len(anchored),'moving_with_evidence_count':len(moving),
        'anchored_schedule_without_timing_evidence':sum(not v.get('timing_evidence') for v in anchored),
        'gps_count':len(gps),'gps_virtual_fields_absent':True,
        'live_gps_observation_tested':bool(gps),'virtual_sample':sample,
        'fleet_ms':elapsed,'diagnostic_ms':diag_elapsed,'history_retained_events':history['retained_events'],
        'history_dropped_events':history['dropped_events'],'scope_validation_passed':True,
        'synthetic_live_updates_inserted':False,'production_changed':False}
(ROOT/'stage-api-verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
