"""Analytics routes for dashboard data."""
from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel

from database import db
from models.user import UserPublic
from routes.dependencies import get_current_user
from utils.helpers import now_utc

router = APIRouter(prefix="/analytics", tags=["Analytics"])


class TimeRange(BaseModel):
    days: int = 30


class UserAnalytics(BaseModel):
    total_posts: int
    total_likes_received: int
    total_comments_received: int
    total_profile_views: int
    total_friends: int
    total_messages_sent: int
    total_messages_received: int
    engagement_rate: float
    growth_data: Dict[str, int]


class ArtistAnalytics(BaseModel):
    total_followers: int
    total_profile_views: int
    total_events: int
    total_event_attendees: int
    engagement_rate: float
    growth_data: Dict[str, int]
    top_events: List[Dict]


class BusinessAnalytics(BaseModel):
    total_followers: int
    total_profile_views: int
    total_events: int
    total_event_attendees: int
    total_activities: int
    engagement_rate: float
    growth_data: Dict[str, int]
    top_events: List[Dict]


@router.get("/user")
async def get_user_analytics(
    days: int = 30,
    current_user: UserPublic = Depends(get_current_user)
) -> UserAnalytics:
    """Get analytics for the current user's account."""
    user_id = current_user.user_id
    start_date = now_utc() - timedelta(days=days)
    
    # Get post stats
    total_posts = await db.posts.count_documents({
        "author_id": user_id,
        "is_hidden": {"$ne": True}
    })
    
    # Get likes received on posts
    user_posts = await db.posts.find(
        {"author_id": user_id},
        {"post_id": 1}
    ).to_list(1000)
    post_ids = [p["post_id"] for p in user_posts]
    
    total_likes_received = 0
    total_comments_received = 0
    if post_ids:
        try:
            likes_result = await db.posts.aggregate([
                {"$match": {"post_id": {"$in": post_ids}}},
                {"$group": {"_id": None, "total_likes": {"$sum": {"$size": {"$ifNull": ["$likes", []]}}}}}
            ]).to_list(1)
        except Exception:
            posts = await db.posts.find({"post_id": {"$in": post_ids}}, {"likes": 1}).to_list(1000)
            total = sum(len(p.get("likes", [])) for p in posts)
            likes_result = [{"total_likes": total}]
        if likes_result:
            total_likes_received = likes_result[0].get("total_likes", 0)
        
        try:
            comments_result = await db.posts.aggregate([
                {"$match": {"post_id": {"$in": post_ids}}},
                {"$group": {"_id": None, "total_comments": {"$sum": {"$size": {"$ifNull": ["$comments", []]}}}}}
            ]).to_list(1)
        except Exception:
            posts = await db.posts.find({"post_id": {"$in": post_ids}}, {"comments": 1}).to_list(1000)
            total = sum(len(p.get("comments", [])) for p in posts)
            comments_result = [{"total_comments": total}]
        if comments_result:
            total_comments_received = comments_result[0].get("total_comments", 0)
    
    # Get profile views (from profile_views collection if exists, otherwise 0)
    total_profile_views = await db.profile_views.count_documents({
        "viewed_user_id": user_id,
        "viewed_at": {"$gte": start_date}
    }) if "profile_views" in await db.list_collection_names() else 0
    
    # Get friends count (user-type friends only)
    total_friends = len([
        f for f in (current_user.friends or [])
        if isinstance(f, dict) and f.get("entity_type") == "user"
    ])
    
    # Get messages stats
    total_messages_sent = await db.messages.count_documents({
        "from_user_id": user_id,
        "created_at": {"$gte": start_date}
    })
    
    total_messages_received = await db.messages.count_documents({
        "to_user_id": user_id,
        "created_at": {"$gte": start_date}
    })
    
    # Calculate engagement rate (likes + comments) / posts
    engagement_rate = 0.0
    if total_posts > 0:
        engagement_rate = round((total_likes_received + total_comments_received) / total_posts, 2)
    
    # Growth data - posts per day for the last N days
    growth_data = {}
    for i in range(min(days, 30)):
        day = now_utc() - timedelta(days=i)
        day_str = day.strftime("%Y-%m-%d")
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        
        count = await db.posts.count_documents({
            "author_id": user_id,
            "created_at": {"$gte": day_start, "$lt": day_end}
        })
        growth_data[day_str] = count
    
    return UserAnalytics(
        total_posts=total_posts,
        total_likes_received=total_likes_received,
        total_comments_received=total_comments_received,
        total_profile_views=total_profile_views,
        total_friends=total_friends,
        total_messages_sent=total_messages_sent,
        total_messages_received=total_messages_received,
        engagement_rate=engagement_rate,
        growth_data=growth_data
    )


