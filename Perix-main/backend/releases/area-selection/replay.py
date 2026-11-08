"""Apply the retained public-place-search delta to a new verified isolated tree."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def safe(name):
    path = Path(name)
    if path.is_absolute() or ".." in path.parts or ":" in name or "\\" in name:
        raise ValueError("Unsafe path: " + name)
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, required=True, help="Verified context directory containing Perix-main")
    parser.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    bundle = Path(__file__).resolve().parent
    manifest = json.loads((bundle / "manifest.json").read_bytes())
    patch = bundle / "source-delta.patch"
    if sha(patch) != manifest["patch_sha256"]:
        raise ValueError("Patch hash mismatch")
    if args.destination.exists() or not args.destination.parent.is_dir():
        raise ValueError("Destination must be new and its parent must exist")
    for name, expected in manifest["baseline_files"].items():
        if sha(args.baseline / safe(name)) != expected:
            raise ValueError("Baseline mismatch: " + name)
    for name in manifest["added"]:
        if (args.baseline / safe(name)).exists():
            raise ValueError("Added path already exists: " + name)
    for name in manifest["baseline_files"]:
        target = args.destination / safe(name)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(args.baseline / name, target)
    for flags in (["--check"], []):
        subprocess.run(["git", "-c", "core.autocrlf=false", "apply", "--whitespace=nowarn",
                        *flags, str(patch)], cwd=args.destination, check=True)
    expected = {**manifest["baseline_files"], **manifest["modified"], **manifest["added"]}
    for name, digest in expected.items():
        if sha(args.destination / safe(name)) != digest:
            raise ValueError("Replay mismatch: " + name)
    print(f"Verified {len(expected)} exact files. Old frontend archive retained; do not deploy without rebuilding frontend.")


if __name__ == "__main__":
    main()
