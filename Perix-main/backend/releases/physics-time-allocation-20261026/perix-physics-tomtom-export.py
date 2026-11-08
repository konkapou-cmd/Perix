"""Export only this task's changes against the recorded pre-existing WIP."""
from pathlib import Path
import difflib,hashlib,json,shutil,subprocess,tempfile,sys

REPO=Path(r'C:\Users\PC\Downloads\Perix1')
BACKEND=REPO/'Perix-main/backend'
TEMP=Path(__file__).parent
BASE=TEMP/'perix-physics-tomtom-baseline-20261026'
OUT=BACKEND/'releases/physics-time-allocation-20261026'
MODIFIED=['mobility/motion/common.py','mobility/motion/bus.py','mobility/motion/tram.py',
 'mobility/motion/engine.py','mobility/motion/traffic.py','mobility/motion/diagnostics.py',
 'mobility/motion/explain.py','mobility/v2.py','mobility/traffic_profiles.py','utils/mobility_workers.py']
ADDED=['mobility/motion/time_allocation.py','mobility/tomtom_traffic.py','mobility/tomtom_control.py',
 'mobility/tomtom_sampling.py','mobility/tomtom_scheduler.py','tests/test_mobility_time_allocation.py',
 'tests/test_tomtom_evidence.py','tests/test_tomtom_sampling_control.py','tools/mobility_physics_research.py',
 'tools/benchmark_time_allocation.py','MOBILITY_PHYSICS_TOMTOM_AUDIT_2026-10-26.md','MOBILITY_PHYSICS_TOMTOM.md']
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
baseline=json.loads((BASE/'manifest.json').read_bytes())
for name in MODIFIED:
    assert sha(BASE/name)==baseline[name]
untouched=['mobility/motion/config.py','mobility/signal_semantics.py','mobility/infrastructure.py',
 'mobility/generations.py','mobility/regions.py','utils/gtfs.py','mobility/traffic_counts.py']
assert all(sha(BACKEND/n)==baseline[n] for n in untouched)
changes={}
chunks=[]
for name in MODIFIED+ADDED:
    relative='Perix-main/backend/'+name
    old=BASE/name;new=BACKEND/name
    if name in ADDED:assert not old.exists()
    chunks.extend(difflib.diff_bytes(difflib.unified_diff,old.read_bytes().splitlines(True) if old.exists() else [],
        new.read_bytes().splitlines(True),fromfile=('a/'+relative).encode() if old.exists() else b'/dev/null',
        tofile=('b/'+relative).encode()))
    changes[relative]={'before':sha(old) if old.exists() else None,'after':sha(new)}
workflow='.github/workflows/mobility-physics-research.yml'
chunks.extend(difflib.diff_bytes(difflib.unified_diff,[],(REPO/workflow).read_bytes().splitlines(True),
    fromfile=b'/dev/null',tofile=('b/'+workflow).encode()))
changes[workflow]={'before':None,'after':sha(REPO/workflow)}
patch=OUT/'task-only-delta.patch'
if patch.exists():
    assert len(sys.argv)==2 and sha(patch)==sys.argv[1], 'Exported patch changed; refusing overwrite'
patch.write_bytes(b''.join(chunks))
check=Path(tempfile.mkdtemp(prefix='perix-tomtom-patch-check-',dir=TEMP))
for name in MODIFIED:
    target=check/'Perix-main/backend'/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(BASE/name,target)
git=['git','-c','core.autocrlf=false','-c','core.safecrlf=false']
subprocess.run(git+['apply','--check',str(patch)],cwd=check,check=True,capture_output=True,text=True)
subprocess.run(git+['apply',str(patch)],cwd=check,check=True,capture_output=True,text=True)
assert all(sha(check/name)==entry['after'] for name,entry in changes.items())
mongo=json.loads((OUT/'mongo-control-verification.json').read_bytes())
assert mongo['control_source_sha256']==sha(BACKEND/'mobility/tomtom_control.py')
ranking=json.loads((OUT/'active-network-point-ranking-v3.json').read_bytes())
assert ranking['selector_source_sha256']==sha(BACKEND/'mobility/tomtom_sampling.py')
production=json.loads((TEMP/'perix-neighbor-timing-release/production-runtime-verification.json').read_bytes())
assert production['deployment']=='d91ff576-492d-45e8-a388-c2b00d0746c6' and production['mismatches']==[]
(OUT/'production-unchanged-verification.json').write_text(json.dumps(production,indent=2))
manifest={'base':'pre-existing local WIP, not clean HEAD or production source',
 'modified_existing_files':MODIFIED,'added_backend_files':ADDED,'added_workflow':workflow,
 'changes':changes,'patch_sha256':sha(patch),'git_apply_check':True,
 'byte_exact_reconstructed_files':len(changes),'protected_modules_unchanged':untouched,
 'production_modified':False,'tomtom_http_requests':0,'flags_activated':False}
(OUT/'task-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
for name in ('perix-tomtom-control-verify.py','perix-tomtom-rank-active.py','perix-physics-tomtom-export.py'):
    shutil.copyfile(TEMP/name,OUT/name)
print(json.dumps({'patch_sha256':sha(patch),'byte_exact_reconstructed_files':len(changes),
    'protected_modules_unchanged':untouched,'production_modified':False,'output':str(OUT)},indent=2))
