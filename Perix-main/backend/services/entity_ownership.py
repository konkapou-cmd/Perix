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
    "business_content",
    "artist_content",
    "relationship_cleanup",
    "ephemeral_cleanup",
    "user_tombstone",
    "completed",
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


async def acquire_deletion_lock(user_id: str) -> str | None:
    """Atomically acquire a deletion lock for the given user.
    Returns the lock_key if acquired, None if another operation is active/completed.
    Uses $setOnInsert on a unique lock_key index for atomicity.
    Handles DuplicateKeyError from simultaneous upsert attempts.
    """
    lock_key = f"account_deletion:{user_id}"
    now = _now_utc()

    try:
        result = await db.deletion_operations.update_one(
            {"lock_key": lock_key},
            {
                "$setOnInsert": {
                    "lock_key": lock_key,
                    "user_id": user_id,
                    "status": "running",
                    "completed_steps": [],
                    "failed_step": None,
                    "last_error": None,
                    "started_at": now,
                    "updated_at": now,
                },
            },
            upsert=True,
        )
    except Exception:
        # DuplicateKeyError from simultaneous upsert by another request
        result = None

    if result is not None and result.upserted_id is not None:
        return lock_key  # New lock acquired

    # Document already exists (or racing write just inserted) — re-read to decide
    existing = await db.deletion_operations.find_one({"lock_key": lock_key})
    if not existing:
        return None  # Unexpected: should not happen

    status = existing.get("status")
    if status == "failed":
        # Allow resume of failed operation
        await db.deletion_operations.update_one(
            {"lock_key": lock_key},
            {"$set": {"status": "running", "updated_at": now, "last_error": None}},
        )
        return lock_key
    if status == "completed":
        return None  # Already done
    # status == "running": another operation is active
    return None


async def resume_deletion_lock(user_id: str) -> str | None:
    """Resume a previously failed deletion. Only works if status is 'failed'."""
    lock_key = f"account_deletion:{user_id}"
    existing = await db.deletion_operations.find_one({"lock_key": lock_key})
    if not existing:
        return None
    if existing.get("status") != "failed":
        return None
    await db.deletion_operations.update_one(
        {"lock_key": lock_key},
        {"$set": {"status": "running", "updated_at": _now_utc()}},
    )
    return lock_key


async def get_deletion_state(user_id: str) -> dict | None:
    """Return the current deletion operation state for a user, or None."""
    lock_key = f"account_deletion:{user_id}"
    doc = await db.deletion_operations.find_one(
        {"lock_key": lock_key},
        {"_id": 0, "last_error": 0},
    )
    if doc:
        doc.pop("last_error", None)  # Never expose error details
    return doc


async def record_deletion_step(lock_key: str, step: str):
    await db.deletion_operations.update_one(
        {"lock_key": lock_key},
        {
            "$push": {"completed_steps": step},
            "$set": {"updated_at": _now_utc()},
        },
    )


async def fail_deletion_operation(lock_key: str, step: str, error: str):
    await db.deletion_operations.update_one(
        {"lock_key": lock_key},
        {
            "$set": {
                "status": "failed",
                "failed_step": step,
                "last_error": str(error)[:1000],
                "updated_at": _now_utc(),
            },
        },
    )


async def complete_deletion_operation(lock_key: str):
    await db.deletion_operations.update_one(
        {"lock_key": lock_key},
        {
            "$set": {
                "status": "completed",
                "completed_steps": DELETION_STEPS,
                "updated_at": _now_utc(),
            },
        },
    )


# ─── Soft Deactivation ───


