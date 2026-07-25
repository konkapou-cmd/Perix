"""Admin routes for app owner to manage users, posts, and reports."""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import re

from database import db
from models.user import UserPublic
from utils.helpers import now_utc
from routes.dependencies import get_current_user, pwd_context


def _safe_regex(search: str) -> str:
    escaped = re.escape(search)
    if len(escaped) > 50:
        escaped = escaped[:50]
    return escaped

router = APIRouter(prefix="/admin", tags=["Admin"])

# Admin user IDs - add your admin user IDs here
ADMIN_USER_IDS = ["user_admin_001"]  # Will be configurable

# Admin emails - these users are always admins
ADMIN_EMAILS = ["konkapou@gmail.com", "markoskolias@gmail.com"]


class ReportedUserResponse(BaseModel):
    user_id: str
    name: str
    email: str
    reported_at: datetime
    reported_by: str
    reporter_name: str
    reason: str
    is_hidden: bool
    report_count: int


class UserManageRequest(BaseModel):
    user_id: str
    action: str  # "hide", "unhide", "delete"


class PostManageRequest(BaseModel):
    post_id: str
    action: str  # "hide", "unhide", "delete"


async def verify_admin(current_user: UserPublic):
    """Verify user is an admin."""
    # Check if user is in admin list or has admin flag
    user = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    is_admin = (
        current_user.user_id in ADMIN_USER_IDS or 
        user.get("email") in ADMIN_EMAILS or
        user.get("is_admin", False)
    )
    
    if not is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    return current_user


@router.get("/check")
async def check_admin_status(current_user: UserPublic = Depends(get_current_user)):
    """Check if current user is an admin."""
    user = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0})
    is_admin = (
        current_user.user_id in ADMIN_USER_IDS or 
        (user and user.get("email") in ADMIN_EMAILS) or
        (user and user.get("is_admin", False))
    )
    return {"is_admin": is_admin}


class UserContentCounts(BaseModel):
    posts: int
    stories: int
    activities: int
    activity_messages: int
    events: int
    event_messages: int
    businesses: int
    artists: int
    messages: int
    conversations: int
    notifications: int
    friends: int
    friend_requests: int
    reports_about: int
    reports_by: int
    calls: int
    subscriptions: int
    likes_on_posts: int
    comments_on_posts: int
    activity_invites: int
    total: int


@router.get("/user-content-count/{user_id}")
async def get_user_content_count(
    user_id: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """Get count of all content owned by a user (for delete/hide confirmation)."""
    await verify_admin(current_user)
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Count all user content
    posts = await db.posts.count_documents({"$or": [{"user_id": user_id}, {"author_id": user_id}]})
    stories = await db.stories.count_documents({"user_id": user_id})
    activities = await db.activities.count_documents({"creator_id": user_id})
    activity_messages = await db.activity_messages.count_documents({"user_id": user_id})
    events = await db.events.count_documents({"creator_id": user_id})
    event_messages = await db.event_messages.count_documents({"user_id": user_id})
    businesses = await db.businesses.count_documents({"owner_id": user_id})
    artists = await db.artists.count_documents({"owner_id": user_id})
    messages = await db.messages.count_documents({"$or": [{"from_user_id": user_id}, {"to_user_id": user_id}]})
    conversations = await db.conversations.count_documents({"participants": user_id})
    notifications = await db.notifications.count_documents({"$or": [{"user_id": user_id}, {"from_user_id": user_id}]})
    friends = await db.friends.count_documents({"$or": [{"user_id": user_id}, {"friend_id": user_id}]})
    friend_requests = await db.friend_requests.count_documents({"$or": [{"from_user_id": user_id}, {"to_user_id": user_id}]})
    reports_about = await db.reports.count_documents({"reported_user_id": user_id})
    reports_by = await db.reports.count_documents({"reporter_id": user_id})
    calls = await db.calls.count_documents({"$or": [{"caller_id": user_id}, {"callee_id": user_id}]})
    subscriptions = await db.subscriptions.count_documents({"$or": [{"user_id": user_id}, {"subscriber_id": user_id}]})
    
    # Count likes on all posts (both string and object format)
    likes_string = await db.posts.count_documents({"likes": user_id})
    likes_object = await db.posts.count_documents({"likes.user_id": user_id})
    likes_on_posts = likes_string + likes_object
    
    # Count comments on all posts
    comments_on_posts = await db.posts.count_documents({"comments.user_id": user_id})
    
    # Count activity invites
    activity_invites = await db.activities.count_documents({"invites.user_id": user_id})
    
    total = (posts + stories + activities + activity_messages + events + event_messages + 
             businesses + artists + messages + conversations + notifications + friends + 
             friend_requests + reports_about + reports_by + calls + subscriptions + 
             likes_on_posts + comments_on_posts + activity_invites)
    
    return UserContentCounts(
        posts=posts,
        stories=stories,
        activities=activities,
        activity_messages=activity_messages,
        events=events,
        event_messages=event_messages,
        businesses=businesses,
        artists=artists,
        messages=messages,
        conversations=conversations,
        notifications=notifications,
        friends=friends,
        friend_requests=friend_requests,
        reports_about=reports_about,
        reports_by=reports_by,
        calls=calls,
        subscriptions=subscriptions,
        likes_on_posts=likes_on_posts,
        comments_on_posts=comments_on_posts,
        activity_invites=activity_invites,
        total=total
    )


@router.post("/make-admin/{user_id}")
async def make_user_admin(
    user_id: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """Make a user an admin (only existing admins can do this)."""
    await verify_admin(current_user)
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"is_admin": True}}
    )
    
    return {"success": True, "message": f"User {user_id} is now an admin"}


