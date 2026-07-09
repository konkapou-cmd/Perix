"""Events routes."""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Dict, Any
from datetime import timedelta

from database import db
from models.user import UserPublic
from models.event import EventCreate, EventResponse, EventUpdate, EventPublicResponse, EventAttendRequest, EVENT_THEMES
from models.message import ChatMessageCreate, ChatMessageResponse
from utils.helpers import generate_id, now_utc
from routes.dependencies import get_current_user, build_user_public
from routes.businesses import is_subscription_active
from routes.ws import ws_broadcast_channel_message

router = APIRouter(prefix="/events", tags=["Events"])


@router.get("/themes")
async def get_event_themes():
    """Get list of available event themes."""
    return EVENT_THEMES


def build_artist_summary(artist_doc: Dict) -> Dict[str, Any]:
    return {
        "artist_id": artist_doc["artist_id"],
        "name": artist_doc["name"],
        "town": artist_doc.get("town"),
        "latitude": artist_doc.get("latitude"),
        "longitude": artist_doc.get("longitude"),
    }


async def build_tagged_artists(artist_ids: List[str]) -> tuple:
    """Look up artist summaries for a list of artist IDs."""
    if not artist_ids:
        return artist_ids, None
    docs = await db.artists.find(
        {"artist_id": {"$in": artist_ids}},
        {"_id": 0, "artist_id": 1, "name": 1, "profile_photo": 1}
    ).to_list(50)
    summaries = [{ "artist_id": d["artist_id"], "name": d["name"], "profile_photo": d.get("profile_photo") } for d in docs]
    return artist_ids, summaries or None


@router.post("", response_model=EventResponse)
async def create_event(
    payload: EventCreate, current_user: UserPublic = Depends(get_current_user)
):
    business = None
    artist = None
    
    if payload.business_id:
        business = await db.businesses.find_one(
            {"business_id": payload.business_id, "owner_id": current_user.user_id},
            {"_id": 0},
        )
        if not business:
            raise HTTPException(status_code=403, detail="Not authorized")
        
        if not is_subscription_active(business):
            raise HTTPException(
                status_code=403,
                detail="Premium subscription required to create events"
            )
    
    if payload.artist_id:
        artist = await db.artists.find_one(
            {"artist_id": payload.artist_id, "owner_id": current_user.user_id},
            {"_id": 0},
        )
        if not artist:
            raise HTTPException(status_code=403, detail="Not authorized")
    
    if not business and not artist:
        raise HTTPException(
            status_code=400,
            detail="Either business_id or artist_id required",
        )
    
    cover_image_url = payload.cover_image_url or (payload.image_urls[0] if payload.image_urls else None)
    
    event_doc = {
        "event_id": generate_id("event"),
        "creator_id": current_user.user_id,
        "business_id": payload.business_id,
        "artist_id": payload.artist_id,
        "title": payload.title,
        "description": payload.description,
        "cover_image_url": cover_image_url,
        "image_urls": payload.image_urls or [],
        "video_url": payload.video_url,
        "start_time": payload.start_time,
        "end_time": payload.end_time,
        "location": payload.location,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "theme": payload.theme,
        "gallery_images": payload.gallery_images or [],
        "gallery_videos": payload.gallery_videos or [],
        "is_private": payload.is_private,
        "password": payload.password,
        "tagged_artist_ids": payload.tagged_artist_ids or [],
        "cover_focal_point": payload.cover_focal_point or {"x": 0.5, "y": 0.5},
        "created_at": now_utc(),
        "attendees": [],
    }
    await db.events.insert_one(event_doc)
    
    tagged_artist_ids, tagged_artists = await build_tagged_artists(payload.tagged_artist_ids or [])
    
    from routes.businesses import build_business_summary
    return EventResponse(
        event_id=event_doc["event_id"],
        business=build_business_summary(business) if business else None,
        artist=build_artist_summary(artist) if artist else None,
        title=event_doc["title"],
        description=event_doc.get("description"),
        cover_image_url=event_doc.get("cover_image_url"),
        image_urls=event_doc.get("image_urls", []),
        video_url=event_doc.get("video_url"),
        start_time=event_doc["start_time"],
        end_time=event_doc.get("end_time"),
        location=event_doc.get("location"),
        latitude=event_doc.get("latitude"),
        longitude=event_doc.get("longitude"),
        created_at=event_doc["created_at"],
        theme=event_doc.get("theme"),
        is_private=event_doc.get("is_private", False),
        profile_theme=business.get("theme") if business else None,
        gallery_images=event_doc.get("gallery_images", []),
        gallery_videos=event_doc.get("gallery_videos", []),
        tagged_artist_ids=tagged_artist_ids,
        tagged_artists=tagged_artists or None,
    )


