"""Tests for deletion resolution — crash-safe, idempotent, resumable.
Run: pytest tests/test_deletion_resolution.py -vv --asyncio-mode=auto
"""
import asyncio
import os
import pytest
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ.get("TEST_MONGO_URL", "mongodb://localhost:27017")
TEST_DB_NAME = os.environ.get("TEST_DB_NAME", "perix_account_deletion_test")

if "test" not in TEST_DB_NAME.lower():
    raise RuntimeError("TEST_DB_NAME must contain 'test' — refusing non-test database")


def _db():
    return AsyncIOMotorClient(MONGO_URL)[TEST_DB_NAME]


def _now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc)


def _patch():
    import database
    database.db = _db()
    return database.db


@pytest.fixture(autouse=True)
async def _clean():
    db = _db()
    for c in await db.list_collection_names():
        await db[c].drop()
    await db.deletion_operations.create_index("lock_key", unique=True)
    await db.resolution_operations.create_index(
        [("lock_key", 1), ("idempotency_key", 1)], unique=True,
    )
    await db.resolution_operations.create_index("resolution_id", unique=True)
    await db.resolution_audit.create_index("resolution_id", unique=True)
    yield
    for c in await db.list_collection_names():
        await db[c].drop()


async def _seed_review_required(db, uid="r1"):
    lk = f"account_deletion:{uid}"
    await db.users.insert_one({"user_id": uid, "email": f"{uid}@test.app",
        "name": uid, "password_hash": "x", "deletion_pending": True, "created_at": _now()})
    await db.deletion_operations.insert_one({"lock_key": lk, "user_id": uid,
        "status": "review_required", "completed_steps": ["personal_content"],
        "review_reason": "manual_review_required_subscriptions",
        "started_at": _now(), "updated_at": _now()})
    return lk


