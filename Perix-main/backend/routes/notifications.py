"""Notifications routes."""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, Dict, List, Any
from pydantic import BaseModel
from datetime import datetime, timezone
import httpx
import logging

from database import db
from models.user import UserPublic
from models.notification import PushTokenRegister
from utils.helpers import now_utc
from routes.dependencies import get_current_user, build_user_public

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class ActivityItem(BaseModel):
    activity_id: str
    type: str
    message: str
    actor_id: str
    actor_name: str
    actor_avatar: Optional[str] = None
    actor_type: Optional[str] = None
    target_id: Optional[str] = None
    target_type: Optional[str] = None
    created_at: str
    read: bool = False


class ActivityFeedResponse(BaseModel):
    activities: List[ActivityItem]
    unread_count: int


@router.get("/activity-feed", response_model=ActivityFeedResponse)
async def get_activity_feed(
    limit: int = 5,
    current_user: UserPublic = Depends(get_current_user)
):
    """Get recent activity feed for the current user (likes, comments, new friends).
    
    Only returns the last 5 notifications to keep the feed focused.
    Uses a seen_notifications collection to prevent duplicate notifications.
    """
    activities: List[ActivityItem] = []
    now = datetime.now(timezone.utc)
    
    # Get previously seen notification IDs to prevent duplicates
    seen_doc = await db.seen_notifications.find_one(
        {"user_id": current_user.user_id},
        {"_id": 0, "seen_ids": 1}
    )
    seen_ids = set(seen_doc.get("seen_ids", [])) if seen_doc else set()
    
    # Get posts by current user to find likes and comments on them
    user_posts = await db.posts.find(
        {"user_id": current_user.user_id},
        {"_id": 0, "post_id": 1, "likes": 1, "comments": 1, "text": 1}
    ).to_list(50)
    
    # Collect user IDs for batch lookup
    user_ids_to_fetch = set()
    
    for post in user_posts:
        # Get likes (exclude self-likes)
        for like in post.get("likes", [])[-5:]:  # Last 5 likes per post
            if isinstance(like, dict):
                actor_id = like.get("actor_id")
                if actor_id and actor_id != current_user.user_id:
                    user_ids_to_fetch.add(actor_id)
            elif isinstance(like, str) and like != current_user.user_id:
                user_ids_to_fetch.add(like)
        
        # Get recent comments (exclude self-comments)
        for comment in post.get("comments", [])[-5:]:  # Last 5 comments per post
            if isinstance(comment, dict):
                commenter_id = comment.get("user_id")
                if commenter_id and commenter_id != current_user.user_id:
                    user_ids_to_fetch.add(commenter_id)
    
    # Fetch user details
    users_map = {}
    if user_ids_to_fetch:
        users = await db.users.find(
            {"user_id": {"$in": list(user_ids_to_fetch)}},
            {"_id": 0, "user_id": 1, "name": 1, "profile_photo": 1}
        ).to_list(100)
        users_map = {u["user_id"]: u for u in users}
    
    # Build activity items from likes
    for post in user_posts:
        post_preview = (post.get("text", "")[:30] + "...") if post.get("text") else "your post"
        
        for like in post.get("likes", [])[-3:]:
            # Handle both old format (string user_id) and new format (object with actor_id)
            if isinstance(like, str):
                actor_id = like
                like_time_str = now.isoformat()  # Old likes don't have timestamp
            elif isinstance(like, dict):
                # New format uses actor_id, but also check for user_id for backwards compat
                actor_id = like.get("actor_id") or like.get("user_id")
                like_actor_type = like.get("actor_type", "user")
                like_time = like.get("created_at")
                # Handle various timestamp formats
                if like_time is None:
                    like_time_str = now.isoformat()
                elif isinstance(like_time, str):
                    like_time_str = like_time
                elif hasattr(like_time, 'isoformat'):
                    like_time_str = like_time.isoformat()
                else:
                    like_time_str = now.isoformat()
            else:
                continue
                
            if actor_id and actor_id != current_user.user_id:
                user_info = users_map.get(actor_id, {})
                activities.append(ActivityItem(
                    activity_id=f"like_{post['post_id']}_{actor_id}",
                    type="like",
                    message=f"liked {post_preview}",
                    actor_id=actor_id,
                    actor_name=user_info.get("name", "Someone"),
                    actor_avatar=user_info.get("profile_photo"),
                    actor_type=like_actor_type,
                    target_id=post["post_id"],
                    target_type="post",
                    created_at=like_time_str,
                    read=False
                ))
        
        for comment in post.get("comments", [])[-3:]:
            if isinstance(comment, dict):
                commenter_id = comment.get("user_id")
                if commenter_id and commenter_id != current_user.user_id:
                    user_info = users_map.get(commenter_id, {})
                    comment_preview = (comment.get("text", "")[:20] + "...") if comment.get("text") else ""
                    comment_time = comment.get("created_at", now.isoformat())
                    comment_actor_type = comment.get("actor_type", "user")
                    activities.append(ActivityItem(
                        activity_id=f"comment_{post['post_id']}_{comment.get('comment_id', '')}",
                        type="comment",
                        message=f"commented: \"{comment_preview}\"",
                        actor_id=commenter_id,
                        actor_name=user_info.get("name", "Someone"),
                        actor_avatar=user_info.get("profile_photo"),
                        actor_type=comment_actor_type,
                        target_id=post["post_id"],
                        target_type="post",
                        created_at=comment_time if isinstance(comment_time, str) else comment_time.isoformat(),
                        read=False
                    ))
    
    # Get pending friend requests TO me (others wanting to connect with me)
    pending_requests = await db.friend_requests.find(
        {
            "to_user_id": current_user.user_id,
            "status": "pending"
        },
        {"_id": 0}
    ).sort("created_at", -1).limit(5).to_list(5)
    
    requester_ids = [r["from_user_id"] for r in pending_requests]
    requester_map = {}
    if requester_ids:
        requesters = await db.users.find(
            {"user_id": {"$in": requester_ids}},
            {"_id": 0, "user_id": 1, "name": 1, "profile_photo": 1}
        ).to_list(10)
        requester_map = {u["user_id"]: u for u in requesters}
    
    for request in pending_requests:
        requester = requester_map.get(request["from_user_id"])
        if requester:
            activities.append(ActivityItem(
                activity_id=f"friend_request_{request['request_id']}",
                type="friend_request",
                message="wants to connect with you",
                actor_id=requester["user_id"],
                actor_name=requester.get("name", "Someone"),
                actor_avatar=requester.get("profile_photo"),
                target_id=requester["user_id"],
                target_type="user",
                created_at=request["created_at"],
                read=False
            ))
    
    # Get recently accepted friend requests (new friends)
    accepted_requests = await db.friend_requests.find(
        {
            "$or": [
                {"to_user_id": current_user.user_id, "status": "accepted"},
                {"from_user_id": current_user.user_id, "status": "accepted"}
            ]
        },
        {"_id": 0}
    ).sort("accepted_at", -1).limit(5).to_list(5)
    
    accepted_user_ids = list({
        r["from_user_id"] if r["to_user_id"] == current_user.user_id else r["to_user_id"]
        for r in accepted_requests
    })
    accepted_user_map = {}
    if accepted_user_ids:
        accepted_users = await db.users.find(
            {"user_id": {"$in": accepted_user_ids}},
            {"_id": 0, "user_id": 1, "name": 1, "profile_photo": 1}
        ).to_list(10)
        accepted_user_map = {u["user_id"]: u for u in accepted_users}
    
    for request in accepted_requests:
        other_user_id = request["from_user_id"] if request["to_user_id"] == current_user.user_id else request["to_user_id"]
        other_user = accepted_user_map.get(other_user_id)
        if other_user:
            accepted_at = request.get("accepted_at", request["created_at"])
            activities.append(ActivityItem(
                activity_id=f"friend_{request['request_id']}",
                type="friend",
                message="is now your friend",
                actor_id=other_user["user_id"],
                actor_name=other_user.get("name", "Someone"),
                actor_avatar=other_user.get("profile_photo"),
                target_id=other_user["user_id"],
                target_type="user",
                created_at=accepted_at,
                read=False
            ))
    
    # Sort by time and limit to last 5
    activities.sort(key=lambda x: x.created_at, reverse=True)
    activities = activities[:limit]
    
    # Calculate unread count (notifications not in seen_ids)
    unread_count = len([a for a in activities if a.activity_id not in seen_ids])
    
    return ActivityFeedResponse(
        activities=activities,
        unread_count=unread_count
    )


