"""Entity ownership and account-deletion helpers.

Public content is soft-deactivated, never hard-deleted.
Ephemeral data (tokens, sessions, saved_items) is removed.
Operations are idempotent and support resumption.
"""
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Set
from dataclasses import dataclass, field
import logging

from database import db

logger = logging.getLogger(__name__)

DELETION_STEPS = [
    "personal_content",
    "subscriptions",
    "requester_bookings",
    "ephemeral_cleanup",
    "report_marking",
    "relationship_cleanup",
    "user_tombstone",
]


@dataclass
class DeactivationResult:
    user_id: str
    collections: Dict[str, int] = field(default_factory=dict)
    timestamp: str = ""

    def record(self, collection: str, count: int):
        self.collections[collection] = self.collections.get(collection, 0) + count


@dataclass
class RepairResult:
    total_checked: int = 0
    hidden: int = 0
    by_collection: Dict[str, int] = field(default_factory=dict)
    dry_run: bool = True


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_list(value: Any) -> list:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


# ─── Email Safety Guards ───


def can_receive_email(user: dict) -> bool:
    """Check if a user should receive transactional or marketing email.
    Deleted, pending-deletion, and tombstone users must not receive email.
    """
    email = user.get("email", "")
    return not (
        user.get("is_deleted")
        or user.get("deletion_pending")
        or email.endswith("@deleted.perix.app")
    )


# ─── Resumable Operation Support (atomic lock-based) ───


async def acquire_new_deletion_lock(user_id: str) -> str | None:
    """Atomically acquire a NEW deletion lock using setOnInsert."""
    lock_key = f"account_deletion:{user_id}"
    now = _now_utc()
    try:
        result = await db.deletion_operations.update_one(
            {"lock_key": lock_key},
            {"$setOnInsert": {
                "lock_key": lock_key, "user_id": user_id, "status": "running",
                "completed_steps": [], "current_step": None, "failed_step": None,
                "last_error": None, "started_at": now, "updated_at": now,
            }},
            upsert=True,
        )
    except Exception:
        return None
    if result is not None and result.upserted_id is not None:
        return lock_key
    return None


async def resume_failed_deletion(lock_key: str) -> bool:
    """Atomically resume a failed deletion. Only succeeds if status == 'failed'."""
    result = await db.deletion_operations.update_one(
        {"lock_key": lock_key, "status": "failed"},
        {"$set": {"status": "running", "updated_at": _now_utc(), "last_error": None}},
    )
    return result.modified_count == 1


async def resume_resolved_review(lock_key: str) -> bool:
    """Atomically transition ready_to_resume -> running."""
    result = await db.deletion_operations.update_one(
        {"lock_key": lock_key, "status": "ready_to_resume"},
        {"$set": {"status": "running", "updated_at": _now_utc()}},
    )
    return result.modified_count == 1


async def mark_review_resolved(lock_key: str) -> bool:
    """Atomically transition review_required -> ready_to_resume."""
    return (await db.deletion_operations.update_one(
        {"lock_key": lock_key, "status": "review_required"},
        {"$set": {"status": "ready_to_resume",
                  "review_resolved_at": _now_utc(),
                  "updated_at": _now_utc()}},
    )).modified_count == 1


async def start_resolution_operation(lock_key: str, idempotency_key: str,
                                     admin_user_id: str, resolution_type: str,
                                     reference_ids: list) -> str:
    """Create an idempotent, resumable resolution operation. Returns resolution_id."""
    import uuid
    resolution_id = f"delres_{uuid.uuid4().hex[:12]}"
    now = _now_utc()
    try:
        await db.resolution_operations.insert_one({
            "resolution_id": resolution_id,
            "idempotency_key": idempotency_key,
            "lock_key": lock_key,
            "status": "validated",
            "resolution_type": resolution_type,
            "reference_ids": reference_ids,
            "completed_steps": [],
            "resolved_by": admin_user_id,
            "created_at": now,
            "updated_at": now,
        })
    except Exception:
        existing = await db.resolution_operations.find_one(
            {"idempotency_key": idempotency_key}, {"resolution_id": 1})
        if existing:
            return existing["resolution_id"]
        raise
    return resolution_id


