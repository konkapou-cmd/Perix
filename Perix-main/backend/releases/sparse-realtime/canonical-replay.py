"""Offline real-journey replay using the captured canonical OSM generation."""
from pathlib import Path
from copy import deepcopy
from unittest.mock import AsyncMock, patch
import asyncio
import hashlib
import json
import os
import statistics
import sys
import time

T = Path(__file__).parent
ROOT = T / 'perix-sparse-realtime-release'
os.environ.update(MONGO_URL='mongodb://127.0.0.1:1', DB_NAME='perix_sparse_offline')
sys.path.insert(0, str(ROOT / 'context/Perix-main/backend'))
from routes import mobility as routes
from mobility import generations, geometry_cache
from mobility.motion import engine

capture = json.loads((T / 'perix-am-fuchsberg-9/capture-20261025-171257.json').read_bytes())
original = next(t for c in capture['contexts'] if c['version'] == 'net_7f0605d2409e'
                for t in c['candidates'] if t['trip_id'] == '1221147')
inputs = json.loads((ROOT / 'captured-canonical-trip.json').read_bytes())
bundle = json.loads((ROOT / 'captured-canonical-generation.json').read_bytes())
rt = original['realtime']
before = deepcopy(rt)
timeline = routes._predicted_stop_timeline(inputs['route'], inputs['trip'], rt)
assert rt == before
am_index = next(i for i,e in enumerate(timeline) if str(e['stop_id']) == '639170')
assert timeline[am_index]['predicted_arrival'] == 18*3600+7*60+27
assert original['source_timeline'][am_index]['predicted_arrival'] == 18*3600+5*60+52
entry = {**bundle['geometry'], 'generation_id': bundle['generation_id'],
         'osm_snapshot_v': bundle['osm_snapshot_v']}

async def run():
    with patch.object(geometry_cache, 'get_entry', return_value=entry), \
         patch.object(generations, 'atomic_generations_enabled', return_value=True), \
         patch.object(generations, 'get_pattern_generation', AsyncMock(return_value=bundle)):
        path = await routes._trip_path_geometry(inputs['route'], inputs['trip'], timeline, inputs['network'])
        assert path['pattern_id'] == bundle['pattern_id']
        assert path['derived_generation'] == bundle['generation_id']
        path['service_date'] = rt['service_date']
        kwargs = dict(trip_id='1221147', mode='tram', version_id=bundle['version_id'], path=path)
        rows=[];cold=[];warm=[]
        for now in [18*3600+5*60+30,18*3600+6*60,18*3600+6*60+30,18*3600+7*60,18*3600+7*60+27,18*3600+8*60]:
            engine.clear_motion_cache()
            start=time.perf_counter()
            result=await engine.position_for_trip(**kwargs,timeline=timeline,now_sec=now,include_failure_reason=True)
            cold.append((time.perf_counter()-start)*1000)
            assert result and not result.get('fallback_reason'),result
            start=time.perf_counter()
            repeated=await engine.position_for_trip(**kwargs,timeline=timeline,now_sec=now,include_failure_reason=True)
            warm.append((time.perf_counter()-start)*1000)
            assert repeated['progress_m']==result['progress_m']
            effective=result['effective_timeline'];idx=result['next_timeline_index']
            # Same plan drives marker progress and detail/board projections.
            assert 0<=result['progress_m']<=path['total_m']
            assert all(e['predicted_departure']>=e['predicted_arrival'] for e in effective)
            assert effective[am_index]['source_predicted_arrival']==timeline[am_index]['predicted_arrival']
            rows.append({'service_s':now,'progress_m':round(result['progress_m'],2),
                'am_fuchsberg_progress_m':round(path['stop_progress'][am_index],2),
                'next_timeline_index':idx,'next_stop_id':effective[idx]['stop_id'],
                'eta_seconds':max(0,effective[idx]['predicted_arrival']-now),
                'source_am_arrival_s':timeline[am_index]['predicted_arrival'],
                'effective_am_arrival_s':effective[am_index]['predicted_arrival'],
                'motion_model':result.get('motion_model')})
        # Exercise a real physics plan under controlled *prediction*, not GPS,
        # revision: provider has not yet departed Am Fuchsberg at 18:08:00.
        engine.clear_motion_cache()
        now=18*3600+8*60
        old=await engine.position_for_trip(**kwargs,timeline=timeline,now_sec=now)
        revised=deepcopy(timeline)
        for e in revised[am_index:]:
            e['predicted_arrival']+=180;e['predicted_departure']+=180
        revised[am_index].update(timing_basis='DIRECT_STOP_UPDATE',departure_timing_basis='DIRECT_STOP_UPDATE',
            provider_predicted_arrival_s=revised[am_index]['predicted_arrival'],
            provider_predicted_departure_s=revised[am_index]['predicted_departure'])
        corrected=await engine.position_for_trip(**kwargs,timeline=revised,now_sec=now)
        assert old['progress_m']>path['stop_progress'][am_index]
        assert corrected['progress_m']<path['stop_progress'][am_index]
        assert corrected['estimate_revision']!=old['estimate_revision']
        assert corrected.get('source_correction'),corrected
        return {'trip_id':'1221147','service_date':rt['service_date'],'version_id':bundle['version_id'],
          'canonical_generation':bundle['generation_id'],'canonical_points':len(path['points']),
          'geometry_sha256':hashlib.sha256(json.dumps(path['points']).encode()).hexdigest(),
          'rows':rows,'cold_ms':{'median':round(statistics.median(cold),2),'max':round(max(cold),2)},
          'warm_ms':{'median':round(statistics.median(warm),2),'max':round(max(warm),2)},
          'controlled_revision':{'not_an_actual_provider_capture':True,'before_m':old['progress_m'],
             'after_m':corrected['progress_m'],'reason':corrected['source_correction']},
          'provider_records_unchanged':rt==before,'database_writes':False,'gps_proof':False}

result=asyncio.run(run())
(ROOT/'canonical-replay-verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
