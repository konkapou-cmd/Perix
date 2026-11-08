"""Restore an on-disk BSON snapshot of staging QA mobility data to a NEW DB.

No production connection, database drop, source mutation or general app-data
export. This verifies only the dedicated synthetic mobility namespace; it is
not proof of production backup retention, volume recovery or full-app restore.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path

from visual_staging_ops import remote, DATABASE


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--release', type=Path, required=True)
    args = p.parse_args()
    raw = remote('DATABASE='+repr(DATABASE)+'\n'+r'''
import base64,hashlib,io,json,uuid,zipfile
from datetime import datetime,timezone
from pathlib import Path
from bson import BSON,decode_all,json_util
from pymongo import MongoClient
assert os.environ['DB_NAME']==DATABASE
assert os.getenv('MOBILITY_WORKERS_ENABLED')=='false'
client=MongoClient(os.environ['MONGO_URL'],serverSelectionTimeoutMS=15000)
source=client[DATABASE]
assert source.users.count_documents({})==0
assert source.bus_network_versions.count_documents({'qa_synthetic':{'$ne':True}})==0
names=('bus_network_versions','mobility_pattern_generations','mobility_trip_realtime_journeys','mobility_visual_progress_state')
def snapshot(db,name):
 rows=list(db[name].find({}).sort('_id',1))
 assert len(rows)<=10000
 data=b''.join(BSON.encode(row) for row in rows)
 assert len(data)<=20000000
 return rows,data,hashlib.sha256(data).hexdigest()
catalog=dict(schema=1,scope='Synthetic staging mobility only; no users',at=datetime.now(timezone.utc).isoformat(),collections={})
memory=io.BytesIO()
with zipfile.ZipFile(memory,'w',zipfile.ZIP_DEFLATED) as z:
 for name in names:
  rows,data,digest=snapshot(source,name)
  if name!='mobility_visual_progress_state':
   assert all(row.get('qa_synthetic') is True for row in rows)
  else:
   for row in rows:
    identity=row.get('identity') or (row.get('binding') or [None,{}])[1]
    assert str(identity.get('trip_id') or '').startswith('QA_')
  indexes=list(source[name].list_indexes())
  catalog['collections'][name]=dict(count=len(rows),sha256=digest,indexes=indexes)
  z.writestr(name+'.bson',data)
 z.writestr('catalog.json',json_util.dumps(catalog))
payload=memory.getvalue()
backup=Path('/tmp')/('perix_qa_mobility_'+uuid.uuid4().hex+'.zip')
with backup.open('xb') as f:f.write(payload)
assert hashlib.sha256(backup.read_bytes()).digest()==hashlib.sha256(payload).digest()
target_name=DATABASE+'_restore_'+uuid.uuid4().hex[:8]
target=client[target_name]
assert not target.list_collection_names()
checks={}
with zipfile.ZipFile(backup) as z:
 saved=json_util.loads(z.read('catalog.json'))
 for name,meta in saved['collections'].items():
  col=target.create_collection(name)
  rows=decode_all(z.read(name+'.bson'))
  if rows: col.insert_many(rows,ordered=True)
  for index in meta['indexes']:
   if index['name']=='_id_':continue
   options={k:v for k,v in index.items() if k not in ('key','v','ns')}
   col.create_index(list(index['key'].items()),**options)
  restored,data,digest=snapshot(target,name)
  actual_indexes=list(col.list_indexes())
  normalize=lambda values:sorted([dict((k,v) for k,v in row.items() if k not in ('v','ns')) for row in values],key=lambda x:x['name'])
  assert len(restored)==meta['count'] and digest==meta['sha256']
  assert normalize(actual_indexes)==normalize(meta['indexes'])
  assert snapshot(source,name)[2]==meta['sha256'], 'Source changed during backup/restore'
  checks[name]=dict(count=len(restored),bson_hash_equal=True,indexes_equal=True,source_unchanged=True)
print(json.dumps(dict(deployment=os.getenv('RAILWAY_DEPLOYMENT_ID'),server_version=client.server_info()['version'],
 scope=catalog['scope'],restore_database=target_name,source_database_unchanged=True,
 collections=checks,archive_sha256=hashlib.sha256(payload).hexdigest(),archive=base64.b64encode(payload).decode(),
 limits=['QA mobility data only, not production or full app data.','New namespace restore, not in-place restore or volume recovery.',
 'Temporary server copy and local retained copy; automated retention/backup scheduling not established.'])))
''')
    payload = base64.b64decode(raw.pop('archive'))
    assert hashlib.sha256(payload).hexdigest() == raw['archive_sha256']
    with (args.release/'qa-mobility-backup.zip').open('xb') as f:
        f.write(payload)
    with (args.release/'staging-restore-verification.json').open('x', encoding='utf-8') as f:
        json.dump(raw, f, indent=2)
    print(json.dumps(raw))


if __name__ == '__main__':
    main()
