"""Post-related Pydantic models."""
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class PostCreate(BaseModel):
    text: str
    image_base64: Optional[str] = None  # Legacy - prefer image_url
    image_url: Optional[str] = None     # New - Cloudinary URL
    video_url: Optional[str] = None     # Mux playback URL
    mux_upload_id: Optional[str] = None
    mux_asset_id: Optional[str] = None
    mux_playback_id: Optional[str] = None
    mux_thumbnail_url: Optional[str] = None
    video_status: Optional[str] = "preparing"
    youtube_link: Optional[str] = None
    soundcloud_url: Optional[str] = None
    business_id: Optional[str] = None
    actor_type: Optional[str] = None
    actor_id: Optional[str] = None
    media_ratio: Optional[float] = None
    tagged_user_ids: List[str] = []
    tagged_business_ids: List[str] = []
    tagged_artist_ids: List[str] = []


class PostUpdate(BaseModel):
    text: Optional[str] = None
    image_base64: Optional[str] = None
    image_url: Optional[str] = None
    video_url: Optional[str] = None
    mux_upload_id: Optional[str] = None
    mux_asset_id: Optional[str] = None
    mux_playback_id: Optional[str] = None
    mux_thumbnail_url: Optional[str] = None
    video_status: Optional[str] = None
    media_ratio: Optional[float] = None
    tagged_user_ids: Optional[List[str]] = None
    tagged_business_ids: Optional[List[str]] = None
    tagged_artist_ids: Optional[List[str]] = None
    youtube_link: Optional[str] = None
    soundcloud_url: Optional[str] = None


class TaggedBusinessInfo(BaseModel):
    business_id: str
    name: str
    logo_image: Optional[str] = None


class BusinessPostInfo(BaseModel):
    name: str
    logo_image: Optional[str] = None
    theme: Optional["ThemeSettings"] = None


class PostResponse(BaseModel):
    post_id: str
    user_id: str
    business_id: Optional[str] = None
    actor_type: Optional[str] = None
    actor_id: Optional[str] = None
    actor_name: Optional[str] = None
    actor_avatar: Optional[str] = None
    media_ratio: Optional[float] = None
    tagged_user_ids: List[str] = []
    tagged_business_ids: List[str] = []
    tagged_artist_ids: List[str] = []
    tagged_business: Optional[TaggedBusinessInfo] = None
    text: str
    image_base64: Optional[str] = None  # Legacy - will be phased out
    image_url: Optional[str] = None     # New - Cloudinary URL
    video_url: Optional[str] = None     # Mux playback URL
    mux_asset_id: Optional[str] = None
    mux_playback_id: Optional[str] = None
    mux_thumbnail_url: Optional[str] = None
    video_status: Optional[str] = "preparing"
    youtube_link: Optional[str] = None
    soundcloud_url: Optional[str] = None
    created_at: datetime
    author: "UserPublic"
    business: Optional[BusinessPostInfo] = None
    likes_count: int = 0
    comments_count: int = 0
    liked_by_me: bool = False


class PostCommentCreate(BaseModel):
    text: str
    actor_type: Optional[str] = None
    actor_id: Optional[str] = None


class PostCommentResponse(BaseModel):
    comment_id: str
    user_id: str
    actor_type: Optional[str] = None
    actor_id: Optional[str] = None
    actor_name: Optional[str] = None
    actor_avatar: Optional[str] = None
    text: str
    created_at: datetime
    likes_count: int = 0
    liked_by_me: bool = False
    author: Optional["UserPublic"] = None


class PostCommentUpdate(BaseModel):
    text: str


class PostReaction(BaseModel):
    actor_type: Optional[str] = None
    actor_id: Optional[str] = None


# Forward reference resolution
from models.user import UserPublic, ThemeSettings
PostResponse.model_rebuild()
PostCommentResponse.model_rebuild()
BusinessPostInfo.model_rebuild()
