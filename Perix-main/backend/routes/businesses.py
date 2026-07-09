"""Business routes."""
import asyncio
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Dict, Any
from datetime import timedelta
from pydantic import EmailStr

import logging

logger = logging.getLogger(__name__)

import database
from database import db
from models.user import UserPublic
from models.business import BusinessCreate, BusinessUpdate, BusinessResponse, BusinessSummary, BusinessDetail, GalleryUpdate
from models.post import PostResponse
from models.event import EventResponse
from routes.jobs import job_response
from models.service import ServiceResponse
from routes.rentals import service_to_rental, RENTAL_SERVICE_TYPES
from utils.helpers import generate_id, now_utc, normalize_datetime
from routes.dependencies import get_current_user, build_user_public


router = APIRouter(prefix="/businesses", tags=["Businesses"])


def build_business_response(business_doc: Dict) -> BusinessResponse:
    defaults = {
        "description": None,
        "logo_image": None,
        "cover_image": None,
        "cover_focal_point": {"x": 0.5, "y": 0.5},
        "phone": None,
        "website": None,
        "email": None,
        "social_links": None,
        "opening_hours": None,
        "gallery_images": [],
        "gallery_videos": [],
        "tags": [],
        "root_category": business_doc.get("category", "other"),
        "subcategory": business_doc.get("category", "other"),
        "enabled_modules": {
            "events": False,
            "tickets": False,
            "jobs": False,
            "bookings": False,
            "services": False,
            "menu": False,
            "rentals": False,
            "gym": False,
            "salon": False,
            "service_types": [],
        },
        "subscription_status": business_doc.get("subscription_status", "trial"),
        "trial_expires_at": business_doc.get("trial_expires_at"),
        "plan_type": business_doc.get("plan_type"),
        "subscription_expires_at": business_doc.get("subscription_expires_at"),
        "favorites_count": len(business_doc.get("favorites", [])),
        "friends": business_doc.get("friends", []),
        "friends_count": len(business_doc.get("friends", [])),
        "theme": business_doc.get("theme"),
    }
    for key, value in defaults.items():
        business_doc.setdefault(key, value)
    return BusinessResponse(**business_doc)


def build_business_summary(business_doc: Dict) -> BusinessSummary:
    business_doc.setdefault("root_category", business_doc.get("category", "other"))
    business_doc.setdefault("subcategory", business_doc.get("category", "other"))
    return BusinessSummary(
        business_id=business_doc["business_id"],
        name=business_doc["name"],
        category=business_doc.get("category", ""),
        root_category=business_doc.get("root_category", "other"),
        subcategory=business_doc.get("subcategory", "other"),
        address=business_doc.get("address", ""),
        latitude=business_doc.get("latitude", 0.0),
        longitude=business_doc.get("longitude", 0.0),
        logo_image=business_doc.get("logo_image"),
        theme=business_doc.get("theme"),
    )


def is_trial_active(business_doc: Dict) -> bool:
    if business_doc.get("subscription_status") != "trial":
        return False
    trial_expires = business_doc.get("trial_expires_at")
    if not trial_expires:
        return False
    return normalize_datetime(trial_expires) >= now_utc()


def is_subscription_active(business_doc: Dict) -> bool:
    if business_doc.get("subscription_status") == "active":
        return True
    return is_trial_active(business_doc)


