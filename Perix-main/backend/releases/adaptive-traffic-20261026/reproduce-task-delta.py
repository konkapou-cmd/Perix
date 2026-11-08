"""Task-only delta from the accepted 330-test working tree, no deployment."""
from pathlib import Path
import difflib,hashlib,json,shutil,subprocess,tempfile
import xml.etree.ElementTree as ET

REPO=Path(r'C:\Users\PC\Downloads\Perix1');TEMP=Path(__file__).parent
BASE=TEMP/'perix-adaptive-baseline-20261026'
OUT=REPO/'Perix-main/backend/releases/adaptive-traffic-20261026'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
snapshot=json.loads((BASE/'manifest.json').read_bytes())
prefix='Perix-main/backend/'
modified=[prefix+n for n in ['mobility/tomtom_scheduler.py','mobility/tomtom_traffic.py',
 'mobility/motion/time_allocation.py','mobility/motion/engine.py','mobility/v2.py']]+['.github/workflows/mobility-physics-research.yml']
added=[prefix+n for n in ['mobility/tomtom_schedule.py','mobility/tomtom_temporal.py',
 'mobility/motion/bus_time_evidence.py','mobility/sampling_policies/magdeburg-weekly-v1.json',
 'tests/test_adaptive_traffic_sampling.py','tests/test_bus_temporal_position.py','tools/benchmark_adaptive_traffic.py']]
protected=[prefix+n for n in ['mobility/motion/tram.py','mobility/motion/bus.py','mobility/motion/common.py',
 'mobility/motion/config.py','mobility/motion/handover.py','mobility/motion/google_traffic.py','mobility/motion/traffic.py',
 'mobility/tomtom_control.py','mobility/tomtom_sampling.py','mobility/regions.py','mobility/generations.py',
 'mobility/infrastructure.py','mobility/signal_semantics.py','mobility/traffic_profiles.py',
 'releases/physics-time-allocation-20261026/README.md']]
assert all(sha(REPO/n)==snapshot[n] for n in protected)
chunks=[];changes={}
for name in modified+added:
    old,new=BASE/name,REPO/name
    if name in modified:assert sha(old)==snapshot[name]
    else:assert not old.exists()
    chunks.extend(difflib.diff_bytes(difflib.unified_diff,old.read_bytes().splitlines(True) if old.exists() else [],
        new.read_bytes().splitlines(True),fromfile=('a/'+name).encode() if old.exists() else b'/dev/null',tofile=('b/'+name).encode()))
    changes[name]={'before':sha(old) if old.exists() else None,'after':sha(new)}
patch=OUT/'task-only-delta.patch';assert not patch.exists();patch.write_bytes(b''.join(chunks))
scratch=Path(tempfile.mkdtemp(prefix='perix-adaptive-patch-check-',dir=TEMP))
for name in modified:
    target=scratch/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(BASE/name,target)
git=['git','-c','core.autocrlf=false','-c','core.safecrlf=false']
subprocess.run(git+['apply','--check',str(patch)],cwd=scratch,check=True,capture_output=True,text=True)
subprocess.run(git+['apply',str(patch)],cwd=scratch,check=True,capture_output=True,text=True)
assert all(sha(scratch/n)==h['after'] for n,h in changes.items())
def results(name):
    suites=ET.parse(OUT/name).getroot().findall('.//testsuite')
    return {key:sum(int(s.get(key,0)) for s in suites) for key in ('tests','failures','errors','skipped')}
units=results('new-unit-results.xml');regression=results('regression-results.xml')
assert units=={'tests':33,'failures':0,'errors':0,'skipped':0}
assert regression=={'tests':364,'failures':0,'errors':0,'skipped':1}
old_proof=json.loads((REPO/(prefix+'releases/physics-time-allocation-20261026/mongo-control-verification.json')).read_bytes())
assert old_proof['control_source_sha256']==sha(REPO/(prefix+'mobility/tomtom_control.py'))
manifest={'base':'accepted physics-time-allocation working tree, not clean HEAD/production',
 'modified_existing_files':modified,'added_source_files':added,'changes':changes,
 'protected_files_unchanged':{n:sha(REPO/n) for n in protected},
 'old_report_unchanged':True,'existing_mongo_proof_retained_by_source_hash':True,
 'task_patch_sha256':sha(patch),'byte_exact_reconstructed_source_files':len(changes),
 'new_units':units,'regression':regression,'regression_passed':363,
 'new_flags_default_false':['MOBILITY_TOMTOM_ADAPTIVE_SAMPLING_ENABLED','MOBILITY_TOMTOM_TRENDS_ENABLED','MOBILITY_BUS_TIME_EVIDENCE_ENABLED'],
 'flags_activated':False,'tomtom_provider_requests':0,'production_operations':0,'deployment':False,
 'commit_push':False,'actual_directional_coverage':0.,'independent_eta_mae_s':None,'actual_api_latency':None}
(OUT/'task-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
shutil.copyfile(Path(__file__),OUT/'reproduce-task-delta.py')
print(json.dumps({'output':str(OUT),'source_files':len(changes),'new_unit_passed':33,
    'regression_passed':363,'regression_skipped':1,'protected_unchanged':len(protected),
    'previous_report_unchanged':True,'actual_provider_requests':0,'production_operations':0},indent=2))
