"""Admin routes for app owner to manage users, posts, and reports."""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Literal
from pydantic import BaseModel, Field
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


class UserRestoreRequest(BaseModel):
    user_id: str


class UserBlockRequest(BaseModel):
    user_id: str
    blocked: bool


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
    confirm: Literal[True]
    resolution_type: Literal["subscription_cancelled", "booking_refunded"]
    reference_ids: List[str] = Field(..., min_length=1)
    reason: str = Field(..., min_length=10, max_length=1000)
    evidence_reference: str = Field(..., min_length=1, max_length=1000)
    idempotency_key: str = Field(..., min_length=8, max_length=100)


@router.post("/deletion-operations/{user_id}/resolve")
async def resolve_deletion_operation(
    user_id: str,
    request: DeletionResolveRequest,
    admin_user: UserPublic = Depends(get_current_user),
):
    """Admin: resolve manual-review blocks on a deletion operation."""
    await verify_admin(admin_user)
    from services.deletion_resolution import (
        run_resolution_operation,
        ResolutionValidationError,
        ResolutionIdempotencyConflict,
        ResolutionOperationInProgress,
        ResolutionExecutionError,
    )

    try:
        result = await run_resolution_operation(
            user_id=user_id,
            idempotency_key=request.idempotency_key,
            admin_user_id=admin_user.user_id,
            resolution_type=request.resolution_type,
            reference_ids=request.reference_ids,
            reason=request.reason,
            evidence_reference=request.evidence_reference,
        )
        return result
    except ResolutionValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ResolutionIdempotencyConflict as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ResolutionOperationInProgress as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ResolutionExecutionError as e:
        raise HTTPException(status_code=500, detail="Resolution failed; retry supported")


@router.post("/repair-orphans")
async def repair_orphans_endpoint(
    dry_run: bool = True,
    current_user: UserPublic = Depends(get_current_user),
):
    from services.entity_ownership import repair_orphaned_entities
    result = await repair_orphaned_entities(dry_run=dry_run)
    return {"dry_run": dry_run, "checked": result.total_checked,
            "hidden": result.hidden, "by_collection": result.by_collection}


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


@router.get("/reports/content")
async def get_content_reports(
    current_user: UserPublic = Depends(get_current_user)
):
    """All content reports (posts, comments, events, jobs, services,
    listings, stories, businesses, artists, users) with a content preview
    and the current hidden state, so a human can review each one."""
    await verify_admin(current_user)

    from routes.reports import TARGET_COLLECTIONS

    reports = await db.reports.find(
        {"target_type": {"$in": list(TARGET_COLLECTIONS.keys())}},
        {"_id": 0},
    ).sort("reported_at", -1).to_list(500)

    result = []
    for r in reports:
        preview = None
        is_hidden = None
        collection, id_field = TARGET_COLLECTIONS.get(r.get("target_type"), (None, None))
        if collection:
            doc = await db[collection].find_one({id_field: r["target_id"]}, {"_id": 0})
            if doc:
                preview = (doc.get("text") or doc.get("title") or doc.get("name") or "")[:140]
                is_hidden = doc.get("is_hidden", False)
        entry = {
            **r,
            "preview": preview,
            "is_hidden": is_hidden,
        }
        if r.get("target_type") == "user":
            target_user = await db.users.find_one(
                {"user_id": r["target_id"]},
                {"_id": 0, "email": 1, "is_deleted": 1, "is_blocked": 1,
                 "is_hidden": 1, "pre_deletion_email": 1, "name": 1},
            )
            if target_user:
                entry["reported_email"] = (
                    target_user.get("pre_deletion_email")
                    or (target_user.get("email") if not target_user.get("is_deleted") else None)
                )
                entry["reported_is_deleted"] = bool(target_user.get("is_deleted"))
                entry["reported_is_blocked"] = bool(target_user.get("is_blocked"))
                entry["reported_name"] = target_user.get("name")
                is_hidden = target_user.get("is_hidden", False)
                entry["is_hidden"] = is_hidden
        result.append(entry)
    return result