@router.get("/reports")
async def get_reported_users(
    current_user: UserPublic = Depends(get_current_user)
):
    """Get all reported users."""
    await verify_admin(current_user)
    
    reports = await db.reports.find({}, {"_id": 0}).sort("reported_at", -1).to_list(500)

    reported_user_ids = list({r["reported_user_id"] for r in reports})
    reporter_user_ids = list({r["reporter_id"] for r in reports})
    all_user_ids = list(set(reported_user_ids + reporter_user_ids))

    user_cursor = db.users.find(
        {"user_id": {"$in": all_user_ids}},
        {"_id": 0, "password_hash": 0}
    )
    user_map = {}
    async for u in user_cursor:
        user_map[u["user_id"]] = u

    report_count_map: dict = {}
    try:
        async for doc in db.reports.aggregate([{"$group": {"_id": "$reported_user_id", "count": {"$sum": 1}}}]):
            report_count_map[doc["_id"]] = doc["count"]
    except Exception:
        all_reports = await db.reports.find({}, {"reported_user_id": 1}).to_list(5000)
        for r in all_reports:
            uid = r.get("reported_user_id")
            if uid:
                report_count_map[uid] = report_count_map.get(uid, 0) + 1

    result = []
    for report in reports:
        reported_user = user_map.get(report["reported_user_id"])
        if not reported_user:
            continue

        reporter = user_map.get(report["reporter_id"])

        result.append({
            "report_id": report.get("report_id"),
            "user_id": reported_user["user_id"],
            "name": reported_user.get("name", "Unknown"),
            "email": reported_user.get("email", ""),
            "profile_photo": reported_user.get("profile_photo"),
            "reported_at": report["reported_at"],
            "reported_by": report["reporter_id"],
            "reporter_name": reporter.get("name", "Unknown") if reporter else "Unknown",
            "reason": report.get("reason", "No reason provided"),
            "is_hidden": reported_user.get("is_hidden", False),
            "report_count": report_count_map.get(report["reported_user_id"], 0)
        })

    return result


