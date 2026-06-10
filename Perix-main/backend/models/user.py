"""User-related Pydantic models."""
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Dict
from datetime import datetime


class ThemeSettings(BaseModel):
    """User profile theme customization."""
    background_color: Optional[str] = None  # e.g., "#1a1a2e", "gradient:..."
    primary_color: Optional[str] = None     # Main accent color for buttons
    secondary_color: Optional[str] = None   # Secondary accent color
    text_color: Optional[str] = None        # Text color
    card_color: Optional[str] = None        # Card/box background
    gradient_start: Optional[str] = None    # Gradient start color
    gradient_end: Optional[str] = None      # Gradient end color
    use_gradient: bool = False              # Whether to use gradient background
    font_family: Optional[str] = None      # Font family for profile text
    font_weight: Optional[str] = None        # Font weight
    font_style: Optional[str] = None        # Font style
    letter_spacing: Optional[float] = None  # Letter spacing
    text_transform: Optional[str] = None     # Text transform
    gallery_card_color: Optional[str] = None # Gallery card background
    info_card_color: Optional[str] = None   # Info card background
    action_button_color: Optional[str] = None # Action button color
    border_color: Optional[str] = None      # Border color


class GalleryItem(BaseModel):
    """Gallery item with URL and optional caption."""
    url: str
    caption: Optional[str] = None


class UserPublic(BaseModel):
    user_id: str
    email: EmailStr
    name: str
    picture: Optional[str] = None
    created_at: datetime
    gallery_images: List[str] = []  # Legacy: list of URLs
    gallery_videos: List[str] = []  # Legacy: list of URLs
    gallery_items: List[GalleryItem] = []  # New: images with captions
    video_items: List[GalleryItem] = []  # New: videos with captions
    profile_photo: Optional[str] = None
    cover_photo: Optional[str] = None
    bio: Optional[str] = None
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    friends: List[dict] = []  # [{"entity_type": "user"|"business"|"artist", "entity_id": str}, ...]
    theme: Optional[ThemeSettings] = None  # Profile theme customization
    is_admin: bool = False  # Admin flag
    role: str = "user"  # "user" | "business"


class RegisterInput(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=4, max_length=128)
    role: str = "user"  # "user" | "business"
    city: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    root_category: Optional[str] = None
    subcategory: Optional[str] = None
    business_name: Optional[str] = None


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class UpgradeToBusinessInput(BaseModel):
    root_category: str
    subcategory: str
    business_name: Optional[str] = None


class ChangePasswordInput(BaseModel):
    current_password: str
    new_password: str = Field(min_length=4, max_length=128)


class GoogleSessionInput(BaseModel):
    session_id: str


class AuthResponse(BaseModel):
    user: UserPublic
    session_token: str
    business: Optional[Dict] = None


class UserPublicProfile(BaseModel):
    user: UserPublic
    posts: List["PostResponse"] = []


class FriendCommonResponse(BaseModel):
    common: List[UserPublic]
    is_friend: bool


class FriendEntry(BaseModel):
    """A single friend entry with entity type and ID."""
    entity_type: str  # "user" | "business" | "artist"
    entity_id: str


class GalleryUpdate(BaseModel):
    images: List[str] = []
    videos: List[str] = []
    remove_images: List[str] = []
    remove_videos: List[str] = []
    # New: add items with captions
    image_items: List[GalleryItem] = []
    video_items: List[GalleryItem] = []


class GalleryCaptionUpdate(BaseModel):
    """Update caption for a gallery item."""
    url: str
    caption: str
    item_type: str = "image"  # "image" or "video"


class ProfileMediaUpdate(BaseModel):
    profile_photo: Optional[str] = None
    cover_photo: Optional[str] = None


class ProfileInfoUpdate(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class ThemeUpdate(BaseModel):
    """Update profile theme settings."""
    background_color: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    text_color: Optional[str] = None
    card_color: Optional[str] = None
    gradient_start: Optional[str] = None
    gradient_end: Optional[str] = None
    use_gradient: bool = False
    font_family: Optional[str] = None
    font_weight: Optional[str] = None
    font_style: Optional[str] = None
    letter_spacing: Optional[float] = None
    text_transform: Optional[str] = None
    gallery_card_color: Optional[str] = None
    info_card_color: Optional[str] = None
    action_button_color: Optional[str] = None
    border_color: Optional[str] = None


class UserAttendanceResponse(BaseModel):
    upcoming_events: List["EventResponse"] = []
    past_events: List["EventResponse"] = []


# Forward references will be resolved when models are imported
from models.post import PostResponse
from models.event import EventResponse
UserPublicProfile.model_rebuild()
UserAttendanceResponse.model_rebuild()
