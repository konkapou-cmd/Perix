"""Offline security/data tests. No production config, app startup or database."""
import asyncio
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import sys
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND))
from public_services.models import PublicService
from public_services.repository import NODES, PUBLIC_FIELDS, PUBLIC_PREDICATE, query_for

SNAPSHOT = BACKEND / "imports/public_services/de-magdeburg/2026-10-27"


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, BACKEND / f"scripts/public_services/{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def records():
    return json.loads((SNAPSHOT / "records.draft.json").read_text(encoding="utf-8"))


def matches(doc, query):
    for key, value in query.items():
        actual = doc
        for part in key.split("."):
            actual = actual.get(part) if isinstance(actual, dict) else None
        if key == "$or":
            if not any(matches(doc, child) for child in value): return False
        elif key == "$and":
            if not all(matches(doc, child) for child in value): return False
        elif isinstance(value, dict):
            for op, val in value.items():
                if op == "$ne" and actual == val: return False
                if op == "$nin" and actual in val: return False
                if op == "$in" and not (any(v in val for v in actual) if isinstance(actual, list) else actual in val): return False
                if op == "$exists" and (actual is not None) != val: return False
                if op == "$gte" and (actual is None or actual < val): return False
                if op == "$lte" and (actual is None or actual > val): return False
                if op == "$gt":
                    try:
                        if actual is None or actual <= val: return False
                    except TypeError: return False
                if op == "$regex":
                    import re
                    if not re.search(val, actual or "", re.I): return False
        elif isinstance(actual, list):
            if value not in actual: return False
        elif actual != value: return False
    return True


class Collection:
    def __init__(self, docs): self.docs = docs; self.calls = []
    def find(self, query, projection):
        self.calls.append((query, projection))
        self.found = [doc for doc in self.docs if matches(doc, query)]
        return self
    def sort(self, key, direction): self.found.sort(key=lambda d: d[key]); return self
    def limit(self, limit): self.found = self.found[:limit]; return self
    async def to_list(self, limit): return self.found[:limit]
    async def find_one(self, query, projection):
        return next((d for d in self.docs if matches(d, query)), None)


@pytest.fixture
def client(monkeypatch):
    published = deepcopy(records()[0])
    published.update(publication_status="published", bio_status="approved", imported_at="2026-10-27T00:00:00+00:00", private_owner_email="private@example.invalid")
    draft = deepcopy(records()[1])
    hidden = deepcopy(published); hidden.update(service_id="ps_" + "f" * 24, is_hidden=True)
    collection = Collection([published, draft, hidden])
    monkeypatch.setitem(sys.modules, "database", SimpleNamespace(db=SimpleNamespace(public_services=collection)))
    spec = importlib.util.spec_from_file_location("isolated_public_services_route", BACKEND / "routes/public_services.py")
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    app = FastAPI(); app.include_router(module.router, prefix="/api")
    with TestClient(app) as test_client:
        yield test_client, published, draft, collection


def test_real_package_counts_and_nulls():
    data = records()
    assert len(data) == 359
    assert len({r["service_id"] for r in data}) == len(data)
    assert sum(r["latitude"] is not None for r in data) == 352
    assert sum("ps:health:hospitals" in r["subcategory_ids"] for r in data) == 8
    assert sum("ps:health:insurance-care" in r["subcategory_ids"] for r in data) == 2
    for rec in data:
        assert rec["publication_status"] == rec["bio_status"] == "draft"
        assert rec["description_el"] and rec["description_de"]
        assert rec["imported_at"] is None and rec["opening_hours"] is None
        assert all(c in NODES for c in rec["category_ids"] + rec["subcategory_ids"])
        assert rec["sources"] and rec["data_collected_at"]
    assert all("ps:sos" not in r["category_ids"] for r in data)


def test_offline_build_is_byte_reproducible():
    builder = load_script("build_package")
    before = (SNAPSHOT / "records.draft.json").read_bytes()
    builder.build(SNAPSHOT)
    assert before == (SNAPSHOT / "records.draft.json").read_bytes()