@router.get("/artist/{artist_id}")
async def get_artist_analytics(
    artist_id: str,
    days: int = 30,
    current_user: UserPublic = Depends(get_current_user)
) -> ArtistAnalytics:
    """Get analytics for an artist profile (owner only)."""
    
    # Verify ownership
    artist = await db.artists.find_one({"artist_id": artist_id}, {"_id": 0})
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    
    if artist.get("owner_id") != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to view these analytics")
    
    start_date = now_utc() - timedelta(days=days)
    
    # Get follower count
    total_followers = len(artist.get("followers", []))
    
    # Get profile views
    total_profile_views = await db.profile_views.count_documents({
        "viewed_artist_id": artist_id,
        "viewed_at": {"$gte": start_date}
    }) if "profile_views" in await db.list_collection_names() else 0
    
    # Get events
    events = await db.events.find({
        "artist_id": artist_id,
        "is_hidden": {"$ne": True}
    }, {"_id": 0}).to_list(1000)
    
    total_events = len(events)
    total_event_attendees = sum(len(e.get("attendees", [])) for e in events)
    
    # Top events by attendees
    top_events = sorted(events, key=lambda x: len(x.get("attendees", [])), reverse=True)[:5]
    top_events = [{
        "event_id": e.get("event_id"),
        "title": e.get("title"),
        "attendees": len(e.get("attendees", [])),
        "date": e.get("start_date")
    } for e in top_events]
    
    # Calculate engagement rate
    engagement_rate = 0.0
    if total_events > 0:
        engagement_rate = round(total_event_attendees / total_events, 2)
    
    # Growth data - followers over time (simplified)
    growth_data = {"followers": total_followers}
    
    return ArtistAnalytics(
        total_followers=total_followers,
        total_profile_views=total_profile_views,
        total_events=total_events,
        total_event_attendees=total_event_attendees,
        engagement_rate=engagement_rate,
        growth_data=growth_data,
        top_events=top_events
    )


@router.get("/business/{business_id}")
async def get_business_analytics(
    business_id: str,
    days: int = 30,
    current_user: UserPublic = Depends(get_current_user)
) -> BusinessAnalytics:
    """Get analytics for a business profile (owner only)."""
    
    # Verify ownership
    business = await db.businesses.find_one({"business_id": business_id}, {"_id": 0})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    if business.get("owner_id") != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to view these analytics")
    
    start_date = now_utc() - timedelta(days=days)
    
    # Get follower count
    total_followers = len(business.get("followers", []))
    
    # Get profile views
    total_profile_views = await db.profile_views.count_documents({
        "viewed_business_id": business_id,
        "viewed_at": {"$gte": start_date}
    }) if "profile_views" in await db.list_collection_names() else 0
    
    # Get events
    events = await db.events.find({
        "business_id": business_id,
        "is_hidden": {"$ne": True}
    }, {"_id": 0}).to_list(1000)
    
    total_events = len(events)
    total_event_attendees = sum(len(e.get("attendees", [])) for e in events)
    
    # Get activities
    total_activities = await db.activities.count_documents({
        "business_id": business_id,
        "is_hidden": {"$ne": True}
    })
    
    # Top events by attendees
    top_events = sorted(events, key=lambda x: len(x.get("attendees", [])), reverse=True)[:5]
    top_events = [{
        "event_id": e.get("event_id"),
        "title": e.get("title"),
        "attendees": len(e.get("attendees", [])),
        "date": e.get("start_date")
    } for e in top_events]
    
    # Calculate engagement rate
    engagement_rate = 0.0
    if total_events > 0:
        engagement_rate = round(total_event_attendees / total_events, 2)
    
    # Growth data
    growth_data = {"followers": total_followers}
    
    return BusinessAnalytics(
        total_followers=total_followers,
        total_profile_views=total_profile_views,
        total_events=total_events,
        total_event_attendees=total_event_attendees,
        total_activities=total_activities,
        engagement_rate=engagement_rate,
        growth_data=growth_data,
        top_events=top_events
    )


@router.post("/track-view")
async def track_profile_view(
    viewed_user_id: Optional[str] = None,
    viewed_artist_id: Optional[str] = None,
    viewed_business_id: Optional[str] = None,
    current_user: UserPublic = Depends(get_current_user)
):
    """Track a profile view for analytics."""
    
    if not any([viewed_user_id, viewed_artist_id, viewed_business_id]):
        raise HTTPException(status_code=400, detail="Must specify a profile to track")
    
    # Don't track self-views
    if viewed_user_id == current_user.user_id:
        return {"tracked": False, "reason": "self_view"}
    
    view_doc = {
        "view_id": f"view_{now_utc().timestamp()}_{current_user.user_id[:8]}",
        "viewer_id": current_user.user_id,
        "viewed_at": now_utc()
    }
    
    if viewed_user_id:
        view_doc["viewed_user_id"] = viewed_user_id
    if viewed_artist_id:
        view_doc["viewed_artist_id"] = viewed_artist_id
    if viewed_business_id:
        view_doc["viewed_business_id"] = viewed_business_id
    
    await db.profile_views.insert_one(view_doc)
    
    return {"tracked": True}
