"""Scoped, identity-guarded public directory release; never replace unrelated code/data.

Capture the current runtime before deploying. Only three public-services modules
and their taxonomy change; the live web archive and all other code are preserved.
Import is insert-only, hidden until the entire approved batch has been validated.
Credentials stay in Railway. Withdrawal hides only this release's tagged records.
"""
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
from collections import Counter
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile
import zlib

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from public_services.approved_import import approved_records

PROJECT = "99643a3b-bf65-467a-8f2f-50640f519b2b"
TARGETS = {
    "staging": ("8dea60e3-332a-4fec-9394-7c682eb69b9a", "509e0b41-9c7a-41e1-9e95-3124c958fff9", "perix_visual_stage_20261103_v1", "https://backend-staging-staging-7ada.up.railway.app"),
    "production": ("a2b06de5-a5a6-4365-ae67-9ee519a3f7b6", "94882f6a-8179-43bc-bdf5-73eb1de4a059", "Perix", "https://app.perix.eu"),
}
PATCHES = ("public_services/models.py", "public_services/repository.py", "public_services/taxonomy.json", "routes/public_services.py")
BATCH = "magdeburg-approved-20261110-v1"


def cli(*args, timeout=180):
    # Calling the Windows .cmd shim would impose cmd.exe's 8191-character limit.
    executable = Path(os.environ.get("APPDATA", "")) / "npm/node_modules/@railway/cli/bin/railway.exe"
    command = str(executable) if executable.is_file() else shutil.which("railway")
    result = subprocess.run([command, *args], capture_output=True, text=True, encoding="utf-8", timeout=timeout)
    if result.returncode:
        # Do not echo environment variables, credentials, or a full remote command.
        diagnostic = result.stderr[-1000:] or result.stdout[-2000:]
        raise RuntimeError(f"Railway command failed ({result.returncode}): {diagnostic}")
    return result.stdout.strip()


def remote(target, code):
    environment, service, database, _ = TARGETS[target]
    guard = f"""import os
assert os.getenv('RAILWAY_PROJECT_ID') == {PROJECT!r}
assert os.getenv('RAILWAY_ENVIRONMENT_ID') == {environment!r}
assert os.getenv('RAILWAY_SERVICE_ID') == {service!r}
assert os.getenv('DB_NAME') == {database!r}
"""
    payload = base64.b64encode(zlib.compress((guard + code).encode())).decode()
    command = 'python -c "import base64,zlib;exec(zlib.decompress(base64.b64decode(\'' + payload + '\')))"'
    if len(command) > 28000:
        raise ValueError("Remote payload exceeds safe Windows command length")
    return json.loads(cli("ssh", "-p", PROJECT, "-e", environment, "-s", service, "--", command))


def digest(data):
    return hashlib.sha256(data).hexdigest()


def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_records():
    source = BACKEND / "public_services/staging/perix_90_candidates.json"
    records, excluded = approved_records(json.loads(source.read_text(encoding="utf-8")),
        assets_root=BACKEND.parent / "frontend/assets/public-services")
    assert len(records) == 82 and len(excluded) == 8
    return records, excluded, digest(source.read_bytes())


