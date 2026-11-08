"""Offline checks; no Railway or production connection."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

import pytest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import visual_production_release as ops
from package_visual_staging import snapshot


@pytest.fixture
def release(tmp_path, monkeypatch):
    root = tmp_path
    (root/'runtime/backend').mkdir(parents=True)
    (root/'runtime/backend/server.py').write_text('candidate')
    (root/'source').mkdir()
    for name in ('Dockerfile','.dockerignore','railway.json'):
        (root/'source'/name).write_text('original config')
    with zipfile.ZipFile(root/'production-code-rollback.zip','w') as archive:
        archive.writestr('backend/server.py',b'old production bytes')
    (root/'production-code-rollback-manifest.json').write_text(json.dumps(dict(deployment='old',
        archive_sha256=hashlib.sha256((root/'production-code-rollback.zip').read_bytes()).hexdigest())))
    (root/'production-rollback-settings.json').write_text(json.dumps(dict(deployment='old')))
    (root/'runtime-manifest.json').write_text(json.dumps(dict(origin=ops.ORIGIN,files=snapshot(root/'runtime'),runtime_tree_sha256='hash')))
    values = {'MONGO_URL':'private mongo unchanged','DB_NAME':'production',
              'MOBILITY_SYNC_AUTO_ACTIVATE':'true','MOBILITY_WORKERS_ENABLED':'true'}
    calls = []
    monkeypatch.setattr(ops,'target',lambda:dict(latestDeployment=dict(id='old',meta={'rootDirectory':'/Perix-main'})))
    monkeypatch.setattr(ops,'variables',lambda:dict(values))
    def cli(*args):
        calls.append(args)
        if args[:2] == ('variable','set'):
            for arg in args:
                if '=' in arg:
                    key,value = arg.split('=',1);values[key]=value
        return 'submitted'
    monkeypatch.setattr(ops,'cli',cli)
    return root,values,calls


def test_activation_captures_both_absent_values_before_only_two_flag_changes(release):
    root,values,calls = release
    assert ops.release_action('configure',root)['unrelated_settings_preserved']
    record = json.loads((root/'production-activation-before.json').read_text())
    assert record['settings'] == {k:None for k in ops.ACTIVATION}
    assert (root/'rollback-runtime/backend/server.py').read_bytes() == b'old production bytes'
    assert values['MOBILITY_SYNC_AUTO_ACTIVATE'] == 'true'
    assert len(calls)==1 and '--skip-deploys' in calls[0]
    with pytest.raises(AssertionError):ops.release_action('configure',root)


def test_rollback_disables_flags_without_deleting_or_automatically_redeploying_candidate(release):
    root,values,calls = release
    ops.release_action('configure',root)
    result = ops.release_action('rollback',root)
    assert result['original_flag_behavior_restored']
    assert all(values[k]=='false' for k in ops.ACTIVATION)
    assert all(call[:2]!=('variable','delete') for call in calls)
    assert '--skip-deploys' in calls[-2]
    assert str(root/'rollback-runtime-upload') in calls[-1]
    assert (root/'rollback-runtime-upload/Perix-main/backend/server.py').read_bytes()==b'old production bytes'


def test_upload_context_keeps_exact_runtime_under_existing_production_root(release):
    root,values,calls = release
    ops.release_action('configure',root)
    (root/'runtime/railway.json').write_text('{}')
    output = ops.upload_directory(root,root/'runtime')
    assert (output/'Perix-main/backend/server.py').read_text()=='candidate'
    assert (output/'railway.json').read_text()=='{}'
    (output/'Perix-main/backend/server.py').write_text('drift')
    with pytest.raises(AssertionError):ops.upload_directory(root,root/'runtime')


def test_forward_fix_does_not_rewrite_already_enabled_production_flags(release):
    root,values,calls=release
    values.update(ops.ACTIVATION)
    result=ops.release_action('configure',root)
    assert result['changed_flags']==[]
    assert calls==[]
    record=json.loads((root/'production-activation-before.json').read_text())
    assert record['settings']==ops.ACTIVATION


def test_deploy_refuses_unrelated_setting_or_runtime_drift(release):
    root,values,calls = release
    ops.release_action('configure',root)
    values['DB_NAME']='different'
    with pytest.raises(AssertionError):ops.release_action('deploy',root)
    values['DB_NAME']='production'
    (root/'runtime/backend/server.py').write_text('changed')
    with pytest.raises(AssertionError):ops.release_action('deploy',root)
    assert len(calls)==1
