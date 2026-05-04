"""Rental routes."""
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, List
import logging

from database import db
from models.rental import RentalCreate, RentalUpdate, RentalResponse
from utils.helpers import generate_id, now_utc
from routes.dependencies import get_current_user, UserPublic
from routes.ws import ws_broadcast_notification

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/rentals", tags=["Rentals"])

RENTAL_CATEGORIES = {"rental-real-estate"}


def rental_response(rental: dict, business: dict = None) -> dict:
    return {
        "rental_id": rental.get("rental_id"),
        "business_id": rental.get("business_id"),
        "business_name": business.get("name") if business else rental.get("business_name"),
        "business_logo": business.get("profile_photo") or business.get("logo_image") if business else rental.get("business_logo"),
        "title": rental.get("title"),
        "description": rental.get("description"),
        "cover_image": rental.get("cover_image"),
        "rent_price": rental.get("rent_price"),
        "rooms_size": rental.get("rooms_size"),
        "address": rental.get("address"),
        "latitude": rental.get("latitude"),
        "longitude": rental.get("longitude"),
        "available_from": rental.get("available_from"),
        "deposit": rental.get("deposit"),
        "property_type": rental.get("property_type"),
        "gallery_images": rental.get("gallery_images", []),
        "is_active": rental.get("is_active", True),
        "created_at": rental.get("created_at"),
        "root_category": rental.get("root_category"),
        "subcategory": rental.get("subcategory"),
    }


@router.post("", response_model=RentalResponse)
async def create_rental(payload: RentalCreate, current_user: UserPublic = Depends(get_current_user)):
    business = await db.businesses.find_one(
        {"owner_id": current_user.user_id, "root_category": {"$in": list(RENTAL_CATEGORIES)}},
        {"_id": 0}
    )
    if not business:
        raise HTTPException(status_code=403, detail="Only real estate businesses can post rentals")

    rental_doc = {
        "rental_id": generate_id("rental"),
        "business_id": business["business_id"],
        "business_name": business.get("name"),
        "business_logo": business.get("profile_photo") or business.get("logo_image"),
        "title": payload.title,
        "description": payload.description,
        "cover_image": payload.cover_image,
        "rent_price": payload.rent_price,
        "rooms_size": payload.rooms_size,
        "address": payload.address,
        "latitude": payload.latitude if payload.latitude is not None else business.get("latitude"),
        "longitude": payload.longitude if payload.longitude is not None else business.get("longitude"),
        "available_from": payload.available_from,
        "deposit": payload.deposit,
        "property_type": payload.property_type,
        "gallery_images": payload.gallery_images,
        "is_active": True,
        "created_at": now_utc().isoformat(),
        "root_category": business.get("root_category"),
        "subcategory": business.get("subcategory"),
    }

    await db.rentals.insert_one(rental_doc)

    try:
        await ws_broadcast_notification(
            db,
            event="new_rental",
            data={"rental_id": rental_doc["rental_id"], "business_id": business["business_id"], "title": payload.title},
            exclude_user_id=current_user.user_id,
        )
    except Exception:
        pass

    return rental_response(rental_doc, business)


@router.get("")
async def get_rentals(
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    max_distance_km: float = 50,
    min_lat: Optional[float] = None,
    max_lat: Optional[float] = None,
    min_lng: Optional[float] = None,
    max_lng: Optional[float] = None,
    root_category: Optional[str] = None,
    subcategory: Optional[str] = None,
    property_type: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
    current_user: UserPublic = Depends(get_current_user),
):
    query = {"is_active": True}
    if root_category:
        query["root_category"] = root_category
    if subcategory:
        query["subcategory"] = subcategory
    if property_type:
        query["property_type"] = property_type

    total = await db.rentals.count_documents(query)
    rentals = await db.rentals.find(query, {"_id": 0}).skip(skip).limit(limit).to_list(limit)

    use_bounds = all([min_lat, max_lat, min_lng, max_lng])
    if use_bounds:
        filtered = []
        for r in rentals:
            if r.get("latitude") is not None and r.get("longitude") is not None:
                if min_lat <= r["latitude"] <= max_lat and min_lng <= r["longitude"] <= max_lng:
                    filtered.append(r)
        rentals = filtered
    elif latitude and longitude:
        from math import radians, sin, cos, sqrt, atan2

        def haversine(lat1, lon1, lat2, lon2):
            R = 6371
            dlat = radians(lat2 - lat1)
            dlon = radians(lon2 - lon1)
            a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
            c = 2 * atan2(sqrt(a), sqrt(1 - a))
            return R * c

        filtered = []
        for r in rentals:
            if r.get("latitude") is not None and r.get("longitude") is not None:
                distance = haversine(latitude, longitude, r["latitude"], r["longitude"])
                if distance <= max_distance_km:
                    r["distance_km"] = round(distance, 2)
                    filtered.append(r)
        filtered.sort(key=lambda x: x.get("distance_km", 999))
        rentals = filtered

    return {"rentals": [rental_response(r) for r in rentals], "total": total}


@router.get("/my")
async def get_my_rentals(current_user: UserPublic = Depends(get_current_user)):
    businesses = await db.businesses.find(
        {"owner_id": current_user.user_id, "root_category": {"$in": list(RENTAL_CATEGORIES)}},
        {"_id": 0, "business_id": 1}
    ).to_list(10)
    biz_ids = [b["business_id"] for b in businesses]
    rentals = await db.rentals.find(
        {"business_id": {"$in": biz_ids}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return [rental_response(r) for r in rentals]


@router.get("/{rental_id}", response_model=RentalResponse)
async def get_rental(rental_id: str, current_user: UserPublic = Depends(get_current_user)):
    rental = await db.rentals.find_one({"rental_id": rental_id}, {"_id": 0})
    if not rental:
        raise HTTPException(status_code=404, detail="Rental not found")
    business = await db.businesses.find_one(
        {"business_id": rental["business_id"]},
        {"_id": 0, "name": 1, "profile_photo": 1, "logo_image": 1}
    )
    return rental_response(rental, business)


@router.put("/{rental_id}", response_model=RentalResponse)
async def update_rental(rental_id: str, payload: RentalUpdate, current_user: UserPublic = Depends(get_current_user)):
    rental = await db.rentals.find_one({"rental_id": rental_id}, {"_id": 0})
    if not rental:
        raise HTTPException(status_code=404, detail="Rental not found")
    business = await db.businesses.find_one(
        {"business_id": rental["business_id"], "owner_id": current_user.user_id},
        {"_id": 0}
    )
    if not business:
        raise HTTPException(status_code=403, detail="Not authorized")

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if updates:
        await db.rentals.update_one({"rental_id": rental_id}, {"$set": updates})

    updated = await db.rentals.find_one({"rental_id": rental_id}, {"_id": 0})
    return rental_response(updated, business)


@router.delete("/{rental_id}")
async def delete_rental(rental_id: str, current_user: UserPublic = Depends(get_current_user)):
    rental = await db.rentals.find_one({"rental_id": rental_id}, {"_id": 0})
    if not rental:
        raise HTTPException(status_code=404, detail="Rental not found")
    business = await db.businesses.find_one(
        {"business_id": rental["business_id"], "owner_id": current_user.user_id},
        {"_id": 0}
    )
    if not business:
        raise HTTPException(status_code=403, detail="Not authorized")

    await db.rentals.delete_one({"rental_id": rental_id})
    return {"success": True, "message": "Rental deleted"}
