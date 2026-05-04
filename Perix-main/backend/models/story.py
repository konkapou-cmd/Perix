"""Story models."""
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class StoryCreate(BaseModel):
    media_url: Optional[str] = None
    media_type: str = "image"
    text: Optional[str] = None
    actor_type: str = "user"
    mux_upload_id: Optional[str] = None
    mux_asset_id: Optional[str] = None
    mux_playback_id: Optional[str] = None
    mux_thumbnail_url: Optional[str] = None
    video_status: Optional[str] = None


class StoryResponse(BaseModel):
    story_id: str
    user_id: str
    actor_type: str
    actor_id: str
    media_url: Optional[str] = None
    media_type: str = "image"
    text: Optional[str] = None
    created_at: str
    expires_at: str
    is_hidden: bool = False
    view_count: int = 0
    reaction_count: int = 0
    has_reacted: bool = False
    author_name: Optional[str] = None
    author_avatar: Optional[str] = None
    mux_asset_id: Optional[str] = None
    mux_playback_id: Optional[str] = None
    mux_thumbnail_url: Optional[str] = None
    video_status: Optional[str] = None


class GroupedStoryResponse(BaseModel):
    user_id: str
    actor_type: str
    actor_id: str
    author_name: Optional[str] = None
    author_avatar: Optional[str] = None
    stories: List[StoryResponse]
    has_unseen: bool = False


class StoryReactionCreate(BaseModel):
    emoji: str


class StoryUpdate(BaseModel):
    media_url: Optional[str] = None
    mux_upload_id: Optional[str] = None
    mux_asset_id: Optional[str] = None
    mux_playback_id: Optional[str] = None
    mux_thumbnail_url: Optional[str] = None
    video_status: Optional[str] = None


class StoryReactionResponse(BaseModel):
    success: bool
    emoji: str


STORY_REACTIONS = ["❤️", "😂", "😮", "😢", "👏", "🔥", "💯", "😍"]
STORY_EXPIRY_HOURS = 24
