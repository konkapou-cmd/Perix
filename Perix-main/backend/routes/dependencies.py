"""Shared dependencies and authentication."""
from fastapi import Request, HTTPException
from passlib.context import CryptContext
from datetime import timedelta
from typing import Dict, Optional, Any
import httpx

from database import db
from models.user import UserPublic
from utils.helpers import now_utc, normalize_datetime
from config import SESSION_DAYS

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def build_user_public(user_doc: Dict) -> UserPublic:
    """Build a UserPublic model from a MongoDB document."""
    raw_friends = user_doc.get("friends", [])
    normalized_friends = []
    for f in raw_friends:
        if isinstance(f, str):
            normalized_friends.append({"entity_type": "user", "entity_id": f})
        elif isinstance(f, dict):
            normalized_friends.append(f)
    
    safe_doc = {
        "user_id": user_doc["user_id"],
        "email": user_doc["email"],
        "name": user_doc["name"],
        "picture": user_doc.get("picture"),
        "created_at": user_doc["created_at"],
        "gallery_images": user_doc.get("gallery_images", []),
        "gallery_videos": user_doc.get("gallery_videos", []),
        "gallery_items": user_doc.get("gallery_items", []),
        "video_items": user_doc.get("video_items", []),
        "profile_photo": user_doc.get("profile_photo"),
        "cover_photo": user_doc.get("cover_photo"),
        "cover_focal_point": user_doc.get("cover_focal_point", {"x": 0.5, "y": 0.5}),
        "bio": user_doc.get("bio"),
        "location": user_doc.get("location"),
        "friends": normalized_friends,
        "theme": user_doc.get("theme"),
        "is_admin": user_doc.get("is_admin", False),
        "role": user_doc.get("role", "user"),
        "latitude": user_doc.get("latitude"),
        "longitude": user_doc.get("longitude"),
    }
    return UserPublic(**safe_doc)


async def resolve_actor(
    actor_type: Optional[str],
    actor_id: Optional[str],
    current_user: UserPublic,
) -> Dict[str, Optional[str]]:
    """Resolve actor information for posts, comments, likes."""
    if actor_type == "business" and actor_id:
        business = await db.businesses.find_one(
            {"business_id": actor_id, "owner_id": current_user.user_id}, {"_id": 0}
        )
        if not business:
            raise HTTPException(status_code=403, detail="Not authorized")
        return {
            "actor_type": "business",
            "actor_id": actor_id,
            "actor_name": business.get("name"),
            "actor_avatar": business.get("logo_image"),
        }
    if actor_type == "artist" and actor_id:
        artist = await db.artists.find_one(
            {"artist_id": actor_id, "owner_id": current_user.user_id}, {"_id": 0}
        )
        if not artist:
            raise HTTPException(status_code=403, detail="Not authorized")
        avatar = artist.get("profile_photo")
        if not avatar and artist.get("gallery_images"):
            avatar = artist.get("gallery_images")[0]
        return {
            "actor_type": "artist",
            "actor_id": actor_id,
            "actor_name": artist.get("name"),
            "actor_avatar": avatar,
        }
    return {
        "actor_type": "user",
        "actor_id": current_user.user_id,
        "actor_name": current_user.name,
        "actor_avatar": current_user.profile_photo or current_user.picture,
    }


async def create_session(user_id: str, session_token: Optional[str] = None) -> str:
    """Create a new session for the user."""
    import uuid
    token = session_token or f"session_{uuid.uuid4().hex}"
    expires_at = now_utc() + timedelta(days=SESSION_DAYS)
    await db.user_sessions.insert_one(
        {
            "user_id": user_id,
            "session_token": token,
            "expires_at": expires_at,
            "created_at": now_utc(),
        }
    )
    return token


async def get_current_user(request: Request) -> UserPublic:
    """Get the current authenticated user from the request."""
    token = request.cookies.get("session_token")
    auth_header = request.headers.get("Authorization")
    if not token and auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires_at = normalize_datetime(session["expires_at"])
    if expires_at <= now_utc():
        await db.user_sessions.delete_one({"session_token": token})
        raise HTTPException(status_code=401, detail="Session expired")

    user = await db.users.find_one(
        {"user_id": session["user_id"]}, {"_id": 0, "password_hash": 0}
    )
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return build_user_public(user)


async def get_user_by_token(token: str) -> Optional[dict]:
    """Get user dict from a session token (for WebSocket auth)."""
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        return None

    expires_at = normalize_datetime(session["expires_at"])
    if expires_at <= now_utc():
        await db.user_sessions.delete_one({"session_token": token})
        return None

    user = await db.users.find_one(
        {"user_id": session["user_id"]}, {"_id": 0, "password_hash": 0}
    )
    return user


def like_matches_actor(like: Any, actor_type: str, actor_id: str) -> bool:
    """Check if a like matches the given actor."""
    if isinstance(like, str):
        return actor_type == "user" and like == actor_id
    return (
        like.get("actor_type", "user") == actor_type
        and like.get("actor_id") == actor_id
    )


async def get_blocked_user_ids(user_id: str) -> list:
    """Get the list of user IDs that the current user has blocked/reported."""
    user = await db.users.find_one(
        {"user_id": user_id},
        {"_id": 0, "blocked_users": 1}
    )
    return user.get("blocked_users", []) if user else []


async def geocode_town(town: str) -> Optional[Dict[str, float]]:
    """Geocode a town name to coordinates using Nominatim (OpenStreetMap)."""
    if not town:
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client_http:
            response = await client_http.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": town,
                    "format": "json",
                    "limit": 1,
                },
                headers={
                    "User-Agent": "PerixApp/1.0",
                },
            )
            if response.status_code == 200:
                data = response.json()
                if data and len(data) > 0:
                    return {
                        "latitude": float(data[0]["lat"]),
                        "longitude": float(data[0]["lon"]),
                    }
    except Exception:
        pass
    return None