class ReportResolveRequest(BaseModel):
    report_id: str
    action: str  # "dismiss" | "restore" | "hide" | "delete" | "purge"


@router.post("/reports/resolve")
async def resolve_report(
    request: ReportResolveRequest,
    current_user: UserPublic = Depends(get_current_user)
):
    """Resolve a report. Actions:
    - dismiss: close the report without touching content.
    - hide / delete: hide the reported content (reversible — the reviewer
      can restore it at any time).
    - restore: make hidden content visible again, and for deleted accounts
      bring the account back (email re-enabled, password reset required).
    - purge: permanently remove the reported content (non-reversible).
    The decision is made by the reviewer at their own discretion, in good
    faith, consistent with how the service is provided generally."""
    await verify_admin(current_user)

    from routes.reports import TARGET_COLLECTIONS
    from services.entity_ownership import (
        run_account_deletion, acquire_new_deletion_lock,
        resume_failed_deletion, resume_resolved_review,
        set_deletion_pending, get_account_deletion_state,
        restore_deleted_user,
    )

    action = request.action
    if action == "delete":
        action = "hide"  # legacy alias: reversible

    report = await db.reports.find_one({"report_id": request.report_id})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    target_type = report.get("target_type")
    target_id = report.get("target_id")
    collection, id_field = TARGET_COLLECTIONS.get(target_type, (None, None))

    if action == "purge":
        if not collection:
            raise HTTPException(status_code=400, detail="Cannot purge this target type")
        if target_type == "user":
            user = await db.users.find_one({"user_id": target_id}, {"is_deleted": 1})
            if user and user.get("is_deleted"):
                raise HTTPException(status_code=409, detail="Account already deleted")
            state = await get_account_deletion_state(target_id)
            lock_key = f"account_deletion:{target_id}"
            if state == "running":
                raise HTTPException(status_code=409, detail="Account deletion in progress")
            elif state == "failed":
                if not await resume_failed_deletion(lock_key):
                    raise HTTPException(status_code=409, detail="Already resuming")
            elif state == "ready_to_resume":
                if not await resume_resolved_review(lock_key):
                    raise HTTPException(status_code=409, detail="Resume already acquired")
            elif state == "review_required":
                raise HTTPException(status_code=202, detail="Resolve pending reviews before deletion")
            elif state == "new":
                if not await acquire_new_deletion_lock(target_id):
                    raise HTTPException(status_code=409, detail="Lock unavailable")
                await set_deletion_pending(target_id)
            result = await run_account_deletion(target_id, lock_key)
            if result["status"] == "review_required":
                raise HTTPException(status_code=202, detail={"message": "Manual review required", "reason": result.get("reason", "")})
            if result["status"] != "completed":
                raise HTTPException(status_code=500, detail="Deletion failed")
            action = "account_deleted"
        else:
            await db[collection].delete_one({id_field: target_id})
            action = "purged"
    elif action == "hide":
        if not collection:
            raise HTTPException(status_code=400, detail="Cannot hide this target type")
        await db[collection].update_one(
            {id_field: target_id},
            {"$set": {"is_hidden": True, "hidden_reason": "admin_report_resolved",
                      "hidden_at": now_utc(), "hidden_by": current_user.user_id}},
        )
    elif action == "restore":
        if not collection:
            raise HTTPException(status_code=400, detail="Cannot restore this target type")
        if target_type == "user":
            target_user = await db.users.find_one({"user_id": target_id}, {"is_deleted": 1})
            if target_user and target_user.get("is_deleted"):
                try:
                    summary = await restore_deleted_user(target_id)
                except ValueError as e:
                    raise HTTPException(status_code=400, detail=f"Cannot restore account: {e}")
                await db.users.update_one(
                    {"user_id": target_id},
                    {"$set": {"is_hidden": False, "is_blocked": False},
                     "$unset": {"hidden_at": "", "hidden_by": "", "blocked_at": "", "blocked_by": ""}},
                )
                action = "account_restored"
            else:
                await db.users.update_one(
                    {"user_id": target_id},
                    {"$set": {"is_hidden": False},
                     "$unset": {"hidden_at": "", "hidden_by": ""}},
                )
                action = "restored"
        else:
            await db[collection].update_one(
                {id_field: target_id},
                {"$set": {"is_hidden": False},
                 "$unset": {"hidden_reason": "", "hidden_at": "", "hidden_by": ""}},
            )
            action = "restored"
    # dismiss: nothing to change on content

    await db.reports.update_one(
        {"report_id": request.report_id},
        {"$set": {
            "status": "resolved",
            "resolution": action,
            "resolved_at": now_utc(),
            "resolved_by": current_user.user_id,
        }},
    )
    return {"success": True, "action": action}


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


