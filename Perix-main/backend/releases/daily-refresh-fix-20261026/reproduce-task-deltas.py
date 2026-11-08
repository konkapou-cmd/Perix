"""Export checked local and production-specific deltas; never deploy/apply them."""
from pathlib import Path
import difflib,hashlib,json,shutil,subprocess,tempfile,zipfile
import xml.etree.ElementTree as ET

R=Path(r'C:\Users\PC\Downloads\Perix1');T=Path(__file__).parent
B=T/'perix-daily-fix-baseline-20261026T110107Z'
D=T/'perix-daily-fix-20261026';P=T/'perix-neighbor-timing-release/production-upload/Perix-main/backend'
C=D/'production-candidate';O=R/'Perix-main/backend/releases/daily-refresh-fix-20261026'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
baseline=json.loads((B/'manifest.json').read_bytes())
changes={n:{'before':digest,'after':sha(R/n)} for n,digest in baseline.items() if sha(R/n)!=digest}
assert set(changes)=={'Perix-main/backend/mobility/roads.py','Perix-main/backend/mobility/generations.py',
 'Perix-main/backend/mobility/osm_client.py','Perix-main/backend/utils/mobility_workers.py','.github/workflows/mobility-physics-research.yml'}
# Routes was inspected before editing but not in the automatic snapshot. Rebuild
# ONLY the preimage of the three explicitly recorded task edits, never use HEAD.
route='Perix-main/backend/routes/mobility.py';raw=(R/route).read_bytes()
def replace_one(data,old,new):
 old=old.encode();new=new.encode();assert data.count(old)==1;return data.replace(old,new,1)
raw=replace_one(raw,'async def _create_network_version(routes: List[dict], name: str, *, service_date: Optional[str] = None) -> dict:',
                   'async def _create_network_version(routes: List[dict], name: str) -> dict:')
for text in ["    if service_date is not None:\n        from datetime import date as calendar_date\n        if calendar_date.fromisoformat(service_date).isoformat() != service_date:\n            raise ValueError('Invalid explicit service_date')\n",
             "        **({'service_date': service_date} if service_date is not None else {}),\n"]:
 variants=[text.encode(),text.replace('\n','\r\n').encode()]
 matches=[v for v in variants if raw.count(v)==1];assert len(matches)==1
 raw=raw.replace(matches[0],b'',1)
target=B/route;assert not target.exists();target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
changes[route]={'before':sha(target),'after':sha(R/route),'preimage_method':'exact reverse of three recorded task edits; not an original byte snapshot and not HEAD'}
for tail in ['mobility/daily_recovery.py','tools/build_osm_source.py','tests/test_daily_network_recovery.py']:
 n='Perix-main/backend/'+tail;assert n not in baseline;changes[n]={'before':None,'after':sha(R/n)}
assert len(changes)==9

git=['git','-c','core.autocrlf=false','-c','core.safecrlf=false']
def export_patch(name,oldroot,newroot,records):
 chunks=[]
 for n,v in records.items():
  a,b=oldroot/n,newroot/n
  chunks.extend(difflib.diff_bytes(difflib.unified_diff,a.read_bytes().splitlines(True) if v['before'] else [],
      b.read_bytes().splitlines(True),fromfile=('a/'+n).encode() if v['before'] else b'/dev/null',tofile=('b/'+n).encode()))
 patch=O/name;assert not patch.exists();patch.write_bytes(b''.join(chunks))
 scratch=Path(tempfile.mkdtemp(prefix='perix-daily-fix-check-',dir=T))
 for n,v in records.items():
  if v['before']:
   q=scratch/n;q.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(oldroot/n,q)
 for args in [['apply','--check',str(patch)],['apply',str(patch)]]:
  subprocess.run(git+args,cwd=scratch,check=True,capture_output=True,text=True)
 assert all(sha(scratch/n)==v['after'] for n,v in records.items())
 for args in [['apply','--reverse','--check',str(patch)],['apply','--reverse',str(patch)]]:
  subprocess.run(git+args,cwd=scratch,check=True,capture_output=True,text=True)
 assert all(sha(scratch/n)==v['before'] if v['before'] else not (scratch/n).exists() for n,v in records.items())
 return sha(patch)
local_patch=export_patch('local-WIP-task-only.patch',B,R,changes)

prod_names=['mobility/roads.py','mobility/generations.py','mobility/osm_client.py','utils/mobility_workers.py',
 'mobility/daily_recovery.py','tools/build_osm_source.py','tests/test_daily_network_recovery.py','tests/test_mobility_civil_day.py']
