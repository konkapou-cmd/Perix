"""Hosted staging synthetic scenarios using the REAL application and clocks.

No test app/control endpoint is deployed. Only the dedicated staging DB is
seeded. Fixtures identify themselves as QA, not as operator trips or live GPS.
"""
import argparse
import json
from pathlib import Path
import time

import httpx
from visual_staging_ops import remote, DATABASE, ORIGIN


SEED = r'''
import json,uuid,math
from datetime import datetime,timedelta,timezone
from zoneinfo import ZoneInfo
from pymongo import MongoClient
from mobility.domain import _pattern_id
from mobility.approach import path_fingerprint
from mobility.roads import _haversine_m
assert os.environ['DB_NAME']==DATABASE
assert os.getenv('MOBILITY_WORKERS_ENABLED')=='false'
db=MongoClient(os.environ['MONGO_URL'])[DATABASE]
assert not db.bus_network_versions.count_documents({'active':True}), 'Refusing to overwrite an active fixture'
now=datetime.now(ZoneInfo('Europe/Berlin'))
day=now.date().isoformat()
s=now.hour*3600+now.minute*60+now.second
version='qa_visual_'+uuid.uuid4().hex[:12]
routes=[];scopes=[]
def fmt(value):
 return f'{value//3600:02d}:{value%3600//60:02d}:{value%60:02d}'
for i,mode in enumerate(('tram','bus')):
 line='QA-'+mode.upper()
 points=[[52.14+i*.003,11.63],[52.14+i*.003,11.634],[52.143+i*.003,11.634]]
 lengths=[_haversine_m(*a,*b) for a,b in zip(points,points[1:])]
 total=sum(lengths);start=s-20;arrival=s+600;departure=arrival+60
 stop_a='QA_'+mode+'_A';stop_b='QA_'+mode+'_B';trip='QA_'+mode
 routes.append(dict(route_number=line,mode=mode,stops=[
  dict(stop_id=stop_a,name='QA synthetic origin '+mode,lat=points[0][0],lng=points[0][1]),
  dict(stop_id=stop_b,name='QA synthetic destination '+mode,lat=points[-1][0],lng=points[-1][1])],
  shapes={'qa':points},trips=[dict(trip_id=trip,headsign='QA SYNTHETIC — NOT OPERATOR SERVICE',
   start=fmt(start),end=fmt(departure),shape_id='qa',stop_ids=[stop_a,stop_b],stop_sequences=[1,2],
   stop_times={stop_a:fmt(start),stop_b:fmt(departure)},stop_times_arrival={stop_a:fmt(start-10),stop_b:fmt(arrival)},
   stop_times_sequence=[dict(stop_id=stop_a,stop_sequence=1,arrival_time=fmt(start-10),departure_time=fmt(start)),
                        dict(stop_id=stop_b,stop_sequence=2,arrival_time=fmt(arrival),departure_time=fmt(departure))])]))
 pid=_pattern_id(line,'qa')
 edges=[dict(edge_id=f'{900000+i}:{j+1}:{j+2}',way_id=900000+i,from_node=j+1,to_node=j+2,
  from_m=sum(lengths[:j]),to_m=sum(lengths[:j+1]),from_point=points[j],to_point=points[j+1],
  way=dict(highway='secondary',railway='tram' if mode=='tram' else None,maxspeed_kmh=50)) for j in range(2)]
 scope=dict(region_id='magdeburg',network_id='de-magdeburg-mvb',version_id=version,pattern_id=pid)
 db.mobility_pattern_generations.insert_one(dict(**scope,ready=True,mode=mode,generation_id='qa-g1',osm_snapshot_v=1,
  geometry=dict(points=points,source='QA_SYNTHETIC',geometry_fingerprint=path_fingerprint(points)),
  segments=[],infrastructure=dict(total_m=total,edges=edges,signals=[dict(progress_m=total*.7,
   kinds=['RAIL_SIGNAL' if mode=='tram' else 'ROAD_SIGNAL'],usable_for_motion=True,
   match_method='NODE_EXACT',signal_id='QA-MODELED-SIGNAL')]),qa_synthetic=True))
 # Generated TEST topology is explicitly not attributed to OSM/operator data.
 stamp=int(now.timestamp())
 db.mobility_trip_realtime_journeys.insert_one(dict(region_id='magdeburg',network_id='de-magdeburg-mvb',
  trip_id=trip,network_version_id=version,service_date=day,source_match_validated=True,
  feed_timestamp=stamp,trip_update_timestamp=stamp,updated_at=now.isoformat(),
  trip_schedule_relationship='SCHEDULED',trip_delay_observed=False,
  stop_predictions_by_sequence={'2':dict(stop_id=stop_b,arrival_delay_seconds=0,departure_delay_seconds=0)},qa_synthetic=True))
 scopes.append(dict(pattern_id=pid,trip_id=trip,stop_id=stop_b,total_m=total))
db.bus_network_versions.insert_one(dict(region_id='magdeburg',network_id='de-magdeburg-mvb',version_id=version,
 service_date=day,timezone='Europe/Berlin',active=True,activated_at=(now-timedelta(seconds=60)).isoformat(),
 name='QA SYNTHETIC VISUAL STAGING — NOT REAL TRANSIT',routes=routes,qa_synthetic=True))
print(json.dumps(dict(version=version,service_date=day,scope=scopes,synthetic=True,arrival_service_s=arrival)))
'''