@router.get("/users/deleted")
async def get_deleted_users(
    current_user: UserPublic = Depends(get_current_user)
):
    """List tombstoned (deleted) accounts with their archived original email,
    so an admin can restore them if needed."""
    await verify_admin(current_user)

    users = await db.users.find(
        {"is_deleted": True},
        {"_id": 0, "password_hash": 0},
    ).sort("deleted_at", -1).to_list(500)

    return [
        {
            "user_id": u.get("user_id"),
            "email": u.get("email"),
            "pre_deletion_email": u.get("pre_deletion_email"),
            "pre_deletion_name": u.get("pre_deletion_name"),
            "deleted_at": u.get("deleted_at"),
            "is_blocked": bool(u.get("is_blocked")),
        }
        for u in users
    ]


@router.post("/users/restore")
async def restore_user(
    request: UserRestoreRequest,
    current_user: UserPublic = Depends(get_current_user)
):
    """Restore a deleted account. The archived email is re-activated and the
    user sets a new password via the forgot-password flow."""
    await verify_admin(current_user)

    from services.entity_ownership import restore_deleted_user
    try:
        summary = await restore_deleted_user(request.user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Cannot restore account: {e}")
    await db.users.update_one(
        {"user_id": request.user_id},
        {"$set": {"is_hidden": False, "is_blocked": False},
         "$unset": {"hidden_at": "", "hidden_by": "", "blocked_at": "", "blocked_by": ""}},
    )
    return {"success": True, **summary}


@router.post("/users/block")
async def block_user(
    request: UserBlockRequest,
    current_user: UserPublic = Depends(get_current_user)
):
    """Block (or unblock) a user's email from authenticating. Reports remain
    stored; this only toggles account access."""
    await verify_admin(current_user)

    user = await db.users.find_one({"user_id": request.user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if request.blocked:
        await db.users.update_one(
            {"user_id": request.user_id},
            {"$set": {"is_blocked": True, "blocked_at": now_utc(),
                      "blocked_by": current_user.user_id}},
        )
        return {"success": True, "blocked": True}
    await db.users.update_one(
        {"user_id": request.user_id},
        {"$set": {"is_blocked": False},
         "$unset": {"blocked_at": "", "blocked_by": ""}},
    )
    return {"success": True, "blocked": False}


@router.post("/dev-set-block")
async def dev_set_block(payload: dict):
    """Dev helper: block/unblock a user's email for auth testing."""
    if payload.get("dev_key") != "perix-dev-reset-key-2026":
        raise HTTPException(status_code=403, detail="Invalid dev key")
    email = (payload.get("email") or "").strip().lower()
    blocked = bool(payload.get("blocked", False))
    if not email:
        return {"status": "error", "detail": "email required"}
    user = await db.users.find_one({"email": email}, {"user_id": 1})
    if not user:
        return {"status": "not_found"}
    if blocked:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"is_blocked": True, "blocked_at": now_utc(),
                      "blocked_by": "dev"}},
        )
    else:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"is_blocked": False},
             "$unset": {"blocked_at": "", "blocked_by": ""}},
        )
    return {"status": "ok", "blocked": blocked, "user_id": user["user_id"]}


