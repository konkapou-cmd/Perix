"""Read-only archive notice evidence must preserve input and fail closed."""
import hashlib
import json
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

from tools.inspect_gtfs_notices import MAX_NOTICE_BYTES, inspect_archive, notice_identity


def archive(path, entries):
    with zipfile.ZipFile(path, 'w') as z:
        for name, data in entries:
            z.writestr(name, data)


def test_original_notice_bytes_and_scope_are_preserved(tmp_path):
    path = tmp_path / 'source.zip'
    notice = b'\xef\xbb\xbfattribution_id,agency_id,organization_name\r\n1,agency,Example\r\n'
    archive(path, [('attributions.txt', notice), ('unrelated.txt', b'ignore')])
    result = inspect_archive(path)
    assert result['archive_sha256'] == hashlib.sha256(path.read_bytes()).hexdigest()
    assert result['notices']['feed_info.txt'] == {'status': 'ABSENT'}
    item = result['notices']['attributions.txt']
    assert bytes.fromhex(item['bytes_hex']) == notice
    assert item['sha256'] == hashlib.sha256(notice).hexdigest()
    assert 'license' not in result


def test_duplicate_case_variants_fail_closed(tmp_path):
    path = tmp_path / 'source.zip'
    archive(path, [('attributions.txt', b'one'), ('ATTRIBUTIONS.TXT', b'two')])
    with pytest.raises(ValueError, match='duplicate'):
        inspect_archive(path)


def test_oversized_notice_is_rejected(tmp_path):
    path = tmp_path / 'source.zip'
    archive(path, [('feed_info.txt', b'x' * (MAX_NOTICE_BYTES + 1))])
    with pytest.raises(ValueError, match='size limit'):
        inspect_archive(path)


def test_cli_never_overwrites_existing_output(tmp_path):
    path = tmp_path / 'source.zip'
    archive(path, [('feed_info.txt', b'feed_publisher_name\nExample\n')])
    output = tmp_path / 'report.json'
    output.write_text('keep', encoding='utf-8')
    tool = Path(__file__).resolve().parents[1] / 'tools' / 'inspect_gtfs_notices.py'
    run = subprocess.run([sys.executable, '-B', str(tool), '--archive', str(path), '--output', str(output)],
                         capture_output=True, text=True, timeout=30)
    assert run.returncode != 0
    assert output.read_text(encoding='utf-8') == 'keep'


def test_cli_reports_missing_metadata_without_guessing(tmp_path):
    path = tmp_path / 'source.zip'
    archive(path, [('stops.txt', b'stop_id\n1\n')])
    output = tmp_path / 'report.json'
    tool = Path(__file__).resolve().parents[1] / 'tools' / 'inspect_gtfs_notices.py'
    run = subprocess.run([sys.executable, '-B', str(tool), '--archive', str(path), '--output', str(output)],
                         capture_output=True, text=True, timeout=30)
    assert run.returncode == 0
    result = json.loads(output.read_text(encoding='utf-8'))
    assert all(row['status'] == 'ABSENT' for row in result['notices'].values())


def test_notice_identity_keeps_hashes_without_bytes(tmp_path):
    path = tmp_path / 'source.zip'
    notice = b'feed_publisher_name\nExample\n'
    archive(path, [('feed_info.txt', notice), ('stops.txt', b'stop_id\n1\n')])
    identity = notice_identity(path)
    assert identity == {'feed_info.txt': {'status': 'PRESENT', 'sha256': hashlib.sha256(notice).hexdigest()},
                        'attributions.txt': {'status': 'ABSENT'}}
    assert all('bytes_hex' not in row for row in identity.values())
    assert all('license' not in row for row in identity.values())


def test_notice_identity_never_guesses_on_unreadable_input(tmp_path):
    missing = tmp_path / 'absent.zip'
    assert notice_identity(missing) == {'feed_info.txt': {'status': 'UNKNOWN'},
                                        'attributions.txt': {'status': 'UNKNOWN'}}
    broken = tmp_path / 'broken.zip'
    broken.write_bytes(b'not a zip archive')
    assert notice_identity(broken) == {'feed_info.txt': {'status': 'UNKNOWN'},
                                       'attributions.txt': {'status': 'UNKNOWN'}}
