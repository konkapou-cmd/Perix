"""Explicit staging-only operations. Credentials remain inside Railway.

No production mutation, imports, broad database copies or database deletion.
Remote scripts must verify project/environment/service identity before work.
"""
import argparse
import base64
import json
import re
from pathlib import Path
import subprocess
import zlib

PROJECT = '99643a3b-bf65-467a-8f2f-50640f519b2b'
ENVIRONMENT = '8dea60e3-332a-4fec-9394-7c682eb69b9a'
SERVICE = '509e0b41-9c7a-41e1-9e95-3124c958fff9'
MONGO_SERVICE = '17d03d19-cf90-464c-848e-b8f31bd55b07'
ORIGIN = 'https://backend-staging-staging-7ada.up.railway.app'
DATABASE = 'perix_visual_stage_20261103_v1'


def cli(*args):
    result = subprocess.run(['railway.cmd', *args], capture_output=True, text=True, encoding='utf-8', timeout=150)
    if result.returncode:
        lines = (result.stderr.strip() or result.stdout.strip()).splitlines()
        tail = lines[-1] if lines else 'no diagnostic'
        tail = re.sub(r'(?:https?|mongodb(?:\+srv)?)://\S+', '[redacted URL]', tail)
        raise RuntimeError('Railway operation failed; exit '+str(result.returncode)+'; '+tail[:180])
    return result.stdout.strip()


def variables(service=SERVICE):
    return json.loads(cli('variable', 'list', '-e', ENVIRONMENT, '-s', service, '--json'))


