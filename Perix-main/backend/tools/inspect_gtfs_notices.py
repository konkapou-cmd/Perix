"""Capture exact GTFS attribution files for review, without inferring a licence.

Reads a local archive only. Never fetches, imports, publishes, activates or
contacts a database. The report can contain source-provided contact details;
its intended audience and distribution must be reviewed before sharing.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path


MAX_NOTICE_BYTES = 1024 * 1024
NAMES = ('feed_info.txt', 'attributions.txt')


def sha256_stream(stream):
    digest = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
        digest.update(chunk)
    return digest.hexdigest()


def inspect_archive(path):
    with Path(path).open('rb') as stream:
        archive_hash = sha256_stream(stream)
        stream.seek(0)
        with zipfile.ZipFile(stream) as archive:
            notices = {}
            for name in NAMES:
                # Only standard root-level names count; ambiguous duplicate
                # entries must never be silently selected.
                matches = [entry for entry in archive.infolist() if entry.filename.casefold() == name]
                if len(matches) > 1:
                    raise ValueError(f'ambiguous duplicate GTFS notice: {name}')
                if not matches:
                    notices[name] = {'status': 'ABSENT'}
                    continue
                entry = matches[0]
                if entry.file_size > MAX_NOTICE_BYTES:
                    raise ValueError(f'GTFS notice exceeds size limit: {name}')
                with archive.open(entry) as member:
                    raw = member.read(MAX_NOTICE_BYTES + 1)
                if len(raw) > MAX_NOTICE_BYTES or len(raw) != entry.file_size:
                    raise ValueError(f'invalid GTFS notice size: {name}')
                # Preserve exact bytes including BOM and line endings, encoded
                # as hex, rather than silently normalizing or rewriting URLs.
                notices[name] = {'status': 'PRESENT', 'size_bytes': len(raw),
                                 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes_hex': raw.hex()}
        stream.seek(0)
        if sha256_stream(stream) != archive_hash:
            raise ValueError('GTFS archive changed while inspecting')
    return {'schema': 'perix-gtfs-notice-evidence-v1', 'archive_sha256': archive_hash,
            'notices': notices,
            'limits': ['Archive-supplied notices are untrusted metadata, not proof of licence or legal compliance.',
                       'Presence of a source archive does not prove which archive was used by a deployed network.',
                       'No network, database, import, provider or licensing decision was made.']}


def notice_identity(path) -> dict:
    """Minimal storable notice record: per-file status plus hash when present.

    Never raises: unreadable archives are reported as UNKNOWN, never guessed.
    Hashes only, no notice bytes, so no contact details are retained here.
    """
    try:
        notices = inspect_archive(path).get('notices') or {}
    except Exception:
        return {name: {'status': 'UNKNOWN'} for name in NAMES}
    out = {}
    for name in NAMES:
        row = notices.get(name) or {}
        status = row.get('status')
        if status not in ('PRESENT', 'ABSENT'):
            out[name] = {'status': 'UNKNOWN'}
            continue
        item = {'status': status}
        if status == 'PRESENT' and re.fullmatch(r'[0-9a-f]{64}', str(row.get('sha256') or '')):
            item['sha256'] = str(row['sha256'])
        out[name] = item
    return out


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(argv)
    if args.output.exists():
        raise FileExistsError('Refusing to overwrite report')
    evidence = inspect_archive(args.archive)
    with args.output.open('x', encoding='utf-8', newline='\n') as stream:
        json.dump(evidence, stream, ensure_ascii=False, indent=2); stream.write('\n')
    print(json.dumps({'report': str(args.output), 'archive_sha256': evidence['archive_sha256'],
                      'notice_status': {name: row['status'] for name, row in evidence['notices'].items()}}))


if __name__ == '__main__':
    main()
