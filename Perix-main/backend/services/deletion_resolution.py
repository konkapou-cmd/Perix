"""Crash-safe, idempotent deletion review resolution.

No MongoDB transactions required — uses resumable step tracking,
deterministic idempotency hashes, and atomic conditional updates.
"""
import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set

from database import db

logger = logging.getLogger(__name__)

RESOLUTION_STEPS = [
    "validated",
    "targets_updated",
    "audit_recorded",
    "reviews_rechecked",
    "deletion_ready",
]

LEASE_MINUTES = 5


class ResolutionError(Exception):
    pass


class ResolutionValidationError(ResolutionError):
    pass


class ResolutionIdempotencyConflict(ResolutionError):
    pass


class ResolutionOperationInProgress(ResolutionError):
    pass


class ResolutionExecutionError(ResolutionError):
    pass


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _build_request_hash(
    lock_key: str,
    admin_user_id: str,
    resolution_type: str,
    reference_ids: List[str],
    reason: str,
    evidence_reference: str,
) -> str:
    payload = json.dumps({
        "lock_key": lock_key,
        "admin_user_id": admin_user_id,
        "resolution_type": resolution_type,
        "reference_ids": sorted(reference_ids),
        "reason": reason,
        "evidence_reference": evidence_reference,
    }, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()


async def _claim_operation(
    lock_key: str,
    user_id: str,
    idempotency_key: str,
    request_hash: str,
    admin_user_id: str,
    resolution_type: str,
    reference_ids: List[str],
    reason: str,
    evidence_reference: str,
) -> dict:
    """Atomically claim or resume a resolution operation."""
    now = _now_utc()

    existing = await db.resolution_operations.find_one(
        {"lock_key": lock_key, "idempotency_key": idempotency_key},
    )

    if existing:
        if existing.get("request_hash") != request_hash:
            raise ResolutionIdempotencyConflict(
                "Same idempotency key with different request payload"
            )
        status = existing.get("status")
        if status == "completed":
            return existing
        if status == "running":
            lease = existing.get("lease_expires_at")
            if lease and isinstance(lease, datetime) and lease > now:
                raise ResolutionOperationInProgress("Resolution already running")
            # Lease expired — reclaim
            result = await db.resolution_operations.update_one(
                {"resolution_id": existing["resolution_id"], "status": "running",
                 "lease_expires_at": lease},
                {"$set": {"status": "running", "lease_expires_at": now + datetime.timedelta(minutes=LEASE_MINUTES),
                          "updated_at": now}},
            )
            if result.modified_count == 1:
                return existing
            raise ResolutionOperationInProgress("Could not reclaim expired lease")
        if status == "failed":
            result = await db.resolution_operations.update_one(
                {"resolution_id": existing["resolution_id"], "status": "failed"},
                {"$set": {"status": "running", "lease_expires_at": now + datetime.timedelta(minutes=LEASE_MINUTES),
                          "updated_at": now}},
            )
            if result.modified_count == 1:
                return existing
            raise ResolutionOperationInProgress("Could not resume failed operation")
        raise ResolutionOperationInProgress(f"Unexpected status: {status}")

    # New operation
    import uuid
    resolution_id = f"delres_{uuid.uuid4().hex[:12]}"
    import pymongo.errors
    try:
        await db.resolution_operations.insert_one({
            "resolution_id": resolution_id,
            "lock_key": lock_key,
            "user_id": user_id,
            "idempotency_key": idempotency_key,
            "request_hash": request_hash,
            "status": "running",
            "current_step": None,
            "completed_steps": [],
            "resolution_type": resolution_type,
            "reference_ids": reference_ids,
            "verified_ids": [],
            "reason": reason,
            "evidence_reference": evidence_reference,
            "resolved_by": admin_user_id,
            "lease_expires_at": now + datetime.timedelta(minutes=LEASE_MINUTES),
            "created_at": now,
            "updated_at": now,
        })
    except pymongo.errors.DuplicateKeyError:
        # Race: another request inserted first — re-read
        existing = await db.resolution_operations.find_one(
            {"lock_key": lock_key, "idempotency_key": idempotency_key},
        )
        if existing and existing.get("request_hash") != request_hash:
            raise ResolutionIdempotencyConflict(
                "Same idempotency key with different request payload"
            )
        if existing and existing.get("status") == "completed":
            return existing
        raise ResolutionOperationInProgress("Resolution already created concurrently")

    return await db.resolution_operations.find_one({"resolution_id": resolution_id})


async def _set_current_step(resolution_id: str, step: str):
    await db.resolution_operations.update_one(
        {"resolution_id": resolution_id},
        {"$set": {"current_step": step, "updated_at": _now_utc()}},
    )


async def _mark_step_completed(resolution_id: str, step: str):
    await db.resolution_operations.update_one(
        {"resolution_id": resolution_id},
        {"$addToSet": {"completed_steps": step},
         "$set": {"current_step": None, "updated_at": _now_utc()}},
    )


async def _fail_operation(resolution_id: str, step: str, error: str):
    await db.resolution_operations.update_one(
        {"resolution_id": resolution_id},
        {"$set": {"status": "failed", "failed_step": step,
                  "last_error": str(error)[:1000],
                  "lease_expires_at": None, "updated_at": _now_utc()}},
    )


async def _complete_operation(resolution_id: str, result_data: dict):
    await db.resolution_operations.update_one(
        {"resolution_id": resolution_id},
        {"$set": {"status": "completed", "result": result_data,
                  "completed_at": _now_utc(), "lease_expires_at": None,
                  "updated_at": _now_utc()}},
    )


async def run_resolution_operation(
    *,
    user_id: str,
    idempotency_key: str,
    admin_user_id: str,
    resolution_type: str,
    reference_ids: List[str],
    reason: str,
    evidence_reference: str,
) -> dict:
    """Idempotent, crash-safe resolution orchestration."""
    from services.entity_ownership import check_unresolved_reviews, mark_review_resolved

    reference_ids = sorted(set(reference_ids))
    lock_key = f"account_deletion:{user_id}"
    request_hash = _build_request_hash(
        lock_key, admin_user_id, resolution_type, reference_ids,
        reason, evidence_reference,
    )
    now = _now_utc()

    # Atomic claim
    op = await _claim_operation(
        lock_key, user_id, idempotency_key, request_hash,
        admin_user_id, resolution_type, reference_ids,
        reason, evidence_reference,
    )
    if op.get("status") == "completed":
        return op.get("result", {"success": True})

    resolution_id = op["resolution_id"]
    completed = set(op.get("completed_steps") or [])
    verified_ids: List[str] = op.get("verified_ids") or []
    current_step: str | None = None

    async def _step(name: str, fn):
        nonlocal current_step
        if name in completed:
            return
        current_step = name
        await _set_current_step(resolution_id, name)
        try:
            await fn()
            await _mark_step_completed(resolution_id, name)
        except Exception:
            raise

    try:
        # Step 1: Validate
        async def validate():
            nonlocal verified_ids
            if verified_ids:
                return  # Already validated by a prior run
            if resolution_type == "subscription_cancelled":
                matching = await db.subscriptions.find(
                    {"subscription_id": {"$in": reference_ids},
                     "user_id": user_id, "billing_status": "manual_review_required"},
                    {"subscription_id": 1},
                ).to_list(len(reference_ids))
                verified_ids = [s["subscription_id"] for s in matching]
            else:
                matching = await db.bookings.find(
                    {"booking_id": {"$in": reference_ids},
                     "client_id": user_id, "refund_required": True,
                     "refund_resolved": {"$ne": True}},
                    {"booking_id": 1},
                ).to_list(len(reference_ids))
                verified_ids = [b["booking_id"] for b in matching]

            if set(verified_ids) != set(reference_ids):
                raise ResolutionValidationError(
                    f"Reference ID mismatch. Requested: {reference_ids}, Verified: {verified_ids}"
                )
            await db.resolution_operations.update_one(
                {"resolution_id": resolution_id},
                {"$set": {"verified_ids": verified_ids}},
            )
        await _step("validated", validate)

        # Step 2: Update targets (idempotent — accepts same resolution_id)
        async def update_targets():
            if resolution_type == "subscription_cancelled":
                await db.subscriptions.update_many(
                    {"subscription_id": {"$in": verified_ids}},
                    {"$set": {"billing_status": "cancelled", "resolution_id": resolution_id,
                              "resolved_at": now, "resolved_by": admin_user_id,
                              "resolution_reason": reason}},
                )
            else:
                await db.bookings.update_many(
                    {"booking_id": {"$in": verified_ids}},
                    {"$set": {"refund_resolved": True, "resolution_id": resolution_id,
                              "resolved_at": now, "resolved_by": admin_user_id,
                              "resolution_reason": reason}},
                )
        await _step("targets_updated", update_targets)

        # Step 3: Audit (upsert)
        async def record_audit():
            await db.resolution_audit.update_one(
                {"resolution_id": resolution_id},
                {"$setOnInsert": {
                    "resolution_id": resolution_id,
                    "idempotency_key": idempotency_key,
                    "lock_key": lock_key,
                    "resolution_type": resolution_type,
                    "reference_ids": verified_ids,
                    "resolved_by": admin_user_id,
                    "reason": reason,
                    "evidence_reference": evidence_reference,
                    "resolved_at": now,
                }},
                upsert=True,
            )
        await _step("audit_recorded", record_audit)

        # Step 4: Recheck remaining
        remaining = {}
        async def recheck():
            nonlocal remaining
            remaining = await check_unresolved_reviews(user_id)
            await db.resolution_operations.update_one(
                {"resolution_id": resolution_id},
                {"$set": {"remaining_counts": remaining}},
            )
        await _step("reviews_rechecked", recheck)

        # Step 5: Transition deletion if all clear
        result_state = "review_required"
        if remaining.get("unresolved_subscriptions", 0) == 0 and remaining.get("unresolved_bookings", 0) == 0:
            async def transition():
                nonlocal result_state
                from services.entity_ownership import get_account_deletion_state
                deletion_state = await get_account_deletion_state(user_id)
                if deletion_state == "review_required":
                    ok = await mark_review_resolved(lock_key)
                    if not ok:
                        raise ResolutionExecutionError("Could not mark review resolved")
                    result_state = "ready_to_resume"
                elif deletion_state == "ready_to_resume":
                    result_state = "ready_to_resume"
                else:
                    raise ResolutionExecutionError(
                        f"Unexpected deletion state for transition: {deletion_state}"
                    )
            await _step("deletion_ready", transition)

        result_data = {
            "success": True,
            "state": result_state,
            "remaining": remaining,
        }
        await _complete_operation(resolution_id, result_data)
        return result_data

    except (ResolutionValidationError, ResolutionExecutionError) as e:
        await _fail_operation(resolution_id, current_step or "unknown", str(e))
        raise
    except Exception as e:
        await _fail_operation(resolution_id, current_step or "unknown", str(e))
        raise ResolutionExecutionError("Resolution failed; retry supported") from e
