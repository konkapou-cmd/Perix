"""User listing routes (products and home rentals)."""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from database import db
from models.user import UserPublic
from models.listing import ListingCreate, ListingUpdate, ListingResponse
from utils.helpers import generate_id, now_utc
from routes.dependencies import get_current_user

router = APIRouter(prefix="/listings", tags=["Listings"])


@router.post("", response_model=ListingResponse)
async def create_listing(
    payload: ListingCreate,
    current_user: UserPublic = Depends(get_current_user),
):
    if payload.listing_type not in ("product", "home_rental"):
        raise HTTPException(status_code=400, detail="listing_type must be 'product' or 'home_rental'")

    doc = {
        **payload.model_dump(),
        "listing_id": generate_id("lst"),
        "owner_id": current_user.user_id,
        "is_active": True,
        "created_at": now_utc(),
    }
    await db.listings.insert_one(doc)
    return ListingResponse(**doc)


@router.get("", response_model=list[ListingResponse])
async def list_listings(
    listing_type: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 50,
    min_lat: Optional[float] = None,
    max_lat: Optional[float] = None,
    min_lng: Optional[float] = None,
    max_lng: Optional[float] = None,
):
    query = {"is_active": True, "status": "published"}
    if listing_type:
        query["listing_type"] = listing_type

    # Optional geo filtering for home rentals
    if listing_type == "home_rental":
        has_bounds = all(
            value is not None
            for value in (min_lat, max_lat, min_lng, max_lng)
        )
        if has_bounds:
            query["latitude"] = {"$gte": min_lat, "$lte": max_lat}
            query["longitude"] = {"$gte": min_lng, "$lte": max_lng}

    cursor = db.listings.find(query).skip(skip).limit(limit).sort("created_at", -1)
    docs = await cursor.to_list(limit)
    return [ListingResponse(**doc) for doc in docs]


@router.get("/my", response_model=list[ListingResponse])
async def list_my_listings(
    listing_type: Optional[str] = None,
    status: Optional[str] = None,
    current_user: UserPublic = Depends(get_current_user),
):
    query = {"owner_id": current_user.user_id}
    if listing_type:
        query["listing_type"] = listing_type
    if status:
        query["status"] = status

    docs = await db.listings.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [ListingResponse(**doc) for doc in docs]


@router.get("/{listing_id}", response_model=ListingResponse)
async def get_listing(listing_id: str):
    doc = await db.listings.find_one(
        {"listing_id": listing_id, "status": "published", "is_active": True},
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Listing not found")
    return ListingResponse(**doc)


@router.put("/{listing_id}", response_model=ListingResponse)
async def update_listing(
    listing_id: str,
    payload: ListingUpdate,
    current_user: UserPublic = Depends(get_current_user),
):
    doc = await db.listings.find_one({"listing_id": listing_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Listing not found")
    if doc["owner_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    update_data = payload.model_dump(exclude_unset=True)
    if update_data:
        await db.listings.update_one(
            {"listing_id": listing_id},
            {"$set": update_data},
        )

    doc = await db.listings.find_one({"listing_id": listing_id})
    return ListingResponse(**doc)


@router.delete("/{listing_id}")
async def delete_listing(
    listing_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    doc = await db.listings.find_one({"listing_id": listing_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Listing not found")
    if doc["owner_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    await db.listings.update_one(
        {"listing_id": listing_id},
        {"$set": {"is_active": False}},
    )
    return {"status": "deleted"}
