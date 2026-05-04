"""Friend Requests routes - Send, Accept, Decline friend requests."""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from pydantic import BaseModel
import asyncio

from database import db
from models.user import UserPublic
from utils.helpers import generate_id, now_utc
from routes.dependencies import get_current_user, build_user_public
from routes.ws import ws_broadcast_notification

router = APIRouter(prefix="/friend-requests", tags=["Friend Requests"])


class FriendRequestCreate(BaseModel):
    to_user_id: str
    entity_type: str = "user"  # "user" | "business" | "artist"
    entity_id: Optional[str] = None  # Required when entity_type != "user"


class FriendRequestResponse(BaseModel):
    request_id: str
    from_user_id: str
    to_user_id: str
    entity_type: str = "user"  # "user" | "business" | "artist"
    entity_id: Optional[str] = None
    status: str  # "pending", "accepted", "declined"
    created_at: str
    from_user: Optional[dict] = None
    to_user: Optional[dict] = None
    to_entity_name: Optional[str] = None
    to_entity_image: Optional[str] = None


def _is_friend_dict(friends, entity_type, entity_id):
    """Check if entity is in friends list (handles both old string format and new dict format)."""
    for f in (friends or []):
        if isinstance(f, dict):
            if f.get("entity_type") == entity_type and f.get("entity_id") == entity_id:
                return True
        elif isinstance(f, str) and entity_type == "user":
            if f == entity_id:
                return True
    return False


