"""Agora Voice/Video Calls routes - Token generation and call management."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import os
import random
import string

from models.user import UserPublic
from database import db
from utils.helpers import generate_id, now_utc
from routes.dependencies import get_current_user
from routes.ws import ws_broadcast_call_status, ws_broadcast_notification

router = APIRouter(prefix="/calls", tags=["Calls"])

# Import Agora token builder
try:
    from agora_token_builder import RtcTokenBuilder
    AGORA_AVAILABLE = True
except ImportError:
    AGORA_AVAILABLE = False
    RtcTokenBuilder = None


class TokenRequest(BaseModel):
    """Request model for token generation"""
    channel: Optional[str] = None
    uid: int = 0
    role: int = 1  # 1 = publisher/host, 2 = subscriber/audience


class TokenResponse(BaseModel):
    """Response model containing generated token and metadata"""
    token: str
    uid: int
    channel: str
    app_id: str
    expiry_time: int


class CallRequest(BaseModel):
    """Request to initiate a call"""
    to_user_id: Optional[str] = None
    to_business_id: Optional[str] = None
    call_type: str = "video"  # "video" or "voice"


class CallResponse(BaseModel):
    """Response with call details"""
    call_id: str
    channel: str
    token: str
    caller_token: Optional[str] = None
    callee_token: Optional[str] = None
    app_id: str
    caller_uid: int
    callee_uid: int
    call_type: str
    status: str
    recipient_type: str = "user"  # "user" or "business"


def is_business_open(opening_hours: dict) -> bool:
    """Check if business is currently open based on opening_hours.
    
    Supports two formats:
    1. Simple: {"monday": {"open": "09:00", "close": "18:00"}}
    2. Rich (frontend format): {"monday": {"enabled": true, "periods": [{"open": "09:00", "close": "18:00"}]}}
    """
    if not opening_hours:
        return True
    
    from datetime import datetime
    now = datetime.now()
    day_name = now.strftime("%A").lower()
    
    day_hours = opening_hours.get(day_name)
    if not day_hours:
        return False
    
    if isinstance(day_hours, dict):
        enabled = day_hours.get("enabled")
        if enabled is False:
            return False
        
        periods = day_hours.get("periods")
        if periods and isinstance(periods, list) and len(periods) > 0:
            current_time = now.strftime("%H:%M")
            for period in periods:
                open_time = period.get("open") if isinstance(period, dict) else None
                close_time = period.get("close") if isinstance(period, dict) else None
                if open_time and close_time:
                    if open_time <= current_time <= close_time:
                        return True
            return False
        
        open_time = day_hours.get("open") or day_hours.get("from")
        close_time = day_hours.get("close") or day_hours.get("to")
        if open_time and close_time:
            try:
                current_time = now.strftime("%H:%M")
                return open_time <= current_time <= close_time
            except Exception:
                return True
    
    if isinstance(day_hours, str):
        if day_hours.lower() in ("closed", "24/7", "24 hours"):
            return day_hours.lower() == "24/7" or day_hours.lower() == "24 hours"
    
    return True


def generate_channel_name() -> str:
    """Generate a unique channel name"""
    timestamp = int(datetime.now().timestamp())
    random_str = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"call-{timestamp}-{random_str}"


def get_agora_credentials():
    """Get Agora credentials from environment"""
    app_id = os.getenv("AGORA_APP_ID")
    app_certificate = os.getenv("AGORA_APP_CERTIFICATE")
    
    if not app_id or not app_certificate:
        raise HTTPException(
            status_code=500,
            detail="Agora credentials not configured"
        )
    return app_id, app_certificate


@router.post("/token", response_model=TokenResponse)
async def generate_token(
    request: TokenRequest,
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Generate an Agora RTC token for voice/video calls.
    
    - **channel**: Channel name (auto-generated if not provided)
    - **uid**: User ID for the call (0 for auto-assign)
    - **role**: 1 = publisher (can send/receive), 2 = subscriber (receive only)
    """
    if not AGORA_AVAILABLE:
        raise HTTPException(
            status_code=500,
            detail="Agora SDK not available"
        )
    
    app_id, app_certificate = get_agora_credentials()
    
    # Use provided channel or generate new one
    channel_name = request.channel if request.channel else generate_channel_name()
    
    # Validate channel name
    if len(channel_name) > 64:
        raise HTTPException(
            status_code=400,
            detail="Channel name exceeds maximum length of 64 characters"
        )
    
    # Generate UID based on user_id hash if not provided
    uid = request.uid
    if uid == 0:
        uid = abs(hash(current_user.user_id)) % (2**31)
    
    # Token expires in 1 hour
    expiry_seconds = 3600
    current_timestamp = int(datetime.now().timestamp())
    expiry_timestamp = current_timestamp + expiry_seconds
    
    try:
        token = RtcTokenBuilder.buildTokenWithUid(
            appId=app_id,
            appCertificate=app_certificate,
            channelName=channel_name,
            uid=uid,
            role=request.role,
            privilegeExpiredTs=expiry_timestamp
        )
        
        return TokenResponse(
            token=token,
            uid=uid,
            channel=channel_name,
            app_id=app_id,
            expiry_time=expiry_timestamp
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate token: {str(e)}"
        )