async def record_resolution_step(resolution_id: str, step: str):
    await db.resolution_operations.update_one(
        {"resolution_id": resolution_id},
        {"$addToSet": {"completed_steps": step},
         "$set": {"updated_at": _now_utc()}},
    )


async def complete_resolution_operation(resolution_id: str):
    await db.resolution_operations.update_one(
        {"resolution_id": resolution_id},
        {"$set": {"status": "completed", "updated_at": _now_utc()}},
    )


async def set_current_step(lock_key: str, step: str):
    await db.deletion_operations.update_one(
        {"lock_key": lock_key},
        {"$set": {"current_step": step, "updated_at": _now_utc()}},
    )


async def mark_step_completed(lock_key: str, step: str):
    """Record a completed step using addToSet (idempotent)."""
    await db.deletion_operations.update_one(
        {"lock_key": lock_key},
        {"$addToSet": {"completed_steps": step},
         "$set": {"updated_at": _now_utc()}},
    )


async def fail_deletion_operation(lock_key: str, step: str, error: str):
    await db.deletion_operations.update_one(
        {"lock_key": lock_key},
        {"$set": {"status": "failed", "failed_step": step,
                  "last_error": str(error)[:1000], "updated_at": _now_utc()}},
    )


async def complete_deletion_operation(lock_key: str):
    await db.deletion_operations.update_one(
        {"lock_key": lock_key},
        {"$set": {"status": "completed", "completed_at": _now_utc(), "updated_at": _now_utc()}},
    )


async def set_review_required(lock_key: str, reason: str):
    await db.deletion_operations.update_one(
        {"lock_key": lock_key},
        {"$set": {"status": "review_required", "review_reason": reason,
                  "updated_at": _now_utc()}},
    )


async def run_account_deletion(user_id: str, lock_key: str) -> dict:
    """Unified deletion orchestrator with resume/skip, review, and proper step lifecycle.
    Steps: set_current_step → execute → mark_step_completed (only on success).
    """
    op = await db.deletion_operations.find_one(
        {"lock_key": lock_key},
        {"completed_steps": 1, "status": 1},
    )
    completed = set(op["completed_steps"]) if op and op.get("completed_steps") else set()
    result = {"user_id": user_id, "lock_key": lock_key, "steps_run": []}
    current_step: str | None = None

    async def _step(name: str, fn):
        nonlocal current_step
        if name in completed:
            result["steps_run"].append(f"{name}:skipped")
            return
        current_step = name
        await set_current_step(lock_key, name)
        try:
            await fn()
            await mark_step_completed(lock_key, name)
            result["steps_run"].append(f"{name}:done")
        except Exception:
            raise  # re-raise to outer handler

    try:
        # Step 1: Personal content
        await _step("personal_content",
                    lambda: deactivate_user_content(user_id, reason="owner_account_deleted"))

        # Step 2: Subscriptions — check for manual review
        sub_result = {}
        async def sub_step():
            nonlocal sub_result
            sub_result = await cancel_user_subscriptions(user_id)
            if sub_result.get("manual_review_required", 0) > 0:
                raise DeletionNeedsReview("manual_review_required_subscriptions")
        await _step("subscriptions", sub_step)

        # Step 3: Requester bookings — check for manual review
        bk_result = {}
        async def bk_step():
            nonlocal bk_result
            bk_result = await cancel_user_bookings_as_requester(user_id)
            if bk_result.get("bookings_require_review"):
                raise DeletionNeedsReview("manual_review_required_bookings")
        await _step("requester_bookings", bk_step)

        # Step 4: Ephemeral data
        await _step("ephemeral_cleanup",
                    lambda: cleanup_ephemeral_user_data(user_id))

        # Step 5: Reports
        await _step("report_marking",
                    lambda: mark_user_reports(user_id))

        # Step 6: Relationships
        await _step("relationship_cleanup",
                    lambda: cleanup_relationships(user_id))

        # Step 7: Tombstone
        await _step("user_tombstone",
                    lambda: create_user_tombstone(user_id))

        await complete_deletion_operation(lock_key)
        result["status"] = "completed"
    except DeletionNeedsReview as e:
        await set_review_required(lock_key, str(e))
        result["status"] = "review_required"
        result["reason"] = str(e)
    except Exception as e:
        await fail_deletion_operation(lock_key, current_step or "initialisation", str(e))
        result["status"] = "failed"
        result["error"] = str(e)[:200]
    return result


