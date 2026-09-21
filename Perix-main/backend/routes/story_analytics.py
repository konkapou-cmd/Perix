"""Story analytics routes."""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
import logging
from datetime import timedelta

from database import db
from models.story_analytics import (
    StorySeenRequest, StorySeenResponse,
    StoryAnalyticsResponse, StoryViewersResponse,
    ActorAnalyticsResponse,
)
from models.story import STORY_EXPIRY_HOURS
from utils.helpers import now_utc
from models.user import UserPublic
from routes.dependencies import get_current_user, resolve_actor

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/story-analytics", tags=["Story Analytics"])


@router.post("/{story_id}/seen", response_model=StorySeenResponse)
async def mark_story_seen(story_id: str, body: Optional[StorySeenRequest] = None, current_user: UserPublic = Depends(get_current_user)):
    story_doc = await db.stories.find_one({"story_id": story_id})
    if not story_doc:
        raise HTTPException(404, "Story not found")

    if story_doc.get("actor_id") == current_user.user_id or story_doc.get("user_id") == current_user.user_id:
        return StorySeenResponse(success=True, tracked=False, reason="self_view")

    now = now_utc()
    update_fields = {
        "viewed_at": now.isoformat(),
    }
    if body:
        if body.watch_duration is not None:
            update_fields["watch_duration"] = body.watch_duration
        if body.completed is not None:
            update_fields["completed"] = body.completed

    existing = await db.story_views.find_one({
        "story_id": story_id,
        "user_id": current_user.user_id,
    })
    if existing:
        await db.story_views.update_one(
            {"story_id": story_id, "user_id": current_user.user_id},
            {"$set": update_fields},
        )
    else:
        await db.story_views.insert_one({
            "story_id": story_id,
            "user_id": current_user.user_id,
            **update_fields,
        })

    return StorySeenResponse(success=True, tracked=True)


