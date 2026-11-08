from pathlib import Path
import base64,difflib,hashlib,importlib.util,json,os,re,shutil,subprocess,sys,urllib.request,zipfile,zlib
T=Path(__file__).parent
BASE=T/'perix-small-markers-release';ROOT=T/'perix-sparse-realtime-release'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
REPO=Path(r'C:\Users\PC\Downloads\Perix1')
STAGE='https://backend-staging-staging-7ada.up.railway.app'
PROJECT='99643a3b-bf65-467a-8f2f-50640f519b2b'
SERVICE='509e0b41-9c7a-41e1-9e95-3124c958fff9'
BASELINE='92095c5c-033d-45b8-b358-3bd2fd4abcac'
BACKEND={
 'mobility/arrivals.py','mobility/eta_quality.py','mobility/realtime_freshness.py',
 'mobility/realtime_order.py','mobility/source_diagnostics.py','mobility/timing_evidence.py',
 'mobility/v2.py','mobility/motion/engine.py','mobility/motion/source_reconciliation.py',
 'routes/mobility.py','utils/mobility_workers.py','tests/test_source_reconciliation.py',
 'tests/test_sparse_realtime_ingestion.py','tests/test_sparse_realtime_timing.py',
 'tests/fixtures/am_fuchsberg_sparse_20261025.json',
}
FRONTEND={
 'app/(tabs)/locator.tsx','components/BusinessMap.d.ts','components/BusinessMap.web.tsx',
 'components/GoogleMobilityMap.tsx','components/shared/MobilityTimingEvidence.tsx',
 'hooks/useHomeTransit.ts','lib/predictionEvidence.ts','lib/vehicleBridge.ts','lib/api/mobility.ts',
 'public/google-mobility-map.html','tests/google-locator-traffic.test.cjs','tests/sparse-realtime-evidence.test.cjs',
}
SKIP={'node_modules','.expo','.metro-cache','dist','__pycache__','.pytest_cache'}
def files(root):
 result={}
 for folder,dirs,names in os.walk(root):
  dirs[:]=[d for d in dirs if d not in SKIP]
  for name in names:
   p=Path(folder)/name
   assert not p.is_symlink(),str(p)
   result[p.relative_to(root).as_posix()]=sha(p)
 return result
def save(name,value):
 (ROOT/name).write_text(json.dumps(value,indent=2),encoding='utf-8')
def preflight():
 baseline=json.loads((ROOT/'baseline-manifest.json').read_bytes())['files']
 assert files(ROOT/'rollback-context')==baseline,'Frozen baseline mismatch'
 current=files(ROOT/'context')
 allowed={'Perix-main/backend/'+n for n in BACKEND}
 assert not set(baseline)-set(current),'Missing baseline files'
 changed={n for n,h in current.items() if baseline.get(n)!=h}
 assert changed<=allowed,sorted(changed-allowed)
 oldfront=files(BASE/'frontend-source');front=files(ROOT/'frontend-source')
 assert not set(oldfront)-set(front),'Missing frontend source'
 delta={n for n,h in front.items() if oldfront.get(n)!=h}
 assert delta==FRONTEND,sorted(delta^FRONTEND)
 assert not any(Path(n).name.startswith('.env') for n in front),'Environment file in frontend source'
 result={'baseline_deployment':BASELINE,'rollback_files_verified':len(baseline),
  'backend_delta':sorted(changed),'frontend_delta':sorted(delta),'source_hashes':front,
  'backend_hashes':current,'shared_WIP_excluded':True,'production_changed':False}
 save('preflight.json',result)
 return result
def remote(code,production=False):
 spec=importlib.util.spec_from_file_location('release_tools',T/'perix-live-release-tools.py')
 helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
 packed=base64.b64encode(zlib.compress(code.encode())).decode()
 stub='import base64,zlib;exec(zlib.decompress(base64.b64decode('+repr(packed)+')))'
 return json.loads(helper.remote_python(stub,environment='production' if production else 'staging',
  service='94882f6a-8179-43bc-bdf5-73eb1de4a059' if production else SERVICE))
