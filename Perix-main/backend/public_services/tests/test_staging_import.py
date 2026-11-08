import pytest

from public_services.staging_import import prepare_record, prepare_records
from public_services.repository import PUBLIC_FIELDS, PUBLIC_PREDICATE, TAXONOMY


def source_record(**overrides):
    row = {
        "id": "perix_md_001",
        "catalog_number": 1,
        "name": "BürgerBüro Mitte",
        "category": "public-services",
        "subcategory": "citizen-services",
        "subcategory_el": "Εξυπηρέτηση Πολιτών & Απολεσθέντα",
        "subcategory_de": "Bürgerservice & Fundbüro",
        "subcategory_en": "Citizen Services & Lost Property",
        "country": "DE",
        "city": "Magdeburg",
        "address": "Leiterstraße 2a, 39104 Magdeburg",
        "latitude": None,
        "longitude": None,
        "phone": "115",
        "phone_scope": "Behördennummer 115",
        "email": "bbm@example.invalid",
        "official_website": "https://example.invalid/office",
        "source_url": "https://example.invalid/office",
        "source_rights_url": "https://example.invalid/rights",
        "source_provider": "CITY",
        "source_verification_date": "2026-11-05",
        "description_el": "Περιγραφή",
        "services_supported_en": ["Registration"],
        "perix_visual_assets": {
            "profile_image_file": "profiles/perix_md_001_profile.webp",
            "cover_image_file": "covers/perix_md_001_cover.webp",
            "artwork_type": "original_ai_watercolor_on_wood_illustration",
            "exact_location_verified": False,
        },
        "image_urls": ["https://example.invalid/not-owned.png"],
        "import_target": "STAGING_ONLY",
        "publication_gate": "HOLD_FOR_LIVE_REVIEW",
    }
    row.update(overrides)
    return row


def test_mapping_uses_canonical_categories_and_keeps_record_unpublished():
    prepared = prepare_record(source_record())
    assert prepared["category_ids"] == ["public-services"]
    assert prepared["subcategory_ids"] == ["citizen-services"]
    assert prepared["service_id"].startswith("ps_") and len(prepared["service_id"]) == 27
    assert prepared["publication_status"] == "hidden"
    assert prepared["verification_status"] == "needs_review"
    assert prepared["bio_status"] == "draft"
    assert prepared["publication_rights_status"] == "review_required"
    assert prepared["phone_scope"] == "Behördennummer 115"
    assert prepared["services_supported_en"] == ["Registration"]


def test_import_links_local_art_as_illustration_and_hides_unlocated_record():
    prepared = prepare_record(source_record())
    assert prepared["profile_image_url"] is None
    assert prepared["cover_image_url"] is None
    assert prepared["profile_image_asset"] == "profiles/perix_md_001_profile.webp"
    assert prepared["cover_image_asset"] == "covers/perix_md_001_cover.webp"
    assert prepared["visual_is_illustration"] is True
    assert prepared["visual_location_verified"] is False
    assert prepared["latitude"] is None and prepared["longitude"] is None
    assert prepared["publication_status"] == "hidden"
    assert "image_urls" not in prepared
    assert prepared["coordinate_review_status"] == "pending"


def test_supplied_coordinates_stay_staging_candidates_until_review():
    prepared = prepare_record(source_record(
        latitude=52.1,
        longitude=11.6,
        geo_status="OSM_POINT_CHECK_ON_MAP_BEFORE_LIVE",
        coordinate_source_url="https://mapcarta.example/office",
        geo_license_note="© OpenStreetMap contributors; ODbL 1.0",
        geo_manual_review_required="YES",
    ))
    assert prepared["latitude"] is None and prepared["longitude"] is None
    assert prepared["candidate_latitude"] == 52.1 and prepared["candidate_longitude"] == 11.6
    assert prepared["coordinate_review_status"] == "review_required"
    assert prepared["publication_status"] == "draft"
    assert prepared["coordinate_source_license"].startswith("© OpenStreetMap")
    assert "candidate_latitude" not in PUBLIC_FIELDS and "candidate_longitude" not in PUBLIC_FIELDS
    assert "source_geo_manual_review_note" not in PUBLIC_FIELDS
    assert "geo_status" not in PUBLIC_FIELDS


def test_explicit_user_approval_promotes_coordinate_but_keeps_listing_draft():
    prepared = prepare_record(source_record(
        latitude=52.1,
        longitude=11.6,
        geo_status="OSM_POINT_CHECK_ON_MAP_BEFORE_LIVE",
        geo_manual_review_required="Old review note",
    ), approve_candidate_coordinates=True)
    assert prepared["latitude"] == 52.1 and prepared["longitude"] == 11.6
    assert prepared["candidate_latitude"] == 52.1 and prepared["candidate_longitude"] == 11.6
    assert prepared["coordinate_review_status"] == "approved"
    assert prepared["coordinate_manual_review_required"] is None
    assert prepared["source_geo_manual_review_note"] == "Old review note"
    assert prepared["coordinate_review_note"] == "USER_APPROVED_AFTER_LATEST_REVIEW_2026-11-07"
    assert prepared["publication_status"] == "draft"


def test_publish_option_marks_only_coordinate_approved_records_published():
    with_coordinates = prepare_record(source_record(latitude=52.1, longitude=11.6),
                                      approve_candidate_coordinates=True,
                                      publish_approved_coordinates=True)
    without_coordinates = prepare_record(source_record(id="perix_md_017"),
                                         approve_candidate_coordinates=True,
                                         publish_approved_coordinates=True)
    assert with_coordinates["publication_status"] == "published"
    assert with_coordinates["verification_status"] == "source_verified"
    assert with_coordinates["bio_status"] == "approved"
    assert with_coordinates["publication_rights_status"] == "approved"
    assert without_coordinates["publication_status"] == "hidden"
    assert without_coordinates["publication_rights_status"] == "review_required"


def test_publish_option_cannot_skip_coordinate_approval():
    with pytest.raises(ValueError, match="requires explicit coordinate approval"):
        prepare_record(source_record(latitude=52.1, longitude=11.6), publish_approved_coordinates=True)


def test_unknown_category_and_duplicate_source_ids_are_rejected():
    with pytest.raises(ValueError, match="Unknown public-services subcategory"):
        prepare_record(source_record(subcategory="old-unmapped-category"))
    with pytest.raises(ValueError, match="Duplicate public-service source IDs"):
        prepare_records([source_record(), source_record()])


def test_taxonomy_matches_the_16_import_subcategories():
    expected = {
        "citizen-services", "immigration-citizenship", "civil-registry", "business-licensing",
        "family-youth", "social-housing", "public-health", "mobility-transport",
        "building-infrastructure", "education-culture", "waste-recycling",
        "government-administration", "employment-careers", "courts-justice", "tax-finance",
        "police-security",
    }
    assert {node["id"] for node in TAXONOMY["children"] if not node["id"].startswith("ps:")} == expected
    assert PUBLIC_PREDICATE["publication_rights_status"] == {"$in": ["approved", None]}