async def deactivate_user_content(
    user_id: str,
    *,
    reason: str = "owner_account_deleted",
) -> DeactivationResult:
    """Soft-deactivate all content owned by a user. Idempotent."""
    result = DeactivationResult(user_id=user_id, timestamp=_now_utc().isoformat())
    now = _now_utc()

    # --- Personal Listings ---
    r = await db.listings.update_many(
        {"owner_id": user_id, "seller_type": "user", "is_active": True},
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
    result.record("listings_personal", r.modified_count)
    logger.info("deactivate_user_content: hid %d personal listings for %s", r.modified_count, user_id)

    # --- Posts ---
    r = await db.posts.update_many(
        {"user_id": user_id, "is_hidden": {"$ne": True}},
        {
            "$set": {
                "is_hidden": True,
                "hidden_reason": reason,
                "owner_deleted_at": now,
            },
        },
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

    # --- Businesses ---
    businesses = await db.businesses.find({"owner_id": user_id, "is_active": True}, {"business_id": 1, "_id": 0}).to_list(200)
    r = await db.businesses.update_many(
        {"owner_id": user_id, "is_active": True},
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

    # --- Booking Requests ---
    r = await db.booking_requests.update_many(
        {"artist_id": artist_id},
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


async def prevent_duplicate_deletion(user_id: str) -> bool:
    """Check if a deletion operation is already in progress for this user.
    Returns True if deletion should be blocked.
    Does NOT check with deletion_operations — checks the operation status later."""
    user = await db.users.find_one({"user_id": user_id}, {"is_deleted": 1, "deletion_pending": 1})
    if not user:
        return False
    if user.get("is_deleted"):
        return True  # Already tombstoned
    if user.get("deletion_pending"):
        return True  # Deletion already in progress
    return False


# ─── Subscription Cancellation ───


async def cancel_user_subscriptions(user_id: str) -> dict:
    """Cancel active subscriptions owned by the user or where user is subscriber.
    Tracks billing_status for audit. Does not log payment credentials.
    Returns dict with counts and billing_status per subscription.
    """
    counts: Dict[str, int] = {}
    now = _now_utc()

    active_statuses = ["active", "trial", "pending"]

    # Owner subscriptions
    owner_subs = await db.subscriptions.find(
        {"user_id": user_id, "status": {"$in": active_statuses}},
        {"subscription_id": 1, "paypal_subscription_id": 1, "status": 1},
    ).to_list(50)

    billing_status = "not_applicable"
    for sub in owner_subs:
        has_provider = bool(sub.get("paypal_subscription_id"))
        billing_status = "provider_not_configured" if has_provider else "not_applicable"

    r = await db.subscriptions.update_many(
        {"user_id": user_id, "status": {"$in": active_statuses}},
        {
            "$set": {
                "status": "cancelled_deletion",
                "cancelled_reason": "owner_account_deleted",
                "cancelled_at": now,
                "billing_status": billing_status,
            },
        },
    )
    counts["subscriptions_owner"] = r.modified_count

    # Subscriber subscriptions
    r = await db.subscriptions.update_many(
        {"subscriber_id": user_id, "status": {"$in": active_statuses}},
        {
            "$set": {
                "status": "cancelled_deletion",
                "cancelled_reason": "subscriber_account_deleted",
                "cancelled_at": now,
                "billing_status": "not_applicable",
            },
        },
    )
    counts["subscriptions_subscriber"] = r.modified_count

    return counts


# ─── Booking Requester Cleanup ───


async def cancel_user_bookings_as_requester(user_id: str) -> dict:
    """Cancel service bookings and artist booking requests where the user is the client/requester.
    Only transitions active states (pending/confirmed/requested).
    Does not overwrite completed, rejected, refunded, or already-cancelled records.
    Paid confirmed bookings are marked refund_required.
    """
    counts: Dict[str, int] = {}
    now = _now_utc()

    # Service bookings (client_id) — only cancel active states
    cancellable_states = ["pending", "requested", "confirmed"]

    # First: cancel standard bookings
    r = await db.bookings.update_many(
        {"client_id": user_id, "status": {"$in": cancellable_states}},
        {
            "$set": {
                "status": "cancelled",
                "cancel_reason": "requester_account_deleted",
                "requester_deleted": True,
                "updated_at": now,
            },
        },
    )
    counts["bookings_as_client"] = r.modified_count

    # Paid confirmed bookings need refund tracking (if any payment metadata exists)
    paid_confirmed = await db.bookings.find(
        {"client_id": user_id, "status": "confirmed", "payment_status": "paid"},
        {"booking_id": 1},
    ).to_list(100)
    if paid_confirmed:
        await db.bookings.update_many(
            {"booking_id": {"$in": [b["booking_id"] for b in paid_confirmed]}},
            {
                "$set": {
                    "status": "cancelled",
                    "cancel_reason": "requester_account_deleted",
                    "requester_deleted": True,
                    "refund_required": True,
                    "updated_at": now,
                },
            },
        )
        counts["bookings_refund_required"] = len(paid_confirmed)

    # Artist booking requests (requester_id)
    r = await db.booking_requests.update_many(
        {"requester_id": user_id, "status": {"$in": cancellable_states}},
        {
            "$set": {
                "status": "cancelled",
                "cancel_reason": "requester_account_deleted",
                "requester_deleted": True,
                "updated_at": now,
            },
        },
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
    """Find and hide entities whose owner/seller no longer exists."""
    result = RepairResult(dry_run=dry_run)

    # Orphan personal listings
    orphan_personal = await db.listings.find(
        {"seller_type": "user", "is_active": True},
        {"listing_id": 1, "owner_id": 1, "seller_id": 1},
    ).to_list(1000)
    result.total_checked += len(orphan_personal)

    for doc in orphan_personal:
        owner_id = doc.get("seller_id") or doc.get("owner_id")
        if not owner_id:
            continue
        user = await db.users.find_one({"user_id": owner_id, "is_deleted": {"$ne": True}}, {"_id": 1})
        if not user:
            result.by_collection["listings_personal_orphan"] = result.by_collection.get("listings_personal_orphan", 0) + 1
            result.hidden += 1
            if not dry_run:
                await db.listings.update_one(
                    {"listing_id": doc["listing_id"]},
                    {"$set": {"is_active": False, "status": "hidden", "hidden_reason": "orphaned_owner_missing", "updated_at": _now_utc()}},
                )

    # This is a skeleton — full implementation in Commit C
    logger.info("repair_orphaned_entities: dry_run=%s checked=%d hidden=%d", dry_run, result.total_checked, result.hidden)
    return result
