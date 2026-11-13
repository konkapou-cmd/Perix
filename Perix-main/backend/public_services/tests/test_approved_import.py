import copy
import json
from pathlib import Path

import pytest

from public_services.approved_import import approved_records
from public_services.models import PublicService, PublicServicePage


BACKEND = Path(__file__).resolve().parents[2]
ASSETS = BACKEND.parent / "frontend/assets/public-services"


def records():
    return json.loads((BACKEND / "public_services/staging/perix_90_candidates.json").read_text(encoding="utf-8"))


def test_selects_only_82_explicitly_approved_records_without_modifying_input():
    source = records()
    before = copy.deepcopy(source)
    selected, excluded = approved_records(source, assets_root=ASSETS)
    assert len(selected) == 82 and len(excluded) == 8
    assert source == before
    assert not set(excluded) & {row["service_id"] for row in selected}


@pytest.mark.parametrize("field", ["publication_status", "verification_status", "bio_status", "publication_rights_status", "coordinate_review_status"])
def test_does_not_promote_any_unapproved_state(field):
    row = records()[0]
    row[field] = None
    selected, excluded = approved_records([row], assets_root=ASSETS)
    assert selected == [] and excluded == [row["service_id"]]


@pytest.mark.parametrize("change", [
    {"subcategory_ids": ["ps:old-category"]},
    {"category_ids": []},
    {"profile_image_asset": "../secret.webp"},
    {"cover_image_asset": "covers/missing.webp"},
    {"latitude": None, "longitude": None},
    {"city_id": "other-city"},
    {"description_el": ""},
    {"is_hidden": True},
    {"service_id": "ps_" + "0" * 24},
])
def test_invalid_approved_record_aborts(change):
    row = records()[0]
    row.update(change)
    with pytest.raises(ValueError):
        approved_records([row], assets_root=ASSETS)


def test_duplicate_identity_aborts():
    row = records()[0]
    with pytest.raises(ValueError, match="duplicate"):
        approved_records([row, row], assets_root=ASSETS)


def test_response_models_never_serialize_internal_review_fields():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    row = records()[0]
    service = PublicService.model_validate(row)
    app = FastAPI()

    @app.get("/detail", response_model=PublicService)
    def detail():
        return service

    @app.get("/list", response_model=PublicServicePage)
    def listing():
        return {"items": [service], "next_cursor": None}

    internal = {"candidate_latitude", "candidate_longitude", "geo_status", "source_geo_manual_review_note"}
    client = TestClient(app)
    assert not internal & client.get("/detail").json().keys()
    assert not internal & client.get("/list").json()["items"][0].keys()
    # Import validation retains coordinate consistency checks without publishing candidates.
    assert service.candidate_latitude == row["candidate_latitude"]
