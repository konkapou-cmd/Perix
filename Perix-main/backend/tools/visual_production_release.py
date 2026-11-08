"""Identity-guarded web release operations. Starts with read-only preflight.

Production approval is specific to this web release; never change Mongo
services, drop data, publish mobile/OTA builds or enable paid providers here.
Connection strings and secrets remain inside Railway.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import zlib
import time
import shutil
import zipfile

from visual_staging_ops import cli

PROJECT = '99643a3b-bf65-467a-8f2f-50640f519b2b'
ENVIRONMENT = 'a2b06de5-a5a6-4365-ae67-9ee519a3f7b6'
SERVICE = '94882f6a-8179-43bc-bdf5-73eb1de4a059'
MONGO_SERVICE = 'aee0871f-8054-488c-b66c-72ea252e1f64'
ORIGIN = 'https://app.perix.eu'
ACTIVATION = {'MOBILITY_VISUAL_PROGRESS_ENABLED':'true', 'MOBILITY_VISUAL_PREWARM_ON_STARTUP':'true'}


def target():
    status = json.loads(cli('status', '--json'))
    assert status['id'] == PROJECT
    env = next(e['node'] for e in status['environments']['edges'] if e['node']['id'] == ENVIRONMENT)
    service = next(s['node'] for s in env['serviceInstances']['edges'] if s['node']['serviceId'] == SERVICE)
    assert any(d['domain'] == 'app.perix.eu' for d in service['domains']['customDomains'])
    return service


def backup_directory(root):
    pointer = root/'private-backup-location.json'
    return Path(json.loads(pointer.read_text())['directory']) if pointer.exists() else root


def settings_hashes(values):
    return {k:hashlib.sha256(v.encode()).hexdigest() for k,v in values.items()
            if not k.startswith('RAILWAY_') and k not in ACTIVATION}


def upload_directory(root, directory):
    """Preserve production's /Perix-main Docker context without changing it."""
    from package_visual_staging import snapshot
    output = root/(directory.name+'-upload')
    expected = {'Perix-main/'+k:v for k,v in snapshot(directory).items()}
    expected['railway.json'] = hashlib.sha256((directory/'railway.json').read_bytes()).hexdigest()
    if not output.exists():
        shutil.copytree(directory,output/'Perix-main')
        shutil.copyfile(directory/'railway.json',output/'railway.json')
    assert snapshot(output)==expected
    manifest_path = root/(directory.name+'-upload-manifest.json')
    manifest_path.write_text(json.dumps(dict(root_directory='/Perix-main',files=expected),indent=2),encoding='utf-8')
    return output


