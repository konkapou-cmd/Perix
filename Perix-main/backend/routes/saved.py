"""Saved items routes - toggle save/bookmark and list saved items."""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List, Dict, Any
from datetime import datetime

import database
from database import db
from models.user import UserPublic
from models.saved import SavedItemCreate, SavedItemResponse, SavedToggleResponse, SavedListResponse
from utils.helpers import generate_id, now_utc
from routes.dependencies import get_current_user


router = APIRouter(prefix="/saved", tags=["Saved Items"])

VALID_TYPES = {"event", "activity", "job", "post", "business", "user", "rental"}


@router.post("/toggle", response_model=SavedToggleResponse)
async def toggle_saved(
    payload: SavedItemCreate,
    current_user: UserPublic = Depends(get_current_user),
):
    if payload.item_type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid item_type. Must be one of {VALID_TYPES}")

    existing = await db.saved_items.find_one(
        {"user_id": current_user.user_id, "item_type": payload.item_type, "item_id": payload.item_id},
        {"_id": 0},
    )

    if existing:
        await db.saved_items.delete_one({"saved_id": existing["saved_id"]})
        return SavedToggleResponse(is_saved=False)
    else:
        saved_doc = {
            "saved_id": generate_id("saved"),
            "user_id": current_user.user_id,
            "item_type": payload.item_type,
            "item_id": payload.item_id,
            "created_at": now_utc(),
        }
        await db.saved_items.insert_one(saved_doc)
        return SavedToggleResponse(is_saved=True)


@router.get("/check")
async def check_saved(
    item_type: str = Query(...),
    item_id: str = Query(...),
    current_user: UserPublic = Depends(get_current_user),
):
    if item_type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid item_type. Must be one of {VALID_TYPES}")

    existing = await db.saved_items.find_one(
        {"user_id": current_user.user_id, "item_type": item_type, "item_id": item_id},
        {"_id": 0},
    )
    return {"is_saved": existing is not None}


@router.get("/batch-check")
async def batch_check_saved(
    item_type: str = Query(...),
    item_ids: str = Query(...),
    current_user: UserPublic = Depends(get_current_user),
):
    if item_type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid item_type. Must be one of {VALID_TYPES}")

    ids = [x.strip() for x in item_ids.split(",") if x.strip()]
    cursor = db.saved_items.find(
        {"user_id": current_user.user_id, "item_type": item_type, "item_id": {"$in": ids}},
        {"_id": 0, "item_id": 1},
    )
    saved = await cursor.to_list(length=len(ids))
    saved_ids = {s["item_id"] for s in saved}
    return {"saved_ids": list(saved_ids)}


@router.get("", response_model=SavedListResponse)
async def list_saved(
    item_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: UserPublic = Depends(get_current_user),
):
    query: Dict[str, Any] = {"user_id": current_user.user_id}
    if item_type:
        if item_type not in VALID_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid item_type. Must be one of {VALID_TYPES}")
        query["item_type"] = item_type

    total = await db.saved_items.count_documents(query)
    cursor = db.saved_items.find(query, {"_id": 0}).sort("created_at", -1).skip(offset).limit(limit)
    docs = await cursor.to_list(length=limit)

    items_with_data = []
    for doc in docs:
        item_data = await _fetch_item_data(doc["item_type"], doc["item_id"])
        items_with_data.append(
            SavedItemResponse(
                saved_id=doc["saved_id"],
                user_id=doc["user_id"],
                item_type=doc["item_type"],
                item_id=doc["item_id"],
                created_at=doc["created_at"],
                item_data=item_data,
            )
        )

    return SavedListResponse(items=items_with_data, total=total)


async def _fetch_item_data(item_type: str, item_id: str) -> Optional[Dict[str, Any]]:
    if item_type == "event":
        doc = await db.events.find_one({"event_id": item_id}, {"_id": 0})
        if doc:
            return {
                "title": doc.get("title"),
                "cover_image_url": doc.get("cover_image_url"),
                "start_time": doc.get("start_time"),
                "location": doc.get("location"),
                "business_id": doc.get("business_id"),
            }
    elif item_type == "activity":
        doc = await db.activities.find_one({"activity_id": item_id}, {"_id": 0})
        if doc:
            return {
                "title": doc.get("title"),
                "cover_image_url": doc.get("cover_image_url"),
                "date": doc.get("date"),
                "location": doc.get("location"),
            }
    elif item_type == "job":
        doc = await db.jobs.find_one({"job_id": item_id}, {"_id": 0})
        if doc:
            return {
                "title": doc.get("title"),
                "business_id": doc.get("business_id"),
                "job_type": doc.get("job_type"),
                "salary_range": doc.get("salary_range"),
                "location": doc.get("location"),
            }
    elif item_type == "post":
        doc = await db.posts.find_one({"post_id": item_id}, {"_id": 0})
        if doc:
            return {
                "text": doc.get("text", "")[:100],
                "image_url": doc.get("image_url"),
                "actor_name": doc.get("actor_name"),
                "actor_avatar": doc.get("actor_avatar"),
            }
    elif item_type == "business":
        doc = await db.businesses.find_one({"business_id": item_id}, {"_id": 0})
        if doc:
            return {
                "name": doc.get("name"),
                "logo_image": doc.get("logo_image"),
                "category": doc.get("category"),
                "address": doc.get("address"),
            }
    elif item_type == "user":
        doc = await db.users.find_one({"user_id": item_id}, {"_id": 0, "password_hash": 0})
        if doc:
            return {
                "name": doc.get("name"),
                "cover_image_url": doc.get("cover_photo") or doc.get("picture"),
                "profile_photo": doc.get("profile_photo") or doc.get("picture"),
            }
    elif item_type == "rental":
        doc = await db.rentals.find_one({"rental_id": item_id}, {"_id": 0})
        if doc:
            return {
                "title": doc.get("title"),
                "cover_image": doc.get("cover_image"),
                "rent_price": doc.get("rent_price"),
                "address": doc.get("address"),
            }
    return None
