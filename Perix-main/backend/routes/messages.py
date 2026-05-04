"""Messages routes."""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from typing import List, Dict, Optional
from pydantic import EmailStr, BaseModel
import asyncio
import json

from database import db
from models.user import UserPublic
from models.message import MessageCreate, MessageEdit, MessageResponse, ConversationResponse
from utils.helpers import generate_id, now_utc
from routes.dependencies import get_current_user, build_user_public
from routes.ws import (
    ws_broadcast_new_message, ws_broadcast_typing,
    ws_broadcast_conversation_update, ws_broadcast_unread_count,
    manager,
)

router = APIRouter(prefix="/messages", tags=["Messages"])

# In-memory typing status (for real-time, consider using Redis)
typing_status: Dict[str, Dict[str, str]] = {}  # {user_id: {other_user_id: timestamp}}


class TypingStatus(BaseModel):
    to_user_id: str
    is_typing: bool


class MediaMessageCreate(BaseModel):
    to_user_id: Optional[str] = None
    to_business_id: Optional[str] = None
    to_artist_id: Optional[str] = None
    entity_type: str = "user"  # "user" | "business" | "artist"
    text: Optional[str] = None
    media_url: str
    media_type: str  # "image", "video", "audio"


@router.get("/conversations", response_model=List[ConversationResponse])
async def list_conversations(current_user: UserPublic = Depends(get_current_user)):
    messages = (
        await db.messages.find(
            {
                "$or": [
                    {"from_user_id": current_user.user_id},
                    {"to_user_id": current_user.user_id},
                    {"from_user_id": current_user.user_id, "entity_type": "business", "to_business_id": {"$exists": True}},
                    {"from_user_id": current_user.user_id, "entity_type": "artist", "to_artist_id": {"$exists": True}},
                ]
            },
            {"_id": 0},
        )
        .sort("created_at", -1)
        .to_list(500)
    )

    conversations: Dict[str, dict] = {}
    ordered_ids: List[str] = []
    for message in messages:
        entity_type = message.get("entity_type", "user")
        
        if entity_type == "business":
            conv_id = message.get("to_business_id")
            if not conv_id:
                continue
            if conv_id not in conversations:
                conversations[conv_id] = {"entity_type": "business", "last_message": message}
                ordered_ids.append(conv_id)
        elif entity_type == "artist":
            conv_id = message.get("to_artist_id")
            if not conv_id:
                continue
            if conv_id not in conversations:
                conversations[conv_id] = {"entity_type": "artist", "last_message": message}
                ordered_ids.append(conv_id)
        else:
            other_id = (
                message["to_user_id"]
                if message["from_user_id"] == current_user.user_id
                else message["from_user_id"]
            )
            if not other_id:
                continue
            if other_id not in conversations:
                conversations[other_id] = {"entity_type": "user", "last_message": message}
                ordered_ids.append(other_id)

    if not conversations:
        return []

    # Fetch entity info
    business_ids = [k for k, v in conversations.items() if v["entity_type"] == "business"]
    artist_ids = [k for k, v in conversations.items() if v["entity_type"] == "artist"]
    user_ids = [k for k, v in conversations.items() if v["entity_type"] == "user"]
    
    entity_info: Dict[str, dict] = {}
    
    if business_ids:
        businesses = await db.businesses.find(
            {"business_id": {"$in": business_ids}}, {"_id": 0}
        ).to_list(100)
        for b in businesses:
            entity_info[b["business_id"]] = {
                "name": b.get("name", ""),
                "image": b.get("logo_image"),
            }
    
    if artist_ids:
        artists = await db.artists.find(
            {"artist_id": {"$in": artist_ids}}, {"_id": 0}
        ).to_list(100)
        for a in artists:
            entity_info[a["artist_id"]] = {
                "name": a.get("name", ""),
                "image": a.get("profile_photo"),
            }
    
    if user_ids:
        users = await db.users.find(
            {"user_id": {"$in": user_ids}}, {"_id": 0, "password_hash": 0}
        ).to_list(1000)
        user_map = {u["user_id"]: build_user_public(u) for u in users}
        for uid in user_ids:
            if uid in user_map:
                entity_info[uid] = {
                    "other_user": user_map[uid],
                }

    response = []
    for conv_id in ordered_ids:
        conv = conversations[conv_id]
        info = entity_info.get(conv_id, {})
        msg_resp = MessageResponse(**conv["last_message"])
        response.append(ConversationResponse(
            entity_type=conv["entity_type"],
            conversation_id=conv_id,
            name=info.get("name", ""),
            image=info.get("image"),
            other_user=info.get("other_user"),
            last_message=msg_resp,
        ))
    
    return response


