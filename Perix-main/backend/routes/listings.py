"""User listing routes (products and home rentals)."""
import math
import re
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from database import db
from models.user import UserPublic
from models.listing import ListingCreate, ListingUpdate, ListingResponse, LocationVisibility
from utils.helpers import generate_id, now_utc
from routes.dependencies import get_current_user

router = APIRouter(prefix="/listings", tags=["Listings"])

FUZZ_FACTOR = 0.01  # ~1km area
SEARCHABLE_FIELDS = ["title", "description", "category", "brand", "public_location_label"]


def fuzz_coordinate(value: float) -> float:
    return math.floor(value / FUZZ_FACTOR) * FUZZ_FACTOR + (FUZZ_FACTOR / 2)


def escape_regex(text: str) -> str:
    return re.escape(text)


def public_listing_location(doc: dict) -> dict:
    result = dict(doc)

    visibility = (
        result.get("location_visibility")
        or "approximate"
    )
    result["location_visibility"] = visibility

    if visibility == "approximate":
        result["address"] = (
            result.get("public_location_label")
            or "Approximate location"
        )

        lat = result.get("latitude")
        lng = result.get("longitude")

        if lat is not None and lng is not None:
            result["latitude"] = fuzz_coordinate(lat)
            result["longitude"] = fuzz_coordinate(lng)
        else:
            result["latitude"] = None
            result["longitude"] = None

    return result


def validate_location(address, lat, lng, status, vis: Optional[LocationVisibility] = None, public_label: Optional[str] = None):
    if status != "published":
        return
    if not address or not address.strip():
        raise HTTPException(
            status_code=400,
            detail="A verified location is required.",
        )
    if lat is None or lng is None:
        raise HTTPException(
            status_code=400,
            detail="Select an address from the suggestions.",
        )
    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        raise HTTPException(
            status_code=400,
            detail="Invalid coordinate range.",
        )
    if vis == "approximate" and (not public_label or not public_label.strip()):
        raise HTTPException(
            status_code=400,
            detail="A public location label is required for approximate visibility.",
        )


@router.post("", response_model=ListingResponse)
async def create_listing(
    payload: ListingCreate,
    current_user: UserPublic = Depends(get_current_user),
):
    if payload.listing_type not in ("product", "home_rental"):
        raise HTTPException(status_code=400, detail="listing_type must be 'product' or 'home_rental'")

    validate_location(
        payload.address, payload.latitude, payload.longitude,
        payload.status, payload.location_visibility, payload.public_location_label,
    )

    doc = {
        **payload.model_dump(),
        "listing_id": generate_id("lst"),
        "owner_id": current_user.user_id,
        "is_active": True,
        "created_at": now_utc(),
    }
    await db.listings.insert_one(doc)
    return ListingResponse(**doc)


def _in_bounds(lat: float, lng: float, min_lat: float, max_lat: float, min_lng: float, max_lng: float) -> bool:
    return min_lat <= lat <= max_lat and min_lng <= lng <= max_lng


@router.get("", response_model=list[ListingResponse])
async def list_listings(
    listing_type: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    condition: Optional[str] = Query(None),
    delivery_method: Optional[str] = Query(None),
    property_type: Optional[str] = Query(None),
    min_bedrooms: Optional[int] = Query(None),
    furnished: Optional[bool] = Query(None),
    min_lat: Optional[float] = Query(None),
    max_lat: Optional[float] = Query(None),
    min_lng: Optional[float] = Query(None),
    max_lng: Optional[float] = Query(None),
    skip: int = 0,
    limit: int = 50,
):
    query: dict = {"is_active": True, "status": "published"}
    if listing_type:
        query["listing_type"] = listing_type

    if q and q.strip():
        terms = escape_regex(q.strip())
        query["$or"] = [
            {f: {"$regex": terms, "$options": "i"}} for f in SEARCHABLE_FIELDS
        ]

    if category:
        query["category"] = {"$regex": f"^{escape_regex(category.strip())}$", "$options": "i"}
    if condition:
        query["condition"] = condition
    if delivery_method:
        query["delivery_method"] = delivery_method
    if property_type:
        query["property_type"] = property_type
    if min_bedrooms is not None:
        query["bedrooms"] = {"$gte": min_bedrooms}
    if furnished is not None:
        query["furnished"] = furnished

    has_bounds = all(v is not None for v in (min_lat, max_lat, min_lng, max_lng))

    # Expand DB bounds by FUZZ_FACTOR to include fuzzed markers
    if has_bounds:
        query["latitude"] = {"$gte": min_lat - FUZZ_FACTOR, "$lte": max_lat + FUZZ_FACTOR}
        query["longitude"] = {"$gte": min_lng - FUZZ_FACTOR, "$lte": max_lng + FUZZ_FACTOR}

    # Fetch more than limit since we filter after transform
    fetch_limit = limit * 5 if has_bounds else limit
    cursor = db.listings.find(query).sort("created_at", -1)
    all_docs = await cursor.to_list(fetch_limit + skip + limit)

    # Apply privacy and optional public-coordinate re-filter
    results = []
    for doc in all_docs:
        transformed = public_listing_location(doc)
        if has_bounds:
            lat = transformed.get("latitude")
            lng = transformed.get("longitude")
            if lat is None or lng is None:
                continue
            if not _in_bounds(lat, lng, min_lat, max_lat, min_lng, max_lng):
                continue
        results.append(transformed)

    paginated = results[skip : skip + limit]
    return [ListingResponse(**doc) for doc in paginated]


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
    return ListingResponse(**public_listing_location(doc))


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

    # Compute effective state: explicit update or existing value
    effective_status = update_data.get("status", doc.get("status", "draft"))
    effective_address = update_data.get("address", doc.get("address"))
    effective_lat = update_data.get("latitude", doc.get("latitude"))
    effective_lng = update_data.get("longitude", doc.get("longitude"))
    effective_vis = update_data.get("location_visibility", doc.get("location_visibility", "approximate"))
    effective_label = update_data.get("public_location_label", doc.get("public_location_label"))

    validate_location(
        effective_address, effective_lat, effective_lng,
        effective_status, effective_vis, effective_label,
    )

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
