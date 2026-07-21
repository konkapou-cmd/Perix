"""User listing routes (products and home rentals)."""
import math
import re
from fastapi import APIRouter, HTTPException, Depends, Query, Request
from typing import Optional
from database import db
from models.user import UserPublic
from models.listing import ListingCreate, ListingUpdate, ListingResponse, LocationVisibility, CATEGORY_ALIASES
from utils.helpers import generate_id, now_utc
from routes.dependencies import get_current_user

router = APIRouter(prefix="/listings", tags=["Listings"])

FUZZ_FACTOR = 0.01  # ~1km area
SEARCHABLE_FIELDS = ["title", "description", "category", "subcategory", "brand", "public_location_label"]

LEGACY_TO_CANONICAL = {
    "home_garden": "home_garden_diy",
    "sports": "sports_outdoor",
    "books": "media_music",
}

MARKETPLACE_SUBCATEGORIES: dict[str, list[str]] = {
    "electronics": ["smartphones", "computers_tablets", "tv_video", "audio_hifi", "gaming_hardware", "cameras", "wearables", "smart_home", "networking", "electronic_accessories"],
    "home_garden_diy": ["furniture", "kitchen_household", "large_appliances", "small_appliances", "decoration", "lighting", "garden", "tools", "renovation_materials", "storage"],
    "fashion": ["womens_clothing", "mens_clothing", "kids_clothing", "shoes", "bags", "jewelry", "watches", "sportswear", "workwear", "vintage_designer", "fashion_accessories"],
    "baby_kids": ["baby_equipment", "strollers", "car_seats", "nursery_furniture", "baby_clothing", "kids_clothing", "toys_learning", "school_supplies", "feeding", "baby_safety_care"],
    "sports_outdoor": ["fitness", "running", "team_sports", "camping_hiking", "winter_sports", "water_sports", "racket_sports", "climbing", "golf", "sports_accessories", "outdoor_clothing"],
    "bikes_mobility": ["bicycles", "electric_bikes", "scooters", "electric_scooters", "bike_parts", "bike_accessories", "helmets_protection", "child_transport", "mobility_aids"],
    "media_music": ["books", "comics_manga", "movies_series", "cds", "vinyl", "musical_instruments", "studio_dj", "sheet_music", "media_accessories"],
    "toys_games": ["console_games", "board_games", "puzzles", "building_sets", "dolls_figures", "educational_toys", "outdoor_toys", "remote_controlled", "toy_vehicles"],
    "hobbies_collectibles": ["art", "antiques", "coins_stamps", "trading_cards", "model_building", "crafts", "collectible_figures", "memorabilia", "other_collectibles"],
    "beauty_wellness": ["skincare", "makeup", "haircare", "hair_styling", "fragrances", "nailcare", "wellness_devices", "beauty_devices", "personal_care", "beauty_accessories"],
    "pet_supplies": ["dog_supplies", "cat_supplies", "small_pet_supplies", "bird_supplies", "aquarium", "terrarium", "pet_transport", "pet_beds_furniture", "pet_care", "pet_training"],
    "office_business": ["office_furniture", "office_supplies", "printers_scanners", "retail_equipment", "restaurant_equipment", "workshop_equipment", "machines", "warehouse_logistics", "agriculture", "event_equipment", "packaging"],
    "other": ["miscellaneous", "household_clearance", "bundles", "uncategorized_parts"],
}

ALL_VALID_ATTRIBUTE_KEYS: set[str] = {
    "brand", "model", "storage_gb", "screen_size", "color", "warranty", "original_packaging",
    "processor", "ram_gb", "material", "width_cm", "height_cm", "depth_cm", "assembled",
    "size", "target_group", "age_group", "authenticity_proof", "safety_standard",
    "accident_free", "manufacture_date", "sport_type", "weight_kg", "bike_type",
    "frame_size", "wheel_size", "model_year", "mileage_km", "battery_capacity",
    "battery_condition", "format", "genre", "language", "author_artist", "publisher_label",
    "isbn", "release_year", "platform", "complete", "players", "series",
    "condition_grade", "artist_manufacturer", "year", "edition", "certificate",
    "sealed", "unused", "product_type", "pet_type", "power", "voltage",
    "operating_hours", "business_seller", "vat_deductible",
}

NUMBER_ATTRIBUTE_KEYS: set[str] = {
    "storage_gb", "ram_gb", "screen_size",
    "width_cm", "height_cm", "depth_cm",
    "weight_kg", "model_year", "mileage_km",
    "release_year", "year", "operating_hours",
}

BOOLEAN_ATTRIBUTE_KEYS: set[str] = {
    "warranty", "original_packaging", "assembled",
    "authenticity_proof", "accident_free", "complete",
    "certificate", "sealed", "unused",
    "business_seller", "vat_deductible",
}


def normalize_category(key: Optional[str]) -> Optional[str]:
    if not key:
        return None
    if key in LEGACY_TO_CANONICAL:
        return LEGACY_TO_CANONICAL[key]
    return key


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


