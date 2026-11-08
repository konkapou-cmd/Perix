"""Scoped staging Mongo test, no app collections/flags or TomTom requests."""
from pathlib import Path
import base64
import hashlib
import importlib.util
import json
import zlib

T=Path(__file__).parent
repo=Path(r'C:\Users\PC\Downloads\Perix1')
source=(repo/'Perix-main/backend/mobility/tomtom_control.py').read_text(encoding='utf-8')
spec=importlib.util.spec_from_file_location('release',T/'perix-live-release-tools.py')
helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
code='''
import os,json,uuid,asyncio
from datetime import datetime,timedelta,timezone
from motor.motor_asyncio import AsyncIOMotorClient
ns={};exec(SOURCE,ns);Control=ns['TrafficControl']
async def run():
    client=AsyncIOMotorClient(os.environ['MONGO_URL'],serverSelectionTimeoutMS=15000)
    db=client[os.environ['DB_NAME']]
    name='qa_tt_control_'+uuid.uuid4().hex
    assert name not in await db.list_collection_names()
    collection=db[name];now=datetime.now(timezone.utc)
    policy={'account_ref':'synthetic_not_real_tomtom_account',
        'period_start':(now-timedelta(hours=1)).isoformat(),
        'period_end':(now+timedelta(hours=1)).isoformat(),'flow_cap':5,'incident_cap':3}
    checks={}
    try:
        control=Control(collection,policy)
        leases=await asyncio.gather(*(control.acquire(str(i)) for i in range(20)))
        assert sum(l is not None for l in leases)==1
        leader=next(l for l in leases if l)
        checks['one_valid_scheduler_lease']=True
        flow=await asyncio.gather(*(control.reserve(leader,'flow',str(i)) for i in range(40)))
        incident=await asyncio.gather(*(control.reserve(leader,'incident',str(i)) for i in range(40)))
        assert sum(flow)==5 and sum(incident)==3
        checks['atomic_global_separate_caps']=True
        other=Control(collection,{**policy,'account_ref':'synthetic_idempotence','flow_cap':15})
        lease=await other.acquire('owner')
        repeated=await asyncio.gather(*(other.reserve(lease,'flow','same-slot') for _ in range(40)))
        assert sum(repeated)==1
        checks['idempotent_sampling_slot']=True
        assert not await other.reserve({**lease,'epoch':lease['epoch']-1},'flow','stale')
        checks['stale_fence_rejected']=True
        await collection.update_one({'_id':other.key},{'$set':{'lease_until':now-timedelta(seconds=1)}})
        next_lease=await other.acquire('replacement')
        assert next_lease['epoch']>lease['epoch']
        assert not await other.reserve(lease,'flow','after-failover')
        assert await other.reserve(next_lease,'flow','after-failover')
        checks['failover_fenced_without_budget_reset']=True
        changed=Control(collection,{**other.policy,'period_start':(now-timedelta(hours=2)).isoformat()})
        assert await changed.acquire('owner') is None
        checks['no_automatic_billing_period_reset']=True
        await other.halt(429)
        assert await other.acquire('another') is None
        assert not await other.reserve(next_lease,'incident','halted')
        checks['account_wide_rate_halt']=True
        version=(await client.server_info())['version']
    finally:
        assert name.startswith('qa_tt_control_')
        await db.drop_collection(name)
        checks['exact_temporary_collection_removed']=name not in await db.list_collection_names()
        client.close()
    return {'mongo_version':version,'checks':checks,'tomtom_http_requests':0,
        'production_modified':False,'application_collections_modified':False}
print(json.dumps(asyncio.run(run())))
'''.replace('SOURCE',repr(source),1)
packed=base64.b64encode(zlib.compress(code.encode())).decode()
remote='import base64,zlib;exec(zlib.decompress(base64.b64decode('+repr(packed)+')))'
result=json.loads(helper.remote_python(remote,environment='staging',service='509e0b41-9c7a-41e1-9e95-3124c958fff9'))
result['control_source_sha256']=hashlib.sha256(source.encode()).hexdigest()
out=repo/'Perix-main/backend/releases/physics-time-allocation-20261026'
out.mkdir(parents=True,exist_ok=True)
target=out/'mongo-control-verification.json'
assert not target.exists()
target.write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
