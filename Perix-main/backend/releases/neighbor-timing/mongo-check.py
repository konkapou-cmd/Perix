"""Exercise candidate pipeline in one UUID-named staging collection only."""
from pathlib import Path
import importlib.util
import json
import base64
import zlib

root = Path(__file__).parent
spec = importlib.util.spec_from_file_location('release_tools', root / 'perix-live-release-tools.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
source = (root / 'perix-sparse-realtime-release/context/Perix-main/backend/mobility/realtime_order.py').read_text()
code = '''
import os,json,uuid,time
from concurrent.futures import ThreadPoolExecutor
from pymongo import MongoClient
namespace={}
exec(SOURCE,namespace)
pipeline=namespace['monotonic_update_pipeline']; reference=namespace['expected_accept']
client=MongoClient(os.environ['MONGO_URL'],serverSelectionTimeoutMS=15000)
db=client[os.environ['DB_NAME']]
name='qa_sparse_order_'+uuid.uuid4().hex
assert name.startswith('qa_sparse_order_') and len(name)==48
assert name not in db.list_collection_names()
collection=db[name]; checks={}; tested=0
now=int(time.time())-100
def candidate(feed=now,trip=now-20,**kw):
    return dict(region_id='qa',network_id='qa',trip_id='T',network_version_id='v',
        service_date='2026-10-25',feed_timestamp=feed,trip_update_timestamp=trip,
        network_activation_epoch=0,payload='$literal-source',**kw)
def apply(doc,key='sequential'):
    collection.update_one({'_id':key},pipeline(doc),upsert=True)
try:
    collection.create_index([('region_id',1),('network_id',1),('trip_id',1)],unique=True,
        partialFilterExpression={'region_id':{'$exists':True}})
    old=None
    candidates=[candidate(),candidate(now+1,now-30),candidate(now+2,None),
        candidate(now+3,now-30),candidate(now+4,now-10),candidate(now+4,now),
        candidate(now+5,now-10),candidate(now+6,now-40)]
    for doc in candidates:
        accepted=reference(old,doc)
        apply(doc)
        actual=collection.find_one({'_id':'sequential'})
        if accepted:
            same=old and all(old.get(k)==doc[k] for k in ('service_date','network_version_id'))
            high=max([int((old or {}).get(k) or 0) for k in ('trip_timestamp_highwater','trip_update_timestamp')]+[doc.get('trip_update_timestamp') or 0]) if same else doc.get('trip_update_timestamp') or 0
            old={**(old or {}),**doc,'trip_timestamp_highwater':high}
        assert {k:v for k,v in actual.items() if k!='_id'}==old
        tested+=1
    checks['unknown_clock_retains_highwater']=True
    checks['older_trip_clock_rejected']=True
    checks['same_feed_rejected']=True
    checks['dollar_text_is_literal']=actual['payload']=='$literal-source'
    # Date/version transitions and legacy string clocks, each on an isolated row.
    transitions=[
        (candidate(),{**candidate(now+1,now-40),'service_date':'2026-10-26'}),
        (candidate(),{**candidate(now+1),'service_date':'2026-10-24'}),
        (candidate(),{**candidate(now+1),'network_version_id':'other'}),
        ({**candidate(),'network_activation_epoch':now-50},
         {**candidate(now+1,now-40),'network_version_id':'new','network_activation_epoch':now-10}),
        ({**candidate(),'feed_timestamp':str(now),'trip_update_timestamp':str(now-20)},candidate(now+1,now-30)),
    ]
    for i,(before,after) in enumerate(transitions):
        key='transition_'+str(i)
        before['trip_id']=after['trip_id']=key
        collection.insert_one(dict(before,_id=key))
        accepted=reference(before,after);apply(after,key)
        got=collection.find_one({'_id':key})
        assert got['feed_timestamp']==(after if accepted else before)['feed_timestamp']
        assert got['network_version_id']==(after if accepted else before)['network_version_id']
        tested+=1
    checks['dated_versioned_and_legacy_order']=True
    docs=[{**candidate(now+i,now-50+i),'trip_id':'concurrent'} for i in range(1,81)]
    apply(docs[0],'concurrent')
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda doc:apply(doc,'concurrent'),reversed(docs)))
    result=collection.find_one({'_id':'concurrent'})
    assert result['feed_timestamp']==now+80 and result['trip_timestamp_highwater']==now+30
    checks['concurrent_updates_retain_latest']=True
    tested+=len(docs)
    version=client.server_info()['version']
finally:
    # Never drop a database or touch application collections.
    db.drop_collection(name)
    checks['exact_temporary_collection_removed']=name not in db.list_collection_names()
print(json.dumps({'mongo_version':version,'cases':tested,'checks':checks}))
'''.replace('SOURCE', repr(source), 1)
packed = base64.b64encode(zlib.compress(code.encode())).decode()
remote = "import base64,zlib;exec(zlib.decompress(base64.b64decode(" + repr(packed) + ")))"
result = json.loads(helper.remote_python(remote, environment='staging', service='509e0b41-9c7a-41e1-9e95-3124c958fff9'))
output = root / 'perix-sparse-realtime-release/mongo-staging-verification.json'
output.write_text(json.dumps(result, indent=2))
print(json.dumps(result, indent=2))
