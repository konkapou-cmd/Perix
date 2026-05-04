"""Artist-related Pydantic models."""
from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime
from models.user import ThemeSettings
from models.post import PostResponse


class ArtistCreate(BaseModel):
    name: str
    bio: Optional[str] = None
    genres: List[str] = []
    socials: Dict[str, str] = {}
    town: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    gallery_images: List[str] = []
    fan_gallery: List[str] = []
    video_urls: List[str] = []
    profile_photo: Optional[str] = None
    cover_photo: Optional[str] = None


class ArtistResponse(BaseModel):
    artist_id: str
    owner_id: str
    name: str
    bio: Optional[str]
    genres: List[str]
    socials: Dict[str, str]
    town: Optional[str]
    address: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    gallery_images: List[str]
    fan_gallery: List[str]
    video_urls: List[str]
    profile_photo: Optional[str] = None
    cover_photo: Optional[str] = None
    created_at: datetime
    followers_count: int = 0
    theme: Optional[ThemeSettings] = None  # Profile theme customization


class ArtistUpdate(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    genres: Optional[List[str]] = None
    socials: Optional[Dict[str, str]] = None
    town: Optional[str] = None
    address: Optional[str] = None
    gallery_images: Optional[List[str]] = None
    fan_gallery: Optional[List[str]] = None
    video_urls: Optional[List[str]] = None
    profile_photo: Optional[str] = None
    cover_photo: Optional[str] = None
    hidden_fan_posts: Optional[List[str]] = None


class ArtistDetailResponse(BaseModel):
    artist: ArtistResponse
    events: List["EventResponse"] = []
    posts: List["PostResponse"] = []


class BookingRequestCreate(BaseModel):
    event_date: Optional[datetime] = None
    message: str
    contact_email: Optional[str] = None


class BookingRequestResponse(BaseModel):
    request_id: str
    artist_id: str
    requester_id: str
    event_date: Optional[datetime]
    message: str
    contact_email: Optional[str]
    status: str
    created_at: datetime


# Forward reference resolution
from models.event import EventResponse
from models.post import PostResponse
ArtistDetailResponse.model_rebuild()
