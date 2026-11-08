"""Export byte-exact task delta from dirty WIP, never from clean HEAD."""
from pathlib import Path
import difflib,hashlib,json,shutil,subprocess,tempfile
import xml.etree.ElementTree as ET

ROOT=Path(r'C:\Users\PC\Downloads\Perix1')
T=Path(__file__).parent
BASE=T/'perix-native-baseline-20261026T090044Z'
OUT=ROOT/'Perix-main/backend/releases/native-recalibration-20261026'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
before=json.loads((BASE/'manifest.json').read_bytes())
changes={}
for name,digest in before.items():
    p=ROOT/name
    if not p.exists() or sha(p)!=digest:
        changes[name]={'before':digest,'after':sha(p) if p.exists() else None}
for tail in ['mobility/motion/native_recalibration.py','mobility/motion/native_realtime.py',
             'tests/test_native_recalibration.py','tools/replay_native_recalibration.py']:
    name='Perix-main/backend/'+tail
    assert name not in before
    changes[name]={'before':None,'after':sha(ROOT/name)}
assert len(changes)==28
assert sum(v['after'] is None for v in changes.values())==17
assert sum(v['before'] is None for v in changes.values())==4
protected=['Perix-main/backend/'+n for n in ['mobility/motion/bus.py','mobility/motion/tram.py',
 'mobility/motion/common.py','mobility/motion/config.py','mobility/motion/handover.py',
 'mobility/motion/google_traffic.py','mobility/traffic_profiles.py']]
protected += [n for n in before if '/releases/' in n and n.endswith('/README.md')]
assert all(sha(ROOT/n)==before[n] for n in protected)
chunks=[]
for name,value in changes.items():
    old,new=BASE/name,ROOT/name
    chunks.extend(difflib.diff_bytes(difflib.unified_diff,
        old.read_bytes().splitlines(True) if old.exists() else [],
        new.read_bytes().splitlines(True) if new.exists() else [],
        fromfile=('a/'+name).encode() if old.exists() else b'/dev/null',
        tofile=('b/'+name).encode() if new.exists() else b'/dev/null'))
patch=OUT/'task-only-delta.patch';assert not patch.exists();patch.write_bytes(b''.join(chunks))
scratch=Path(tempfile.mkdtemp(prefix='perix-native-delta-check-',dir=T))
for name,value in changes.items():
    if value['before'] is not None:
        target=scratch/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(BASE/name,target)
git=['git','-c','core.autocrlf=false','-c','core.safecrlf=false']
for args in [['apply','--check',str(patch)],['apply',str(patch)]]:
    subprocess.run(git+args,cwd=scratch,capture_output=True,text=True,check=True)
assert all(sha(scratch/n)==v['after'] if v['after'] is not None else not (scratch/n).exists() for n,v in changes.items())
subprocess.run(git+['apply','--reverse','--check',str(patch)],cwd=scratch,capture_output=True,text=True,check=True)
subprocess.run(git+['apply','--reverse',str(patch)],cwd=scratch,capture_output=True,text=True,check=True)
assert all(sha(scratch/n)==v['before'] if v['before'] is not None else not (scratch/n).exists() for n,v in changes.items())
def tests(name):
    suites=ET.parse(OUT/name).getroot().findall('.//testsuite')
    return {k:sum(int(s.get(k,0)) for s in suites) for k in ('tests','failures','errors','skipped')}
units=tests('new-unit-results.xml');regression=tests('regression-results.xml')
assert units=={'tests':44,'failures':0,'errors':0,'skipped':0}
assert regression=={'tests':415,'failures':0,'errors':0,'skipped':0}
summary=json.loads((OUT/'real-replay-summary.json').read_bytes())
assert summary['actual_recalibration_events']==8 and summary['distinct_native_fits']==7
assert summary['physics_violations']==summary['backward_phases']==0
inputs=[T/'perix-native-canonical-20261026.json',T/'perix-native-canonical-net_7c4078011f7f.json']
inputs+=list((T/'perix-native-gtfs-capture-20261026').glob('feed-*.pb'))
artifacts={p.name:sha(p) for p in OUT.iterdir() if p.is_file()}
manifest={'base':'task-start dirty WIP; not HEAD and not production',
 'baseline_directory':str(BASE),'changes':changes,'source_files_changed_added_removed':28,
 'modified_files':[n for n,v in changes.items() if v['before'] and v['after']],
 'added_files':[n for n,v in changes.items() if v['before'] is None],
 'removed_files':[n for n,v in changes.items() if v['after'] is None],
 'byte_exact_forward_and_reverse_patch_verified':True,
 'protected_hashes_unchanged':{n:sha(ROOT/n) for n in protected},
 'new_units':units,'regression':regression,'evaluation_input_hashes':{str(p):sha(p) for p in inputs},
 'artifact_hashes':artifacts,'external_traffic_requests':0,'gtfs_feed_http_requests':4,
 'production_read_only_capture':True,'production_mutations':0,'deployment':False,
 'commit_push':False,'passenger_change':False,'native_runtime_flag_activated':False,
 'independent_vehicle_accuracy':None}
(OUT/'task-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
shutil.copyfile(Path(__file__),OUT/'reproduce-task-delta.py')
print(json.dumps({'files':len(changes),'removed':17,'modified':7,'added':4,
 'protected_unchanged':len(protected),'new_unit_passed':44,'regression_passed':415,
 'forward_reverse_byte_exact':True,'external_traffic_requests':0,'production_mutations':0}))
