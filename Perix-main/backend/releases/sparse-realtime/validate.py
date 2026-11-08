"""Repeatable offline validation, with baseline TypeScript comparison."""
from pathlib import Path
import importlib.util
import json
import os
import re
import subprocess
import sys

T = Path(__file__).parent
ROOT = T / 'perix-sparse-realtime-release'
sys.argv = [sys.argv[0], 'validate']
spec = importlib.util.spec_from_file_location('sparse_release', T / 'perix-sparse-release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
snapshot = release.preflight()
front = ROOT / 'frontend-source'
backend = ROOT / 'context/Perix-main/backend'
env = os.environ.copy()
env.update(MONGO_URL='mongodb://127.0.0.1:1', DB_NAME='perix_sparse_offline')
tests = ['sparse_realtime_timing', 'sparse_realtime_ingestion', 'source_reconciliation',
         'effective_eta_consistency', 'effective_eta_physics', 'mobility_motion_engine',
         'mobility_motion_handover', 'mobility_motion_common', 'mobility_motion_bus_tram',
         'mobility_motion_lateness', 'mobility_timeline_contract', 'mobility_realtime_freshness',
         'mobility_realtime_trip_identity', 'mobility_detour_guard', 'vehicle_performance']
def run(label, command, cwd, environment=env):
    result = subprocess.run(command, cwd=cwd, env=environment, capture_output=True, text=True, timeout=180)
    text = result.stdout + result.stderr
    (ROOT / (label + '.log')).write_text(text, encoding='utf-8')
    return result.returncode, text

code, output = run('backend-tests', [sys.executable, '-m', 'pytest', '-q'] +
                   ['tests/test_' + name + '.py' for name in tests], backend)
assert code == 0, output
backend_count = int(re.search(r'(\d+) passed', output)[1])
code, output = run('frontend-tests', ['node', '--test'] +
                   [str(p.relative_to(front)) for p in (front / 'tests').glob('*.test.cjs')], front)
assert code == 0, output
frontend_count = int(re.search(r'(?:ℹ\s*)?pass (\d+)', output)[1])
eslint = str(front / 'node_modules/.bin/eslint.cmd')
code, output = run('focused-lint', [eslint, 'components/shared/MobilityTimingEvidence.tsx',
                   'lib/predictionEvidence.ts', 'lib/vehicleBridge.ts', 'lib/api/mobility.ts',
                   'hooks/useHomeTransit.ts', 'tests/sparse-realtime-evidence.test.cjs'], front)
assert code == 0, output
tsc = str(front / 'node_modules/.bin/tsc.cmd')
baseline_code, baseline = run('baseline-typecheck', [tsc, '--noEmit', '--pretty', 'false'],
                              T / 'perix-small-markers-release/frontend-source')
candidate_code, candidate = run('candidate-typecheck', [tsc, '--noEmit', '--pretty', 'false'], front)
baseline_errors = re.findall(r'^.+error TS.+$', baseline, re.M)
candidate_errors = re.findall(r'^.+error TS.+$', candidate, re.M)
assert candidate_code == baseline_code and candidate_errors == baseline_errors
assert len(candidate_errors) == 5 and all('components/stories/CityAdViewer.tsx' in e for e in candidate_errors)
after = release.preflight()
assert after['source_hashes'] == snapshot['source_hashes'] and after['backend_hashes'] == snapshot['backend_hashes']
result = {'backend_passed': backend_count, 'frontend_passed': frontend_count, 'focused_lint_passed': True,
          'typescript_new_errors': 0, 'typescript_baseline_errors': candidate_errors,
          'source_hashes': after['source_hashes'], 'backend_hashes': after['backend_hashes'],
          'legacy_fallback': 'explicitly uncertain; forward-only algorithm unchanged',
          'production_changed': False}
(ROOT / 'validation.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if not k.endswith('hashes')}, indent=2))
