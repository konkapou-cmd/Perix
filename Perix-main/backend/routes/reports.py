"""User/content reporting routes."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from database import db
from models.user import UserPublic
from utils.helpers import generate_id, now_utc
from routes.dependencies import get_current_user

router = APIRouter(prefix="/reports", tags=["Reports"])

TARGET_COLLECTIONS = {
    "post": ("posts", "post_id"),
    "comment": (None, None),  # comments live inside posts
    "event": ("events", "event_id"),
    "activity": ("activities", "activity_id"),
    "job": ("jobs", "job_id"),
    "service": ("services", "service_id"),
    "listing": ("listings", "listing_id"),
    "story": ("stories", "story_id"),
    "business": ("businesses", "business_id"),
    "artist": ("artists", "artist_id"),
    "user": ("users", "user_id"),
}

AUTO_HIDE_THRESHOLD = 2  # distinct reporters before auto-hiding content


class ContentReportRequest(BaseModel):
    target_type: str
    target_id: str
    reason: str = "other"


@router.get("/my-status")
async def get_my_report_status(
    target_type: str,
    target_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    """Whether the current user has already reported this target."""
    existing = await db.reports.find_one({
        "reporter_id": current_user.user_id,
        "target_type": target_type,
        "target_id": target_id,
    })
    return {"reported": existing is not None}


@router.post("/content")
async def report_content(
    payload: ContentReportRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    """Report any piece of content. After enough distinct reports the content
    is hidden automatically pending admin review."""
    if payload.target_type not in TARGET_COLLECTIONS:
        raise HTTPException(status_code=400, detail="Invalid target type")

    collection, id_field = TARGET_COLLECTIONS[payload.target_type]
    if collection is not None:
        doc = await db[collection].find_one({id_field: payload.target_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Content not found")

    # De-duplicate: one report per user per target
    existing = await db.reports.find_one({
        "reporter_id": current_user.user_id,
        "target_type": payload.target_type,
        "target_id": payload.target_id,
    })
    if existing:
        raise HTTPException(status_code=400, detail="You have already reported this content")

    report_doc = {
        "report_id": generate_id("report"),
        "reporter_id": current_user.user_id,
        "target_type": payload.target_type,
        "target_id": payload.target_id,
        "reason": payload.reason,
        "reported_at": now_utc(),
        "status": "pending",
        "source": "manual",
    }
    await db.reports.insert_one(report_doc)

    # Auto-hide after threshold of distinct reporters
    if collection is not None:
        distinct = await db.reports.distinct("reporter_id", {
            "target_type": payload.target_type,
            "target_id": payload.target_id,
        })
        if len(distinct) >= AUTO_HIDE_THRESHOLD:
            await db[collection].update_one(
                {id_field: payload.target_id},
                {"$set": {"is_hidden": True, "hidden_reason": "reported", "hidden_at": now_utc()}},
            )

    return {"report_id": report_doc["report_id"], "status": "pending"}


def create_auto_report(reporter_id: str, target_type: str, target_id: str, reason: str):
    """Helper used by the moderation pipeline (fire-and-forget)."""
    return db.reports.insert_one({
        "report_id": generate_id("report"),
        "reporter_id": reporter_id,
        "target_type": target_type,
        "target_id": target_id,
        "reason": reason,
        "reported_at": now_utc(),
        "status": "pending",
        "source": "auto_moderation",
    })