def capture(target, root):
    destination = root / target
    destination.mkdir(parents=True, exist_ok=True)
    assert not (destination / "before.json").exists(), "Never overwrite an existing rollback capture"
    result = remote(target, """import json,io,zipfile,base64,hashlib
from pathlib import Path
from pymongo import MongoClient
c=MongoClient(os.environ['MONGO_URL'],serverSelectionTimeoutMS=15000)
d=c[os.environ['DB_NAME']]
assert d.public_services.count_documents({}) == 0, 'Directory changed; review before importing'
files=[]
for p in Path('/app').rglob('*'):
 if not p.is_file(): continue
 rel=p.relative_to('/app')
 if any(part in ('__pycache__','webdist','tests','staging','releases') for part in rel.parts): continue
 if p.suffix in ('.py','.json','.ttf','.woff','.woff2') or str(rel) in ('requirements.txt','webdist.dat','.python-version'):
  files.append(p)
buf=io.BytesIO()
with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(files):
  if p.name!='webdist.dat': z.writestr('backend/'+p.relative_to('/app').as_posix(),p.read_bytes())
print(json.dumps({'deployment':os.getenv('RAILWAY_DEPLOYMENT_ID'),'database':d.name,'count_before':0,
 'archive_sha256':hashlib.sha256(buf.getvalue()).hexdigest(),'archive':base64.b64encode(buf.getvalue()).decode(),
 'web_archive_size':Path('/app/webdist.dat').stat().st_size,
 'files':{str(p.relative_to('/app')):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}}))
c.close()
""")
    archive = base64.b64decode(result.pop("archive"))
    assert digest(archive) == result["archive_sha256"]
    # Bounded reads avoid Railway SSH's websocket message-size limit.
    def web_chunk(offset):
        part = remote(target, f"""import json,base64
assert os.getenv('RAILWAY_DEPLOYMENT_ID')=={result['deployment']!r}
with open('/app/webdist.dat','rb') as f:
 f.seek({offset}); chunk=f.read(524288)
print(json.dumps({{'data':base64.b64encode(chunk).decode()}}))
""")
        return base64.b64decode(part["data"])
    with ThreadPoolExecutor(max_workers=3) as pool:
        web_archive = b"".join(pool.map(web_chunk, range(0, result["web_archive_size"], 524288)))
    assert len(web_archive) == result["web_archive_size"]
    assert digest(web_archive) == result["files"]["webdist.dat"]
    buffer = io.BytesIO(archive)
    with zipfile.ZipFile(buffer, "a", zipfile.ZIP_DEFLATED) as bundle:
        bundle.writestr("backend/webdist.dat", web_archive)
    archive = buffer.getvalue()
    result["archive_sha256"] = digest(archive)
    (destination / "rollback.zip").write_bytes(archive)
    save(destination / "before.json", result)
    runtime = destination / "candidate/Perix-main"
    runtime.mkdir(parents=True)
    with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
        for name in bundle.namelist():
            assert name.startswith("backend/") and ".." not in Path(name).parts
            path = runtime / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(bundle.read(name))
    changed = []
    for name in PATCHES:
        content = (BACKEND / name).read_bytes()
        path = runtime / "backend" / name
        if digest(content) != result["files"].get(name):
            changed.append(name)
        path.write_bytes(content)
    # Keep the exact live web bundle; do not build/deploy unrelated local UI work.
    assert digest((runtime / "backend/webdist.dat").read_bytes()) == result["files"]["webdist.dat"]
    (runtime / "Dockerfile").write_bytes((BACKEND.parent / "Dockerfile").read_bytes())
    config = {"build": {"builder": "DOCKERFILE", "dockerfilePath": "Dockerfile"},
        "deploy": {"healthcheckPath": "/api/mobility/v2/networks", "healthcheckTimeout": 300,
                   "restartPolicyMaxRetries": 10, "restartPolicyType": "ON_FAILURE"}}
    save(runtime / "railway.json", config)
    save(destination / "candidate/railway.json", config)
    save(destination / "candidate.json", {"changed_files": changed, "web_archive_preserved": True,
        "patch_hashes": {name: digest((BACKEND / name).read_bytes()) for name in PATCHES}})
    return {"captured": target, "deployment": result["deployment"], "changed_files": changed}


