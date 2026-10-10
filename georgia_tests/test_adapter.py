"""Meaningful failure-mode tests independent of the production source tree."""
import json
from pathlib import Path
import subprocess
import sys
import pytest
from georgia import run


def test_missing_source_is_infrastructure_error():
    p = subprocess.run([sys.executable, '-m', 'georgia.run', '--source-root', '/nonexistent/georgia-eval-candidate'],capture_output=True,text=True)
    assert p.returncode == 2
    assert 'CONFIG/INFRA ERROR' in p.stderr


def test_mutated_baseline_cannot_be_recorded():
    p = subprocess.run([sys.executable, '-m', 'georgia.run', '--record-baseline', '--mutation', 'disable_plus25'],capture_output=True,text=True)
    assert p.returncode == 2
    assert 'cannot record a mutated baseline' in p.stderr


def test_unknown_source_capability_is_rejected_before_execution(tmp_path):
    source = tmp_path/'source'; source.mkdir()
    (source/'georgia-sales-pricing.js').write_text("require('node:https'); throw new Error('must not execute');")
    with pytest.raises(ValueError,match='unsupported capability node:https'):
        run.isolated_source(source,tmp_path/'snapshot')


def test_symlink_escape_is_rejected(tmp_path):
    source=tmp_path/'source'; source.mkdir()
    outside=tmp_path/'outside.js'; outside.write_text('secret-like data must not be copied')
    (source/'georgia-sales-pricing.js').symlink_to(outside)
    with pytest.raises(ValueError,match='escapes root'):
        run.isolated_source(source,tmp_path/'snapshot')


def test_offline_evaluator_rejects_network():
    with pytest.raises(RuntimeError,match='NETWORK_DISABLED'):
        run.deny_network()


def test_sql_symlink_escape_is_rejected(tmp_path,monkeypatch):
    source=tmp_path/'source'; source.mkdir()
    # The selected JS closure is already safe; test the independent SQL path.
    monkeypatch.setattr(run,'ENTRIES',[])
    monkeypatch.setattr(run,'INTEGRATION_ENTRIES',[])
    (source/'instagram-v2').mkdir()
    outside=tmp_path/'outside.sql'; outside.write_text('must not read')
    (source/'instagram-v2/state-schema.sql').symlink_to(outside)
    with pytest.raises(ValueError,match='SQL asset escapes source root'):
        run.isolated_source(source,tmp_path/'snapshot')


def test_unknown_integration_capability_still_rejected(tmp_path,monkeypatch):
    source=tmp_path/'source';source.mkdir()
    (source/'integration.js').write_text("require('inspector');")
    monkeypatch.setattr(run,'ENTRIES',[])
    monkeypatch.setattr(run,'INTEGRATION_ENTRIES',['integration.js'])
    with pytest.raises(ValueError,match='unsupported capability inspector'):
        run.isolated_source(source,tmp_path/'snapshot')



def integration_bootstrap(tmp_path, body):
    source=tmp_path/'source';work=tmp_path/'work'
    (source/'instagram-v2/runtime').mkdir(parents=True);work.mkdir()
    (source/'instagram-v2/runtime/direct-runtime.js').write_text(body)
    cases=work/'cases.json';cases.write_text('[]')
    return subprocess.run(['/usr/bin/node',str(run.ROOT/'georgia/integration.cjs'),str(source),str(work),str(run.ROOT),str(cases)],capture_output=True,text=True)


def test_supported_https_import_cannot_make_a_network_call(tmp_path):
    assert 'node:https' in run.INTEGRATION_CAPABILITIES
    result=integration_bootstrap(tmp_path, "require('node:https').request('https://example.invalid');")
    assert result.returncode != 0
    assert 'EXTERNAL_CALL_BLOCKED:https' in result.stderr


def test_os_facade_exposes_only_disposable_work_root(tmp_path):
    expected=str(tmp_path/'work')
    body="const os=require('node:os');if(os.tmpdir()!=="+json.dumps(expected)+")throw new Error('WRONG_TMP_ROOT');if(os.networkInterfaces!==undefined)throw new Error('OS_HOST_CAPABILITY_LEAK');throw new Error('SCOPED_TMPDIR_CONTROL');"
    result=integration_bootstrap(tmp_path,body)
    assert result.returncode != 0
    assert 'SCOPED_TMPDIR_CONTROL' in result.stderr
    assert '\nError: WRONG_TMP_ROOT\n' not in result.stderr
    assert '\nError: OS_HOST_CAPABILITY_LEAK\n' not in result.stderr
