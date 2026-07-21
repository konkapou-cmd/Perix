"""Shared Pydantic model for user listings (products and home rentals)."""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime

LocationVisibility = Literal["approximate", "exact"]
SellerType = Literal["user", "business"]
PublicationScope = Literal["profile_only", "profile_and_marketplace"]

CATEGORY_ALIASES: dict = {
    "home_garden_diy": ["home_garden_diy", "home_garden"],
    "sports_outdoor": ["sports_outdoor", "sports"],
    "media_music": ["media_music", "books"],
}


class ListingCreate(BaseModel):
    listing_type: str  # "product" | "home_rental"
    title: str
    description: Optional[str] = None
    price: Optional[str] = None
    cover_image_url: Optional[str] = None
    image_urls: List[str] = []
    gallery_images: List[str] = []
    gallery_videos: List[str] = []
    video_url: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    public_location_label: Optional[str] = None
    location_visibility: LocationVisibility = "approximate"
    category: Optional[str] = None
    subcategory: Optional[str] = None
    attributes: Dict[str, Any] = Field(default_factory=dict)
    status: str = "draft"  # draft | published | sold | rented
    seller_type: SellerType = "user"
    seller_id: Optional[str] = None
    business_id: Optional[str] = None
    publication_scope: PublicationScope = "profile_and_marketplace"

    # Product fields
    condition: Optional[str] = None  # new | like_new | good | used
    brand: Optional[str] = None
    delivery_method: Optional[str] = None  # pickup | shipping | both

    # Home rental fields
    property_type: Optional[str] = None  # apartment | house | studio | room
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    size_sqm: Optional[int] = None
    furnished: Optional[bool] = None
    available_from: Optional[str] = None
    lease_duration: Optional[str] = None
    deposit: Optional[str] = None


class ListingUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    price: Optional[str] = None
    cover_image_url: Optional[str] = None
    image_urls: Optional[List[str]] = None
    gallery_images: Optional[List[str]] = None
    gallery_videos: Optional[List[str]] = None
    video_url: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    public_location_label: Optional[str] = None
    location_visibility: Optional[LocationVisibility] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    attributes: Optional[Dict[str, Any]] = None
    status: Optional[str] = None
    condition: Optional[str] = None
    brand: Optional[str] = None
    delivery_method: Optional[str] = None
    property_type: Optional[str] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    size_sqm: Optional[int] = None
    furnished: Optional[bool] = None
    available_from: Optional[str] = None
    lease_duration: Optional[str] = None
    deposit: Optional[str] = None
    is_active: Optional[bool] = None
    seller_type: Optional[SellerType] = None
    seller_id: Optional[str] = None
    business_id: Optional[str] = None
    publication_scope: Optional[PublicationScope] = None


class ListingResponse(BaseModel):
    listing_id: str
    owner_id: str
    listing_type: str
    title: str
    description: Optional[str] = None
    price: Optional[str] = None
    cover_image_url: Optional[str] = None
    image_urls: List[str] = []
    gallery_images: List[str] = []
    gallery_videos: List[str] = []
    video_url: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    public_location_label: Optional[str] = None
    location_visibility: LocationVisibility = "approximate"
    category: Optional[str] = None
    subcategory: Optional[str] = None
    attributes: Dict[str, Any] = Field(default_factory=dict)
    status: str
    is_active: bool = True
    created_at: datetime
    seller_type: SellerType = "user"
    seller_id: Optional[str] = None
    business_id: Optional[str] = None
    publication_scope: PublicationScope = "profile_and_marketplace"

    # Product
    condition: Optional[str] = None
    brand: Optional[str] = None
    delivery_method: Optional[str] = None

    # Home rental
    property_type: Optional[str] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    size_sqm: Optional[int] = None
    furnished: Optional[bool] = None
    available_from: Optional[str] = None
    lease_duration: Optional[str] = None
    deposit: Optional[str] = None