@router.get("/all-conversations")
async def list_all_conversations(current_user: UserPublic = Depends(get_current_user)):
    """
    Get all conversations including:
    - Direct messages with other users
    - Activity group chats the user is part of
    - Event group chats the user has RSVPed to
    """
    result = []
    
    # 1. Get direct message conversations
    messages = (
        await db.messages.find(
            {
                "$or": [
                    {"from_user_id": current_user.user_id},
                    {"to_user_id": current_user.user_id},
                ]
            },
            {"_id": 0},
        )
        .sort("created_at", -1)
        .to_list(500)
    )
    
    dm_conversations: Dict[str, dict] = {}
    for message in messages:
        other_id = (
            message["to_user_id"]
            if message["from_user_id"] == current_user.user_id
            else message["from_user_id"]
        )
        if other_id not in dm_conversations:
            dm_conversations[other_id] = message
    
    if dm_conversations:
        users = await db.users.find(
            {"user_id": {"$in": list(dm_conversations.keys())}}, {"_id": 0, "password_hash": 0}
        ).to_list(1000)
        user_map = {user["user_id"]: build_user_public(user) for user in users}
        
        for other_id, last_msg in dm_conversations.items():
            other_user = user_map.get(other_id)
            if other_user:
                result.append({
                    "type": "direct",
                    "conversation_id": other_id,
                    "name": other_user.display_name,
                    "image": other_user.profile_image,
                    "last_message": last_msg.get("text", ""),
                    "last_message_time": last_msg.get("created_at"),
                    "other_user": other_user.model_dump() if other_user else None,
                })
    
    # 2. Get activity group chats
    activities = await db.activities.find(
        {
            "$or": [
                {"invites.user_id": current_user.user_id},
                {"creator_id": current_user.user_id},
            ]
        },
        {"_id": 0},
    ).to_list(100)
    
    for activity in activities:
        last_activity_msg = await db.activity_messages.find_one(
            {"activity_id": activity.get("activity_id")},
            {"_id": 0},
            sort=[("created_at", -1)],
        )
        
        last_read_doc = await db.group_chat_reads.find_one(
            {"user_id": current_user.user_id, "type": "activity", "conversation_id": activity.get("activity_id")}
        )
        last_read_at = last_read_doc.get("last_read_at") if last_read_doc else None
        
        unread_count = 0
        if last_read_at:
            unread_count = await db.activity_messages.count_documents({
                "activity_id": activity.get("activity_id"),
                "created_at": {"$gt": last_read_at},
                "from_user_id": {"$ne": current_user.user_id},
            })
        elif last_activity_msg:
            unread_count = 1
        
        result.append({
            "type": "activity",
            "conversation_id": activity.get("activity_id"),
            "name": activity.get("title", "Activity"),
            "image": activity.get("cover_image_url"),
            "last_message": last_activity_msg.get("text", "") if last_activity_msg else "",
            "last_message_time": last_activity_msg.get("created_at") if last_activity_msg else activity.get("created_at"),
            "is_private": activity.get("is_private", False),
            "unread_count": unread_count,
        })
    
    # 3. Get event group chats (for events user is attending or created)
    events = await db.events.find(
        {
            "$or": [
                {"attendees": current_user.user_id},
                {"creator_id": current_user.user_id},
            ]
        },
        {"_id": 0},
    ).to_list(100)
    
    for event in events:
        last_event_msg = await db.event_messages.find_one(
            {"event_id": event.get("event_id")},
            {"_id": 0},
            sort=[("created_at", -1)],
        )
        
        last_read_doc = await db.group_chat_reads.find_one(
            {"user_id": current_user.user_id, "type": "event", "conversation_id": event.get("event_id")}
        )
        last_read_at = last_read_doc.get("last_read_at") if last_read_doc else None
        
        unread_count = 0
        if last_read_at:
            unread_count = await db.event_messages.count_documents({
                "event_id": event.get("event_id"),
                "created_at": {"$gt": last_read_at},
                "from_user_id": {"$ne": current_user.user_id},
            })
        elif last_event_msg:
            unread_count = 1
        
        result.append({
            "type": "event",
            "conversation_id": event.get("event_id"),
            "name": event.get("title", "Event"),
            "image": event.get("cover_image_url"),
            "last_message": last_event_msg.get("text", "") if last_event_msg else "",
            "last_message_time": last_event_msg.get("created_at") if last_event_msg else event.get("start_time"),
            "theme": event.get("theme"),
            "unread_count": unread_count,
        })
    
    # Sort all conversations by last message time
    result.sort(key=lambda x: x.get("last_message_time") or "", reverse=True)
    
    return result


