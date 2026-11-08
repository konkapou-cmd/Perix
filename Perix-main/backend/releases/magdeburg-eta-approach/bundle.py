"""Freeze/replay the isolated backend delta. Never reads the dirty backend tree."""
import argparse
import difflib
import hashlib
import json
from pathlib import Path
import shutil
import subprocess


RELEASE = Path(__file__).resolve().parent
ADDED = ["mobility/approach.py", "tests/test_effective_eta_consistency.py",
         "tests/test_effective_eta_physics.py", "tests/test_boarding_approach_identity.py"]
PREFIX = "Perix-main/backend/"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def safe(name):
    path = Path(name)
    if path.is_absolute() or ".." in path.parts or ":" in name or "\\" in name:
        raise ValueError("Unsafe path: " + name)
    return path


def verify(root, files):
    for name, expected in files.items():
        if sha((root / safe(name)).read_bytes()) != expected:
            raise ValueError("Hash mismatch: " + name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["freeze", "replay"])
    parser.add_argument("--baseline", required=True, type=Path, help="Verified context directory containing Perix-main")
    parser.add_argument("--baseline-manifest", type=Path)
    parser.add_argument("--candidate", type=Path)
    parser.add_argument("--destination", type=Path)
    args = parser.parse_args()
    if args.mode == "freeze":
        if args.baseline_manifest is None or args.candidate is None:
            parser.error("freeze requires --baseline-manifest and --candidate")
        baseline = json.loads(args.baseline_manifest.read_bytes())["files"]
        verify(args.baseline, baseline)
        files, chunks = [], []
        for name in sorted(set(baseline) | {PREFIX + n for n in ADDED}):
            old = (args.baseline / safe(name)).read_bytes() if name in baseline else b""
            data = (args.candidate / safe(name)).read_bytes()
            if old == data:
                continue
            if not name.startswith(PREFIX) or not name.endswith(".py"):
                raise ValueError("Unexpected change outside backend Python scope: " + name)
            chunks.extend(line if line.endswith(b"\n") else line + b"\n\\ No newline at end of file\n"
                          for line in difflib.diff_bytes(difflib.unified_diff,
                              old.splitlines(keepends=True), data.splitlines(keepends=True),
                              fromfile=("a/" + name).encode() if name in baseline else b"/dev/null",
                              tofile=("b/" + name).encode()))
            files.append({"path": name, "before_sha256": baseline.get(name), "after_sha256": sha(data)})
        patch = b"".join(chunks)
        manifest = {"baseline_deployment": "45be2af4-74eb-4c37-af0f-274c7b495be1",
                    "status": "LOCAL_CANDIDATE_NOT_DEPLOYED", "baseline_files": baseline,
                    "patch_sha256": sha(patch), "files": files}
        matcher = PREFIX + "mobility/realtime_trip_identity.py"
        verify(args.candidate, {matcher: baseline[matcher]})
        (RELEASE / "source-delta.patch").write_bytes(patch)
        (RELEASE / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        print(f"Frozen {len(files)} backend files; matcher and all other packaged files unchanged")
    else:
        if args.destination is None:
            parser.error("replay requires --destination")
        manifest = json.loads((RELEASE / "manifest.json").read_bytes())
        verify(args.baseline, manifest["baseline_files"])
        patch = RELEASE / "source-delta.patch"
        if sha(patch.read_bytes()) != manifest["patch_sha256"]:
            raise ValueError("Patch hash mismatch")
        if args.destination.exists() or not args.destination.parent.is_dir():
            raise ValueError("Destination must not exist and its parent must exist")
        for name in manifest["baseline_files"]:
            target = args.destination / safe(name)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(args.baseline / name, target)
        for flags in (["--check"], []):
            subprocess.run(["git", "-c", "core.autocrlf=false", "apply", "--whitespace=nowarn",
                            *flags, str(patch)], cwd=args.destination, check=True)
        expected = {**manifest["baseline_files"],
                    **{r["path"]: r["after_sha256"] for r in manifest["files"]}}
        verify(args.destination, expected)
        print(f"Replay verified: {len(expected)} exact files. Not a deployment artifact (old frontend archive).")


if __name__ == "__main__":
    main()