class DeletionNeedsReview(Exception):
    pass


async def get_deletion_state(user_id: str) -> dict | None:
    """Return the current deletion operation state for a user, or None."""
    lock_key = f"account_deletion:{user_id}"
    doc = await db.deletion_operations.find_one(
        {"lock_key": lock_key},
        {"_id": 0, "last_error": 0},
    )
    if doc:
        doc.pop("last_error", None)
    return doc


# ─── Soft Deactivation ───


async def deactivate_user_content(
    user_id: str,
    *,
    reason: str = "owner_account_deleted",
) -> DeactivationResult:
    """Soft-deactivate all content owned by a user. Idempotent."""
    result = DeactivationResult(user_id=user_id, timestamp=_now_utc().isoformat())
    now = _now_utc()

    # --- Personal Listings (incl. legacy without seller_type) ---
    r = await db.listings.update_many(
        {"owner_id": user_id, "is_active": True,
         "$or": [{"seller_type": "user"}, {"seller_type": {"$exists": False}}]},
        {"$set": {"is_active": False, "status": "hidden",
                  "hidden_reason": reason, "owner_deleted_at": now, "updated_at": now}},
    )
    result.record("listings_personal", r.modified_count)

    # --- Posts (incl. legacy author_id and user actor fields) ---
    r = await db.posts.update_many(
        {"$or": [
            {"user_id": user_id},
            {"author_id": user_id},
            {"actor_type": "user", "actor_id": user_id},
        ], "is_hidden": {"$ne": True}},
        {"$set": {"is_hidden": True, "hidden_reason": reason, "owner_deleted_at": now}},
    )
    result.record("posts", r.modified_count)

    # --- Stories (includes City Ads) ---
    r = await db.stories.update_many(
        {"user_id": user_id, "is_hidden": {"$ne": True}},
        {
            "$set": {
                "is_hidden": True,
                "hidden_reason": reason,
                "owner_deleted_at": now,
            },
        },
    )
    result.record("stories", r.modified_count)

    # --- Activities ---
    r = await db.activities.update_many(
        {"creator_id": user_id, "is_hidden": {"$ne": True}},
        {
            "$set": {
                "is_hidden": True,
                "hidden_reason": reason,
                "owner_deleted_at": now,
                "updated_at": now,
            },
        },
    )
    result.record("activities", r.modified_count)

    # --- Events (both creator_id and legacy created_by) ---
    r = await db.events.update_many(
        {
            "$or": [{"creator_id": user_id}, {"created_by": user_id}],
            "is_hidden": {"$ne": True},
        },
        {
            "$set": {
                "is_hidden": True,
                "hidden_reason": reason,
                "owner_deleted_at": now,
            },
        },
    )
    result.record("events", r.modified_count)

    # --- Businesses (all owned, including inactive) ---
    businesses = await db.businesses.find({"owner_id": user_id}, {"business_id": 1, "_id": 0}).to_list(200)
    r = await db.businesses.update_many(
        {"owner_id": user_id, "is_hidden": {"$ne": True}},
        {
            "$set": {
                "is_active": False,
                "is_hidden": True,
                "status": "hidden",
                "hidden_reason": reason,
            },
        },
    )
    result.record("businesses", r.modified_count)

    # Cascade through each business
    for b in businesses:
        biz_id = b["business_id"]
        biz_result = await deactivate_business_content(biz_id, reason=reason, parent_user_id=user_id)
        for coll, count in biz_result.collections.items():
            result.record(f"business:{biz_id}:{coll}", count)

    # --- Artists ---
    artists = await db.artists.find({"owner_id": user_id}, {"artist_id": 1, "_id": 0}).to_list(200)
    r = await db.artists.update_many(
        {"owner_id": user_id},
        {
            "$set": {
                "is_active": False,
                "is_hidden": True,
                "hidden_reason": reason,
            },
        },
    )
    result.record("artists", r.modified_count)

    for a in artists:
        art_id = a["artist_id"]
        art_result = await deactivate_artist_content(art_id, reason=reason, parent_user_id=user_id)
        for coll, count in art_result.collections.items():
            result.record(f"artist:{art_id}:{coll}", count)

    return result


