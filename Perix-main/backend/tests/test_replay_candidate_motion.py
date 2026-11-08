"""Exercise the isolated actual solver in a separate process with synthetic data."""
import json
import os
import subprocess
import sys
from pathlib import Path


def test_isolated_schedule_motion_replay_and_dated_guard():
    code = r'''
import asyncio, copy, json
from mobility.domain import _pattern_id, _pattern_key
from tools.rebuild_transit_offline import parse_osm
from tools.replay_stop_snap_hypothesis import replay
from tools.replay_candidate_motion import build_offline_infra, build_timeline, run_model
a,b,c=[52,11],[52.001,11],[52.002,11]
def way(wid, ids, pts, tags):
 return {'type':'way','id':wid,'nodes':ids,'geometry':[{'lat':p[0],'lon':p[1]} for p in pts],'tags':tags}
source=parse_osm({'osm3s':{'timestamp_osm_base':'2026-11-02T00:00:00Z'},'elements':[
 way(1,[1,2,3],[a,b,c],{'railway':'tram','maxspeed':'40'}),
 way(2,[11,12,13],[a,b,c],{'highway':'residential'})]},[51.9,10.9,52.1,11.1])
trip={'trip_id':'trip','headsign':'End','stop_ids':['a','b','c'],'stop_sequences':[0,1,2],
 'stop_times_sequence':[{'stop_id':sid,'stop_sequence':i,'arrival_time':f'10:0{i}',
 'departure_time':f'10:0{i}'} for i,sid in enumerate(('a','b','c'))]}
pid=_pattern_id('N8',_pattern_key(trip))
line={'pattern_id':pid,'mode':'tram','network_version_id':'v','service_date':'2026-11-02',
 'stops':[{'stop_id':sid,'latitude':p[0],'longitude':p[1]} for sid,p in zip(('a','b','c'),(a,b,c))]}
network={'version_id':'v','name':'2026-11-02','routes':[{'mode':'tram','route_number':'N8','trips':[trip]}]}
prior={'pattern_id':pid,'mode':'tram','new_length_m':222,'segments':[
 {'a_idx':0,'b_idx':1,'points':[a,b],'edge_ids':['1:1:2']},
 {'a_idx':1,'b_idx':2,'points':[b,c],'edge_ids':['1:2:3']}]}
candidate=replay(line,prior,source,[51.9,10.9,52.1,11.1],{})
timeline=build_timeline(network,line,'trip')
result=asyncio.run(run_model(candidate,line,source,timeline,'trip'))
bad={**network,'version_id':'other'}
try: build_timeline(bad,line,'trip'); rejected=False
except ValueError: rejected=True
corrupt=copy.deepcopy(candidate); corrupt['segments'][0]['edge_ids'][0]='999:1:2'
try: build_offline_infra(corrupt,line,source); rejected_edge=False
except ValueError: rejected_edge=True
print(json.dumps({'result':result,'rejected_wrong_network':rejected,'rejected_forged_edge':rejected_edge}))
'''
    env = {**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'}
    run = subprocess.run([sys.executable, '-B', '-c', code], cwd=Path(__file__).resolve().parents[1],
                         env=env, capture_output=True, text=True, timeout=30)
    assert run.returncode == 0, run.stderr
    result = json.loads(run.stdout)
    assert result['rejected_wrong_network']
    assert result['rejected_forged_edge']
    assert result['result']['status'] == 'MODELED_REPLAY_ONLY'
    assert result['result']['sample_count'] == 10
    assert result['result']['sample_errors'] == []
    assert result['result']['position_source'] == 'MODELED_NOT_GPS'
    assert result['result']['traffic_inputs'] == 'NONE_NOT_OBSERVED'
