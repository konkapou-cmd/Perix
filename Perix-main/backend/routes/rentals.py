"""Rental routes — all rentals are service-based."""
import asyncio
import base64
import logging
import os
import tempfile
from typing import List, Optional

import cloudinary.uploader
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from database import db
from routes.dependencies import get_current_user, UserPublic
from routes.ws import ws_broadcast_new_message, ws_broadcast_conversation_update
from utils.helpers import generate_id, now_utc
from utils.push_notifications import send_message_notification

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/rentals", tags=["Rentals"])

RENTAL_CATEGORIES = {"rental-real-estate", "rentals"}
RENTAL_SERVICE_TYPES = {"rental_property"}


def service_to_rental(service: dict, business: dict = None) -> dict:
    images = service.get("image_urls", [])
    cover = service.get("cover_image_url") or (images[0] if images else None)
    gallery = service.get("gallery_images", [])
    if not gallery and len(images) > 1:
        gallery = images[1:]
    svc_property_type = service.get("property_type")
    if not svc_property_type:
        svc_property_type = "apartment"
    return {
        "rental_id": f"svc_{service.get('service_id', '')}",
        "service_id": service.get("service_id"),
        "business_id": service.get("business_id"),
        "business_name": business.get("name") if business else service.get("business_name"),
        "business_logo": business.get("profile_photo") or business.get("logo_image") if business else None,
        "source_type": "business",
        "source_badge": "Professional business",
        "title": service.get("name"),
        "description": service.get("description"),
        "cover_image": cover,
        "rent_price": service.get("price"),
        "rooms_size": service.get("room_size"),
        "address": service.get("address") or (business.get("address") if business else None),
        "latitude": service.get("latitude") if service.get("latitude") is not None else (business.get("latitude") if business else None),
        "longitude": service.get("longitude") if service.get("longitude") is not None else (business.get("longitude") if business else None),
        "available_from": service.get("available_from"),
        "deposit": service.get("deposit"),
        "property_type": svc_property_type,
        "gallery_images": gallery,
        "gallery_videos": service.get("gallery_videos", []),
        "video_url": service.get("video_url"),
        "image_urls": service.get("image_urls", []),
        "is_active": service.get("is_active", True),
        "created_at": service.get("created_at"),
        "root_category": service.get("root_category") or (business.get("root_category") if business else None),
        "subcategory": service.get("subcategory") or svc_property_type,
        "bedrooms": service.get("bedrooms"),
        "bathrooms": service.get("bathrooms"),
        "size_sqm": service.get("size_sqm"),
        "furnished": service.get("furnished"),
        "lease_duration": service.get("lease_duration"),
        "cover_focal_point": service.get("cover_focal_point", {"x": 0.5, "y": 0.5}),
    }