@router.post("", response_model=BusinessResponse)
async def create_business(
    payload: BusinessCreate, current_user: UserPublic = Depends(get_current_user)
):
    existing_count = await db.businesses.count_documents(
        {"owner_id": current_user.user_id}
    )
    if existing_count >= 1:
        raise HTTPException(status_code=403, detail="Only one business allowed")
    category_info = database.CATEGORY_LOOKUP.get(payload.subcategory)
    if not category_info:
        raise HTTPException(status_code=400, detail="Invalid business subcategory")
    if payload.root_category and payload.root_category != category_info["root_slug"]:
        raise HTTPException(status_code=400, detail="Subcategory does not match root category")

    trial_expires_at = now_utc() + timedelta(days=90)
    modules = category_info.get("modules", {})
    business_doc = {
        "business_id": generate_id("biz"),
        "owner_id": current_user.user_id,
        "name": payload.name,
        "category": category_info["name"],
        "root_category": category_info["root_slug"],
        "subcategory": category_info["slug"],
        "description": payload.description,
        "service_types": category_info.get("service_types", []),
        "logo_image": payload.logo_image,
        "cover_image": payload.cover_image,
        "cover_focal_point": payload.cover_focal_point.dict() if payload.cover_focal_point else {"x": 0.5, "y": 0.5},
        "phone": payload.phone,
        "website": payload.website,
        "email": payload.email,
        "social_links": payload.social_links,
        "opening_hours": payload.opening_hours,
        "gallery_images": payload.gallery_images,
        "gallery_videos": payload.gallery_videos,
        "tags": payload.tags,
        "address": payload.address,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "location": {
            "type": "Point",
            "coordinates": [payload.longitude, payload.latitude],
        },
        "created_at": now_utc(),
        "enabled_modules": modules,
        "subscription_status": "trial",
        "trial_expires_at": trial_expires_at,
        "plan_type": None,
        "subscription_expires_at": None,
        "favorites": [],
    }
    await db.businesses.insert_one(business_doc)
    return build_business_response(business_doc)


@router.put("/{business_id}", response_model=BusinessResponse)
async def update_business(
    business_id: str,
    payload: BusinessUpdate,
    current_user: UserPublic = Depends(get_current_user),
):
    business = await db.businesses.find_one(
        {"business_id": business_id, "owner_id": current_user.user_id}, {"_id": 0}
    )
    if not business:
        raise HTTPException(status_code=403, detail="Not authorized")
    if not is_subscription_active(business):
        raise HTTPException(status_code=403, detail="Active subscription required to edit business profile")
    update_data = {key: value for key, value in payload.dict().items() if value is not None}
    
    if "subcategory" in update_data:
        category_info = database.CATEGORY_LOOKUP.get(update_data["subcategory"])
        if not category_info:
            raise HTTPException(status_code=400, detail="Invalid business subcategory")
        if "root_category" in update_data and update_data["root_category"] != category_info["root_slug"]:
            raise HTTPException(status_code=400, detail="Subcategory does not match root category")
        update_data["root_category"] = category_info["root_slug"]
        update_data["category"] = category_info["name"]
        update_data["enabled_modules"] = category_info["modules"]
        update_data["service_types"] = category_info.get("service_types", [])
    
    if "latitude" in update_data or "longitude" in update_data:
        latitude = update_data.get("latitude", business.get("latitude"))
        longitude = update_data.get("longitude", business.get("longitude"))
        update_data["location"] = {
            "type": "Point",
            "coordinates": [longitude, latitude],
        }
    if update_data:
        await db.businesses.update_one({"business_id": business_id}, {"$set": update_data})
        business.update(update_data)
    return build_business_response(business)


from models.user import ThemeUpdate

