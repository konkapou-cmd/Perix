"""Isolated web release for persistent 10km scenes and supplied civic/job icons.

No database, backend, service-variable or mobile changes. Rebuild the published
source before applying the named files/assets; never export the mixed workspace.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import zipfile

import map_focus_release as release

BASE = release.ROOT
ROOT = release.TEMP / "perix-scene-loading-icons-20261110"
REPO = release.REPO
FILES = (
    "components/city/CityGatewayScreen.tsx", "components/BusinessMap.web.tsx", "components/BusinessMap.native.tsx",
    "components/BusinessMap.d.ts", "components/icons/IllustratedIcon.tsx", "hooks/city/useCityDiscovery.ts",
    "lib/city/mapPresentation.ts", "lib/city/sceneScope.ts", "lib/civicIllustrations.ts",
)
ASSETS = [str(p.relative_to(REPO / "frontend")).replace("\\", "/") for p in
          (REPO / "frontend/assets/illustrations/civic-jobs-v1").rglob("*") if p.is_file()]
ASSETS += [f"assets/illustrations/categories/sub/{key}.webp" for key in ("apartment", "house", "studio", "room", "commercial")]
ASSETS += [f"assets/illustrations/categories/home/{key}.webp" for key in ("hotels", "homes-nearby", "rentals", "mobility")]
DEPLOYMENTS = {"production": "546e8148-3af8-4818-a197-a4fb542c9560", "staging": "447bf547-d74f-4e99-a5ec-4bbb50a0ef9d"}
release.ROOT = ROOT
release.FILES = FILES
release.RELEASE_MESSAGE = "Persistent scene: map/stops/fleet priority and supplied civic/job icons"


def prepare():
    ROOT.mkdir(exist_ok=True)
    assert not (ROOT / "prepared.json").exists()
    for target, deployment in DEPLOYMENTS.items():
        directory = ROOT / target
        directory.mkdir(exist_ok=True)
        baseline = BASE / target / "candidate/Perix-main/backend"
        expected = release.tree(baseline)
        live = release.runtime(target, expected)
        assert live["deployment"] == deployment, "Published runtime changed; do not overwrite a newer release"
        capture = {**live, "files": expected}
        before = directory / "before.json"
        if before.exists():
            assert json.loads(before.read_text()) == capture
        else:
            release.save(before, capture)
        settings = release.settings_hashes(target)
        if (directory / "settings-before.json").exists():
            assert json.loads((directory / "settings-before.json").read_text()) == settings
        else:
            release.save(directory / "settings-before.json", settings)
        shutil.copytree(baseline, directory / "rollback/Perix-main/backend", dirs_exist_ok=True)
    frontend = ROOT / "source/frontend"
    shutil.copytree(BASE / "source/frontend", frontend, dirs_exist_ok=True, ignore=shutil.ignore_patterns(
        "node_modules", ".expo", ".metro-cache", "dist", "android", "ios", ".git", ".env", ".env.local", "__pycache__"))

    def link(source, destination):
        if os.path.exists(destination):
            assert os.path.samefile(source, destination)
        else:
            os.link(source, destination)
        return destination

    shutil.copytree(BASE / "source/frontend/node_modules", frontend / "node_modules", dirs_exist_ok=True,
                    copy_function=link, symlinks=True)
    archive = BASE / "railway-cli-v5.71.0/download.zip"
    if not archive.exists():
        archive = release.TEMP / "perix-map-category-focus-20261110/railway-cli-v5.71.0/download.zip"
    assert release.sha(archive) == "1460c5d4616794558e21bdb1bf94ff2dc2fb9a48df647857642bbe1e714f81b6"
    cli_dir = ROOT / "railway-cli-v5.71.0"
    cli_dir.mkdir(exist_ok=True)
    with zipfile.ZipFile(archive) as package:
        name = next(name for name in package.namelist() if name.endswith("railway.exe"))
        (cli_dir / "railway.exe").write_bytes(package.read(name))
    result = {"prepared": True, "source_files": len(FILES), "asset_files": len(ASSETS)}
    release.save(ROOT / "prepared.json", result)
    return result


def build():
    assert not (ROOT / "source-changes.json").exists()
    expected = json.loads((BASE / "production/candidate.json").read_text())
    release.export(ROOT / "baseline-webdist")
    entry = next((ROOT / "baseline-webdist").rglob("entry-*.js"))
    assert release.sha(entry) == expected["entry_sha256"], "Frozen source does not reproduce the published frontend"
    release.save(ROOT / "baseline-verified.json", {"matches_live": True, "entry_sha256": release.sha(entry)})
    changes = {}
    for name in (*FILES, *ASSETS):
        destination = ROOT / "source/frontend" / name
        before = release.sha(destination) if destination.exists() else None
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(REPO / "frontend" / name, destination)
        changes[name] = {"before": before, "after": release.sha(destination)}
    release.save(ROOT / "source-changes.json", changes)
    result = subprocess.run(["npx.cmd", "tsc", "--noEmit"], cwd=ROOT / "source/frontend",
                            capture_output=True, text=True, encoding="utf-8", timeout=120)
    (ROOT / "typecheck.log").write_text(result.stdout + result.stderr, encoding="utf-8")
    assert result.returncode == 0, "Frozen candidate typecheck failed"
    for target in DEPLOYMENTS:
        directory = ROOT / target
        web = ROOT / ("webdist" if target == "production" else "staging-webdist")
        release.export(web, release.TARGETS[target][3])
        app = directory / "candidate/Perix-main"
        shutil.copytree(directory / "rollback/Perix-main/backend", app / "backend")
        with zipfile.ZipFile(app / "backend/webdist.dat", "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for path in sorted(web.rglob("*")):
                if path.is_file():
                    archive.write(path, path.relative_to(web).as_posix())
        before = json.loads((directory / "before.json").read_text())
        actual = release.tree(app / "backend")
        assert [name for name in actual if actual[name] != before["files"].get(name)] == ["webdist.dat"]
        for name in ("Dockerfile", "railway.json"):
            shutil.copy2(BASE / target / "candidate/Perix-main" / name, app / name)
        shutil.copy2(app / "railway.json", directory / "candidate/railway.json")
        entry = next(web.rglob("entry-*.js"))
        release.save(directory / "candidate.json", {"files": actual, "entry": entry.relative_to(web).as_posix(), "entry_sha256": release.sha(entry)})
    return {"built": True, "baseline_matches_live": True, "source_files": len(FILES), "asset_files": len(ASSETS), "backend_changes": ["webdist.dat"]}


def audit():
    def files(root):
        result = {}
        for directory, dirs, names in os.walk(root):
            dirs[:] = [name for name in dirs if name not in ("node_modules", ".expo", ".metro-cache", ".git", "dist", "android", "ios", "__pycache__")]
            for name in names:
                if name in (".env", ".env.local") or name.endswith(".tsbuildinfo"):
                    continue
                path = Path(directory) / name
                result[path.relative_to(root).as_posix()] = release.sha(path)
        return result
    before, after = files(BASE / "source/frontend"), files(ROOT / "source/frontend")
    changed = sorted(name for name in before.keys() | after.keys() if before.get(name) != after.get(name))
    assert set(changed) <= set(FILES) | set(ASSETS), "Unrelated source or assets changed"
    result = {"changed_files": changed, "unrelated_source_and_assets_preserved": True}
    release.save(ROOT / "source-audit.json", result)
    return {"audit_passed": True, "changed_files": len(changed)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("prepare", "build", "audit", "deploy", "verify"))
    parser.add_argument("target", nargs="?", choices=DEPLOYMENTS)
    args = parser.parse_args()
    action = {"prepare": prepare, "build": build, "audit": audit}.get(args.action)
    result = action() if action else {"deploy": release.deploy, "verify": release.verify}[args.action](args.target)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
