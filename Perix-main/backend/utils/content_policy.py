"""Post and gallery content policy (v18 -> v19), feature-flagged.

Every enforcement switch is OFF by default:
- POST_LIMITS_ENFORCEMENT=1   -> 3/12/24 active posts, v19 overflow rules
- POST_RETENTION_ENFORCEMENT=1 -> 30d (user actors) / 365d (business) expiry
- GALLERY_LIMITS_ENFORCEMENT=1 -> photos 3/12/30, videos 0/6/12 per plan
"""
import os
from datetime import timedelta
from typing import Optional, Tuple

from database import db
from utils.helpers import now_utc

POST_LIMITS_ENFORCEMENT = os.environ.get("POST_LIMITS_ENFORCEMENT", "0") == "1"
POST_RETENTION_ENFORCEMENT = os.environ.get("POST_RETENTION_ENFORCEMENT", "0") == "1"
GALLERY_LIMITS_ENFORCEMENT = os.environ.get("GALLERY_LIMITS_ENFORCEMENT", "0") == "1"

POST_LIMITS = {"free_user": 3, "premium_user": 12, "business": 24}
POST_RETENTION_DAYS = 30
BUSINESS_POST_RETENTION_DAYS = 365

GALLERY_PHOTO_LIMITS = {"free_user": 3, "premium_user": 12, "business": 30}
GALLERY_VIDEO_LIMITS = {"free_user": 0, "premium_user": 6, "business": 12}


def personal_plan(user_doc: Optional[dict]) -> str:
    plan = (user_doc or {}).get("account_plan")
    return plan if plan in ("free_user", "premium_user") else "free_user"


def post_expiry(actor_type: str):
    """Expiry timestamp for a new post, or None while retention is disabled."""
    if not POST_RETENTION_ENFORCEMENT:
        return None
    days = BUSINESS_POST_RETENTION_DAYS if actor_type == "business" else POST_RETENTION_DAYS
    return now_utc() + timedelta(days=days)


async def active_posts_count(actor_type: str, actor_id: str) -> int:
    now = now_utc()
    return await db.posts.count_documents({
        "actor_type": actor_type,
        "actor_id": actor_id,
        "is_hidden": {"$ne": True},
        "$or": [
            {"expires_at": {"$gt": now}},
            {"expires_at": None},
            {"expires_at": {"$exists": False}},
        ],
    })


async def post_limit_for(actor_type: str, user_doc: Optional[dict] = None) -> Optional[int]:
    if not POST_LIMITS_ENFORCEMENT:
        return None
    if actor_type == "business":
        return POST_LIMITS["business"]
    return POST_LIMITS[personal_plan(user_doc)]


async def enforce_post_creation(
    actor_type: str,
    actor_id: str,
    user_doc: Optional[dict] = None,
) -> str:
    """'ok' | 'reject' | 'replace' per the v19 overflow rules.

    All plans replace the oldest active post at the limit (v19: Free keeps
    3 at a time with replacement — the 4th replaces the 1st; Premium 12;
    Business 24) — the caller removes it only after the new post was
    inserted successfully.
    """
    if not POST_LIMITS_ENFORCEMENT:
        return "ok"
    limit = await post_limit_for(actor_type, user_doc)
    count = await active_posts_count(actor_type, actor_id)
    if count < limit:
        return "ok"
    return "replace"


async def retire_oldest_post(actor_type: str, actor_id: str) -> Optional[str]:
    """Delete the oldest active post (posts + home_posts snapshot).

    Media file cleanup stays deferred: shared assets must never be deleted
    while still referenced elsewhere.
    """
    now = now_utc()
    oldest = await db.posts.find_one(
        {
            "actor_type": actor_type,
            "actor_id": actor_id,
            "$or": [
                {"expires_at": {"$gt": now}},
                {"expires_at": None},
                {"expires_at": {"$exists": False}},
            ],
        },
        {"_id": 0, "post_id": 1},
        sort=[("created_at", 1)],
    )
    if not oldest:
        return None
    await db.posts.delete_one({"post_id": oldest["post_id"]})
    await db.home_posts.delete_one({"post_id": oldest["post_id"]})
    return oldest["post_id"]


def gallery_limits_for(plan: str) -> Optional[Tuple[int, int]]:
    if not GALLERY_LIMITS_ENFORCEMENT:
        return None
    return GALLERY_PHOTO_LIMITS.get(plan, 3), GALLERY_VIDEO_LIMITS.get(plan, 0)


def apply_gallery_limits(images, videos, plan: str):
    """Keep only the newest items within the plan limits (v18 D11:
    overflow replaces the oldest)."""
    if not GALLERY_LIMITS_ENFORCEMENT:
        return images, videos
    photo_limit = GALLERY_PHOTO_LIMITS.get(plan, 3)
    video_limit = GALLERY_VIDEO_LIMITS.get(plan, 0)
    kept_images = images[-photo_limit:] if len(images) > photo_limit else images
    kept_videos = videos[-video_limit:] if len(videos) > video_limit else videos
    return kept_images, kept_videos