def deploy(target, root):
    directory = root / target
    before = json.loads((directory / "before.json").read_text())
    candidate = json.loads((directory / "candidate.json").read_text())
    runtime = directory / "candidate/Perix-main/backend"
    for name, old_hash in before["files"].items():
        assert digest((runtime / name).read_bytes()) == candidate["patch_hashes"].get(name, old_hash)
    current = remote(target, f"""import json,hashlib
from pathlib import Path
names={list(before['files'])!r}
print(json.dumps({{'deployment':os.getenv('RAILWAY_DEPLOYMENT_ID'),
 'files':{{name:hashlib.sha256((Path('/app')/name).read_bytes()).hexdigest() for name in names}}}}))
""")
    for name, old_hash in before["files"].items():
        allowed = {old_hash}
        if name in PATCHES:
            allowed.add(candidate["patch_hashes"][name])
            allowed.update(version[name] for version in candidate.get("previous_patch_hashes", []))
        assert current["files"][name] in allowed, f"Unrelated live change: {name}; review required"
    if target == "production":
        report = json.loads((root / "staging/verification.json").read_text(encoding="utf-8"))
        assert report["total"] == 82 and report["excluded_not_public"] == 8
        assert report["patch_hashes"] == candidate["patch_hashes"]
    environment, service, _, _ = TARGETS[target]
    upload = directory / "candidate" if target == "production" else directory / "candidate/Perix-main"
    output = cli("up", str(upload), "--path-as-root", "--no-gitignore", "-p", PROJECT,
        "-e", environment, "-s", service, "--ci", "-m", "Public services: canonical categories and approved Magdeburg directory", timeout=600)
    (directory / "deploy.log").write_text(output, encoding="utf-8")
    return {"build_completed": target, "logs": str(directory / "deploy.log")}


def refresh(target, root):
    directory = root / target
    path = directory / "candidate.json"
    candidate = json.loads(path.read_text())
    candidate.setdefault("previous_patch_hashes", []).append(candidate["patch_hashes"])
    for name in PATCHES:
        content = (BACKEND / name).read_bytes()
        (directory / "candidate/Perix-main/backend" / name).write_bytes(content)
    candidate["patch_hashes"] = {name: digest((BACKEND / name).read_bytes()) for name in PATCHES}
    save(path, candidate)
    return {"refreshed": target, "patches": list(PATCHES)}


def import_records(target, root):
    directory = root / target
    assert (directory / "before.json").exists()
    records, excluded, source_hash = load_records()
    candidate = json.loads((directory / "candidate.json").read_text())
    if target == "production":
        stage = json.loads((root / "staging/verification.json").read_text(encoding="utf-8"))
        assets = json.loads((directory / "asset-verification.json").read_text())
        assert stage["total"] == 82 and stage["excluded_not_public"] == 8
        assert stage["source_sha256"] == source_hash and stage["patch_hashes"] == candidate["patch_hashes"]
        assert assets["images_verified"] == 164
    started_path = directory / "import-started.json"
    started = json.loads(started_path.read_text()) if started_path.exists() else None
    if started:
        assert started["batch"] == BATCH and started["source_sha256"] == source_hash
        assert started["service_ids"] == [row["service_id"] for row in records]
    now = started.get("imported_at") if started else None
    now = now or datetime.now(timezone.utc).isoformat()
    prepared = remote(target, f"""import json,hashlib
from pathlib import Path
from pymongo import MongoClient
expected={candidate['patch_hashes']!r}
assert all(hashlib.sha256((Path('/app')/name).read_bytes()).hexdigest()==sha for name,sha in expected.items())
c=MongoClient(os.environ['MONGO_URL'],serverSelectionTimeoutMS=15000)
d=c[os.environ['DB_NAME']]
assert d.public_services.count_documents({{'import_batch':{{'$ne':{BATCH!r}}}}})==0, 'Existing unrelated directory entries; stop'
assert d.public_services.count_documents({{'publication_status':{{'$ne':'hidden'}}}})==0, 'Batch already published; verify instead'
d.public_services.create_index('service_id',unique=True,name='public_service_identity')
print(json.dumps({{'deployment':os.getenv('RAILWAY_DEPLOYMENT_ID'),'hidden_resume_count':d.public_services.count_documents({{}})}}))
c.close()
""")
    save(started_path, {**prepared, "batch": BATCH, "source_sha256": source_hash, "imported_at": now,
        "service_ids": [row["service_id"] for row in records], "excluded_ids": excluded})
    for start in range(0, len(records), 4):
        rows = []
        for record in records[start:start + 4]:
            row = {**record, "publication_status": "hidden", "imported_at": now, "import_batch": BATCH}
            rows.append(row)
        # JSON content is compressed by remote(); small batches stay under argv limits.
        result = remote(target, f"""import json
from pymongo import MongoClient
from public_services.models import PublicService
rows=json.loads({json.dumps(rows, ensure_ascii=True)!r})
for row in rows: PublicService.model_validate(row)
c=MongoClient(os.environ['MONGO_URL'],serverSelectionTimeoutMS=15000)
d=c[os.environ['DB_NAME']]
assert d.public_services.count_documents({{'import_batch':{{'$ne':{BATCH!r}}}}})==0
inserted=0
for row in rows:
 existing=d.public_services.find_one({{'service_id':row['service_id']}},{{'_id':0}})
 if existing is None:
  d.public_services.insert_one(dict(row)); inserted+=1
 else:
  assert existing==row, 'Existing tagged record differs; never overwrite'
print(json.dumps({{'validated':len(rows),'inserted':inserted}}))
c.close()
""")
        assert result["validated"] == len(rows)
    ids = [row["service_id"] for row in records]
    result = remote(target, f"""import json
from pymongo import MongoClient
c=MongoClient(os.environ['MONGO_URL'],serverSelectionTimeoutMS=15000)
d=c[os.environ['DB_NAME']]
scope={{'import_batch':{BATCH!r},'service_id':{{'$in':{ids!r}}}}}
assert d.public_services.count_documents({{}})==82
assert d.public_services.count_documents({{**scope,'publication_status':'hidden','verification_status':'source_verified',
 'publication_rights_status':'approved','bio_status':'approved','coordinate_review_status':'approved'}})==82
r=d.public_services.update_many(scope,{{'$set':{{'publication_status':'published'}}}})
assert r.modified_count==82
print(json.dumps({{'published':r.modified_count,'batch':{BATCH!r}}}))
c.close()
""")
    save(directory / "import-completed.json", result)
    return result


