"""Artist routes."""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Dict, Any
from math import radians, cos, sin, asin, sqrt
import logging

logger = logging.getLogger(__name__)

from database import db
from models.user import UserPublic
from models.artist import (
    ArtistCreate, ArtistResponse, ArtistUpdate, ArtistDetailResponse,
    BookingRequestCreate, BookingRequestResponse
)
from models.event import EventResponse
from models.post import PostResponse
from utils.helpers import generate_id, now_utc
from routes.dependencies import get_current_user, build_user_public, geocode_town

router = APIRouter(prefix="/artists", tags=["Artists"])


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points in km."""
    if None in (lat1, lon1, lat2, lon2):
        return float('inf')
    R = 6371
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    c = 2 * asin(sqrt(a))
    return R * c


def build_artist_summary(artist_doc: Dict) -> Dict[str, Any]:
    return {
        "artist_id": artist_doc["artist_id"],
        "name": artist_doc["name"],
        "town": artist_doc.get("town"),
        "latitude": artist_doc.get("latitude"),
        "longitude": artist_doc.get("longitude"),
    }


@router.post("", response_model=ArtistResponse)
async def create_artist(
    payload: ArtistCreate, current_user: UserPublic = Depends(get_current_user)
):
    existing = await db.artists.find_one(
        {"owner_id": current_user.user_id}, {"_id": 0}
    )
    if existing:
        raise HTTPException(status_code=403, detail="Artist profile already exists")
    
    latitude = payload.latitude
    longitude = payload.longitude
    
    if payload.town and not (latitude and longitude):
        coords = await geocode_town(payload.town)
        if coords:
            latitude = coords["latitude"]
            longitude = coords["longitude"]
    
    # Build GeoJSON location if coordinates are available
    location_geojson = None
    if latitude is not None and longitude is not None:
        location_geojson = {
            "type": "Point",
            "coordinates": [longitude, latitude]  # GeoJSON uses [lng, lat] order
        }
    
    artist_doc = {
        "artist_id": generate_id("artist"),
        "owner_id": current_user.user_id,
        "name": payload.name,
        "bio": payload.bio,
        "genres": payload.genres,
        "socials": payload.socials,
        "town": payload.town,
        "address": payload.address,
        "latitude": latitude,
        "longitude": longitude,
        "location": location_geojson,  # GeoJSON for geospatial queries
        "gallery_images": payload.gallery_images,
        "fan_gallery": payload.fan_gallery,
        "video_urls": payload.video_urls,
        "profile_photo": payload.profile_photo,
        "cover_photo": payload.cover_photo,
        "cover_focal_point": payload.cover_focal_point.dict() if payload.cover_focal_point else {"x": 0.5, "y": 0.5},
        "created_at": now_utc(),
    }
    await db.artists.insert_one(artist_doc)
    return ArtistResponse(**artist_doc)


@router.put("/{artist_id}", response_model=ArtistResponse)
async def update_artist(
    artist_id: str,
    payload: ArtistUpdate,
    current_user: UserPublic = Depends(get_current_user),
):
    artist = await db.artists.find_one(
        {"artist_id": artist_id, "owner_id": current_user.user_id}, {"_id": 0}
    )
    if not artist:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = {key: value for key, value in payload.dict().items() if value is not None}
    
    if "town" in update_data and not ("latitude" in update_data and "longitude" in update_data):
        coords = await geocode_town(update_data["town"])
        if coords:
            update_data["latitude"] = coords["latitude"]
            update_data["longitude"] = coords["longitude"]
    
    # Update GeoJSON location if coordinates changed
    new_lat = update_data.get("latitude", artist.get("latitude"))
    new_lng = update_data.get("longitude", artist.get("longitude"))
    if new_lat is not None and new_lng is not None:
        update_data["location"] = {
            "type": "Point",
            "coordinates": [new_lng, new_lat]  # GeoJSON uses [lng, lat] order
        }
    
    if update_data:
        await db.artists.update_one({"artist_id": artist_id}, {"$set": update_data})
        artist.update(update_data)
    return ArtistResponse(**artist)


from models.user import ThemeUpdate

@router.put("/{artist_id}/theme")
async def update_artist_theme(
    artist_id: str,
    theme: ThemeUpdate,
    current_user: UserPublic = Depends(get_current_user),
):
    """Update an artist's profile theme colors."""
    artist = await db.artists.find_one({"artist_id": artist_id}, {"_id": 0})
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    if artist["owner_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
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
    
    await db.artists.update_one(
        {"artist_id": artist_id},
        {"$set": {"theme": theme_data}}
    )
    
    return {"success": True, "message": "Artist theme updated successfully"}


@router.get("", response_model=List[ArtistResponse])
async def list_artists(
    current_user: UserPublic = Depends(get_current_user),
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    radius_km: Optional[float] = 50,
    min_lat: Optional[float] = None,
    max_lat: Optional[float] = None,
    min_lng: Optional[float] = None,
    max_lng: Optional[float] = None,
):
    def is_in_bounds(lat: float, lng: float) -> bool:
        if lat is None or lng is None:
            return False
        if all([min_lat, max_lat, min_lng, max_lng]):
            return min_lat <= lat <= max_lat and min_lng <= lng <= max_lng
        if latitude is not None and longitude is not None and radius_km:
            return haversine_distance(latitude, longitude, lat, lng) <= radius_km
        return True
    
    use_bounds = any([min_lat, max_lat, min_lng, max_lng])
    artists = await db.artists.find({}, {"_id": 0}).to_list(1000)
    
    if use_bounds or (latitude is not None and longitude is not None):
        artists = [
            a for a in artists
            if a.get("latitude") is not None and a.get("longitude") is not None
            and is_in_bounds(a["latitude"], a["longitude"])
        ]
    
    return [ArtistResponse(**artist) for artist in artists]


@router.get("/my", response_model=Optional[ArtistResponse])
async def get_my_artist(current_user: UserPublic = Depends(get_current_user)):
    artist = await db.artists.find_one({"owner_id": current_user.user_id}, {"_id": 0})
    return ArtistResponse(**artist) if artist else None


@router.get("/{artist_id}", response_model=ArtistDetailResponse)
async def get_artist(artist_id: str, current_user: UserPublic = Depends(get_current_user)):
    artist = await db.artists.find_one({"artist_id": artist_id}, {"_id": 0})
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    
    events = await db.events.find(
        {"artist_id": artist_id}, {"_id": 0}
    ).sort("start_time", 1).to_list(100)
    
    event_responses = []
    for event in events:
        business = None
        if event.get("business_id"):
            business_doc = await db.businesses.find_one(
                {"business_id": event["business_id"]}, {"_id": 0}
            )
            if business_doc:
                from routes.businesses import build_business_summary
                business = build_business_summary(business_doc)
        
        event_responses.append(
            EventResponse(
                event_id=event["event_id"],
                business=business,
                artist=build_artist_summary(artist),
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
        )
    
    # DEBUG: Log what we're searching for
    logger.debug(f"[DEBUG] get_artist: Searching posts for artist_id={artist_id}")
    
    # Fetch posts where actor_type is "artist" and actor_id matches
    # Also check for legacy posts that might have actor_id set but wrong actor_type
    artist_posts = await db.posts.find(
        {"$or": [
            {"actor_type": "artist", "actor_id": artist_id},
            {"actor_id": artist_id}  # Fallback: any posts with this actor_id
        ]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    logger.debug(f"[DEBUG] get_artist: Found {len(artist_posts)} posts for artist_id={artist_id}")
    for p in artist_posts[:3]:
        logger.debug(f"[DEBUG] Post: post_id={p.get('post_id')}, actor_type={p.get('actor_type')}, actor_id={p.get('actor_id')}")
    
    # Get user info for post authors
    author_ids = list({post.get("user_id") for post in artist_posts})
    author_users = await db.users.find(
        {"user_id": {"$in": list(author_ids)}},
        {"_id": 0, "password_hash": 0}
    ).to_list(1000) if author_ids else []
    author_map = {u["user_id"]: u for u in author_users}
    
    from routes.posts import build_post_response
    post_responses = []
    for post in artist_posts:
        author = author_map.get(post.get("user_id"))
        if author:
            from routes.dependencies import build_user_public
            author = build_user_public(author)
        post_responses.append(build_post_response(post, author, current_user, "artist", artist_id))
    
    return ArtistDetailResponse(
        artist=ArtistResponse(**artist),
        events=event_responses,
        posts=post_responses,
    )


@router.get("/{artist_id}/fan-gallery", response_model=List[PostResponse])
async def get_artist_fan_gallery(
    artist_id: str, current_user: UserPublic = Depends(get_current_user)
):
    """Get posts where this artist is tagged (fan gallery)"""
    artist = await db.artists.find_one({"artist_id": artist_id}, {"_id": 0})
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    
    hidden_posts = artist.get("hidden_fan_posts", [])
    
    posts = await db.posts.find(
        {
            "tagged_artist_ids": artist_id,
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


@router.post("/{artist_id}/fan-gallery/{post_id}/hide")
async def hide_artist_fan_gallery_post(
    artist_id: str, post_id: str, current_user: UserPublic = Depends(get_current_user)
):
    """Hide a post from artist fan gallery (owner only)"""
    artist = await db.artists.find_one(
        {"artist_id": artist_id, "owner_id": current_user.user_id}, {"_id": 0}
    )
    if not artist:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    hidden_posts = artist.get("hidden_fan_posts", [])
    if post_id not in hidden_posts:
        hidden_posts.append(post_id)
        await db.artists.update_one(
            {"artist_id": artist_id},
            {"$set": {"hidden_fan_posts": hidden_posts}}
        )
    return {"success": True}


@router.post("/{artist_id}/fan-gallery/{post_id}/unhide")
async def unhide_artist_fan_gallery_post(
    artist_id: str, post_id: str, current_user: UserPublic = Depends(get_current_user)
):
    """Unhide a post from artist fan gallery (owner only)"""
    artist = await db.artists.find_one(
        {"artist_id": artist_id, "owner_id": current_user.user_id}, {"_id": 0}
    )
    if not artist:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    hidden_posts = artist.get("hidden_fan_posts", [])
    if post_id in hidden_posts:
        hidden_posts.remove(post_id)
        await db.artists.update_one(
            {"artist_id": artist_id},
            {"$set": {"hidden_fan_posts": hidden_posts}}
        )
    return {"success": True}


@router.post(
    "/{artist_id}/booking-requests",
    response_model=BookingRequestResponse,
)
async def create_booking_request(
    artist_id: str,
    payload: BookingRequestCreate,
    current_user: UserPublic = Depends(get_current_user),
):
    artist = await db.artists.find_one({"artist_id": artist_id}, {"_id": 0})
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    request_doc = {
        "request_id": generate_id("bookreq"),
        "artist_id": artist_id,
        "requester_id": current_user.user_id,
        "event_date": payload.event_date,
        "message": payload.message,
        "contact_email": payload.contact_email,
        "status": "pending",
        "created_at": now_utc(),
    }
    await db.booking_requests.insert_one(request_doc)
    return BookingRequestResponse(**request_doc)


@router.get(
    "/{artist_id}/booking-requests",
    response_model=List[BookingRequestResponse],
)
async def list_booking_requests(
    artist_id: str, current_user: UserPublic = Depends(get_current_user)
):
    artist = await db.artists.find_one(
        {"artist_id": artist_id, "owner_id": current_user.user_id}, {"_id": 0}
    )
    if not artist:
        raise HTTPException(status_code=403, detail="Not authorized")
    requests = await db.booking_requests.find(
        {"artist_id": artist_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return [BookingRequestResponse(**req) for req in requests]


@router.delete("/{artist_id}")
async def delete_artist(
    artist_id: str, current_user: UserPublic = Depends(get_current_user)
):
    """Delete an artist profile and all associated content (owner only)"""
    artist = await db.artists.find_one(
        {"artist_id": artist_id, "owner_id": current_user.user_id}, {"_id": 0}
    )
    if not artist:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Delete all related content
    await db.events.delete_many({"artist_id": artist_id})
    await db.posts.delete_many({"actor_type": "artist", "actor_id": artist_id})
    await db.stories.delete_many({"actor_type": "artist", "actor_id": artist_id})
    await db.booking_requests.delete_many({"artist_id": artist_id})
    
    # Delete the artist profile
    await db.artists.delete_one({"artist_id": artist_id})
    
    return {"success": True, "message": "Artist profile deleted successfully"}


# ============== REPORT ARTIST ==============

from pydantic import BaseModel

class ReportArtistRequest(BaseModel):
    reason: str

@router.post("/{artist_id}/report")
async def report_artist(
    artist_id: str,
    request: ReportArtistRequest,
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Report an artist. The artist is flagged for admin review.
    """
    # Check if artist exists
    artist = await db.artists.find_one({"artist_id": artist_id}, {"_id": 0})
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    
    # Check if user owns this artist profile (can't report yourself)
    if artist.get("user_id") == current_user.user_id:
        raise HTTPException(status_code=400, detail="Cannot report your own profile")
    
    # Check if already reported by this user
    existing_report = await db.reports.find_one({
        "reporter_id": current_user.user_id,
        "reported_entity_id": artist_id,
        "entity_type": "artist"
    })
    if existing_report:
        raise HTTPException(status_code=400, detail="You have already reported this artist")
    
    # Create report
    report_doc = {
        "report_id": generate_id("report"),
        "reporter_id": current_user.user_id,
        "reported_entity_id": artist_id,
        "entity_type": "artist",
        "entity_name": artist.get("name", "Unknown"),
        "reason": request.reason,
        "reported_at": now_utc(),
        "status": "pending"
    }
    await db.reports.insert_one(report_doc)
    
    # Flag the artist as reported (but don't hide immediately)
    await db.artists.update_one(
        {"artist_id": artist_id},
        {"$set": {
            "is_reported": True,
            "reported_at": now_utc()
        }}
    )
    
    return {
        "success": True, 
        "message": "Artist reported. Our team will review it shortly.",
        "report_id": report_doc["report_id"]
    }


