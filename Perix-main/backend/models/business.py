"""Business-related Pydantic models."""
from pydantic import BaseModel, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime
from models.user import ThemeSettings


class BusinessModules(BaseModel):
    events: bool = False
    tickets: bool = False
    jobs: bool = False
    bookings: bool = False
    rentals: bool = False
    gym: bool = False
    salon: bool = False


class BusinessCreate(BaseModel):
    name: str
    root_category: str
    subcategory: str
    description: Optional[str] = None
    logo_image: Optional[str] = None
    cover_image: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    email: Optional[EmailStr] = None
    social_links: Optional[Dict[str, str]] = None
    opening_hours: Optional[Dict[str, Any]] = None
    gallery_images: List[str] = []
    gallery_videos: List[str] = []
    tags: List[str] = []
    address: str
    latitude: float
    longitude: float


class BusinessUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    logo_image: Optional[str] = None
    cover_image: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    email: Optional[EmailStr] = None
    social_links: Optional[Dict[str, str]] = None
    opening_hours: Optional[Dict[str, Any]] = None
    gallery_images: Optional[List[str]] = None
    gallery_videos: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    root_category: Optional[str] = None
    subcategory: Optional[str] = None
    hidden_fan_posts: Optional[List[str]] = None


class BusinessResponse(BaseModel):
    business_id: str
    owner_id: str
    name: str
    category: str
    root_category: str
    subcategory: str
    description: Optional[str] = None
    logo_image: Optional[str] = None
    cover_image: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    email: Optional[EmailStr] = None
    social_links: Optional[Dict[str, str]] = None
    opening_hours: Optional[Dict[str, Any]] = None
    gallery_images: List[str] = []
    gallery_videos: List[str] = []
    tags: List[str] = []
    address: str
    latitude: float
    longitude: float
    created_at: datetime
    enabled_modules: BusinessModules
    subscription_status: str
    trial_expires_at: Optional[datetime] = None
    plan_type: Optional[str] = None
    subscription_expires_at: Optional[datetime] = None
    favorites_count: int = 0
    followers_count: int = 0
    theme: Optional[ThemeSettings] = None  # Profile theme customization


class BusinessSummary(BaseModel):
    business_id: str
    name: str
    category: str
    root_category: str
    subcategory: str
    address: str
    latitude: float
    longitude: float
    logo_image: Optional[str] = None
    theme: Optional[ThemeSettings] = None  # Profile theme customization


class BusinessDetail(BaseModel):
    business: BusinessResponse
    events: List["EventResponse"] = []
    posts: List["PostResponse"] = []
    jobs: List[dict] = []
    is_owner: bool
    is_favorited: bool


class GalleryItem(BaseModel):
    """Gallery item with URL and optional caption."""
    url: str
    caption: Optional[str] = None


class GalleryUpdate(BaseModel):
    images: List[str] = []
    videos: List[str] = []
    remove_images: List[str] = []
    remove_videos: List[str] = []
    image_items: List[GalleryItem] = []
    video_items: List[GalleryItem] = []


# Forward reference resolution
from models.event import EventResponse
from models.post import PostResponse
# Business profile theme customization
BusinessDetail.model_rebuild()
