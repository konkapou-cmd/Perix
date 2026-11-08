"""Task-only hardening delta, preserving prior adaptive/provider reports."""
from pathlib import Path
import difflib,hashlib,json,shutil,subprocess,tempfile
import xml.etree.ElementTree as ET

ROOT=Path(r'C:\Users\PC\Downloads\Perix1');TEMP=Path(__file__).parent
BASE=TEMP/'perix-shadow-cache-baseline-20261026'
OUT=ROOT/'Perix-main/backend/releases/shadow-hardening-20261026'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
snapshot=json.loads((BASE/'manifest.json').read_bytes())
workflow='.github/workflows/mobility-physics-research.yml'
before_workflow=b''.join(line for line in (ROOT/workflow).read_bytes().splitlines(True)
    if b'test_shadow_rebuild_cache.py' not in line and b'benchmark_shadow_rebuild_cache.py' not in line)
prior=json.loads((ROOT/'Perix-main/backend/releases/adaptive-traffic-20261026/task-manifest.json').read_bytes())
assert hashlib.sha256(before_workflow).hexdigest()==prior['changes'][workflow]['after']
target=BASE/workflow;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(before_workflow)
snapshot[workflow]=sha(target)
modified=['Perix-main/backend/mobility/motion/bus_time_evidence.py',workflow]
added=['Perix-main/backend/tests/test_shadow_rebuild_cache.py','Perix-main/backend/tools/benchmark_shadow_rebuild_cache.py']
protected=[n for n in snapshot if n not in modified]
assert all(sha(ROOT/n)==h for n,h in snapshot.items() if n in protected)
chunks=[];changes={}
for name in modified+added:
    old,new=BASE/name,ROOT/name
    chunks.extend(difflib.diff_bytes(difflib.unified_diff,old.read_bytes().splitlines(True) if old.exists() else [],
        new.read_bytes().splitlines(True),fromfile=('a/'+name).encode() if old.exists() else b'/dev/null',tofile=('b/'+name).encode()))
    changes[name]={'before':sha(old) if old.exists() else None,'after':sha(new)}
patch=OUT/'task-only-delta.patch';assert not patch.exists();patch.write_bytes(b''.join(chunks))
scratch=Path(tempfile.mkdtemp(prefix='perix-shadow-memo-check-',dir=TEMP))
for name in modified:
    target=scratch/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(BASE/name,target)
git=['git','-c','core.autocrlf=false','-c','core.safecrlf=false']
subprocess.run(git+['apply','--check',str(patch)],cwd=scratch,check=True,capture_output=True,text=True)
subprocess.run(git+['apply',str(patch)],cwd=scratch,check=True,capture_output=True,text=True)
assert all(sha(scratch/n)==v['after'] for n,v in changes.items())
suites=ET.parse(OUT/'regression-results.xml').getroot().findall('.//testsuite')
totals={k:sum(int(s.get(k,0)) for s in suites) for k in ('tests','failures','errors','skipped')}
assert totals=={'tests':369,'failures':0,'errors':0,'skipped':1}
manifest={'base':'accepted adaptive working tree, not clean HEAD/production',
    'changes':changes,'patch_sha256':sha(patch),'byte_exact_reconstructed_files':len(changes),
    'protected_files_unchanged':{n:sha(ROOT/n) for n in protected},'tests':totals,'passed':368,
    'supplied_chat_credential_used_or_stored':False,'provider_requests':0,'production_operations':0,
    'flags_activated':False,'commit_push':False}
(OUT/'task-manifest.json').write_text(json.dumps(manifest,indent=2))
shutil.copyfile(Path(__file__),OUT/'reproduce-task-delta.py')
print(json.dumps({'source_files':len(changes),'passed':368,'skipped':1,'protected_unchanged':len(protected),
    'provider_requests':0,'production_operations':0,'supplied_chat_credential_used_or_stored':False},indent=2))
