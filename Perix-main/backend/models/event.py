"""Event-related Pydantic models."""
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime
from models.user import ThemeSettings
from models.focal_point import FocalPoint

# Event theme options
EVENT_THEMES = [
    {"slug": "business-event", "label": "Business Event"},
    {"slug": "arts-event", "label": "Arts Event"},
    {"slug": "hip-hop", "label": "Hip Hop"},
    {"slug": "rnb", "label": "R&B"},
    {"slug": "dance-edm", "label": "Dance / EDM"},
    {"slug": "techno", "label": "Techno"},
    {"slug": "latin", "label": "Latin"},
    {"slug": "afrobeat", "label": "Afrobeat"},
    {"slug": "dancehall", "label": "Dancehall"},
    {"slug": "house", "label": "House"},
    {"slug": "funk-disco", "label": "Funk & Disco"},
    {"slug": "reggaeton", "label": "Reggaeton"},
    {"slug": "throwback", "label": "Throwback (80s, 90s, 2000s)"},
    {"slug": "trap", "label": "Trap"},
    {"slug": "amapiano", "label": "Amapiano"},
    {"slug": "multi-genre", "label": "Multi-Genre"},
    {"slug": "tropical", "label": "Tropical / Summer Vibes"},
    {"slug": "vip-luxury", "label": "VIP / Luxury Night"},
    {"slug": "festival", "label": "Festival-Style Party"},
    {"slug": "greek-music", "label": "Greek Music"},
    {"slug": "international", "label": "International Music"},
]

# Event profile themes (profile design customization)
EVENT_PROFILE_THEMES = [
    {"name": "Dark Party", "background": "#1a1a2e", "primary": "#e94560", "text": "#ffffff"},
    {"name": "Neon Night", "background": "#0f0f23", "primary": "#00d9ff", "text": "#ffffff"},
    {"name": "Gold Luxe", "background": "#1a1510", "primary": "#d4af37", "text": "#ffffff"},
    {"name": "Ruby Night", "background": "#1a0a14", "primary": "#ef4444", "text": "#ffffff"},
    {"name": "Emerald Dark", "background": "#021a12", "primary": "#10b981", "text": "#ffffff"},
]


class EventCreate(BaseModel):
    business_id: Optional[str] = None
    artist_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    cover_image_url: Optional[str] = None
    image_urls: List[str] = []
    video_url: Optional[str] = None
    start_time: datetime
    end_time: Optional[datetime] = None
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    theme: Optional[str] = None
    profile_theme: Optional[ThemeSettings] = None
    gallery_images: List[str] = []
    gallery_videos: List[str] = []
    tagged_artist_ids: List[str] = []
    is_private: bool = False
    password: Optional[str] = None
    cover_focal_point: Optional[FocalPoint] = None


class EventResponse(BaseModel):
    event_id: str
    business: Optional["BusinessSummary"] = None
    artist: Optional[Dict[str, Any]] = None
    title: str
    description: Optional[str]
    cover_image_url: Optional[str] = None
    image_urls: List[str] = []
    video_url: Optional[str] = None
    start_time: datetime
    end_time: Optional[datetime]
    location: Optional[str]
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: datetime
    attendees_count: Optional[int] = 0
    is_attending: Optional[bool] = False
    is_private: bool = False
    theme: Optional[str] = None
    profile_theme: Optional[ThemeSettings] = None
    gallery_images: List[str] = []
    gallery_videos: List[str] = []
    tagged_artist_ids: List[str] = []
    tagged_artists: Optional[List[Dict[str, Any]]] = None
    cover_focal_point: Optional[FocalPoint] = None
    requires_password: bool = False


class EventPublicResponse(BaseModel):
    event_id: str
    business: Optional["BusinessSummary"] = None
    artist: Optional[Dict[str, Any]] = None
    title: str
    description: Optional[str]
    cover_image_url: Optional[str] = None
    image_urls: List[str] = []
    video_url: Optional[str] = None
    start_time: datetime
    end_time: Optional[datetime]
    location: Optional[str]
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: datetime
    attendees_count: int = 0
    is_private: bool = False
    theme: Optional[str] = None
    profile_theme: Optional[ThemeSettings] = None
    gallery_images: List[str] = []
    gallery_videos: List[str] = []
    tagged_artist_ids: List[str] = []
    tagged_artists: Optional[List[Dict[str, Any]]] = None
    cover_focal_point: Optional[FocalPoint] = None
    requires_password: bool = False


class EventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    cover_image_url: Optional[str] = None
    image_urls: Optional[List[str]] = None
    video_url: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    theme: Optional[str] = None
    profile_theme: Optional[ThemeSettings] = None
    gallery_images: Optional[List[str]] = None
    gallery_videos: Optional[List[str]] = None
    is_private: Optional[bool] = None
    password: Optional[str] = None
    tagged_artist_ids: Optional[List[str]] = None
    cover_focal_point: Optional[FocalPoint] = None


class EventAttendRequest(BaseModel):
    password: Optional[str] = None


# Forward reference resolution
from models.business import BusinessSummary
EventResponse.model_rebuild()