def listing_to_rental(listing: dict, owner: dict = None) -> dict:
    images = listing.get("image_urls", [])
    cover = listing.get("cover_image_url") or (images[0] if images else None)
    gallery = listing.get("gallery_images", [])
    if not gallery and len(images) > 1:
        gallery = images[1:]
    property_type = listing.get("property_type") or "apartment"
    return {
        "rental_id": listing.get("listing_id"),
        "listing_id": listing.get("listing_id"),
        "service_id": None,
        "business_id": None,
        "business_name": None,
        "business_logo": None,
        "source_type": "owner",
        "source_badge": "Owner-listed",
        "owner_id": listing.get("owner_id"),
        "owner_name": owner.get("name") if owner else None,
        "owner_photo": owner.get("profile_photo") or owner.get("picture") if owner else None,
        "title": listing.get("title"),
        "description": listing.get("description"),
        "cover_image": cover,
        "rent_price": listing.get("price"),
        "rooms_size": None,
        "address": listing.get("address"),
        "latitude": listing.get("latitude"),
        "longitude": listing.get("longitude"),
        "available_from": listing.get("available_from"),
        "deposit": listing.get("deposit"),
        "property_type": property_type,
        "gallery_images": gallery,
        "gallery_videos": listing.get("gallery_videos", []),
        "video_url": listing.get("video_url"),
        "image_urls": listing.get("image_urls", []),
        "is_active": listing.get("is_active", True),
        "created_at": listing.get("created_at"),
        "root_category": "rentals",
        "subcategory": property_type,
        "bedrooms": listing.get("bedrooms"),
        "bathrooms": listing.get("bathrooms"),
        "size_sqm": listing.get("size_sqm"),
        "furnished": listing.get("furnished"),
        "lease_duration": listing.get("lease_duration"),
        "cover_focal_point": {"x": 0.5, "y": 0.5},
    }


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
    svc_query: dict = {"is_active": True, "type": {"$in": list(RENTAL_SERVICE_TYPES)}}
    if root_category:
        matching_bizs = await db.businesses.find(
            {"root_category": root_category},
            {"_id": 0, "business_id": 1}
        ).to_list(200)
        matching_biz_ids = [b["business_id"] for b in matching_bizs]
        if matching_biz_ids:
            svc_query["business_id"] = {"$in": matching_biz_ids}
        else:
            svc_query["business_id"] = {"$in": []}
    rental_services = await db.services.find(svc_query, {"_id": 0}).to_list(100)

    rentals = []
    if rental_services:
        svc_biz_ids = list({s["business_id"] for s in rental_services})
        biz_cursor = db.businesses.find({"business_id": {"$in": svc_biz_ids}}, {"_id": 0})
        biz_map = {}
        async for b in biz_cursor:
            biz_map[b["business_id"]] = b
        for s in rental_services:
            biz = biz_map.get(s["business_id"])
            if biz:
                rc = biz.get("root_category", "")
                s["root_category"] = rc
                s["subcategory"] = biz.get("subcategory", s.get("type"))
            rental_obj = service_to_rental(s, biz)
            if property_type and rental_obj.get("property_type") != property_type:
                continue
            if subcategory and rental_obj.get("subcategory") != subcategory:
                continue
            rentals.append(rental_obj)

    # Include owner-listed home rentals
    owner_listings = await db.listings.find(
        {"listing_type": "home_rental", "status": "published", "is_active": True},
        {"_id": 0}
    ).to_list(100)
    if owner_listings:
        owner_ids = list({l["owner_id"] for l in owner_listings})
        owner_cursor = db.users.find({"user_id": {"$in": owner_ids}}, {"_id": 0, "password_hash": 0})
        owner_map = {}
        async for u in owner_cursor:
            owner_map[u["user_id"]] = u
        for lst in owner_listings:
            owner = owner_map.get(lst["owner_id"])
            rental_obj = listing_to_rental(lst, owner)
            if property_type and rental_obj.get("property_type") != property_type:
                continue
            if subcategory and rental_obj.get("subcategory") != subcategory:
                continue
            rentals.append(rental_obj)

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

    return {"rentals": rentals, "total": len(rentals)}


@router.get("/my")
async def get_my_rentals(current_user: UserPublic = Depends(get_current_user)):
    businesses = await db.businesses.find(
        {"owner_id": current_user.user_id},
        {"_id": 0, "business_id": 1, "name": 1, "profile_photo": 1, "logo_image": 1, "root_category": 1, "subcategory": 1}
    ).to_list(100)
    biz_map = {b["business_id"]: b for b in businesses}

    rental_biz_ids = [b["business_id"] for b in businesses if b.get("root_category") in RENTAL_CATEGORIES]
    if not rental_biz_ids:
        return []

    services = await db.services.find(
        {"business_id": {"$in": rental_biz_ids}, "type": {"$in": list(RENTAL_SERVICE_TYPES)}, "is_active": True},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)

    return [service_to_rental(s, biz_map.get(s["business_id"])) for s in services]


