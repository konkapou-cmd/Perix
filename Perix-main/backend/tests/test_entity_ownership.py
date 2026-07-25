"""Tests for entity_ownership service against test MongoDB.
Run: pytest tests/test_entity_ownership.py -vv --asyncio-mode=auto
"""
import asyncio
import pytest
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = "mongodb://localhost:27017"
TEST_DB = "perix_test"


def _db():
    return AsyncIOMotorClient(MONGO_URL)[TEST_DB]


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
    yield
    for c in await db.list_collection_names():
        await db[c].drop()


async def _seed_user(db, uid="usr_test"):
    await db.users.insert_one({"user_id": uid, "email": f"t@{uid}.app", "name": "T",
        "password_hash": "x", "created_at": _now()})


@pytest.mark.asyncio
class TestDeactivation:
    async def test_listing_soft_deactivated(self):
        db = _patch(); uid = "u1"; await _seed_user(db, uid)
        await db.listings.insert_one({"listing_id": "L1", "owner_id": uid,
            "seller_type": "user", "status": "published", "is_active": True,
            "listing_type": "product", "created_at": _now(), "seller_id": uid})
        from services.entity_ownership import deactivate_user_content
        await deactivate_user_content(uid)
        l = await db.listings.find_one({"listing_id": "L1"})
        assert l["is_active"] is False
        assert l["status"] == "hidden"

    async def test_idempotent(self):
        db = _patch(); uid = "u2"; await _seed_user(db, uid)
        await db.listings.insert_one({"listing_id": "L2", "owner_id": uid,
            "seller_type": "user", "status": "published", "is_active": True,
            "listing_type": "product", "created_at": _now(), "seller_id": uid})
        from services.entity_ownership import deactivate_user_content
        await deactivate_user_content(uid)
        await deactivate_user_content(uid)
        assert (await db.listings.find_one({"listing_id": "L2"}))["is_active"] is False

    async def test_business_cascade(self):
        db = _patch(); uid = "u3"; await _seed_user(db, uid)
        await db.businesses.insert_one({"business_id": "b1", "owner_id": uid,
            "root_category": "food", "subcategory": "italian", "is_active": True,
            "name": "Biz", "address": "X", "latitude": 1, "longitude": 1,
            "category": "Food", "is_hidden": False, "created_at": _now(),
            "enabled_modules": {}, "subscription_status": "trial", "hours_configured": True})
        await db.services.insert_one({"service_id": "s1", "business_id": "b1",
            "is_active": True, "name": "Svc", "type": "appointment",
            "status": "published", "created_at": _now()})
        from services.entity_ownership import deactivate_user_content
        await deactivate_user_content(uid)
        assert (await db.services.find_one({"service_id": "s1"}))["is_active"] is False
        assert (await db.businesses.find_one({"business_id": "b1"}))["is_active"] is False

    async def test_inactive_business_cascaded(self):
        db = _patch(); uid = "u3b"; await _seed_user(db, uid)
        await db.businesses.insert_one({"business_id": "b2", "owner_id": uid,
            "root_category": "food", "subcategory": "italian", "is_active": False,
            "is_hidden": False, "name": "Biz2", "address": "X",
            "latitude": 1, "longitude": 1, "category": "Food", "created_at": _now(),
            "enabled_modules": {}, "subscription_status": "trial", "hours_configured": True})
        from services.entity_ownership import deactivate_user_content
        await deactivate_user_content(uid)
        b = await db.businesses.find_one({"business_id": "b2"})
        assert b["is_hidden"] is True

    async def test_post_hidden(self):
        db = _patch(); uid = "u4"; await _seed_user(db, uid)
        await db.posts.insert_one({"post_id": "p1", "user_id": uid, "text": "hi", "created_at": _now()})
        from services.entity_ownership import deactivate_user_content
        await deactivate_user_content(uid)
        assert (await db.posts.find_one({"post_id": "p1"}))["is_hidden"] is True

    async def test_ephemeral_cleanup(self):
        db = _patch(); uid = "u5"; await _seed_user(db, uid)
        await db.push_tokens.insert_one({"user_id": uid, "token": "t"})
        await db.user_sessions.insert_one({"user_id": uid, "session_token": "s", "expires_at": _now()})
        from services.entity_ownership import cleanup_ephemeral_user_data
        await cleanup_ephemeral_user_data(uid)
        assert await db.push_tokens.count_documents({}) == 0

    async def test_tombstone(self):
        db = _patch(); uid = "u6"
        await db.users.insert_one({"user_id": uid, "email": "old@perix.app",
            "name": "Old", "password_hash": "x", "profile_photo": "p.jpg",
            "created_at": _now()})
        from services.entity_ownership import create_user_tombstone
        await create_user_tombstone(uid)
        u = await db.users.find_one({"user_id": uid})
        assert u["is_deleted"] is True
        assert u["email"].startswith("deleted+")
        assert u["password_hash"] is None

    async def test_subscription_manual_review(self):
        db = _patch(); uid = "u7"; await _seed_user(db, uid)
        await db.subscriptions.insert_one({"subscription_id": "sub1", "user_id": uid,
            "paypal_subscription_id": "PP-1", "status": "active", "created_at": _now()})
        from services.entity_ownership import cancel_user_subscriptions
        r = await cancel_user_subscriptions(uid)
        assert r["manual_review_required"] == 1
        s = await db.subscriptions.find_one({"subscription_id": "sub1"})
        assert s["billing_status"] == "manual_review_required"

    async def test_booking_refund_pauses_deletion(self):
        db = _patch(); uid = "u8"; await _seed_user(db, uid)
        await db.bookings.insert_one({"booking_id": "b1", "client_id": uid,
            "status": "confirmed", "payment_status": "paid", "created_at": _now()})
        from services.entity_ownership import cancel_user_bookings_as_requester
        r = await cancel_user_bookings_as_requester(uid)
        assert r.get("bookings_require_review") is True
        b = await db.bookings.find_one({"booking_id": "b1"})
        assert b["refund_required"] is True

    async def test_completed_booking_unchanged(self):
        db = _patch(); uid = "u9"; await _seed_user(db, uid)
        await db.bookings.insert_one({"booking_id": "b2", "client_id": uid,
            "status": "completed", "created_at": _now()})
        from services.entity_ownership import cancel_user_bookings_as_requester
        await cancel_user_bookings_as_requester(uid)
        b = await db.bookings.find_one({"booking_id": "b2"})
        assert b["status"] == "completed"

    async def test_artist_booking_active_only(self):
        db = _patch(); uid = "u10"; await _seed_user(db, uid)
        await db.artists.insert_one({"artist_id": "a1", "owner_id": uid,
            "name": "Art", "created_at": _now()})
        await db.booking_requests.insert_one({"request_id": "br1",
            "artist_id": "a1", "requester_id": "X", "status": "completed",
            "created_at": _now()})
        from services.entity_ownership import deactivate_user_content
        await deactivate_user_content(uid)
        br = await db.booking_requests.find_one({"request_id": "br1"})
        assert br["status"] == "completed"