class MarkReadRequest(BaseModel):
    notification_ids: List[str] = []
    mark_all: bool = False


@router.post("/mark-read")
async def mark_notifications_read(
    payload: MarkReadRequest,
    current_user: UserPublic = Depends(get_current_user)
):
    """Mark notifications as read. Either provide specific IDs or mark_all=true."""
    if payload.mark_all:
        # Get all current activity IDs and mark them as seen
        feed_response = await get_activity_feed(limit=20, current_user=current_user)
        notification_ids = [a.activity_id for a in feed_response.activities]
    else:
        notification_ids = payload.notification_ids
    
    if notification_ids:
        # Add to seen notifications
        await db.seen_notifications.update_one(
            {"user_id": current_user.user_id},
            {
                "$addToSet": {"seen_ids": {"$each": notification_ids}},
                "$set": {"updated_at": now_utc()}
            },
            upsert=True
        )
        
        # Limit stored seen_ids to prevent unbounded growth (keep last 100)
        await db.seen_notifications.update_one(
            {"user_id": current_user.user_id},
            [
                {"$set": {"seen_ids": {"$slice": ["$seen_ids", -100]}}}
            ]
        )
    
    return {"success": True, "marked_count": len(notification_ids)}


async def send_expo_push_notification(
    push_tokens: List[str],
    title: str,
    body: str,
    data: Optional[Dict] = None,
    channel_id: str = "default",
) -> bool:
    """Send push notification using Expo Push Service."""
    if not push_tokens:
        return False
    
    messages = []
    for token in push_tokens:
        message = {
            "to": token,
            "sound": "default",
            "title": title,
            "body": body,
            "channelId": channel_id,
        }
        if data:
            message["data"] = data
        messages.append(message)
    
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                "https://exp.host/--/api/v2/push/send",
                json=messages,
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                    "Content-Type": "application/json",
                },
            )
            if response.status_code == 200:
                result = response.json()
                logging.info(f"Push notification sent: {result}")
                return True
            else:
                logging.error(f"Push notification failed: {response.text}")
                return False
    except Exception as e:
        logging.error(f"Push notification error: {e}")
        return False


