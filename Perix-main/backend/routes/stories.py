"""Stories routes."""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
import logging
import random
from datetime import timedelta

from database import db
from models.story import (
    StoryCreate, StoryResponse, StoryUpdate, GroupedStoryResponse,
    StoryReactionCreate, StoryReactionResponse, STORY_REACTIONS, STORY_EXPIRY_HOURS,
)
from utils.helpers import generate_id, now_utc
from models.user import UserPublic
from routes.dependencies import get_current_user, resolve_actor, build_user_public

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/stories", tags=["Stories"])


async def _batch_fetch_actor_info(stories: list) -> dict:
    user_ids = set()
    business_ids = set()
    artist_ids = set()
    for s in stories:
        actor_type = s.get("actor_type", "user")
        actor_id = s.get("actor_id", s.get("user_id"))
        if actor_type == "user":
            user_ids.add(actor_id)
        elif actor_type == "business":
            business_ids.add(actor_id)
        elif actor_type == "artist":
            artist_ids.add(actor_id)

    actor_map = {}
    if user_ids:
        users = await db.users.find(
            {"user_id": {"$in": list(user_ids)}},
            {"user_id": 1, "name": 1, "profile_photo": 1, "picture": 1},
        ).to_list(len(user_ids))
        for u in users:
            actor_map[("user", u["user_id"])] = {
                "name": u.get("name"),
                "avatar": u.get("profile_photo") or u.get("picture"),
            }
    if business_ids:
        businesses = await db.businesses.find(
            {"business_id": {"$in": list(business_ids)}},
            {"business_id": 1, "name": 1, "logo_image": 1},
        ).to_list(len(business_ids))
        for b in businesses:
            actor_map[("business", b["business_id"])] = {
                "name": b.get("name"),
                "avatar": b.get("logo_image"),
            }
    if artist_ids:
        artists = await db.artists.find(
            {"artist_id": {"$in": list(artist_ids)}},
            {"artist_id": 1, "name": 1, "profile_photo": 1},
        ).to_list(len(artist_ids))
        for a in artists:
            actor_map[("artist", a["artist_id"])] = {
                "name": a.get("name"),
                "avatar": a.get("profile_photo"),
            }
    return actor_map


async def _batch_fetch_story_stats(story_ids: list, current_user_id: str) -> dict:
    stats = {sid: {"view_count": 0, "reaction_count": 0, "has_reacted": False} for sid in story_ids}
    if not story_ids:
        return stats

    try:
        view_counts = await db.story_views.aggregate([
            {"$match": {"story_id": {"$in": story_ids}}},
            {"$group": {"_id": "$story_id", "count": {"$sum": 1}}},
        ]).to_list(len(story_ids))
    except Exception:
        views = await db.story_views.find({"story_id": {"$in": story_ids}}, {"story_id": 1}).to_list(1000)
        counts: dict = {}
        for v in views: counts[v["story_id"]] = counts.get(v["story_id"], 0) + 1
        view_counts = [{"_id": sid, "count": c} for sid, c in counts.items()]
    for vc in view_counts:
        stats[vc["_id"]]["view_count"] = vc["count"]

    try:
        reaction_counts = await db.story_reactions.aggregate([
            {"$match": {"story_id": {"$in": story_ids}}},
            {"$group": {"_id": "$story_id", "count": {"$sum": 1}}},
        ]).to_list(len(story_ids))
    except Exception:
        reactions = await db.story_reactions.find({"story_id": {"$in": story_ids}}, {"story_id": 1}).to_list(1000)
        counts: dict = {}
        for r in reactions: counts[r["story_id"]] = counts.get(r["story_id"], 0) + 1
        reaction_counts = [{"_id": sid, "count": c} for sid, c in counts.items()]
    for rc in reaction_counts:
        stats[rc["_id"]]["reaction_count"] = rc["count"]

    reacted = await db.story_reactions.find(
        {"story_id": {"$in": story_ids}, "user_id": current_user_id},
        {"story_id": 1},
    ).to_list(len(story_ids))
    for r in reacted:
        stats[r["story_id"]]["has_reacted"] = True

    return stats


def _build_story_response_from_batch(story_doc: dict, actor_map: dict, stats: dict) -> StoryResponse:
    actor_type = story_doc.get("actor_type", "user")
    actor_id = story_doc.get("actor_id", story_doc.get("user_id"))
    story_id = story_doc.get("story_id", "")

    actor_info = actor_map.get((actor_type, actor_id), {})
    story_stats = stats.get(story_id, {})

    return StoryResponse(
        story_id=story_id,
        user_id=story_doc.get("user_id", actor_id),
        actor_type=actor_type,
        actor_id=actor_id,
        media_url=story_doc.get("media_url", ""),
        media_type=story_doc.get("media_type", "image"),
        text=story_doc.get("text"),
        created_at=story_doc.get("created_at", ""),
        expires_at=story_doc.get("expires_at", ""),
        is_hidden=story_doc.get("is_hidden", False),
        view_count=story_stats.get("view_count", 0),
        reaction_count=story_stats.get("reaction_count", 0),
        has_reacted=story_stats.get("has_reacted", False),
        author_name=actor_info.get("name"),
        author_avatar=actor_info.get("avatar"),
        mux_asset_id=story_doc.get("mux_asset_id"),
        mux_playback_id=story_doc.get("mux_playback_id"),
        mux_thumbnail_url=story_doc.get("mux_thumbnail_url"),
        video_status=story_doc.get("video_status"),
    )


