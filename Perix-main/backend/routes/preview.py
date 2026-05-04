"""Public preview endpoints for shared links (no authentication required)."""
from fastapi import APIRouter, HTTPException
from database import db
from bson import ObjectId

router = APIRouter(prefix="/preview", tags=["preview"])


def is_valid_object_id(id_str: str) -> bool:
    """Check if string is a valid MongoDB ObjectId."""
    try:
        ObjectId(id_str)
        return True
    except:
        return False


@router.get("/activity/{activity_id}")
async def get_activity_preview(activity_id: str):
    """Get public preview of an activity for shared links."""
    # Try to find by activity_id field first, then by _id
    activity = await db.activities.find_one({"activity_id": activity_id}, {"_id": 0})
    
    if not activity and is_valid_object_id(activity_id):
        activity = await db.activities.find_one({"_id": ObjectId(activity_id)})
        if activity:
            activity["_id"] = str(activity["_id"])
    
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    
    # Get creator info
    creator_name = None
    if activity.get("creator_id"):
        creator = await db.users.find_one({"user_id": activity["creator_id"]}, {"_id": 0, "display_name": 1, "name": 1})
        if creator:
            creator_name = creator.get("display_name") or creator.get("name", "Unknown")
    
    # Count participants
    participant_count = len(activity.get("invites", []))
    
    return {
        "activity_id": activity.get("activity_id", ""),
        "title": activity.get("title", ""),
        "description": activity.get("description"),
        "location": activity.get("location"),
        "date": activity.get("date"),
        "cover_image": activity.get("cover_image_url") or (activity.get("image_urls", [None])[0] if activity.get("image_urls") else None) or activity.get("image_base64") or activity.get("cover_image"),
        "is_private": activity.get("is_private", False),
        "creator_name": creator_name,
        "participant_count": participant_count,
        "theme": activity.get("theme"),
    }


@router.get("/event/{event_id}")
async def get_event_preview(event_id: str):
    """Get public preview of an event for shared links."""
    event = await db.events.find_one({"event_id": event_id}, {"_id": 0})
    
    if not event and is_valid_object_id(event_id):
        event = await db.events.find_one({"_id": ObjectId(event_id)})
        if event:
            event["_id"] = str(event["_id"])
    
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Get organizer info
    organizer_name = None
    if event.get("user_id"):
        organizer = await db.users.find_one({"user_id": event["user_id"]}, {"_id": 0, "display_name": 1, "name": 1})
        if organizer:
            organizer_name = organizer.get("display_name") or organizer.get("name")
    elif event.get("business_id"):
        business = await db.businesses.find_one({"business_id": event["business_id"]}, {"_id": 0, "name": 1})
        if business:
            organizer_name = business.get("name")
    elif event.get("artist_id"):
        artist = await db.artists.find_one({"artist_id": event["artist_id"]}, {"_id": 0, "name": 1})
        if artist:
            organizer_name = artist.get("name")
    
    # Count attendees
    attendee_count = len(event.get("attendees", []))
    
    return {
        "event_id": event.get("event_id", ""),
        "title": event.get("title", ""),
        "description": event.get("description"),
        "location": event.get("location"),
        "date": event.get("start_time") or event.get("date"),
        "cover_image": event.get("cover_image_url") or (event.get("image_urls", [None])[0] if event.get("image_urls") else None) or event.get("image_base64") or event.get("cover_image"),
        "theme": event.get("theme"),
        "organizer_name": organizer_name,
        "attendee_count": attendee_count,
    }


@router.get("/user/{user_id}")
async def get_user_preview(user_id: str):
    """Get public preview of a user profile for shared links."""
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    
    if not user and is_valid_object_id(user_id):
        user = await db.users.find_one({"_id": ObjectId(user_id)}, {"password_hash": 0})
        if user:
            user["_id"] = str(user["_id"])
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.get("is_hidden"):
        raise HTTPException(status_code=404, detail="User not found")
    user_id_val = user.get("user_id", user_id)
    friends_list = user.get("friends", [])
    friend_count = len([
        f for f in friends_list
        if isinstance(f, dict) and f.get("entity_type") == "user"
    ])
    
    # Count posts
    post_count = await db.posts.count_documents({"user_id": user_id_val})
    
    return {
        "user_id": user_id_val,
        "display_name": user.get("display_name") or user.get("name", ""),
        "profile_image": user.get("profile_photo") or user.get("picture"),
        "bio": user.get("bio"),
        "location": user.get("location"),
        "friend_count": friend_count,
        "post_count": post_count,
    }


@router.get("/artist/{artist_id}")
async def get_artist_preview(artist_id: str):
    """Get public preview of an artist profile for shared links."""
    artist = await db.artists.find_one({"artist_id": artist_id}, {"_id": 0})
    
    if not artist and is_valid_object_id(artist_id):
        artist = await db.artists.find_one({"_id": ObjectId(artist_id)})
        if artist:
            artist["_id"] = str(artist["_id"])
    
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    
    # Count followers - artists don't have a separate followers collection, 
    # so we'll count users who have this artist in their favorites
    follower_count = 0  # Placeholder - implement if needed
    
    return {
        "artist_id": artist.get("artist_id", ""),
        "name": artist.get("name", ""),
        "profile_image": artist.get("profile_photo"),
        "cover_image": artist.get("cover_photo"),
        "bio": artist.get("bio"),
        "genres": artist.get("genres", []),
        "town": artist.get("town"),
        "follower_count": follower_count,
    }


@router.get("/business/{business_id}")
async def get_business_preview(business_id: str):
    """Get public preview of a business profile for shared links."""
    business = await db.businesses.find_one({"business_id": business_id}, {"_id": 0})
    
    if not business and is_valid_object_id(business_id):
        business = await db.businesses.find_one({"_id": ObjectId(business_id)})
        if business:
            business["_id"] = str(business["_id"])
    
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    # Count followers/favorites
    follower_count = business.get("favorites_count", 0)
    
    return {
        "business_id": business.get("business_id", ""),
        "name": business.get("name", ""),
        "profile_image": business.get("logo_image") or business.get("profile_photo"),
        "cover_image": business.get("cover_image"),
        "description": business.get("description"),
        "address": business.get("address"),
        "category": business.get("root_category"),
        "subcategory": business.get("subcategory"),
        "follower_count": follower_count,
    }