@router.put("/{business_id}/theme")
async def update_business_theme(
    business_id: str,
    theme: ThemeUpdate,
    current_user: UserPublic = Depends(get_current_user),
):
    """Update a business's profile theme colors."""
    business = await db.businesses.find_one({"business_id": business_id}, {"_id": 0})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    if business["owner_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    if not is_subscription_active(business):
        raise HTTPException(status_code=403, detail="Active subscription required to edit business profile")
    
    theme_data = {
        "background_color": theme.background_color,
        "primary_color": theme.primary_color,
        "secondary_color": theme.secondary_color,
        "text_color": theme.text_color,
        "card_color": theme.card_color,
        "gradient_start": theme.gradient_start,
        "gradient_end": theme.gradient_end,
        "use_gradient": theme.use_gradient,
        "font_family": theme.font_family,
        "font_weight": theme.font_weight,
        "font_style": theme.font_style,
        "letter_spacing": theme.letter_spacing,
        "text_transform": theme.text_transform,
        "gallery_card_color": theme.gallery_card_color,
        "info_card_color": theme.info_card_color,
        "action_button_color": theme.action_button_color,
        "border_color": theme.border_color,
    }
    
    await db.businesses.update_one(
        {"business_id": business_id},
        {"$set": {"theme": theme_data}}
    )
    
    return {"success": True, "message": "Business theme updated successfully"}


@router.get("", response_model=List[BusinessResponse])
async def list_businesses(
    skip: int = 0,
    limit: int = 50,
    root_category: Optional[str] = None,
    subcategory: Optional[str] = None,
    current_user: UserPublic = Depends(get_current_user),
):
    query: Dict[str, str] = {}
    if root_category and root_category != "all":
        query["root_category"] = root_category
    if subcategory:
        query["subcategory"] = subcategory
    businesses = await db.businesses.find(query, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    return [build_business_response(business) for business in businesses]


@router.get("/nearby", response_model=List[BusinessResponse])
async def get_nearby_businesses(
    latitude: float,
    longitude: float,
    max_distance_meters: int = 5000,
    root_category: Optional[str] = None,
    min_lat: Optional[float] = None,
    max_lat: Optional[float] = None,
    min_lng: Optional[float] = None,
    max_lng: Optional[float] = None,
    current_user: UserPublic = Depends(get_current_user),
):
    """Get businesses near a location using geospatial query or within map bounds."""
    
    # If map bounds are provided, use bounding box query instead of proximity
    if min_lat is not None and max_lat is not None and min_lng is not None and max_lng is not None:
        query: Dict[str, Any] = {
            "latitude": {"$gte": min_lat, "$lte": max_lat},
            "longitude": {"$gte": min_lng, "$lte": max_lng},
        }
        if root_category and root_category != "all":
            query["root_category"] = root_category
        
        businesses = await db.businesses.find(query, {"_id": 0}).to_list(100)
        return [build_business_response(b) for b in businesses]
    
    # Use proximity-based query
    query: Dict[str, Any] = {
        "location": {
            "$near": {
                "$geometry": {
                    "type": "Point",
                    "coordinates": [longitude, latitude]
                },
                "$maxDistance": max_distance_meters
            }
        }
    }
    if root_category and root_category != "all":
        query["root_category"] = root_category
    
    try:
        businesses = await db.businesses.find(query, {"_id": 0}).to_list(100)
    except Exception:
        # Fallback if geospatial index not available - use basic filtering
        all_businesses = await db.businesses.find({}, {"_id": 0}).to_list(1000)
        from math import radians, cos, sin, asin, sqrt
        
        def haversine(lat1, lon1, lat2, lon2):
            R = 6371000  # meters
            lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
            dlat = lat2 - lat1
            dlon = lon2 - lon1
            a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
            return 2 * R * asin(sqrt(a))
        
        businesses = [
            b for b in all_businesses
            if b.get("latitude") and b.get("longitude") and
            haversine(latitude, longitude, b["latitude"], b["longitude"]) <= max_distance_meters and
            (not root_category or root_category == "all" or b.get("root_category") == root_category)
        ]
    
    return [build_business_response(b) for b in businesses]


@router.get("/category-tree")
async def get_category_tree():
    """Get the full category tree for business creation."""
    logger.debug(f"[DEBUG] /category-tree returning {len(database.CATEGORY_TREE)} categories")
    return {"categories": database.CATEGORY_TREE}


@router.get("/my", response_model=Optional[BusinessResponse])
async def get_my_business(current_user: UserPublic = Depends(get_current_user)):
    business = await db.businesses.find_one(
        {"owner_id": current_user.user_id}, {"_id": 0}
    )
    return build_business_response(business) if business else None


@router.get("/{business_id}", response_model=BusinessDetail)
async def get_business(
    business_id: str, current_user: UserPublic = Depends(get_current_user)
):
    business, events, jobs, rental_services, services, posts = await asyncio.gather(
        db.businesses.find_one({"business_id": business_id}, {"_id": 0}),
        db.events.find({"business_id": business_id}, {"_id": 0}).sort("start_time", 1).to_list(100),
        db.jobs.find({"business_id": business_id, "is_active": True}, {"_id": 0}).sort("created_at", -1).to_list(100),
        db.services.find({"business_id": business_id, "type": {"$in": list(RENTAL_SERVICE_TYPES)}, "is_active": True}, {"_id": 0}).sort("created_at", -1).to_list(100),
        db.services.find({"business_id": business_id, "is_active": True}, {"_id": 0}).sort("created_at", -1).to_list(100),
        db.posts.find({"$or": [{"business_id": business_id}, {"actor_type": "business", "actor_id": business_id}]}, {"_id": 0}).sort("created_at", -1).to_list(100),
    )
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    rental_responses = [service_to_rental(s, business) for s in rental_services]

    logger.debug(f"[DEBUG] get_business: Found {len(posts)} posts for business_id={business_id}")
    
    logger.debug(f"[DEBUG] get_business: Found {len(posts)} posts for business_id={business_id}")
    for p in posts[:3]:
        logger.debug(f"[DEBUG] Post: post_id={p.get('post_id')}, actor_type={p.get('actor_type')}, actor_id={p.get('actor_id')}, business_id={p.get('business_id')}")
    
    user_ids = list({post["user_id"] for post in posts})
    users = await db.users.find(
        {"user_id": {"$in": user_ids}}, {"_id": 0, "password_hash": 0}
    ).to_list(1000)
    user_map = {user["user_id"]: build_user_public(user) for user in users}
    
    from routes.posts import build_post_response
    post_responses = [
        build_post_response(post, user_map.get(post["user_id"], current_user), current_user)
        for post in posts
    ]
    
    event_responses = [
        EventResponse(
            event_id=event["event_id"],
            business=build_business_summary(business),
            artist=None,
            title=event["title"],
            description=event.get("description"),
            cover_image_url=event.get("cover_image_url"),
            image_urls=event.get("image_urls", []),
            video_url=event.get("video_url"),
            start_time=event["start_time"],
            end_time=event.get("end_time"),
            location=event.get("location"),
            latitude=event.get("latitude"),
            longitude=event.get("longitude"),
            created_at=event["created_at"],
            theme=event.get("theme"),
            is_private=event.get("is_private", False),
            profile_theme=business.get("theme") if business else None,
            gallery_images=event.get("gallery_images", []),
            gallery_videos=event.get("gallery_videos", []),
        )
        for event in events
    ]
    
    job_responses = [job_response(j, business) for j in jobs]
    
    is_owner = business.get("owner_id") == current_user.user_id
    is_favorited = current_user.user_id in business.get("favorites", [])
    
    service_responses = [ServiceResponse(**s).model_dump(mode="json") for s in services]

    return BusinessDetail(
        business=build_business_response(business),
        events=event_responses,
        posts=post_responses,
        jobs=job_responses,
        rentals=rental_responses,
        services=service_responses,
        is_owner=is_owner,
        is_favorited=is_favorited,
    )


@router.post("/{business_id}/favorite")
async def toggle_favorite(
    business_id: str, current_user: UserPublic = Depends(get_current_user)
):
    business = await db.businesses.find_one({"business_id": business_id}, {"_id": 0})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    favorites = business.get("favorites", [])
    if current_user.user_id in favorites:
        favorites.remove(current_user.user_id)
        is_favorited = False
    else:
        favorites.append(current_user.user_id)
        is_favorited = True
    
    await db.businesses.update_one(
        {"business_id": business_id}, {"$set": {"favorites": favorites}}
    )
    return {"is_favorited": is_favorited, "favorites_count": len(favorites)}


@router.get("/{business_id}/fan-gallery", response_model=List[PostResponse])
async def get_business_fan_gallery(
    business_id: str, current_user: UserPublic = Depends(get_current_user)
):
    """Get posts where this business is tagged (fan gallery)"""
    business = await db.businesses.find_one({"business_id": business_id}, {"_id": 0})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    hidden_posts = business.get("hidden_fan_posts", [])
    
    posts = await db.posts.find(
        {
            "tagged_business_ids": business_id,
            "post_id": {"$nin": hidden_posts}
        },
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    user_ids = list({post["user_id"] for post in posts})
    users = await db.users.find(
        {"user_id": {"$in": user_ids}}, {"_id": 0, "password_hash": 0}
    ).to_list(1000)
    user_map = {user["user_id"]: build_user_public(user) for user in users}
    
    from routes.posts import build_post_response
    return [
        build_post_response(post, user_map.get(post["user_id"], current_user), current_user)
        for post in posts
    ]


@router.post("/{business_id}/fan-gallery/{post_id}/hide")
async def hide_business_fan_gallery_post(
    business_id: str, post_id: str, current_user: UserPublic = Depends(get_current_user)
):
    """Hide a post from business fan gallery (owner only)"""
    business = await db.businesses.find_one(
        {"business_id": business_id, "owner_id": current_user.user_id}, {"_id": 0}
    )
    if not business:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    hidden_posts = business.get("hidden_fan_posts", [])
    if post_id not in hidden_posts:
        hidden_posts.append(post_id)
        await db.businesses.update_one(
            {"business_id": business_id},
            {"$set": {"hidden_fan_posts": hidden_posts}}
        )
    return {"success": True}


@router.post("/{business_id}/fan-gallery/{post_id}/unhide")
async def unhide_business_fan_gallery_post(
    business_id: str, post_id: str, current_user: UserPublic = Depends(get_current_user)
):
    """Unhide a post from business fan gallery (owner only)"""
    business = await db.businesses.find_one(
        {"business_id": business_id, "owner_id": current_user.user_id}, {"_id": 0}
    )
    if not business:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    hidden_posts = business.get("hidden_fan_posts", [])
    if post_id in hidden_posts:
        hidden_posts.remove(post_id)
        await db.businesses.update_one(
            {"business_id": business_id},
            {"$set": {"hidden_fan_posts": hidden_posts}}
        )
    return {"success": True}


@router.post("/{business_id}/gallery", response_model=BusinessResponse)
async def update_business_gallery(
    business_id: str,
    payload: GalleryUpdate,
    current_user: UserPublic = Depends(get_current_user),
):
    """Update business gallery with add/remove operations, deduplication, and 15 item limit."""
    MAX_GALLERY_ITEMS = 15

    business = await db.businesses.find_one(
        {"business_id": business_id, "owner_id": current_user.user_id}, {"_id": 0}
    )
    if not business:
        raise HTTPException(status_code=403, detail="Not authorized")
    if not is_subscription_active(business):
        raise HTTPException(status_code=403, detail="Active subscription required to edit business profile")

    existing_images = business.get("gallery_images", [])
    existing_videos = business.get("gallery_videos", [])

    update_data = {}

    if payload.images:
        new_images = [img for img in (payload.images + existing_images) if img not in existing_images]
        update_data["gallery_images"] = new_images[:MAX_GALLERY_ITEMS]

    if payload.videos:
        new_videos = [vid for vid in (payload.videos + existing_videos) if vid not in existing_videos]
        update_data["gallery_videos"] = new_videos[:MAX_GALLERY_ITEMS]

    if payload.remove_images:
        current_images = update_data.get("gallery_images", existing_images)
        update_data["gallery_images"] = [img for img in current_images if img not in payload.remove_images]

    if payload.remove_videos:
        current_videos = update_data.get("gallery_videos", existing_videos)
        update_data["gallery_videos"] = [vid for vid in current_videos if vid not in payload.remove_videos]

    if update_data:
        await db.businesses.update_one({"business_id": business_id}, {"$set": update_data})
        business.update(update_data)

    new_image_urls = []
    new_video_urls = []

    if payload.images:
        new_image_urls = [img for img in payload.images if img not in existing_images]
    if payload.videos:
        new_video_urls = [vid for vid in payload.videos if vid not in existing_videos]
    if payload.image_items:
        new_image_urls.extend([item.url for item in payload.image_items if item.url not in existing_images])
    if payload.video_items:
        new_video_urls.extend([item.url for item in payload.video_items if item.url not in existing_videos])

    for img_url in new_image_urls:
        post_id = generate_id("post")
        post_doc = {
            "post_id": post_id,
            "user_id": current_user.user_id,
            "actor_type": "business",
            "actor_id": business_id,
            "actor_name": business.get("name"),
            "actor_avatar": business.get("logo_image"),
            "business_id": business_id,
            "text": "📸 New photo added to gallery",
            "image_url": img_url,
            "video_url": None,
            "created_at": now_utc(),
            "expires_at": now_utc() + timedelta(days=14),
            "likes": [],
            "comments": [],
        }
        await db.posts.insert_one(post_doc)

    for vid_url in new_video_urls:
        post_id = generate_id("post")
        post_doc = {
            "post_id": post_id,
            "user_id": current_user.user_id,
            "actor_type": "business",
            "actor_id": business_id,
            "actor_name": business.get("name"),
            "actor_avatar": business.get("logo_image"),
            "business_id": business_id,
            "text": "🎬 New video added to gallery",
            "image_url": None,
            "video_url": vid_url,
            "created_at": now_utc(),
            "expires_at": now_utc() + timedelta(days=14),
            "likes": [],
            "comments": [],
        }
        await db.posts.insert_one(post_doc)

    return build_business_response(business)


@router.delete("/{business_id}")
async def delete_business(
    business_id: str, current_user: UserPublic = Depends(get_current_user)
):
    """Delete a business profile and all associated content (owner only)"""
    business = await db.businesses.find_one(
        {"business_id": business_id, "owner_id": current_user.user_id}, {"_id": 0}
    )
    if not business:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Delete all related content
    await db.events.delete_many({"business_id": business_id})
    await db.posts.delete_many({"actor_type": "business", "actor_id": business_id})
    await db.stories.delete_many({"actor_type": "business", "actor_id": business_id})
    
    # Delete the business profile
    await db.businesses.delete_one({"business_id": business_id})
    
    return {"success": True, "message": "Business profile deleted successfully"}


# ============== REPORT BUSINESS ==============

from pydantic import BaseModel

class ReportBusinessRequest(BaseModel):
    reason: str

@router.post("/{business_id}/report")
async def report_business(
    business_id: str,
    request: ReportBusinessRequest,
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Report a business. The business is flagged for admin review.
    """
    # Check if business exists
    business = await db.businesses.find_one({"business_id": business_id}, {"_id": 0})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    # Check if user owns this business (can't report own business)
    if business.get("owner_id") == current_user.user_id:
        raise HTTPException(status_code=400, detail="Cannot report your own business")
    
    # Check if already reported by this user
    existing_report = await db.reports.find_one({
        "reporter_id": current_user.user_id,
        "reported_entity_id": business_id,
        "entity_type": "business"
    })
    if existing_report:
        raise HTTPException(status_code=400, detail="You have already reported this business")
    
    # Create report
    report_doc = {
        "report_id": generate_id("report"),
        "reporter_id": current_user.user_id,
        "reported_entity_id": business_id,
        "entity_type": "business",
        "entity_name": business.get("name", "Unknown"),
        "reason": request.reason,
        "reported_at": now_utc(),
        "status": "pending"
    }
    await db.reports.insert_one(report_doc)
    
    # Flag the business as reported (but don't hide immediately like users)
    await db.businesses.update_one(
        {"business_id": business_id},
        {"$set": {
            "is_reported": True,
            "reported_at": now_utc()
        }}
    )
    
    return {
        "success": True, 
        "message": "Business reported. Our team will review it shortly.",
        "report_id": report_doc["report_id"]
    }