async def deactivate_business_content(
    business_id: str,
    *,
    reason: str = "business_owner_deleted",
    parent_user_id: Optional[str] = None,
) -> DeactivationResult:
    """Soft-deactivate all content belonging to a business. Idempotent."""
    result = DeactivationResult(user_id=business_id, timestamp=_now_utc().isoformat())
    now = _now_utc()

    # --- Business Listings ---
    listing_query: Dict[str, Any] = {
        "business_id": business_id,
        "seller_type": "business",
        "is_active": True,
    }
    if parent_user_id:
        listing_query["owner_id"] = parent_user_id
    r = await db.listings.update_many(
        listing_query,
        {
            "$set": {
                "is_active": False,
                "status": "hidden",
                "hidden_reason": reason,
                "owner_deleted_at": now,
                "updated_at": now,
            },
        },
    )
    result.record("listings_business", r.modified_count)

    # --- Services ---
    r = await db.services.update_many(
        {"business_id": business_id, "is_active": True},
        {
            "$set": {
                "is_active": False,
                "status": "hidden",
                "hidden_reason": reason,
            },
        },
    )
    result.record("services", r.modified_count)

    # --- Jobs ---
    r = await db.jobs.update_many(
        {"business_id": business_id, "is_active": True},
        {
            "$set": {
                "is_active": False,
                "hidden_reason": reason,
            },
        },
    )
    result.record("jobs", r.modified_count)

    # --- Events ---
    r = await db.events.update_many(
        {"business_id": business_id, "is_hidden": {"$ne": True}},
        {
            "$set": {
                "is_hidden": True,
                "hidden_reason": reason,
            },
        },
    )
    result.record("events", r.modified_count)

    # --- Posts (business-tagged) ---
    r = await db.posts.update_many(
        {"actor_type": "business", "actor_id": business_id, "is_hidden": {"$ne": True}},
        {
            "$set": {
                "is_hidden": True,
                "hidden_reason": reason,
            },
        },
    )
    result.record("posts", r.modified_count)

    # --- Stories (business-tagged) ---
    r = await db.stories.update_many(
        {"actor_type": "business", "actor_id": business_id, "is_hidden": {"$ne": True}},
        {
            "$set": {
                "is_hidden": True,
                "hidden_reason": reason,
            },
        },
    )
    result.record("stories", r.modified_count)

    # --- Job applications ---
    jobs = await db.jobs.find({"business_id": business_id}, {"job_id": 1, "_id": 0}).to_list(200)
    job_ids = [j["job_id"] for j in jobs]
    app_count = 0
    if job_ids:
        r = await db.job_applications.update_many(
            {"job_id": {"$in": job_ids}},
            {"$set": {"status": "closed", "closed_reason": reason}},
        )
        app_count = r.modified_count
    result.record("job_applications", app_count)

    return result