@pytest.mark.asyncio
class TestStateMachine:
    async def test_new_acquire(self):
        db = _patch(); uid = "s1"
        await db.users.insert_one({"user_id": uid, "email": f"s1@{uid}.app",
            "name": "S1", "password_hash": "x", "created_at": _now()})
        from services.entity_ownership import acquire_new_deletion_lock, get_account_deletion_state
        assert await get_account_deletion_state(uid) == "new"
        lk = await acquire_new_deletion_lock(uid)
        assert lk is not None
        assert await get_account_deletion_state(uid) == "running"

    async def test_concurrent_new_lock(self):
        db = _patch(); uid = "s2"
        await db.users.insert_one({"user_id": uid, "email": f"s2@{uid}.app",
            "name": "S2", "password_hash": "x", "created_at": _now()})
        from services.entity_ownership import acquire_new_deletion_lock
        r = await asyncio.gather(acquire_new_deletion_lock(uid), acquire_new_deletion_lock(uid))
        locks = [x for x in r if x is not None]
        assert len(locks) == 1

    async def test_failed_resumes(self):
        db = _patch(); uid = "s3"; lk = f"account_deletion:{uid}"
        await db.users.insert_one({"user_id": uid, "email": f"s3@{uid}.app",
            "name": "S3", "password_hash": "x", "deletion_pending": True, "created_at": _now()})
        await db.deletion_operations.insert_one({"lock_key": lk, "user_id": uid,
            "status": "failed", "completed_steps": ["personal_content"],
            "failed_step": "subscriptions", "last_error": "test",
            "started_at": _now(), "updated_at": _now()})
        from services.entity_ownership import resume_failed_deletion, get_account_deletion_state
        assert await get_account_deletion_state(uid) == "failed"
        assert await resume_failed_deletion(lk) is True
        assert await get_account_deletion_state(uid) == "running"

    async def test_concurrent_failed_resume(self):
        db = _patch(); uid = "s4"; lk = f"account_deletion:{uid}"
        await db.users.insert_one({"user_id": uid, "email": f"s4@{uid}.app",
            "name": "S4", "password_hash": "x", "created_at": _now()})
        await db.deletion_operations.insert_one({"lock_key": lk, "user_id": uid,
            "status": "failed", "completed_steps": [], "started_at": _now(), "updated_at": _now()})
        from services.entity_ownership import resume_failed_deletion
        r = await asyncio.gather(resume_failed_deletion(lk), resume_failed_deletion(lk))
        successes = [x for x in r if x]
        assert len(successes) == 1

    async def test_mark_review_resolved(self):
        db = _patch(); uid = "s5"; lk = f"account_deletion:{uid}"
        await db.users.insert_one({"user_id": uid, "email": f"s5@{uid}.app",
            "name": "S5", "password_hash": "x", "deletion_pending": True, "created_at": _now()})
        await db.deletion_operations.insert_one({"lock_key": lk, "user_id": uid,
            "status": "review_required", "completed_steps": ["personal_content"],
            "review_reason": "test", "started_at": _now(), "updated_at": _now()})
        from services.entity_ownership import mark_review_resolved, get_account_deletion_state
        assert await get_account_deletion_state(uid) == "review_required"
        assert await mark_review_resolved(lk) is True
        assert await get_account_deletion_state(uid) == "ready_to_resume"

    async def test_ready_to_resume_transitions(self):
        db = _patch(); uid = "s6"; lk = f"account_deletion:{uid}"
        await db.users.insert_one({"user_id": uid, "email": f"s6@{uid}.app",
            "name": "S6", "password_hash": "x", "created_at": _now()})
        await db.deletion_operations.insert_one({"lock_key": lk, "user_id": uid,
            "status": "ready_to_resume", "completed_steps": ["personal_content"],
            "started_at": _now(), "updated_at": _now()})
        from services.entity_ownership import resume_resolved_review, get_account_deletion_state
        assert await get_account_deletion_state(uid) == "ready_to_resume"
        assert await resume_resolved_review(lk) is True
        assert await get_account_deletion_state(uid) == "running"


