"""Explicitly authorized promotion of the frozen neighbour timing candidate.

Never reads source from the dirty checkout. Production upload uses the verified
wrapper containing Perix-main; staging artifacts and rollback are immutable.
"""
from pathlib import Path
import datetime
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
import zipfile

T = Path(__file__).parent
ROOT = T / 'perix-neighbor-timing-release'
ACTION = sys.argv[1]
sys.argv = [sys.argv[0], 'production-library']
spec = importlib.util.spec_from_file_location('release', T / 'perix-neighbor-release.py')
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
PROD = 'https://app.perix.eu'
ENV = 'a2b06de5-a5a6-4365-ae67-9ee519a3f7b6'
SERVICE = '94882f6a-8179-43bc-bdf5-73eb1de4a059'
STAGE_DEPLOYMENT = '41bc15ee-d2e2-4c1c-9a99-e390b5add33e'
RAILWAY = str(Path.home() / 'AppData/Roaming/npm/railway.cmd')

def load(name):
    return json.loads((ROOT / name).read_bytes())

def save(name, value):
    r.save(name, value)

def gates():
    p = r.preflight()
    validation = load('validation.json')
    stage = load('stage-manifest.json')
    assert p['source_hashes'] == validation['source_hashes'] == stage['source_hashes']
    assert p['backend_hashes'] == validation['backend_hashes'] == stage['backend_source_hashes']
    assert validation['backend_passed'] == 114 and validation['frontend_passed'] == 92
    assert validation['focused_lint_passed'] and validation['typescript_new_errors'] == 0
    assert r.files(ROOT / 'stage-upload') == stage['files'], 'Frozen staging upload changed'
    deployment = load('stage-deployment-result.json')
    assert deployment['deployment'] == STAGE_DEPLOYMENT and deployment['status'] == 'SUCCESS'
    assert load('stage-runtime-verification.json')['mismatches'] == []
    assert not load('stage-runtime-verification.json')['paid_routes']
    assert load('stage-served-verification.json')['entry_sha256'] == stage['entry_sha256']
    assert load('stage-offline-regressions.json')['passed'] == 24
    assert load('constraint-property-verification.json')['mode_time_samples'] == 1200
    assert load('canonical-replay-verification.json')['provider_records_unchanged']
    assert all(load('mongo-staging-verification.json')['checks'].values())
    assert load('patch-reproduction-verification.json')['reconstructed_files_matching'] == 31
    return p

def runtime(manifest, production, expected_deployment):
    expected = {n.removeprefix('Perix-main/backend/'): h for n, h in manifest['files'].items()
                if n.startswith('Perix-main/backend/')}
    code = '''
import hashlib,json,os
from pathlib import Path
names=NAMES
print(json.dumps({'hashes':{n:hashlib.sha256((Path('/app')/n).read_bytes()).hexdigest() if (Path('/app')/n).is_file() else None for n in names},
 'deployment':os.getenv('RAILWAY_DEPLOYMENT_ID'),'service':os.getenv('RAILWAY_SERVICE_ID'),
 'environment':os.getenv('RAILWAY_ENVIRONMENT_ID'),'project':os.getenv('RAILWAY_PROJECT_ID'),
 'paid_routes':os.getenv('MOBILITY_GOOGLE_TRAFFIC_ENABLED','false').lower()=='true'}))
'''.replace('NAMES', repr(list(expected)))
    result = r.remote(code, production)
    mismatches = [n for n, h in expected.items() if result['hashes'].get(n) != h]
    assert not mismatches, mismatches
    assert result['deployment'] == expected_deployment, 'Unexpected active deployment'
    assert result['project'] == r.PROJECT
    assert result['service'] == (SERVICE if production else r.SERVICE)
    if production:
        assert result['environment'] == ENV
    assert not result['paid_routes'], 'Paid routing unexpectedly enabled'
    return {k: v for k, v in result.items() if k != 'hashes'} | {
        'verified': len(expected), 'mismatches': mismatches}

def verify_prior():
    gates()
    result = {
        'at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'production': runtime(load('baseline-manifest.json'), True, r.BASELINE),
        'staging': runtime(load('stage-manifest.json'), False, STAGE_DEPLOYMENT),
        'rollback_files_verified': len(r.files(ROOT / 'rollback-context')),
        'shared_WIP_excluded': True,
    }
    save('production-promotion-preflight.json', result)
    return result

