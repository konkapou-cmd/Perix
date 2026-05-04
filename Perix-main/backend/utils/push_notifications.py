"""Push notification service using Expo Push Notifications."""
import httpx
from typing import List, Optional
from database import db

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def send_push_notification(
    push_tokens: List[str],
    title: str,
    body: str,
    data: Optional[dict] = None,
    sound: str = "default",
    priority: str = "high",
    channel_id: str = "default"
) -> dict:
    """
    Send push notification to multiple Expo push tokens.
    
    Args:
        push_tokens: List of Expo push tokens
        title: Notification title
        body: Notification body
        data: Additional data payload
        sound: Sound to play ("default" or custom sound name)
        priority: "default", "normal", "high"
        channel_id: Android notification channel ID
    
    Returns:
        Response from Expo push service
    """
    if not push_tokens:
        return {"success": False, "error": "No push tokens provided"}
    
    messages = []
    for token in push_tokens:
        if not token.startswith("ExponentPushToken"):
            continue
            
        message = {
            "to": token,
            "title": title,
            "body": body,
            "sound": sound,
            "priority": priority,
            "channelId": channel_id,
        }
        
        if data:
            message["data"] = data
            
        messages.append(message)
    
    if not messages:
        return {"success": False, "error": "No valid push tokens"}
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                EXPO_PUSH_URL,
                json=messages,
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                    "Content-Type": "application/json",
                }
            )
            
            result = response.json()
            return {"success": True, "result": result}
            
    except Exception as e:
        return {"success": False, "error": str(e)}


async def get_user_push_tokens(user_id: str) -> List[str]:
    """Get all push tokens for a user."""
    tokens = await db.push_tokens.find(
        {"user_id": user_id},
        {"push_token": 1, "_id": 0}
    ).to_list(10)
    
    return [t["push_token"] for t in tokens]


async def send_call_notification(
    recipient_user_id: str,
    caller_name: str,
    caller_id: str,
    caller_photo: Optional[str],
    call_id: str,
    call_type: str  # "video" or "voice"
) -> dict:
    """Send incoming call notification."""
    push_tokens = await get_user_push_tokens(recipient_user_id)
    
    title = "📹 Incoming Video Call" if call_type == "video" else "📞 Incoming Call"
    body = f"{caller_name} is calling..."
    
    data = {
        "type": "incoming_call",
        "callId": call_id,
        "callerId": caller_id,
        "callerName": caller_name,
        "callerPhoto": caller_photo or "",
        "callType": call_type,
    }
    
    return await send_push_notification(
        push_tokens=push_tokens,
        title=title,
        body=body,
        data=data,
        sound="default",
        priority="high",
        channel_id="calls"
    )


async def send_message_notification(
    recipient_user_id: str,
    sender_name: str,
    sender_id: str,
    sender_photo: Optional[str],
    conversation_id: str,
    message_preview: str
) -> dict:
    """Send new message notification."""
    push_tokens = await get_user_push_tokens(recipient_user_id)
    
    # Truncate message preview
    preview = message_preview[:100] + "..." if len(message_preview) > 100 else message_preview
    
    data = {
        "type": "new_message",
        "conversationId": conversation_id,
        "senderId": sender_id,
        "senderName": sender_name,
        "senderPhoto": sender_photo or "",
        "messagePreview": preview,
    }
    
    return await send_push_notification(
        push_tokens=push_tokens,
        title=sender_name,
        body=preview,
        data=data,
        sound="default",
        priority="high",
        channel_id="messages"
    )


async def send_activity_notification(
    recipient_user_id: str,
    actor_name: str,
    actor_id: str,
    actor_photo: Optional[str],
    activity_type: str,  # "like", "comment", "friend_request", "friend_accepted"
    message: str,
    post_id: Optional[str] = None
) -> dict:
    """Send activity notification (like, comment, friend request)."""
    push_tokens = await get_user_push_tokens(recipient_user_id)
    
    title_map = {
        "like": "❤️ New Like",
        "comment": "💬 New Comment",
        "friend_request": "👋 Friend Request",
        "friend_accepted": "🎉 Friend Accepted",
    }
    
    title = title_map.get(activity_type, "New Activity")
    
    data = {
        "type": "activity",
        "activityType": activity_type,
        "actorId": actor_id,
        "actorName": actor_name,
        "actorPhoto": actor_photo or "",
        "message": message,
    }
    
    if post_id:
        data["postId"] = post_id
    
    return await send_push_notification(
        push_tokens=push_tokens,
        title=title,
        body=message,
        data=data,
        sound="default",
        priority="default",
        channel_id="activities"
    )


async def send_friend_request_notification(
    recipient_user_id: str,
    sender_name: str,
    sender_id: str,
    sender_photo: Optional[str] = None,
    request_id: str = None
) -> dict:
    """Send notification when someone sends a friend request."""
    user = await db.users.find_one({"user_id": recipient_user_id}, {"push_tokens": 1})
    push_tokens = user.get("push_tokens", []) if user else []
    
    if not push_tokens:
        return {"success": False, "error": "No push tokens for recipient"}
    
    data = {
        "type": "friend_request",
        "senderId": sender_id,
        "senderName": sender_name,
        "senderPhoto": sender_photo or "",
        "requestId": request_id or "",
        "screen": "friend-requests",
    }
    
    return await send_push_notification(
        push_tokens=push_tokens,
        title="New Friend Request",
        body=f"{sender_name} wants to be your friend",
        data=data,
        sound="default",
        priority="high",
        channel_id="social"
    )


async def send_friend_accepted_notification(
    recipient_user_id: str,
    accepter_name: str,
    accepter_id: str,
    accepter_photo: Optional[str] = None
) -> dict:
    """Send notification when someone accepts a friend request."""
    user = await db.users.find_one({"user_id": recipient_user_id}, {"push_tokens": 1})
    push_tokens = user.get("push_tokens", []) if user else []
    
    if not push_tokens:
        return {"success": False, "error": "No push tokens for recipient"}
    
    data = {
        "type": "friend_accepted",
        "accepterId": accepter_id,
        "accepterName": accepter_name,
        "accepterPhoto": accepter_photo or "",
        "screen": "user",
        "userId": accepter_id,
    }
    
    return await send_push_notification(
        push_tokens=push_tokens,
        title="Friend Request Accepted!",
        body=f"{accepter_name} accepted your friend request",
        data=data,
        sound="default",
        priority="high",
        channel_id="social"
    )


async def send_event_reminder_notification(
    recipient_user_id: str,
    event_title: str,
    event_id: str,
    time_until: str,  # e.g., "1 hour", "1 day"
    event_location: Optional[str] = None
) -> dict:
    """Send reminder notification before an event starts."""
    user = await db.users.find_one({"user_id": recipient_user_id}, {"push_tokens": 1})
    push_tokens = user.get("push_tokens", []) if user else []
    
    if not push_tokens:
        return {"success": False, "error": "No push tokens for recipient"}
    
    body = f"{event_title} starts in {time_until}"
    if event_location:
        body += f" at {event_location}"
    
    data = {
        "type": "event_reminder",
        "eventId": event_id,
        "eventTitle": event_title,
        "timeUntil": time_until,
        "screen": "event",
    }
    
    return await send_push_notification(
        push_tokens=push_tokens,
        title=f"Event Reminder: {time_until}",
        body=body,
        data=data,
        sound="default",
        priority="high",
        channel_id="events"
    )