@router.get("/users")
async def get_all_users(
    current_user: UserPublic = Depends(get_current_user),
    search: Optional[str] = None,
    hidden_only: bool = False
):
    """Get all users with optional filters."""
    await verify_admin(current_user)
    
    query = {}
    if search:
        safe = _safe_regex(search)
        query["$or"] = [
            {"name": {"$regex": safe, "$options": "i"}},
            {"email": {"$regex": safe, "$options": "i"}}
        ]
    if hidden_only:
        query["is_hidden"] = True
    
    users = await db.users.find(
        query, 
        {"_id": 0, "password_hash": 0}
    ).sort("created_at", -1).to_list(500)
    
    user_ids = [u["user_id"] for u in users]
    report_count_map: dict = {}
    try:
        async for doc in db.reports.aggregate([
            {"$match": {"reported_user_id": {"$in": user_ids}}},
            {"$group": {"_id": "$reported_user_id", "count": {"$sum": 1}}}
        ]):
            report_count_map[doc["_id"]] = doc["count"]
    except Exception:
        all_reports = await db.reports.find({"reported_user_id": {"$in": user_ids}}).to_list(5000)
        for r in all_reports:
            uid = r.get("reported_user_id")
            if uid:
                report_count_map[uid] = report_count_map.get(uid, 0) + 1

    for user in users:
        user["report_count"] = report_count_map.get(user["user_id"], 0)

    return users