if sys.argv[1]=='prepare':
 assert not ROOT.exists(),'Refusing overwrite'
 manifest=json.loads((BASE/'production-manifest.json').read_bytes())
 for n,h in manifest['files'].items():
  source=BASE/'production-upload'/n;assert sha(source)==h,n
  for label in ('context','rollback-context'):
   p=ROOT/label/n;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,p)
 for folder,dirs,names in os.walk(BASE/'frontend-source'):
  dirs[:]=[d for d in dirs if d not in ('node_modules','.expo','.metro-cache','dist')]
  for name in names:
   assert not name.startswith('.env')
   source=Path(folder)/name;p=ROOT/'frontend-source'/source.relative_to(BASE/'frontend-source')
   p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,p)
 subprocess.run(['cmd','/c','mklink','/J',str(ROOT/'frontend-source/node_modules'),
  r'C:\Users\PC\Downloads\Perix1\Perix-main\frontend\node_modules'],capture_output=True,check=True)
 (ROOT/'baseline-manifest.json').write_text(json.dumps(manifest,indent=2))
 print(json.dumps({'baseline':'92095c5c-033d-45b8-b358-3bd2fd4abcac','files':len(manifest['files']),
  'isolated_backend':str(ROOT/'context/Perix-main/backend'),'shared_WIP_preserved':True},indent=2))
if sys.argv[1]=='preflight':
 p=preflight();print(json.dumps({k:v for k,v in p.items() if not k.endswith('hashes')},indent=2))
if sys.argv[1]=='build-stage':
 preflight()
 assert not (ROOT/'stage-dist').exists(),'Refusing overwrite of previous build'
 entry=list((BASE/'stage-dist').glob('_expo/static/js/web/entry-*.js'));assert len(entry)==1
 source=entry[0].read_text(encoding='utf-8');keys={}
 for field in ('EXPO_PUBLIC_GOOGLE_MAPS_JS_KEY','EXPO_PUBLIC_GOOGLE_MAPS_API_KEY'):
  values=list(dict.fromkeys(re.findall(re.escape(field)+r'\\":\\"(AIza[0-9A-Za-z_-]{35})',source)))
  assert len(values)==1,field;keys[field]=values[0]
 env={k:v for k,v in os.environ.items() if not k.startswith('EXPO_PUBLIC_')}
 env.update(keys);env.update(EXPO_PUBLIC_BACKEND_URL=STAGE,EXPO_PUBLIC_APP_URL=STAGE,
  EXPO_PUBLIC_MOBILITY_MAP_URL=STAGE+'/google-mobility-map.html',EXPO_PUBLIC_MOBILITY_MAP_ORIGINS=STAGE,
  EXPO_PUBLIC_PERIX_GOOGLE_LOCATOR_TRAFFIC='false',EXPO_NO_MINIFY='1',CI='1',EXPO_NO_DOTENV='1')
 with (ROOT/'stage-build.log').open('w',encoding='utf-8') as log:
  result=subprocess.run([str(REPO/'Perix-main/frontend/node_modules/.bin/expo.cmd'),'export','--platform','web','--clear',
   '--output-dir',str(ROOT/'stage-dist')],cwd=ROOT/'frontend-source',env=env,stdout=log,stderr=subprocess.STDOUT)
 print(json.dumps({'status':result.returncode,'origin':STAGE}));sys.exit(result.returncode)
