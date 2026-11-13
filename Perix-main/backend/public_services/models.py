"""Explicit public DTOs; import review notes never become API fields."""
import math
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class SourceAttribution(BaseModel):
    source_provider: str
    source_provider_url: str | None = None
    source_dataset_url: str
    source_record_url: str | None = None
    source_license_id: str
    source_license_url: str
    source_published_at: str | None = None
    source_last_updated_at: str | None = None
    source_reference_period: str | None = None
    data_collected_at: str
    attribution: str
    modifications: str
    source_locator: str | None = None
    source_credits_url: str | None = None


class PublicService(SourceAttribution):
    model_config = ConfigDict(extra="ignore")
    service_id: str
    entity_type: Literal["public_service"] = "public_service"
    country_code: str = Field(pattern=r"^[A-Z]{2}$")
    city_id: str = Field(min_length=1, max_length=80)
    source_record_id: str | None = None
    catalog_number: int | None = None
    name: str
    category_ids: list[str]
    subcategory_ids: list[str]
    leaf_category_ids: list[str]
    category_label_el: str | None = None
    category_label_de: str | None = None
    category_label_en: str | None = None
    subcategory_label_el: str | None = None
    subcategory_label_de: str | None = None
    subcategory_label_en: str | None = None
    description_el: str | None = None
    description_de: str | None = None
    description_en: str | None = None
    address: str | None = None
    # Public coordinates are populated only after per-record source and map review.
    latitude: float | None = None
    longitude: float | None = None
    candidate_latitude: float | None = Field(default=None, exclude=True)
    candidate_longitude: float | None = Field(default=None, exclude=True)
    coordinate_review_status: Literal["pending", "review_required", "approved", "rejected"] | None = None
    coordinate_review_note: str | None = None
    geo_status: str | None = Field(default=None, exclude=True)
    coordinate_match_type: str | None = None
    coordinate_osm_id: str | None = None
    coordinate_source_url: str | None = None
    coordinate_source_license: str | None = None
    coordinate_manual_review_required: str | None = None
    source_geo_manual_review_note: str | None = Field(default=None, exclude=True)
    coordinate_crs: str | None = None
    official_address_source: str | None = None
    phone: str | None = None
    phone_display: str | None = None
    phone_scope: str | None = None
    additional_phones: list[str] = Field(default_factory=list)
    email: str | None = None
    email_scope: str | None = None
    additional_emails: list[str] = Field(default_factory=list)
    website: str | None = None
    opening_hours_scope: str | None = None
    opening_hours: str | None = None
    telephone_hours: str | None = None
    visitor_notice_el: str | None = None
    visitor_notice_de: str | None = None
    visitor_notice_en: str | None = None
    special_notice: str | None = None
    services_supported_el: list[str] = Field(default_factory=list)
    services_supported_de: list[str] = Field(default_factory=list)
    services_supported_en: list[str] = Field(default_factory=list)
    source_url: str | None = None
    official_source_urls: list[str] = Field(default_factory=list)
    source_rights_url: str | None = None
    source_verification_date: str | None = None
    reuse_assessment: str | None = None
    licensing_note: str | None = None
    independent_directory_disclaimer_el: str | None = None
    independent_directory_disclaimer_de: str | None = None
    independent_directory_disclaimer_en: str | None = None
    profile_image_url: str | None = None
    cover_image_url: str | None = None
    profile_image_asset: str | None = None
    cover_image_asset: str | None = None
    visual_asset_type: str | None = None
    visual_is_illustration: bool = False
    visual_location_verified: bool = False
    cover_context: str | None = None
    additional_fields: dict[str, Any] = Field(default_factory=dict)
    cover_icon: str
    sources: list[SourceAttribution]
    imported_at: str | None = None
    verification_status: Literal["needs_review", "source_verified", "rejected"]
    publication_status: Literal["draft", "published", "hidden"]
    bio_status: Literal["draft", "approved"] = "draft"
    publication_rights_status: Literal["review_required", "approved", "restricted"] | None = None

    @model_validator(mode="after")
    def valid_coordinates(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Coordinates must both be null or both present")
        if (self.candidate_latitude is None) != (self.candidate_longitude is None):
            raise ValueError("Candidate coordinates must both be null or both present")
        if self.latitude is not None and (not math.isfinite(self.latitude) or not math.isfinite(self.longitude)
                                          or abs(self.latitude) > 90 or abs(self.longitude) > 180):
            raise ValueError("Invalid coordinates")
        if self.candidate_latitude is not None and (
            not math.isfinite(self.candidate_latitude) or not math.isfinite(self.candidate_longitude)
            or abs(self.candidate_latitude) > 90 or abs(self.candidate_longitude) > 180
        ):
            raise ValueError("Invalid candidate coordinates")
        return self


class PublicServicePage(BaseModel):
    items: list[PublicService]
    next_cursor: str | None = None
