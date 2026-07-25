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