if sys.argv[1]=='package-stage':
 p=preflight();dist=ROOT/'stage-dist';upload=ROOT/'stage-upload'
 assert not upload.exists(),'Refusing overwrite of frozen upload'
 entries=list(dist.glob('_expo/static/js/web/entry-*.js'));assert len(entries)==1
 assert STAGE in entries[0].read_text(encoding='utf-8')
 assert sha(dist/'google-mobility-map.html')==sha(ROOT/'frontend-source/public/google-mobility-map.html')
 # Package from verified baseline plus only the allowlisted candidate delta.
 for n in p['backend_hashes']:
  target=upload/n;target.parent.mkdir(parents=True,exist_ok=True)
  shutil.copyfile(ROOT/'context'/n,target)
 with zipfile.ZipFile(upload/'Perix-main/backend/webdist.dat','w',zipfile.ZIP_DEFLATED) as bundle:
  for file in sorted(dist.rglob('*')):
   if file.is_file():bundle.write(file,file.relative_to(dist).as_posix())
 packaged=files(upload);baseline=json.loads((ROOT/'baseline-manifest.json').read_bytes())['files']
 delta={n for n,h in packaged.items() if baseline.get(n)!=h}
 assert delta==set(p['backend_delta'])|{'Perix-main/backend/webdist.dat'}
 manifest={'baseline_deployment':BASELINE,'files':packaged,'changed':sorted(delta),
  'entry':entries[0].name,'entry_sha256':sha(entries[0]),'source_hashes':p['source_hashes'],
  'backend_source_hashes':p['backend_hashes'],'origin':STAGE,'production_changed':False}
 save('stage-manifest.json',manifest)
 print(json.dumps({'package_files':len(packaged),'changed':sorted(delta),'entry':manifest['entry']},indent=2))
if sys.argv[1] in ('verify-baseline','verify-stage'):
 production=sys.argv[1]=='verify-baseline';label='baseline' if production else 'stage'
 manifest=json.loads((ROOT/('baseline-manifest.json' if production else 'stage-manifest.json')).read_bytes())
 expected={n.removeprefix('Perix-main/backend/'):h for n,h in manifest['files'].items() if n.startswith('Perix-main/backend/')}
 code="""import json,hashlib,os
from pathlib import Path
names=NAMES
print(json.dumps({'hashes':{n:hashlib.sha256((Path('/app')/n).read_bytes()).hexdigest() if (Path('/app')/n).is_file() else None for n in names},'paid_routes':os.getenv('MOBILITY_GOOGLE_TRAFFIC_ENABLED','false').lower()=='true'}))
""".replace('NAMES',repr(list(expected)))
 result=remote(code,production)
 mismatches=[n for n,h in expected.items() if result['hashes'].get(n)!=h]
 report={'verified':len(expected)-len(mismatches),'mismatches':mismatches,'paid_routes':result['paid_routes']}
 save(label+'-runtime-verification.json',report);print(json.dumps(report,indent=2))
 assert not mismatches and not result['paid_routes']
if sys.argv[1]=='deploy-stage':
 manifest=json.loads((ROOT/'stage-manifest.json').read_bytes())
 assert files(ROOT/'stage-upload')==manifest['files'],'Upload changed since packaging'
 p=preflight()
 assert p['source_hashes']==manifest['source_hashes'] and p['backend_hashes']==manifest['backend_source_hashes'],'Source changed after packaging'
 mongo=json.loads((ROOT/'mongo-staging-verification.json').read_bytes())
 assert all(mongo['checks'].values())
 validation=json.loads((ROOT/'validation.json').read_bytes())
 assert validation['source_hashes']==p['source_hashes'] and validation['backend_hashes']==p['backend_hashes'],'Source changed since validation'
 assert validation['focused_lint_passed'] and validation['typescript_new_errors']==0
 command=[str(Path.home()/'AppData/Roaming/npm/railway.cmd'),'up',str(ROOT/'stage-upload/Perix-main'),
  '--path-as-root','--project',PROJECT,'--environment','staging','--service',SERVICE,'--detach']
 result=subprocess.run(command,cwd=ROOT/'stage-upload',capture_output=True,text=True,timeout=120)
 (ROOT/'stage-deploy.log').write_text(result.stdout+'\n'+result.stderr,encoding='utf-8')
 print(json.dumps({'status':result.returncode,'target':'staging','production_changed':False}));sys.exit(result.returncode)