async def deactivate_artist_content(
    artist_id: str,
    *,
    reason: str = "artist_owner_deleted",
    parent_user_id: Optional[str] = None,
) -> DeactivationResult:
    """Soft-deactivate all content belonging to an artist. Idempotent."""
    result = DeactivationResult(user_id=artist_id, timestamp=_now_utc().isoformat())
    now = _now_utc()

    # --- Artist Events ---
    r = await db.events.update_many(
        {"artist_id": artist_id, "is_hidden": {"$ne": True}},
        {
            "$set": {
                "is_hidden": True,
                "hidden_reason": reason,
            },
        },
    )
    result.record("events", r.modified_count)

    # --- Artist Posts ---
    r = await db.posts.update_many(
        {"actor_type": "artist", "actor_id": artist_id, "is_hidden": {"$ne": True}},
        {
            "$set": {
                "is_hidden": True,
                "hidden_reason": reason,
            },
        },
    )
    result.record("posts", r.modified_count)

    # --- Artist Stories ---
    r = await db.stories.update_many(
        {"actor_type": "artist", "actor_id": artist_id, "is_hidden": {"$ne": True}},
        {
            "$set": {
                "is_hidden": True,
                "hidden_reason": reason,
            },
        },
    )
    result.record("stories", r.modified_count)

    # --- Booking Requests (only active cancellable states) ---
    r = await db.booking_requests.update_many(
        {"artist_id": artist_id, "status": {"$in": ["pending", "requested", "confirmed"]}},
        {"$set": {"status": "cancelled", "cancelled_reason": reason}},
    )
    result.record("booking_requests", r.modified_count)

    return result


# ─── Ephemeral Cleanup ───


async def cleanup_ephemeral_user_data(user_id: str) -> dict:
    """Hard-delete push tokens, sessions, friend requests, saved items, notifications.
    These are account-private and must not persist after deletion.
    """
    counts: Dict[str, int] = {}

    r = await db.push_tokens.delete_many({"user_id": user_id})
    counts["push_tokens"] = r.deleted_count

    r = await db.user_sessions.delete_many({"user_id": user_id})
    counts["user_sessions"] = r.deleted_count

    r = await db.friend_requests.delete_many({
        "$or": [{"from_user_id": user_id}, {"to_user_id": user_id}],
    })
    counts["friend_requests"] = r.deleted_count

    r = await db.saved_items.delete_many({"user_id": user_id})
    counts["saved_items"] = r.deleted_count

    r = await db.notifications.delete_many({
        "$or": [{"user_id": user_id}, {"from_user_id": user_id}],
    })
    counts["notifications"] = r.deleted_count

    return counts


# ─── Relationship Cleanup ───


async def cleanup_relationships(user_id: str):
    """Remove user from friends lists and blocked lists of other users."""
    await db.users.update_many(
        {},
        {"$pull": {"friends": {"entity_type": "user", "entity_id": user_id}}},
    )
    await db.users.update_many(
        {},
        {"$pull": {"blocked_users": user_id}},
    )


# ─── User Tombstone ───


async def create_user_tombstone(user_id: str):
    """Mark user as deleted without removing the record.
    Email is replaced with a tombstone value so re-registration is possible.
    Profile fields are cleared to prevent public exposure.
    """
    tombstone_email = f"deleted+{user_id}@deleted.perix.app"
    now = _now_utc()

    await db.users.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "email": tombstone_email,
                "is_deleted": True,
                "deletion_pending": False,
                "deleted_at": now,
                "name": "Deleted user",
                "display_name": "Deleted user",
                "profile_photo": None,
                "picture": None,
                "cover_photo": None,
                "password_hash": None,
                "latitude": None,
                "longitude": None,
                "bio": None,
                "location": None,
            },
        },
    )


async def set_deletion_pending(user_id: str):
    """Mark the user as deletion_pending before modifying content.
    This prevents the user from authenticating mid-cleanup."""
    await db.users.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "deletion_pending": True,
                "deletion_started_at": _now_utc(),
            },
        },
    )


async def get_account_deletion_state(user_id: str) -> str:
    """Return explicit deletion state.
    Values: 'new' | 'running' | 'failed' | 'review_required' | 'ready_to_resume' | 'completed'
    """
    user = await db.users.find_one({"user_id": user_id}, {"is_deleted": 1, "deletion_pending": 1})
    if user and user.get("is_deleted"):
        return "completed"
    op = await db.deletion_operations.find_one(
        {"lock_key": f"account_deletion:{user_id}"},
        {"status": 1},
    )
    if not op:
        return "new"
    s = op.get("status")
    if s in ("running", "failed", "review_required", "ready_to_resume"):
        return s
    if s == "completed":
        return "completed"
    return "new"