review=D/'production-source-for-review';assert not review.exists();review.mkdir()
prod={}
for n in prod_names:
 old=P/n;new=C/n;data=new.read_bytes()
 if old.exists():
  a=old.read_bytes().splitlines(True);b=data.splitlines(True)
  clean=lambda seq:[s.rstrip(b'\r\n') for s in seq]
  pieces=[]
  for op,i,j,k,l in difflib.SequenceMatcher(a=clean(a),b=clean(b),autojunk=False).get_opcodes():
   if op=='equal':pieces.extend(a[i:j])
   else:
    eol=b'\r\n' if a[min(i,len(a)-1)].endswith(b'\r\n') else b'\n'
    pieces.extend(s.rstrip(b'\r\n')+eol if s.endswith(b'\n') else s for s in b[k:l])
  data=b''.join(pieces)
 q=review/n;q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(data)
 assert q.read_text(encoding='utf-8-sig')==new.read_text(encoding='utf-8-sig')
 prod[n]={'before':sha(old) if old.exists() else None,'after':sha(q),'tested_normalized_text_sha256':hashlib.sha256(new.read_text(encoding='utf-8-sig').encode()).hexdigest()}
prod_patch=export_patch('production-source-task-only.patch',P,review,prod)
with zipfile.ZipFile(O/'production-source-review-NOT-DEPLOYABLE.zip','w',zipfile.ZIP_DEFLATED) as z:
 z.writestr('NOT-DEPLOYABLE.txt','Changed source files only. Apply the checked patch to a pinned approved production source tree; staging and separate rollout approval required. No assets, secrets or map payload included.\n')
 for n in prod:z.write(review/n,n)

for name in ['geometry-source-proof.json','full-preparation-replay.json','operational-restrictions.json']:
 shutil.copyfile(D/name,O/name)
shutil.copyfile(D/'reference/download-manifest.json',O/'reference-download-manifest.json')
def counts(name):
 suites=ET.parse(O/name).getroot().findall('.//testsuite')
 return {k:sum(int(s.get(k,0)) for s in suites) for k in ('tests','failures','errors','skipped')}
tests={n:counts(n) for n in ['new-unit-results.xml','production-unit-results.xml','regression-results.xml','production-regression-results.xml']}
assert tests['new-unit-results.xml']['tests']==30 and tests['production-unit-results.xml']['tests']==30
assert tests['regression-results.xml']=={'tests':465,'failures':0,'errors':0,'skipped':0}
assert tests['production-regression-results.xml']=={'tests':296,'failures':0,'errors':0,'skipped':1}
report=json.loads((D/'full-preparation-replay.json').read_bytes())
assert report['candidate_generation_state']=='READY' and report['candidate_active'] is False
assert report['preparation_report']['ready']==report['preparation_report']['expected']==159
assert report['external_fetch_attempts']==0
protected={n:digest for n,digest in baseline.items() if n not in changes}
assert all(sha(R/n)==digest for n,digest in protected.items())
inputs=[D/'reference/sachsen-anhalt.osm.pbf',D/'reference/sachsen-anhalt.poly',D/'reference/magdeburg-source.json',D/'preparation-input.json']
manifest={'base':'task-start dirty WIP; separate reviewed d91ff576 production-specific delta',
 'local_changes':changes,'production_changes':prod,'local_patch_sha256':local_patch,'production_patch_sha256':prod_patch,
 'forward_reverse_byte_reconstruction_verified':True,'production_review_text_equals_tested_text':True,
 'protected_files_unchanged':protected,'tests':tests,'production_regression_deselected':2,
 'real_source_inputs':{str(p):sha(p) for p in inputs},
 'large_inputs_not_packaged':True,'offline_preparation_ready':159,'offline_preparation_expected':159,
 'preparation_storage':'IN_MEMORY_ONLY_NOT_REAL_MONGO','production_mutations':0,'deployment':False,
 'production_recovery_flag_activated':False,'commit_push':False,'traffic_requests':0,'new_gtfs_downloads':0,
 'geofabrik_source_http_requests':4,'real_mongo_recovery_staging_gate_outstanding':True,
 'independent_vehicle_accuracy':None}
shutil.copyfile(Path(__file__),O/'reproduce-task-deltas.py')
manifest['artifacts_sha256']={p.name:sha(p) for p in O.iterdir() if p.is_file()}
(O/'task-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps({'report':str(O),'local_files':len(changes),'production_patch_files':len(prod),
 'protected_unchanged':len(protected),'local_regression_passed':465,'production_regression_passed':295,
 'offline_ready':'159/159','production_active_changed':False,'patches_forward_reverse_verified':True}))