@router.post("/send", response_model=FriendRequestResponse)
async def send_friend_request(
    payload: FriendRequestCreate,
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Send a friend request to a user, business, or artist.
    For users: entity_type="user", entity_id=user_id
    For businesses: entity_type="business", entity_id=business_id
    For artists: entity_type="artist", entity_id=artist_id
    """
    entity_type = payload.entity_type
    entity_id = payload.entity_id or payload.to_user_id
    
    # Resolve the recipient user_id (the actual user account to notify)
    to_user_id = None
    to_entity_name = None
    to_entity_image = None
    
    if entity_type == "user":
        to_user_id = entity_id
        target_user = await db.users.find_one({"user_id": to_user_id}, {"_id": 0, "password_hash": 0})
        if not target_user:
            raise HTTPException(status_code=404, detail="User not found")
        to_entity_name = target_user.get("name")
        to_entity_image = target_user.get("profile_photo") or target_user.get("picture")
    elif entity_type == "business":
        target_business = await db.businesses.find_one({"business_id": entity_id}, {"_id": 0})
        if not target_business:
            raise HTTPException(status_code=404, detail="Business not found")
        to_user_id = target_business.get("owner_id")
        to_entity_name = target_business.get("name")
        to_entity_image = target_business.get("logo_image")
    elif entity_type == "artist":
        target_artist = await db.artists.find_one({"artist_id": entity_id}, {"_id": 0})
        if not target_artist:
            raise HTTPException(status_code=404, detail="Artist not found")
        to_user_id = target_artist.get("owner_id")
        to_entity_name = target_artist.get("name")
        to_entity_image = target_artist.get("profile_photo")
    else:
        raise HTTPException(status_code=400, detail="Invalid entity type")
    
    # Can't send request to yourself
    if to_user_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="Cannot send friend request to yourself")
    
    # Check if already friends
    if _is_friend_dict(current_user.friends, entity_type, entity_id):
        raise HTTPException(status_code=400, detail="Already friends with this entity")
    
    # Check if request already exists (pending)
    existing_request = await db.friend_requests.find_one({
        "from_user_id": current_user.user_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "status": "pending"
    })
    if existing_request:
        raise HTTPException(status_code=400, detail="Friend request already sent")
    
    # Check if there's a pending request FROM the target user TO current user (mutual request = auto-accept)
    reverse_request = await db.friend_requests.find_one({
        "from_user_id": to_user_id,
        "entity_type": entity_type,
        "entity_id": current_user.user_id if entity_type == "user" else entity_id,
        "status": "pending"
    })
    if reverse_request:
        await db.friend_requests.update_one(
            {"request_id": reverse_request["request_id"]},
            {"$set": {"status": "accepted", "accepted_at": now_utc().isoformat()}}
        )
        friend_entry = {"entity_type": entity_type, "entity_id": entity_id}
        current_entry = {"entity_type": "user", "entity_id": current_user.user_id}
        await db.users.update_one(
            {"user_id": current_user.user_id},
            {"$addToSet": {"friends": friend_entry}}
        )
        if entity_type == "user":
            await db.users.update_one(
                {"user_id": to_user_id},
                {"$addToSet": {"friends": current_entry}}
            )
        elif entity_type == "business":
            await db.businesses.update_one(
                {"business_id": entity_id},
                {"$addToSet": {"followers": {"$each": [current_entry]}}}
            )
        elif entity_type == "artist":
            await db.artists.update_one(
                {"artist_id": entity_id},
                {"$addToSet": {"followers": {"$each": [current_entry]}}}
            )
        
        return FriendRequestResponse(
            request_id=reverse_request["request_id"],
            from_user_id=to_user_id,
            to_user_id=current_user.user_id,
            entity_type=entity_type,
            entity_id=entity_id,
            status="accepted",
            created_at=reverse_request["created_at"],
            to_entity_name=to_entity_name,
            to_entity_image=to_entity_image,
        )
    
    # Create new friend request
    request_doc = {
        "request_id": generate_id("freq"),
        "from_user_id": current_user.user_id,
        "to_user_id": to_user_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "status": "pending",
        "created_at": now_utc().isoformat(),
    }
    await db.friend_requests.insert_one(request_doc)
    
    # Send push notification
    if to_user_id:
        try:
            from utils.push_notifications import send_friend_request_notification
            asyncio.create_task(
                send_friend_request_notification(
                    recipient_user_id=to_user_id,
                    sender_name=current_user.name,
                    sender_id=current_user.user_id,
                    sender_photo=current_user.profile_photo or current_user.picture,
                    request_id=request_doc["request_id"]
                )
            )
        except Exception as e:
            print(f"Failed to send friend request notification: {e}")
    
    asyncio.create_task(ws_broadcast_notification(to_user_id, {
        "type": "friend_request",
        "actor_id": current_user.user_id,
        "actor_name": current_user.name,
        "actor_avatar": current_user.profile_photo or current_user.picture,
        "request_id": request_doc["request_id"],
    }))
    
    return FriendRequestResponse(
        request_id=request_doc["request_id"],
        from_user_id=current_user.user_id,
        to_user_id=to_user_id or "",
        entity_type=entity_type,
        entity_id=entity_id,
        status="pending",
        created_at=request_doc["created_at"],
        to_entity_name=to_entity_name,
        to_entity_image=to_entity_image,
    )


@router.post("/accept/{request_id}")
async def accept_friend_request(
    request_id: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Accept a pending friend request.
    """
    # Find the request
    request = await db.friend_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Friend request not found")
    
    # Must be the recipient
    if request["to_user_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to accept this request")
    
    # Must be pending
    if request["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {request['status']}")
    
    entity_type = request.get("entity_type", "user")
    entity_id = request.get("entity_id", request["from_user_id"])
    
    # Update request status
    await db.friend_requests.update_one(
        {"request_id": request_id},
        {"$set": {"status": "accepted", "accepted_at": now_utc().isoformat()}}
    )
    
    # Add each other as friends
    from_user_id = request["from_user_id"]
    current_entry = {"entity_type": "user", "entity_id": current_user.user_id}
    from_entry = {"entity_type": "user", "entity_id": from_user_id}
    
    if entity_type == "user":
        await db.users.update_one(
            {"user_id": current_user.user_id},
            {"$addToSet": {"friends": from_entry}}
        )
        await db.users.update_one(
            {"user_id": from_user_id},
            {"$addToSet": {"friends": current_entry}}
        )
    elif entity_type == "business":
        await db.users.update_one(
            {"user_id": current_user.user_id},
            {"$addToSet": {"friends": from_entry}}
        )
        await db.businesses.update_one(
            {"business_id": entity_id},
            {"$addToSet": {"followers": {"$each": [current_entry]}}}
        )
    elif entity_type == "artist":
        await db.users.update_one(
            {"user_id": current_user.user_id},
            {"$addToSet": {"friends": from_entry}}
        )
        await db.artists.update_one(
            {"artist_id": entity_id},
            {"$addToSet": {"followers": {"$each": [current_entry]}}}
        )
    
    # Send notification to the requester
    try:
        from utils.push_notifications import send_friend_accepted_notification
        asyncio.create_task(
            send_friend_accepted_notification(
                recipient_user_id=from_user_id,
                accepter_name=current_user.name,
                accepter_id=current_user.user_id,
                accepter_photo=current_user.profile_photo or current_user.picture,
            )
        )
    except Exception as e:
        print(f"Failed to send friend accepted notification: {e}")
    
    asyncio.create_task(ws_broadcast_notification(from_user_id, {
        "type": "friend",
        "actor_id": current_user.user_id,
        "actor_name": current_user.name,
        "actor_avatar": current_user.profile_photo or current_user.picture,
    }))
    
    return {"success": True, "message": "Friend request accepted", "request_id": request_id}


@router.post("/decline/{request_id}")
async def decline_friend_request(
    request_id: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Decline a pending friend request.
    """
    # Find the request
    request = await db.friend_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Friend request not found")
    
    # Must be the recipient
    if request["to_user_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to decline this request")
    
    # Must be pending
    if request["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {request['status']}")
    
    # Update request status
    await db.friend_requests.update_one(
        {"request_id": request_id},
        {"$set": {"status": "declined", "declined_at": now_utc().isoformat()}}
    )
    
    return {"success": True, "message": "Friend request declined", "request_id": request_id}


@router.post("/cancel/{request_id}")
async def cancel_friend_request(
    request_id: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Cancel a friend request you sent.
    """
    # Find the request
    request = await db.friend_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Friend request not found")
    
    # Must be the sender
    if request["from_user_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to cancel this request")
    
    # Must be pending
    if request["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {request['status']}")
    
    # Delete the request
    await db.friend_requests.delete_one({"request_id": request_id})
    
    return {"success": True, "message": "Friend request cancelled", "request_id": request_id}


@router.get("/received", response_model=List[FriendRequestResponse])
async def get_received_requests(
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Get all pending friend requests received by current user.
    """
    requests = await db.friend_requests.find(
        {"to_user_id": current_user.user_id, "status": "pending"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    from_user_ids = [r["from_user_id"] for r in requests]
    users = await db.users.find(
        {"user_id": {"$in": from_user_ids}},
        {"_id": 0, "password_hash": 0}
    ).to_list(100)
    user_map = {u["user_id"]: build_user_public(u) for u in users}
    
    result = []
    for req in requests:
        from_user = user_map.get(req["from_user_id"])
        entity_type = req.get("entity_type", "user")
        entity_id = req.get("entity_id", req["from_user_id"])
        result.append(FriendRequestResponse(
            request_id=req["request_id"],
            from_user_id=req["from_user_id"],
            to_user_id=req["to_user_id"],
            entity_type=entity_type,
            entity_id=entity_id,
            status=req["status"],
            created_at=req["created_at"],
            from_user=from_user.dict() if from_user else None,
        ))
    
    return result


@router.get("/sent", response_model=List[FriendRequestResponse])
async def get_sent_requests(
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Get all pending friend requests sent by current user.
    """
    requests = await db.friend_requests.find(
        {"from_user_id": current_user.user_id, "status": "pending"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    result = []
    for req in requests:
        entity_type = req.get("entity_type", "user")
        entity_id = req.get("entity_id", req["to_user_id"])
        
        # Populate entity name/image based on type
        to_entity_name = None
        to_entity_image = None
        if entity_type == "business":
            biz = await db.businesses.find_one({"business_id": entity_id}, {"name": 1, "logo_image": 1, "_id": 0})
            if biz:
                to_entity_name = biz.get("name")
                to_entity_image = biz.get("logo_image")
        elif entity_type == "artist":
            art = await db.artists.find_one({"artist_id": entity_id}, {"name": 1, "profile_photo": 1, "_id": 0})
            if art:
                to_entity_name = art.get("name")
                to_entity_image = art.get("profile_photo")
        elif entity_type == "user":
            to_user = await db.users.find_one({"user_id": entity_id}, {"_id": 0, "password_hash": 0})
            if to_user:
                to_entity_name = to_user.get("name")
                to_entity_image = to_user.get("profile_photo") or to_user.get("picture")
        
        result.append(FriendRequestResponse(
            request_id=req["request_id"],
            from_user_id=req["from_user_id"],
            to_user_id=req["to_user_id"],
            entity_type=entity_type,
            entity_id=entity_id,
            status=req["status"],
            created_at=req["created_at"],
            to_entity_name=to_entity_name,
            to_entity_image=to_entity_image,
        ))
    
    return result


@router.get("/count")
async def get_pending_request_count(
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Get count of pending friend requests for badge display.
    """
    count = await db.friend_requests.count_documents({
        "to_user_id": current_user.user_id,
        "status": "pending"
    })
    return {"pending_count": count}


class MyFriendRequestsResponse(BaseModel):
    incoming: List[FriendRequestResponse]
    outgoing: List[FriendRequestResponse]


@router.get("/my", response_model=MyFriendRequestsResponse)
async def get_my_friend_requests(
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Get all friend requests (incoming and outgoing) for the current user.
    Includes requests for users, businesses, and artists.
    """
    incoming = await get_received_requests(current_user)
    outgoing = await get_sent_requests(current_user)
    return MyFriendRequestsResponse(incoming=incoming, outgoing=outgoing)


@router.get("/status/{entity_type}/{entity_id}")
async def get_friendship_status(
    entity_type: str,
    entity_id: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Get friendship status with any entity (user, business, or artist).
    Returns: "friends", "request_sent", "request_received", "none"
    """
    # Check if already friends
    if _is_friend_dict(current_user.friends, entity_type, entity_id):
        return {"status": "friends", "request_id": None}
    
    # Check if we sent a request
    sent_request = await db.friend_requests.find_one({
        "from_user_id": current_user.user_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "status": "pending"
    }, {"_id": 0})
    if sent_request:
        return {"status": "request_sent", "request_id": sent_request["request_id"]}
    
    # Get recipient user_id for the request check
    to_user_id = None
    if entity_type == "user":
        to_user_id = entity_id
    elif entity_type == "business":
        biz = await db.businesses.find_one({"business_id": entity_id}, {"owner_id": 1, "_id": 0})
        to_user_id = biz.get("owner_id") if biz else None
    elif entity_type == "artist":
        art = await db.artists.find_one({"artist_id": entity_id}, {"owner_id": 1, "_id": 0})
        to_user_id = art.get("owner_id") if art else None
    
    # Check if we received a request from them
    if to_user_id:
        received_request = await db.friend_requests.find_one({
            "from_user_id": to_user_id,
            "entity_type": entity_type,
            "entity_id": current_user.user_id if entity_type == "user" else entity_id,
            "status": "pending"
        }, {"_id": 0})
        if received_request:
            return {"status": "request_received", "request_id": received_request["request_id"]}
    
    return {"status": "none", "request_id": None}