if ACTION == 'preflight':
    print(json.dumps(verify_prior(), indent=2))

if ACTION == 'build':
    p = gates()
    assert load('production-promotion-preflight.json')['production']['deployment'] == r.BASELINE
    dist = ROOT / 'production-dist'
    assert not dist.exists(), 'Refusing overwrite of a previous production build'
    entries = list((r.BASE / 'production-dist').glob('_expo/static/js/web/entry-*.js'))
    assert len(entries) == 1
    published = entries[0].read_text(encoding='utf-8')
    public_keys = {}
    for field in ('EXPO_PUBLIC_GOOGLE_MAPS_JS_KEY', 'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY'):
        values = list(dict.fromkeys(re.findall(re.escape(field) + r'\\":\\"(AIza[0-9A-Za-z_-]{35})', published)))
        assert len(values) == 1, field
        public_keys[field] = values[0]
    env = {k: v for k, v in os.environ.items() if not k.startswith('EXPO_PUBLIC_')}
    env.update(public_keys)
    env.update(EXPO_PUBLIC_BACKEND_URL=PROD, EXPO_PUBLIC_APP_URL=PROD,
        EXPO_PUBLIC_MOBILITY_MAP_URL=PROD + '/google-mobility-map.html',
        EXPO_PUBLIC_MOBILITY_MAP_ORIGINS=PROD, EXPO_PUBLIC_PERIX_GOOGLE_LOCATOR_TRAFFIC='false',
        EXPO_NO_MINIFY='1', EXPO_NO_DOTENV='1', CI='1')
    with (ROOT / 'production-build.log').open('w', encoding='utf-8') as log:
        result = subprocess.run([str(r.REPO / 'Perix-main/frontend/node_modules/.bin/expo.cmd'),
            'export', '--platform', 'web', '--clear', '--output-dir', str(dist)],
            cwd=ROOT / 'frontend-source', env=env, stdout=log, stderr=subprocess.STDOUT)
    after = gates()
    assert after['source_hashes'] == p['source_hashes']
    save('production-build-result.json', {'status': result.returncode, 'origin': PROD,
         'source_hashes': p['source_hashes'], 'paid_frontend_routing': False})
    print(json.dumps({'status': result.returncode, 'origin': PROD}))
    sys.exit(result.returncode)

if ACTION == 'package':
    p = gates()
    assert load('production-build-result.json')['status'] == 0
    assert load('production-build-result.json')['source_hashes'] == p['source_hashes']
    dist, upload = ROOT / 'production-dist', ROOT / 'production-upload'
    assert not upload.exists(), 'Refusing overwrite of frozen production upload'
    entries = list(dist.glob('_expo/static/js/web/entry-*.js'))
    assert len(entries) == 1
    assert PROD.encode() in entries[0].read_bytes()
    for file in dist.rglob('*'):
        if file.is_file() and file.suffix in ('.js', '.html', '.json'):
            assert r.STAGE.encode() not in file.read_bytes(), 'Staging origin in production build'
    assert r.sha(dist / 'google-mobility-map.html') == r.sha(ROOT / 'frontend-source/public/google-mobility-map.html')
    for name, digest in p['backend_hashes'].items():
        target = upload / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / 'context' / name, target)
        assert r.sha(target) == digest
    with zipfile.ZipFile(upload / 'Perix-main/backend/webdist.dat', 'w', zipfile.ZIP_DEFLATED) as bundle:
        for file in sorted(dist.rglob('*')):
            if file.is_file():
                bundle.write(file, file.relative_to(dist).as_posix())
    files = r.files(upload)
    stage = load('stage-manifest.json')
    assert set(files) == set(stage['files'])
    assert [n for n in files if files[n] != stage['files'][n]] == ['Perix-main/backend/webdist.dat']
    baseline = load('baseline-manifest.json')['files']
    changed = sorted(n for n, h in files.items() if baseline.get(n) != h)
    assert set(changed) == set(p['backend_delta']) | {'Perix-main/backend/webdist.dat'}
    manifest = {'baseline_deployment': r.BASELINE, 'validated_staging': STAGE_DEPLOYMENT,
        'files': files, 'changed': changed, 'origin': PROD,
        'entry': entries[0].name, 'entry_sha256': r.sha(entries[0]),
        'source_hashes': p['source_hashes'], 'backend_source_hashes': p['backend_hashes'],
        'only_difference_from_staging': ['Perix-main/backend/webdist.dat'], 'staging_origin_absent': True}
    save('production-manifest.json', manifest)
    rollback = {'deployment': r.BASELINE, 'verified_files': len(baseline),
        'command': [RAILWAY, 'up', str(ROOT / 'rollback-context'), '--path-as-root',
            '--project', r.PROJECT, '--environment', ENV, '--service', SERVICE, '--detach']}
    save('production-rollback-ready.json', rollback)
    print(json.dumps({'package_files': len(files), 'entry': manifest['entry'],
        'only_difference_from_staging': manifest['only_difference_from_staging'],
        'rollback_files_verified': len(baseline)}, indent=2))