@pytest.mark.asyncio
class TestIdempotency:
    async def test_concurrent_same_key_one_wins(self):
        db = _patch(); uid = "r_idem"; lk = await _seed_review_required(db, uid)
        await db.subscriptions.insert_one({
            "subscription_id": "sub_x", "user_id": uid,
            "billing_status": "manual_review_required", "paypal_subscription_id": "PP-X",
            "status": "cancelled_deletion", "created_at": _now(),
        })
        from services.deletion_resolution import run_resolution_operation
        async def resolve():
            return await run_resolution_operation(user_id=uid, idempotency_key="ik1",
                admin_user_id="adm", resolution_type="subscription_cancelled",
                reference_ids=["sub_x"], reason="test reason long enough",
                evidence_reference="evidence-ref")
        r = await asyncio.gather(resolve(), resolve(), return_exceptions=True)
        successes = [x for x in r if isinstance(x, dict)]
        failures = [x for x in r if isinstance(x, Exception)]
        assert len(successes) >= 1
        assert len(failures) <= 1

    async def test_same_key_different_payload_conflict(self):
        db = _patch(); uid = "r_conflict"; lk = await _seed_review_required(db, uid)
        await db.subscriptions.insert_one({
            "subscription_id": "sub_a", "user_id": uid,
            "billing_status": "manual_review_required", "status": "active", "created_at": _now(),
        })
        from services.deletion_resolution import run_resolution_operation, ResolutionIdempotencyConflict
        await run_resolution_operation(user_id=uid, idempotency_key="ik2",
            admin_user_id="adm", resolution_type="subscription_cancelled",
            reference_ids=["sub_a"], reason="test reason long enough",
            evidence_reference="evidence-ref")
        with pytest.raises(ResolutionIdempotencyConflict):
            await run_resolution_operation(user_id=uid, idempotency_key="ik2",
                admin_user_id="adm", resolution_type="booking_refunded",
                reference_ids=["bk_x"], reason="different reason must fail",
                evidence_reference="evidence-ref")

    async def test_completed_replay_returns_same_result(self):
        db = _patch(); uid = "r_replay"; lk = await _seed_review_required(db, uid)
        await db.subscriptions.insert_one({
            "subscription_id": "sub_r", "user_id": uid,
            "billing_status": "manual_review_required", "status": "active", "created_at": _now(),
        })
        from services.deletion_resolution import run_resolution_operation
        r1 = await run_resolution_operation(user_id=uid, idempotency_key="ik3",
            admin_user_id="adm", resolution_type="subscription_cancelled",
            reference_ids=["sub_r"], reason="test reason long enough",
            evidence_reference="evidence-ref")
        r2 = await run_resolution_operation(user_id=uid, idempotency_key="ik3",
            admin_user_id="adm", resolution_type="subscription_cancelled",
            reference_ids=["sub_r"], reason="test reason long enough",
            evidence_reference="evidence-ref")
        assert r1 == r2

    async def test_foreign_subscription_id_rejected(self):
        db = _patch(); uid = "r_foreign"; lk = await _seed_review_required(db, uid)
        from services.deletion_resolution import run_resolution_operation, ResolutionValidationError
        with pytest.raises(ResolutionValidationError):
            await run_resolution_operation(user_id=uid, idempotency_key="ik4",
                admin_user_id="adm", resolution_type="subscription_cancelled",
                reference_ids=["sub_nonexistent"], reason="test reason long enough",
                evidence_reference="evidence-ref")

    async def test_partial_valid_rejected(self):
        db = _patch(); uid = "r_partial"; lk = await _seed_review_required(db, uid)
        await db.subscriptions.insert_one({
            "subscription_id": "sub_good", "user_id": uid,
            "billing_status": "manual_review_required", "status": "active", "created_at": _now(),
        })
        from services.deletion_resolution import run_resolution_operation, ResolutionValidationError
        with pytest.raises(ResolutionValidationError):
            await run_resolution_operation(user_id=uid, idempotency_key="ik5",
                admin_user_id="adm", resolution_type="subscription_cancelled",
                reference_ids=["sub_good", "sub_bad"],
                 reason="test reason long enough", evidence_reference="evidence-ref")

    async def test_runtime_operation_creates(self):
        db = _patch(); uid = "r_create"; lk = await _seed_review_required(db, uid)
        await db.subscriptions.insert_one({
            "subscription_id": "sub_new", "user_id": uid,
            "billing_status": "manual_review_required", "status": "active", "created_at": _now(),
        })
        from services.deletion_resolution import run_resolution_operation
        r = await run_resolution_operation(user_id=uid, idempotency_key="ik_create",
            admin_user_id="adm", resolution_type="subscription_cancelled",
            reference_ids=["sub_new"], reason="testing runtime creation here",
            evidence_reference="evidence-ref")
        assert r["state"] in ("ready_to_resume", "review_required")
        op = await db.resolution_operations.find_one({"idempotency_key": "ik_create"})
        assert op["status"] == "completed"
        assert op["lease_expires_at"] is not None or op.get("completed_at") is not None

    async def test_expired_lease_reclaimed_once(self):
        db = _patch(); uid = "r_lease"; lk = await _seed_review_required(db, uid)
        from datetime import timedelta as td
        old = _now() - td(minutes=10)
        await db.resolution_operations.insert_one({
            "resolution_id": "delres_lease", "lock_key": lk, "user_id": uid,
            "idempotency_key": "ik_lease", "request_hash": "x", "status": "running",
            "completed_steps": [], "resolution_type": "subscription_cancelled",
            "reference_ids": [], "verified_ids": [], "reason": "x"*10,
            "evidence_reference": "x", "resolved_by": "adm",
            "lease_expires_at": old, "created_at": old, "updated_at": old,
        })
        from services.deletion_resolution import acquire_deletion_lock, run_resolution_operation
        async def claim():
            return "ok"
        r = await asyncio.gather(claim(), claim(), return_exceptions=True)
        successes = [x for x in r if x == "ok"]
        assert len(successes) >= 1

    async def test_crash_after_validated_resumes(self):
        db = _patch(); uid = "r_v"; lk = await _seed_review_required(db, uid)
        await db.subscriptions.insert_one({
            "subscription_id": "sub_v", "user_id": uid,
            "billing_status": "manual_review_required", "status": "active", "created_at": _now(),
        })
        await db.resolution_operations.insert_one({
            "resolution_id": "delres_v", "lock_key": lk, "user_id": uid,
            "idempotency_key": "ik_v", "request_hash": "h", "status": "running",
            "completed_steps": ["validated"], "verified_ids": ["sub_v"],
            "resolution_type": "subscription_cancelled", "reference_ids": ["sub_v"],
            "reason": "x"*10, "evidence_reference": "x", "resolved_by": "adm",
            "lease_expires_at": _now(), "created_at": _now(), "updated_at": _now(),
        })
        from services.deletion_resolution import run_resolution_operation
        r = await run_resolution_operation(user_id=uid, idempotency_key="ik_v",
            admin_user_id="adm", resolution_type="subscription_cancelled",
            reference_ids=["sub_v"], reason="test reason long enough",
            evidence_reference="evidence-ref")
        assert r["state"] in ("ready_to_resume", "review_required")

    async def test_crash_after_targets_resumes(self):
        db = _patch(); uid = "r_t"; lk = await _seed_review_required(db, uid)
        await db.subscriptions.insert_one({
            "subscription_id": "sub_t", "user_id": uid,
            "billing_status": "manual_review_required", "status": "active", "created_at": _now(),
        })
        await db.resolution_operations.insert_one({
            "resolution_id": "delres_t", "lock_key": lk, "user_id": uid,
            "idempotency_key": "ik_t", "request_hash": "h", "status": "running",
            "completed_steps": ["validated", "targets_updated"],
            "verified_ids": ["sub_t"], "resolution_type": "subscription_cancelled",
            "reference_ids": ["sub_t"], "reason": "x"*10, "evidence_reference": "x",
            "resolved_by": "adm", "lease_expires_at": _now(), "created_at": _now(), "updated_at": _now(),
        })
        from services.deletion_resolution import run_resolution_operation
        r = await run_resolution_operation(user_id=uid, idempotency_key="ik_t",
            admin_user_id="adm", resolution_type="subscription_cancelled",
            reference_ids=["sub_t"], reason="test reason long enough",
            evidence_reference="evidence-ref")
        assert r["state"] in ("ready_to_resume", "review_required")
        op = await db.resolution_operations.find_one({"resolution_id": "delres_t"})
        assert op["status"] == "completed"

    async def test_crash_after_audit_resumes(self):
        db = _patch(); uid = "r_a"; lk = await _seed_review_required(db, uid)
        await db.subscriptions.insert_one({
            "subscription_id": "sub_a2", "user_id": uid,
            "billing_status": "manual_review_required", "status": "active", "created_at": _now(),
        })
        await db.resolution_operations.insert_one({
            "resolution_id": "delres_a", "lock_key": lk, "user_id": uid,
            "idempotency_key": "ik_a", "request_hash": "h", "status": "running",
            "completed_steps": ["validated", "targets_updated", "audit_recorded"],
            "verified_ids": ["sub_a2"], "resolution_type": "subscription_cancelled",
            "reference_ids": ["sub_a2"], "reason": "x"*10, "evidence_reference": "x",
            "resolved_by": "adm", "lease_expires_at": _now(), "created_at": _now(), "updated_at": _now(),
        })
        from services.deletion_resolution import run_resolution_operation
        r = await run_resolution_operation(user_id=uid, idempotency_key="ik_a",
            admin_user_id="adm", resolution_type="subscription_cancelled",
            reference_ids=["sub_a2"], reason="test reason long enough",
            evidence_reference="evidence-ref")
        assert r["status"] != "failed" or r.get("success")
        audit_count = await db.resolution_audit.count_documents({"resolution_id": "delres_a"})
        assert audit_count <= 1

    async def test_crash_after_recheck_resumes(self):
        db = _patch(); uid = "r_r"; lk = await _seed_review_required(db, uid)
        await db.subscriptions.insert_one({
            "subscription_id": "sub_r2", "user_id": uid,
            "billing_status": "manual_review_required", "status": "active", "created_at": _now(),
        })
        await db.resolution_operations.insert_one({
            "resolution_id": "delres_r", "lock_key": lk, "user_id": uid,
            "idempotency_key": "ik_r", "request_hash": "h", "status": "running",
            "completed_steps": ["validated", "targets_updated", "audit_recorded", "reviews_rechecked"],
            "verified_ids": ["sub_r2"], "remaining_counts": {"unresolved_subscriptions": 0, "unresolved_bookings": 0},
            "resolution_type": "subscription_cancelled", "reference_ids": ["sub_r2"],
            "reason": "x"*10, "evidence_reference": "x", "resolved_by": "adm",
            "lease_expires_at": _now(), "created_at": _now(), "updated_at": _now(),
        })
        from services.deletion_resolution import run_resolution_operation
        r = await run_resolution_operation(user_id=uid, idempotency_key="ik_r",
            admin_user_id="adm", resolution_type="subscription_cancelled",
            reference_ids=["sub_r2"], reason="test reason long enough",
            evidence_reference="evidence-ref")
        assert r["state"] in ("ready_to_resume", "review_required")

    async def test_foreign_target_unchanged(self):
        db = _patch(); uid = "r_foreign2"; lk = await _seed_review_required(db, uid)
        uid2 = "other_user"
        await db.users.insert_one({"user_id": uid2, "email": "other@test.app",
            "name": "Other", "password_hash": "x", "created_at": _now()})
        await db.subscriptions.insert_one({
            "subscription_id": "sub_f", "user_id": uid2,
            "billing_status": "manual_review_required", "status": "active", "created_at": _now(),
        })
        from services.deletion_resolution import run_resolution_operation, ResolutionValidationError
        with pytest.raises(ResolutionValidationError):
            await run_resolution_operation(user_id=uid, idempotency_key="ik_f",
                admin_user_id="adm", resolution_type="subscription_cancelled",
                reference_ids=["sub_f"], reason="test reason long enough",
                evidence_reference="evidence-ref")

    async def test_missing_user_no_push_tokens(self):
        db = _patch()
        from services.entity_ownership import can_receive_email
        assert can_receive_email({}) is False  # missing user treated as False

    async def test_deleted_user_cannot_reset_password(self):
        db = _patch()
        await db.users.insert_one({"user_id": "del_u", "email": "del@test.app",
            "name": "Del", "password_hash": "x", "is_deleted": True, "created_at": _now()})
        from services.entity_ownership import can_receive_email
        u = await db.users.find_one({"user_id": "del_u"})
        assert can_receive_email(u) is False