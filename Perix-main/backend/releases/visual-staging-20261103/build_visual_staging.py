"""Build/package the frozen candidate with staging-only public origins."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import zipfile

from package_visual_staging import sha, snapshot
from visual_staging_ops import ORIGIN, variables


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('action', choices=['build', 'package'])
    p.add_argument('--release', type=Path, required=True)
    args = p.parse_args()
    root = args.release
    manifest = json.loads((root/'source-manifest.json').read_text(encoding='utf-8'))
    assert snapshot(root/'source') == manifest['source_files'], 'Frozen source mismatch'
    if args.action == 'build':
        frontend = root/'source/frontend'
        assert not (root/'stage-dist').exists()
        configured = variables('00782732-9422-4ab1-8eea-e6be3fff5fd9')
        if not configured.get('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY'):
            backend = variables()
            configured['EXPO_PUBLIC_GOOGLE_MAPS_API_KEY'] = backend.get('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY') or backend.get('GOOGLE_MAPS_API_KEY') or ''
        env = {k: v for k, v in os.environ.items() if not k.startswith('EXPO_PUBLIC_')}
        env.update(EXPO_PUBLIC_BACKEND_URL=ORIGIN, EXPO_PUBLIC_APP_URL=ORIGIN,
            EXPO_PUBLIC_MOBILITY_MAP_ORIGINS=ORIGIN, EXPO_PUBLIC_MOBILITY_MAP_URL=ORIGIN+'/google-mobility-map.html',
            EXPO_PUBLIC_PERIX_GOOGLE_LOCATOR_TRAFFIC='false',
            EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=configured.get('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY', ''),
            EXPO_NO_MINIFY='1', EXPO_NO_DOTENV='1', CI='1',
            METRO_CACHE_ROOT=str(root/'metro-cache'))
        with (root/'stage-build.log').open('x', encoding='utf-8') as log:
            run = subprocess.run([str(frontend/'node_modules/.bin/expo.cmd'), 'export', '--platform', 'web', '--clear',
                '--output-dir', str(root/'stage-dist')], cwd=frontend, env=env, stdout=log, stderr=subprocess.STDOUT)
        result = dict(exit_code=run.returncode, backend_origin=ORIGIN, dotenv_disabled=True,
            public_maps_key_present=bool(env['EXPO_PUBLIC_GOOGLE_MAPS_API_KEY']),
            lockfile_sha256=manifest['source_files']['frontend/package-lock.json'])
        (root/'build-result.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
        print(json.dumps(result))
        raise SystemExit(run.returncode)
    assert json.loads((root/'build-result.json').read_text(encoding='utf-8'))['exit_code'] == 0
    dist = root/'stage-dist'
    entries = list(dist.glob('_expo/static/js/web/entry-*.js'))
    assert len(entries) == 1 and ORIGIN in entries[0].read_text(encoding='utf-8')
    runtime = root/'runtime'
    runtime.mkdir(exist_ok=False)
    allowed_folders = {'mobility', 'models', 'public_services', 'routes', 'services', 'utils', 'static_fonts'}
    allowed_root = {'.python-version', 'requirements.txt', 'config.py', 'database.py', 'server.py'}
    for path in sorted((root/'source/backend').rglob('*')):
        if not path.is_file():
            continue
        rel = path.relative_to(root/'source/backend')
        allowed = (len(rel.parts) == 1 and rel.name in allowed_root or
            rel.parts[0] in allowed_folders and 'tests' not in rel.parts or rel.as_posix() == 'tools/inspect_gtfs_notices.py')
        if not allowed or '__pycache__' in rel.parts:
            continue
        assert not rel.name.startswith('.env') and path.suffix not in ('.pyc', '.pyo')
        dest = runtime/'backend'/rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, dest)
    for name in ('Dockerfile', 'railway.json', '.dockerignore'):
        shutil.copyfile(root/'source'/name, runtime/name)
    with zipfile.ZipFile(runtime/'backend/webdist.dat', 'x', zipfile.ZIP_DEFLATED) as bundle:
        for path in sorted(dist.rglob('*')):
            if path.is_file():
                name = path.relative_to(dist).as_posix()
                entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                entry.compress_type = zipfile.ZIP_DEFLATED
                bundle.writestr(entry, path.read_bytes())
    hashes = snapshot(runtime)
    result = dict(schema=1, files=hashes, source_tree_sha256=manifest['source_tree_sha256'],
        runtime_tree_sha256=sha(json.dumps(hashes, sort_keys=True, separators=(',', ':')).encode()),
        origin=ORIGIN, frontend_entry=entries[0].name, frontend_entry_sha256=sha(entries[0].read_bytes()),
        tests_and_control_apps_excluded=True, secrets_and_env_files_excluded=True)
    (root/'runtime-manifest.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in result.items() if k != 'files'}))


if __name__ == '__main__':
    main()