if ACTION == 'deploy':
    p = gates()
    manifest = load('production-manifest.json')
    assert r.files(ROOT / 'production-upload') == manifest['files']
    assert manifest['source_hashes'] == p['source_hashes']
    assert manifest['backend_source_hashes'] == p['backend_hashes']
    assert not (ROOT / 'production-submission.json').exists(), 'Production was already submitted'
    verify_prior()  # Fail closed if either active release changed during the build.
    command = [RAILWAY, 'up', str(ROOT / 'production-upload'), '--path-as-root',
        '--project', r.PROJECT, '--environment', ENV, '--service', SERVICE, '--detach']
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=180)
    output = result.stdout + '\n' + result.stderr
    (ROOT / 'production-deploy.log').write_text(output, encoding='utf-8')
    assert result.returncode == 0, 'Upload failed; inspect the scoped deployment log'
    deployments = re.findall(r'[?&]id=([0-9a-f-]{36})', output)
    assert len(set(deployments)) == 1, 'Cannot identify submitted deployment'
    submission = {'deployment': deployments[0], 'service': SERVICE, 'environment': ENV,
        'project': r.PROJECT, 'status': 'SUBMITTED', 'origin': PROD}
    save('production-submission.json', submission)
    print(json.dumps(submission, indent=2))

if ACTION == 'status':
    result = subprocess.run([RAILWAY, 'deployment', 'list', '--service', SERVICE,
        '--environment', ENV, '--json'], cwd=r.REPO, capture_output=True, text=True, check=True, timeout=90)
    deployment = load('production-submission.json')['deployment']
    row = next(d for d in json.loads(result.stdout) if d['id'] == deployment)
    report = {k: row[k] for k in ('id', 'status', 'createdAt')}
    save('production-deployment-status.json', report)
    print(json.dumps(report, indent=2))

if ACTION == 'verify-runtime':
    submission = load('production-submission.json')
    assert load('production-deployment-status.json')['status'] == 'SUCCESS'
    report = runtime(load('production-manifest.json'), True, submission['deployment'])
    save('production-runtime-verification.json', report)
    print(json.dumps(report, indent=2))

if ACTION == 'verify-served':
    manifest = load('production-manifest.json')
    deployment = load('production-submission.json')['deployment']
    def get(path):
        join = '&' if '?' in path else '?'
        request = urllib.request.Request(PROD + path + join + 'release=' + deployment,
            headers={'Cache-Control': 'no-cache', 'Accept-Encoding': 'identity'})
        with urllib.request.urlopen(request, timeout=90) as response:
            assert response.geturl().startswith(PROD + '/')
            return response.read()
    assert manifest['entry'] in get('/locator?tab=mobility').decode()
    entry = get('/_expo/static/js/web/' + manifest['entry'])
    assert r.hashlib.sha256(entry).hexdigest() == manifest['entry_sha256']
    assert r.STAGE.encode() not in entry
    html = get('/google-mobility-map.html')
    assert r.hashlib.sha256(html).hexdigest() == r.sha(ROOT / 'frontend-source/public/google-mobility-map.html')
    report = {'origin': PROD, 'deployment': deployment, 'entry': manifest['entry'],
        'entry_sha256': manifest['entry_sha256'], 'map_html_sha256': r.hashlib.sha256(html).hexdigest(),
        'staging_origin_absent': True}
    save('production-served-verification.json', report)
    print(json.dumps(report, indent=2))
