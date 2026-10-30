"""Replay the retained delta into a new isolated directory, without network access."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', required=True, type=Path)
    parser.add_argument('--destination', required=True, type=Path)
    args = parser.parse_args()
    release = Path(__file__).resolve().parent
    manifest = json.loads((release / 'manifest.json').read_bytes())
    patch = release / 'source-delta.patch'

    def require(condition, message):
        if not condition:
            raise ValueError(message)

    def sha(data):
        return hashlib.sha256(data).hexdigest()

    require(sha(args.baseline.read_bytes()) == manifest['baseline']['archive_sha256'],
            'Baseline archive hash mismatch')
    require(sha(patch.read_bytes()) == manifest['patch']['sha256'], 'Patch hash mismatch')
    destination = args.destination.resolve()
    require(destination.parent.is_dir(), 'Destination parent must already exist')
    require(not destination.exists(), 'Refusing to overwrite an existing destination')
    with zipfile.ZipFile(args.baseline) as archive:
        for entry in archive.infolist():
            path = Path(entry.filename)
            require(not path.is_absolute() and '..' not in path.parts
                    and ':' not in entry.filename and '\\' not in entry.filename,
                    'Unsafe archive path')
        for record in manifest['files']:
            name = record['path']
            if record['before_sha256'] is None:
                require(name not in archive.namelist(), 'New path already exists: ' + name)
            else:
                require(sha(archive.read(name)) == record['before_sha256'],
                        'Before hash mismatch: ' + name)
        matcher = manifest['unchanged_matcher']
        require(sha(archive.read(matcher['path'])) == matcher['sha256'], 'Matcher mismatch')
        destination.mkdir()
        archive.extractall(destination)
    for options in (['--check'], []):
        subprocess.run(['git', '-c', 'core.autocrlf=false', 'apply', '--whitespace=nowarn',
                        *options, str(patch)], cwd=destination, check=True)
    for record in manifest['files']:
        require(sha((destination / record['path']).read_bytes()) == record['after_sha256'],
                'After hash mismatch: ' + record['path'])
    require(sha((destination / matcher['path']).read_bytes()) == matcher['sha256'],
            'Matcher changed after replay')
    for name, expected in manifest['reconstructed_file_hashes'].items():
        require(sha((destination / name).read_bytes()) == expected,
                'Reconstructed deployment hash mismatch: ' + name)
    print(f"Verified isolated replay: {len(manifest['files'])} exact files; matcher unchanged")


if __name__ == '__main__':
    main()