if sys.argv[1]=='served-stage':
 manifest=json.loads((ROOT/'stage-manifest.json').read_bytes())
 def get(path):
  with urllib.request.urlopen(urllib.request.Request(STAGE+path,headers={'Cache-Control':'no-cache'}),timeout=90) as response:return response.read()
 assert manifest['entry'] in get('/locator?tab=mobility').decode()
 assert hashlib.sha256(get('/_expo/static/js/web/'+manifest['entry'])).hexdigest()==manifest['entry_sha256']
 htmlhash=hashlib.sha256(get('/google-mobility-map.html')).hexdigest()
 assert htmlhash==sha(ROOT/'frontend-source/public/google-mobility-map.html')
 report={'origin':STAGE,'entry':manifest['entry'],'entry_sha256':manifest['entry_sha256'],'map_html_sha256':htmlhash}
 save('stage-served-verification.json',report);print(json.dumps(report,indent=2))
if sys.argv[1] in ('export-evidence','export-patch'):
 preflight();target=REPO/'Perix-main/backend/releases/sparse-realtime'
 if sys.argv[1]=='export-evidence':
  assert not target.exists(),'Refusing overwrite of existing evidence'
  target.mkdir(parents=True)
 else:
  assert len(sys.argv)==3 and sha(target/'source-delta.patch')==sys.argv[2],'Exported patch changed; refusing overwrite'
 chunks=[]
 for oldroot,newroot,names,prefix in [(ROOT/'rollback-context/Perix-main/backend',ROOT/'context/Perix-main/backend',BACKEND,'Perix-main/backend/'),
  (BASE/'frontend-source',ROOT/'frontend-source',FRONTEND,'Perix-main/frontend/')]:
  for name in sorted(names):
   old=oldroot/name;new=newroot/name
   # Baseline files have mixed LF/CRLF endings. Preserve bytes exactly; text
   # newline normalization would make a patch fail against its own baseline.
   chunks.extend(difflib.diff_bytes(difflib.unified_diff,old.read_bytes().splitlines(True) if old.exists() else [],
    new.read_bytes().splitlines(True),fromfile=('a/'+prefix+name).encode() if old.exists() else b'/dev/null',
    tofile=('b/'+prefix+name).encode()))
 (target/'source-delta.patch').write_bytes(b''.join(chunks))
 if sys.argv[1]=='export-patch':
  shutil.copyfile(Path(__file__),target/'release-helper.py')
  print(json.dumps({'patch_sha256':sha(target/'source-delta.patch'),'line_endings_preserved':True}));sys.exit(0)
 for name in ('preflight.json','mongo-staging-verification.json','baseline-runtime-verification.json','stage-manifest.json',
  'stage-runtime-verification.json','stage-served-verification.json','validation.json','canonical-replay-verification.json',
  'stage-api-verification.json','stage-browser-verification.json','home-correction-verification.json','stage-deployment-result.json'):
  if (ROOT/name).exists():shutil.copyfile(ROOT/name,target/name)
 shutil.copyfile(Path(__file__),target/'release-helper.py')
 shutil.copyfile(T/'perix-sparse-mongo-check.py',target/'mongo-check.py')
 shutil.copyfile(T/'perix-sparse-validate.py',target/'validate.py')
 shutil.copyfile(T/'perix-sparse-replay.py',target/'canonical-replay.py')
 shutil.copyfile(T/'perix-sparse-stage-api.py',target/'stage-api-check.py')
 shutil.copyfile(T/'perix-sparse-home-check.cjs',target/'home-correction-check.cjs')
 if (ROOT/'release-report.md').exists():shutil.copyfile(ROOT/'release-report.md',target/'README.md')
 if (ROOT/'stage-timing-disclosure.png').exists():shutil.copyfile(ROOT/'stage-timing-disclosure.png',target/'stage-timing-disclosure.png')
 print(json.dumps({'exported':str(target),'patch_sha256':sha(target/'source-delta.patch'),'production_changed':False}))