def get_json(url):
    with urllib.request.urlopen(url, timeout=45) as response:
        return json.load(response)


def verify_assets(target, root):
    # Production already contains the reviewed public-service frontend and images.
    origin = TARGETS[target][3]
    records, _, _ = load_records()
    archive = root / target / "candidate/Perix-main/backend/webdist.dat"
    with zipfile.ZipFile(archive) as bundle:
        hashes = {digest(bundle.read(name)): name for name in bundle.namelist() if not name.endswith("/")}
    assets = []
    for row in records:
        for field in ("profile_image_asset", "cover_image_asset"):
            sha = digest((BACKEND.parent / "frontend/assets/public-services" / row[field]).read_bytes())
            assert sha in hashes, f"Image missing from deployed bundle: {row[field]}"
            assets.append((hashes[sha], sha))

    def check(asset):
        name, sha = asset
        with urllib.request.urlopen(origin + "/" + urllib.parse.quote(name, safe="/"), timeout=45) as response:
            assert digest(response.read()) == sha, name
        return name

    with ThreadPoolExecutor(max_workers=4) as pool:
        verified = list(pool.map(check, assets))
    report = {"target": target, "images_verified": len(verified), "assets": verified}
    save(root / target / "asset-verification.json", report)
    return {"target": target, "images_verified": len(verified)}


def withdraw(target, root):
    started = json.loads((root / target / "import-started.json").read_text())
    assert started["batch"] == BATCH and len(started["service_ids"]) == 82
    result = remote(target, f"""import json
from pymongo import MongoClient
c=MongoClient(os.environ['MONGO_URL'],serverSelectionTimeoutMS=15000)
d=c[os.environ['DB_NAME']]
scope={{'import_batch':{BATCH!r},'service_id':{{'$in':{started['service_ids']!r}}}}}
assert d.public_services.count_documents({{'import_batch':{BATCH!r}}})==d.public_services.count_documents(scope)
r=d.public_services.update_many(scope,{{'$set':{{'publication_status':'hidden'}}}})
print(json.dumps({{'withdrawn':r.modified_count,'batch':{BATCH!r},'deleted':0}}))
c.close()
""")
    save(root / target / "withdrawal.json", result)
    return result