@router.get("/unread-count")
async def get_unread_count(current_user: UserPublic = Depends(get_current_user)):
    """Get count of unread messages for the current user"""
    count = await db.messages.count_documents({
        "to_user_id": current_user.user_id,
        "read": {"$ne": True}
    })
    return {"unread_count": count}


@router.post("/mark-group-read/{conversation_id}")
async def mark_group_read(
    conversation_id: str,
    conv_type: str = "activity",
    current_user: UserPublic = Depends(get_current_user),
):
    """Mark a group chat (activity/event) as read for the current user"""
    await db.group_chat_reads.update_one(
        {"user_id": current_user.user_id, "type": conv_type, "conversation_id": conversation_id},
        {"$set": {"last_read_at": now_utc()}},
        upsert=True,
    )
    return {"marked_read": True}


@router.post("/mark-read/{entity_id}")
async def mark_messages_read(
    entity_id: str,
    entity_type: str = "user",
    current_user: UserPublic = Depends(get_current_user)
):
    """Mark all messages from a specific entity as read"""
    query: dict = {"to_user_id": current_user.user_id, "read": {"$ne": True}}
    
    if entity_type == "business":
        query["entity_type"] = "business"
        query["to_business_id"] = entity_id
        query["$or"] = [
            {"from_user_id": entity_id},
            {"to_user_id": current_user.user_id},
        ]
    elif entity_type == "artist":
        query["entity_type"] = "artist"
        query["to_artist_id"] = entity_id
        query["$or"] = [
            {"from_user_id": entity_id},
            {"to_user_id": current_user.user_id},
        ]
    else:
        query["from_user_id"] = entity_id
    
    result = await db.messages.update_many(query, {"$set": {"read": True, "read_at": now_utc()}})
    return {"marked_read": result.modified_count}