def has_publishable_location(address, lat, lng, vis, public_label) -> bool:
    if not address or not address.strip():
        return False
    if lat is None or lng is None:
        return False
    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        return False
    if vis == "approximate" and (not public_label or not public_label.strip()):
        return False
    return True


def validate_coordinates(lat, lng):
    if lat is not None and not (-90 <= lat <= 90):
        raise HTTPException(status_code=400, detail="Invalid latitude.")
    if lng is not None and not (-180 <= lng <= 180):
        raise HTTPException(status_code=400, detail="Invalid longitude.")


def validate_location(status, listing_type="product", category=None, subcategory=None):
    if status != "published":
        return
    if listing_type == "product" and (not category or not category.strip()):
        raise HTTPException(status_code=400, detail="A category is required to publish.")
    if listing_type == "product" and (not subcategory or not subcategory.strip()):
        raise HTTPException(status_code=400, detail="A subcategory is required to publish.")
    if listing_type == "product" and category:
        canonical = normalize_category(category.strip())
        if canonical not in MARKETPLACE_SUBCATEGORIES:
            raise HTTPException(status_code=400, detail=f"Invalid marketplace category: {category}")
        if subcategory and subcategory.strip() not in MARKETPLACE_SUBCATEGORIES[canonical]:
            raise HTTPException(status_code=400, detail="Subcategory does not belong to the selected category.")


@router.post("", response_model=ListingResponse)
async def create_listing(
    payload: ListingCreate,
    current_user: UserPublic = Depends(get_current_user),
):
    if payload.listing_type not in ("product", "home_rental"):
        raise HTTPException(status_code=400, detail="listing_type must be 'product' or 'home_rental'")

    # Resolve seller identity — server-controlled, never trust client seller_id
    if payload.seller_type == "business":
        if not payload.business_id:
            raise HTTPException(status_code=400, detail="business_id is required for seller_type=business")
        biz = await db.businesses.find_one({"business_id": payload.business_id})
        if not biz:
            raise HTTPException(status_code=404, detail="Business not found")
        if biz.get("owner_id") != current_user.user_id:
            raise HTTPException(status_code=403, detail="Not authorized to create listings for this business")
        seller_type_val = "business"
        seller_id_val = payload.business_id
        business_id_val = payload.business_id
    else:
        seller_type_val = "user"
        seller_id_val = current_user.user_id
        business_id_val = None

    validate_coordinates(payload.latitude, payload.longitude)

    effective_status = payload.status
    if effective_status == "published" and not has_publishable_location(
        payload.address, payload.latitude, payload.longitude,
        payload.location_visibility, payload.public_location_label,
    ):
        effective_status = "draft"

    validate_location(effective_status, payload.listing_type, payload.category, payload.subcategory)

    dump = payload.model_dump()
    dump["status"] = effective_status
    dump["seller_type"] = seller_type_val
    dump["seller_id"] = seller_id_val
    dump["business_id"] = business_id_val
    if payload.listing_type == "product" and dump.get("category"):
        dump["category"] = normalize_category(dump["category"])

    doc = {
        **dump,
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
    request: Request,
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
    seller_type: Optional[str] = Query(None),
    seller_id: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 50,
):
    query: dict = {"is_active": True, "status": "published"}
    if listing_type:
        query["listing_type"] = listing_type

    # Generic discovery always enforces Marketplace projection
    # Profile-only listings are retrievable only through /seller/user/ and /seller/business/
    query["$or"] = [
        {"publication_scope": "profile_and_marketplace"},
        {"publication_scope": {"$exists": False}},
    ]

    if seller_type:
        query["seller_type"] = seller_type
    if seller_id:
        query["seller_id"] = seller_id

    if q and q.strip():
        terms = escape_regex(q.strip())
        clauses = query.get("$and", [dict(query)])
        clauses.append({
            "$or": [
                {f: {"$regex": terms, "$options": "i"}} for f in SEARCHABLE_FIELDS
            ]
        })
        clean = {k: v for k, v in query.items() if k not in ("$or", "$and")}
        clean["$and"] = clauses
        query = clean

    if category:
        aliases = CATEGORY_ALIASES.get(category, [category])
        query["category"] = {"$in": aliases}

    if subcategory:
        query["subcategory"] = subcategory

    cond_list: list = []
    if conditions and conditions.strip():
        cond_list = [c.strip() for c in conditions.split(",") if c.strip()]
    if condition and condition.strip():
        cond_list.append(condition.strip())
    if cond_list:
        cond_list = list(dict.fromkeys(cond_list))
        query["condition"] = {"$in": cond_list} if len(cond_list) > 1 else cond_list[0]

    if delivery_method:
        query["delivery_method"] = delivery_method
    elif pickup_available and not shipping_available:
        query["delivery_method"] = {"$in": ["pickup", "both"]}
    elif shipping_available and not pickup_available:
        query["delivery_method"] = {"$in": ["shipping", "both"]}
    elif pickup_available and shipping_available:
        query["delivery_method"] = {"$in": ["pickup", "shipping", "both"]}

    if property_type:
        query["property_type"] = property_type
    if min_bedrooms is not None:
        query["bedrooms"] = {"$gte": min_bedrooms}
    if furnished is not None:
        query["furnished"] = furnished

    # Dynamic attribute filters: attr_<key>=<value> in query string
    attribute_filters: dict[str, list[str]] = {}
    for key, value in request.query_params.multi_items():
        if not key.startswith("attr_"):
            continue
        attr_key = key[5:]
        if attr_key not in ALL_VALID_ATTRIBUTE_KEYS:
            continue
        raw = value.strip()
        if not raw:
            continue
        if "," in raw:
            vals = [v.strip() for v in raw.split(",") if v.strip()]
        else:
            vals = [raw]
        if vals:
            attribute_filters.setdefault(attr_key, []).extend(vals)

    for attr_key, vals in attribute_filters.items():
        unique = list(dict.fromkeys(vals))
        if attr_key in NUMBER_ATTRIBUTE_KEYS:
            try:
                converted = [float(v) for v in unique]
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid numeric value for attribute '{attr_key}'")
            query[f"attributes.{attr_key}"] = converted[0] if len(converted) == 1 else {"$in": converted}
        elif attr_key in BOOLEAN_ATTRIBUTE_KEYS:
            lowered = [v.lower() for v in unique]
            for v in lowered:
                if v not in ("true", "false", "1", "0"):
                    raise HTTPException(status_code=400, detail=f"Invalid boolean value for attribute '{attr_key}'")
            converted = [v in ("true", "1") for v in lowered]
            query[f"attributes.{attr_key}"] = converted[0] if len(converted) == 1 else {"$in": converted}
        else:
            query[f"attributes.{attr_key}"] = unique[0] if len(unique) == 1 else {"$in": unique}

    has_bounds = all(v is not None for v in (min_lat, max_lat, min_lng, max_lng))

    if has_bounds:
        query["latitude"] = {"$gte": min_lat - FUZZ_FACTOR, "$lte": max_lat + FUZZ_FACTOR}
        query["longitude"] = {"$gte": min_lng - FUZZ_FACTOR, "$lte": max_lng + FUZZ_FACTOR}

    fetch_limit = limit * 5 if has_bounds else limit
    cursor = db.listings.find(query).sort("created_at", -1)
    all_docs = await cursor.to_list(fetch_limit + skip + limit)

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