@router.post("/dev-list-reports")
async def dev_list_reports(payload: dict):
    """Dev helper: dump user-target reports with target existence + emails."""
    if payload.get("dev_key") != "perix-dev-reset-key-2026":
        raise HTTPException(status_code=403, detail="Invalid dev key")
    reports = await db.reports.find(
        {"target_type": "user"},
        {"_id": 0},
    ).sort("reported_at", -1).to_list(500)
    result = []
    for r in reports:
        uid = r.get("target_id")
        user = await db.users.find_one(
            {"user_id": uid},
            {"_id": 0, "email": 1, "name": 1, "is_deleted": 1,
             "pre_deletion_email": 1, "is_blocked": 1},
        )
        r["target_exists"] = user is not None
        r["target_user"] = user
        result.append(r)
    return result


@router.post("/dev-list-deleted")
async def dev_list_deleted(payload: dict):
    """Dev helper: list tombstoned accounts."""
    if payload.get("dev_key") != "perix-dev-reset-key-2026":
        raise HTTPException(status_code=403, detail="Invalid dev key")
    users = await db.users.find(
        {"is_deleted": True},
        {"_id": 0, "password_hash": 0},
    ).sort("deleted_at", -1).to_list(500)

    result = []
    for u in users:
        uid = u.get("user_id")
        entry = {
            "user_id": uid,
            "email": u.get("email"),
            "pre_deletion_email": u.get("pre_deletion_email"),
            "pre_deletion_name": u.get("pre_deletion_name"),
            "deleted_at": u.get("deleted_at"),
            "is_blocked": bool(u.get("is_blocked")),
        }
        reports = await db.reports.find(
            {"target_type": "user", "target_id": uid},
            {"_id": 0, "report_id": 1, "reason": 1, "reported_at": 1,
             "reporter_id": 1, "status": 1, "resolution": 1},
        ).to_list(50)
        if reports:
            entry["reports"] = reports
        biz_emails = [b.get("contact_email") async for b in db.businesses.find(
            {"owner_id": uid}, {"contact_email": 1}) if b.get("contact_email")]
        if biz_emails:
            entry["business_emails"] = biz_emails
        result.append(entry)
    return result


@router.post("/dev-restore-account")
async def dev_restore_account(payload: dict):
    """Dev helper: restore a deleted account by its original email or user_id.
    For accounts deleted before archiving existed, pass the original email
    explicitly along with the user_id."""
    if payload.get("dev_key") != "perix-dev-reset-key-2026":
        raise HTTPException(status_code=403, detail="Invalid dev key")
    email = (payload.get("email") or "").strip().lower()
    user_id = (payload.get("user_id") or "").strip()

    from services.entity_ownership import restore_deleted_user

    user = None
    if user_id:
        user = await db.users.find_one(
            {"user_id": user_id, "is_deleted": True},
            {"user_id": 1, "email": 1, "pre_deletion_email": 1},
        )
    if not user and email:
        user = await db.users.find_one(
            {"is_deleted": True, "pre_deletion_email": email},
            {"user_id": 1, "email": 1, "pre_deletion_email": 1},
        )
    if not user and email:
        user = await db.users.find_one(
            {"is_deleted": True, "email": email},
            {"user_id": 1, "email": 1, "pre_deletion_email": 1},
        )
    if not user:
        return {"status": "not_found", "detail": "No deleted account found"}

    if user.get("pre_deletion_email"):
        try:
            summary = await restore_deleted_user(user["user_id"])
        except ValueError as e:
            return {"status": "error", "detail": str(e)}
    else:
        if not email or "@" not in email:
            return {"status": "error", "detail": "This account predates email archiving — provide the original email to restore it"}
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {
                "email": email,
                "is_deleted": False,
                "deletion_pending": False,
                "name": "User",
                "display_name": "User",
            },
             "$unset": {"deleted_at": "", "deletion_started_at": ""}},
        )
        await db.deletion_operations.delete_one(
            {"lock_key": f"account_deletion:{user['user_id']}"})
        summary = {"user_id": user["user_id"], "email": email, "name": "User"}

    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"is_hidden": False, "is_blocked": False},
         "$unset": {"hidden_at": "", "hidden_by": "", "blocked_at": "", "blocked_by": ""}},
    )
    return {"status": "restored", **summary}


