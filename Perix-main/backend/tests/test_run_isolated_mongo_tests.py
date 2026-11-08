"""The disposable test supervisor fails before executing unverified binaries."""
import hashlib
import subprocess
import sys
from pathlib import Path


TOOL = Path(__file__).resolve().parents[1] / 'tools' / 'run_isolated_mongo_tests.py'


def test_wrong_binary_hash_never_starts_or_creates_workdir(tmp_path):
    binary = tmp_path / 'not-mongod.exe'; binary.write_bytes(b'not executable')
    workdir = tmp_path / 'new-workdir'
    run = subprocess.run([sys.executable, '-B', str(TOOL), '--mongod', str(binary),
                          '--mongod-sha256', '0' * 64, '--workdir', str(workdir)],
                         capture_output=True, text=True, timeout=30)
    assert run.returncode != 0
    assert 'hash mismatch' in run.stderr
    assert not workdir.exists()


def test_existing_workdir_and_data_are_not_touched(tmp_path):
    binary = tmp_path / 'not-mongod.exe'; binary.write_bytes(b'not executable')
    workdir = tmp_path / 'existing'; workdir.mkdir()
    sentinel = workdir / 'data'; sentinel.write_text('keep', encoding='utf-8')
    run = subprocess.run([sys.executable, '-B', str(TOOL), '--mongod', str(binary),
                          '--mongod-sha256', hashlib.sha256(binary.read_bytes()).hexdigest(),
                          '--workdir', str(workdir)], capture_output=True, text=True, timeout=30)
    assert run.returncode != 0
    assert sentinel.read_text(encoding='utf-8') == 'keep'


def test_partial_real_osm_evidence_is_rejected_without_starting_mongod(tmp_path):
    binary = tmp_path / 'not-mongod.exe'; binary.write_bytes(b'not executable')
    workdir = tmp_path / 'new-workdir'
    run = subprocess.run([sys.executable, '-B', str(TOOL), '--mongod', str(binary),
                          '--mongod-sha256', hashlib.sha256(binary.read_bytes()).hexdigest(),
                          '--workdir', str(workdir), '--osm-raw', str(tmp_path / 'only-one.json')],
                         capture_output=True, text=True, timeout=30)
    assert run.returncode != 0
    assert 'all five' in run.stderr
    assert not workdir.exists()


def test_all_patterns_require_the_complete_evidence_set(tmp_path):
    binary = tmp_path / 'not-mongod.exe'; binary.write_bytes(b'not executable')
    workdir = tmp_path / 'new-workdir'
    run = subprocess.run([sys.executable, '-B', str(TOOL), '--mongod', str(binary),
                          '--mongod-sha256', hashlib.sha256(binary.read_bytes()).hexdigest(),
                          '--workdir', str(workdir), '--all-osm-patterns'],
                         capture_output=True, text=True, timeout=30)
    assert run.returncode != 0
    assert 'requires all five' in run.stderr
    assert not workdir.exists()
