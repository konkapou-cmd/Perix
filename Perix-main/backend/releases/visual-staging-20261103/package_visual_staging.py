"""Build/verify an exact staging candidate. No remote or deployment commands.

Baseline comes from Git objects, never a recursive copy of the dirty checkout.
Only the explicit overlays below are read from the working tree. Mixed physical
continuation edits are excluded by exact structural substitutions, not keywords
or heuristic hunk ownership. All resulting bytes are hashed and reviewable.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile

BACKEND = (
    'database.py', 'mobility/arrivals.py', 'mobility/domain.py', 'mobility/geometry_cache.py',
    'mobility/v2.py', 'routes/mobility.py', 'utils/gtfs.py', 'utils/mobility_workers.py',
    'mobility/motion/visual_context.py', 'mobility/motion/visual_curve_context.py',
    'mobility/motion/visual_progress.py', 'mobility/motion/visual_runtime.py',
    'mobility/motion/visual_shared_state.py', 'tools/inspect_gtfs_notices.py',
)
FRONTEND = (
    'app/(tabs)/locator.tsx', 'components/BusinessMap.d.ts', 'components/BusinessMap.native.tsx',
    'components/BusinessMap.web.tsx', 'components/VisualTransitMarker.native.tsx',
    'components/city/CityGatewayScreen.tsx', 'hooks/city/useCityDiscovery.ts', 'i18n/city.json',
    'lib/api/mobility.ts', 'lib/city/gateway.ts', 'lib/city/fleetPoller.ts',
    'lib/city/transitAttribution.ts', 'lib/city/transitPublication.ts', 'lib/city/visualGeometry.ts',
    'tests/gateway-transit-publication.test.cjs', 'tests/city-localization.test.cjs',
    'tests/city-presentation.test.cjs', 'tests/public-services.test.cjs',
    'tests/visual-http-capture-check.cjs',
)
TEST_SUPPORT = (
    'tests/test_daily_network_recovery.py', 'tests/test_mobility_civil_day.py',
    'tests/test_mobility_dated_carryover.py', 'tests/test_visual_context.py',
    'tests/test_visual_runtime.py', 'tests/test_visual_progress.py',
    'tests/test_visual_multiworker_isolated.py', 'tests/test_visual_http_isolated.py',
    'tests/visual_http_fixture_app.py', 'tests/test_geometry_generation_recovery.py',
    'tests/test_preview_geometry_binding.py', 'tests/test_realtime_order_isolated.py',
    'tests/test_osm_rollback_isolated.py', 'tests/test_run_isolated_mongo_tests.py',
    'tests/test_schedule_only_legs.py', 'tests/test_static_worker_tempfiles.py',
    'tests/test_mobility_worker_startup_guard.py', 'tests/test_inspect_gtfs_notices.py',
    'tools/run_isolated_mongo_tests.py', 'tools/rebuild_transit_offline.py',
)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def replace_once(text, old, new):
    if text.count(old) != 1:
        raise ValueError('Reviewed structural replacement no longer matches exactly')
    return text.replace(old, new, 1)


def snapshot(root):
    result = {}
    for folder, dirs, names in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in ('node_modules', '__pycache__', '.pytest_cache', '.expo'))
        for name in sorted(names):
            path = Path(folder)/name
            result[path.relative_to(root).as_posix()] = sha(path.read_bytes())
    return dict(sorted(result.items()))


def prepare(repo, target, baseline):
    target.mkdir(parents=False, exist_ok=False)
    commit = subprocess.check_output(['git', 'rev-parse', baseline+'^{commit}'], cwd=repo, text=True).strip()
    raw = subprocess.check_output(['git', 'archive', commit, 'Perix-main'], cwd=repo)
    files = {}
    with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
        for item in archive.getmembers():
            name = item.name.removeprefix('Perix-main/')
            if item.isfile() and (name.startswith(('backend/', 'frontend/')) or name in ('Dockerfile', 'railway.json', '.dockerignore')):
                if Path(name).name.startswith('.env') or name == 'backend/webdist.dat':
                    continue
                files[name] = archive.extractfile(item).read()
    original = dict(files)
    for folder, names in [('backend', BACKEND+TEST_SUPPORT), ('frontend', FRONTEND)]:
        for name in names:
            p = repo/'Perix-main'/folder/name
            if p.is_symlink():
                raise ValueError('No symlink overlays')
            files[folder+'/'+name] = p.read_bytes()

    # Keep baseline legacy physics; select only two reviewed engine fixes:
    # conditional stale-generation invalidation and schema-1 path binding.
    engine_name = 'backend/mobility/motion/engine.py'
    base = original[engine_name].decode().replace('\r\n', '\n')
    work = (repo/'Perix-main'/engine_name).read_text(encoding='utf-8')
    for start, end in [
        ('        if not generation_matches_path(bundle, path):', '                failure,'),
        ('    return {"schema": 1, "revision": revision, "journey_id": journey_id,', '            "stop_occurrence_index": index,'),
    ]:
        a = base.index(start)
        b = base.index(end, a)
        wa = work.index(start)
        wb = work.index(end, wa)
        selected = work[wa:wb]
        if start.startswith('    return'):
            comment = work.rfind('    # Bind the short window', 0, wa)
            selected = work[comment:wb]
        base = base[:a]+selected+base[b:]
    files[engine_name] = base.encode()

    # The source contains both visual mode and uncommitted physical continuation
    # work. Restore the entire legacy estimate tail, then insert only the exact
    # reviewed schedule-only guard into that tail.
    route_name = 'backend/routes/mobility.py'
    current = files[route_name].decode().replace('\r\n', '\n')
    old = original[route_name].decode().replace('\r\n', '\n')
    start, end = '    raw_progress = _raw_timeline_progress', 'def _park_position('
    tail = old[old.index(start):old.index(end)]
    guard = '''        if distance_to_next_stop_m > 1:
            leg_a_idx = max(0, min(len(timeline) - 2, next_idx - 1))
            if is_schedule_only_leg((path or {}).get("pattern_id"), leg_a_idx):
                return None
'''
    tail = replace_once(tail, '        motion = {\n', guard+'        motion = {\n')
    current = current[:current.index(start)]+tail+current[current.index(end):]
    files[route_name] = current.encode()

    # Keep only map provenance and the visual bypass from the mixed V2 file.
    v2_name = 'backend/mobility/v2.py'
    current = files[v2_name].decode().replace('\r\n', '\n')
    old = original[v2_name].decode().replace('\r\n', '\n')
    start = 'def _refresh_estimated_publications('
    current = current[:current.index(start)]+old[old.index(start):]
    bypass = '''        if (vehicle.get('motion') or {}).get('model') == 'TIME_NORMALIZED_VISUAL_ESTIMATE':
            out.append(vehicle)
            continue
'''
    a = current.index(start)
    current = current[:a]+replace_once(current[a:], '    for vehicle in vehicles:\n', '    for vehicle in vehicles:\n'+bypass)
    files[v2_name] = current.encode()

    for name, data in files.items():
        dest = target/'source'/name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
    hashes = snapshot(target/'source')
    changed = {n: dict(baseline=sha(original[n]) if n in original else None, candidate=sha(b))
               for n, b in files.items() if original.get(n) != b}
    manifest = dict(schema=1, baseline_commit=commit, source_files=hashes,
        source_tree_sha256=sha(json.dumps(hashes, sort_keys=True, separators=(',', ':')).encode()),
        changes=changed, overlays=dict(backend=list(BACKEND), frontend=list(FRONTEND), validation=list(TEST_SUPPORT)),
        physical_continuation_wip_excluded=True, old_webdist_excluded=True,
        test_control_apps_runtime_excluded=True, production_authorized=False)
    (target/'source-manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    return manifest


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('action', choices=['prepare', 'verify'])
    p.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[3])
    p.add_argument('--target', type=Path, required=True)
    p.add_argument('--baseline', default='082be7d5')
    args = p.parse_args()
    if args.action == 'prepare':
        m = prepare(args.repo, args.target, args.baseline)
    else:
        m = json.loads((args.target/'source-manifest.json').read_text(encoding='utf-8'))
        if snapshot(args.target/'source') != m['source_files']:
            raise ValueError('Source bytes changed since packaging')
    print(json.dumps(dict(files=len(m['source_files']), changes=len(m['changes']),
        source_tree_sha256=m['source_tree_sha256'], target=str(args.target), action=args.action)))


if __name__ == '__main__':
    main()
