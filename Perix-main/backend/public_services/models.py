"""Explicit public DTOs; import review notes never become API fields."""
import math
from typing import Literal
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
    name: str
    category_ids: list[str]
    subcategory_ids: list[str]
    leaf_category_ids: list[str]
    description_el: str | None = None
    description_de: str | None = None
    description_en: str | None = None
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    phone: str | None = None
    website: str | None = None
    opening_hours: str | None = None
    cover_icon: str
    sources: list[SourceAttribution]
    imported_at: str | None = None
    verification_status: Literal["needs_review", "source_verified", "rejected"]
    publication_status: Literal["draft", "published", "hidden"]
    bio_status: Literal["draft", "approved"] = "draft"

    @model_validator(mode="after")
    def valid_coordinates(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Coordinates must both be null or both present")
        if self.latitude is not None and (not math.isfinite(self.latitude) or not math.isfinite(self.longitude)
                                         or abs(self.latitude) > 90 or abs(self.longitude) > 180):
            raise ValueError("Invalid coordinates")
        return self


class PublicServicePage(BaseModel):
    items: list[PublicService]
    next_cursor: str | None = None