@router.get("/{rental_id}")
async def get_rental(rental_id: str, current_user: UserPublic = Depends(get_current_user)):
    if rental_id.startswith("lst_"):
        listing = await db.listings.find_one(
            {"listing_id": rental_id, "listing_type": "home_rental", "status": "published", "is_active": True},
            {"_id": 0},
        )
        if not listing:
            raise HTTPException(status_code=404, detail="Rental not found")
        owner = await db.users.find_one(
            {"user_id": listing["owner_id"]},
            {"_id": 0, "password_hash": 0},
        )
        return listing_to_rental(listing, owner)

    if rental_id.startswith("svc_"):
        service_id = rental_id[4:]
        service = await db.services.find_one({"service_id": service_id}, {"_id": 0})
        if not service:
            raise HTTPException(status_code=404, detail="Service not found")
        business = await db.businesses.find_one(
            {"business_id": service["business_id"]},
            {"_id": 0, "name": 1, "profile_photo": 1, "logo_image": 1}
        )
        return service_to_rental(service, business)

    raise HTTPException(status_code=404, detail="Rental not found")


@router.post("/inquiry")
async def send_rental_inquiry(
    service_id: str = Form(...),
    name: str = Form(...),
    email: str = Form(...),
    message: str = Form(...),
    files: List[UploadFile] = File(None),
    current_user: UserPublic = Depends(get_current_user),
):
    """Send a rental inquiry as a message to the business owner with optional file attachments."""
    service = await db.services.find_one({"service_id": service_id, "is_active": True}, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    business_id = service.get("business_id")
    business = await db.businesses.find_one({"business_id": business_id}, {"_id": 0})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    owner_id = business.get("owner_id")
    if not owner_id:
        raise HTTPException(status_code=404, detail="Business owner not found")

    # Upload files and collect media URLs
    media_items = []
    if files:
        for file in files:
            if file.filename:
                content = await file.read()
                if not content:
                    continue
                is_image = (file.content_type or "").startswith("image/")
                resource_type = "image" if is_image else "raw"
                ext = os.path.splitext(file.filename)[1] or ".bin"
                with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                    tmp.write(content)
                    tmp_path = tmp.name
                try:
                    upload_opts = {
                        "resource_type": resource_type,
                        "folder": "perix/inquiries",
                        "public_id": f"{generate_id('inq')}_{file.filename}",
                    }
                    result = await asyncio.to_thread(
                        cloudinary.uploader.upload, tmp_path, **upload_opts
                    )
                    url = result.get("secure_url", "")
                    if url:
                        media_items.append({
                            "url": url,
                            "media_type": "image" if is_image else "file",
                            "filename": file.filename,
                        })
                except Exception as e:
                    logger.warning(f"Failed to upload file {file.filename}: {e}")
                finally:
                    if os.path.exists(tmp_path):
                        os.remove(tmp_path)

    # Build the inquiry message text
    inquiry_text = f"**Rental Inquiry: {service.get('name')}**\n\nFrom: {name} ({email})\n\n{message}"
    if media_items:
        inquiry_text += f"\n\nAttachments ({len(media_items)}):"
        for item in media_items:
            inquiry_text += f"\n- {item['filename']}: {item['url']}"

    # Send message to business owner
    message_doc = {
        "message_id": generate_id("msg"),
        "from_user_id": current_user.user_id,
        "to_user_id": owner_id,
        "to_business_id": business_id,
        "entity_type": "business",
        "text": inquiry_text,
        "read": False,
        "created_at": now_utc(),
    }
    await db.messages.insert_one(message_doc)

    # Send notification
    asyncio.create_task(
        send_message_notification(
            recipient_user_id=owner_id,
            sender_name=current_user.name,
            sender_id=current_user.user_id,
            sender_photo=current_user.profile_photo,
            conversation_id=business_id,
            message_preview=inquiry_text[:100],
        )
    )

    # Broadcast via WebSocket
    await ws_broadcast_new_message(owner_id, message_doc)
    await ws_broadcast_new_message(current_user.user_id, message_doc)
    await ws_broadcast_conversation_update(owner_id, {"conversation_id": business_id, "last_message": message_doc})
    await ws_broadcast_conversation_update(current_user.user_id, {"conversation_id": business_id, "last_message": message_doc})

    return {
        "success": True,
        "message_id": message_doc["message_id"],
        "conversation_id": business_id,
        "media_count": len(media_items),
    }
