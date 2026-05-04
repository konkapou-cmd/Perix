"""Activity-related Pydantic models."""
from pydantic import BaseModel, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime
from models.user import ThemeSettings


# Predefined activity themes with emojis
ACTIVITY_THEMES = {
    "birthday": {"emoji": "🎂", "label": "Birthday Party", "color": "#ec4899"},
    "dinner": {"emoji": "🍽️", "label": "Dinner", "color": "#f59e0b"},
    "cinema": {"emoji": "🎬", "label": "Cinema Night", "color": "#6366f1"},
    "party": {"emoji": "🎉", "label": "Party", "color": "#8b5cf6"},
    "sports": {"emoji": "🏃", "label": "Sports", "color": "#10b981"},
    "coffee": {"emoji": "☕", "label": "Coffee/Hangout", "color": "#78350f"},
    "travel": {"emoji": "✈️", "label": "Travel", "color": "#0ea5e9"},
    "game": {"emoji": "🎮", "label": "Game Night", "color": "#dc2626"},
    "music": {"emoji": "🎵", "label": "Concert/Music", "color": "#7c3aed"},
    "outdoor": {"emoji": "🏕️", "label": "Outdoor Activity", "color": "#059669"},
    "custom": {"emoji": "✨", "label": "Custom", "color": "#6b7280"},
}

# Activity profile themes (profile design customization)
ACTIVITY_PROFILE_THEMES = [
    {"name": "Birthday Pink", "background": "#fff0f5", "primary": "#ec4899", "text": "#831843"},
    {"name": "Dinner Gold", "background": "#fefce8", "primary": "#f59e0b", "text": "#713f12"},
    {"name": "Cinema Blue", "background": "#eff6ff", "primary": "#6366f1", "text": "#1e3a8a"},
    {"name": "Party Purple", "background": "#faf5ff", "primary": "#8b5cf6", "text": "#581c87"},
    {"name": "Sports Green", "background": "#f0fdf4", "primary": "#10b981", "text": "#14532d"},
]


class ActivityInvite(BaseModel):
    user_id: Optional[str] = None
    email: Optional[EmailStr] = None
    status: str


class TaggedBusinessInfo(BaseModel):
    business_id: str
    name: str
    logo_image: Optional[str] = None


class ActivityCreate(BaseModel):
    title: str
    description: Optional[str] = None
    date: str
    time: str
    location: str
    cover_image_url: Optional[str] = None
    image_urls: List[str] = []
    video_url: Optional[str] = None
    latitude: float
    longitude: float
    max_attendees: Optional[int] = None
    invite_emails: List[EmailStr] = []
    is_private: bool = False
    password: Optional[str] = None
    theme: Optional[str] = None
    custom_theme: Optional[str] = None
    gallery_images: List[str] = []
    gallery_videos: List[str] = []
    tagged_business_id: Optional[str] = None


class ActivityResponse(BaseModel):
    activity_id: str
    creator_id: str
    title: str
    description: Optional[str]
    date: str
    time: str
    location: str
    cover_image_url: Optional[str] = None
    image_urls: List[str] = []
    video_url: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    max_attendees: Optional[int]
    invites: List[ActivityInvite]
    created_at: datetime
    my_status: str
    is_creator: bool
    is_private: Optional[bool] = False
    invitation_code: Optional[str] = None
    password: Optional[str] = None
    theme: Optional[str] = None
    custom_theme: Optional[str] = None
    tagged_business: Optional[TaggedBusinessInfo] = None
    gallery_images: List[str] = []
    gallery_videos: List[str] = []
    profile_theme: Optional[ThemeSettings] = None
    creator: Optional[Dict[str, Any]] = None


class ActivityUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    location: Optional[str] = None
    cover_image_url: Optional[str] = None
    image_urls: Optional[List[str]] = None
    video_url: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    max_attendees: Optional[int] = None
    is_private: Optional[bool] = None
    password: Optional[str] = None
    theme: Optional[str] = None
    custom_theme: Optional[str] = None
    gallery_images: Optional[List[str]] = None
    gallery_videos: Optional[List[str]] = None
    tagged_business_id: Optional[str] = None


class ActivityRSVP(BaseModel):
    status: str
    password: Optional[str] = None


class JoinByCodeRequest(BaseModel):
    invitation_code: str