async def notify_user(
    user_id: str,
    title: str,
    body: str,
    data: Optional[Dict] = None,
    channel_id: str = "default",
):
    """Send push notification to a specific user."""
    tokens = await db.push_tokens.find({"user_id": user_id}, {"_id": 0}).to_list(10)
    push_tokens = [t["push_token"] for t in tokens if t.get("push_token")]
    if push_tokens:
        await send_expo_push_notification(push_tokens, title, body, data, channel_id)


async def notify_users(
    user_ids: List[str],
    title: str,
    body: str,
    data: Optional[Dict] = None,
    channel_id: str = "default",
):
    """Send push notification to multiple users."""
    tokens = await db.push_tokens.find(
        {"user_id": {"$in": user_ids}}, {"_id": 0}
    ).to_list(1000)
    push_tokens = [t["push_token"] for t in tokens if t.get("push_token")]
    if push_tokens:
        await send_expo_push_notification(push_tokens, title, body, data, channel_id)


@router.post("/register")
async def register_push_token(
    payload: PushTokenRegister, current_user: UserPublic = Depends(get_current_user)
):
    """Register a push notification token for the current user."""
    await db.push_tokens.update_one(
        {"user_id": current_user.user_id, "push_token": payload.push_token},
        {
            "$set": {
                "user_id": current_user.user_id,
                "push_token": payload.push_token,
                "platform": payload.platform,
                "updated_at": now_utc(),
            }
        },
        upsert=True,
    )
    return {"success": True}


@router.delete("/unregister")
async def unregister_push_token(
    push_token: str, current_user: UserPublic = Depends(get_current_user)
):
    """Unregister a push notification token."""
    await db.push_tokens.delete_one(
        {"user_id": current_user.user_id, "push_token": push_token}
    )
    return {"success": True}
