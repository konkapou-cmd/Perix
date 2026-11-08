"""Extend the existing allowlisted release workflow for the neighbour candidate.

No production deployment command is introduced. Frozen parent staging artifacts
and the shared checkout remain untouched.
"""
from pathlib import Path
import hashlib
import json
import shutil
import sys

T = Path(__file__).parent
root = T / 'perix-neighbor-timing-release'
parent = T / 'perix-sparse-realtime-release'
if sys.argv[1] == 'init-release':
    assert not (root / 'baseline-manifest.json').exists()
    baseline = json.loads((parent / 'baseline-manifest.json').read_bytes())
    for name, digest in baseline['files'].items():
        source = parent / 'rollback-context' / name
        assert hashlib.sha256(source.read_bytes()).hexdigest() == digest
        target = root / 'rollback-context' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    shutil.copyfile(parent / 'baseline-manifest.json', root / 'baseline-manifest.json')
    # No importer/ordering changes in this delta. Retain its actual staging
    # verification only after checking the ordering implementation is identical.
    relative = 'context/Perix-main/backend/mobility/realtime_order.py'
    assert (root / relative).read_bytes() == (parent / relative).read_bytes()
    shutil.copyfile(parent / 'mongo-staging-verification.json', root / 'mongo-staging-verification.json')
    print(json.dumps({'baseline_files_verified': len(baseline['files']), 'parent_staging_preserved': True}))
    sys.exit(0)

workflow = (T / 'perix-sparse-release.py').read_text(encoding='utf-8')
workflow = workflow.replace("ROOT=T/'perix-sparse-realtime-release'", "ROOT=T/'perix-neighbor-timing-release'")
workflow = workflow.replace('backend/releases/sparse-realtime', 'backend/releases/neighbor-timing')
workflow = workflow.replace("if sys.argv[1]=='prepare':", "BACKEND.update({'mobility/neighbor_timing.py','mobility/motion/timeline_fallback.py','mobility/motion/diagnostics.py','tests/test_neighbor_timing.py'})\nif sys.argv[1]=='prepare':", 1)
workflow = workflow.replace('perix-sparse-validate.py', 'perix-neighbor-validate.py')
workflow = workflow.replace('perix-sparse-replay.py', 'perix-neighbor-replay.py')
workflow = workflow.replace('perix-sparse-stage-api.py', 'perix-neighbor-stage-api.py')
exec(compile(workflow, str(Path(__file__)), 'exec'))
if sys.argv[1] == 'export-evidence':
    target = Path(r'C:\Users\PC\Downloads\Perix1\Perix-main\backend\releases\neighbor-timing')
    for name in ('constraint-property-verification.json', 'stage-offline-regressions.json', 'stage-basis-snapshot.json',
                 'captured-canonical-generation.json', 'captured-canonical-trip.json'):
        if (root / name).exists():
            assert not (target / name).exists()
            shutil.copyfile(root / name, target / name)
    for name in ('perix-neighbor-runtime-tests.py', 'perix-neighbor-properties.py'):
        shutil.copyfile(T / name, target / name)
