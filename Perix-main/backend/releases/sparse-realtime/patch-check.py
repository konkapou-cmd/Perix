"""Apply exported delta only to a new, minimal frozen-baseline reconstruction."""
from pathlib import Path
import hashlib
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile

T=Path(__file__).parent
ROOT=T/'perix-sparse-realtime-release'
TARGET=Path(r'C:\Users\PC\Downloads\Perix1\Perix-main\backend\releases\sparse-realtime')
sys.argv=[sys.argv[0],'check-patch']
spec=importlib.util.spec_from_file_location('release',T/'perix-sparse-release.py')
release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)
work=Path(tempfile.mkdtemp(prefix='perix-sparse-patch-check-',dir=T))
expected={}
for oldroot,newroot,names,prefix in [
    (ROOT/'rollback-context/Perix-main/backend',ROOT/'context/Perix-main/backend',release.BACKEND,'Perix-main/backend'),
    (T/'perix-small-markers-release/frontend-source',ROOT/'frontend-source',release.FRONTEND,'Perix-main/frontend')]:
    for name in names:
        relative=Path(prefix)/name
        old=oldroot/name
        if old.exists():
            destination=work/relative;destination.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(old,destination)
        expected[relative.as_posix()]=hashlib.sha256((newroot/name).read_bytes()).hexdigest()
patch=TARGET/'source-delta.patch'
git=['git','-c','core.autocrlf=false','-c','core.safecrlf=false']
check=subprocess.run(git+['apply','--check',str(patch)],cwd=work,capture_output=True,text=True)
if check.returncode:
    raise RuntimeError(check.stderr)
subprocess.run(git+['apply',str(patch)],cwd=work,check=True,capture_output=True,text=True)
mismatches=[name for name,digest in expected.items() if hashlib.sha256((work/name).read_bytes()).hexdigest()!=digest]
assert not mismatches,mismatches
result={'patch_sha256':hashlib.sha256(patch.read_bytes()).hexdigest(),'git_apply_check_passed':True,
        'reconstructed_files_matching':len(expected),'mismatches':mismatches,
        'baseline_deployment':release.BASELINE,'shared_WIP_modified':False}
for folder in (ROOT,TARGET):
    (folder/'patch-reproduction-verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
shutil.copyfile(Path(__file__),TARGET/'patch-check.py')
print(json.dumps(result,indent=2))
