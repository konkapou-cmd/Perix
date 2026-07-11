"""Activities routes."""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Dict, Any
import asyncio
from math import radians, cos, sin, asin, sqrt
import secrets
import string

from database import db
from models.user import UserPublic
from models.activity import (
    ActivityCreate, ActivityResponse, ActivityUpdate, ActivityRSVP, ActivityInvite,
    TaggedBusinessInfo, JoinByCodeRequest, ACTIVITY_THEMES
)
from models.message import MessageResponse, ChatMessageResponse, ChatMessageCreate
from utils.helpers import generate_id, now_utc
from routes.dependencies import get_current_user, build_user_public
from routes.ws import ws_broadcast_channel_message, ws_broadcast_notification

router = APIRouter(prefix="/activities", tags=["Activities"])


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


def generate_invitation_code(length: int = 8) -> str:
    """Generate a random invitation code."""
    chars = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(chars) for _ in range(length))


async def get_tagged_business_info(business_id: str) -> TaggedBusinessInfo | None:
    """Fetch business info for display."""
    if not business_id:
        return None
    business = await db.businesses.find_one(
        {"business_id": business_id},
        {"_id": 0, "business_id": 1, "name": 1, "logo_image": 1}
    )
    if business:
        return TaggedBusinessInfo(
            business_id=business["business_id"],
            name=business["name"],
            logo_image=business.get("logo_image")
        )
    return None


async def build_activity_response(activity_doc: dict, current_user: UserPublic) -> ActivityResponse:
    invites = [ActivityInvite(**invite) for invite in activity_doc.get("invites", [])]
    is_creator = activity_doc["creator_id"] == current_user.user_id
    my_status = "creator" if is_creator else "pending"
    for invite in invites:
        if invite.user_id == current_user.user_id or invite.email == current_user.email:
            my_status = invite.status
            break
    
    tagged_business = await get_tagged_business_info(activity_doc.get("tagged_business_id"))
    
    invitation_code = activity_doc.get("invitation_code") if is_creator else None
    password = activity_doc.get("password") if is_creator else None
    
    creator_profile_theme = None
    creator_info = None
    creator_user = await db.users.find_one(
        {"user_id": activity_doc["creator_id"]},
        {"_id": 0, "theme": 1, "name": 1, "profile_photo": 1, "picture": 1}
    )
    if creator_user:
        creator_profile_theme = creator_user.get("theme")
        creator_info = {
            "user_id": activity_doc["creator_id"],
            "name": creator_user.get("name", "Unknown"),
            "profile_photo": creator_user.get("profile_photo") or creator_user.get("picture")
        }
    
    return ActivityResponse(
        activity_id=activity_doc["activity_id"],
        creator_id=activity_doc["creator_id"],
        title=activity_doc["title"],
        description=activity_doc.get("description"),
        date=activity_doc["date"],
        time=activity_doc["time"],
        location=activity_doc.get("location"),
        cover_image_url=activity_doc.get("cover_image_url"),
        image_urls=activity_doc.get("image_urls", []),
        latitude=activity_doc.get("latitude"),
        longitude=activity_doc.get("longitude"),
        max_attendees=activity_doc.get("max_attendees"),
        invites=invites,
        created_at=activity_doc["created_at"],
        my_status=my_status,
        is_creator=is_creator,
        is_private=activity_doc.get("is_private", False),
        invitation_code=invitation_code,
        password=password,
        theme=activity_doc.get("theme"),
        custom_theme=activity_doc.get("custom_theme"),
        tagged_business=tagged_business,
        gallery_images=activity_doc.get("gallery_images", []),
        gallery_videos=activity_doc.get("gallery_videos", []),
        video_url=activity_doc.get("video_url"),
        cover_focal_point=activity_doc.get("cover_focal_point", {"x": 0.5, "y": 0.5}),
        profile_theme=creator_profile_theme,
        creator=creator_info,
    )


@router.get("/themes")
async def get_activity_themes():
    """Get available activity themes."""
    return {"themes": ACTIVITY_THEMES}