@pytest.mark.asyncio
class TestOrchestrator:
    async def test_completed_steps_skipped(self):
        db = _patch(); uid = "o1"; lk = f"account_deletion:{uid}"
        await db.users.insert_one({"user_id": uid, "email": f"o1@{uid}.app",
            "name": "O1", "password_hash": "x", "deletion_pending": True, "created_at": _now()})
        await db.deletion_operations.insert_one({"lock_key": lk, "user_id": uid,
            "status": "running", "completed_steps": ["personal_content",
            "subscriptions", "requester_bookings", "ephemeral_cleanup",
            "report_marking", "relationship_cleanup"],
            "started_at": _now(), "updated_at": _now()})
        from services.entity_ownership import run_account_deletion
        result = await run_account_deletion(uid, lk)
        assert result["status"] == "completed"
        assert "personal_content:skipped" in result["steps_run"]

    async def test_failure_injection_excludes_failed_step(self, monkeypatch):
        db = _patch(); uid = "o2"; lk = f"account_deletion:{uid}"
        await db.users.insert_one({"user_id": uid, "email": f"o2@{uid}.app",
            "name": "O2", "password_hash": "x", "deletion_pending": True, "created_at": _now()})
        await db.deletion_operations.insert_one({"lock_key": lk, "user_id": uid,
            "status": "running", "completed_steps": [],
            "started_at": _now(), "updated_at": _now()})
        import services.entity_ownership as entity_ownership

        async def forced_failure(*args, **kwargs):
            raise RuntimeError("controlled subscription failure")

        monkeypatch.setattr(entity_ownership, "cancel_user_subscriptions", forced_failure)
        result = await entity_ownership.run_account_deletion(uid, lk)
        assert result["status"] == "failed"

        op = await db.deletion_operations.find_one({"lock_key": lk})
        assert op["failed_step"] == "subscriptions"
        completed = set(op.get("completed_steps") or [])
        assert "personal_content" in completed
        assert "subscriptions" not in completed