@router.post("/initiate", response_model=CallResponse)
async def initiate_call(
    request: CallRequest,
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Initiate a voice or video call to another user or business.
    Creates a call record and generates tokens for both parties.
    The recipient must accept the call before it connects.
    
    RULES:
    - User to User: Must be friends
    - User to Artist: Must be friends with the artist's owner
    - User to Business: Business must be open (opening hours)
    """
    if not AGORA_AVAILABLE:
        raise HTTPException(
            status_code=500,
            detail="Agora SDK not available"
        )
    
    recipient_type = "user"
    recipient_user_id = None
    recipient_name = None
    
    # Handle business calls - only during opening hours
    if request.to_business_id:
        business = await db.businesses.find_one(
            {"business_id": request.to_business_id},
            {"_id": 0}
        )
        if not business:
            raise HTTPException(status_code=404, detail="Business not found")
        
        # Check if business is open
        if not is_business_open(business.get("opening_hours", {})):
            raise HTTPException(
                status_code=400, 
                detail="Business is currently closed. Please call during working hours."
            )
        
        recipient_user_id = business["owner_id"]
        recipient_name = business["name"]
        recipient_type = "business"
    
    # Handle user/artist calls - must be friends
    elif request.to_user_id:
        recipient = await db.users.find_one(
            {"user_id": request.to_user_id},
            {"_id": 0, "password_hash": 0}
        )
        if not recipient:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Check if recipient is hidden
        if recipient.get("is_hidden"):
            raise HTTPException(status_code=403, detail="This user is not available")
        
        # Check if caller is paused by recipient
        if current_user.user_id in recipient.get("paused_users", []):
            raise HTTPException(status_code=403, detail="You cannot call this user")
        
        # CHECK FRIENDSHIP - Users must be friends to call each other
        from routes.friend_requests import _is_friend_dict
        if not _is_friend_dict(current_user.friends, "user", request.to_user_id):
            raise HTTPException(
                status_code=403, 
                detail="You must be friends to call this user"
            )
        
        recipient_user_id = request.to_user_id
        recipient_name = recipient.get("name", "User")
    else:
        raise HTTPException(status_code=400, detail="Either to_user_id or to_business_id required")
    
    app_id, app_certificate = get_agora_credentials()
    
    # Generate unique channel for this call
    channel_name = generate_channel_name()
    
    # Generate UIDs for both users
    caller_uid = abs(hash(current_user.user_id)) % (2**31)
    callee_uid = abs(hash(recipient_user_id)) % (2**31)
    
    # Token expires in 1 hour
    expiry_timestamp = int(datetime.now().timestamp()) + 3600
    
    # Generate token for caller (but they won't join until recipient accepts)
    caller_token = RtcTokenBuilder.buildTokenWithUid(
        appId=app_id,
        appCertificate=app_certificate,
        channelName=channel_name,
        uid=caller_uid,
        role=1,  # Publisher
        privilegeExpiredTs=expiry_timestamp
    )
    
    # Create call record with "ringing" status
    call_doc = {
        "call_id": generate_id("call"),
        "channel": channel_name,
        "caller_id": current_user.user_id,
        "caller_name": current_user.name,
        "caller_uid": caller_uid,
        "callee_id": recipient_user_id,
        "callee_uid": callee_uid,
        "call_type": request.call_type,
        "recipient_type": recipient_type,
        "business_id": request.to_business_id,
        "status": "ringing",  # Changed from "pending" to "ringing"
        "created_at": now_utc(),
        "answered_at": None,
        "ended_at": None,
    }
    await db.calls.insert_one(call_doc)
    
    # Send push notification to recipient for incoming call
    from utils.push_notifications import send_call_notification
    import asyncio
    
    asyncio.create_task(
        send_call_notification(
            recipient_user_id=recipient_user_id,
            caller_name=current_user.name,
            caller_id=current_user.user_id,
            caller_photo=current_user.profile_photo or current_user.picture,
            call_id=call_doc["call_id"],
            call_type=request.call_type
        )
    )
    
    asyncio.create_task(ws_broadcast_call_status(recipient_user_id, {
        "call_id": call_doc["call_id"],
        "status": "ringing",
        "caller_id": current_user.user_id,
        "caller_name": current_user.name,
        "call_type": request.call_type,
    }))
    
    return CallResponse(
        call_id=call_doc["call_id"],
        channel=channel_name,
        token=caller_token,
        caller_token=caller_token,
        app_id=app_id,
        caller_uid=caller_uid,
        callee_uid=callee_uid,
        call_type=request.call_type,
        status="ringing",
        recipient_type=recipient_type
    )


@router.post("/answer/{call_id}", response_model=CallResponse)
async def answer_call(
    call_id: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """Answer an incoming call and get the token to join."""
    if not AGORA_AVAILABLE:
        raise HTTPException(
            status_code=500,
            detail="Agora SDK not available"
        )
    
    # Find the call
    call = await db.calls.find_one({"call_id": call_id}, {"_id": 0})
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    
    # Verify this user is the callee
    if call["callee_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to answer this call")
    
    # Check call status
    if call["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Call is {call['status']}")
    
    app_id, app_certificate = get_agora_credentials()
    
    # Generate token for callee
    expiry_timestamp = int(datetime.now().timestamp()) + 3600
    callee_token = RtcTokenBuilder.buildTokenWithUid(
        appId=app_id,
        appCertificate=app_certificate,
        channelName=call["channel"],
        uid=call["callee_uid"],
        role=1,  # Publisher
        privilegeExpiredTs=expiry_timestamp
    )
    
    # Update call status
    await db.calls.update_one(
        {"call_id": call_id},
        {"$set": {"status": "active", "answered_at": now_utc()}}
    )
    
    asyncio.create_task(ws_broadcast_call_status(call["caller_id"], {
        "call_id": call_id,
        "status": "active",
        "callee_id": current_user.user_id,
    }))
    
    return CallResponse(
        call_id=call_id,
        channel=call["channel"],
        token=callee_token,
        callee_token=callee_token,
        app_id=app_id,
        caller_uid=call["caller_uid"],
        callee_uid=call["callee_uid"],
        call_type=call["call_type"],
        status="active"
    )


@router.post("/end/{call_id}")
async def end_call(
    call_id: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """End an active call and calculate duration."""
    call = await db.calls.find_one({"call_id": call_id}, {"_id": 0})
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    
    # Verify user is part of the call
    if call["caller_id"] != current_user.user_id and call["callee_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    ended_at = now_utc()
    
    # Calculate duration if call was answered
    duration_seconds = 0
    if call.get("answered_at"):
        answered_at = call["answered_at"]
        if answered_at.tzinfo is None:
            from datetime import timezone
            answered_at = answered_at.replace(tzinfo=timezone.utc)
        duration_seconds = int((ended_at - answered_at).total_seconds())
    
    # Update call status with duration
    await db.calls.update_one(
        {"call_id": call_id},
        {"$set": {
            "status": "ended", 
            "ended_at": ended_at,
            "duration_seconds": duration_seconds
        }}
    )
    
    other_user_id = call["callee_id"] if call["caller_id"] == current_user.user_id else call["caller_id"]
    asyncio.create_task(ws_broadcast_call_status(other_user_id, {
        "call_id": call_id,
        "status": "ended",
        "duration_seconds": duration_seconds,
    }))
    
    return {
        "success": True, 
        "call_id": call_id, 
        "status": "ended",
        "duration_seconds": duration_seconds
    }


@router.post("/reject/{call_id}")
async def reject_call(
    call_id: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """Reject an incoming call."""
    call = await db.calls.find_one({"call_id": call_id}, {"_id": 0})
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    
    # Verify this user is the callee
    if call["callee_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if call["status"] not in ["pending", "ringing"]:
        raise HTTPException(status_code=400, detail=f"Call is already {call['status']}")
    
    # Update call status
    await db.calls.update_one(
        {"call_id": call_id},
        {"$set": {"status": "rejected", "ended_at": now_utc()}}
    )
    
    asyncio.create_task(ws_broadcast_call_status(call["caller_id"], {
        "call_id": call_id,
        "status": "rejected",
    }))
    
    return {"success": True, "call_id": call_id, "status": "rejected"}


@router.get("/status/{call_id}")
async def get_call_status(
    call_id: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Get the current status of a call.
    Used by the caller to poll and check if the call was accepted/rejected.
    """
    call = await db.calls.find_one({"call_id": call_id}, {"_id": 0})
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    
    # Verify this user is either the caller or callee
    if call["caller_id"] != current_user.user_id and call["callee_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return {
        "call_id": call_id,
        "status": call["status"],
        "call_type": call["call_type"],
        "caller_id": call["caller_id"],
        "callee_id": call["callee_id"],
        "created_at": call["created_at"],
        "answered_at": call.get("answered_at"),
        "ended_at": call.get("ended_at"),
    }


@router.get("/pending")
async def get_pending_calls(current_user: UserPublic = Depends(get_current_user)):
    """Get pending incoming calls for the current user."""
    calls = await db.calls.find(
        {
            "callee_id": current_user.user_id,
            "status": "pending"
        },
        {"_id": 0}
    ).sort("created_at", -1).to_list(10)
    
    # Get caller info for each call (batch)
    caller_ids = list({c["caller_id"] for c in calls})
    callers = await db.users.find(
        {"user_id": {"$in": caller_ids}},
        {"_id": 0, "password_hash": 0}
    ).to_list(len(caller_ids))
    caller_map = {u["user_id"]: u for u in callers}
    
    result = [{**call, "caller": caller_map.get(call["caller_id"])} for call in calls]
    
    return result


@router.get("/history")
async def get_call_history(current_user: UserPublic = Depends(get_current_user)):
    """Get call history for the current user."""
    calls = await db.calls.find(
        {
            "$or": [
                {"caller_id": current_user.user_id},
                {"callee_id": current_user.user_id}
            ]
        },
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    
    # Get other user info for each call (batch)
    other_user_ids = list({
        c["callee_id"] if c["caller_id"] == current_user.user_id else c["caller_id"]
        for c in calls
    })
    users = await db.users.find(
        {"user_id": {"$in": other_user_ids}},
        {"_id": 0, "password_hash": 0}
    ).to_list(len(other_user_ids))
    user_map = {u["user_id"]: u for u in users}
    
    result = []
    for call in calls:
        other_user_id = call["callee_id"] if call["caller_id"] == current_user.user_id else call["caller_id"]
        result.append({
            **call,
            "other_user": user_map.get(other_user_id),
            "is_outgoing": call["caller_id"] == current_user.user_id
        })
    
    return result



@router.delete("/history/{call_id}")
async def delete_call_history(
    call_id: str,
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Delete a call from history.
    Only the caller or callee can delete their own copy of the call.
    """
    # Find the call
    call = await db.calls.find_one({"call_id": call_id})
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    
    # Verify user is part of this call (use callee_id, not receiver_id)
    if call["caller_id"] != current_user.user_id and call["callee_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this call")
    
    # Delete the call
    await db.calls.delete_one({"call_id": call_id})
    
    return {"message": "Call deleted", "call_id": call_id}


@router.delete("/history")
async def delete_all_call_history(
    current_user: UserPublic = Depends(get_current_user),
):
    """
    Delete all calls from user's history.
    Only deletes calls where the user is either caller or callee.
    """
    result = await db.calls.delete_many({
        "$or": [
            {"caller_id": current_user.user_id},
            {"callee_id": current_user.user_id}
        ]
    })
    
    return {
        "message": "All call history deleted",
        "deleted_count": result.deleted_count
    }


# =============================================================================
# GROUP CALL ENDPOINTS
# =============================================================================

class GroupCallRequest(BaseModel):
    """Request to create a group call"""
    participant_ids: list[str]  # List of user_ids to invite
    call_type: str = "video"  # "video" or "voice"
    group_name: Optional[str] = None  # Optional name for the group call


class GroupCallResponse(BaseModel):
    """Response with group call details"""
    group_call_id: str
    channel: str
    app_id: str
    call_type: str
    status: str
    host_id: str
    host_name: str
    host_uid: int
    host_token: str
    participants: list[dict]
    max_participants: int
    created_at: str


class AddParticipantRequest(BaseModel):
    """Request to add a participant to an active group call"""
    user_id: str


class ParticipantTokenResponse(BaseModel):
    """Response with participant's token for joining"""
    group_call_id: str
    channel: str
    token: str
    uid: int
    app_id: str


MAX_GROUP_PARTICIPANTS = 16


@router.post("/group/create", response_model=GroupCallResponse)
async def create_group_call(
    request: GroupCallRequest,
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Create a group call and invite multiple participants.
    - Host can invite up to 15 other users (16 total including host)
    - All participants must be friends with the host
    - Generates tokens for all participants
    """
    if not AGORA_AVAILABLE:
        raise HTTPException(status_code=500, detail="Agora SDK not available")
    
    if len(request.participant_ids) > MAX_GROUP_PARTICIPANTS - 1:
        raise HTTPException(
            status_code=400, 
            detail=f"Maximum {MAX_GROUP_PARTICIPANTS} participants allowed (including host)"
        )
    
    if len(request.participant_ids) == 0:
        raise HTTPException(status_code=400, detail="At least one participant required")
    
    # Verify all participants are friends
    from routes.friend_requests import _is_friend_dict
    non_friends = [p for p in request.participant_ids if not _is_friend_dict(current_user.friends, "user", p)]
    if non_friends:
        raise HTTPException(
            status_code=403,
            detail=f"You must be friends with all participants. Non-friends: {len(non_friends)}"
        )
    
    # Verify all participants exist (batch)
    users = await db.users.find(
        {"user_id": {"$in": request.participant_ids}, "is_hidden": {"$ne": True}},
        {"_id": 0, "user_id": 1, "name": 1, "profile_photo": 1}
    ).to_list(len(request.participant_ids))
    user_map = {u["user_id"]: u for u in users}
    for user_id in request.participant_ids:
        if user_id not in user_map:
            raise HTTPException(status_code=404, detail=f"User {user_id} not found or unavailable")
    participants_data = [user_map[uid] for uid in request.participant_ids]
    
    app_id, app_certificate = get_agora_credentials()
    channel_name = generate_channel_name()
    expiry_timestamp = int(datetime.now().timestamp()) + 3600 * 2  # 2 hours for group calls
    
    # Generate host token
    host_uid = abs(hash(current_user.user_id)) % (2**31)
    host_token = RtcTokenBuilder.buildTokenWithUid(
        appId=app_id,
        appCertificate=app_certificate,
        channelName=channel_name,
        uid=host_uid,
        role=1,
        privilegeExpiredTs=expiry_timestamp
    )
    
    # Generate participant tokens
    participants = []
    for user in participants_data:
        uid = abs(hash(user["user_id"])) % (2**31)
        token = RtcTokenBuilder.buildTokenWithUid(
            appId=app_id,
            appCertificate=app_certificate,
            channelName=channel_name,
            uid=uid,
            role=1,
            privilegeExpiredTs=expiry_timestamp
        )
        participants.append({
            "user_id": user["user_id"],
            "name": user["name"],
            "profile_photo": user.get("profile_photo"),
            "uid": uid,
            "token": token,
            "status": "invited",
            "joined_at": None
        })
    
    # Create group call document
    group_call_id = generate_id("gcall")
    group_call_doc = {
        "group_call_id": group_call_id,
        "channel": channel_name,
        "call_type": request.call_type,
        "group_name": request.group_name or f"Group Call with {len(participants)} people",
        "status": "active",
        "host_id": current_user.user_id,
        "host_name": current_user.name,
        "host_uid": host_uid,
        "host_token": host_token,
        "participants": participants,
        "max_participants": MAX_GROUP_PARTICIPANTS,
        "created_at": now_utc(),
        "ended_at": None,
        "expiry_timestamp": expiry_timestamp
    }
    
    await db.group_calls.insert_one(group_call_doc)
    
    # Send notifications to all participants
    for participant in participants:
        notif = {
            "notification_id": generate_id("notif"),
            "user_id": participant["user_id"],
            "type": "group_call_invite",
            "title": f"Group Call from {current_user.name}",
            "body": f"{current_user.name} invited you to a {request.call_type} call",
            "data": {
                "group_call_id": group_call_id,
                "channel": channel_name,
                "call_type": request.call_type,
                "host_name": current_user.name
            },
            "read": False,
            "created_at": now_utc()
        }
        await db.notifications.insert_one(notif)
        asyncio.create_task(ws_broadcast_notification(participant["user_id"], notif))
    
    return GroupCallResponse(
        group_call_id=group_call_id,
        channel=channel_name,
        app_id=app_id,
        call_type=request.call_type,
        status="active",
        host_id=current_user.user_id,
        host_name=current_user.name,
        host_uid=host_uid,
        host_token=host_token,
        participants=participants,
        max_participants=MAX_GROUP_PARTICIPANTS,
        created_at=group_call_doc["created_at"]
    )


@router.get("/group/my-calls")
async def get_my_group_calls(
    current_user: UserPublic = Depends(get_current_user),
    status: Optional[str] = None,
    limit: int = 20
):
    """Get user's group call history"""
    query = {
        "$or": [
            {"host_id": current_user.user_id},
            {"participants.user_id": current_user.user_id}
        ]
    }
    if status:
        query["status"] = status
    
    calls = await db.group_calls.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(length=limit)
    
    return calls


@router.get("/group/{group_call_id}")
async def get_group_call(
    group_call_id: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """Get group call details"""
    group_call = await db.group_calls.find_one(
        {"group_call_id": group_call_id},
        {"_id": 0}
    )
    if not group_call:
        raise HTTPException(status_code=404, detail="Group call not found")
    
    # Check if user is host or participant
    is_host = group_call["host_id"] == current_user.user_id
    is_participant = any(p["user_id"] == current_user.user_id for p in group_call["participants"])
    
    if not is_host and not is_participant:
        raise HTTPException(status_code=403, detail="Not authorized to view this call")
    
    return group_call


@router.post("/group/{group_call_id}/join", response_model=ParticipantTokenResponse)
async def join_group_call(
    group_call_id: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Join a group call as a participant.
    Returns the user's token for joining the Agora channel.
    """
    group_call = await db.group_calls.find_one(
        {"group_call_id": group_call_id},
        {"_id": 0}
    )
    if not group_call:
        raise HTTPException(status_code=404, detail="Group call not found")
    
    if group_call["status"] != "active":
        raise HTTPException(status_code=400, detail="This call has ended")
    
    # Check if call expired
    if datetime.now().timestamp() > group_call["expiry_timestamp"]:
        await db.group_calls.update_one(
            {"group_call_id": group_call_id},
            {"$set": {"status": "expired", "ended_at": now_utc()}}
        )
        raise HTTPException(status_code=400, detail="This call has expired")
    
    # Find participant's token
    participant = None
    for p in group_call["participants"]:
        if p["user_id"] == current_user.user_id:
            participant = p
            break
    
    # If host is joining
    if group_call["host_id"] == current_user.user_id:
        return ParticipantTokenResponse(
            group_call_id=group_call_id,
            channel=group_call["channel"],
            token=group_call["host_token"],
            uid=group_call["host_uid"],
            app_id=os.getenv("AGORA_APP_ID")
        )
    
    if not participant:
        raise HTTPException(status_code=403, detail="You are not invited to this call")
    
    # Update participant status
    await db.group_calls.update_one(
        {"group_call_id": group_call_id, "participants.user_id": current_user.user_id},
        {"$set": {
            "participants.$.status": "joined",
            "participants.$.joined_at": now_utc()
        }}
    )
    
    return ParticipantTokenResponse(
        group_call_id=group_call_id,
        channel=group_call["channel"],
        token=participant["token"],
        uid=participant["uid"],
        app_id=os.getenv("AGORA_APP_ID")
    )


@router.post("/group/{group_call_id}/add-participant")
async def add_participant_to_group_call(
    group_call_id: str,
    request: AddParticipantRequest,
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Add a new participant to an active group call.
    Only the host can add participants during a call.
    """
    if not AGORA_AVAILABLE:
        raise HTTPException(status_code=500, detail="Agora SDK not available")
    
    group_call = await db.group_calls.find_one(
        {"group_call_id": group_call_id},
        {"_id": 0}
    )
    if not group_call:
        raise HTTPException(status_code=404, detail="Group call not found")
    
    # Only host can add participants
    if group_call["host_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Only the host can add participants")
    
    if group_call["status"] != "active":
        raise HTTPException(status_code=400, detail="Cannot add to ended call")
    
    # Check participant limit
    current_count = len(group_call["participants"]) + 1  # +1 for host
    if current_count >= MAX_GROUP_PARTICIPANTS:
        raise HTTPException(
            status_code=400, 
            detail=f"Maximum {MAX_GROUP_PARTICIPANTS} participants reached"
        )
    
    # Check if already in call
    if any(p["user_id"] == request.user_id for p in group_call["participants"]):
        raise HTTPException(status_code=400, detail="User already in call")
    
    # Verify friendship
    from routes.friend_requests import _is_friend_dict
    if not _is_friend_dict(current_user.friends, "user", request.user_id):
        raise HTTPException(status_code=403, detail="You must be friends to add this user")
    
    # Get user details
    user = await db.users.find_one(
        {"user_id": request.user_id, "is_hidden": {"$ne": True}},
        {"_id": 0, "user_id": 1, "name": 1, "profile_photo": 1}
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Generate token
    app_id, app_certificate = get_agora_credentials()
    uid = abs(hash(user["user_id"])) % (2**31)
    token = RtcTokenBuilder.buildTokenWithUid(
        appId=app_id,
        appCertificate=app_certificate,
        channelName=group_call["channel"],
        uid=uid,
        role=1,
        privilegeExpiredTs=group_call["expiry_timestamp"]
    )
    
    new_participant = {
        "user_id": user["user_id"],
        "name": user["name"],
        "profile_photo": user.get("profile_photo"),
        "uid": uid,
        "token": token,
        "status": "invited",
        "joined_at": None
    }
    
    await db.group_calls.update_one(
        {"group_call_id": group_call_id},
        {"$push": {"participants": new_participant}}
    )
    
    # Send notification
    notif = {
        "notification_id": generate_id("notif"),
        "user_id": request.user_id,
        "type": "group_call_invite",
        "title": f"Group Call from {current_user.name}",
        "body": f"{current_user.name} invited you to join a {group_call['call_type']} call",
        "data": {
            "group_call_id": group_call_id,
            "channel": group_call["channel"],
            "call_type": group_call["call_type"],
            "host_name": current_user.name
        },
        "read": False,
        "created_at": now_utc()
    }
    await db.notifications.insert_one(notif)
    asyncio.create_task(ws_broadcast_notification(request.user_id, notif))
    
    return {
        "message": "Participant added",
        "participant": new_participant,
        "total_participants": current_count + 1
    }


@router.post("/group/{group_call_id}/leave")
async def leave_group_call(
    group_call_id: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """Leave a group call"""
    group_call = await db.group_calls.find_one(
        {"group_call_id": group_call_id},
        {"_id": 0}
    )
    if not group_call:
        raise HTTPException(status_code=404, detail="Group call not found")
    
    # If host leaves, end the call
    if group_call["host_id"] == current_user.user_id:
        await db.group_calls.update_one(
            {"group_call_id": group_call_id},
            {"$set": {"status": "ended", "ended_at": now_utc()}}
        )
        return {"message": "Call ended", "reason": "host_left"}
    
    # Update participant status
    await db.group_calls.update_one(
        {"group_call_id": group_call_id, "participants.user_id": current_user.user_id},
        {"$set": {"participants.$.status": "left"}}
    )
    
    return {"message": "Left call"}


@router.post("/group/{group_call_id}/end")
async def end_group_call(
    group_call_id: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """End a group call (host only)"""
    group_call = await db.group_calls.find_one(
        {"group_call_id": group_call_id},
        {"_id": 0}
    )
    if not group_call:
        raise HTTPException(status_code=404, detail="Group call not found")
    
    if group_call["host_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Only the host can end the call")
    
    await db.group_calls.update_one(
        {"group_call_id": group_call_id},
        {"$set": {"status": "ended", "ended_at": now_utc()}}
    )
    
    return {"message": "Call ended"}

