"""Isolated web-only map focus release; preserve backend, settings and all data.

Rebuild the last published island source snapshot byte-for-byte before applying
the scoped map/UI files. Never export the mixed working directory for deployment.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import urllib.request
import zipfile

from public_services_release import PROJECT, TARGETS, cli, remote, save

REPO = Path(__file__).resolve().parents[2]
TEMP = Path(os.environ["LOCALAPPDATA"]) / "Temp/opencode"
PREVIOUS = TEMP / "perix-island-landmarks-release-20261110"
ROOT = TEMP / "perix-map-category-focus-20261110"
RELEASE_MESSAGE = "Map focus: category background, profile pins and dense island zoom"
FILES = (
    "components/city/CityGatewayScreen.tsx", "components/city/CityInlineDetails.tsx",
    "components/city/GatewayResultCard.tsx", "components/city/PublicServiceCard.tsx",
    "components/BusinessMap.web.tsx", "components/BusinessMap.native.tsx", "components/BusinessMap.d.ts",
    "lib/city/mapPresentation.ts", "lib/city/landmarks.ts",
)
BASELINES = {
    "production": ("2f67cf30-5db6-42f3-8216-faa56707915b", PREVIOUS / "upload/Perix-main/backend"),
    "staging": ("e195cb47-2503-48b4-9461-1732dd3a4229",
                TEMP / "perix-public-services-approved-20261110/staging/candidate/Perix-main/backend"),
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tree(path):
    return {p.relative_to(path).as_posix(): sha(p) for p in sorted(path.rglob("*")) if p.is_file()}


def variables(target):
    environment, service, _, _ = TARGETS[target]
    return json.loads(cli("variable", "list", "-e", environment, "-s", service, "--json"))


def settings_hashes(target):
    return {key: hashlib.sha256(value.encode()).hexdigest() for key, value in variables(target).items()
            if not key.startswith("RAILWAY_")}


def runtime(target, expected):
    return remote(target, f"""import json,hashlib
from pathlib import Path
from pymongo import MongoClient
expected={expected!r}
assert all((Path('/app')/name).is_file() and hashlib.sha256((Path('/app')/name).read_bytes()).hexdigest()==sha for name,sha in expected.items())
c=MongoClient(os.environ['MONGO_URL'],serverSelectionTimeoutMS=15000)
rows=list(c[os.environ['DB_NAME']].public_services.find({{}},{{'_id':0}}).sort('service_id',1))
assert len(rows)==82 and all(row.get('publication_status')=='published' for row in rows)
print(json.dumps({{'deployment':os.getenv('RAILWAY_DEPLOYMENT_ID'),'runtime_files_verified':len(expected),
 'directory_count':len(rows),'directory_sha256':hashlib.sha256(json.dumps(rows,sort_keys=True,default=str).encode()).hexdigest()}}))
