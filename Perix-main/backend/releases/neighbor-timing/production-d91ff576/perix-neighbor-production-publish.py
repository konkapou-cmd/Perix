"""Publish verified production evidence without replacing the staging report."""
from pathlib import Path
import datetime
import hashlib
import json
import shutil

T = Path(__file__).parent
ROOT = T / 'perix-neighbor-timing-release'
def load(name):
    return json.loads((ROOT / name).read_bytes())
submission = load('production-submission.json')
status = load('production-deployment-status.json')
runtime = load('production-runtime-verification.json')
served = load('production-served-verification.json')
api = load('production-api-verification.json')
consistency = load('production-consistency-verification.json')
browser = load('production-browser-verification.json')
assert status['status'] == 'SUCCESS' and status['id'] == submission['deployment']
assert runtime['deployment'] == submission['deployment'] and runtime['verified'] == 274
assert not runtime['mismatches'] and not runtime['paid_routes']
assert served['deployment'] == submission['deployment'] and served['staging_origin_absent']
assert api['read_only'] and not api['synthetic_live_updates_inserted']
assert browser['production_entry_loaded'] and browser['map_revision_handling_loaded']
assert consistency['all_available_samples_coherent']
assert {s['mode'] for s in consistency['samples'] if s.get('coherent_snapshot_observed')} == {'bus', 'tram'}
assert load('production-config-before.json') == load('production-config-after.json')
assert load('production-offline-regressions.json')['passed'] == 24
manifest = load('production-manifest.json')
result = {'origin': served['origin'], 'deployment': submission['deployment'], 'status': 'SUCCESS',
    'verified_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'baseline_deployment': manifest['baseline_deployment'], 'validated_staging': manifest['validated_staging'],
    'package_files': len(manifest['files']), 'runtime_files_verified': runtime['verified'],
    'entry': manifest['entry'], 'entry_sha256': manifest['entry_sha256'],
    'backend_tests': 114, 'frontend_tests': 92, 'runtime_offline_cases': 24,
    'synthetic_mode_time_samples': 1200, 'paid_routes': False,
    'shared_WIP_excluded': True, 'database_migration_performed': False,
    'synthetic_live_updates_inserted': False, 'production_changed': True,
    'limitations': ['Position is a model estimate, not independent GPS proof',
        'Source diagnostics are bounded worker memory, not durable history',
        'Baseline CityAdViewer TypeScript diagnostics remain unchanged']}
(ROOT / 'production-release-result.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
target = Path(r'C:\Users\PC\Downloads\Perix1\Perix-main\backend\releases\neighbor-timing') / (
    'production-' + submission['deployment'][:8])
assert not target.exists(), 'Refusing overwrite of existing production evidence'
target.mkdir(parents=True)
names = ['production-promotion-preflight.json', 'production-build-result.json', 'production-manifest.json',
    'production-rollback-ready.json', 'production-submission.json', 'production-deployment-status.json',
    'production-runtime-verification.json', 'production-served-verification.json',
    'production-api-verification.json', 'production-browser-verification.json', 'production-consistency-verification.json',
    'production-config-before.json', 'production-config-after.json', 'production-offline-regressions.json',
    'production-release-result.json', 'validation.json', 'canonical-replay-verification.json',
    'constraint-property-verification.json', 'patch-reproduction-verification.json']
for name in names:
    shutil.copyfile(ROOT / name, target / name)
for name in ['perix-neighbor-production.py', 'perix-neighbor-production-api.py',
             'perix-neighbor-production-runtime.py', 'perix-neighbor-production-config.py',
             'perix-neighbor-production-consistency.py',
             'perix-neighbor-production-publish.py']:
    shutil.copyfile(T / name, target / name)
if (ROOT / 'production-timing-disclosure.png').exists():
    shutil.copyfile(ROOT / 'production-timing-disclosure.png', target / 'production-timing-disclosure.png')
report = f'''# Neighbour timing — production release

**Live:** {served['origin']}  
**Deployment:** `{submission['deployment']}` — SUCCESS  
**Previous production / frozen rollback:** `{manifest['baseline_deployment']}`  
**Validated staging:** `{manifest['validated_staging']}`

The 277-file upload is isolated from shared WIP. Its backend is byte-identical
to validated staging; only `Perix-main/backend/webdist.dat` differs for the
production-origin frontend. All 274 expected runtime backend hashes and the
served frontend entry/map HTML hashes match. No staging origin is embedded in
the production frontend. The active Magdeburg region/configuration is unchanged;
paid Google routing remains disabled. No database migration, artificial live
vehicle, live feed fixture or manual delay correction was inserted.

Validation: 114 backend / 92 frontend regressions, focused lint, zero new
TypeScript diagnostics against the five-error CityAdViewer baseline, the
465-point canonical tram 9 replay and 1,200 synthetic bus/tram time samples.
The 24 neighbour/fallback cases also passed in a separate production Python
process, with a nonresponsive local Mongo URL and no application-worker changes.
Production API and browser results in the accompanying JSON state the actual
dated samples, coverage and limitations; do not infer live GPS/fallback evidence
when those samples were absent.

Concurrent N7 bus and tram 4 samples shared one model-plan revision across fleet,
exact-platform arrival board and selected-trip detail. Their predicted arrival
clocks matched; board/marker ETAs were respectively 158/158 and 117/117 seconds,
with positive remaining distances. Sequential requests can legitimately span a
normal 12-second plan rebuild; they were not misreported as an internal mismatch.
Browser DOM checks rendered the two-anchor disclosure on actual tram 4, retained
42 exact-ID overview choices below top controls and above attribution, and loaded
the new revision-aware map. Pixel screenshots were unavailable because the desktop
browser window was not visible. Home loaded the new entry and its area prompt;
the conditional Home map was not exercised because no area was selected. No
origin preference or account state was changed to manufacture a passing result.

Position, next-stop ETA and stop detail use the same model plan, including the
replacement for the old forward-crawl fallback. Previous/following source stop
constraints preserve provider clocks and do not blindly move downstream delay
upstream. No unobserved red light or queue is presented as a real observation.
These safeguards enforce model consistency, not guaranteed physical tracking.
Worker-local diagnostics are bounded and disappear on restart.

The frozen rollback wrapper is verified and its exact scoped upload command is
in `production-rollback-ready.json`. Do not upload the dirty checkout. Existing
browser tabs need a refresh to load the new frontend; no cookies, account data
or origin preferences were cleared by this release.

The source patch/reproduction evidence remains in the parent release directory:
31 changed/new source files reproduced byte-for-byte from the stated baseline.
Helper scripts expect the approved original temporary artifact paths; they do
not contain credentials. No further automatic production monitoring is promised.
'''
(target / 'README.md').write_text(report, encoding='utf-8')
print(json.dumps({'exported': str(target), 'deployment': submission['deployment'],
                  'status': 'SUCCESS', 'runtime_verified': runtime['verified']}, indent=2))
