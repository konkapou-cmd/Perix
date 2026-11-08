"""Convert the PERIX export to gated records with local illustration paths."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any
from zipfile import ZipFile

from public_services.repository import NODES


def _clean_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if item is not None and str(item).strip()]


def prepare_record(record: dict[str, Any], *, approve_candidate_coordinates: bool = False,
                   publish_approved_coordinates: bool = False) -> dict[str, Any]:
    """Map one PERIX directory item to its API shape.

    Supplied local illustrations are mapped, but remote image URLs are ignored.
    Incoming coordinates stay review-only and are never inferred from addresses.
    """
    if record.get("category") != "public-services":
        raise ValueError(f"Unsupported source category for {record.get('id')!r}")
    subcategory = record.get("subcategory")
    if subcategory not in NODES or NODES[subcategory].get("id") == "public-services":
        raise ValueError(f"Unknown public-services subcategory {subcategory!r}")
    source_id = str(record.get("id", "")).strip()
    if not source_id:
        raise ValueError("Every staged service needs a source id")
    has_lat = record.get("latitude") is not None
    has_lng = record.get("longitude") is not None
    if has_lat != has_lng:
        raise ValueError(f"Incomplete candidate coordinate pair for {source_id}")
    if publish_approved_coordinates and not approve_candidate_coordinates:
        raise ValueError("Publishing candidate coordinates requires explicit coordinate approval")
    coordinates_approved = has_lat and approve_candidate_coordinates
    source_geo_review_note = record.get("geo_manual_review_required")
    geo_review_note = str(source_geo_review_note) if source_geo_review_note not in (None, "") else None

    source_url = record.get("source_url") or record.get("official_website")
    rights_url = record.get("source_rights_url") or source_url
    if not source_url or not rights_url:
        raise ValueError(f"Missing source/rights URL for {source_id}")
    provider = str(record.get("source_provider") or "Official provider")
    verified = record.get("source_verification_date")
    visual = record.get("perix_visual_assets") or {}
    service_id = "ps_" + hashlib.sha256(source_id.encode("utf-8")).hexdigest()[:24]
    category_node = NODES["public-services"]
    subcategory_node = NODES[subcategory]

    source = {
        "source_provider": provider,
        "source_provider_url": None,
        "source_dataset_url": source_url,
        "source_record_url": source_url,
        # This is deliberately not represented as a licence grant.
        "source_license_id": "TERMS_REVIEW_REQUIRED",
        "source_license_url": rights_url,
        "source_published_at": None,
        "source_last_updated_at": None,
        "source_reference_period": None,
        "data_collected_at": verified or "",
        "attribution": f"Source: {provider}. Consult the linked official record.",
        "modifications": "Independent editorial directory entry; source terms and publication rights require review.",
        "source_locator": record.get("address") or None,
        "source_credits_url": rights_url,
    }

    return {
        **source,
        "service_id": service_id,
        "entity_type": "public_service",
        "country_code": record.get("country") or "DE",
        "city_id": "de-magdeburg",
        "source_record_id": source_id,
        "catalog_number": record.get("catalog_number"),
        "name": record["name"],
        "category_ids": ["public-services"],
        "subcategory_ids": [subcategory],
        "leaf_category_ids": [],
        "category_label_el": category_node["label_el"],
        "category_label_de": category_node["label_de"],
        "category_label_en": category_node["label_en"],
        "subcategory_label_el": record.get("subcategory_el") or subcategory_node["label_el"],
        "subcategory_label_de": record.get("subcategory_de") or subcategory_node["label_de"],
        "subcategory_label_en": record.get("subcategory_en") or subcategory_node["label_en"],
        "description_el": record.get("description_el") or None,
        "description_de": record.get("description_de") or None,
        "description_en": record.get("description_en") or None,
        "address": record.get("address") or None,
        # Preserve incoming points as candidates only. They are not cleared for
        # public display until their location and reuse terms are reviewed.
        "latitude": record.get("latitude") if coordinates_approved else None,
        "longitude": record.get("longitude") if coordinates_approved else None,
        "candidate_latitude": record.get("latitude"),
        "candidate_longitude": record.get("longitude"),
        "coordinate_review_status": "approved" if coordinates_approved else "review_required" if has_lat else "pending",
        "coordinate_review_note": "USER_APPROVED_AFTER_LATEST_REVIEW_2026-11-07" if coordinates_approved else None,
        "geo_status": record.get("geo_status") or None,
        "coordinate_match_type": record.get("coordinate_match_type") or None,
        "coordinate_osm_id": record.get("coordinate_osm_id") or None,
        "coordinate_source_url": record.get("coordinate_source_url") or None,
        "coordinate_source_license": record.get("geo_license_note") or None,
        "coordinate_manual_review_required": None if coordinates_approved else geo_review_note,
        "source_geo_manual_review_note": geo_review_note,
        "coordinate_crs": record.get("crs") or None,
        "official_address_source": record.get("official_address_source") or None,
        "phone": record.get("phone") or None,
        "phone_display": record.get("phone_display") or record.get("phone") or None,
        "phone_scope": record.get("phone_scope") or None,
        "additional_phones": _clean_list(record.get("additional_phones")),
        "email": record.get("email") or None,
        "email_scope": record.get("email_scope") or None,
        "additional_emails": _clean_list(record.get("additional_emails")),
        "website": record.get("official_website") or None,
        "opening_hours": record.get("opening_hours") or None,
        "opening_hours_scope": record.get("opening_hours_scope") or None,
        "telephone_hours": record.get("telephone_hours") or None,
        "visitor_notice_el": record.get("visitor_notice_el") or None,
        "visitor_notice_de": record.get("visitor_notice_de") or None,
        "visitor_notice_en": record.get("visitor_notice_en") or None,
        "special_notice": record.get("special_notice") or None,
        "services_supported_el": _clean_list(record.get("services_supported_el")),
        "services_supported_de": _clean_list(record.get("services_supported_de")),
        "services_supported_en": _clean_list(record.get("services_supported_en")),
        "source_url": source_url,
        "official_source_urls": _clean_list(record.get("official_source_urls")) or [source_url],
        "source_rights_url": rights_url,
        "source_verification_date": verified,
        "reuse_assessment": record.get("reuse_assessment") or None,
        "licensing_note": record.get("licensing_note") or None,
        "independent_directory_disclaimer_el": record.get("independent_directory_disclaimer_el") or None,
        "independent_directory_disclaimer_de": record.get("independent_directory_disclaimer_de") or None,
        "independent_directory_disclaimer_en": record.get("independent_directory_disclaimer_en") or None,
        # Only explicit local asset paths are mapped. No remote image URLs are used.
        "profile_image_url": None,
        "cover_image_url": None,
        "profile_image_asset": visual.get("profile_image_file") or None,
        "cover_image_asset": visual.get("cover_image_file") or None,
        "visual_asset_type": visual.get("artwork_type") or None,
        "visual_is_illustration": bool(visual.get("artwork_type")),
        "visual_location_verified": bool(visual.get("exact_location_verified", False)),
        "cover_context": visual.get("cover_context") or None,
        "additional_fields": {},
        "cover_icon": "business-outline",
        "sources": [source],
        "imported_at": None,
        "verification_status": "source_verified" if publish_approved_coordinates and coordinates_approved else "needs_review",
        "publication_status": "published" if publish_approved_coordinates and coordinates_approved else "draft" if has_lat else "hidden",
        "bio_status": "approved" if publish_approved_coordinates and coordinates_approved else "draft",
        "publication_rights_status": "approved" if publish_approved_coordinates and coordinates_approved else "review_required",
    }


def prepare_records(records: list[dict[str, Any]], *, approve_candidate_coordinates: bool = False,
                    publish_approved_coordinates: bool = False) -> list[dict[str, Any]]:
    prepared = [prepare_record(record, approve_candidate_coordinates=approve_candidate_coordinates,
                                publish_approved_coordinates=publish_approved_coordinates) for record in records]
    ids = [record["service_id"] for record in prepared]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate public-service source IDs")
    return prepared


def read_source(path: str | Path, *, approve_candidate_coordinates: bool = False,
                publish_approved_coordinates: bool = False) -> list[dict[str, Any]]:
    source = Path(path)
    if source.suffix.lower() == ".zip":
        with ZipFile(source) as archive:
            data = json.loads(archive.read("PERIX_90_WITH_IMAGES_AND_GEO_WORKING.json").decode("utf-8"))
    else:
        data = json.loads(source.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("Expected a JSON array of public-service records")
    return prepare_records(data, approve_candidate_coordinates=approve_candidate_coordinates,
                           publish_approved_coordinates=publish_approved_coordinates)
