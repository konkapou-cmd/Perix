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
    p.add_argument('action', choices=['build', 'native-js', 'package'])
    p.add_argument('--release', type=Path, required=True)
    p.add_argument('--production', action='store_true', help='Approved web-only build for the fixed canonical production origin')
    args = p.parse_args()
    root = args.release
    origin = ORIGIN
    if args.production:
        assert args.action != 'native-js', 'Production authorization is web-only'
        assert (root/'production-preflight.json').is_file(), 'Production target must be verified first'
        origin = 'https://app.perix.eu'
    manifest = json.loads((root/'source-manifest.json').read_text(encoding='utf-8'))
    assert snapshot(root/'source') == manifest['source_files'], 'Frozen source mismatch'
    if args.action in ('build', 'native-js'):
        frontend = root/'source/frontend'
        native = args.action == 'native-js'
        output = root/('production-dist' if args.production else 'native-js-export' if native else 'stage-dist')
        assert not output.exists()
        if args.production:
            from visual_production_release import variables as production_variables
            configured = production_variables()
            # Only explicitly public browser keys. Never expose a server-side
            # GOOGLE_MAPS_API_KEY/GOOGLE_ROUTES_API_KEY as a frontend fallback.
            configured['EXPO_PUBLIC_GOOGLE_MAPS_API_KEY'] = configured.get('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY') or configured.get('EXPO_PUBLIC_GEO_KEY') or ''
            if not configured['EXPO_PUBLIC_GOOGLE_MAPS_API_KEY']:
                public = json.loads((root/'public-browser-config.json').read_text(encoding='utf-8'))
                assert public.get('from_production_deployed_public_entry') and public.get('served_production_entry_verified')
                configured['EXPO_PUBLIC_GOOGLE_MAPS_API_KEY'] = public['EXPO_PUBLIC_GOOGLE_MAPS_API_KEY']
            assert configured['EXPO_PUBLIC_GOOGLE_MAPS_API_KEY'], 'No explicitly public production map key configured'
        else:
            configured = variables('00782732-9422-4ab1-8eea-e6be3fff5fd9')
        if not configured.get('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY'):
            backend = variables()
            configured['EXPO_PUBLIC_GOOGLE_MAPS_API_KEY'] = backend.get('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY') or backend.get('GOOGLE_MAPS_API_KEY') or ''
        env = {k: v for k, v in os.environ.items() if not k.startswith('EXPO_PUBLIC_')}
        env.update(EXPO_PUBLIC_BACKEND_URL=origin, EXPO_PUBLIC_APP_URL=origin,
            EXPO_PUBLIC_MOBILITY_MAP_ORIGINS=origin, EXPO_PUBLIC_MOBILITY_MAP_URL=origin+'/google-mobility-map.html',
            EXPO_PUBLIC_PERIX_GOOGLE_LOCATOR_TRAFFIC='false',
            EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=configured.get('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY', ''),
            EXPO_NO_MINIFY='1', EXPO_NO_DOTENV='1', CI='1',
            METRO_CACHE_ROOT=str(root/('metro-cache-native' if native else 'metro-cache')))
        with (root/('native-js-build.log' if native else 'stage-build.log')).open('x', encoding='utf-8') as log:
            run = subprocess.run([str(frontend/'node_modules/.bin/expo.cmd'), 'export', '--platform', 'all' if native else 'web', '--clear',
                '--output-dir', str(output)], cwd=frontend, env=env, stdout=log, stderr=subprocess.STDOUT)
        result = dict(exit_code=run.returncode, backend_origin=origin, dotenv_disabled=True,
            public_maps_key_present=bool(env['EXPO_PUBLIC_GOOGLE_MAPS_API_KEY']),
            platforms='all (JS/Hermes export only; not native binary builds)' if native else 'web',
            lockfile_sha256=manifest['source_files']['frontend/package-lock.json'])
        (root/('native-js-build-result.json' if native else 'build-result.json')).write_text(json.dumps(result, indent=2), encoding='utf-8')
        print(json.dumps(result))
        raise SystemExit(run.returncode)
    assert json.loads((root/'build-result.json').read_text(encoding='utf-8'))['exit_code'] == 0
    dist = root/('production-dist' if args.production else 'stage-dist')
    entries = list(dist.glob('_expo/static/js/web/entry-*.js'))
    assert len(entries) == 1 and origin in entries[0].read_text(encoding='utf-8')
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
    preserved = []
    if args.production:
        backup_root = root
        if (root/'private-backup-location.json').exists():
            backup_root = Path(json.loads((root/'private-backup-location.json').read_text())['directory'])
        archive = backup_root/'production-code-rollback.zip'
        capture = json.loads((root/'production-code-rollback-manifest.json').read_text())
        assert sha(archive.read_bytes()) == capture['archive_sha256']
        with zipfile.ZipFile(archive) as old:
            for name in old.namelist():
                assert name.startswith('backend/') and '..' not in Path(name).parts
                dest = runtime/name
                data = old.read(name)
                if dest.is_file() and name != 'backend/webdist.dat':
                    # Preserve actual production bytes for EOL-only differences.
                    if dest.read_bytes().replace(b'\r\n', b'\n') == data.replace(b'\r\n', b'\n'):
                        dest.write_bytes(data)
                        preserved.append(name)
                elif name == 'backend/tools/build_osm_source.py':
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest.write_bytes(data)
                    preserved.append(name)
                elif name != 'backend/webdist.dat' and not dest.exists():
                    raise ValueError('Unreviewed production-only file: '+name)
        railway = json.loads((runtime/'railway.json').read_text())
        railway['deploy'].update(healthcheckPath='/api/mobility/v2/networks', healthcheckTimeout=300)
        (runtime/'railway.json').write_text(json.dumps(railway, indent=2)+'\n', encoding='utf-8')
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
        origin=origin, frontend_entry=entries[0].name, frontend_entry_sha256=sha(entries[0].read_bytes()),
        tests_and_control_apps_excluded=True, secrets_and_env_files_excluded=True,
        preserved_production_bytes=preserved)
    (root/'runtime-manifest.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in result.items() if k != 'files'}))


if __name__ == '__main__':
    main()