def release_action(action, root):
    from package_visual_staging import snapshot
    service = target()
    old = json.loads((root/'production-rollback-settings.json').read_text())
    manifest = json.loads((root/'runtime-manifest.json').read_text())
    assert manifest['origin'] == ORIGIN and snapshot(root/'runtime') == manifest['files']
    backup = backup_directory(root)
    capture = json.loads((root/'production-code-rollback-manifest.json').read_text())
    assert hashlib.sha256((backup/'production-code-rollback.zip').read_bytes()).hexdigest() == capture['archive_sha256']
    assert capture['deployment'] == old['deployment']
    activation_file = root/'production-activation-before.json'
    if action == 'configure':
        assert service['latestDeployment']['id'] == old['deployment']
        assert not activation_file.exists(), 'Activation already captured; do not overwrite before-values'
        before = variables()
        assert before.get('MOBILITY_GOOGLE_TRAFFIC_ENABLED','false').lower() == 'false'
        record = dict(deployment=old['deployment'], settings={k:before.get(k) for k in ACTIVATION},
            unchanged_settings_sha256=settings_hashes(before))
        # Prepare exact old runtime before any production variable mutation.
        rollback = root/'rollback-runtime'
        rollback.mkdir(exist_ok=False)
        with zipfile.ZipFile(backup/'production-code-rollback.zip') as archive:
            for name in archive.namelist():
                assert name.startswith('backend/') and '..' not in Path(name).parts
                dest = rollback/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(archive.read(name))
        for name in ('Dockerfile','.dockerignore','railway.json'):
            shutil.copyfile(root/'source'/name,rollback/name)
        record['rollback_files'] = snapshot(rollback)
        activation_file.write_text(json.dumps(record,indent=2),encoding='utf-8')
        updates = {k:v for k,v in ACTIVATION.items() if before.get(k)!=v}
        if updates:
            cli('variable','set','-e',ENVIRONMENT,'-s',SERVICE,'--skip-deploys',*[k+'='+v for k,v in updates.items()])
        after = variables()
        assert settings_hashes(after) == record['unchanged_settings_sha256']
        assert all(after.get(k)==v for k,v in ACTIVATION.items())
        return dict(configured=True, deployment_triggered=False, unrelated_settings_preserved=True,
            changed_flags=sorted(updates))
    record = json.loads(activation_file.read_text())
    if action == 'verify-rollback':
        expected = {k.removeprefix('backend/'):v for k,v in record['rollback_files'].items() if k.startswith('backend/')}
        result = remote(f'''import json,hashlib
from pathlib import Path
names={list(expected)!r}
actual={{k:hashlib.sha256((Path('/app')/k).read_bytes()).hexdigest() if (Path('/app')/k).is_file() else None for k in names}}
assert os.getenv('MOBILITY_VISUAL_PROGRESS_ENABLED','false')=='false'
assert os.getenv('MOBILITY_VISUAL_PREWARM_ON_STARTUP','false')=='false'
checks=[]
for p in Path('/proc').iterdir():
 if p.name.isdigit():
  try:
   cmd=(p/'cmdline').read_bytes().split(b'\\0')
   if b'server:app' in cmd and any(x.rsplit(b'/',1)[-1]==b'uvicorn' for x in cmd):
    initial=dict(x.split(b'=',1) for x in (p/'environ').read_bytes().split(b'\\0') if b'=' in x)
    checks.append(all(initial.get(k.encode())==(os.environ[k].encode() if k in os.environ else None) for k in
       ('MONGO_URL','DB_NAME','MOBILITY_VISUAL_PROGRESS_ENABLED','MOBILITY_VISUAL_PREWARM_ON_STARTUP','MOBILITY_WORKERS_ENABLED','MOBILITY_SYNC_AUTO_ACTIVATE')))
  except (OSError,ValueError):pass
assert len(checks)==1 and all(checks)
print(json.dumps(dict(deployment=os.getenv('RAILWAY_DEPLOYMENT_ID'),hashes=actual,
 original_flag_behavior_restored=True,app_processes=len(checks),initial_environment_matches=True)))
''')
        actual = result.pop('hashes')
        result['files_verified'] = sum(actual.get(k)==v for k,v in expected.items())
        result['mismatches'] = [k for k,v in expected.items() if actual.get(k)!=v]
        current = variables()
        assert settings_hashes(current) == record['unchanged_settings_sha256']
        result['absent_before_now_disabled'] = [k for k,v in record['settings'].items() if v is None and current.get(k)=='false']
        (root/'production-rollback-verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
        assert not result['mismatches']
        return result
    if action == 'deploy':
        if service['latestDeployment']['id'] != old['deployment']:
            failed = json.loads((root/'production-safe-retry.json').read_text())
            assert service['latestDeployment']['id'] == failed['deployment']
            assert service['latestDeployment']['status'] == 'FAILED'
            assert failed['reason'] in ('UPLOAD_BEFORE_BUILD','BUILD_ROOT_DIRECTORY','HEALTHCHECK_HTTPS_REDIRECT')
            live = remote("import json;print(json.dumps({'deployment':os.getenv('RAILWAY_DEPLOYMENT_ID')}))")
            assert live['deployment'] == old['deployment'], 'Never retry over a changed live runtime'
        current = variables()
        assert settings_hashes(current) == record['unchanged_settings_sha256']
        assert all(current.get(k)==v for k,v in ACTIVATION.items())
        assert service['latestDeployment'].get('meta',{}).get('rootDirectory') == '/Perix-main'
        upload = upload_directory(root,root/'runtime')
        output = cli('up',str(upload),'--path-as-root','--project',PROJECT,
            '--environment',ENVIRONMENT,'--service',SERVICE,'--detach')
        (root/'production-deploy.log').write_text(output,encoding='utf-8')
        return dict(submitted=True,runtime_tree_sha256=manifest['runtime_tree_sha256'])
    if action == 'rollback':
        assert snapshot(root/'rollback-runtime') == record['rollback_files']
        current = variables()
        assert settings_hashes(current) == record['unchanged_settings_sha256'], 'Unrelated settings changed; stop for review'
        # Railway delete has no skip-deploy option. First disable both flags
        # without an automatic candidate redeploy; restore absent keys only
        # after the captured old runtime is confirmed live.
        safe_settings = {k:v if v is not None else 'false' for k,v in record['settings'].items()}
        cli('variable','set','-e',ENVIRONMENT,'-s',SERVICE,'--skip-deploys',
            *[k+'='+v for k,v in safe_settings.items()])
        restored = variables()
        assert all(restored.get(k)==v for k,v in safe_settings.items())
        upload = upload_directory(root,root/'rollback-runtime')
        output = cli('up',str(upload),'--path-as-root','--project',PROJECT,
            '--environment',ENVIRONMENT,'--service',SERVICE,'--detach')
        (root/'production-rollback-deploy.log').write_text(output,encoding='utf-8')
        return dict(rollback_submitted=True, original_flag_behavior_restored=True,
            unset_key_cleanup_pending=[k for k,v in record['settings'].items() if v is None],
            database_not_restored_or_restarted=True)
    expected = {k.removeprefix('backend/'):v for k,v in manifest['files'].items() if k.startswith('backend/')}
    result = remote(f'''import json,hashlib,platform
from pathlib import Path
names={list(expected)!r}
actual={{k:hashlib.sha256((Path('/app')/k).read_bytes()).hexdigest() if (Path('/app')/k).is_file() else None for k in names}}
assert os.getenv('MOBILITY_VISUAL_PROGRESS_ENABLED')=='true'
assert os.getenv('MOBILITY_VISUAL_PREWARM_ON_STARTUP')=='true'
checks=[]
for p in Path('/proc').iterdir():
 if p.name.isdigit():
  try:
   cmd=(p/'cmdline').read_bytes().split(b'\\0')
   if b'server:app' in cmd and any(x.rsplit(b'/',1)[-1]==b'uvicorn' for x in cmd):
    initial=dict(x.split(b'=',1) for x in (p/'environ').read_bytes().split(b'\\0') if b'=' in x)
    checks.append(all(initial.get(k.encode())==(os.environ[k].encode() if k in os.environ else None) for k in
      ('MONGO_URL','DB_NAME','MOBILITY_VISUAL_PROGRESS_ENABLED','MOBILITY_VISUAL_PREWARM_ON_STARTUP','MOBILITY_WORKERS_ENABLED','MOBILITY_SYNC_AUTO_ACTIVATE')))
  except (OSError,ValueError):pass
assert len(checks)==1 and all(checks)
print(json.dumps(dict(deployment=os.getenv('RAILWAY_DEPLOYMENT_ID'),hashes=actual,python=platform.python_version(),
 app_processes=len(checks),initial_environment_matches=True)))
''')
    actual = result.pop('hashes')
    result['files_verified'] = sum(actual.get(k)==v for k,v in expected.items())
    result['mismatches'] = [k for k,v in expected.items() if actual.get(k)!=v]
    assert settings_hashes(variables()) == record['unchanged_settings_sha256']
    (root/'production-runtime-verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    assert not result['mismatches']
    assert result['deployment'] != old['deployment']
    return result


def variables(service=SERVICE):
    return json.loads(cli('variable', 'list', '-e', ENVIRONMENT, '-s', service, '--json'))


def remote(code):
    guard = f'''import os
assert os.getenv('RAILWAY_PROJECT_ID')=={PROJECT!r}
assert os.getenv('RAILWAY_ENVIRONMENT_ID')=={ENVIRONMENT!r}
assert os.getenv('RAILWAY_SERVICE_ID')=={SERVICE!r}
'''
    payload = base64.b64encode(zlib.compress((guard+code).encode())).decode()
    command = 'python -c "import base64,zlib;exec(zlib.decompress(base64.b64decode(\''+payload+'\')))"'
    return json.loads(cli('ssh', '-p', PROJECT, '-e', ENVIRONMENT, '-s', SERVICE, '--', command))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('action', choices=['preflight', 'capture-code', 'backup-mobility', 'configure', 'deploy', 'verify', 'rollback', 'verify-rollback'])
    p.add_argument('--release', type=Path, required=True)
    args = p.parse_args()
    root = args.release
    root.mkdir(exist_ok=True)
    if args.action in ('configure','deploy','verify','rollback','verify-rollback'):
        result = release_action(args.action,root)
        (root/('production-'+args.action+'-'+str(time.time_ns())+'.json')).write_text(json.dumps(result,indent=2),encoding='utf-8')
        print(json.dumps(result))
        return
    if args.action == 'preflight':
        status = json.loads(cli('status', '--json'))
        assert status['id'] == PROJECT
        env = next(e['node'] for e in status['environments']['edges'] if e['node']['id'] == ENVIRONMENT)
        service = next(s['node'] for s in env['serviceInstances']['edges'] if s['node']['serviceId'] == SERVICE)
        assert any(d['domain'] == 'app.perix.eu' for d in service['domains']['customDomains'])
        values, mongo = variables(), variables(MONGO_SERVICE)
        from urllib.parse import urlsplit
        assert urlsplit(values['MONGO_URL']).hostname == mongo['RAILWAY_PRIVATE_DOMAIN']
        assert not values['DB_NAME'].startswith('perix_visual_stage_')
        flags = ('MOBILITY_WORKERS_ENABLED', 'MOBILITY_VISUAL_PROGRESS_ENABLED', 'MOBILITY_MOTION_ENABLED',
                 'MOBILITY_ATOMIC_GENERATIONS_ENABLED', 'MOBILITY_MOTION_PREVIEW_ENABLED',
                 'MOBILITY_GOOGLE_TRAFFIC_ENABLED', 'MOBILITY_SYNC_AUTO_ACTIVATE')
        rollback = dict(project=PROJECT, environment=ENVIRONMENT, service=SERVICE,
            deployment=service['latestDeployment']['id'], settings={k: values.get(k) for k in flags})
        with (root/'production-rollback-settings.json').open('x', encoding='utf-8') as f:
            json.dump(rollback, f, indent=2)
        result = remote('''import json,time,platform
from pathlib import Path
from datetime import datetime,timezone
from pymongo import MongoClient
c=MongoClient(os.environ['MONGO_URL'],serverSelectionTimeoutMS=15000)
db=c[os.environ['DB_NAME']]
assert not os.environ['DB_NAME'].startswith('perix_visual_stage_')
hello=c.admin.command('hello')
n=db.bus_network_versions.find_one({'active':True,'region_id':'magdeburg','network_id':'de-magdeburg-mvb'}) or {}
scope={'region_id':'magdeburg','network_id':'de-magdeburg-mvb','version_id':n.get('version_id')}
gens=list(db.mobility_pattern_generations.find(scope,{'_id':0,'ready':1,'pattern_id':1,'generation_id':1,'mode':1,'geometry.source':1,'geometry.points':1}))
processes=[]
for p in Path('/proc').iterdir():
 if p.name.isdigit():
  try:
   cmd=(p/'cmdline').read_bytes().split(b'\\0')
   if b'server:app' in cmd and any(x.rsplit(b'/',1)[-1]==b'uvicorn' for x in cmd):
    initial=dict(x.split(b'=',1) for x in (p/'environ').read_bytes().split(b'\\0') if b'=' in x)
    processes.append(all(initial.get(k.encode())==os.environ.get(k,'').encode() for k in ('MONGO_URL','DB_NAME')))
  except (OSError,ValueError):pass
assert processes and all(processes)
latest=db.mobility_trip_realtime_journeys.find_one({'network_version_id':n.get('version_id'),'service_date':n.get('service_date')},sort=[('feed_timestamp',-1)],projection={'_id':0,'feed_timestamp':1,'updated_at':1}) or {}
stats=db.command('dbStats',scale=1048576)
print(json.dumps(dict(deployment=os.getenv('RAILWAY_DEPLOYMENT_ID'),python=platform.python_version(),mongo_version=c.server_info()['version'],
 standalone=not bool(hello.get('setName')) and hello.get('msg')!='isdbgrid',at=datetime.now(timezone.utc).isoformat(),
 uvicorn_processes=len(processes),app_initial_database_environment_matches=True,
 active={k:n.get(k) for k in ('version_id','name','service_date','generation_state','static_input','activated_at')},
 route_count=len(n.get('routes',[])),trip_count=sum(len(r.get('trips',[])) for r in n.get('routes',[])),
 generations=dict(total=len(gens),ready=sum(g.get('ready') is True for g in gens),manual=sum((g.get('geometry') or {}).get('source')=='PERIX_MANUAL' for g in gens),sources=sorted({str((g.get('geometry') or {}).get('source')) for g in gens})),
 latest_source_feed_age_s=time.time()-latest['feed_timestamp'] if latest.get('feed_timestamp') else None,
 db_stats_mb={k:stats.get(k) for k in ('dataSize','storageSize','indexSize')},
 configured_modes={k:os.getenv(k) for k in ('MOBILITY_WORKERS_ENABLED','MOBILITY_VISUAL_PROGRESS_ENABLED','MOBILITY_MOTION_ENABLED','MOBILITY_ATOMIC_GENERATIONS_ENABLED','MOBILITY_MOTION_PREVIEW_ENABLED','MOBILITY_GOOGLE_TRAFFIC_ENABLED','MOBILITY_SYNC_AUTO_ACTIVATE')}),default=str))
''')
        assert result['deployment'] == rollback['deployment']
        # Do not echo possibly unreviewed archive metadata verbatim.
        bound = result['active'].pop('static_input', None)
        result['active']['static_input_bound'] = isinstance(bound, dict)
        result['private_endpoint_matches_production_mongo_service'] = True
        result['mongo_volume_listed'] = any(v['node'].get('serviceId') == MONGO_SERVICE for v in env.get('volumeInstances',{}).get('edges',[]))
        with (root/'production-preflight.json').open('x', encoding='utf-8') as f:
            json.dump(result, f, indent=2)
    elif args.action == 'backup-mobility':
        result = remote('''import json,base64,io,zipfile,hashlib,time
from datetime import datetime,timezone
from bson import BSON,json_util
from pymongo import MongoClient
c=MongoClient(os.environ['MONGO_URL'],serverSelectionTimeoutMS=15000);db=c[os.environ['DB_NAME']]
scope={'region_id':'magdeburg','network_id':'de-magdeburg-mvb'}
n=db.bus_network_versions.find_one(dict(scope,active=True));assert n and n.get('service_date')
v=n['version_id']
queries={
 'bus_network_versions':dict(scope,version_id=v),
 'mobility_pattern_generations':dict(scope,version_id=v),
 'mobility_osm_graph_meta':{'key':'graph_meta:magdeburg'},
 'mobility_trip_realtime_journeys':dict(scope,network_version_id=v,service_date=n['service_date']),
 'mobility_realtime':dict(scope,network_version_id=v,service_date=n['service_date']),
 'mobility_stop_overrides':scope,'mobility_trip_overrides':scope,
 'mobility_graph_overlays':scope,'mobility_restrictions':scope,'mobility_traffic_profiles':scope}
def generation_signature():
 return sorted((str(r.get('pattern_id')),str(r.get('generation_id'))) for r in db.mobility_pattern_generations.find(dict(scope,version_id=v),{'pattern_id':1,'generation_id':1}))
before=generation_signature();buf=io.BytesIO();catalog={'version':v,'service_date':n['service_date'],'at':datetime.now(timezone.utc).isoformat(),'collections':{}};total=0
with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as z:
 for name,query in queries.items():
  rows=list(db[name].find(query).sort('_id',1));assert len(rows)<=50000
  data=b''.join(BSON.encode(r) for r in rows);total+=len(data);assert total<=256*1024*1024
  indexes=list(db[name].list_indexes()) if name in db.list_collection_names() else []
  catalog['collections'][name]={'count':len(rows),'sha256':hashlib.sha256(data).hexdigest(),'indexes':indexes}
  z.writestr(name+'.bson',data)
 z.writestr('catalog.json',json_util.dumps(catalog))
assert before==generation_signature(), 'Atomic generations changed during snapshot; retry before using'
assert db.bus_network_versions.find_one(dict(scope,active=True))['version_id']==v
data=buf.getvalue()
print(json.dumps(dict(deployment=os.getenv('RAILWAY_DEPLOYMENT_ID'),version=v,service_date=n['service_date'],
 collections={name:row['count'] for name,row in catalog['collections'].items()},bson_bytes=total,
 archive=base64.b64encode(data).decode(),archive_sha256=hashlib.sha256(data).hexdigest(),
 limits=['Read-only published transit model snapshot; no users, GPS/driver/session/business collections.',
 'Raw OSM graph (~GB) is not copied. This is not a full application/volume backup.',
 'Realtime documents retain original clocks; snapshot is not a transactional whole-database backup.'])))
''')
        payload = base64.b64decode(result.pop('archive'))
        assert hashlib.sha256(payload).hexdigest() == result['archive_sha256']
        with (root/'production-mobility-private-backup.zip').open('xb') as f:f.write(payload)
        (root/'production-mobility-backup-manifest.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    else:
        previous = json.loads((root/'production-preflight.json').read_text(encoding='utf-8'))
        result = remote('''import json,base64,io,zipfile,hashlib
from pathlib import Path
root=Path('/app');files=[]
for name in ('config.py','database.py','server.py','requirements.txt','webdist.dat'):
 p=root/name
 if p.is_file():files.append(p)
for name in ('mobility','models','public_services','routes','services','utils','static_fonts','tools'):
 for p in (root/name).rglob('*'):
  if p.is_file() and '__pycache__' not in p.parts and 'tests' not in p.parts and p.suffix in ('.py','.json','.ttf','.woff','.woff2'):
   files.append(p)
buf=io.BytesIO()
with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(set(files)):z.writestr('backend/'+p.relative_to(root).as_posix(),p.read_bytes())
print(json.dumps(dict(deployment=os.getenv('RAILWAY_DEPLOYMENT_ID'),archive=base64.b64encode(buf.getvalue()).decode(),archive_sha256=hashlib.sha256(buf.getvalue()).hexdigest(),files=len(files))))
''')
        assert result['deployment'] == previous['deployment']
        payload = base64.b64decode(result.pop('archive'))
        assert hashlib.sha256(payload).hexdigest() == result['archive_sha256']
        with (root/'production-code-rollback.zip').open('xb') as f:f.write(payload)
        (root/'production-code-rollback-manifest.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