@router.post("", response_model=ActivityResponse)
async def create_activity(
    payload: ActivityCreate, current_user: UserPublic = Depends(get_current_user)
):
    from routes.notifications import notify_users
    
    invites = []
    user_ids_to_notify = []
    
    for email in payload.invite_emails:
        user = await db.users.find_one({"email": email}, {"_id": 0, "password_hash": 0})
        if user:
            invites.append({
                "user_id": user["user_id"],
                "email": email,
                "status": "pending",
            })
            user_ids_to_notify.append(user["user_id"])
        else:
            invites.append({
                "user_id": None,
                "email": email,
                "status": "pending",
            })
    
    # Generate invitation code for private activities
    invitation_code = generate_invitation_code() if payload.is_private else None
    
    activity_doc = {
        "activity_id": generate_id("activity"),
        "creator_id": current_user.user_id,
        "title": payload.title,
        "description": payload.description,
        "date": payload.date,
        "time": payload.time,
        "location": payload.location,
        "cover_image_url": payload.cover_image_url or (payload.image_urls[0] if payload.image_urls else None),
        "image_urls": payload.image_urls or [],
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "max_attendees": payload.max_attendees,
        "invites": invites,
        "created_at": now_utc(),
        "is_private": payload.is_private,
        "invitation_code": invitation_code,
        "password": payload.password,
        "theme": payload.theme,
        "custom_theme": payload.custom_theme,
        "gallery_images": payload.gallery_images or [],
        "gallery_videos": payload.gallery_videos or [],
        "video_url": payload.video_url,
        "tagged_business_id": payload.tagged_business_id,
        "cover_focal_point": payload.cover_focal_point or {"x": 0.5, "y": 0.5},
    }
    await db.activities.insert_one(activity_doc)
    
    if user_ids_to_notify:
        asyncio.create_task(
            notify_users(
                user_ids_to_notify,
                f"Activity Invite from {current_user.name}",
                f"You've been invited to: {payload.title}",
                {"type": "activity_invite", "activity_id": activity_doc["activity_id"]},
                "activities"
            )
        )
        for uid in user_ids_to_notify:
            asyncio.create_task(ws_broadcast_notification(uid, {
                "type": "activity_invite",
                "actor_id": current_user.user_id,
                "actor_name": current_user.name,
                "activity_id": activity_doc["activity_id"],
                "title": payload.title,
            }))
    
    return await build_activity_response(activity_doc, current_user)


@router.post("/join-by-code", response_model=ActivityResponse)
async def join_activity_by_code(
    payload: JoinByCodeRequest, current_user: UserPublic = Depends(get_current_user)
):
    """Join a private activity using an invitation code."""
    activity = await db.activities.find_one(
        {"invitation_code": payload.invitation_code.upper()},
        {"_id": 0}
    )
    
    if not activity:
        raise HTTPException(status_code=404, detail="Invalid invitation code")
    
    # Check if user is already invited or creator
    if activity["creator_id"] == current_user.user_id:
        return await build_activity_response(activity, current_user)
    
    invites = activity.get("invites", [])
    already_invited = any(
        i.get("user_id") == current_user.user_id or i.get("email") == current_user.email
        for i in invites
    )
    
    if not already_invited:
        # Add user to invites
        invites.append({
            "user_id": current_user.user_id,
            "email": current_user.email,
            "status": "going",  # Automatically set to going when joining by code
        })
        await db.activities.update_one(
            {"activity_id": activity["activity_id"]},
            {"$set": {"invites": invites}}
        )
        activity["invites"] = invites
    
    return await build_activity_response(activity, current_user)