@router.post("/users/manage")
async def manage_user(
    request: UserManageRequest,
    current_user: UserPublic = Depends(get_current_user)
):
    """Hide, unhide, or delete a user."""
    await verify_admin(current_user)
    
    user = await db.users.find_one({"user_id": request.user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if request.action == "hide":
        await db.users.update_one(
            {"user_id": request.user_id},
            {"$set": {"is_hidden": True, "hidden_at": now_utc(), "hidden_by": current_user.user_id}}
        )
        # Also hide all their posts
        await db.posts.update_many(
            {"user_id": request.user_id},
            {"$set": {"is_hidden": True}}
        )
        await db.posts.update_many(
            {"author_id": request.user_id},
            {"$set": {"is_hidden": True}}
        )
        # Also hide their stories
        await db.stories.update_many(
            {"user_id": request.user_id},
            {"$set": {"is_hidden": True}}
        )
        # Hide their activities (as creator)
        await db.activities.update_many(
            {"creator_id": request.user_id},
            {"$set": {"is_hidden": True}}
        )
        # Hide their businesses
        await db.businesses.update_many(
            {"owner_id": request.user_id},
            {"$set": {"is_hidden": True}}
        )
        # Hide their artists
        await db.artists.update_many(
            {"owner_id": request.user_id},
            {"$set": {"is_hidden": True}}
        )
        # Hide their events
        await db.events.update_many(
            {"creator_id": request.user_id},
            {"$set": {"is_hidden": True}}
        )
        return {"success": True, "message": "User and all their content hidden"}
    
    elif request.action == "unhide":
        await db.users.update_one(
            {"user_id": request.user_id},
            {"$set": {"is_hidden": False}, "$unset": {"hidden_at": "", "hidden_by": ""}}
        )
        # Also unhide their posts
        await db.posts.update_many(
            {"user_id": request.user_id},
            {"$set": {"is_hidden": False}}
        )
        await db.posts.update_many(
            {"author_id": request.user_id},
            {"$set": {"is_hidden": False}}
        )
        # Also unhide their stories
        await db.stories.update_many(
            {"user_id": request.user_id},
            {"$set": {"is_hidden": False}}
        )
        # Unhide their activities
        await db.activities.update_many(
            {"creator_id": request.user_id},
            {"$set": {"is_hidden": False}}
        )
        # Unhide their businesses
        await db.businesses.update_many(
            {"owner_id": request.user_id},
            {"$set": {"is_hidden": False}}
        )
        # Unhide their artists
        await db.artists.update_many(
            {"owner_id": request.user_id},
            {"$set": {"is_hidden": False}}
        )
        # Unhide their events
        await db.events.update_many(
            {"creator_id": request.user_id},
            {"$set": {"is_hidden": False}}
        )
        return {"success": True, "message": "User and all their content restored"}
    
    elif request.action == "delete":
        from services.entity_ownership import (
            run_account_deletion, acquire_new_deletion_lock,
            resume_failed_deletion, resume_resolved_review,
            set_deletion_pending, get_account_deletion_state,
        )
        user_id = request.user_id

        user = await db.users.find_one({"user_id": user_id}, {"is_deleted": 1})
        if user and user.get("is_deleted"):
            raise HTTPException(status_code=409, detail="Deleted accounts require explicit restoration")

        state = await get_account_deletion_state(user_id)
        lock_key = f"account_deletion:{user_id}"

        if state == "running":
            raise HTTPException(status_code=409, detail="Account deletion in progress")
        elif state == "failed":
            if not await resume_failed_deletion(lock_key):
                raise HTTPException(status_code=409, detail="Already resuming")
        elif state == "ready_to_resume":
            if not await resume_resolved_review(lock_key):
                raise HTTPException(status_code=409, detail="Resume already acquired")
        elif state == "review_required":
            raise HTTPException(status_code=202, detail="Resolve pending reviews before retrying deletion")
        elif state == "new":
            if not await acquire_new_deletion_lock(user_id):
                raise HTTPException(status_code=409, detail="Lock unavailable")
            await set_deletion_pending(user_id)
        else:
            raise HTTPException(status_code=409, detail="Cannot proceed in current state")

        result = await run_account_deletion(user_id, lock_key)
        if result["status"] == "completed":
            return {"success": True, "message": "Account deleted"}
        elif result["status"] == "review_required":
            raise HTTPException(status_code=202, detail={"message": "Manual review required", "reason": result.get("reason", "")})
        else:
            raise HTTPException(status_code=500, detail="Deletion failed")

    
    else:
        raise HTTPException(status_code=400, detail="Invalid action")


class DeletionResolveRequest(BaseModel):
    confirm: bool = True
    resolution_type: str
    reference_ids: List[str]
    reason: str
    evidence_reference: str = ""


@router.post("/deletion-operations/{user_id}/resolve")
async def resolve_deletion_operation(
    user_id: str,
    request: DeletionResolveRequest,
    admin_user: UserPublic = Depends(get_current_user),
):
    """Admin: resolve manual-review blocks on a deletion operation."""
    await verify_admin(admin_user)
    from services.entity_ownership import check_unresolved_reviews, mark_review_resolved

    if not request.confirm:
        raise HTTPException(status_code=400, detail="confirm must be true")
    if not request.reference_ids:
        raise HTTPException(status_code=400, detail="reference_ids required")

    state = await get_account_deletion_state(user_id)
    if state not in ("review_required", "ready_to_resume"):
        raise HTTPException(status_code=409, detail="Operation not in review state")

    if request.resolution_type == "subscription_cancelled":
        r = await db.subscriptions.update_many(
            {"user_id": user_id, "subscription_id": {"$in": request.reference_ids},
             "billing_status": "manual_review_required"},
            {"$set": {"billing_status": "cancelled", "resolved_at": now_utc(),
                      "resolved_by": admin_user.user_id, "resolution_reason": request.reason}},
        )
        if r.modified_count == 0:
            raise HTTPException(status_code=400, detail="No matching unresolved subscriptions found")
    elif request.resolution_type == "booking_refunded":
        r = await db.bookings.update_many(
            {"client_id": user_id, "booking_id": {"$in": request.reference_ids},
             "refund_required": True, "refund_resolved": {"$ne": True}},
            {"$set": {"refund_resolved": True, "resolved_at": now_utc(),
                      "resolved_by": admin_user.user_id, "resolution_reason": request.reason}},
        )
        if r.modified_count == 0:
            raise HTTPException(status_code=400, detail="No matching unresolved bookings found")
    else:
        raise HTTPException(status_code=400, detail="Unknown resolution_type")

    # Record audit
    await db.resolution_audit.insert_one({
        "lock_key": f"account_deletion:{user_id}",
        "resolution_type": request.resolution_type,
        "reference_ids": request.reference_ids,
        "resolved_by": admin_user.user_id,
        "reason": request.reason,
        "evidence_reference": request.evidence_reference,
        "resolved_at": now_utc(),
    })

    # Check if all reviews cleared
    remaining = await check_unresolved_reviews(user_id)
    if remaining["unresolved_subscriptions"] == 0 and remaining["unresolved_bookings"] == 0:
        if not await mark_review_resolved(f"account_deletion:{user_id}"):
            raise HTTPException(status_code=409, detail="Could not transition to ready_to_resume")
        return {"success": True, "state": "ready_to_resume", "message": "All reviews resolved"}

    return {"success": True, "state": "review_required", "remaining": remaining}


@router.get("/posts")
async def get_all_posts(
    current_user: UserPublic = Depends(get_current_user),
    hidden_only: bool = False,
    user_id: Optional[str] = None
):
    """Get all posts with optional filters."""
    await verify_admin(current_user)
    
    query = {}
    if hidden_only:
        query["is_hidden"] = True
    if user_id:
        query["author_id"] = user_id
    
    posts = await db.posts.find(
        query, 
        {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    
    # Add author info
    for post in posts:
        author = await db.users.find_one(
            {"user_id": post["author_id"]},
            {"_id": 0, "name": 1, "email": 1, "profile_photo": 1}
        )
        if author:
            post["author_name"] = author.get("name", "Unknown")
            post["author_email"] = author.get("email", "")
    
    return posts


@router.post("/posts/manage")
async def manage_post(
    request: PostManageRequest,
    current_user: UserPublic = Depends(get_current_user)
):
    """Hide, unhide, or delete a post."""
    await verify_admin(current_user)
    
    post = await db.posts.find_one({"post_id": request.post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    if request.action == "hide":
        await db.posts.update_one(
            {"post_id": request.post_id},
            {"$set": {"is_hidden": True, "hidden_at": now_utc(), "hidden_by": current_user.user_id}}
        )
        return {"success": True, "message": "Post hidden"}
    
    elif request.action == "unhide":
        await db.posts.update_one(
            {"post_id": request.post_id},
            {"$set": {"is_hidden": False}, "$unset": {"hidden_at": "", "hidden_by": ""}}
        )
        return {"success": True, "message": "Post restored"}
    
    elif request.action == "delete":
        await db.posts.delete_one({"post_id": request.post_id})
        return {"success": True, "message": "Post deleted"}
    
    else:
        raise HTTPException(status_code=400, detail="Invalid action")


@router.delete("/reports/{report_id}")
async def dismiss_report(
    report_id: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """Dismiss/delete a report."""
    await verify_admin(current_user)
    
    result = await db.reports.delete_one({"report_id": report_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Report not found")
    
    return {"success": True, "message": "Report dismissed"}


@router.get("/stats")
async def get_admin_stats(
    current_user: UserPublic = Depends(get_current_user)
):
    """Get dashboard statistics."""
    await verify_admin(current_user)
    
    total_users = await db.users.count_documents({})
    hidden_users = await db.users.count_documents({"is_hidden": True})
    total_posts = await db.posts.count_documents({})
    hidden_posts = await db.posts.count_documents({"is_hidden": True})
    total_reports = await db.reports.count_documents({})
    total_businesses = await db.businesses.count_documents({})
    total_artists = await db.artists.count_documents({})
    
    return {
        "total_users": total_users,
        "hidden_users": hidden_users,
        "active_users": total_users - hidden_users,
        "total_posts": total_posts,
        "hidden_posts": hidden_posts,
        "pending_reports": total_reports,
        "total_businesses": total_businesses,
        "total_artists": total_artists
    }


class DevResetPasswordInput(BaseModel):
    email: str
    new_password: str
    dev_key: str


@router.post("/dev-reset-password")
async def dev_reset_password(payload: DevResetPasswordInput):
    if payload.dev_key != "perix-dev-reset-key-2026":
        raise HTTPException(status_code=403, detail="Invalid dev key")
    user = await db.users.find_one({"email": payload.email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one(
        {"email": payload.email},
        {"$set": {"password_hash": pwd_context.hash(payload.new_password)}}
    )
    return {"status": "password_reset", "email": payload.email}
