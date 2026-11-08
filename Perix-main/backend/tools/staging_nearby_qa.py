"""Seed/restore a synthetic, staging-only block-predecessor mobility fixture."""
import argparse
import json
from pathlib import Path
import sys
import uuid

from visual_staging_ops import DATABASE, remote


SEED = r'''
import json,uuid
from datetime import datetime
from zoneinfo import ZoneInfo
from pymongo import MongoClient
from mobility.regions import get_active_region
from mobility.domain import build_domain,_pattern_id,_pattern_key
from mobility.generations import pattern_fingerprint
from mobility.direction_contract import build_direction_contract
from mobility.approach import path_fingerprint
from mobility.roads import _haversine_m
assert os.environ['DB_NAME']==DATABASE
assert os.getenv('MOBILITY_WORKERS_ENABLED')=='false'
db=MongoClient(os.environ['MONGO_URL'])[DATABASE]
assert db.users.count_documents({})==0
assert db.bus_network_versions.count_documents({'qa_synthetic':{'$ne':True}})==0
old_active=[str(row['version_id']) for row in db.bus_network_versions.find(
 {'qa_synthetic':True,'active':True},{'_id':0,'version_id':1})]
assert len(old_active)==1, 'Expected exactly the previously active synthetic QA network'
region=get_active_region()
now=datetime.now(ZoneInfo(region.timezone));day=now.date().isoformat()
service=now.hour*3600+now.minute*60+now.second
version='qa_nearby_block_'+uuid.uuid4().hex[:12]
def fmt(s):
 s=int(s);return f'{s//3600:02d}:{s%3600//60:02d}:{s%60:02d}'
coords={'QA_A':(52.13150,11.62830),'QA_B':(52.13117,11.62845),'QA_C':(52.13197,11.62895)}
stops=[dict(stop_id=sid,name='QA SYNTHETIC — '+sid,lat=lat,lng=lng,platform_code=sid[-1])
 for sid,(lat,lng) in coords.items()]
routes=[];scopes=[];generation_docs=[];rt_docs=[]
for mode,line,suffix in [('bus','QA-BUS','BUS'),('tram','QA-TRAM','TRAM')]:
 a,b,c=(coords['QA_A'],coords['QA_B'],coords['QA_C'])
 prev_pts=[list(a),[(a[0]+b[0])/2,(a[1]+b[1])/2],list(b)]
 next_pts=[list(b),[(b[0]+c[0])/2,(b[1]+c[1])/2],list(c)]
 prev_id='QA_'+suffix+'_PREV';next_id='QA_'+suffix+'_NEXT';block='QA_'+suffix+'_VERIFIED_BLOCK'
 prev_start=service-900;prev_arrive=service+180;prev_depart=service+240
 next_arrive=service+300;next_depart=service+360;next_end=service+900
 trips=[
  dict(trip_id=prev_id,block_id=block,headsign='QA B '+suffix,shape_id='prev',stop_ids=['QA_A','QA_B'],
   stop_sequences=[1,2],start=fmt(prev_start),end=fmt(prev_depart),
   stop_times={'QA_A':fmt(prev_start),'QA_B':fmt(prev_depart)},
   stop_times_arrival={'QA_A':fmt(prev_start-30),'QA_B':fmt(prev_arrive)},
   stop_times_sequence=[dict(stop_id='QA_A',stop_sequence=1,arrival_time=fmt(prev_start-30),departure_time=fmt(prev_start)),
    dict(stop_id='QA_B',stop_sequence=2,arrival_time=fmt(prev_arrive),departure_time=fmt(prev_depart))]),
  dict(trip_id=next_id,block_id=block,headsign='QA C '+suffix,shape_id='next',stop_ids=['QA_B','QA_C'],
   stop_sequences=[1,2],start=fmt(next_arrive),end=fmt(next_end),
   stop_times={'QA_B':fmt(next_depart),'QA_C':fmt(next_end)},
   stop_times_arrival={'QA_B':fmt(next_arrive),'QA_C':fmt(next_end-30)},
   stop_times_sequence=[dict(stop_id='QA_B',stop_sequence=1,arrival_time=fmt(next_arrive),departure_time=fmt(next_depart)),
    dict(stop_id='QA_C',stop_sequence=2,arrival_time=fmt(next_end-30),departure_time=fmt(next_end))]),
 ]
 shapes={'prev':prev_pts,'next':next_pts}
 route=dict(route_number=line,mode=mode,name='QA SYNTHETIC — NOT OPERATOR SERVICE',
  stops=stops,shapes=shapes,trips=trips)
 routes.append(route)
 route_network=dict(region_id=region.region_id,network_id=region.network_id,version_id=version,
  service_date=day,timezone=region.timezone,routes=[route])
 domain=build_domain(route_network)
 for trip,points in ((trips[0],prev_pts),(trips[1],next_pts)):
  pid=_pattern_id(line,_pattern_key(trip))
  pattern=next(p for p in domain['patterns'] if p['pattern_id']==pid)
  platform_by_id={str(p['platform_id']):p for s in domain['stops'] for p in s.get('platforms',[])}
  ordered_platforms=[platform_by_id[str(sid)] for sid in pattern['stop_ids']]
  progress=0.0;edges=[];node_ids=[str(i+1) for i in range(len(points))]
  for j,(p0,p1) in enumerate(zip(points,points[1:])):
   length=_haversine_m(*p0,*p1);edge_id=f'qa_{suffix}:{j+1}:{j+2}'
   edges.append(dict(edge_id=edge_id,way_id=990000+len(generation_docs)*10+j,
    from_node=j+1,to_node=j+2,from_m=progress,to_m=progress+length,
    from_point=p0,to_point=p1,way=dict(highway='secondary',railway='tram' if mode=='tram' else None)))
   progress+=length
  legs=[dict(a_idx=0,b_idx=1,points=points,start_node_id=node_ids[0],end_node_id=node_ids[-1],
   edge_ids=[e['edge_id'] for e in edges],ok=True)]
  scope=dict(region_id=region.region_id,network_id=region.network_id,version_id=version,pattern_id=pid)
  contract=build_direction_contract(scope=scope,pattern=pattern,points=points,segments=legs,
   platforms=ordered_platforms)
  generation_docs.append(dict(**scope,ready=True,mode=mode,route_number=line,
   generation_id='qa-v15-'+uuid.uuid4().hex[:10],
   osm_snapshot_v=1,geometry=dict(points=points,source='QA_SYNTHETIC',
    geometry_fingerprint=path_fingerprint(points),valid=True),segments=legs,
   infrastructure=dict(total_m=progress,edges=edges,signals=[dict(progress_m=progress*.7,
    kinds=['RAIL_SIGNAL' if mode=='tram' else 'ROAD_SIGNAL'],usable_for_motion=True,
    match_method='NODE_EXACT',signal_id='QA-SYNTHETIC-SIGNAL')]),
   pattern_fingerprint=pattern_fingerprint(pattern),direction_contract=contract,qa_synthetic=True))
  scopes.append(dict(mode=mode,route_number=line,trip_id=next_id,
   position_trip_id=prev_id,pattern_id=pid,block_id=block,stop_id='QA_B'))
  rt_docs.append(dict(region_id=region.region_id,network_id=region.network_id,trip_id=trip['trip_id'],
   network_version_id=version,service_date=day,source_match_validated=True,
   feed_timestamp=int(now.timestamp()),trip_update_timestamp=int(now.timestamp()),updated_at=now.isoformat(),
   trip_schedule_relationship='SCHEDULED',trip_delay_observed=False,qa_synthetic=True))
network=dict(region_id=region.region_id,network_id=region.network_id,version_id=version,
 service_date=day,timezone=region.timezone,active=True,activated_at=now.isoformat(),
 name='QA SYNTHETIC NEARBY BLOCK — NOT OPERATOR SERVICE',routes=routes,qa_synthetic=True)
try:
 db.mobility_pattern_generations.insert_many(generation_docs,ordered=True)
 db.mobility_trip_realtime_journeys.insert_many(rt_docs,ordered=True)
 switched=db.bus_network_versions.update_many({'qa_synthetic':True,'active':True},{'$set':{'active':False}})
 assert switched.matched_count==len(old_active)
 db.bus_network_versions.insert_one(network)
except Exception:
 db.bus_network_versions.update_many({'qa_synthetic':True,'version_id':{'$in':old_active}},
  {'$set':{'active':True}})
 raise
print(json.dumps(dict(version=version,service_date=day,timezone=region.timezone,
 old_active_versions=old_active,network_active=True,qa_only=True,workers_disabled=True,
 stops=len(stops),patterns=len(generation_docs),routes=[r['route_number'] for r in routes],scope=scopes,
 predecessor_arrival_s=prev_arrive,successor_departure_s=next_depart,
 no_user_records=db.users.count_documents({}))))
'''


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['seed','restore'])
    parser.add_argument('--release',type=Path,required=True)
    args=parser.parse_args()
    fixture_path=args.release/'staging-fixture.json'
    if args.action=='seed':
        if fixture_path.exists():raise FileExistsError('Fixture record already exists')
        fixture=remote('DATABASE='+repr(DATABASE)+'\n'+SEED)
        fixture_path.write_text(json.dumps(fixture,indent=2),encoding='utf-8')
        print(json.dumps(fixture,ensure_ascii=False,indent=2))
        return
    fixture=json.loads(fixture_path.read_text(encoding='utf-8'))
    old=fixture['old_active_versions']
    assert len(old)==1 and str(fixture['version']).startswith('qa_nearby_block_')
    result=remote(f'''import json
from pymongo import MongoClient
assert os.environ['DB_NAME']=={DATABASE!r}
assert os.getenv('MOBILITY_WORKERS_ENABLED')=='false'
db=MongoClient(os.environ['MONGO_URL'])[{DATABASE!r}]
fixture={fixture!r}
assert db.bus_network_versions.count_documents({{'qa_synthetic':{{'$ne':True}}}})==0
new=db.bus_network_versions.update_one({{'version_id':fixture['version'],'qa_synthetic':True}},{{'$set':{{'active':False}}}})
assert new.matched_count==1
restored=db.bus_network_versions.update_many({{'version_id':{{'$in':fixture['old_active_versions']}},'qa_synthetic':True}},{{'$set':{{'active':True}}}})
assert restored.matched_count==len(fixture['old_active_versions'])
assert db.bus_network_versions.count_documents({{'active':True}})==len(fixture['old_active_versions'])
print(json.dumps(dict(new_qa_network_deactivated=True,previous_qa_active_restored=True,
 active_count=restored.matched_count,user_count=db.users.count_documents({{}}))))
''')
    (args.release/'staging-fixture-restore.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result,indent=2))


if __name__=='__main__':
    main()