def remote(code):
    guard = f'''import os
assert os.getenv('RAILWAY_PROJECT_ID') == {PROJECT!r}
assert os.getenv('RAILWAY_ENVIRONMENT_ID') == {ENVIRONMENT!r}
assert os.getenv('RAILWAY_SERVICE_ID') == {SERVICE!r}
'''
    payload = base64.b64encode(zlib.compress((guard+code).encode())).decode()
    command = 'python -c "import base64,zlib;exec(zlib.decompress(base64.b64decode(\''+payload+'\')))"'
    return json.loads(cli('ssh', '-p', PROJECT, '-e', ENVIRONMENT, '-s', SERVICE, '--', command))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['preflight', 'capture-rollback', 'configure', 'deploy', 'verify-runtime', 'state-snapshot'])
    parser.add_argument('--release', type=Path, required=True)
    parser.add_argument('--reuse-qa-database', action='store_true',
                        help='Update the existing dedicated QA namespace after verifying it contains no user data')
    args = parser.parse_args()
    if args.action == 'preflight':
        status = json.loads(cli('status', '--json'))
        assert status['id'] == PROJECT
        env = next(e['node'] for e in status['environments']['edges'] if e['node']['id'] == ENVIRONMENT)
        service = next(e['node'] for e in env['serviceInstances']['edges'] if e['node']['serviceId'] == SERVICE)
        assert any(d['domain'] == ORIGIN.split('//')[1] for d in service['domains']['serviceDomains'])
        stage, mongo = variables(), variables(MONGO_SERVICE)
        from urllib.parse import urlsplit
        host = urlsplit(stage['MONGO_URL']).hostname
        assert host and host == mongo['RAILWAY_PRIVATE_DOMAIN']
        result = remote(f'''import json
from pymongo import MongoClient
from urllib.parse import urlsplit
c=MongoClient(os.environ['MONGO_URL'],serverSelectionTimeoutMS=15000)
hello=c.admin.command('hello')
assert not hello.get('setName') and hello.get('msg') != 'isdbgrid'
assert urlsplit(os.environ['MONGO_URL']).hostname == {host!r}
collections=c[{DATABASE!r}].list_collection_names()
reuse={args.reuse_qa_database!r}
if reuse:
 assert os.environ['DB_NAME']=={DATABASE!r}
 assert c[{DATABASE!r}].bus_network_versions.count_documents({{'qa_synthetic':{{'$ne':True}}}})==0
 assert c[{DATABASE!r}].users.count_documents({{}})==0
 assert os.getenv('MOBILITY_WORKERS_ENABLED')=='false'
else:
 assert not collections, 'Candidate database is not empty'
checks=[]
from pathlib import Path
for p in Path('/proc').iterdir():
 if p.name.isdigit():
  try:
   cmd=(p/'cmdline').read_bytes().split(b'\\0')
   if b'server:app' in cmd and any(x.rsplit(b'/',1)[-1]==b'uvicorn' for x in cmd):
    initial=dict(x.split(b'=',1) for x in (p/'environ').read_bytes().split(b'\\0') if b'=' in x)
    checks.append(all(initial.get(k.encode())==os.environ.get(k,'').encode() for k in ('MONGO_URL','DB_NAME')))
  except (OSError,ValueError): pass
assert checks and all(checks)
print(json.dumps(dict(deployment=os.getenv('RAILWAY_DEPLOYMENT_ID'), standalone_mongo=True,
 endpoint_matches_stage_private_domain=True, app_initial_database_env_matches=True,
 app_processes=len(checks), candidate_database_empty=not bool(collections), reuse_verified_qa_database=reuse)))
''')
        assert result['deployment'] == service['latestDeployment']['id']
        keys = ['DB_NAME', 'MOBILITY_WORKERS_ENABLED', 'MOBILITY_VISUAL_PROGRESS_ENABLED',
                'MOBILITY_ATOMIC_GENERATIONS_ENABLED', 'MOBILITY_MOTION_PREVIEW_ENABLED',
                'MOBILITY_GOOGLE_TRAFFIC_ENABLED', 'MOBILITY_SYNC_AUTO_ACTIVATE']
        rollback = dict(deployment=result['deployment'], service=SERVICE, environment=ENVIRONMENT,
                        settings={k: stage.get(k) for k in keys})
        dest = args.release/'staging-rollback.json'
        with dest.open('x', encoding='utf-8') as f:
            json.dump(rollback, f, indent=2)
        result['database_strategy'] = ('Retain verified dedicated QA namespace; no database deletion'
            if args.reuse_qa_database else 'New isolated name; existing DB unchanged; no imports or deletes')
        (args.release/'staging-preflight.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    elif args.action == 'capture-rollback':
        assert (args.release/'staging-rollback.json').is_file()
        old = json.loads((args.release/'staging-rollback.json').read_text(encoding='utf-8'))
        captured = remote('''import json,base64,io,zipfile,hashlib
from pathlib import Path
root=Path('/app');files=[]
for name in ('config.py','database.py','server.py','requirements.txt','webdist.dat'):
 p=root/name
 if p.is_file(): files.append(p)
for name in ('mobility','models','public_services','routes','services','utils','static_fonts','tools'):
 for p in (root/name).rglob('*'):
  if p.is_file() and '__pycache__' not in p.parts and 'tests' not in p.parts and p.suffix in ('.py','.json','.ttf','.woff','.woff2'):
   files.append(p)
buf=io.BytesIO()
with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(set(files)): z.writestr('backend/'+p.relative_to(root).as_posix(),p.read_bytes())
print(json.dumps(dict(deployment=os.getenv('RAILWAY_DEPLOYMENT_ID'),archive=base64.b64encode(buf.getvalue()).decode(),
 archive_sha256=hashlib.sha256(buf.getvalue()).hexdigest(),files=len(files))))
''')
        assert captured['deployment'] == old['deployment']
        import hashlib
        data = base64.b64decode(captured.pop('archive'))
        assert hashlib.sha256(data).hexdigest() == captured['archive_sha256']
        with (args.release/'staging-rollback-runtime.zip').open('xb') as f:
            f.write(data)
        result = captured
        (args.release/'staging-rollback-runtime-manifest.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    elif args.action == 'configure':
        assert (args.release/'staging-preflight.json').is_file()
        assert (args.release/'staging-rollback.json').is_file()
        assert (args.release/'staging-rollback-runtime.zip').is_file()
        # Stage variables only, no automatic deployment of the old source.
        values = dict(DB_NAME=DATABASE, MOBILITY_WORKERS_ENABLED='false', MOBILITY_VISUAL_PROGRESS_ENABLED='true',
            MOBILITY_ATOMIC_GENERATIONS_ENABLED='true', MOBILITY_MOTION_PREVIEW_ENABLED='true',
            MOBILITY_GOOGLE_TRAFFIC_ENABLED='false', MOBILITY_SYNC_AUTO_ACTIVATE='false')
        cli('variable', 'set', '-e', ENVIRONMENT, '-s', SERVICE, '--skip-deploys',
            *[k+'='+v for k, v in values.items()])
        actual = variables()
        assert all(actual.get(k) == v for k, v in values.items())
        result = dict(settings=values, production_changed=False, deployment_triggered=False)
        (args.release/'staging-configuration.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    elif args.action == 'state-snapshot':
        result = remote(f'''import json,hashlib
from pymongo import MongoClient
assert os.environ['DB_NAME']=={DATABASE!r}
db=MongoClient(os.environ['MONGO_URL'])[{DATABASE!r}]
out={{}}
for name in ('bus_network_versions','mobility_pattern_generations','mobility_visual_progress_state'):
 rows=list(db[name].find({{}}).sort('_id',1))
 out[name]=dict(count=len(rows),sha256=hashlib.sha256(json.dumps(rows,sort_keys=True,default=str).encode()).hexdigest())
print(json.dumps(dict(deployment=os.getenv('RAILWAY_DEPLOYMENT_ID'),collections=out)))
''')
        import time
        (args.release/('state-snapshot-'+str(time.time_ns())+'.json')).write_text(json.dumps(result, indent=2), encoding='utf-8')
    elif args.action == 'deploy':
        from package_visual_staging import snapshot
        manifest = json.loads((args.release/'runtime-manifest.json').read_text(encoding='utf-8'))
        assert snapshot(args.release/'runtime') == manifest['files'], 'Upload bytes changed'
        assert (args.release/'staging-configuration.json').is_file()
        assert (args.release/'staging-rollback-runtime.zip').is_file()
        output = cli('up', str(args.release/'runtime'), '--path-as-root', '--project', PROJECT,
            '--environment', ENVIRONMENT, '--service', SERVICE, '--detach')
        (args.release/'staging-deploy.log').write_text(output, encoding='utf-8')
        result = dict(submitted=True, target_service=SERVICE, target_environment=ENVIRONMENT,
            runtime_tree_sha256=manifest['runtime_tree_sha256'], production_changed=False)
        (args.release/'staging-submission.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    else:
        manifest = json.loads((args.release/'runtime-manifest.json').read_text(encoding='utf-8'))
        expected = {k.removeprefix('backend/'): v for k, v in manifest['files'].items() if k.startswith('backend/')}
        result = remote(f'''import json,hashlib,platform
from pathlib import Path
names={list(expected)!r}
actual={{k:hashlib.sha256((Path('/app')/k).read_bytes()).hexdigest() if (Path('/app')/k).is_file() else None for k in names}}
assert os.environ['DB_NAME']=={DATABASE!r}
assert os.getenv('MOBILITY_WORKERS_ENABLED')=='false'
assert os.getenv('MOBILITY_VISUAL_PROGRESS_ENABLED')=='true'
assert os.getenv('MOBILITY_GOOGLE_TRAFFIC_ENABLED')=='false'
process_checks=[]
for p in Path('/proc').iterdir():
 if p.name.isdigit():
  try:
   cmd=(p/'cmdline').read_bytes().split(b'\\0')
   if b'server:app' in cmd and any(x.rsplit(b'/',1)[-1]==b'uvicorn' for x in cmd):
    env=dict(x.split(b'=',1) for x in (p/'environ').read_bytes().split(b'\\0') if b'=' in x)
    process_checks.append(all(env.get(k.encode())==os.environ.get(k,'').encode() for k in
      ('MONGO_URL','DB_NAME','MOBILITY_WORKERS_ENABLED','MOBILITY_VISUAL_PROGRESS_ENABLED','MOBILITY_GOOGLE_TRAFFIC_ENABLED')))
  except (OSError,ValueError): pass
assert process_checks and all(process_checks)
print(json.dumps(dict(deployment=os.getenv('RAILWAY_DEPLOYMENT_ID'), hashes=actual, isolated_database=True,
 workers_disabled=True, visual_enabled=True, paid_traffic_disabled=True,
 app_processes=len(process_checks), app_initial_configuration_matches=True, python_version=platform.python_version())))
''')
        actual = result.pop('hashes')
        result['files_verified'] = sum(actual.get(k) == v for k, v in expected.items())
        result['mismatches'] = [k for k, v in expected.items() if actual.get(k) != v]
        (args.release/'staging-runtime-verification.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
        assert not result['mismatches']
    print(json.dumps(result))


if __name__ == '__main__':
    main()
