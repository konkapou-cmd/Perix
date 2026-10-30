"""Exercise the new public read models without importing server startup/jobs."""
import ast
import asyncio
import importlib.util
import json
from pathlib import Path
import sys
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from test_directory import Collection, matches

BACKEND = Path(__file__).resolve().parents[2]
from public_services.discovery import TABLES, project, read_detail, read_list, read_comments, visible_query


class DB(dict):
    def __getattr__(self, key): return self[key]


@pytest.fixture
def db(monkeypatch):
    business = {"business_id": "biz_public", "name": "TEST public business", "root_category": "entertainment-events", "subcategories": ["escape-rooms"],
                "latitude": 52.14, "longitude": 11.63, "opening_hours": {"schedule": {"monday": {"open": "09:00", "close": "17:00"}}},
                "owner_id": "user_public", "subscription_status": "private-plan", "email": "private@example.invalid"}
    private = {**business, "business_id": "biz_hidden", "is_hidden": True}
    user = {"user_id": "user_public", "name": "TEST public name", "latitude": 52.14, "longitude": 11.63, "email": "private@example.invalid", "is_admin": True}
    event = {"event_id": "event_private", "title": "PRIVATE", "is_private": True, "business_id": "biz_public", "start_time": "2026-10-28T10:00:00Z"}
    post = {"post_id": "post_public", "text": "TEST public post", "user_id": "user_public", "actor_id": "user_public", "actor_type": "user", "is_public": True, "city_id": "de-magdeburg",
            "comments": [{"comment_id": "a", "text": "visible", "user_id": "user_public"}, {"comment_id": "b", "text": "PRIVATE", "is_hidden": True, "user_id": "user_public"}]}
    hidden_post = {**post, "post_id": "post_private", "is_public": False}
    service = {"service_id": "svc_public", "name": "TEST service", "business_id": "biz_public", "status": "published", "is_active": True, "type": "gym_class", "latitude": 52.14, "longitude": 11.63}
    draft = {**service, "service_id": "svc_draft", "status": "draft"}
    tables = {name: Collection([]) for name, _ in TABLES.values()}
    tables.update(businesses=Collection([business, private]), users=Collection([user]), posts=Collection([post, hidden_post]), events=Collection([event]), services=Collection([service, draft]))
    # Execute only the actual existing pure location functions, never routes/__init__.
    source = ast.parse((BACKEND / "routes/listings.py").read_text(encoding="utf-8"))
    functions = [node for node in source.body if isinstance(node, ast.FunctionDef) and node.name in ("fuzz_coordinate", "public_listing_location")]
    namespace = {"math": __import__("math"), "FUZZ_FACTOR": 0.01}
    exec(compile(ast.Module(body=functions, type_ignores=[]), "existing-listing-location", "exec"), namespace)
    monkeypatch.setitem(sys.modules, "routes.listings", SimpleNamespace(**namespace))
    return DB(tables)


def test_business_public_projection_excludes_owner_account_and_plan_data(db):
    result = asyncio.run(read_detail(db, "business", "biz_public")).model_dump()
    assert result["title"] == "TEST public business"
    assert not {"owner_id", "email", "subscription_status", "friends", "access_code"} & result.keys()
    assert result["facts"]["monday"] == "09:00–17:00"
    with pytest.raises(HTTPException): asyncio.run(read_detail(db, "business", "biz_hidden"))


def test_private_event_and_private_post_are_not_accessible_by_id(db):
    for kind, identifier in [("event", "event_private"), ("post", "post_private")]:
        with pytest.raises(HTTPException) as error: asyncio.run(read_detail(db, kind, identifier))
        assert error.value.status_code == 404


def test_user_gps_email_and_role_never_enter_public_profile(db):
    result = asyncio.run(read_detail(db, "user", "user_public")).model_dump()
    assert result["latitude"] is None and result["longitude"] is None and result["address"] is None
    assert "private@example.invalid" not in json.dumps(result) and "is_admin" not in result


def test_parent_category_queries_use_ids_and_preserve_visibility(db):
    page = asyncio.run(read_list(db, "business", (52.1, 52.2, 11.5, 11.7), root="entertainment-events", subcategories=["escape-rooms", "bowling"]))
    assert [r.id for r in page["items"]] == ["biz_public"]
    query = db.businesses.calls[0][0]
    assert query["root_category"] == "entertainment-events"
    assert any(clause.get("$or", [{}])[0].get("subcategories") == {"$in": ["escape-rooms", "bowling"]} for clause in query["$and"])


def test_draft_services_and_hidden_publishers_are_filtered(db):
    page = asyncio.run(read_list(db, "service", (52.1, 52.2, 11.5, 11.7)))
    assert [r.id for r in page["items"]] == ["svc_public"]
    db.businesses.docs[0]["is_hidden"] = True
    assert asyncio.run(read_list(db, "service", (52.1, 52.2, 11.5, 11.7)))["items"] == []


def test_listings_reuse_existing_approximate_location_not_exact_address(db):
    result = project("home", {"listing_id": "lst_test", "title": "TEST home", "address": "PRIVATE exact street", "public_location_label": "Public neighbourhood", "latitude": 52.123456, "longitude": 11.654321})
    assert result.address == "Public neighbourhood"
    assert result.latitude != 52.123456 and result.longitude != 11.654321


def test_public_comments_never_include_hidden_comments_or_author_emails(db):
    result = asyncio.run(read_comments(db, "post_public"))
    assert result["items"] == [{"id": "a", "text": "visible", "author": "TEST public name"}]
    assert "PRIVATE" not in json.dumps(result) and "@" not in json.dumps(result)


@pytest.mark.parametrize("kind", TABLES)
def test_all_directory_types_have_non_mutating_visibility_rules(kind):
    query = visible_query(kind)
    assert query["is_hidden"] == {"$ne": True} and query["is_private"] == {"$ne": True}
    if kind in ("service", "job", "rental", "product", "home"): assert query["status"] == "published"


def test_real_router_rejects_bad_bounds_and_has_no_writes(db, monkeypatch):
    monkeypatch.setitem(sys.modules, "database", SimpleNamespace(db=db))
    spec = importlib.util.spec_from_file_location("isolated_city_public", BACKEND / "routes/city_public.py")
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    app = FastAPI(); app.include_router(module.router, prefix="/api")
    with TestClient(app) as client:
        good = {"min_lat": 52.1, "max_lat": 52.2, "min_lng": 11.5, "max_lng": 11.7}
        assert client.get("/api/public-directory/business", params=good).status_code == 200
        assert client.get("/api/public-directory/user", params=good).status_code == 422
        assert client.get("/api/public-directory/business", params={**good, "max_lat": 90}).status_code == 422
        assert client.get("/api/public-directory/business", params={**good, "limit": 101}).status_code == 422
        for method in ("post", "patch", "put", "delete"):
            assert getattr(client, method)("/api/public-directory/business/biz_public").status_code == 405