async def build_story_response(story_doc: dict, current_user_id: str) -> StoryResponse:
    actor_map = await _batch_fetch_actor_info([story_doc])
    stats = await _batch_fetch_story_stats([story_doc["story_id"]], current_user_id)
    return _build_story_response_from_batch(story_doc, actor_map, stats)


@router.post("", response_model=StoryResponse)
async def create_story(body: StoryCreate, current_user: UserPublic = Depends(get_current_user)):
    actor = await resolve_actor(body.actor_type, None, current_user)
    actor_type = actor["actor_type"]
    actor_id = actor["actor_id"]
    now = now_utc()
    expires_at = now + timedelta(hours=STORY_EXPIRY_HOURS)

    story_doc = {
        "story_id": generate_id("story"),
        "user_id": current_user.user_id,
        "actor_type": actor_type,
        "actor_id": actor_id,
        "media_url": body.media_url,
        "media_type": body.media_type,
        "text": body.text,
        "created_at": now.isoformat(),
        "expires_at": expires_at.isoformat(),
        "is_hidden": False,
        "mux_upload_id": body.mux_upload_id,
        "mux_asset_id": body.mux_asset_id,
        "mux_playback_id": body.mux_playback_id,
        "mux_thumbnail_url": body.mux_thumbnail_url,
        "video_status": body.video_status,
    }

    await db.stories.insert_one(story_doc)
    return await build_story_response(story_doc, current_user.user_id)


@router.get("", response_model=List[GroupedStoryResponse])
async def get_stories(current_user: UserPublic = Depends(get_current_user)):
    now = now_utc()
    cutoff = (now - timedelta(hours=STORY_EXPIRY_HOURS)).isoformat()

    try:
        await db.stories.delete_many({"expires_at": {"$lt": cutoff}, "is_hidden": False})
    except Exception:
        pass

    stories = await db.stories.find(
        {"is_hidden": False, "expires_at": {"$gte": cutoff}},
        sort=[("created_at", -1)],
    ).to_list(length=200)

    actor_map = await _batch_fetch_actor_info(stories)
    story_ids = [s["story_id"] for s in stories if "story_id" in s]
    stats = await _batch_fetch_story_stats(story_ids, current_user.user_id)

    grouped: dict = {}
    for s in stories:
        key = s.get("actor_id", s.get("user_id"))
        if key not in grouped:
            grouped[key] = {
                "user_id": s.get("user_id"),
                "actor_type": s.get("actor_type", "user"),
                "actor_id": s.get("actor_id", s.get("user_id")),
                "stories": [],
            }
        resp = _build_story_response_from_batch(s, actor_map, stats)
        grouped[key]["stories"].append(resp)

    result = []
    for actor_id, group in grouped.items():
        seen_ids = set()
        for sv in await db.story_views.find(
            {"user_id": current_user.user_id, "story_id": {"$in": [s.story_id for s in group["stories"]]}}
        ).to_list(length=100):
            seen_ids.add(sv.get("story_id"))
        has_unseen = any(s.story_id not in seen_ids for s in group["stories"])

        first = group["stories"][0] if group["stories"] else None
        result.append(GroupedStoryResponse(
            user_id=group["user_id"],
            actor_type=group["actor_type"],
            actor_id=group["actor_id"],
            author_name=first.author_name if first else None,
            author_avatar=first.author_avatar if first else None,
            stories=group["stories"],
            has_unseen=has_unseen,
        ))

    own_id = current_user.user_id
    unseen_groups = [g for g in result if g.has_unseen]
    seen_groups = [g for g in result if not g.has_unseen]
    random.shuffle(unseen_groups)
    random.shuffle(seen_groups)
    return unseen_groups + seen_groups


@router.get("/{story_id}", response_model=StoryResponse)
async def get_story(story_id: str, current_user: UserPublic = Depends(get_current_user)):
    story_doc = await db.stories.find_one({"story_id": story_id})
    if not story_doc or story_doc.get("is_hidden"):
        raise HTTPException(404, "Story not found")
    return await build_story_response(story_doc, current_user.user_id)