@router.get("/seller/user/{user_id}", response_model=list[ListingResponse])
async def get_user_seller_listings(user_id: str):
    docs = await db.listings.find(
        {
            "$or": [
                {"seller_type": "user", "seller_id": user_id},
                {"owner_id": user_id, "seller_type": {"$exists": False}, "seller_id": {"$exists": False}},
            ],
            "listing_type": "product",
            "status": "published",
            "is_active": True,
        },
        {"_id": 0},
    ).sort("created_at", -1).to_list(100)
    return [ListingResponse(**public_listing_location(doc)) for doc in docs]


@router.get("/seller/business/{business_id}", response_model=list[ListingResponse])
async def get_business_seller_listings(business_id: str):
    docs = await db.listings.find(
        {"seller_type": "business", "business_id": business_id, "listing_type": "product", "status": "published", "is_active": True},
        {"_id": 0},
    ).sort("created_at", -1).to_list(100)
    return [ListingResponse(**public_listing_location(doc)) for doc in docs]


@router.get("/manage", response_model=list[ListingResponse])
async def manage_listings(
    seller_type: Optional[str] = Query(None),
    seller_id: Optional[str] = Query(None),
    current_user: UserPublic = Depends(get_current_user),
):
    query: dict = {"owner_id": current_user.user_id}
    if seller_type:
        query["seller_type"] = seller_type
    if seller_id:
        query["seller_id"] = seller_id
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

    # Seller identity is immutable — strip from update
    update_data.pop("seller_type", None)
    update_data.pop("seller_id", None)
    update_data.pop("business_id", None)

    # Compute effective state: explicit update or existing value
    effective_status = update_data.get("status", doc.get("status", "draft"))
    effective_address = update_data.get("address", doc.get("address"))
    effective_lat = update_data.get("latitude", doc.get("latitude"))
    effective_lng = update_data.get("longitude", doc.get("longitude"))
    effective_vis = update_data.get("location_visibility", doc.get("location_visibility", "approximate"))
    effective_label = update_data.get("public_location_label", doc.get("public_location_label"))

    effective_category = update_data.get("category", doc.get("category"))
    effective_subcategory = update_data.get("subcategory", doc.get("subcategory"))

    validate_coordinates(effective_lat, effective_lng)

    if effective_status == "published" and not has_publishable_location(
        effective_address, effective_lat, effective_lng,
        effective_vis, effective_label,
    ):
        effective_status = "draft"
        update_data["status"] = "draft"

    validate_location(effective_status, doc.get("listing_type", "product"), effective_category, effective_subcategory)

    if doc.get("listing_type") == "product" and update_data.get("category"):
        update_data["category"] = normalize_category(update_data["category"])

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
