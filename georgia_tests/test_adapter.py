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