@router.put("/{activity_id}", response_model=ActivityResponse)
async def update_activity(
    activity_id: str,
    payload: ActivityUpdate,
    current_user: UserPublic = Depends(get_current_user),
):
    activity = await db.activities.find_one({"activity_id": activity_id}, {"_id": 0})
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if activity["creator_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = {key: value for key, value in payload.dict().items() if value is not None}
    
    # Handle is_private toggle - generate or remove code
    if "is_private" in update_data:
        if update_data["is_private"] and not activity.get("invitation_code"):
            update_data["invitation_code"] = generate_invitation_code()
        elif not update_data["is_private"]:
            update_data["invitation_code"] = None
    
    if update_data:
        await db.activities.update_one({"activity_id": activity_id}, {"$set": update_data})
        activity.update(update_data)
    return await build_activity_response(activity, current_user)


@router.delete("/{activity_id}")
async def delete_activity(
    activity_id: str, current_user: UserPublic = Depends(get_current_user)
):
    activity = await db.activities.find_one({"activity_id": activity_id}, {"_id": 0})
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if activity["creator_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    await db.activities.delete_one({"activity_id": activity_id})
    return {"status": "deleted"}


@router.get("", response_model=List[ActivityResponse])
async def list_activities(
    current_user: UserPublic = Depends(get_current_user),
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    radius_km: Optional[float] = 50,
    min_lat: Optional[float] = None,
    max_lat: Optional[float] = None,
    min_lng: Optional[float] = None,
    max_lng: Optional[float] = None,
    date: Optional[str] = None,
    theme: Optional[str] = None,
    category: Optional[str] = None,
):
    def is_in_bounds(lat: float, lng: float) -> bool:
        if lat is None or lng is None:
            return False
        if all([min_lat, max_lat, min_lng, max_lng]):
            return min_lat <= lat <= max_lat and min_lng <= lng <= max_lng
        if latitude is not None and longitude is not None and radius_km:
            return haversine_distance(latitude, longitude, lat, lng) <= radius_km
        return True
    
    # Show activities where user is creator, invited, or public activities
    base_query: Dict[str, Any] = {
        "$or": [
            {"creator_id": current_user.user_id},
            {"invites.user_id": current_user.user_id},
            {"invites.email": current_user.email},
            {"is_private": {"$ne": True}},  # Show public activities
        ]
    }
    
    # Add date filtering if provided
    if date:
        from datetime import date as date_type, timedelta
        try:
            filter_date = date_type.fromisoformat(date.replace("Z", "").split("T")[0])
            base_query["date"] = {"$gte": filter_date.isoformat()}
        except ValueError:
            pass
    else:
        # Default: only show today and future activities
        from datetime import date as date_type
        base_query["date"] = {"$gte": date_type.today().isoformat()}
    
    # Add theme/category filtering if provided
    if theme:
        base_query["theme"] = theme
    elif category:
        matching = [
            key for key, val in ACTIVITY_THEMES.items()
            if val.get("category") == category
        ]
        if matching:
            base_query["theme"] = {"$in": matching}
    
    activities = await db.activities.find(
        base_query,
        {"_id": 0},
    ).sort("date", 1).to_list(200)
    
    use_bounds = any([min_lat, max_lat, min_lng, max_lng])
    
    responses = []
    for activity in activities:
        activity_lat = activity.get("latitude")
        activity_lng = activity.get("longitude")
        
        if use_bounds or (latitude is not None and longitude is not None):
            if activity_lat is None or activity_lng is None:
                continue
            if not is_in_bounds(activity_lat, activity_lng):
                continue
        
        responses.append(await build_activity_response(activity, current_user))
    return responses


@router.get("/{activity_id}", response_model=ActivityResponse)
async def get_activity_detail(
    activity_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    """Get a single activity by ID."""
    activity = await db.activities.find_one({"activity_id": activity_id}, {"_id": 0})
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    
    # Check access for private activities
    if activity.get("is_private"):
        is_creator = activity["creator_id"] == current_user.user_id
        is_invited = any(
            i.get("user_id") == current_user.user_id or i.get("email") == current_user.email
            for i in activity.get("invites", [])
        )
        if not is_creator and not is_invited:
            raise HTTPException(status_code=403, detail="This is a private activity")
    
    return await build_activity_response(activity, current_user)


@router.post("/{activity_id}/rsvp", response_model=ActivityResponse)
async def rsvp_activity(
    activity_id: str,
    payload: ActivityRSVP,
    current_user: UserPublic = Depends(get_current_user),
):
    activity = await db.activities.find_one({"activity_id": activity_id}, {"_id": 0})
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    
    if activity.get("is_private") and activity.get("password"):
        is_creator = activity["creator_id"] == current_user.user_id
        is_invited = any(
            i.get("user_id") == current_user.user_id or i.get("email") == current_user.email
            for i in activity.get("invites", [])
        )
        if not is_creator and not is_invited:
                if not payload.password or payload.password != activity["password"]:
                    raise HTTPException(status_code=403, detail="Password required for private activities")
    
    invites = activity.get("invites", [])
    found = False
    for invite in invites:
        if invite.get("user_id") == current_user.user_id or invite.get("email") == current_user.email:
            invite["status"] = payload.status
            if not invite.get("user_id"):
                invite["user_id"] = current_user.user_id
            found = True
            break
    
    if not found:
        if activity["creator_id"] == current_user.user_id:
            pass
        else:
            invites.append({
                "user_id": current_user.user_id,
                "email": current_user.email,
                "status": payload.status,
            })
    
    await db.activities.update_one(
        {"activity_id": activity_id}, {"$set": {"invites": invites}}
    )
    activity["invites"] = invites
    return await build_activity_response(activity, current_user)


@router.get("/{activity_id}/messages", response_model=List[ChatMessageResponse])
async def list_activity_messages(
    activity_id: str, current_user: UserPublic = Depends(get_current_user)
):
    activity = await db.activities.find_one({"activity_id": activity_id}, {"_id": 0})
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    
    if activity.get("is_private"):
        is_creator = activity["creator_id"] == current_user.user_id
        is_invited = any(
            i.get("user_id") == current_user.user_id or i.get("email") == current_user.email
            for i in activity.get("invites", [])
        )
        is_rsvped = current_user.user_id in activity.get("rsvped_users", [])
        if not is_creator and not is_invited and not is_rsvped:
            raise HTTPException(status_code=403, detail="This is a private activity")
    
    messages = await db.activity_messages.find(
        {"activity_id": activity_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    
    user_ids = list({msg["user_id"] for msg in messages})
    users = await db.users.find(
        {"user_id": {"$in": user_ids}},
        {"_id": 0, "password_hash": 0}
    ).to_list(100)
    user_map = {u["user_id"]: build_user_public(u) for u in users}
    
    responses = []
    for msg in messages:
        author = user_map.get(msg["user_id"])
        responses.append(ChatMessageResponse(
            message_id=msg["message_id"],
            user_id=msg["user_id"],
            text=msg["text"],
            created_at=msg["created_at"],
            author=author,
            sender_name=author.name if author else None,
            media_url=msg.get("media_url"),
            media_type=msg.get("media_type"),
        ))
    return responses


@router.post("/{activity_id}/messages", response_model=ChatMessageResponse)
async def create_activity_message(
    activity_id: str,
    payload: ChatMessageCreate,
    current_user: UserPublic = Depends(get_current_user),
):
    activity = await db.activities.find_one({"activity_id": activity_id}, {"_id": 0})
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    
    if activity.get("is_private"):
        is_creator = activity["creator_id"] == current_user.user_id
        is_invited = any(
            i.get("user_id") == current_user.user_id or i.get("email") == current_user.email
            for i in activity.get("invites", [])
        )
        is_rsvped = current_user.user_id in activity.get("rsvped_users", [])
        if not is_creator and not is_invited and not is_rsvped:
            raise HTTPException(status_code=403, detail="This is a private activity")
    
    message_doc = {
        "message_id": generate_id("amsg"),
        "activity_id": activity_id,
        "user_id": current_user.user_id,
        "text": payload.text,
        "created_at": now_utc(),
        "media_url": payload.media_url,
        "media_type": payload.media_type,
    }
    await db.activity_messages.insert_one(message_doc)
    
    asyncio.create_task(ws_broadcast_channel_message(
        f"activity:{activity_id}",
        {k: v for k, v in message_doc.items() if k != "_id"},
        exclude_user_id=current_user.user_id,
    ))
    
    author = build_user_public(current_user.model_dump())
    return ChatMessageResponse(
        message_id=message_doc["message_id"],
        user_id=message_doc["user_id"],
        text=message_doc["text"],
        created_at=message_doc["created_at"],
        author=author,
        sender_name=author.name if author else None,
        media_url=payload.media_url,
        media_type=payload.media_type,
    )