@router.get("/with/{entity_id}", response_model=List[MessageResponse])
async def get_messages(
    entity_id: str,
    entity_type: str = "user",
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Get messages with a specific entity.
    entity_type: "user" | "business" | "artist"
    """
    if entity_type == "business":
        messages = (
            await db.messages.find(
                {
                    "$or": [
                        {"from_user_id": current_user.user_id, "to_business_id": entity_id},
                        {"entity_type": "business", "to_business_id": entity_id, "from_user_id": {"$ne": current_user.user_id}},
                    ]
                },
                {"_id": 0},
            )
            .sort("created_at", 1)
            .to_list(500)
        )
    elif entity_type == "artist":
        messages = (
            await db.messages.find(
                {
                    "$or": [
                        {"from_user_id": current_user.user_id, "to_artist_id": entity_id},
                        {"entity_type": "artist", "to_artist_id": entity_id, "from_user_id": {"$ne": current_user.user_id}},
                    ]
                },
                {"_id": 0},
            )
            .sort("created_at", 1)
            .to_list(500)
        )
    else:
        messages = (
            await db.messages.find(
                {
                    "$or": [
                        {
                            "from_user_id": current_user.user_id,
                            "to_user_id": entity_id,
                        },
                        {
                            "from_user_id": entity_id,
                            "to_user_id": current_user.user_id,
                        },
                    ]
                },
                {"_id": 0},
            )
            .sort("created_at", 1)
            .to_list(500)
        )
    return [MessageResponse(**message) for message in messages]


@router.post("", response_model=MessageResponse)
async def send_message(
    payload: MessageCreate, current_user: UserPublic = Depends(get_current_user)
):
    """
    Send a message to another user, business, or artist.
    
    RULES:
    - User to User: Must be friends to send messages
    - User to Business: No friend required (businesses are public)
    - User to Artist: No friend required (artists are public)
    """
    from utils.push_notifications import send_message_notification
    
    entity_type = payload.entity_type or "user"
    
    if isinstance(entity_type, str) and entity_type.lower() in ["undefined", "null", ""]:
        if payload.to_business_id:
            entity_type = "business"
        elif payload.to_artist_id:
            entity_type = "artist"
        else:
            entity_type = "user"
    
    if entity_type == "business":
        to_business_id = payload.to_business_id
        if not to_business_id:
            raise HTTPException(status_code=400, detail="Business ID required")
        
        business = await db.businesses.find_one({"business_id": to_business_id})
        if not business:
            raise HTTPException(status_code=404, detail="Business not found")
        
        to_user_id = business.get("owner_id")
        conversation_id = to_business_id
        recipient_name = business.get("name")
        recipient_photo = business.get("logo_image")
        
    elif entity_type == "artist":
        to_artist_id = payload.to_artist_id
        if not to_artist_id:
            raise HTTPException(status_code=400, detail="Artist ID required")
        
        artist = await db.artists.find_one({"artist_id": to_artist_id})
        if not artist:
            raise HTTPException(status_code=404, detail="Artist not found")
        
        to_user_id = artist.get("owner_id")
        conversation_id = to_artist_id
        recipient_name = artist.get("name")
        recipient_photo = artist.get("profile_photo")
        
    else:
        to_user_id = payload.to_user_id
        if not to_user_id and payload.to_email:
            user = await db.users.find_one(
                {"email": payload.to_email}, {"_id": 0, "password_hash": 0}
            )
            if not user:
                raise HTTPException(status_code=404, detail="Recipient not found")
            to_user_id = user["user_id"]

        if not to_user_id:
            raise HTTPException(status_code=400, detail="Recipient required")

        recipient = await db.users.find_one(
            {"user_id": to_user_id}, 
            {"_id": 0, "paused_users": 1, "is_hidden": 1, "friends": 1}
        )
        if not recipient:
            raise HTTPException(status_code=404, detail="Recipient not found")
        
        if recipient.get("is_hidden"):
            raise HTTPException(status_code=403, detail="This user is not available")
        
        if current_user.user_id in recipient.get("paused_users", []):
            raise HTTPException(status_code=403, detail="You cannot send messages to this user")
        
        conversation_id = to_user_id
        recipient_name = recipient.get("name")
        recipient_photo = recipient.get("profile_photo") or recipient.get("picture")
        
        # CHECK FRIENDSHIP for user-to-user
        from routes.friend_requests import _is_friend_dict
        if not _is_friend_dict(current_user.friends, "user", to_user_id):
            raise HTTPException(
                status_code=403, 
                detail="You must be friends to send messages to this user"
            )

    message_doc = {
        "message_id": generate_id("msg"),
        "from_user_id": current_user.user_id,
        "to_user_id": to_user_id,
        "to_business_id": payload.to_business_id,
        "to_artist_id": payload.to_artist_id,
        "entity_type": entity_type,
        "text": payload.text,
        "read": False,
        "created_at": now_utc(),
    }
    await db.messages.insert_one(message_doc)
    
    asyncio.create_task(
        send_message_notification(
            recipient_user_id=to_user_id,
            sender_name=current_user.name,
            sender_id=current_user.user_id,
            sender_photo=current_user.profile_photo,
            conversation_id=conversation_id,
            message_preview=payload.text
        )
    )

    await ws_broadcast_new_message(to_user_id, message_doc)
    await ws_broadcast_new_message(current_user.user_id, message_doc)
    await ws_broadcast_conversation_update(to_user_id, {"conversation_id": conversation_id, "last_message": message_doc})
    await ws_broadcast_conversation_update(current_user.user_id, {"conversation_id": conversation_id, "last_message": message_doc})
    
    return MessageResponse(**message_doc)



@router.delete("/conversation/{entity_id}")
async def delete_conversation(
    entity_id: str,
    entity_type: str = "user",
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Delete all messages in a conversation with an entity (user/business/artist).
    """
    if entity_type == "business":
        query = {
            "$or": [
                {"from_user_id": current_user.user_id, "to_business_id": entity_id},
                {"entity_type": "business", "to_business_id": entity_id, "from_user_id": {"$ne": current_user.user_id}},
            ]
        }
    elif entity_type == "artist":
        query = {
            "$or": [
                {"from_user_id": current_user.user_id, "to_artist_id": entity_id},
                {"entity_type": "artist", "to_artist_id": entity_id, "from_user_id": {"$ne": current_user.user_id}},
            ]
        }
    else:
        query = {
            "$or": [
                {"from_user_id": current_user.user_id, "to_user_id": entity_id},
                {"from_user_id": entity_id, "to_user_id": current_user.user_id},
            ]
        }
    
    result = await db.messages.delete_many(query)
    
    return {"message": "Conversation deleted", "deleted_count": result.deleted_count}


@router.delete("/{message_id}")
async def delete_message(
    message_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Delete a single message.
    Only the sender can delete their own message.
    """
    message = await db.messages.find_one({"message_id": message_id})
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Only the sender can delete the message
    if message["from_user_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Can only delete your own messages")
    
    await db.messages.delete_one({"message_id": message_id})
    
    return {"message": "Message deleted", "message_id": message_id}


@router.put("/{message_id}", response_model=MessageResponse)
async def edit_message(
    message_id: str,
    payload: MessageEdit,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Edit a message.
    Only the sender can edit their own message.
    """
    message = await db.messages.find_one({"message_id": message_id})
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Only the sender can edit the message
    if message["from_user_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Can only edit your own messages")
    
    # Update the message
    await db.messages.update_one(
        {"message_id": message_id},
        {"$set": {"text": payload.text, "edited_at": now_utc()}}
    )
    
    # Fetch updated message
    updated_message = await db.messages.find_one({"message_id": message_id}, {"_id": 0})
    
    return MessageResponse(**updated_message)


@router.post("/typing")
async def set_typing_status(
    payload: TypingStatus,
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Set typing status for a conversation.
    This is stored in memory for real-time updates.
    """
    if current_user.user_id not in typing_status:
        typing_status[current_user.user_id] = {}
    
    if payload.is_typing:
        typing_status[current_user.user_id][payload.to_user_id] = now_utc().isoformat()
    else:
        typing_status[current_user.user_id].pop(payload.to_user_id, None)
    
    await ws_broadcast_typing(payload.to_user_id, current_user.user_id, payload.is_typing)
    
    return {"success": True}


@router.get("/typing/{other_user_id}")
async def get_typing_status(
    other_user_id: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Check if another user is currently typing to you.
    Returns true if they typed within the last 5 seconds.
    """
    from datetime import datetime, timedelta, timezone
    
    if other_user_id not in typing_status:
        return {"is_typing": False}
    
    if current_user.user_id not in typing_status[other_user_id]:
        return {"is_typing": False}
    
    # Check if typing status is recent (within 5 seconds)
    last_typing = typing_status[other_user_id][current_user.user_id]
    try:
        last_typing_time = datetime.fromisoformat(last_typing.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        if now - last_typing_time < timedelta(seconds=5):
            return {"is_typing": True}
    except:
        pass
    
    return {"is_typing": False}


@router.post("/media", response_model=MessageResponse)
async def send_media_message(
    payload: MediaMessageCreate,
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Send a message with media (image, video, audio) to any entity type.
    """
    from utils.push_notifications import send_message_notification
    
    entity_type = payload.entity_type or "user"
    to_user_id = None
    conversation_id = None
    recipient_name = None
    recipient_photo = None
    
    if entity_type == "business":
        to_business_id = payload.to_business_id
        if not to_business_id:
            raise HTTPException(status_code=400, detail="Business ID required")
        business = await db.businesses.find_one({"business_id": to_business_id})
        if not business:
            raise HTTPException(status_code=404, detail="Business not found")
        to_user_id = business.get("owner_id")
        conversation_id = to_business_id
        recipient_name = business.get("name")
        recipient_photo = business.get("logo_image")
        
    elif entity_type == "artist":
        to_artist_id = payload.to_artist_id
        if not to_artist_id:
            raise HTTPException(status_code=400, detail="Artist ID required")
        artist = await db.artists.find_one({"artist_id": to_artist_id})
        if not artist:
            raise HTTPException(status_code=404, detail="Artist not found")
        to_user_id = artist.get("owner_id")
        conversation_id = to_artist_id
        recipient_name = artist.get("name")
        recipient_photo = artist.get("profile_photo")
        
    else:
        to_user_id = payload.to_user_id
        if not to_user_id:
            raise HTTPException(status_code=400, detail="Recipient required")
        recipient = await db.users.find_one(
            {"user_id": to_user_id}, 
            {"_id": 0, "paused_users": 1, "is_hidden": 1}
        )
        if not recipient:
            raise HTTPException(status_code=404, detail="Recipient not found")
        if recipient.get("is_hidden"):
            raise HTTPException(status_code=403, detail="This user is not available")
        if current_user.user_id in recipient.get("paused_users", []):
            raise HTTPException(status_code=403, detail="You cannot send messages to this user")
        conversation_id = to_user_id
        recipient_name = recipient.get("name")
        recipient_photo = recipient.get("profile_photo") or recipient.get("picture")
        
        from routes.friend_requests import _is_friend_dict
        if not _is_friend_dict(current_user.friends, "user", to_user_id):
            raise HTTPException(
                status_code=403, 
                detail="You must be friends to send messages to this user"
            )
    
    message_doc = {
        "message_id": generate_id("msg"),
        "from_user_id": current_user.user_id,
        "to_user_id": to_user_id,
        "to_business_id": payload.to_business_id,
        "to_artist_id": payload.to_artist_id,
        "entity_type": entity_type,
        "text": payload.text or "",
        "media_url": payload.media_url,
        "media_type": payload.media_type,
        "read": False,
        "created_at": now_utc(),
    }
    await db.messages.insert_one(message_doc)
    
    media_type_label = {
        "image": "📷 Photo",
        "video": "🎥 Video", 
        "audio": "🎵 Voice message"
    }.get(payload.media_type, "📎 Media")
    
    preview = payload.text if payload.text else media_type_label
    
    asyncio.create_task(
        send_message_notification(
            recipient_user_id=to_user_id,
            sender_name=current_user.name,
            sender_id=current_user.user_id,
            sender_photo=current_user.profile_photo,
            conversation_id=conversation_id,
            message_preview=preview
        )
    )

    await ws_broadcast_new_message(to_user_id, message_doc)
    await ws_broadcast_new_message(current_user.user_id, message_doc)
    await ws_broadcast_conversation_update(to_user_id, {"conversation_id": conversation_id, "last_message": message_doc})
    await ws_broadcast_conversation_update(current_user.user_id, {"conversation_id": conversation_id, "last_message": message_doc})
    
    return MessageResponse(**message_doc)


@router.get("/read-status/{message_id}")
async def get_message_read_status(
    message_id: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Get read status of a specific message.
    Only the sender can check read status.
    """
    message = await db.messages.find_one({"message_id": message_id}, {"_id": 0})
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    if message["from_user_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Can only check read status of your own messages")
    
    return {
        "message_id": message_id,
        "read": message.get("read", False),
        "read_at": message.get("read_at")
    }

