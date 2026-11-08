"""Allowlisted configuration/Mongo compatibility snapshot; never prints secrets."""
from pathlib import Path
import importlib.util
import json
import sys

T = Path(__file__).parent
PHASE = sys.argv[1]
assert PHASE in ('before', 'after')
sys.argv = [sys.argv[0], 'config-library']
spec = importlib.util.spec_from_file_location('release', T / 'perix-neighbor-release.py')
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
code = '''
import os,json,sys
from pymongo import MongoClient
from mobility.regions import get_active_region
region=get_active_region()
client=MongoClient(os.environ['MONGO_URL'],serverSelectionTimeoutMS=15000)
version=client.server_info()['version']
print(json.dumps({'region_id':region.region_id,'network_id':region.network_id,
 'python':sys.version.split()[0],'mongo_version':version,
 'motion_enabled':os.getenv('MOBILITY_MOTION_ENABLED','false').lower()=='true',
 'atomic_generations':os.getenv('MOBILITY_ATOMIC_GENERATIONS_ENABLED','false').lower()=='true',
 'plan_handover':os.getenv('MOBILITY_PLAN_HANDOVER_ENABLED','false').lower()=='true',
 'paid_routes':os.getenv('MOBILITY_GOOGLE_TRAFFIC_ENABLED','false').lower()=='true'}))
'''
result = r.remote(code, production=True)
assert not result['paid_routes']
assert tuple(int(v) for v in result['mongo_version'].split('.')[:2]) >= (4, 2)
assert result['region_id'] == 'magdeburg' and result['network_id'] == 'de-magdeburg-mvb'
ROOT = T / 'perix-neighbor-timing-release'
if PHASE == 'after':
    before = json.loads((ROOT / 'production-config-before.json').read_bytes())
    for field in ('region_id', 'network_id', 'motion_enabled', 'atomic_generations', 'plan_handover', 'paid_routes'):
        assert before[field] == result[field], 'Unexpected configuration change: ' + field
(ROOT / ('production-config-' + PHASE + '.json')).write_text(json.dumps(result, indent=2))
print(json.dumps(result, indent=2))