@router.get("", response_model=List[EventResponse])
async def list_events(
    business_id: Optional[str] = None,
    artist_id: Optional[str] = None,
    theme: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    radius_km: Optional[float] = 50,
    min_lat: Optional[float] = None,
    max_lat: Optional[float] = None,
    min_lng: Optional[float] = None,
    max_lng: Optional[float] = None,
    start_after: Optional[str] = None,  # ISO date string
    start_before: Optional[str] = None,  # ISO date string
    current_user: UserPublic = Depends(get_current_user),
):
    from math import radians, cos, sin, asin, sqrt
    
    def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
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
    
    def is_in_bounds(lat: float, lng: float) -> bool:
        if None in (lat, lng):
            return False
        if all([min_lat, max_lat, min_lng, max_lng]):
            return min_lat <= lat <= max_lat and min_lng <= lng <= max_lng
        if latitude is not None and longitude is not None and radius_km:
            return haversine(latitude, longitude, lat, lng) <= radius_km
        return True
    
    query: Dict[str, Any] = {}
    if business_id:
        query["business_id"] = business_id
    if artist_id:
        query["artist_id"] = artist_id
    if theme:
        query["theme"] = theme
    
    # Add date filtering
    if start_after:
        from datetime import datetime
        try:
            start_date = datetime.fromisoformat(start_after.replace("Z", "+00:00"))
            query["start_time"] = {"$gte": start_date}
        except ValueError:
            pass
    elif not start_after and not start_before:
        # Default: only show future events
        query["start_time"] = {"$gte": now_utc()}
    
    if start_before:
        from datetime import datetime
        try:
            end_date = datetime.fromisoformat(start_before.replace("Z", "+00:00"))
            if "start_time" in query:
                query["start_time"]["$lte"] = end_date
            else:
                query["start_time"] = {"$lte": end_date}
        except ValueError:
            pass
    
    use_bounds = any([min_lat, max_lat, min_lng, max_lng])
    
    events = await db.events.find(query, {"_id": 0}).sort("start_time", 1).to_list(500)
    
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
    
    response = []
    from routes.businesses import build_business_summary
    for event in events:
        event_lat = event.get("latitude")
        event_lng = event.get("longitude")
        
        if event_lat is None or event_lng is None:
            business = business_map.get(event.get("business_id"))
            artist = artist_map.get(event.get("artist_id"))
            if business and business.get("latitude"):
                event_lat = business.get("latitude")
                event_lng = business.get("longitude")
            elif artist and artist.get("latitude"):
                event_lat = artist.get("latitude")
                event_lng = artist.get("longitude")
        
        if use_bounds or (latitude is not None and longitude is not None):
            if event_lat is None or event_lng is None:
                continue
            if not is_in_bounds(event_lat, event_lng):
                continue
        
        business = business_map.get(event.get("business_id"))
        artist = artist_map.get(event.get("artist_id"))
        response.append(
            EventResponse(
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
                tagged_artist_ids=event.get("tagged_artist_ids") or [],
            )
        )
    return response