def mutate(fixture, action):
    code = f'''import json
from datetime import datetime
from zoneinfo import ZoneInfo
from pymongo import MongoClient
assert os.environ['DB_NAME']=={DATABASE!r}
assert os.getenv('MOBILITY_WORKERS_ENABLED')=='false'
db=MongoClient(os.environ['MONGO_URL'])[{DATABASE!r}]
fixture={fixture!r}
now=datetime.now(ZoneInfo('Europe/Berlin'));stamp=int(now.timestamp())
scope={{'version_id':fixture['version'],'qa_synthetic':True}}
assert db.bus_network_versions.count_documents(dict(scope,active=True))==1
'''
    if action in ('hide', 'recover'):
        fields = {'ready': action == 'recover'}
        if action == 'recover':
            fields['generation_id'] = 'qa-g2'
        code += 'result=db.mobility_pattern_generations.update_many(scope,'+repr({'$set': fields})+')\n'
    elif action in ('delay', 'near', 'cancel', 'refresh'):
        if action == 'near':
            code += "service=now.hour*3600+now.minute*60+now.second\ndelta=service+35-fixture['arrival_service_s']\n"
        else:
            code += "delta=180\n" if action == 'delay' else 'delta=0\n'
        code += '''count=0
for row in fixture['scope']:
 fields=dict(feed_timestamp=stamp,trip_update_timestamp=stamp,updated_at=now.isoformat(),
  trip_schedule_relationship='CANCELED' if ACTION=='cancel' else 'SCHEDULED')
 if ACTION!='refresh':
  fields['stop_predictions_by_sequence']={'2':dict(stop_id=row['stop_id'],arrival_delay_seconds=delta,departure_delay_seconds=delta)}
 result=db.mobility_trip_realtime_journeys.update_one(dict(network_version_id=fixture['version'],trip_id=row['trip_id'],qa_synthetic=True),{'$set':fields})
 count+=result.matched_count
'''.replace('ACTION', repr(action))
        code += "print(json.dumps(dict(matched=count,action="+repr(action)+")))\n"
        return remote(code)
    else:
        raise ValueError('Unknown mutation')
    code += "print(json.dumps(dict(matched=result.matched_count,action="+repr(action)+")))\n"
    return remote(code)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('action', choices=['seed', 'delay', 'near', 'hide', 'recover', 'cancel', 'refresh', 'sample', 'approach'])
    p.add_argument('--release', type=Path, required=True)
    args = p.parse_args()
    root = args.release
    verification = json.loads((root/'staging-runtime-verification.json').read_text(encoding='utf-8'))
    assert not verification['mismatches'] and verification['isolated_database']
    if args.action == 'seed':
        fixture = remote('DATABASE='+repr(DATABASE)+'\n'+SEED)
        with (root/'staging-fixture.json').open('x', encoding='utf-8') as f:
            json.dump(fixture, f, indent=2)
        print(json.dumps(fixture))
    else:
        fixture = json.loads((root/'staging-fixture.json').read_text(encoding='utf-8'))
        if args.action == 'approach':
            mutate(fixture, 'near')
            records = []
            with httpx.Client(base_url=ORIGIN, timeout=30, trust_env=False) as client:
                # Timed passenger-read cadence, not a deployment readiness poll.
                for _ in range(23):
                    response = client.get('/api/mobility/v2/vehicles?motion_preview=true')
                    response.raise_for_status()
                    rows = response.json()
                    assert len(rows) == 2
                    for row in rows:
                        assert row['motion']['physical_speed_assurance'] is False
                        assert row['motion']['observed_arrival'] is False
                    records.append(dict(at=time.time(), rows=rows))
                    time.sleep(2)
            for mode in ('bus', 'tram'):
                final = [r for frame in records for r in frame['rows'] if r['mode'] == mode and r['next_stop_eta_seconds'] == 0]
                assert final and all(abs(r['progress_m']-next(s['total_m'] for s in fixture['scope'] if s['trip_id'] == r['trip_id'])) < .01 for r in final)
                assert all(r['motion']['state'] == 'VISUAL_STOP_ESTIMATE' for r in final)
            path = root/'staging-approach-report.json'
            path.write_text(json.dumps(dict(synthetic=True, actual_wall_clock=True, frames=records), indent=2), encoding='utf-8')
            print(json.dumps(dict(evidence=str(path),frames=len(records),both_source_endpoints=True,
                source_dwell_retained=True,initial_etas=[r['next_stop_eta_seconds'] for r in records[0]['rows']])))
        elif args.action != 'sample':
            print(json.dumps(mutate(fixture, args.action)))
        else:
            with httpx.Client(base_url=ORIGIN, timeout=30, trust_env=False) as client:
                result = {}
                for name, path in [('vehicles', '/api/mobility/v2/vehicles?motion_preview=true'),
                    ('map', '/api/mobility/v2/map')]+[(r['stop_id'], '/api/mobility/v2/stops/'+r['stop_id']+'/arrivals') for r in fixture['scope']]:
                    start = time.monotonic()
                    r = client.get(path)
                    result[name] = dict(status=r.status_code, elapsed_s=time.monotonic()-start, data=r.json())
                path = root/('staging-sample-'+str(time.time_ns())+'.json')
                path.write_text(json.dumps(result, indent=2), encoding='utf-8')
                print(json.dumps(dict(evidence=str(path),statuses={k:v['status'] for k,v in result.items()},
                    vehicles=[dict(mode=v.get('mode'),progress_m=v.get('progress_m'),eta=v.get('next_stop_eta_seconds'),
                        model=(v.get('motion') or {}).get('model'),context=(v.get('motion') or {}).get('visual_context'))
                        for v in result['vehicles']['data']])))


if __name__ == '__main__':
    main()