def verify(target, root):
    origin = TARGETS[target][3]
    records, excluded, source_hash = load_records()
    before = json.loads((root / target / "before.json").read_text())
    patches = json.loads((root / target / "candidate.json").read_text())["patch_hashes"]
    expected = {**before["files"], **patches}
    runtime = remote(target, f"""import json,hashlib
from pathlib import Path
from pymongo import MongoClient
expected={expected!r}
assert all(hashlib.sha256((Path('/app')/name).read_bytes()).hexdigest()==sha for name,sha in expected.items())
c=MongoClient(os.environ['MONGO_URL'],serverSelectionTimeoutMS=15000)
d=c[os.environ['DB_NAME']]
assert d.public_services.count_documents({{}})==82
assert d.public_services.count_documents({{'import_batch':{BATCH!r},'publication_status':'published'}})==82
assert d.public_services.count_documents({{'service_id':{{'$in':{excluded!r}}}}})==0
print(json.dumps({{'deployment':os.getenv('RAILWAY_DEPLOYMENT_ID'),'runtime_files_verified':len(expected),
 'web_archive_preserved':True,'directory_count':82}}))
c.close()
""")
    taxonomy = json.loads((BACKEND / "public_services/taxonomy.json").read_text(encoding="utf-8"))
    assert get_json(origin + "/api/public-services/taxonomy") == taxonomy
    base = origin + "/api/public-services?country_code=DE&city_id=de-magdeburg"
    page = get_json(base + "&limit=50&category_id=public-services")
    assert len(page["items"]) == 50 and page["next_cursor"]
    second = get_json(base + "&limit=50&category_id=public-services&cursor=" + page["next_cursor"])
    assert len(second["items"]) == 32 and second["next_cursor"] is None
    actual = page["items"] + second["items"]
    assert {row["service_id"] for row in actual} == {row["service_id"] for row in records}
    expected_counts = Counter(category for row in records for category in row["subcategory_ids"])
    counts = {}
    for category, count in sorted(expected_counts.items()):
        result = get_json(base + "&limit=100&category_id=" + category)
        assert len(result["items"]) == count
        assert all(category in row["subcategory_ids"] for row in result["items"])
        counts[category] = count
    for row in records:
        detail = get_json(origin + "/api/public-services/" + row["service_id"])
        for field in ("name", "category_ids", "subcategory_ids", "description_el", "description_de", "description_en",
                      "opening_hours", "profile_image_asset", "cover_image_asset", "latitude", "longitude"):
            assert detail[field] == row[field], (row["service_id"], field)
        assert not {"candidate_latitude", "candidate_longitude", "geo_status", "source_geo_manual_review_note", "import_batch"} & detail.keys()
    for service_id in excluded:
        try:
            get_json(origin + "/api/public-services/" + service_id)
        except urllib.error.HTTPError as error:
            assert error.code == 404
        else:
            raise AssertionError("Excluded record is publicly accessible")
    bounded = get_json(base + "&limit=100&category_id=public-services&min_lat=52.06&max_lat=52.22&min_lng=11.52&max_lng=11.75&include_unlocated=true")
    expected_bounds = sum(52.06 <= row["latitude"] <= 52.22 and 11.52 <= row["longitude"] <= 11.75 for row in records)
    assert len(bounded["items"]) == expected_bounds
    report = {"target": target, "origin": origin, **runtime, "total": len(actual), "categories": counts,
        "details_verified": len(records), "excluded_not_public": len(excluded), "pagination": [50, 32],
        "default_map_bounds_count": expected_bounds, "source_sha256": source_hash,
        "patch_hashes": json.loads((root / target / "candidate.json").read_text())["patch_hashes"]}
    save(root / target / "verification.json", report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("capture", "refresh", "deploy", "import", "verify", "verify-assets", "withdraw"))
    parser.add_argument("target", choices=TARGETS)
    parser.add_argument("--release", type=Path, required=True)
    args = parser.parse_args()
    args.release.mkdir(parents=True, exist_ok=True)
    action = {"capture": capture, "refresh": refresh, "deploy": deploy, "import": import_records,
              "verify": verify, "verify-assets": verify_assets, "withdraw": withdraw}[args.action]
    print(json.dumps(action(args.target, args.release), ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
