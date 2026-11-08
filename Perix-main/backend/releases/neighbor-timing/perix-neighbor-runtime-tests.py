"""Run only explicit offline regressions in a separate staging Python process."""
from pathlib import Path
import importlib.util
import json
import sys

T = Path(__file__).parent
sys.argv = [sys.argv[0], 'runtime-tests']
spec = importlib.util.spec_from_file_location('release', T / 'perix-neighbor-release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
code = '''
import os,json,ast,inspect,asyncio,itertools,contextlib
from pathlib import Path
from unittest.mock import patch
os.environ['MONGO_URL']='mongodb://127.0.0.1:1'
os.environ['DB_NAME']='perix_neighbor_offline'
source=Path('/app/tests/test_neighbor_timing.py')
tree=ast.parse(source.read_text())
tree.body=[node for node in tree.body if not (isinstance(node,ast.Import) and any(a.name=='pytest' for a in node.names))]
for node in tree.body:
    if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)):
        node.decorator_list=[]
scope={'__file__':str(source),'__name__':'isolated_neighbor_regressions'}
exec(compile(tree,str(source),'exec'),scope)
class MonkeyPatch:
    def __init__(self,stack):self.stack=stack
    def setattr(self,target,name,value):self.stack.enter_context(patch.object(target,name,value))
cases=0
for name,fn in list(scope.items()):
    if not name.startswith('test_') or not inspect.isfunction(fn):continue
    params=list(inspect.signature(fn).parameters)
    values={'relationship':['NO_DATA','SKIPPED'],'mode':['tram','bus'],'target':[10,60,480,900]}
    dimensions=[values[p] for p in params if p!='monkeypatch']
    for arguments in itertools.product(*dimensions):
        with contextlib.ExitStack() as stack:
            kwargs=dict(zip([p for p in params if p!='monkeypatch'],arguments))
            if 'monkeypatch' in params:kwargs['monkeypatch']=MonkeyPatch(stack)
            result=fn(**kwargs)
            if inspect.isawaitable(result):asyncio.run(result)
        cases+=1
print(json.dumps({'status':0,'passed':cases,'python':__import__('sys').version.split()[0],
    'offline_only':True,'database_writes':False,'framework':'stdlib extraction of test_neighbor_timing.py',
    'pytest_available':False,'application_process_modified':False}))
'''
result = release.remote(code)
(T / 'perix-neighbor-timing-release/stage-offline-regressions.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result, indent=2))
assert result['status'] == 0
