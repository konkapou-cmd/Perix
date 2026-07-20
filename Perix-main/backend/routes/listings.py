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
SEARCHABLE_FIELDS = ["title", "description", "category", "subcategory", "brand", "public_location_label"]


def _build_discovery_query(
    listing_type: Optional[str],
    q: Optional[str],
    category: Optional[str],
    subcategory: Optional[str],
    conditions: Optional[str],
    delivery_method: Optional[str],
    pickup_available: Optional[bool],
    shipping_available: Optional[bool],
    property_type: Optional[str],
    min_bedrooms: Optional[int],
    furnished: Optional[bool],
    attribute_filters: dict,
    min_lat: Optional[float],
    max_lat: Optional[float],
    min_lng: Optional[float],
    max_lng: Optional[float],
) -> dict:
    query: dict = {"is_active": True, "status": "published"}
    if listing_type:
        query["listing_type"] = listing_type

    if q and q.strip():
        terms = escape_regex(q.strip())
        query["$or"] = [
            {f: {"$regex": terms, "$options": "i"}} for f in SEARCHABLE_FIELDS
        ]

    if category:
        from models.listing import CATEGORY_ALIASES
        aliases = CATEGORY_ALIASES.get(category, [category])
        query["category"] = {"$in": aliases}

    if subcategory:
        query["subcategory"] = subcategory

    if conditions and conditions.strip():
        cond_list = [c.strip() for c in conditions.split(",") if c.strip()]
        if len(cond_list) == 1:
            query["condition"] = cond_list[0]
        else:
            query["condition"] = {"$in": cond_list}

    if delivery_method:
        if delivery_method == "shipping":
            query["delivery_method"] = {"$in": ["shipping", "both"]}
        elif delivery_method == "pickup":
            query["delivery_method"] = {"$in": ["pickup", "both"]}
        else:
            query["delivery_method"] = delivery_method

    if pickup_available and not shipping_available:
        query["delivery_method"] = {"$in": ["pickup", "both"]}
    elif shipping_available and not pickup_available:
        query["delivery_method"] = {"$in": ["shipping", "both"]}
    elif pickup_available and shipping_available:
        pass  # any delivery ok

    if property_type:
        query["property_type"] = property_type
    if min_bedrooms is not None:
        query["bedrooms"] = {"$gte": min_bedrooms}
    if furnished is not None:
        query["furnished"] = furnished

    for attr_key, attr_val in attribute_filters.items():
        val = attr_val.strip() if isinstance(attr_val, str) else attr_val
        if val and "," in str(val):
            vals = [v.strip() for v in str(val).split(",") if v.strip()]
            query[f"attributes.{escape_regex(attr_key)}"] = {"$in": vals}
        elif val:
            query[f"attributes.{escape_regex(attr_key)}"] = val

    has_bounds = all(v is not None for v in (min_lat, max_lat, min_lng, max_lng))
    if has_bounds:
        query["latitude"] = {"$gte": min_lat - FUZZ_FACTOR, "$lte": max_lat + FUZZ_FACTOR}
        query["longitude"] = {"$gte": min_lng - FUZZ_FACTOR, "$lte": max_lng + FUZZ_FACTOR}

    return query, has_bounds


@router.get("", response_model=list[ListingResponse])
async def list_listings(
    listing_type: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    subcategory: Optional[str] = Query(None),
    condition: Optional[str] = Query(None),
    conditions: Optional[str] = Query(None),
    delivery_method: Optional[str] = Query(None),
    pickup_available: Optional[bool] = Query(None),
    shipping_available: Optional[bool] = Query(None),
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
    if payload.listing_type not in ("product", "home_rental"):
        raise HTTPException(status_code=400, detail="listing_type must be 'product' or 'home_rental'")

    validate_location(
        payload.address, payload.latitude, payload.longitude,
        payload.status, payload.listing_type,
        payload.category, payload.subcategory,
        payload.location_visibility, payload.public_location_label,
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
    # Extract attribute_* query params dynamically
    attribute_filters: dict = {}
    # We can't dynamically capture kwargs in FastAPI query params,
    # so we accept attribute filters via a precomputed approach.
    # For now, the frontend sends conditions as comma-separated.

    query, has_bounds = _build_discovery_query(
        listing_type=listing_type,
        q=q,
        category=category,
        subcategory=subcategory,
        conditions=conditions or condition,
        delivery_method=delivery_method,
        pickup_available=pickup_available,
        shipping_available=shipping_available,
        property_type=property_type,
        min_bedrooms=min_bedrooms,
        furnished=furnished,
        attribute_filters=attribute_filters,
        min_lat=min_lat,
        max_lat=max_lat,
        min_lng=min_lng,
        max_lng=max_lng,
    )

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

    effective_category = update_data.get("category", doc.get("category"))
    effective_subcategory = update_data.get("subcategory", doc.get("subcategory"))

    validate_location(
        effective_address, effective_lat, effective_lng,
        effective_status, doc.get("listing_type", "product"),
        effective_category, effective_subcategory,
        effective_vis, effective_label,
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
