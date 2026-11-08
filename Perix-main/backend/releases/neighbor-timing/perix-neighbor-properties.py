"""Deterministic synthetic constraint checks, never inserted into live feeds."""
from pathlib import Path
from copy import deepcopy
import json
import os
import random
import sys

T=Path(__file__).parent
ROOT=T/'perix-neighbor-timing-release'
os.environ.update(MONGO_URL='mongodb://127.0.0.1:1',DB_NAME='perix_neighbor_offline')
sys.path.insert(0,str(ROOT/'context/Perix-main/backend'))
from routes import mobility as routes
from mobility.motion.timeline_fallback import position_from_timeline, clear_fallback_cache

rng=random.Random(20261025)
route={'mode':'bus','route_number':'QA','stops':[{'stop_id':sid,'name':sid,'lat':52+i/1000,'lng':11}
       for i,sid in enumerate(['A','B','C','D'])]}
trip={'trip_id':'offline-qa','stop_ids':['A','B','C','D'],
      'stop_times':{'A':'08:00','B':'08:02','C':'08:04','D':'08:06'}}
checks=0
for case in range(120):
    clear_fallback_cache()
    departure=rng.randint(-60,240)
    destination=rng.randint(-60,600)
    rt={'stop_predictions':{'A':{'departure_delay_seconds':departure},
                            'D':{'arrival_delay_seconds':destination}}}
    original=deepcopy(rt)
    timeline=routes._predicted_stop_timeline(route,trip,rt)
    assert rt==original
    assert timeline[0]['provider_predicted_departure_s']==28800+departure
    assert timeline[3]['provider_predicted_arrival_s']==29160+destination
    assert all(e['predicted_departure']>=e['predicted_arrival'] for e in timeline)
    assert all(a['predicted_departure']<=b['predicted_arrival'] for a,b in zip(timeline,timeline[1:]))
    distance=rng.randint(200,3000)
    path={'points':[[52,11],[52.003,11]],'stop_progress':[0,distance/3,2*distance/3,distance],
          'total_m':distance,'pattern_id':'offline-qa','service_date':'2026-10-25'}
    for mode in ('bus','tram'):
        for offset in (30,90,180,300,450):
            now=28800+offset
            result=position_from_timeline(trip_id='offline-qa',mode=mode,version_id='offline-qa',
                timeline=timeline,path=path,now_sec=now)
            index=result['next_timeline_index']
            eta=result['effective_timeline'][index]['predicted_arrival']-now
            assert 0<=result['progress_m']<=distance
            if eta>1:
                assert result['progress_m']<path['stop_progress'][index]
            assert result['speed_kmh']<=(45 if mode=='tram' else 50)
            assert result['signal_stop_count']==result['traffic_edge_count']==0
            checks+=1
result={'seed':20261025,'synthetic_scenarios':120,'mode_time_samples':checks,
        'provider_clocks_unchanged':True,'position_eta_constraints_passed':True,
        'speed_caps_passed':True,'database_writes':False,'live_accuracy_test':False}
(ROOT/'constraint-property-verification.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
