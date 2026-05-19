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


@router.get("/{story_id}/analytics", response_model=StoryAnalyticsResponse)
async def get_story_analytics(story_id: str, current_user: UserPublic = Depends(get_current_user)):
    story_doc = await db.stories.find_one({"story_id": story_id})
    if not story_doc:
        raise HTTPException(404, "Story not found")

    views = await db.story_views.find({"story_id": story_id}).to_list(length=1000)
    total_views = len(views)
    unique_viewer_ids = list(set(v.get("user_id") for v in views if v.get("user_id")))
    unique_viewers = len(unique_viewer_ids)

    completed_count = sum(1 for v in views if v.get("completed"))
    completion_rate = completed_count / total_views if total_views > 0 else 0.0

    watch_times = [v.get("watch_duration", 0) or 0 for v in views]
    average_watch_time = sum(watch_times) / len(watch_times) if watch_times else 0.0

    reactions_docs = await db.story_reactions.find({"story_id": story_id}).to_list(length=100)
    reactions: dict = {}
    for r in reactions_docs:
        emoji = r.get("emoji", "")
        reactions[emoji] = reactions.get(emoji, 0) + 1

    top_ids = unique_viewer_ids[:10]
    viewer_docs = []
    if top_ids:
        users = await db.users.find(
            {"user_id": {"$in": top_ids}},
            {"name": 1, "profile_photo": 1, "picture": 1},
        ).to_list(len(top_ids))
        user_map = {u["user_id"]: u for u in users}
        for uid in top_ids:
            u = user_map.get(uid)
            viewer_docs.append({
                "user_id": uid,
                "name": u.get("name") if u else None,
                "avatar": (u.get("profile_photo") or u.get("picture")) if u else None,
            })

    timeline: list = []
    date_counts: dict = {}
    for v in views:
        viewed_at = v.get("viewed_at", "")
        if viewed_at:
            date_key = viewed_at[:10]
            date_counts[date_key] = date_counts.get(date_key, 0) + 1
    for date_str in sorted(date_counts.keys()):
        timeline.append({"date": date_str, "count": date_counts[date_str]})

    return StoryAnalyticsResponse(
        story_id=story_id,
        total_views=total_views,
        unique_viewers=unique_viewers,
        completion_rate=completion_rate,
        average_watch_time=average_watch_time,
        reactions=reactions,
        top_viewers=viewer_docs,
        views_timeline=timeline,
    )


@router.get("/{story_id}/viewers", response_model=StoryViewersResponse)
async def get_story_viewers(
    story_id: str,
    limit: int = Query(20, ge=1, le=100),
    skip: int = Query(0, ge=0),
    current_user: UserPublic = Depends(get_current_user),
):
    story_doc = await db.stories.find_one({"story_id": story_id})
    if not story_doc:
        raise HTTPException(404, "Story not found")

    grouped: list = []
    try:
        pipeline = [
            {"$match": {"story_id": story_id}},
            {"$sort": {"viewed_at": -1}},
            {"$group": {
                "_id": "$user_id",
                "viewed_at": {"$first": "$viewed_at"},
                "watch_duration": {"$first": "$watch_duration"},
                "completed": {"$first": "$completed"},
            }},
        ]
        grouped = await db.story_views.aggregate(pipeline).to_list(length=1000)
    except Exception:
        all_views = await db.story_views.find(
            {"story_id": story_id}, sort=[("viewed_at", -1)]
        ).to_list(length=5000)
        seen: dict = {}
        for v in all_views:
            uid = v.get("user_id")
            if uid and uid not in seen:
                seen[uid] = {
                    "_id": uid,
                    "viewed_at": v.get("viewed_at"),
                    "watch_duration": v.get("watch_duration"),
                    "completed": v.get("completed"),
                }
        grouped = list(seen.values())
    total = len(grouped)

    page = grouped[skip:skip + limit]
    viewer_ids = [v.get("_id") for v in page]
    user_map = {}
    if viewer_ids:
        users = await db.users.find(
            {"user_id": {"$in": viewer_ids}},
            {"name": 1, "profile_photo": 1, "picture": 1},
        ).to_list(len(viewer_ids))
        user_map = {u["user_id"]: u for u in users}

    viewers = []
    for v in page:
        uid = v.get("_id")
        u = user_map.get(uid)
        viewers.append({
            "user_id": uid,
            "name": u.get("name") if u else None,
            "avatar": (u.get("profile_photo") or u.get("picture")) if u else None,
            "viewed_at": v.get("viewed_at"),
            "watch_duration": v.get("watch_duration"),
            "completed": v.get("completed"),
        })

    has_more = (skip + limit) < total
    return StoryViewersResponse(viewers=viewers, total=total, has_more=has_more)


