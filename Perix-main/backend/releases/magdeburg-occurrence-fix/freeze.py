"""Regenerate this bundle from frozen local evidence only; no network or deployment."""
import argparse
import difflib
import hashlib
import json
from pathlib import Path
import zipfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence', type=Path, required=True)
    parser.add_argument('--frontend-evidence', type=Path, required=True)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    release = Path(__file__).resolve().parent
    sha = lambda data: hashlib.sha256(data).hexdigest()
    load = lambda root, name: json.loads((root / name).read_bytes())
    final = load(args.evidence, 'latency-approved-manifest.json')
    deployed = load(args.evidence, 'latency-deployment-record.json')
    verified = load(args.evidence, 'latency-deployed-verification.json')
    baseline = load(args.evidence, 'baseline-manifest.json')
    manifest = load(release, 'manifest.json')
    source = Path(final['extraction'])
    assert deployed['artifact_frozen'] and verified['all_packaged_backend_hashes_verified']
    assert deployed['deployment_id'] == verified['deployment_id'] == '3b8ef7d6-7c7c-4763-b7f1-b133c53dc5e0'
    for name, expected in final['files'].items():
        assert sha((source / name).read_bytes()) == expected, name
    after = {n.removeprefix('backend/'): h for n, h in final['files'].items() if n.startswith('backend/')}
    assert len(after) == verified['verified_file_count'] == 252
    assert set(baseline['files']) <= set(after)
    records, chunks = [], []
    with zipfile.ZipFile(args.evidence / 'deployed-baseline.zip') as archive, zipfile.ZipFile(args.evidence / 'deployed-support.zip') as support:
        assert sha((args.evidence / 'deployed-baseline.zip').read_bytes()) == baseline['archive_sha256']
        assert sha((args.evidence / 'deployed-support.zip').read_bytes()) == baseline['support_archive_sha256']
        for name, expected in baseline['files'].items():
            assert sha((archive if name in archive.namelist() else support).read(name)) == expected, name
        for name, expected in sorted(after.items()):
            if baseline['files'].get(name) == expected:
                continue
            assert name.endswith(('.py', '.json')), name
            before = archive.read(name) if name in baseline['files'] else b''
            data = (source / 'backend' / name).read_bytes()
            for line in difflib.diff_bytes(difflib.unified_diff, before.splitlines(keepends=True), data.splitlines(keepends=True),
                                           fromfile=('a/' + name).encode() if name in baseline['files'] else b'/dev/null',
                                           tofile=('b/' + name).encode(), n=3):
                chunks.append(line if line.endswith(b'\n') else line + b'\n\\ No newline at end of file\n')
            records.append({'path': name, 'status': 'modified' if name in baseline['files'] else 'added',
                            'before_sha256': baseline['files'].get(name), 'after_sha256': expected, 'after_bytes': len(data)})
        reconstructed = {n: after[n] for n in set(archive.namelist()) | {r['path'] for r in records}}
    patch = b''.join(chunks)
    matcher = 'mobility/realtime_trip_identity.py'
    assert after[matcher] == baseline['files'][matcher] == final['matcher_sha256'] == verified['matcher_sha256']
    frontend = load(args.frontend_evidence, 'deployment-result.json')
    candidate = load(args.frontend_evidence, 'candidate-result.json')
    smoke = load(args.frontend_evidence, 'deployed-smoke-result.json')
    browser = []
    for result in smoke['results']:
        assert not result['errors'] and result['panel']['renderedRows'] == 20
        durations = [r['duration_ms'] for r in result['requests'] if 'duration_ms' in r]
        assert max(durations) < 15000
        browser.append({'viewport': result['name'], 'rendered_rows': 20, 'errors': 0,
                        'max_completed_request_ms': max(durations), 'overflow': result['overflow'],
                        'requests_without_completion_timing': sum('duration_ms' not in r for r in result['requests'])})
    manifest['deployed'] = {k: deployed[k] for k in ['project', 'environment', 'service', 'deployment_id', 'status',
        'image_digest', 'rollback_deployment', 'active_network', 'service_date', 'generation_ready',
        'generation_expected', 'schema_v', 'production_touched', 'variables_changed']}
    manifest['source_identity'] = {'manifest': 'latency-approved-manifest.json',
        'manifest_sha256': sha((args.evidence / 'latency-approved-manifest.json').read_bytes()),
        'source_manifest_sha256': final['source_manifest_sha256'], 'review_patch_sha256': final['review_patch_sha256'],
        'artifact_frozen': True, 'all_manifest_files_verified_against_final_package_extraction': True,
        'remote_verified_backend_files': 252, 'future_candidate_files_used': False}
    manifest['patch'].update(sha256=sha(patch), bytes=len(patch), modified=sum(r['status'] == 'modified' for r in records),
                             added=sum(r['status'] == 'added' for r in records))
    manifest['files'] = records
    manifest['reconstructed_file_hashes'] = dict(sorted(reconstructed.items()))
    manifest['historical_validation_not_rerun'] = {'records': ['LATENCY_DEPLOYMENT_RESULT.md', 'latency-approved-manifest.json',
        'latency-deployment-record.json', 'latency-deployed-verification.json'], 'candidate_tests_passed': final['candidate_tests_passed'],
        'packaged_tests_passed': deployed['packaged_tests_passed'], 'packaged_tests_skipped': deployed['packaged_tests_skipped'],
        'skip_reason': 'Older root capture deliberately excluded; actual 21-trip fixture included'}
    manifest['observed_staging_state_not_a_promise'] = {'record': 'latency-deployed-verification.json', 'utc': verified['utc'],
        'active': verified['active'], 'realtime_rows': verified['realtime_rows'], 'fresh_realtime_rows': verified['fresh_realtime_rows'],
        'https_samples': verified['https_samples'], 'all_https_under_15s': verified['all_https_under_15s'],
        'concurrent_batch_seconds': verified['concurrent_batch_seconds'], 'proven_cold_http': False}
    manifest['frontend_documentation_only'] = {'deployment_id': frontend['deployment']['id'], 'status': frontend['deployment']['status'],
        'candidate_bundle_sha256': candidate['bundle_sha256'], 'served_bundle_sha256': frontend['artifact']['sha256'],
        'candidate_and_served_hashes_are_distinct': True, 'observed_at': smoke['observed_at'], 'smoke_passed': frontend['smoke']['passed'],
        'browser': browser, 'assets_included': False, 'public_key_asset_included': False, 'candidate_tests': candidate['tests'],
        'typecheck_caveat': 'Five pre-existing CityAdViewer.tsx diagnostics on clean HEAD; not a clean typecheck claim',
        'production_changed': frontend['productionChanged']}
    manifest['remaining_caveats'] = ['Production unpromoted', 'Virtual schedule/realtime estimates are not GPS or proof of world accuracy',
        'Five existing CityAdViewer type errors', 'Older root capture replay skipped', 'Historical tests not rerun for bundle',
        'No latency SLA or proven cold HTTP', 'Existing dated policy and rollback limits remain']
    for name, data in [('source-delta.patch', patch), ('manifest.json', (json.dumps(manifest, indent=2) + '\n').encode())]:
        path = release / name
        if args.check:
            assert path.read_bytes() == data, 'Non-deterministic artifact: ' + name
        else:
            path.write_bytes(data)
        print(name, len(data), sha(data))
    for record in records:
        print(record['status'], record['path'])
    for path in sorted(release.iterdir()):
        if path.is_file():
            print('BUNDLE', path.name, path.stat().st_size)


if __name__ == '__main__':
    main()