async def check_unresolved_reviews(user_id: str) -> dict:
    """Return counts of unresolved subscriptions and bookings requiring review."""
    unresolved_subs = await db.subscriptions.count_documents({
        "user_id": user_id,
        "billing_status": "manual_review_required",
    })
    unresolved_bookings = await db.bookings.count_documents({
        "client_id": user_id,
        "refund_required": True,
        "refund_resolved": {"$ne": True},
    })
    return {"unresolved_subscriptions": unresolved_subs, "unresolved_bookings": unresolved_bookings}


# ─── Subscription Cancellation ───


async def cancel_user_subscriptions(user_id: str) -> dict:
    """Cancel active subscriptions. Provider-backed subs require manual review."""
    counts: Dict[str, int] = {}
    now = _now_utc()
    active_statuses = ["active", "trial", "pending"]

    # Owner subscriptions: per-record billing status
    owner_subs = await db.subscriptions.find(
        {"user_id": user_id, "status": {"$in": active_statuses}},
        {"subscription_id": 1, "paypal_subscription_id": 1},
    ).to_list(50)

    manual_count = 0
    for sub in owner_subs:
        has_provider = bool(sub.get("paypal_subscription_id"))
        await db.subscriptions.update_one(
            {"subscription_id": sub["subscription_id"]},
            {"$set": {
                "status": "cancelled_deletion",
                "cancelled_reason": "owner_account_deleted",
                "cancelled_at": now,
                "billing_status": "manual_review_required" if has_provider else "not_applicable",
            }},
        )
        if has_provider:
            manual_count += 1
    counts["subscriptions_owner"] = len(owner_subs)
    counts["manual_review_required"] = manual_count

    # Subscriber subscriptions
    r = await db.subscriptions.update_many(
        {"subscriber_id": user_id, "status": {"$in": active_statuses}},
        {"$set": {"status": "cancelled_deletion",
                  "cancelled_reason": "subscriber_account_deleted",
                  "cancelled_at": now, "billing_status": "not_applicable"}},
    )
    counts["subscriptions_subscriber"] = r.modified_count

    return counts


# ─── Booking Requester Cleanup ───


async def cancel_user_bookings_as_requester(user_id: str) -> dict:
    """Cancel active requester bookings. Paid confirmed ones marked refund_required first."""
    counts: Dict[str, int] = {}
    now = _now_utc()
    cancellable_states = ["pending", "requested", "confirmed"]

    # Step A: Identify and mark paid confirmed bookings BEFORE general cancellation
    paid = await db.bookings.find(
        {"client_id": user_id, "status": "confirmed",
         "payment_status": {"$in": ["paid", "processing"]}},
        {"booking_id": 1},
    ).to_list(100)
    if paid:
        pids = [b["booking_id"] for b in paid]
        await db.bookings.update_many(
            {"booking_id": {"$in": pids}},
            {"$set": {"status": "cancelled", "cancel_reason": "requester_account_deleted",
                      "requester_deleted": True, "refund_required": True,
                      "manual_review_required": True, "updated_at": now}},
        )
        counts["bookings_refund_required"] = len(paid)
        counts["bookings_require_review"] = True

    # Step B: Cancel remaining active unpaid confirmed bookings
    r = await db.bookings.update_many(
        {"client_id": user_id, "status": {"$in": cancellable_states},
         "booking_id": {"$nin": pids} if paid else {}},
        {"$set": {"status": "cancelled", "cancel_reason": "requester_account_deleted",
                  "requester_deleted": True, "updated_at": now}},
    )
    counts["bookings_as_client"] = r.modified_count

    # Step C: Cancel only active artist booking requests
    r = await db.booking_requests.update_many(
        {"requester_id": user_id, "status": {"$in": cancellable_states}},
        {"$set": {"status": "cancelled", "cancel_reason": "requester_account_deleted",
                  "requester_deleted": True, "updated_at": now}},
    )
    counts["booking_requests_as_requester"] = r.modified_count

    return counts


# ─── Report Marking ───


async def mark_user_reports(user_id: str):
    """Mark reports involving the deleted user without removing them."""
    await db.reports.update_many(
        {"reported_user_id": user_id},
        {"$set": {"reported_user_deleted": True}},
    )
    await db.reports.update_many(
        {"reporter_id": user_id},
        {"$set": {"reporter_deleted": True}},
    )


