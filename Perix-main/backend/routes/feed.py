"""Feed routes."""
from fastapi import APIRouter, Depends
from typing import Optional
import time
import logging
from datetime import datetime
from math import radians, cos, sin, asin, sqrt

from database import db
from models.user import UserPublic
from models.feed import HomeFeedResponse
from models.artist import ArtistResponse
from models.post import BusinessPostInfo
from utils.helpers import now_utc
from routes.dependencies import get_current_user, build_user_public, get_blocked_user_ids

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/feed", tags=["Feed"])

_hidden_user_ids_cache = {"ids": [], "last_updated": 0}


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points in km."""
    R = 6371
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    c = 2 * asin(sqrt(a))
    return R * c


@router.get("/home", response_model=HomeFeedResponse)
async def get_home_feed(
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    radius_km: Optional[float] = 50,
    min_lat: Optional[float] = None,
    max_lat: Optional[float] = None,
    min_lng: Optional[float] = None,
    max_lng: Optional[float] = None,
    event_start_after: Optional[str] = None,
    event_start_before: Optional[str] = None,
    activity_date: Optional[str] = None,
    offset: Optional[int] = 0,
    friends_only: bool = False,
    current_user: UserPublic = Depends(get_current_user),
):
    """Get the home feed with posts, stories, events, and businesses."""
    use_geo = latitude is not None and longitude is not None
    use_bounds = all(v is not None for v in [min_lat, max_lat, min_lng, max_lng])
    current_time = now_utc()
    
    # Get blocked users for current user
    blocked_user_ids = await get_blocked_user_ids(current_user.user_id)
    
    # Get hidden users (globally hidden via reports or admin action)
    now_ts = time.time()
    if now_ts - _hidden_user_ids_cache["last_updated"] > 60:
        hidden_users = await db.users.find(
            {"is_hidden": True},
            {"_id": 0, "user_id": 1}
        ).to_list(1000)
        _hidden_user_ids_cache["ids"] = [u["user_id"] for u in hidden_users]
        _hidden_user_ids_cache["last_updated"] = now_ts
    hidden_user_ids = _hidden_user_ids_cache["ids"]
    
    # Combine blocked and hidden user IDs
    excluded_user_ids = list(set(blocked_user_ids + hidden_user_ids))
    
    # Get posts (latest 100)
    post_query = {
        "$and": [
            {
                "$or": [
                    {"expires_at": {"$gt": current_time}},
                    {"expires_at": {"$exists": False}}
                ]
            },
            {"is_hidden": {"$ne": True}}
        ]
    }
    if excluded_user_ids:
        post_query["$and"].append({"user_id": {"$nin": excluded_user_ids}})

    # Friends-only filter: show posts from friends and followed businesses/artists
    if friends_only:
        friend_ids = set()
        for friend_entry in current_user.friends or []:
            if isinstance(friend_entry, dict):
                friend_ids.add(friend_entry.get("entity_id", ""))
            elif isinstance(friend_entry, str):
                friend_ids.add(friend_entry)
        if friend_ids:
            post_query["$and"].append({
                "$or": [
                    {"user_id": {"$in": list(friend_ids)}},
                    {"actor_id": {"$in": list(friend_ids)}},
                ]
            })
        else:
            # User has no friends — return empty posts list
            posts = []
            post_query = None
    
    if post_query is not None:
        posts = await db.posts.find(
        post_query,
        {"_id": 0, "post_id": 1, "user_id": 1, "text": 1, "image_url": 1, 
         "video_url": 1, "created_at": 1, "likes": 1, "comments": 1, 
         "actor_type": 1, "actor_id": 1, "actor_name": 1, "actor_avatar": 1,
         "business_id": 1, "media_ratio": 1, "tagged_user_ids": 1, "expires_at": 1,
         "tagged_business_ids": 1, "tagged_artist_ids": 1, "video_status": 1,
         "mux_playback_id": 1, "mux_thumbnail_url": 1, "mux_asset_id": 1}
    ).sort("created_at", -1).skip(offset).to_list(100)
    
    # Initialize posts as empty list if None
    if posts is None:
        posts = []
    
    # Get ALL businesses and artists (excluding hidden ones)
    business_query = {"is_hidden": {"$ne": True}}
    if use_bounds:
        business_query["latitude"] = {"$gte": min_lat, "$lte": max_lat}
        business_query["longitude"] = {"$gte": min_lng, "$lte": max_lng}
    all_businesses = await db.businesses.find(
        business_query, {"_id": 0}
    ).to_list(200)
    artist_query = {"is_hidden": {"$ne": True}}
    if use_bounds:
        artist_query["latitude"] = {"$gte": min_lat, "$lte": max_lat}
        artist_query["longitude"] = {"$gte": min_lng, "$lte": max_lng}
    all_artists = await db.artists.find(
        artist_query, {"_id": 0}
    ).to_list(200)
    
    all_business_map = {b["business_id"]: b for b in all_businesses}
    all_artist_map = {a["artist_id"]: a for a in all_artists}
    owner_to_business = {b["owner_id"]: b for b in all_businesses}
    owner_to_artist = {a["owner_id"]: a for a in all_artists}
    
    # Fetch all users first to get their locations
    post_user_ids = list({p.get("user_id") for p in posts if p and p.get("user_id")})
    location_users = await db.users.find(
        {"user_id": {"$in": post_user_ids}}, {"_id": 0, "user_id": 1, "latitude": 1, "longitude": 1}
    ).to_list(len(post_user_ids) + 1)
    user_location_map = {u["user_id"]: u for u in location_users}
    
    def in_bounds(lat, lng):
        return lat and lng and min_lat <= lat <= max_lat and min_lng <= lng <= max_lng
    
    # Filter posts based on map bounds
    if use_bounds and posts:
        filtered_posts = []
        for post in posts:
            include_post = False
            
            # Check if post is from a user with location in the area
            if post.get("actor_type") != "business" and post.get("actor_type") != "artist":
                user = user_location_map.get(post.get("user_id"))
                if user and in_bounds(user.get("latitude"), user.get("longitude")):
                    include_post = True
            
            # Check if post is tagged with a business in the area
            if not include_post and post.get("tagged_business_ids"):
                for biz_id in post["tagged_business_ids"]:
                    if biz_id in all_business_map:
                        biz = all_business_map[biz_id]
                        if in_bounds(biz.get("latitude"), biz.get("longitude")):
                            include_post = True
                            break
            
            # Check if post is from an artist in the area
            if not include_post and post.get("actor_type") == "artist" and post.get("actor_id"):
                if post["actor_id"] in all_artist_map:
                    artist = all_artist_map[post["actor_id"]]
                    if in_bounds(artist.get("latitude"), artist.get("longitude")):
                        include_post = True
            
            # Check if post is from a business in the area
            if not include_post and post.get("actor_type") == "business" and post.get("actor_id"):
                if post["actor_id"] in all_business_map:
                    biz = all_business_map[post["actor_id"]]
                    if in_bounds(biz.get("latitude"), biz.get("longitude")):
                        include_post = True
            
            # Check if post user owns a business/artist in the area
            if not include_post:
                user_id = post.get("user_id")
                if user_id in owner_to_business:
                    biz = owner_to_business[user_id]
                    if in_bounds(biz.get("latitude"), biz.get("longitude")):
                        include_post = True
                if not include_post and user_id in owner_to_artist:
                    artist = owner_to_artist[user_id]
                    if in_bounds(artist.get("latitude"), artist.get("longitude")):
                        include_post = True
            
            if include_post:
                filtered_posts.append(post)
        
        posts = filtered_posts[:100]
    
    # Fetch tagged business info for posts
    all_tagged_business_ids = []
    for post in posts:
        if post.get("tagged_business_ids"):
            all_tagged_business_ids.extend(post["tagged_business_ids"])
    
    tagged_businesses_map = {}
    if all_tagged_business_ids:
        businesses_cursor = await db.businesses.find(
            {"business_id": {"$in": list(set(all_tagged_business_ids))}},
            {"_id": 0, "business_id": 1, "name": 1, "logo_image": 1, "latitude": 1, "longitude": 1}
        ).to_list(100)
        tagged_businesses_map = {b["business_id"]: b for b in businesses_cursor}
    
    # Get upcoming events
    event_query = {
        "start_time": {"$gte": now_utc()},
        "is_hidden": {"$ne": True}
    }
    if excluded_user_ids:
        event_query["creator_id"] = {"$nin": excluded_user_ids}
    
    if event_start_after:
        try:
            start_date = datetime.fromisoformat(event_start_after.replace("Z", "+00:00"))
            event_query["start_time"]["$gte"] = start_date
        except ValueError:
            pass
    
    if event_start_before:
        try:
            end_date = datetime.fromisoformat(event_start_before.replace("Z", "+00:00"))
            event_query["start_time"]["$lte"] = end_date
        except ValueError:
            pass
    
    all_events = await db.events.find(
        event_query, {"_id": 0}
    ).sort("start_time", 1).to_list(100)
    
    # Filter events based on location
    if use_bounds:
        events = []
        for event in all_events:
            event_lat = None
            event_lng = None
            
            if event.get("latitude") and event.get("longitude"):
                event_lat = event["latitude"]
                event_lng = event["longitude"]
            elif event.get("business_id") and event["business_id"] in all_business_map:
                biz = all_business_map[event["business_id"]]
                event_lat = biz.get("latitude")
                event_lng = biz.get("longitude")
            elif event.get("artist_id") and event["artist_id"] in all_artist_map:
                artist = all_artist_map[event["artist_id"]]
                event_lat = artist.get("latitude")
                event_lng = artist.get("longitude")
            
            if event_lat and event_lng and in_bounds(event_lat, event_lng):
                events.append(event)
    else:
        events = all_events
    
    # Get upcoming activities
    activity_query = {
        "date": {"$gte": now_utc()},
        "is_hidden": {"$ne": True}
    }
    if excluded_user_ids:
        activity_query["creator_id"] = {"$nin": excluded_user_ids}
    
    if activity_date:
        try:
            activity_date_obj = datetime.fromisoformat(activity_date.replace("Z", "+00:00"))
            activity_query["date"]["$gte"] = activity_date_obj
        except ValueError:
            pass
    
    all_activities = await db.activities.find(
        activity_query, {"_id": 0}
    ).sort("date", 1).to_list(100)
    
    # Filter activities based on location
    if use_bounds:
        activities = []
        for activity in all_activities:
            act_lat = None
            act_lng = None
            
            if activity.get("latitude") and activity.get("longitude"):
                act_lat = activity["latitude"]
                act_lng = activity["longitude"]
            elif activity.get("business_id") and activity["business_id"] in all_business_map:
                biz = all_business_map[activity["business_id"]]
                act_lat = biz.get("latitude")
                act_lng = biz.get("longitude")
            
            if act_lat and act_lng and in_bounds(act_lat, act_lng):
                activities.append(activity)
    else:
        activities = all_activities
    
    # Get nearby businesses
    business_radius = radius_km if radius_km else 50
    if latitude and longitude:
        nearby_query = {
            "is_hidden": {"$ne": True},
            "latitude": {"$gte": latitude - 0.5, "$lte": latitude + 0.5},
            "longitude": {"$gte": longitude - 0.5, "$lte": longitude + 0.5}
        }
    else:
        nearby_query = {
            "is_hidden": {"$ne": True}
        }
    
    all_businesses_for_map = await db.businesses.find(
        nearby_query, {"_id": 0}
    ).to_list(100)
    
    # Filter by radius if location provided
    if latitude and longitude and business_radius:
        businesses = []
        for b in all_businesses_for_map:
            b_lat = b.get("latitude")
            b_lng = b.get("longitude")
            if b_lat and b_lng:
                dist = haversine_distance(latitude, longitude, b_lat, b_lng)
                if dist <= business_radius:
                    businesses.append(b)
    else:
        businesses = all_businesses_for_map
    
    # Get artists
    all_artists = await db.artists.find(
        {"is_hidden": {"$ne": True}},
        {"_id": 0}
    ).to_list(100)
    
    # Build response
    from models.post import PostResponse
    post_responses = []
    for post in posts:
        business_info = None
        if post.get("tagged_business_ids"):
            first_biz_id = post["tagged_business_ids"][0]
            if first_biz_id in tagged_businesses_map:
                b = tagged_businesses_map[first_biz_id]
                business_info = {
                    "business_id": b["business_id"],
                    "name": b["name"],
                    "logo_image": b.get("logo_image")
                }
        
        author_doc = await db.users.find_one({"user_id": post["user_id"]}, {"_id": 0})
        if not author_doc:
            author_doc = await db.businesses.find_one({"business_id": post.get("actor_id")}, {"_id": 0}) if post.get("actor_type") == "business" else None
        
        author = build_user_public(author_doc) if author_doc else current_user
        
        post_resp = PostResponse(
            post_id=post["post_id"],
            user_id=post["user_id"],
            business_id=post.get("business_id"),
            actor_type=post.get("actor_type"),
            actor_id=post.get("actor_id"),
            actor_name=post.get("actor_name"),
            actor_avatar=post.get("actor_avatar"),
            media_ratio=post.get("media_ratio"),
            tagged_user_ids=post.get("tagged_user_ids", []),
            tagged_business_ids=post.get("tagged_business_ids", []),
            tagged_artist_ids=post.get("tagged_artist_ids", []),
            text=post.get("text", ""),
            image_base64=post.get("image_base64"),
            image_url=post.get("image_url"),
            video_url=post.get("video_url"),
            video_status=post.get("video_status"),
            mux_asset_id=post.get("mux_asset_id"),
            mux_playback_id=post.get("mux_playback_id"),
            mux_thumbnail_url=post.get("mux_thumbnail_url"),
            youtube_link=post.get("youtube_link"),
            soundcloud_url=post.get("soundcloud_url"),
            created_at=post["created_at"],
            author=author,
            business=business_info,
            likes_count=len(post.get("likes", [])),
            comments_count=len(post.get("comments", [])),
            liked_by_me=False
        )
        post_responses.append(post_resp)
    
    # Build event responses
    from models.event import EventResponse
    from models.business import BusinessSummary
    event_responses = []
    for event in events[:20]:
        business_summary = None
        if event.get("business_id"):
            biz_doc = await db.businesses.find_one(
                {"business_id": event["business_id"]},
                {"_id": 0, "business_id": 1, "name": 1, "category": 1,
                 "root_category": 1, "subcategory": 1, "address": 1,
                 "latitude": 1, "longitude": 1, "logo_image": 1}
            )
            if biz_doc:
                business_summary = BusinessSummary(
                    business_id=biz_doc["business_id"],
                    name=biz_doc["name"],
                    category=biz_doc.get("category", ""),
                    root_category=biz_doc.get("root_category", ""),
                    subcategory=biz_doc.get("subcategory", ""),
                    address=biz_doc.get("address", ""),
                    latitude=biz_doc.get("latitude", 0),
                    longitude=biz_doc.get("longitude", 0),
                    logo_image=biz_doc.get("logo_image")
                )

        artist_info = None
        if event.get("artist_id") and event["artist_id"] in all_artist_map:
            a = all_artist_map[event["artist_id"]]
            artist_info = {
                "artist_id": a["artist_id"],
                "name": a.get("name"),
                "town": a.get("town"),
                "latitude": a.get("latitude"),
                "longitude": a.get("longitude")
            }

        attendees = event.get("attendees", [])
        is_attending = current_user.user_id in attendees if attendees else False

        event_resp = EventResponse(
            event_id=event["event_id"],
            business=business_summary,
            artist=artist_info,
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
            created_at=event.get("created_at", now_utc()),
            attendees_count=len(attendees),
            is_attending=is_attending,
            is_private=event.get("is_private", False),
            theme=event.get("theme"),
            profile_theme=event.get("profile_theme"),
            gallery_images=event.get("gallery_images", []),
            gallery_videos=event.get("gallery_videos", [])
        )
        event_responses.append(event_resp)
    
    # Build business responses
    from models.business import BusinessResponse, BusinessModules
    business_responses = []
    for business in businesses[:20]:
        raw_modules = business.get("enabled_modules", {})
        if isinstance(raw_modules, dict) and not isinstance(raw_modules, BusinessModules):
            enabled_modules = BusinessModules(**raw_modules)
        elif isinstance(raw_modules, BusinessModules):
            enabled_modules = raw_modules
        else:
            enabled_modules = BusinessModules()

        business_resp = BusinessResponse(
            business_id=business["business_id"],
            owner_id=business.get("owner_id", ""),
            name=business["name"],
            category=business.get("category", business.get("root_category", "")),
            root_category=business.get("root_category", ""),
            subcategory=business.get("subcategory", ""),
            description=business.get("description"),
            logo_image=business.get("logo_image"),
            cover_image=business.get("cover_image"),
            phone=business.get("phone"),
            website=business.get("website"),
            email=business.get("email"),
            social_links=business.get("social_links"),
            opening_hours=business.get("opening_hours"),
            gallery_images=business.get("gallery_images", []),
            gallery_videos=business.get("gallery_videos", []),
            tags=business.get("tags", []),
            address=business.get("address") or "",
            latitude=business.get("latitude", 0),
            longitude=business.get("longitude", 0),
            created_at=business.get("created_at", now_utc()),
            enabled_modules=enabled_modules,
            subscription_status=business.get("subscription_status", "trial"),
            trial_expires_at=business.get("trial_expires_at"),
            plan_type=business.get("plan_type"),
            subscription_expires_at=business.get("subscription_expires_at"),
            favorites_count=business.get("favorites_count", 0),
            followers_count=business.get("followers_count", 0),
            theme=business.get("theme")
        )
        business_responses.append(business_resp)
    
    # Build artist responses
    artist_responses = []
    for artist in all_artists[:20]:
        artist_resp = ArtistResponse(
            artist_id=artist["artist_id"],
            owner_id=artist.get("owner_id", ""),
            name=artist["name"],
            bio=artist.get("bio"),
            genres=artist.get("genres", []),
            socials=artist.get("socials", {}),
            town=artist.get("town"),
            address=artist.get("address"),
            latitude=artist.get("latitude"),
            longitude=artist.get("longitude"),
            gallery_images=artist.get("gallery_images", []),
            fan_gallery=artist.get("fan_gallery", []),
            video_urls=artist.get("video_urls", []),
            profile_photo=artist.get("profile_photo"),
            cover_photo=artist.get("cover_photo"),
            created_at=artist.get("created_at", datetime.utcnow()),
            followers_count=artist.get("followers_count", 0),
            theme=artist.get("theme")
        )
        artist_responses.append(artist_resp)
    
    # Build activity responses
    from models.activity import ActivityResponse, ActivityInvite
    activity_responses = []
    for activity in activities[:20]:
        raw_invites = activity.get("invites", [])
        invites = []
        for inv in raw_invites:
            if isinstance(inv, dict):
                invites.append(ActivityInvite(**inv))
            elif isinstance(inv, ActivityInvite):
                invites.append(inv)

        my_status = "none"
        if activity.get("creator_id") == current_user.user_id:
            my_status = "creator"
        else:
            for inv in raw_invites:
                if isinstance(inv, dict) and inv.get("user_id") == current_user.user_id:
                    my_status = inv.get("status", "none")
                    break

        creator_doc = await db.users.find_one(
            {"user_id": activity.get("creator_id")}, {"_id": 0, "user_id": 1, "name": 1, "profile_photo": 1}
        )
        creator_info = None
        if creator_doc:
            creator_info = {
                "user_id": creator_doc["user_id"],
                "name": creator_doc.get("name", "Unknown"),
                "profile_photo": creator_doc.get("profile_photo")
            }

        activity_resp = ActivityResponse(
            activity_id=activity["activity_id"],
            creator_id=activity.get("creator_id", ""),
            title=activity["title"],
            description=activity.get("description"),
            date=activity.get("date", ""),
            time=activity.get("time", ""),
            location=activity.get("location", ""),
            cover_image_url=activity.get("cover_image_url"),
            image_urls=activity.get("image_urls", []),
            latitude=activity.get("latitude"),
            longitude=activity.get("longitude"),
            max_attendees=activity.get("max_attendees"),
            invites=invites,
            created_at=activity.get("created_at", now_utc()),
            my_status=my_status,
            is_creator=activity.get("creator_id") == current_user.user_id,
            is_private=activity.get("is_private", False),
            invitation_code=activity.get("invitation_code"),
            password=activity.get("password"),
            theme=activity.get("theme"),
            custom_theme=activity.get("custom_theme"),
            tagged_business=None,
            gallery_images=activity.get("gallery_images", []),
            gallery_videos=activity.get("gallery_videos", []),
            profile_theme=activity.get("profile_theme"),
            creator=creator_info
        )
        activity_responses.append(activity_resp)
    
    return HomeFeedResponse(
        posts=post_responses,
        events=event_responses,
        businesses=business_responses,
        artists=artist_responses,
        activities=activity_responses
    )