@router.get("/{event_id}", response_model=EventResponse)
async def get_event_detail(
    event_id: str, current_user: UserPublic = Depends(get_current_user)
):
    event = await db.events.find_one({"event_id": event_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    business = None
    artist = None
    
    if event.get("business_id"):
        business = await db.businesses.find_one(
            {"business_id": event["business_id"]}, {"_id": 0}
        )
    if event.get("artist_id"):
        artist = await db.artists.find_one(
            {"artist_id": event["artist_id"]}, {"_id": 0}
        )
    
    attendees = event.get("attendees", [])
    is_attending = current_user.user_id in attendees
    
    tagged_artist_ids, tagged_artists = await build_tagged_artists(event.get("tagged_artist_ids") or [])
    
    from routes.businesses import build_business_summary
    return EventResponse(
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
        attendees_count=len(attendees),
        is_attending=is_attending,
        is_private=event.get("is_private", False),
        theme=event.get("theme"),
        profile_theme=business.get("theme") if business else None,
        gallery_images=event.get("gallery_images", []),
        gallery_videos=event.get("gallery_videos", []),
        tagged_artist_ids=tagged_artist_ids,
        tagged_artists=tagged_artists,
    )


@router.get("/{event_id}/public", response_model=EventPublicResponse)
async def get_event_public(event_id: str):
    """Public event endpoint - no authentication required"""
    event = await db.events.find_one({"event_id": event_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    business = None
    artist = None
    
    if event.get("business_id"):
        business = await db.businesses.find_one(
            {"business_id": event["business_id"]}, {"_id": 0}
        )
    if event.get("artist_id"):
        artist = await db.artists.find_one(
            {"artist_id": event["artist_id"]}, {"_id": 0}
        )
    
    attendees = event.get("attendees", [])
    
    from routes.businesses import build_business_summary
    return EventPublicResponse(
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
        attendees_count=len(attendees),
        is_private=event.get("is_private", False),
        theme=event.get("theme"),
        profile_theme=business.get("theme") if business else None,
        gallery_images=event.get("gallery_images", []),
        gallery_videos=event.get("gallery_videos", []),
    )


@router.put("/{event_id}", response_model=EventResponse)
async def update_event(
    event_id: str,
    payload: EventUpdate,
    current_user: UserPublic = Depends(get_current_user),
):
    event = await db.events.find_one({"event_id": event_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    authorized = False
    if event.get("business_id"):
        business = await db.businesses.find_one(
            {"business_id": event["business_id"], "owner_id": current_user.user_id},
            {"_id": 0},
        )
        if business:
            authorized = True
    if event.get("artist_id"):
        artist = await db.artists.find_one(
            {"artist_id": event["artist_id"], "owner_id": current_user.user_id},
            {"_id": 0},
        )
        if artist:
            authorized = True
    
    if not authorized:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = {key: value for key, value in payload.dict().items() if value is not None}
    
    if update_data:
        await db.events.update_one({"event_id": event_id}, {"$set": update_data})
        event.update(update_data)
    
    business = None
    artist = None
    if event.get("business_id"):
        business = await db.businesses.find_one(
            {"business_id": event["business_id"]}, {"_id": 0}
        )
    if event.get("artist_id"):
        artist = await db.artists.find_one(
            {"artist_id": event["artist_id"]}, {"_id": 0}
        )
    
    from routes.businesses import build_business_summary
    tagged_artist_ids, tagged_artists = await build_tagged_artists(event.get("tagged_artist_ids") or [])
    return EventResponse(
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
        is_private=event.get("is_private", False),
        theme=event.get("theme"),
        profile_theme=business.get("theme") if business else None,
        gallery_images=event.get("gallery_images", []),
        gallery_videos=event.get("gallery_videos", []),
        tagged_artist_ids=tagged_artist_ids,
        tagged_artists=tagged_artists,
    )


@router.delete("/{event_id}")
async def delete_event(
    event_id: str, current_user: UserPublic = Depends(get_current_user)
):
    event = await db.events.find_one({"event_id": event_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    authorized = False
    if event.get("business_id"):
        business = await db.businesses.find_one(
            {"business_id": event["business_id"], "owner_id": current_user.user_id},
            {"_id": 0},
        )
        if business:
            authorized = True
    if event.get("artist_id"):
        artist = await db.artists.find_one(
            {"artist_id": event["artist_id"], "owner_id": current_user.user_id},
            {"_id": 0},
        )
        if artist:
            authorized = True
    
    if not authorized:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.events.delete_one({"event_id": event_id})
    return {"status": "deleted"}


@router.post("/{event_id}/attend")
async def toggle_event_attendance(
    event_id: str, payload: Optional[EventAttendRequest] = None,
    current_user: UserPublic = Depends(get_current_user)
):
    event = await db.events.find_one({"event_id": event_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    attendees = event.get("attendees", [])
    if current_user.user_id in attendees:
        attendees.remove(current_user.user_id)
        is_attending = False
    else:
        if event.get("is_private") and event.get("password"):
            if not payload or not payload.password or payload.password != event["password"]:
                raise HTTPException(status_code=403, detail="Password required for private events")
        attendees.append(current_user.user_id)
        is_attending = True
    
    await db.events.update_one(
        {"event_id": event_id}, {"$set": {"attendees": attendees}}
    )
    return {"is_attending": is_attending, "attendees_count": len(attendees)}


@router.get("/{event_id}/messages", response_model=List[ChatMessageResponse])
async def list_event_messages(
    event_id: str, current_user: UserPublic = Depends(get_current_user)
):
    event = await db.events.find_one({"event_id": event_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    if event.get("is_private"):
        is_creator = event.get("creator_id") == current_user.user_id
        is_attending = current_user.user_id in event.get("attendees", [])
        if not is_creator and not is_attending:
            raise HTTPException(status_code=403, detail="This is a private event")
    
    messages = await db.event_messages.find(
        {"event_id": event_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    
    user_ids = list({msg["user_id"] for msg in messages})
    users = await db.users.find(
        {"user_id": {"$in": user_ids}}, {"_id": 0, "password_hash": 0}
    ).to_list(1000)
    user_map = {user["user_id"]: build_user_public(user) for user in users}
    
    return [
        ChatMessageResponse(
            message_id=msg["message_id"],
            user_id=msg["user_id"],
            text=msg["text"],
            created_at=msg["created_at"],
            author=user_map.get(msg["user_id"]),
            sender_name=user_map.get(msg["user_id"]).name if user_map.get(msg["user_id"]) else None,
            media_url=msg.get("media_url"),
            media_type=msg.get("media_type"),
        )
        for msg in messages
    ]


@router.post("/{event_id}/messages", response_model=ChatMessageResponse)
async def create_event_message(
    event_id: str,
    payload: ChatMessageCreate,
    current_user: UserPublic = Depends(get_current_user),
):
    event = await db.events.find_one({"event_id": event_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    if event.get("is_private"):
        is_creator = event.get("creator_id") == current_user.user_id
        is_attending = current_user.user_id in event.get("attendees", [])
        if not is_creator and not is_attending:
            raise HTTPException(status_code=403, detail="This is a private event")
    
    message_doc = {
        "message_id": generate_id("emsg"),
        "event_id": event_id,
        "user_id": current_user.user_id,
        "text": payload.text,
        "created_at": now_utc(),
        "media_url": payload.media_url,
        "media_type": payload.media_type,
    }
    await db.event_messages.insert_one(message_doc)
    
    import asyncio
    asyncio.create_task(ws_broadcast_channel_message(
        f"event:{event_id}",
        {k: v for k, v in message_doc.items() if k != "_id"},
        exclude_user_id=current_user.user_id,
    ))
    
    return ChatMessageResponse(
        message_id=message_doc["message_id"],
        user_id=message_doc["user_id"],
        text=message_doc["text"],
        created_at=message_doc["created_at"],
        author=current_user,
        sender_name=current_user.name,
        media_url=payload.media_url,
        media_type=payload.media_type,
    )


# =============================================================================
# EVENT REMINDERS
# =============================================================================

from pydantic import BaseModel
from datetime import datetime


class EventReminderCreate(BaseModel):
    """Create an event reminder"""
    remind_at: str  # ISO datetime string for when to send reminder
    reminder_type: str = "push"  # "push", "email", "both"


class EventReminderResponse(BaseModel):
    """Event reminder response"""
    reminder_id: str
    event_id: str
    user_id: str
    remind_at: str
    reminder_type: str
    status: str
    created_at: str


@router.post("/{event_id}/reminders", response_model=EventReminderResponse)
async def create_event_reminder(
    event_id: str,
    payload: EventReminderCreate,
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Create a reminder for an event.
    Users can set custom reminder times (e.g., 1 hour before, 1 day before).
    """
    # Verify event exists
    event = await db.events.find_one(
        {"event_id": event_id, "is_hidden": {"$ne": True}},
        {"_id": 0, "title": 1, "start_time": 1}
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Check if reminder already exists for this user and event
    existing = await db.event_reminders.find_one({
        "event_id": event_id,
        "user_id": current_user.user_id,
        "status": "pending"
    })
    if existing:
        raise HTTPException(status_code=400, detail="Reminder already set for this event")
    
    reminder_id = generate_id("remind")
    reminder_doc = {
        "reminder_id": reminder_id,
        "event_id": event_id,
        "user_id": current_user.user_id,
        "event_title": event.get("title", "Event"),
        "event_start": event.get("start_time"),
        "remind_at": payload.remind_at,
        "reminder_type": payload.reminder_type,
        "status": "pending",
        "created_at": now_utc(),
        "sent_at": None,
    }
    
    await db.event_reminders.insert_one(reminder_doc)
    
    return EventReminderResponse(
        reminder_id=reminder_id,
        event_id=event_id,
        user_id=current_user.user_id,
        remind_at=payload.remind_at,
        reminder_type=payload.reminder_type,
        status="pending",
        created_at=reminder_doc["created_at"]
    )


@router.get("/{event_id}/reminders")
async def get_event_reminders(
    event_id: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """Get user's reminders for a specific event"""
    reminders = await db.event_reminders.find(
        {"event_id": event_id, "user_id": current_user.user_id},
        {"_id": 0}
    ).to_list(length=10)
    return reminders


@router.delete("/{event_id}/reminders/{reminder_id}")
async def delete_event_reminder(
    event_id: str,
    reminder_id: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """Delete an event reminder"""
    result = await db.event_reminders.delete_one({
        "reminder_id": reminder_id,
        "event_id": event_id,
        "user_id": current_user.user_id
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return {"message": "Reminder deleted"}


@router.get("/reminders/my-reminders")
async def get_my_reminders(
    current_user: UserPublic = Depends(get_current_user),
    status: Optional[str] = None,
    limit: int = 20
):
    """Get all user's event reminders"""
    query = {"user_id": current_user.user_id}
    if status:
        query["status"] = status
    
    reminders = await db.event_reminders.find(
        query,
        {"_id": 0}
    ).sort("remind_at", 1).limit(limit).to_list(length=limit)
    
    return reminders


@router.post("/reminders/process-due")
async def process_due_reminders(current_user: UserPublic = Depends(get_current_user)):
    """
    Process and send all due reminders.
    This endpoint should be called by a cron job every minute.
    Requires admin authentication.
    """
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    from utils.push_notifications import send_event_reminder_notification
    
    current_time = now_utc()
    
    # Find all pending reminders that are due
    due_reminders = await db.event_reminders.find({
        "status": "pending",
        "remind_at": {"$lte": current_time}
    }, {"_id": 0}).to_list(length=100)
    
    sent_count = 0
    failed_count = 0
    
    for reminder in due_reminders:
        try:
            # Get user's push token
            user = await db.users.find_one(
                {"user_id": reminder["user_id"]},
                {"_id": 0, "push_token": 1, "name": 1}
            )
            
            if user and user.get("push_token"):
                await send_event_reminder_notification(
                    push_token=user["push_token"],
                    event_title=reminder.get("event_title", "Event"),
                    event_id=reminder["event_id"],
                    reminder_id=reminder["reminder_id"]
                )
                
                # Mark as sent
                await db.event_reminders.update_one(
                    {"reminder_id": reminder["reminder_id"]},
                    {"$set": {"status": "sent", "sent_at": now_utc()}}
                )
                sent_count += 1
            else:
                # Mark as failed (no push token)
                await db.event_reminders.update_one(
                    {"reminder_id": reminder["reminder_id"]},
                    {"$set": {"status": "failed", "error": "No push token"}}
                )
                failed_count += 1
                
        except Exception as e:
            # Mark as failed
            await db.event_reminders.update_one(
                {"reminder_id": reminder["reminder_id"]},
                {"$set": {"status": "failed", "error": str(e)}}
            )
            failed_count += 1
    
    return {
        "processed": len(due_reminders),
        "sent": sent_count,
        "failed": failed_count
    }


@router.post("/{event_id}/quick-reminder")
async def set_quick_reminder(
    event_id: str,
    minutes_before: int = 60,
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Quick helper to set a reminder X minutes before an event.
    Default is 60 minutes (1 hour) before.
    """
    # Get event
    event = await db.events.find_one(
        {"event_id": event_id, "is_hidden": {"$ne": True}},
        {"_id": 0, "title": 1, "start_time": 1}
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    if not event.get("start_time"):
        raise HTTPException(status_code=400, detail="Event has no start time")
    
    # Calculate reminder time
    try:
        event_start = datetime.fromisoformat(event["start_time"].isoformat() if hasattr(event["start_time"], "isoformat") else str(event["start_time"]).replace("Z", "+00:00"))
        remind_at = event_start - timedelta(minutes=minutes_before)
        remind_at_str = remind_at.isoformat()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid event date: {e}")
    
    # Check if reminder already exists
    existing = await db.event_reminders.find_one({
        "event_id": event_id,
        "user_id": current_user.user_id,
        "status": "pending"
    })
    if existing:
        raise HTTPException(status_code=400, detail="Reminder already set for this event")
    
    reminder_id = generate_id("remind")
    reminder_doc = {
        "reminder_id": reminder_id,
        "event_id": event_id,
        "user_id": current_user.user_id,
        "event_title": event.get("title", "Event"),
        "event_start": event.get("start_time"),
        "remind_at": remind_at_str,
        "reminder_type": "push",
        "status": "pending",
        "minutes_before": minutes_before,
        "created_at": now_utc(),
        "sent_at": None,
    }
    
    await db.event_reminders.insert_one(reminder_doc)
    
    return {
        "reminder_id": reminder_id,
        "event_id": event_id,
        "remind_at": remind_at_str,
        "minutes_before": minutes_before,
        "message": f"Reminder set for {minutes_before} minutes before the event"
    }

