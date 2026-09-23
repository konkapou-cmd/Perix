"""Story analytics models."""
from pydantic import BaseModel
from typing import Optional, List, Dict, Any


class StorySeenRequest(BaseModel):
    watch_duration: Optional[float] = None
    completed: Optional[bool] = None


class StorySeenResponse(BaseModel):
    success: bool = True
    tracked: bool = True
    reason: Optional[str] = None


class StoryAnalyticsResponse(BaseModel):
    story_id: str
    total_views: int
    unique_viewers: int
    completion_rate: float
    average_watch_time: float
    reactions: Dict[str, int]
    top_viewers: List[Dict[str, Any]]
    views_timeline: List[Dict[str, Any]]


class StoryViewersResponse(BaseModel):
    viewers: List[Dict[str, Any]]
    total: int
    has_more: bool


class ActorAnalyticsResponse(BaseModel):
    total_stories: int
    total_views: int
    total_reactions: int
    average_completion_rate: float
    stories: List[Dict[str, Any]]