@router.get("/analytics", response_model=ActorAnalyticsResponse)
async def get_actor_analytics(
    actor_type: str = Query(..., description="user, business, or artist"),
    days: Optional[int] = Query(None, ge=1, le=90),
    current_user: UserPublic = Depends(get_current_user),
):
    valid_types = {"user", "business", "artist"}
    if actor_type not in valid_types:
        raise HTTPException(400, f"Invalid actor_type. Must be one of {valid_types}")

    actor = await resolve_actor(actor_type, None, current_user)
    at = actor["actor_type"]
    aid = actor["actor_id"]

    now = now_utc()
    cutoff = (now - timedelta(hours=STORY_EXPIRY_HOURS)).isoformat()

    query: dict = {"actor_id": aid, "actor_type": at, "is_hidden": False, "expires_at": {"$gte": cutoff}}
    if days:
        days_ago = (now - timedelta(days=days)).isoformat()
        query["created_at"] = {"$gte": days_ago}

    stories = await db.stories.find(query, sort=[("created_at", -1)]).to_list(length=100)
    story_ids = [s.get("story_id") for s in stories]

    view_counts_map = {}
    completed_counts_map = {}
    if story_ids:
        try:
            view_agg = await db.story_views.aggregate([
                {"$match": {"story_id": {"$in": story_ids}}},
                {"$group": {
                    "_id": "$story_id",
                    "total": {"$sum": 1},
                    "completed": {"$sum": {"$cond": [{"$eq": ["$completed", True]}, 1, 0]}},
                }},
            ]).to_list(len(story_ids))
        except Exception:
            views = await db.story_views.find({"story_id": {"$in": story_ids}}).to_list(5000)
            counts: dict = {}
            completed: dict = {}
            for v in views:
                sid = v["story_id"]
                counts[sid] = counts.get(sid, 0) + 1
                if v.get("completed"):
                    completed[sid] = completed.get(sid, 0) + 1
            view_agg = [{"_id": sid, "total": counts[sid], "completed": completed.get(sid, 0)} for sid in counts]
        for v in view_agg:
            view_counts_map[v["_id"]] = v["total"]
            completed_counts_map[v["_id"]] = v["completed"]

    reaction_counts_map = {}
    if story_ids:
        try:
            reaction_agg = await db.story_reactions.aggregate([
                {"$match": {"story_id": {"$in": story_ids}}},
                {"$group": {"_id": "$story_id", "total": {"$sum": 1}}},
            ]).to_list(len(story_ids))
        except Exception:
            reactions = await db.story_reactions.find({"story_id": {"$in": story_ids}}).to_list(5000)
            counts: dict = {}
            for r in reactions: counts[r["story_id"]] = counts.get(r["story_id"], 0) + 1
            reaction_agg = [{"_id": sid, "total": c} for sid, c in counts.items()]
        for r in reaction_agg:
            reaction_counts_map[r["_id"]] = r["total"]

    total_views = 0
    total_reactions = 0
    completion_sum = 0.0
    stories_with_views = 0
    stories_data = []

    for s in stories:
        sid = s.get("story_id")
        views_count = view_counts_map.get(sid, 0)
        reactions_count = reaction_counts_map.get(sid, 0)
        completed_views = completed_counts_map.get(sid, 0)
        rate = completed_views / views_count if views_count > 0 else 0.0

        total_views += views_count
        total_reactions += reactions_count
        completion_sum += rate
        if views_count > 0:
            stories_with_views += 1

        stories_data.append({
            "story_id": sid,
            "media_type": s.get("media_type", "image"),
            "created_at": s.get("created_at"),
            "views": views_count,
            "reactions": reactions_count,
            "completion_rate": rate,
        })

    avg_completion = completion_sum / stories_with_views if stories_with_views > 0 else 0.0

    return ActorAnalyticsResponse(
        total_stories=len(stories),
        total_views=total_views,
        total_reactions=total_reactions,
        average_completion_rate=avg_completion,
        stories=stories_data,
    )