async def _purge_orphans() -> dict:
    """Permanently remove content whose owner account is deleted or missing
    (listings, services, jobs, events, activities, posts, stories)."""
    deleted_ids = [u["user_id"] async for u in db.users.find(
        {"is_deleted": True}, {"user_id": 1})]
    stats: dict = {}

    def count(d):
        for k, v in d.items():
            stats[k] = stats.get(k, 0) + v

    # Listings whose owner is gone or whose seller no longer exists
    orphan_owner_listings = await db.listings.find(
        {"owner_id": {"$in": deleted_ids}},
        {"listing_id": 1},
    ).to_list(5000)
    if orphan_owner_listings:
        ids = [l["listing_id"] for l in orphan_owner_listings]
        r = await db.listings.delete_many({"listing_id": {"$in": ids}})
        count({"listings_owner_deleted": r.deleted_count})

    orphan_listings = []
    cursor = db.listings.find({"is_active": True}, {"listing_id": 1, "owner_id": 1})
    async for l in cursor:
        owner = l.get("owner_id")
        if owner:
            u = await db.users.find_one({"user_id": owner, "is_deleted": {"$ne": True}}, {"_id": 1})
            if not u:
                orphan_listings.append(l["listing_id"])
    if orphan_listings:
        r = await db.listings.delete_many({"listing_id": {"$in": orphan_listings}})
        count({"listings_owner_missing": r.deleted_count})

    # Services/jobs of deactivated (or missing) businesses
    inactive_biz_ids = [b["business_id"] async for b in db.businesses.find(
        {"$or": [{"is_active": {"$ne": True}}, {"is_hidden": True}]},
        {"business_id": 1})]
    if inactive_biz_ids:
        r = await db.services.delete_many({"business_id": {"$in": inactive_biz_ids}})
        count({"services_inactive_business": r.deleted_count})
        r = await db.jobs.delete_many({"business_id": {"$in": inactive_biz_ids}})
        count({"jobs_inactive_business": r.deleted_count})
        r = await db.events.delete_many({"business_id": {"$in": inactive_biz_ids}})
        count({"events_inactive_business": r.deleted_count})

    # Events/activities/posts/stories whose creator account is deleted
    if deleted_ids:
        r = await db.events.delete_many({"creator_id": {"$in": deleted_ids}})
        count({"events_creator_deleted": r.deleted_count})
        r = await db.activities.delete_many({"creator_id": {"$in": deleted_ids}})
        count({"activities_creator_deleted": r.deleted_count})
        r = await db.posts.delete_many({"$or": [{"user_id": {"$in": deleted_ids}}, {"author_id": {"$in": deleted_ids}}]})
        count({"posts_author_deleted": r.deleted_count})
        r = await db.stories.delete_many({"user_id": {"$in": deleted_ids}})
        count({"stories_author_deleted": r.deleted_count})

    return stats


@router.post("/purge-orphans")
async def purge_orphans(
    current_user: UserPublic = Depends(get_current_user)
):
    """Admin: permanently remove orphaned content of deleted/missing owners."""
    await verify_admin(current_user)
    stats = await _purge_orphans()
    return {"status": "purged", "stats": stats}


@router.post("/dev-purge-orphans")
async def dev_purge_orphans(payload: dict):
    """Dev helper for the same orphan purge."""
    if payload.get("dev_key") != "perix-dev-reset-key-2026":
        raise HTTPException(status_code=403, detail="Invalid dev key")
    stats = await _purge_orphans()
    return {"status": "purged", "stats": stats}


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
