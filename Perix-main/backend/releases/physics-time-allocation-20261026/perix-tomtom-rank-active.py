"""Read-only canonical ranking in an isolated process, no TomTom or GPS data."""
from pathlib import Path
import base64,hashlib,importlib.util,json,zlib

T=Path(__file__).parent
repo=Path(r'C:\Users\PC\Downloads\Perix1')
source=(repo/'Perix-main/backend/mobility/tomtom_sampling.py').read_text(encoding='utf-8')
spec=importlib.util.spec_from_file_location('release',T/'perix-live-release-tools.py')
helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
code='''
import os,json,datetime
from pymongo import MongoClient
from mobility.regions import get_active_region
from mobility.domain import build_domain
namespace={};exec(SOURCE,namespace)
region=get_active_region()
db=MongoClient(os.environ['MONGO_URL'],serverSelectionTimeoutMS=15000)[os.environ['DB_NAME']]
scope={'region_id':region.region_id,'network_id':region.network_id}
network=db.bus_network_versions.find_one(dict(scope,active=True),{'_id':0})
assert network,'No active canonical network'
bundles=list(db.mobility_pattern_generations.find(dict(scope,version_id=network['version_id'],ready=True),{'_id':0}))
profiles=list(db.mobility_traffic_profiles.find(scope,{'_id':0,'way_id':1,'osm_snapshot_v':1,'osm_direction':1}))
available={(p.get('way_id'),p.get('osm_snapshot_v'),p.get('osm_direction')) for p in profiles}
for bundle in bundles:
    for edge in (bundle.get('infrastructure') or {}).get('edges',[]):
        follows=(edge.get('way') or {}).get('follows_osm_way')
        direction='FORWARD' if follows is True else 'BACKWARD' if follows is False else 'BOTH'
        edge['traffic_profile_available']=any((edge.get('way_id'),bundle.get('osm_snapshot_v'),d) in available for d in (direction,'BOTH'))
domain=build_domain(network,region.network_id,[])
report=namespace['rank_points'](network,domain,bundles)
chosen=namespace['choose_points'](report)
points=[]
for p in chosen.pop('points'):
    # Own OSM configuration only; no vehicle/GPS, key or TomTom-derived geometry.
    points.append({k:v for k,v in p.items() if k not in ('trip_ids','chains')})
print(json.dumps({'read_only':True,'production_modified':False,'tomtom_requests':0,
    'at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'scope':report['scope'],'service_date':report['service_date'],
    'candidate_count':len(report['ranked']),'ready_generation_count':len(bundles),
    'historical_profile_records_scanned':len(profiles),
    'candidate_scheduled_edge_passes':report['candidate_edge_passes'],
    **chosen,'points':points}))
'''.replace('SOURCE',repr(source),1)
packed=base64.b64encode(zlib.compress(code.encode())).decode()
result=json.loads(helper.remote_python('import base64,zlib;exec(zlib.decompress(base64.b64decode('+repr(packed)+')))',
    environment='production',service='94882f6a-8179-43bc-bdf5-73eb1de4a059'))
result['selector_source_sha256']=hashlib.sha256(source.encode()).hexdigest()
target=repo/'Perix-main/backend/releases/physics-time-allocation-20261026/active-network-point-ranking-v3.json'
assert not target.exists()
target.write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k!='points'},indent=2))
print(json.dumps({'points':[{'point_id':p['point_id'],'edge_id':p['edge_id'],
    'scheduled_passes':p['scheduled_passes'],'lines':p['lines'],'role':p['role']} for p in result['points']]},indent=2))
