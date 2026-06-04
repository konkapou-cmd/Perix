"""Profile routes."""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from pydantic import EmailStr
import logging
import re

logger = logging.getLogger(__name__)

from database import db
from models.user import (
    UserPublic, GalleryUpdate, ProfileMediaUpdate, ProfileInfoUpdate,
    UserPublicProfile, FriendCommonResponse, UserAttendanceResponse,
    GalleryCaptionUpdate, GalleryItem, ThemeUpdate
)
from models.notification import NotificationPreferences, NotificationPreferencesResponse
from models.post import PostResponse
from models.event import EventResponse
from utils.helpers import now_utc, generate_id
from routes.dependencies import get_current_user, build_user_public, resolve_actor
from datetime import timedelta

router = APIRouter(tags=["User Profiles"])




@router.get("/users/slug/{slug}", response_model=UserPublic)
async def get_user_by_slug(
    slug: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """Get a user by their slug."""
    user = await db.users.find_one({"slug": slug}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.put("/users/{user_id}/slug")
async def update_user_slug(
    user_id: str,
    slug_data: dict,
    current_user: UserPublic = Depends(get_current_user)
):
    """Update a user's slug (owner only)."""
    if current_user.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    new_slug = slug_data.get("slug", "").strip()
    if not new_slug:
        raise HTTPException(status_code=400, detail="Slug cannot be empty")
    existing = await db.users.find_one({"slug": new_slug, "user_id": {"$ne": user_id}})
    if existing:
        raise HTTPException(status_code=400, detail="Slug already taken")
    await db.users.update_one({"user_id": user_id}, {"$set": {"slug": new_slug}})
    return {"slug": new_slug}

@router.get("/profiles/me", response_model=UserPublic)
async def get_profile(current_user: UserPublic = Depends(get_current_user)):
    return current_user


@router.get("/users/search", response_model=List[UserPublic])
async def search_users(
    q: Optional[str] = None,
    email: Optional[EmailStr] = None,
    current_user: UserPublic = Depends(get_current_user),
):
    if email:
        user = await db.users.find_one(
            {"email": email}, {"_id": 0, "password_hash": 0}
        )
        return [build_user_public(user)] if user else []
    
    if q:
        safe = re.escape(q)[:50]
        users = await db.users.find(
            {
                "$or": [
                    {"name": {"$regex": safe, "$options": "i"}},
                    {"email": {"$regex": safe, "$options": "i"}},
                ]
            },
            {"_id": 0, "password_hash": 0},
        ).to_list(50)
        return [build_user_public(user) for user in users]
    
    return []


@router.get("/users/by-email", response_model=UserPublic)
async def get_user_by_email(
    email: EmailStr, current_user: UserPublic = Depends(get_current_user)
):
    user = await db.users.find_one(
        {"email": email}, {"_id": 0, "password_hash": 0}
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return build_user_public(user)


@router.get("/users/{user_id}/tagged-posts", response_model=List[PostResponse])
async def get_tagged_posts(
    user_id: str, current_user: UserPublic = Depends(get_current_user)
):
    posts = await db.posts.find(
        {"tagged_user_ids": user_id}, {"_id": 0}
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


@router.get("/artists/{artist_id}/fan-posts", response_model=List[PostResponse])
async def get_artist_fan_posts(
    artist_id: str, current_user: UserPublic = Depends(get_current_user)
):
    """Get posts that tagged this artist (fan gallery)."""
    posts = await db.posts.find(
        {"tagged_artist_ids": artist_id}, {"_id": 0}
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


@router.get("/businesses/{business_id}/fan-posts", response_model=List[PostResponse])
async def get_business_fan_posts(
    business_id: str, current_user: UserPublic = Depends(get_current_user)
):
    """Get posts that tagged this business (fan gallery)."""
    posts = await db.posts.find(
        {"tagged_business_ids": business_id}, {"_id": 0}
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


@router.get("/friends/me", response_model=List[UserPublic])
async def get_my_friends(current_user: UserPublic = Depends(get_current_user)):
    user_friend_ids = [
        f["entity_id"] for f in (current_user.friends or [])
        if isinstance(f, dict) and f.get("entity_type") == "user"
    ]
    if not user_friend_ids:
        return []
    friends = await db.users.find(
        {"user_id": {"$in": user_friend_ids}}, {"_id": 0, "password_hash": 0}
    ).to_list(1000)
    return [build_user_public(friend) for friend in friends]


@router.get("/friends/common", response_model=FriendCommonResponse)
async def get_common_friends(
    other_user_id: str, current_user: UserPublic = Depends(get_current_user)
):
    other_user = await db.users.find_one(
        {"user_id": other_user_id}, {"_id": 0, "password_hash": 0}
    )
    if not other_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    my_user_friend_ids = {
        f["entity_id"] for f in (current_user.friends or [])
        if isinstance(f, dict) and f.get("entity_type") == "user"
    }
    other_user_friend_ids = {
        f["entity_id"] for f in (other_user.get("friends", []) or [])
        if isinstance(f, dict)
    }
    common_ids = list(my_user_friend_ids & other_user_friend_ids)
    common_users = await db.users.find(
        {"user_id": {"$in": common_ids}}, {"_id": 0, "password_hash": 0}
    ).to_list(1000)
    from routes.friend_requests import _is_friend_dict
    is_friend = _is_friend_dict(current_user.friends, "user", other_user_id)
    return FriendCommonResponse(
        common=[build_user_public(u) for u in common_users],
        is_friend=is_friend,
    )


@router.post("/friends/{entity_type}/{entity_id}/toggle")
async def toggle_friend(
    entity_type: str,
    entity_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Toggle friendship with any entity (user, business, or artist).
    For users: bidirectional friend relationship.
    For businesses/artists: follow (one-way, no approval needed).
    """
    if entity_type not in ("user", "business", "artist"):
        raise HTTPException(status_code=400, detail="Invalid entity type")
    
    if entity_type == "user" and entity_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="Cannot friend yourself")
    
    # Verify entity exists
    if entity_type == "user":
        entity = await db.users.find_one({"user_id": entity_id}, {"_id": 0})
        if not entity:
            raise HTTPException(status_code=404, detail="User not found")
    elif entity_type == "business":
        entity = await db.businesses.find_one({"business_id": entity_id}, {"_id": 0})
        if not entity:
            raise HTTPException(status_code=404, detail="Business not found")
    else:
        entity = await db.artists.find_one({"artist_id": entity_id}, {"_id": 0})
        if not entity:
            raise HTTPException(status_code=404, detail="Artist not found")
    
    from routes.friend_requests import _is_friend_dict
    my_entry = {"entity_type": entity_type, "entity_id": entity_id}
    
    is_friend = _is_friend_dict(current_user.friends, entity_type, entity_id)
    
    if is_friend:
        # Remove from my friends
        current_friends = [
            f for f in (current_user.friends or [])
            if not (isinstance(f, dict) and f.get("entity_type") == entity_type and f.get("entity_id") == entity_id)
        ]
        await db.users.update_one(
            {"user_id": current_user.user_id},
            {"$set": {"friends": current_friends}}
        )
        
        # Remove from entity's followers (for business/artist)
        if entity_type == "business":
            await db.businesses.update_one(
                {"business_id": entity_id},
                {"$pull": {"followers": {"entity_type": "user", "entity_id": current_user.user_id}}}
            )
        elif entity_type == "artist":
            await db.artists.update_one(
                {"artist_id": entity_id},
                {"$pull": {"followers": {"entity_type": "user", "entity_id": current_user.user_id}}}
            )
        else:
            # Remove from the other user's friends
            other_user_data = await db.users.find_one({"user_id": entity_id}, {"friends": 1})
            other_friends = [
                f for f in (other_user_data.get("friends") or [])
                if not (isinstance(f, dict) and f.get("entity_type") == "user" and f.get("entity_id") == current_user.user_id)
            ]
            await db.users.update_one(
                {"user_id": entity_id},
                {"$set": {"friends": other_friends}}
            )
        
        return {"is_friend": False}
    else:
        # Add to my friends
        current_friends = list(current_user.friends or [])
        current_friends.append(my_entry)
        await db.users.update_one(
            {"user_id": current_user.user_id},
            {"$addToSet": {"friends": my_entry}}
        )
        
        # Add to entity's followers (for business/artist - one-way follow)
        if entity_type == "business":
            await db.businesses.update_one(
                {"business_id": entity_id},
                {"$addToSet": {"followers": {"entity_type": "user", "entity_id": current_user.user_id}}}
            )
        elif entity_type == "artist":
            await db.artists.update_one(
                {"artist_id": entity_id},
                {"$addToSet": {"followers": {"entity_type": "user", "entity_id": current_user.user_id}}}
            )
        else:
            # Bidirectional for user-user
            their_entry = {"entity_type": "user", "entity_id": current_user.user_id}
            await db.users.update_one(
                {"user_id": entity_id},
                {"$addToSet": {"friends": their_entry}}
            )
        
        return {"is_friend": True}


@router.put("/profiles/theme")
async def update_profile_theme(
    theme: ThemeUpdate,
    current_user: UserPublic = Depends(get_current_user)
):
    """Update user's profile theme settings."""
    theme_data = {
        "theme": {
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
    }
    
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": theme_data}
    )
    
    return {"success": True, "message": "Theme updated successfully"}




@router.get("/users/{user_id}/public", response_model=UserPublicProfile)
async def get_user_public_profile(
    user_id: str, current_user: UserPublic = Depends(get_current_user)
):
    user = await db.users.find_one(
        {"user_id": user_id}, {"_id": 0, "password_hash": 0}
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if user is hidden (reported) - only admins can view hidden profiles
    if user.get("is_hidden") and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="This profile is currently unavailable")
    
    # Check if current user has blocked/reported this user
    current_user_doc = await db.users.find_one(
        {"user_id": current_user.user_id},
        {"_id": 0, "blocked_users": 1}
    )
    blocked_users = current_user_doc.get("blocked_users", []) if current_user_doc else []
    if user_id in blocked_users:
        raise HTTPException(status_code=403, detail="You have blocked this user")
    
    posts = await db.posts.find(
        {"user_id": user_id, "actor_type": {"$in": ["user", "business"]}, "is_hidden": {"$ne": True}}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # DEBUG: Log user profile posts
    logger.debug(f"[DEBUG] get_user_public_profile: user_id={user_id}, found {len(posts)} posts")
    
    user_public = build_user_public(user)
    from routes.posts import build_post_response
    post_responses = [
        build_post_response(post, user_public, current_user) for post in posts
    ]
    return UserPublicProfile(user=user_public, posts=post_responses)


@router.post("/profiles/gallery", response_model=UserPublic)
async def update_gallery(
    payload: GalleryUpdate, current_user: UserPublic = Depends(get_current_user)
):
    MAX_GALLERY_ITEMS = 15

    # First get existing gallery
    existing_user = await db.users.find_one(
        {"user_id": current_user.user_id}, {"_id": 0}
    )
    existing_images = existing_user.get("gallery_images", []) if existing_user else []
    existing_videos = existing_user.get("gallery_videos", []) if existing_user else []
    existing_gallery_items = existing_user.get("gallery_items", []) if existing_user else []
    existing_video_items = existing_user.get("video_items", []) if existing_user else []

    update_data = {}

    # Handle image additions (legacy - URLs only)
    if payload.images:
        # Append new images to existing ones (deduplicated, max 15)
        new_images = [img for img in (payload.images + existing_images) if img not in existing_images]
        update_data["gallery_images"] = new_images[:MAX_GALLERY_ITEMS]
        # Also add to gallery_items with empty captions
        new_items = existing_gallery_items + [{"url": img, "caption": None} for img in payload.images if img not in existing_images]
        update_data["gallery_items"] = new_items[:MAX_GALLERY_ITEMS]

    # Handle video additions (legacy - URLs only)
    if payload.videos:
        # Append new videos to existing ones (deduplicated, max 15)
        new_videos = [vid for vid in (payload.videos + existing_videos) if vid not in existing_videos]
        update_data["gallery_videos"] = new_videos[:MAX_GALLERY_ITEMS]
        # Also add to video_items with empty captions
        new_v_items = existing_video_items + [{"url": vid, "caption": None} for vid in payload.videos if vid not in existing_videos]
        update_data["video_items"] = new_v_items[:MAX_GALLERY_ITEMS]

    # Handle image items with captions (new)
    if payload.image_items:
        current_items = update_data.get("gallery_items", existing_gallery_items)
        for item in payload.image_items:
            if item.url not in [i.get("url") for i in current_items]:
                current_items.append({"url": item.url, "caption": item.caption})
        update_data["gallery_items"] = current_items[:MAX_GALLERY_ITEMS]
        # Also update legacy gallery_images
        current_images = update_data.get("gallery_images", existing_images)
        update_data["gallery_images"] = [i.get("url") for i in current_items][:MAX_GALLERY_ITEMS]

    # Handle video items with captions (new)
    if payload.video_items:
        current_v_items = update_data.get("video_items", existing_video_items)
        for item in payload.video_items:
            if item.url not in [i.get("url") for i in current_v_items]:
                current_v_items.append({"url": item.url, "caption": item.caption})
        update_data["video_items"] = current_v_items[:MAX_GALLERY_ITEMS]
        # Also update legacy gallery_videos
        current_videos = update_data.get("gallery_videos", existing_videos)
        update_data["gallery_videos"] = [i.get("url") for i in current_v_items][:MAX_GALLERY_ITEMS]

    # Handle image removals
    if payload.remove_images:
        current_images = update_data.get("gallery_images", existing_images)
        update_data["gallery_images"] = [img for img in current_images if img not in payload.remove_images]
        # Also remove from gallery_items
        current_items = update_data.get("gallery_items", existing_gallery_items)
        update_data["gallery_items"] = [item for item in current_items if item.get("url") not in payload.remove_images]

    # Handle video removals
    if payload.remove_videos:
        current_videos = update_data.get("gallery_videos", existing_videos)
        update_data["gallery_videos"] = [vid for vid in current_videos if vid not in payload.remove_videos]
        # Also remove from video_items
        current_v_items = update_data.get("video_items", existing_video_items)
        update_data["video_items"] = [item for item in current_v_items if item.get("url") not in payload.remove_videos]

    if update_data:
        await db.users.update_one(
            {"user_id": current_user.user_id}, {"$set": update_data}
        )

    created_posts = []
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
            "actor_type": "user",
            "actor_id": current_user.user_id,
            "actor_name": current_user.name,
            "actor_avatar": current_user.profile_photo or current_user.picture,
            "text": "📸 New photo added to gallery",
            "image_url": img_url,
            "video_url": None,
            "created_at": now_utc(),
            "expires_at": now_utc() + timedelta(days=14),
            "likes": [],
            "comments": [],
        }
        await db.posts.insert_one(post_doc)
        created_posts.append(post_doc)

    for vid_url in new_video_urls:
        post_id = generate_id("post")
        post_doc = {
            "post_id": post_id,
            "user_id": current_user.user_id,
            "actor_type": "user",
            "actor_id": current_user.user_id,
            "actor_name": current_user.name,
            "actor_avatar": current_user.profile_photo or current_user.picture,
            "text": "🎬 New video added to gallery",
            "image_url": None,
            "video_url": vid_url,
            "created_at": now_utc(),
            "expires_at": now_utc() + timedelta(days=14),
            "likes": [],
            "comments": [],
        }
        await db.posts.insert_one(post_doc)
        created_posts.append(post_doc)

    user = await db.users.find_one(
        {"user_id": current_user.user_id}, {"_id": 0, "password_hash": 0}
    )
    return build_user_public(user)


@router.post("/profiles/gallery/caption", response_model=UserPublic)
async def update_gallery_caption(
    payload: GalleryCaptionUpdate, current_user: UserPublic = Depends(get_current_user)
):
    """Update caption for a gallery image or video."""
    existing_user = await db.users.find_one(
        {"user_id": current_user.user_id}, {"_id": 0}
    )
    if not existing_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if payload.item_type == "image":
        gallery_items = existing_user.get("gallery_items", [])
        # Find and update the item
        found = False
        for item in gallery_items:
            if item.get("url") == payload.url:
                item["caption"] = payload.caption
                found = True
                break
        
        if not found:
            # If item not in gallery_items but in gallery_images, add it
            gallery_images = existing_user.get("gallery_images", [])
            if payload.url in gallery_images:
                gallery_items.append({"url": payload.url, "caption": payload.caption})
            else:
                raise HTTPException(status_code=404, detail="Image not found in gallery")
        
        await db.users.update_one(
            {"user_id": current_user.user_id},
            {"$set": {"gallery_items": gallery_items}}
        )
    else:
        video_items = existing_user.get("video_items", [])
        # Find and update the item
        found = False
        for item in video_items:
            if item.get("url") == payload.url:
                item["caption"] = payload.caption
                found = True
                break
        
        if not found:
            # If item not in video_items but in gallery_videos, add it
            gallery_videos = existing_user.get("gallery_videos", [])
            if payload.url in gallery_videos:
                video_items.append({"url": payload.url, "caption": payload.caption})
            else:
                raise HTTPException(status_code=404, detail="Video not found in gallery")
        
        await db.users.update_one(
            {"user_id": current_user.user_id},
            {"$set": {"video_items": video_items}}
        )
    
    user = await db.users.find_one(
        {"user_id": current_user.user_id}, {"_id": 0, "password_hash": 0}
    )
    return build_user_public(user)


@router.post("/profiles/media", response_model=UserPublic)
async def update_profile_media(
    payload: ProfileMediaUpdate, current_user: UserPublic = Depends(get_current_user)
):
    update_data = {}
    if payload.profile_photo is not None:
        update_data["profile_photo"] = payload.profile_photo
    if payload.cover_photo is not None:
        update_data["cover_photo"] = payload.cover_photo
    
    if update_data:
        await db.users.update_one(
            {"user_id": current_user.user_id}, {"$set": update_data}
        )
    
    user = await db.users.find_one(
        {"user_id": current_user.user_id}, {"_id": 0, "password_hash": 0}
    )
    return build_user_public(user)


@router.post("/profiles/info", response_model=UserPublic)
async def update_profile_info(
    payload: ProfileInfoUpdate, current_user: UserPublic = Depends(get_current_user)
):
    update_data = {}
    if payload.name is not None:
        update_data["name"] = payload.name
    if payload.bio is not None:
        update_data["bio"] = payload.bio
    if payload.location is not None:
        update_data["location"] = payload.location
    if payload.latitude is not None:
        update_data["latitude"] = payload.latitude
        logger.debug(f"[PROFILE] Setting latitude: {payload.latitude}")
    if payload.longitude is not None:
        update_data["longitude"] = payload.longitude
        logger.debug(f"[PROFILE] Setting longitude: {payload.longitude}")
    
    logger.debug(f"[PROFILE] Update data: {update_data}")
    
    if update_data:
        await db.users.update_one(
            {"user_id": current_user.user_id}, {"$set": update_data}
        )
    
    user = await db.users.find_one(
        {"user_id": current_user.user_id}, {"_id": 0, "password_hash": 0}
    )
    logger.debug(f"[PROFILE] User after update - lat: {user.get('latitude')}, lng: {user.get('longitude')}")
    return build_user_public(user)


@router.get("/users/{user_id}/attendance", response_model=UserAttendanceResponse)
async def get_user_attendance(
    user_id: str, current_user: UserPublic = Depends(get_current_user)
):
    """Get events the user has attended or is planning to attend"""
    events = await db.events.find(
        {"attendees": user_id}, {"_id": 0}
    ).sort("start_time", 1).to_list(200)
    
    now = now_utc()
    upcoming = []
    past = []
    
    business_ids = list({e.get("business_id") for e in events if e.get("business_id")})
    artist_ids = list({e.get("artist_id") for e in events if e.get("artist_id")})
    
    business_map = {}
    artist_map = {}
    
    if business_ids:
        businesses = await db.businesses.find(
            {"business_id": {"$in": business_ids}}, {"_id": 0}
        ).to_list(200)
        business_map = {b["business_id"]: b for b in businesses}
    
    if artist_ids:
        artists = await db.artists.find(
            {"artist_id": {"$in": artist_ids}}, {"_id": 0}
        ).to_list(200)
        artist_map = {a["artist_id"]: a for a in artists}
    
    from routes.businesses import build_business_summary
    from routes.artists import build_artist_summary
    
    for event in events:
        business = business_map.get(event.get("business_id"))
        artist = artist_map.get(event.get("artist_id"))
        event_response = EventResponse(
            event_id=event["event_id"],
            business=build_business_summary(business) if business else None,
            artist=build_artist_summary(artist) if artist else None,
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
        if event["start_time"] >= now:
            upcoming.append(event_response)
        else:
            past.append(event_response)
    
    return UserAttendanceResponse(upcoming_events=upcoming, past_events=past)


@router.delete("/users/me")
async def delete_user_account(current_user: UserPublic = Depends(get_current_user)):
    """Delete user account and all associated content (businesses, artists, posts, etc.)"""
    user_id = current_user.user_id
    
    # Get user's businesses and artists
    businesses = await db.businesses.find({"owner_id": user_id}, {"business_id": 1}).to_list(100)
    artists = await db.artists.find({"owner_id": user_id}, {"artist_id": 1}).to_list(100)
    
    business_ids = [b["business_id"] for b in businesses]
    artist_ids = [a["artist_id"] for a in artists]
    
    # Delete all business-related content
    for business_id in business_ids:
        await db.events.delete_many({"business_id": business_id})
        await db.posts.delete_many({"actor_type": "business", "actor_id": business_id})
        await db.stories.delete_many({"actor_type": "business", "actor_id": business_id})
    
    # Delete all artist-related content
    for artist_id in artist_ids:
        await db.events.delete_many({"artist_id": artist_id})
        await db.posts.delete_many({"actor_type": "artist", "actor_id": artist_id})
        await db.stories.delete_many({"actor_type": "artist", "actor_id": artist_id})
        await db.booking_requests.delete_many({"artist_id": artist_id})
    
    # Delete businesses and artists
    await db.businesses.delete_many({"owner_id": user_id})
    await db.artists.delete_many({"owner_id": user_id})
    
    # Delete user's own content
    await db.posts.delete_many({"user_id": user_id})
    await db.stories.delete_many({"user_id": user_id})
    await db.activities.delete_many({"creator_id": user_id})
    await db.messages.delete_many({"$or": [{"from_user_id": user_id}, {"to_user_id": user_id}]})
    await db.calls.delete_many({"$or": [{"caller_id": user_id}, {"callee_id": user_id}]})
    await db.notifications.delete_many({"user_id": user_id})
    await db.sessions.delete_many({"user_id": user_id})
    
    # Remove user from friends lists of other users
    await db.users.update_many(
        {},
        {"$pull": {"friends": {"entity_type": "user", "entity_id": user_id}}}
    )
    
    # Delete user account
    await db.users.delete_one({"user_id": user_id})
    
    return {"success": True, "message": "User account deleted successfully"}


# ==================== Push Token Management ====================
from pydantic import BaseModel

class PushTokenRequest(BaseModel):
    push_token: str
    platform: str  # "ios", "android", "web"

class PushTokenDeleteRequest(BaseModel):
    push_token: str


@router.post("/users/push-token")
async def register_push_token(
    request: PushTokenRequest,
    current_user: UserPublic = Depends(get_current_user)
):
    """Register a push notification token for the current user."""
    user_id = current_user.user_id
    
    # Store the push token with platform info
    token_data = {
        "user_id": user_id,
        "push_token": request.push_token,
        "platform": request.platform,
        "created_at": now_utc(),
        "updated_at": now_utc(),
    }
    
    # Upsert: update if exists, insert if not
    await db.push_tokens.update_one(
        {"user_id": user_id, "push_token": request.push_token},
        {"$set": token_data},
        upsert=True
    )
    
    return {"success": True}


@router.delete("/users/push-token")
async def unregister_push_token(
    request: PushTokenDeleteRequest,
    current_user: UserPublic = Depends(get_current_user)
):
    """Remove a push notification token."""
    await db.push_tokens.delete_one({
        "user_id": current_user.user_id,
        "push_token": request.push_token
    })
    
    return {"success": True}


@router.get("/users/{user_id}/push-tokens")
async def get_user_push_tokens(
    user_id: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """Get push tokens for a user (internal use)."""
    tokens = await db.push_tokens.find(
        {"user_id": user_id},
        {"_id": 0}
    ).to_list(10)
    
    return {"tokens": tokens}



# ============== PAUSE USER ==============

from pydantic import BaseModel

class PauseRequest(BaseModel):
    user_id: str


@router.post("/users/pause")
async def pause_user(
    request: PauseRequest,
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Pause a user - blocks messages and calls from them.
    The paused user won't be able to send messages or call you.
    """
    if request.user_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="Cannot pause yourself")
    
    # Check if target user exists
    target_user = await db.users.find_one({"user_id": request.user_id}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Add to paused_users list
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$addToSet": {"paused_users": request.user_id}}
    )
    
    return {"success": True, "message": "User paused", "paused_user_id": request.user_id}


@router.post("/users/unpause")
async def unpause_user(
    request: PauseRequest,
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Unpause a user - allows messages and calls from them again.
    """
    # Remove from paused_users list
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$pull": {"paused_users": request.user_id}}
    )
    
    return {"success": True, "message": "User unpaused", "unpaused_user_id": request.user_id}


@router.get("/users/paused")
async def get_paused_users(
    current_user: UserPublic = Depends(get_current_user)
):
    """Get list of users you have paused."""
    user = await db.users.find_one(
        {"user_id": current_user.user_id},
        {"_id": 0, "paused_users": 1}
    )
    
    paused_ids = user.get("paused_users", []) if user else []
    
    if not paused_ids:
        return []
    
    # Get paused user details
    paused_users = await db.users.find(
        {"user_id": {"$in": paused_ids}},
        {"_id": 0, "password_hash": 0, "user_id": 1, "name": 1, "email": 1, "profile_photo": 1, "picture": 1}
    ).to_list(100)
    
    return paused_users


@router.get("/users/{user_id}/is-paused")
async def check_if_paused(
    user_id: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """Check if a specific user is paused by you."""
    user = await db.users.find_one(
        {"user_id": current_user.user_id},
        {"_id": 0, "paused_users": 1}
    )
    
    paused_ids = user.get("paused_users", []) if user else []
    
    return {"is_paused": user_id in paused_ids}


# ============== REPORT USER ==============

class ReportRequest(BaseModel):
    user_id: str
    reason: str


@router.post("/users/report")
async def report_user(
    request: ReportRequest,
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Report a user. The reported user's account, posts, stories, and all content
    are IMMEDIATELY hidden GLOBALLY from everyone pending admin review.
    Only an admin can restore the user's visibility.
    """
    if request.user_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="Cannot report yourself")
    
    # Check if target user exists
    target_user = await db.users.find_one({"user_id": request.user_id}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if already reported by this user
    existing_report = await db.reports.find_one({
        "reporter_id": current_user.user_id,
        "reported_user_id": request.user_id
    })
    if existing_report:
        raise HTTPException(status_code=400, detail="You have already reported this user")
    
    # Create report record
    from utils.helpers import generate_id
    report_doc = {
        "report_id": generate_id("report"),
        "reporter_id": current_user.user_id,
        "reported_user_id": request.user_id,
        "reason": request.reason,
        "reported_at": now_utc(),
        "status": "pending"
    }
    await db.reports.insert_one(report_doc)
    
    # Add to reporter's blocked_users list (so even after admin restores, reporter won't see them)
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$addToSet": {"blocked_users": request.user_id}}
    )
    
    # GLOBAL HIDE: Hide the reported user and ALL their content from everyone
    # This takes effect immediately - only admin can restore
    
    # 1. Hide the user account globally
    await db.users.update_one(
        {"user_id": request.user_id},
        {"$set": {
            "is_hidden": True,
            "hidden_at": now_utc(),
            "hidden_reason": "reported",
            "hidden_by_report_id": report_doc["report_id"]
        }}
    )
    
    # 2. Hide all their posts
    await db.posts.update_many(
        {"user_id": request.user_id},
        {"$set": {"is_hidden": True, "hidden_reason": "user_reported"}}
    )
    
    # 3. Hide all their stories
    await db.stories.update_many(
        {"user_id": request.user_id},
        {"$set": {"is_hidden": True, "hidden_reason": "user_reported"}}
    )
    
    # 4. Hide their activities
    await db.activities.update_many(
        {"creator_id": request.user_id},
        {"$set": {"is_hidden": True, "hidden_reason": "user_reported"}}
    )
    
    # 5. Hide their businesses
    await db.businesses.update_many(
        {"owner_id": request.user_id},
        {"$set": {"is_hidden": True, "hidden_reason": "user_reported"}}
    )
    
    # 6. Hide their artists
    await db.artists.update_many(
        {"owner_id": request.user_id},
        {"$set": {"is_hidden": True, "hidden_reason": "user_reported"}}
    )
    
    # 7. Hide events created by this user
    await db.events.update_many(
        {"creator_id": request.user_id},
        {"$set": {"is_hidden": True, "hidden_reason": "user_reported"}}
    )
    
    return {
        "success": True, 
        "message": "User reported. Their account has been hidden pending review.",
        "report_id": report_doc["report_id"]
    }


@router.get("/users/blocked")
async def get_blocked_users(
    current_user: UserPublic = Depends(get_current_user)
):
    """Get list of users that the current user has blocked/reported."""
    user = await db.users.find_one(
        {"user_id": current_user.user_id}, 
        {"_id": 0, "blocked_users": 1}
    )
    blocked_ids = user.get("blocked_users", []) if user else []
    
    if not blocked_ids:
        return {"blocked_users": []}
    
    # Get basic info about blocked users
    blocked_users = await db.users.find(
        {"user_id": {"$in": blocked_ids}},
        {"_id": 0, "user_id": 1, "name": 1, "profile_photo": 1}
    ).to_list(100)
    
    return {"blocked_users": blocked_users}


@router.post("/users/unblock/{user_id}")
async def unblock_user(
    user_id: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """Unblock a user. This removes them from your blocked list and you can see their content again."""
    # Remove from blocked list
    result = await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$pull": {"blocked_users": user_id}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User was not blocked")
    
    return {"success": True, "message": "User unblocked successfully"}


@router.get("/users/notification-preferences", response_model=NotificationPreferencesResponse)
async def get_notification_preferences(
    current_user: UserPublic = Depends(get_current_user)
):
    user = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    prefs = user.get("notification_preferences", {})
    return NotificationPreferencesResponse(
        messages=prefs.get("messages", True),
        events=prefs.get("events", True),
        activities=prefs.get("activities", True),
        friendRequests=prefs.get("friendRequests", True),
        calls=prefs.get("calls", True),
        marketing=prefs.get("marketing", False),
    )


@router.put("/users/notification-preferences", response_model=NotificationPreferencesResponse)
async def update_notification_preferences(
    payload: NotificationPreferences,
    current_user: UserPublic = Depends(get_current_user)
):
    prefs_dict = payload.model_dump()
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"notification_preferences": prefs_dict}}
    )
    return payload


@router.post("/users/block/{user_id}")
async def block_user(
    user_id: str,
    current_user: UserPublic = Depends(get_current_user)
):
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="Cannot block yourself")
    
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$addToSet": {"blocked_users": user_id}}
    )
    
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$pull": {"friends": {"entity_type": "user", "entity_id": user_id}}}
    )
    await db.users.update_one(
        {"user_id": user_id},
        {"$pull": {"friends": {"entity_type": "user", "entity_id": current_user.user_id}}}
    )
    
    return {"success": True, "message": "User blocked successfully"}