# ─── Seller Validation (batched — for Commit B) ───


async def seller_is_public(
    *,
    seller_type: str,
    seller_id: str,
) -> bool:
    """Check if a seller (user or business) is currently public."""
    if seller_type == "business":
        biz = await db.businesses.find_one(
            {"business_id": seller_id, "is_active": True, "is_hidden": {"$ne": True}},
            {"_id": 1},
        )
        return biz is not None
    else:
        user = await db.users.find_one(
            {"user_id": seller_id, "is_deleted": {"$ne": True}},
            {"_id": 1},
        )
        return user is not None


async def batch_filter_public_sellers(
    seller_entries: List[Dict[str, str]],
) -> Set[str]:
    """Given a list of {seller_type, seller_id}, return set of seller_ids that are public.
    Uses batch queries to avoid N+1.
    """
    if not seller_entries:
        return set()

    user_ids = list({e["seller_id"] for e in seller_entries if e.get("seller_type") != "business"})
    biz_ids = list({e["seller_id"] for e in seller_entries if e.get("seller_type") == "business"})

    public_user_ids: Set[str] = set()
    public_biz_ids: Set[str] = set()

    if user_ids:
        active_users = await db.users.find(
            {"user_id": {"$in": user_ids}, "is_deleted": {"$ne": True}},
            {"user_id": 1},
        ).to_list(len(user_ids))
        public_user_ids = {u["user_id"] for u in active_users}

    if biz_ids:
        active_biz = await db.businesses.find(
            {"business_id": {"$in": biz_ids}, "is_active": True, "is_hidden": {"$ne": True}},
            {"business_id": 1},
        ).to_list(len(biz_ids))
        public_biz_ids = {b["business_id"] for b in active_biz}

    return public_user_ids | public_biz_ids


# ─── Orphan Repair (Commit C — skeleton) ───