@router.post("/{story_id}/view")
async def view_story(story_id: str, current_user: UserPublic = Depends(get_current_user)):
    story_doc = await db.stories.find_one({"story_id": story_id})
    if not story_doc:
        raise HTTPException(404, "Story not found")

    if story_doc.get("actor_id") == current_user.user_id or story_doc.get("user_id") == current_user.user_id:
        return {"tracked": False, "reason": "self_view"}

    now = now_utc()
    existing = await db.story_views.find_one({
        "story_id": story_id,
        "user_id": current_user.user_id,
    })
    if not existing:
        await db.story_views.insert_one({
            "story_id": story_id,
            "user_id": current_user.user_id,
            "viewed_at": now.isoformat(),
        })
    return {"success": True}


@router.post("/{story_id}/react", response_model=StoryReactionResponse)
async def react_to_story(story_id: str, body: StoryReactionCreate, current_user: UserPublic = Depends(get_current_user)):
    if body.emoji not in STORY_REACTIONS:
        raise HTTPException(422, f"Invalid emoji. Allowed: {STORY_REACTIONS}")

    story_doc = await db.stories.find_one({"story_id": story_id})
    if not story_doc:
        raise HTTPException(404, "Story not found")

    await db.story_reactions.update_one(
        {"story_id": story_id, "user_id": current_user.user_id},
        {"$set": {"emoji": body.emoji, "created_at": now_utc().isoformat()}},
        upsert=True,
    )
    return StoryReactionResponse(success=True, emoji=body.emoji)


@router.delete("/{story_id}")
async def delete_story(story_id: str, current_user: UserPublic = Depends(get_current_user)):
    story_doc = await db.stories.find_one({"story_id": story_id})
    if not story_doc:
        raise HTTPException(404, "Story not found")

    is_owner = story_doc.get("user_id") == current_user.user_id or story_doc.get("actor_id") == current_user.user_id
    if not is_owner:
        raise HTTPException(403, "Not your story")

    await db.stories.delete_one({"story_id": story_id})
    await db.story_views.delete_many({"story_id": story_id})
    await db.story_reactions.delete_many({"story_id": story_id})
    return {"success": True}


@router.patch("/{story_id}", response_model=StoryResponse)
async def update_story(story_id: str, body: StoryUpdate, current_user: UserPublic = Depends(get_current_user)):
    story_doc = await db.stories.find_one({"story_id": story_id})
    if not story_doc:
        raise HTTPException(404, "Story not found")

    is_owner = story_doc.get("user_id") == current_user.user_id or story_doc.get("actor_id") == current_user.user_id
    if not is_owner:
        raise HTTPException(403, "Not your story")

    update_fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if update_fields:
        await db.stories.update_one({"story_id": story_id}, {"$set": update_fields})
        story_doc.update(update_fields)

    return await build_story_response(story_doc, current_user.user_id)


@router.get("/my-stories", response_model=List[StoryResponse])
async def get_my_stories(actor_type: str = "user", current_user: UserPublic = Depends(get_current_user)):
    actor = await resolve_actor(actor_type, None, current_user)
    at = actor["actor_type"]
    aid = actor["actor_id"]
    now = now_utc()
    cutoff = (now - timedelta(hours=STORY_EXPIRY_HOURS)).isoformat()

    stories = await db.stories.find(
        {"actor_id": aid, "actor_type": at, "is_hidden": False, "expires_at": {"$gte": cutoff}},
        sort=[("created_at", -1)],
    ).to_list(length=100)

    actor_map = await _batch_fetch_actor_info(stories)
    story_ids = [s["story_id"] for s in stories]
    stats = await _batch_fetch_story_stats(story_ids, current_user.user_id)
    return [_build_story_response_from_batch(s, actor_map, stats) for s in stories]


@router.get("/{story_id}/reactions")
async def get_story_reactions(story_id: str, current_user: UserPublic = Depends(get_current_user)):
    story_doc = await db.stories.find_one({"story_id": story_id})
    if not story_doc:
        raise HTTPException(404, "Story not found")

    is_owner = story_doc.get("user_id") == current_user.user_id or story_doc.get("actor_id") == current_user.user_id
    if not is_owner:
        raise HTTPException(403, "Not your story")

    reactions = await db.story_reactions.find({"story_id": story_id}).to_list(length=100)
    reactor_ids = list({r.get("user_id") for r in reactions if r.get("user_id")})
    user_map = {}
    if reactor_ids:
        users = await db.users.find(
            {"user_id": {"$in": reactor_ids}},
            {"name": 1, "profile_photo": 1, "picture": 1},
        ).to_list(len(reactor_ids))
        user_map = {u["user_id"]: u for u in users}

    result = []
    for r in reactions:
        u = user_map.get(r.get("user_id"))
        result.append({
            "user_id": r.get("user_id"),
            "emoji": r.get("emoji"),
            "user_name": u.get("name") if u else None,
            "user_avatar": (u.get("profile_photo") or u.get("picture")) if u else None,
        })
    return {"reactions": result, "total": len(result)}