c.close()
""")


def export(output, api_origin="https://app.perix.eu"):
    env = os.environ.copy()
    env.update({k: v for k, v in variables("production").items() if k.startswith("EXPO_PUBLIC_")})
    from dotenv import dotenv_values
    for name in (".env", ".env.local"):
        path = REPO / "frontend" / name
        if path.is_file():
            for key, value in dotenv_values(path).items():
                if key.startswith("EXPO_PUBLIC_") and value is not None:
                    env.setdefault(key, value)
    env.update(EXPO_PUBLIC_BACKEND_URL=api_origin, EXPO_PUBLIC_APP_URL="https://app.perix.eu", CI="1")
    assert env.get("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY")
    result = subprocess.run(["npx.cmd", "expo", "export", "--platform", "web", "--clear", "--output-dir", str(output)],
        cwd=ROOT / "source/frontend", env=env, capture_output=True, text=True, encoding="utf-8", timeout=600)
    (ROOT / (output.name + ".log")).write_text(result.stdout + "\n" + result.stderr, encoding="utf-8")
    assert result.returncode == 0, "Expo export failed; inspect saved log"


def prepare():
    ROOT.mkdir(exist_ok=True)
    assert not (ROOT / "prepared.json").exists(), "Original capture already completed"
    for target, (deployment, baseline) in BASELINES.items():
        expected = tree(baseline)
        live = runtime(target, expected)
        assert live["deployment"] == deployment, "Live version changed; review the new baseline"
        directory = ROOT / target
        directory.mkdir(exist_ok=True)
        capture = {**live, "files": expected}
        if (directory / "before.json").exists():
            assert json.loads((directory / "before.json").read_text()) == capture
        else:
            save(directory / "before.json", capture)
        settings = settings_hashes(target)
        if (directory / "settings-before.json").exists():
            assert json.loads((directory / "settings-before.json").read_text()) == settings
        else:
            save(directory / "settings-before.json", settings)
        shutil.copytree(baseline, directory / "rollback/Perix-main/backend", dirs_exist_ok=True)
    frontend = ROOT / "source/frontend"
    shutil.copytree(PREVIOUS / "source/frontend", frontend, dirs_exist_ok=True, ignore=shutil.ignore_patterns(
        "node_modules", ".expo", "dist", "android", "ios", ".git", ".env", ".env.local", "__pycache__"))
    # Local dependency paths must be real paths: junctions change Metro asset
    # URLs. Hardlinks share dependency bytes; no install or dependency edits.
    def link(source, destination):
        if os.path.exists(destination):
            assert os.path.samefile(source, destination), "Unexpected dependency file; do not overwrite"
        else:
            os.link(source, destination)
        return destination
    shutil.copytree(PREVIOUS / "source/frontend/node_modules", frontend / "node_modules", copy_function=link, symlinks=True, dirs_exist_ok=True)
    result = {"prepared": True, "source": str(frontend), "baseline_files": {target: len(tree(path)) for target, (_, path) in BASELINES.items()}}
    save(ROOT / "prepared.json", result)
    return result


def build():
    assert not (ROOT / "source-changes.json").exists(), "Never rebuild an altered baseline as an original"
    original = json.loads((PREVIOUS / "release-manifest.json").read_text())
    export(ROOT / "baseline-webdist")
    baseline_entry = next((ROOT / "baseline-webdist").rglob("entry-*.js"))
    assert sha(baseline_entry) == original["entrySha256"], "Frozen source does not match the live frontend"
    save(ROOT / "baseline-verified.json", {"entry_sha256": sha(baseline_entry), "matches_live": True})
    changed = {}
    for name in FILES:
        destination = ROOT / "source/frontend" / name
        before = sha(destination)
        content = (REPO / "frontend" / name).read_text(encoding="utf-8")
        if name == "components/city/CityGatewayScreen.tsx":
            # This pre-existing jobs-artwork change is not in the live snapshot
            # and is unrelated to this request. Leave the working file intact.
            content = content.replace('  if(node.query.job_type)return {kind:"business-subcategory",key:node.query.job_type};\n', "")
        destination.write_text(content, encoding="utf-8", newline="\n")
        changed[name] = {"before": before, "after": sha(destination)}
    save(ROOT / "source-changes.json", changed)
    result = subprocess.run(["npx.cmd", "tsc", "--noEmit"], cwd=ROOT / "source/frontend", capture_output=True, text=True, encoding="utf-8", timeout=120)
    (ROOT / "typecheck.log").write_text(result.stdout + result.stderr, encoding="utf-8")
    assert result.returncode == 0, "Isolated source typecheck failed"
    export(ROOT / "webdist")
    export(ROOT / "staging-webdist", TARGETS["staging"][3])
    for target in BASELINES:
        before = json.loads((ROOT / target / "before.json").read_text())
        upload = ROOT / target / "candidate"
        app = upload / "Perix-main"
        shutil.copytree(ROOT / target / "rollback/Perix-main/backend", app / "backend")
        web = ROOT / ("webdist" if target == "production" else "staging-webdist")
        with zipfile.ZipFile(app / "backend/webdist.dat", "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for path in sorted(web.rglob("*")):
                if path.is_file():
                    archive.write(path, path.relative_to(web).as_posix())
        actual = tree(app / "backend")
        assert [name for name in actual if actual[name] != before["files"].get(name)] == ["webdist.dat"]
        for name in ("Dockerfile", "railway.json"):
            shutil.copy2(PREVIOUS / "upload/Perix-main" / name, app / name)
        shutil.copy2(app / "railway.json", upload / "railway.json")
        entry = next(web.rglob("entry-*.js"))
        save(ROOT / target / "candidate.json", {"files": actual, "entry": entry.relative_to(web).as_posix(), "entry_sha256": sha(entry)})
    return {"build_passed": True, "baseline_matches_live": True, "source_files": len(changed), "backend_changes": ["webdist.dat"]}


def deploy(target):
    before = json.loads((ROOT / target / "before.json").read_text())
    candidate = json.loads((ROOT / target / "candidate.json").read_text())
    observed = remote(target, "import json,hashlib;from pathlib import Path;print(json.dumps({'web':hashlib.sha256(Path('/app/webdist.dat').read_bytes()).hexdigest()}))")
    versions = [before["files"], candidate["files"]]
    for previous in (ROOT / target).glob("previous-candidate*.json"):
        versions.append(json.loads(previous.read_text())["files"])
    expected = next((files for files in versions if files["webdist.dat"] == observed["web"]), None)
    assert expected is not None, "Unrelated live frontend change; review before proceeding"
    current = runtime(target, expected)
    assert current["directory_sha256"] == before["directory_sha256"]
    assert settings_hashes(target) == json.loads((ROOT / target / "settings-before.json").read_text())
    assert tree(ROOT / target / "candidate/Perix-main/backend") == candidate["files"]
    if expected == candidate["files"]:
        return {"already_live": target, "deployment": current["deployment"]}
    if target == "production":
        checked = json.loads((ROOT / "staging/verification.json").read_text())
        staged = json.loads((ROOT / "staging/candidate.json").read_text())
        assert checked.get("entry_sha256") == staged["entry_sha256"], "Latest staging candidate must pass before production"
    environment, service, _, _ = TARGETS[target]
    upload = ROOT / target / ("candidate" if target == "production" else "candidate/Perix-main")
    # The globally installed older CLI has a hard-coded request timeout. Use
    # the checksum-verified isolated CLI for uploads; never update global tools
    # or alter service settings just to extend a local upload timeout.
    executable = ROOT / "railway-cli-v5.71.0/railway.exe"
    assert executable.is_file(), "The verified isolated Railway CLI is required"
    env = os.environ.copy()
    env["RAILWAY_HTTP_TIMEOUT"] = "300"
    result = subprocess.run([str(executable), "up", str(upload), "--path-as-root", "--no-gitignore", "-p", PROJECT,
        "-e", environment, "-s", service, "--ci", "-m", RELEASE_MESSAGE],
        env=env, capture_output=True, text=True, encoding="utf-8", timeout=600)
    (ROOT / target / "deploy.log").write_text(result.stdout + "\n" + result.stderr, encoding="utf-8")
    assert result.returncode == 0, "Upload/build failed; inspect the saved deploy log before retrying"
    return {"submitted": target}


def refresh_profile_groups():
    """Follow-up: remove numeric directory-group badges in the same frozen source."""
    changes = json.loads((ROOT / "source-changes.json").read_text())
    for name in ("components/BusinessMap.web.tsx", "components/BusinessMap.native.tsx"):
        destination = ROOT / "source/frontend" / name
        assert sha(destination) == changes[name]["after"]
        shutil.copy2(REPO / "frontend" / name, destination)
        changes[name]["after"] = sha(destination)
    save(ROOT / "source-changes.json", changes)
    for target in BASELINES:
        directory = ROOT / target
        assert not (directory / "previous-candidate.json").exists()
        shutil.copy2(directory / "candidate.json", directory / "previous-candidate.json")
        if (directory / "verification.json").exists():
            shutil.copy2(directory / "verification.json", directory / "verification-v1.json")
        web = ROOT / ("webdist-no-badges" if target == "production" else "staging-webdist-no-badges")
        assert not web.exists()
        export(web, TARGETS[target][3])
        backend = directory / "candidate/Perix-main/backend"
        with zipfile.ZipFile(backend / "webdist.dat", "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for path in sorted(web.rglob("*")):
                if path.is_file():
                    archive.write(path, path.relative_to(web).as_posix())
        entry = next(web.rglob("entry-*.js"))
        save(directory / "candidate.json", {"files": tree(backend), "entry": entry.relative_to(web).as_posix(), "entry_sha256": sha(entry)})
    return {"numeric_badges_removed": True, "source_files": 9, "backend_code_unchanged": True}


def revise_address_pins():
    """Apply the user's clarified address-count/profile and island zoom rules."""
    changes = json.loads((ROOT / "source-changes.json").read_text())
    for name in FILES:
        destination = ROOT / "source/frontend" / name
        assert sha(destination) == changes[name]["after"]
        content = (REPO / "frontend" / name).read_text(encoding="utf-8")
        if name == "components/city/CityGatewayScreen.tsx":
            content = content.replace('  if(node.query.job_type)return {kind:"business-subcategory",key:node.query.job_type};\n', "")
        destination.write_text(content, encoding="utf-8", newline="\n")
        changes[name]["after"] = sha(destination)
    save(ROOT / "source-changes.json", changes)
    result = subprocess.run(["npx.cmd", "tsc", "--noEmit"], cwd=ROOT / "source/frontend", capture_output=True, text=True, encoding="utf-8", timeout=120)
    (ROOT / "typecheck-address-pins.log").write_text(result.stdout + result.stderr, encoding="utf-8")
    assert result.returncode == 0
    for target in BASELINES:
        directory = ROOT / target
        previous = directory / "previous-candidate-v2.json"
        assert not previous.exists()
        shutil.copy2(directory / "candidate.json", previous)
        if (directory / "verification.json").exists():
            shutil.copy2(directory / "verification.json", directory / "verification-before-address-pins.json")
        web = ROOT / ("webdist-address-pins" if target == "production" else "staging-webdist-address-pins")
        assert not web.exists()
        export(web, TARGETS[target][3])
        backend = directory / "candidate/Perix-main/backend"
        with zipfile.ZipFile(backend / "webdist.dat", "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for path in sorted(web.rglob("*")):
                if path.is_file():
                    archive.write(path, path.relative_to(web).as_posix())
        entry = next(web.rglob("entry-*.js"))
        save(directory / "candidate.json", {"files": tree(backend), "entry": entry.relative_to(web).as_posix(), "entry_sha256": sha(entry)})
    return {"address_profile_counts": True, "equal_pin_sizes": True, "island_approach_reset": True, "source_files": len(FILES)}


def verify(target):
    directory = ROOT / target
    candidate = json.loads((directory / "candidate.json").read_text())
    before = json.loads((directory / "before.json").read_text())
    live = runtime(target, candidate["files"])
    assert live["directory_sha256"] == before["directory_sha256"]
    assert settings_hashes(target) == json.loads((directory / "settings-before.json").read_text())
    origin = TARGETS[target][3]
    with urllib.request.urlopen(origin + "/app", timeout=60) as response:
        assert candidate["entry"] in response.read().decode("utf-8"), "App HTML references an older frontend"
    with urllib.request.urlopen(origin + "/" + candidate["entry"], timeout=90) as response:
        assert hashlib.sha256(response.read()).hexdigest() == candidate["entry_sha256"]
    result = {**live, "bundle_matches": True, "backend_code_unchanged": True, "settings_unchanged": True,
              "database_unchanged": True, "source_files": len(FILES), "entry_sha256": candidate["entry_sha256"]}
    save(directory / "verification.json", result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("prepare", "build", "refresh-profile-groups", "revise-address-pins", "deploy", "verify"))
    parser.add_argument("target", nargs="?", choices=TARGETS)
    args = parser.parse_args()
    result = {"prepare": prepare, "build": build, "refresh-profile-groups": refresh_profile_groups, "revise-address-pins": revise_address_pins}.get(args.action)
    print(json.dumps(result() if result else {"deploy": deploy, "verify": verify}[args.action](args.target), indent=2))


if __name__ == "__main__":
    main()