async def repair_orphaned_entities(
    *,
    dry_run: bool = True,
) -> RepairResult:
    """Find and hide entities whose owner/seller/parent no longer exists."""
    result = RepairResult(dry_run=dry_run)
    now = _now_utc()
    reason = "orphaned_owner_missing"

    async def _hide(coll: str, doc_id: str, doc: dict, category: str):
        if dry_run:
            result.by_collection[category] = result.by_collection.get(category, 0) + 1
            result.hidden += 1
            return
        await getattr(db, coll).update_one(
            {"_id": doc["_id"]} if doc.get("_id") else
            ({"listing_id": doc_id} if coll == "listings" else
             {"service_id": doc_id} if coll == "services" else
             {"job_id": doc_id} if coll == "jobs" else
             {"event_id": doc_id} if coll == "events" else
             {"activity_id": doc_id} if coll == "activities" else
             {"post_id": doc_id} if coll == "posts" else {}),
            {"$set": {"is_active": False, "is_hidden": True, "status": "hidden",
                      "hidden_reason": reason, "updated_at": now}},
        )
        result.by_collection[category] = result.by_collection.get(category, 0) + 1
        result.hidden += 1

    # 1. Personal listings (user seller, missing/deleted owner)
    orphan_personal = await db.listings.find(
        {"seller_type": {"$in": ["user", None]}, "is_active": True},
        {"listing_id": 1, "owner_id": 1, "seller_id": 1},
    ).to_list(5000)
    result.total_checked += len(orphan_personal)
    user_ids = list({(d.get("seller_id") or d.get("owner_id")) for d in orphan_personal if d.get("seller_id") or d.get("owner_id")})
    active_users = {u["user_id"] for u in (await db.users.find(
        {"user_id": {"$in": user_ids}, "is_deleted": {"$ne": True}}, {"user_id": 1}).to_list(len(user_ids)))}
    for d in orphan_personal:
        owner = d.get("seller_id") or d.get("owner_id")
        if owner and owner not in active_users:
            await _hide("listings", d["listing_id"], d, "listings_personal_orphan")

    # 2. Business listings (business seller, missing/inactive/hidden business)
    orphan_biz = await db.listings.find(
        {"seller_type": "business", "is_active": True},
        {"listing_id": 1, "business_id": 1, "seller_id": 1},
    ).to_list(5000)
    result.total_checked += len(orphan_biz)
    biz_ids = list({(d.get("business_id") or d.get("seller_id")) for d in orphan_biz if d.get("business_id") or d.get("seller_id")})
    active_biz = {b["business_id"] for b in (await db.businesses.find(
        {"business_id": {"$in": biz_ids}, "is_active": True, "is_hidden": {"$ne": True}},
        {"business_id": 1}).to_list(len(biz_ids)))}
    for d in orphan_biz:
        parent = d.get("business_id") or d.get("seller_id")
        if parent and parent not in active_biz:
            await _hide("listings", d["listing_id"], d, "listings_business_orphan")

    # 3. Orphan services
    services = await db.services.find({"is_active": True}, {"service_id": 1, "business_id": 1, "_id": 1}).to_list(5000)
    result.total_checked += len(services)
    svc_biz_ids = list({s["business_id"] for s in services if s.get("business_id")})
    svc_active_biz = {b["business_id"] for b in (await db.businesses.find(
        {"business_id": {"$in": svc_biz_ids}, "is_active": True, "is_hidden": {"$ne": True}},
        {"business_id": 1}).to_list(len(svc_biz_ids)))}
    for s in services:
        if s.get("business_id") and s["business_id"] not in svc_active_biz:
            await _hide("services", s["service_id"], s, "services_orphan")

    # 4. Orphan jobs
    jobs = await db.jobs.find({"is_active": True}, {"job_id": 1, "business_id": 1, "_id": 1}).to_list(5000)
    result.total_checked += len(jobs)
    job_biz_ids = list({j["business_id"] for j in jobs if j.get("business_id")})
    job_active_biz = {b["business_id"] for b in (await db.businesses.find(
        {"business_id": {"$in": job_biz_ids}, "is_active": True, "is_hidden": {"$ne": True}},
        {"business_id": 1}).to_list(len(job_biz_ids)))}
    for j in jobs:
        if j.get("business_id") and j["business_id"] not in job_active_biz:
            await _hide("jobs", j["job_id"], j, "jobs_orphan")

    # 5. Orphan events (missing creator or missing business)
    events = await db.events.find({"is_hidden": {"$ne": True}},
        {"event_id": 1, "creator_id": 1, "business_id": 1, "_id": 1}).to_list(5000)
    result.total_checked += len(events)
    evt_user_ids = list({e["creator_id"] for e in events if e.get("creator_id")})
    evt_active_users = {u["user_id"] for u in (await db.users.find(
        {"user_id": {"$in": evt_user_ids}, "is_deleted": {"$ne": True}},
        {"user_id": 1}).to_list(len(evt_user_ids)))}
    for e in events:
        if e.get("creator_id") and e["creator_id"] not in evt_active_users:
            await _hide("events", e["event_id"], e, "events_orphan_creator")
        elif e.get("business_id") and e["business_id"] not in svc_active_biz:
            await _hide("events", e["event_id"], e, "events_orphan_business")

    # 6. Orphan activities (missing creator)
    activities = await db.activities.find({"is_hidden": {"$ne": True}},
        {"activity_id": 1, "creator_id": 1, "_id": 1}).to_list(5000)
    result.total_checked += len(activities)
    act_user_ids = list({a["creator_id"] for a in activities if a.get("creator_id")})
    act_active_users = {u["user_id"] for u in (await db.users.find(
        {"user_id": {"$in": act_user_ids}, "is_deleted": {"$ne": True}},
        {"user_id": 1}).to_list(len(act_user_ids)))}
    for a in activities:
        if a.get("creator_id") and a["creator_id"] not in act_active_users:
            await _hide("activities", a["activity_id"], a, "activities_orphan")

    logger.info("repair_orphaned_entities: dry_run=%s checked=%d hidden=%d",
                dry_run, result.total_checked, result.hidden)
    return result