def test_distinct_hospital_organisations_same_address_not_merged():
    data = [r for r in records() if r["address"] == "Leipziger Straße 44, 39120 Magdeburg"]
    assert len(data) == 2
    assert sum(r["latitude"] is not None for r in data) == 1
    median = [r for r in records() if r["address"] == "Gustav-Ricker-Straße 4, 39120 Magdeburg"]
    assert len(median) == 1 and len(median[0]["sources"]) == 2


def test_public_dto_omits_arbitrary_private_fields():
    raw = {**records()[0], "owner_email": "no", "token": "secret", "review_notes": "private"}
    payload = PublicService.model_validate(raw).model_dump()
    assert not {"owner_email", "token", "review_notes"} & payload.keys()
    assert "_id" not in PUBLIC_FIELDS or PUBLIC_FIELDS["_id"] == 0


@pytest.mark.parametrize("lat,lng", [(float("nan"), 11), (52, float("inf")), (91, 11), (52, None)])
def test_invalid_coordinates_rejected(lat, lng):
    with pytest.raises(ValueError): PublicService.model_validate({**records()[0], "latitude": lat, "longitude": lng})


def test_parent_and_leaf_use_exact_ids_and_published_predicates():
    for category in ("public-services", "ps:health", "ps:health:hospitals"):
        query = query_for("DE", "de-magdeburg", category)
        assert all(query[k] == v for k, v in PUBLIC_PREDICATE.items())
        assert query["$or"] == [{field: category} for field in ("category_ids", "subcategory_ids", "leaf_category_ids")]
    with pytest.raises(HTTPException): query_for("DE", "de-magdeburg", "invented")


def test_anonymous_list_detail_and_draft_hidden_denial(client):
    api, published, draft, collection = client
    result = api.get("/api/public-services", params={"country_code": "DE", "city_id": "de-magdeburg"})
    assert result.status_code == 200 and len(result.json()["items"]) == 1
    assert "private_owner_email" not in result.text
    assert api.get(f"/api/public-services/{published['service_id']}").status_code == 200
    assert api.get(f"/api/public-services/{draft['service_id']}").status_code == 404
    assert api.get("/api/public-services/ps_" + "f" * 24).status_code == 404
    assert api.get("/api/public-services/taxonomy").json()["id"] == "public-services"


@pytest.mark.parametrize("params", [
    {"min_lat": 52}, {"min_lat": 53, "max_lat": 52, "min_lng": 11, "max_lng": 12},
    {"limit": 101}, {"limit": 0}, {"category_id": "invented"}, {"cursor": "bad"},
    {"min_lat": "NaN", "max_lat": 53, "min_lng": 11, "max_lng": 12},
])
def test_bad_public_inputs_rejected(client, params):
    api, *_ = client
    assert api.get("/api/public-services", params={"country_code": "DE", "city_id": "de-magdeburg", **params}).status_code == 422


@pytest.mark.parametrize("method", ["post", "put", "patch", "delete"])
def test_directory_has_no_mutation_endpoints(client, method):
    api, _, _, collection = client
    response = getattr(api, method)("/api/public-services")
    assert response.status_code == 405
    assert not collection.calls


def test_import_is_draft_only_and_insert_only():
    importer = load_script("import_drafts")
    data = importer.load_drafts(SNAPSHOT / "records.draft.json", "DE", "de-magdeburg")
    collection = Mock()
    collection.update_one.return_value = SimpleNamespace(upserted_id=None)
    result = importer.insert_drafts(collection, data[:1], "2026-10-27T00:00:00Z")
    assert result == {"inserted": 0, "existing_untouched": 1}
    args = collection.update_one.call_args
    assert set(args.args[1]) == {"$setOnInsert"}
    assert args.args[1]["$setOnInsert"]["bio_status"] == "draft"
    with pytest.raises(ValueError): importer.load_drafts(SNAPSHOT / "records.draft.json", "GR", "gr-syros")


@pytest.mark.parametrize("uri", ["mongodb+srv://production", "mongodb://remote:27017", "mongodb://localhost,remote", "mongodb://localhost/?replicaSet=prod", "mongodb://localhost/admin"])
def test_import_refuses_nonlocal_or_ambiguous_database(uri):
    with pytest.raises(ValueError): load_script("import_drafts").check_local_target(uri, "perix_public_services_review_test", "perix_public_services_review_test")
