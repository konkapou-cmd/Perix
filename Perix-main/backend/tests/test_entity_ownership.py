"""Tests for entity_ownership service against test MongoDB database.

Run: pytest tests/test_entity_ownership.py -vv
Requires: MongoDB on localhost:27017, pytest-asyncio installed
"""
import asyncio
import os
import time
import pytest
from motor.motor_asyncio import AsyncIOMotorClient

TEST_DB_NAME = os.getenv("TEST_DB_NAME", "perix_test")
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")


def _test_db():
    client = AsyncIOMotorClient(MONGO_URL)
    return client[TEST_DB_NAME]


async def _drop_all():
    db = _test_db()
    cols = await db.list_collection_names()
    for c in cols:
        await db[c].drop()


def _now_utc():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc)


def _patch_db():
    db = _test_db()
    import database
    database.db = db
    return db


@pytest.fixture(autouse=True)
async def _auto_clean():
    await _drop_all()
    yield
    await _drop_all()


@pytest.mark.asyncio
class TestSoftDeactivation:
    async def test_listing_soft_deactivated(self):
        db = _patch_db()
        uid = "usr_test"
        await db.users.insert_one({"user_id": uid, "email": "t@perix.app", "name": "T", "password_hash": "x", "created_at": _now_utc()})
        await db.listings.insert_one({"listing_id": "L1", "owner_id": uid, "seller_type": "user", "title": "X", "status": "published", "is_active": True, "listing_type": "product", "created_at": _now_utc(), "seller_id": uid})

        from services.entity_ownership import deactivate_user_content
        await deactivate_user_content(uid, reason="owner_account_deleted")

        l = await db.listings.find_one({"listing_id": "L1"})
        assert l["is_active"] is False
        assert l["status"] == "hidden"
        assert l["hidden_reason"] == "owner_account_deleted"

    async def test_idempotent_deactivation(self):
        db = _patch_db()
        uid = "usr_idem"
        await db.users.insert_one({"user_id": uid, "email": "i@perix.app", "name": "I", "password_hash": "x", "created_at": _now_utc()})
        await db.listings.insert_one({"listing_id": "L2", "owner_id": uid, "seller_type": "user", "title": "Y", "status": "published", "is_active": True, "listing_type": "product", "created_at": _now_utc(), "seller_id": uid})

        from services.entity_ownership import deactivate_user_content
        await deactivate_user_content(uid)
        await deactivate_user_content(uid)  # second run
        l = await db.listings.find_one({"listing_id": "L2"})
        assert l["is_active"] is False

    async def test_business_cascade(self):
        db = _patch_db()
        uid = "usr_biz"
        await db.users.insert_one({"user_id": uid, "email": "b@perix.app", "name": "B", "password_hash": "x", "created_at": _now_utc()})
        biz_id = "biz_1"
        await db.businesses.insert_one({"business_id": biz_id, "owner_id": uid, "name": "Biz", "root_category": "food", "subcategory": "italian", "address": "X", "latitude": 1, "longitude": 1, "category": "Food", "is_active": True, "is_hidden": False, "created_at": _now_utc(), "enabled_modules": {}, "subscription_status": "trial", "hours_configured": True})
        await db.services.insert_one({"service_id": "svc", "business_id": biz_id, "is_active": True, "name": "Svc", "type": "appointment", "status": "published", "created_at": _now_utc()})
        await db.jobs.insert_one({"job_id": "job", "business_id": biz_id, "is_active": True, "title": "Job", "created_at": _now_utc()})
        await db.events.insert_one({"event_id": "evt", "business_id": biz_id, "is_hidden": False, "title": "Evt", "start_time": _now_utc(), "created_at": _now_utc(), "creator_id": uid})

        from services.entity_ownership import deactivate_user_content
        await deactivate_user_content(uid)

        assert (await db.services.find_one({"service_id": "svc"}))["is_active"] is False
        assert (await db.jobs.find_one({"job_id": "job"}))["is_active"] is False
        assert (await db.events.find_one({"event_id": "evt"}))["is_hidden"] is True
        assert (await db.businesses.find_one({"business_id": biz_id}))["is_active"] is False

    async def test_artist_cascade(self):
        db = _patch_db()
        uid = "usr_art"
        await db.users.insert_one({"user_id": uid, "email": "a@perix.app", "name": "A", "password_hash": "x", "created_at": _now_utc()})
        art_id = "art_1"
        await db.artists.insert_one({"artist_id": art_id, "owner_id": uid, "name": "Art", "created_at": _now_utc()})
        await db.events.insert_one({"event_id": "evt_a", "artist_id": art_id, "is_hidden": False, "title": "AEvt", "start_time": _now_utc(), "created_at": _now_utc(), "creator_id": uid})
        await db.booking_requests.insert_one({"request_id": "br", "artist_id": art_id, "requester_id": "X", "status": "pending", "created_at": _now_utc()})

        from services.entity_ownership import deactivate_user_content
        await deactivate_user_content(uid)

        assert (await db.artists.find_one({"artist_id": art_id}))["is_hidden"] is True
        assert (await db.events.find_one({"event_id": "evt_a"}))["is_hidden"] is True
        assert (await db.booking_requests.find_one({"request_id": "br"}))["status"] == "cancelled"

    async def test_posts_stories_activities_hidden(self):
        db = _patch_db()
        uid = "usr_psa"
        await db.users.insert_one({"user_id": uid, "email": "p@perix.app", "name": "P", "password_hash": "x", "created_at": _now_utc()})
        await db.posts.insert_one({"post_id": "p1", "user_id": uid, "text": "hi", "created_at": _now_utc()})
        await db.stories.insert_one({"story_id": "s1", "user_id": uid, "created_at": _now_utc()})
        await db.activities.insert_one({"activity_id": "a1", "creator_id": uid, "title": "Run", "date": "2026-08-01", "time": "10:00", "location": "Park", "created_at": _now_utc()})

        from services.entity_ownership import deactivate_user_content
        await deactivate_user_content(uid)

        assert (await db.posts.find_one({"post_id": "p1"}))["is_hidden"] is True
        assert (await db.stories.find_one({"story_id": "s1"}))["is_hidden"] is True
        assert (await db.activities.find_one({"activity_id": "a1"}))["is_hidden"] is True

    async def test_ephemeral_cleanup(self):
        db = _patch_db()
        uid = "usr_eph"
        await db.users.insert_one({"user_id": uid, "email": "e@perix.app", "name": "E", "password_hash": "x", "created_at": _now_utc()})
        await db.push_tokens.insert_one({"user_id": uid, "token": "t"})
        await db.user_sessions.insert_one({"user_id": uid, "session_token": "s", "expires_at": _now_utc()})
        await db.friend_requests.insert_one({"from_user_id": uid, "to_user_id": "o", "status": "pending"})
        await db.saved_items.insert_one({"user_id": uid, "item_type": "post", "item_id": "x"})
        await db.notifications.insert_one({"user_id": uid, "text": "hi", "created_at": _now_utc()})

        from services.entity_ownership import cleanup_ephemeral_user_data
        await cleanup_ephemeral_user_data(uid)

        assert await db.push_tokens.count_documents({}) == 0
        assert await db.user_sessions.count_documents({}) == 0
        assert await db.friend_requests.count_documents({}) == 0
        assert await db.saved_items.count_documents({}) == 0
        assert await db.notifications.count_documents({}) == 0

    async def test_user_tombstone(self):
        db = _patch_db()
        uid = "usr_tomb"
        await db.users.insert_one({"user_id": uid, "email": "orig@perix.app", "name": "Orig", "password_hash": "x", "profile_photo": "p.jpg", "bio": "b", "created_at": _now_utc()})

        from services.entity_ownership import create_user_tombstone
        await create_user_tombstone(uid)

        u = await db.users.find_one({"user_id": uid})
        assert u["is_deleted"] is True
        assert u["deletion_pending"] is False
        assert u["email"].startswith("deleted+")
        assert u["name"] == "Deleted user"
        assert u["password_hash"] is None
        assert u["profile_photo"] is None
        assert u["bio"] is None

    async def test_email_can_receive_guard(self):
        from services.entity_ownership import can_receive_email
        assert can_receive_email({"email": "a@perix.app"}) is True
        assert can_receive_email({"is_deleted": True, "email": "x@perix.app"}) is False
        assert can_receive_email({"deletion_pending": True, "email": "x@perix.app"}) is False
        assert can_receive_email({"email": "x@deleted.perix.app"}) is False

    async def test_subscription_cancellation(self):
        db = _patch_db()
        uid = "usr_sub"
        await db.users.insert_one({"user_id": uid, "email": "s@perix.app", "name": "S", "password_hash": "x", "created_at": _now_utc()})
        await db.subscriptions.insert_one({"subscription_id": "s1", "user_id": uid, "paypal_subscription_id": "PP-X", "status": "active", "created_at": _now_utc()})
        await db.subscriptions.insert_one({"subscription_id": "s2", "user_id": uid, "status": "completed", "created_at": _now_utc()})

        from services.entity_ownership import cancel_user_subscriptions
        counts = await cancel_user_subscriptions(uid)
        assert counts["subscriptions_owner"] == 1
        s1 = await db.subscriptions.find_one({"subscription_id": "s1"})
        assert s1["status"] == "cancelled_deletion"
        assert s1["billing_status"] == "provider_not_configured"
        s2 = await db.subscriptions.find_one({"subscription_id": "s2"})
        assert s2["status"] == "completed"

    async def test_booking_requester_cancellation(self):
        db = _patch_db()
        uid = "usr_bk"
        await db.users.insert_one({"user_id": uid, "email": "bk@perix.app", "name": "BK", "password_hash": "x", "created_at": _now_utc()})
        await db.bookings.insert_one({"booking_id": "b1", "client_id": uid, "status": "confirmed", "created_at": _now_utc()})
        await db.bookings.insert_one({"booking_id": "b2", "client_id": uid, "status": "completed", "created_at": _now_utc()})
        await db.booking_requests.insert_one({"request_id": "br2", "requester_id": uid, "status": "pending", "created_at": _now_utc()})

        from services.entity_ownership import cancel_user_bookings_as_requester
        counts = await cancel_user_bookings_as_requester(uid)
        assert counts["bookings_as_client"] == 1
        b1 = await db.bookings.find_one({"booking_id": "b1"})
        assert b1["status"] == "cancelled"
        assert b1["cancel_reason"] == "requester_account_deleted"
        b2 = await db.bookings.find_one({"booking_id": "b2"})
        assert b2["status"] == "completed"
        br = await db.booking_requests.find_one({"request_id": "br2"})
        assert br["status"] == "cancelled"


@pytest.mark.asyncio
class TestAtomicLock:
    async def test_lock_acquired_then_rejected(self):
        db = _patch_db()
        uid = "usr_lock"
        await db.users.insert_one({"user_id": uid, "email": "lk@perix.app", "name": "LK", "password_hash": "x", "created_at": _now_utc()})

        from services.entity_ownership import acquire_deletion_lock
        l1 = await acquire_deletion_lock(uid)
        assert l1 is not None
        l2 = await acquire_deletion_lock(uid)
        assert l2 is None

    async def test_concurrent_lock_acquisition(self):
        db = _patch_db()
        uid = "usr_conc"
        await db.users.insert_one({"user_id": uid, "email": "cc@perix.app", "name": "CC", "password_hash": "x", "created_at": _now_utc()})

        from services.entity_ownership import acquire_deletion_lock
        r = await asyncio.gather(acquire_deletion_lock(uid), acquire_deletion_lock(uid))
        acquired = [x for x in r if x is not None]
        assert len(acquired) == 1, f"Exactly 1 should acquire, got {len(acquired)}"
        docs = await db.deletion_operations.find({"lock_key": "account_deletion:usr_conc"}).to_list(2)
        assert len(docs) == 1

    async def test_resume_failed_operation(self):
        db = _patch_db()
        uid = "usr_res"
        lk = "account_deletion:usr_res"
        await db.users.insert_one({"user_id": uid, "email": "rs@perix.app", "name": "RS", "password_hash": "x", "deletion_pending": True, "created_at": _now_utc()})
        await db.deletion_operations.insert_one({"lock_key": lk, "user_id": uid, "status": "failed", "completed_steps": ["personal_content"], "failed_step": "subscriptions", "last_error": "timeout", "started_at": _now_utc(), "updated_at": _now_utc()})
        await db.listings.insert_one({"listing_id": "Lr", "owner_id": uid, "seller_type": "user", "title": "R", "status": "published", "is_active": True, "listing_type": "product", "created_at": _now_utc(), "seller_id": uid})

        from services.entity_ownership import acquire_deletion_lock, record_deletion_step, complete_deletion_operation, deactivate_user_content
        l = await acquire_deletion_lock(uid)
        assert l is not None

        await deactivate_user_content(uid)
        await record_deletion_step(l, "personal_content")
        await record_deletion_step(l, "subscriptions")
        await record_deletion_step(l, "requester_bookings")
        await record_deletion_step(l, "ephemeral_cleanup")
        await record_deletion_step(l, "report_marking")
        await record_deletion_step(l, "relationship_cleanup")
        await record_deletion_step(l, "user_tombstone")
        await complete_deletion_operation(l)

        op = await db.deletion_operations.find_one({"lock_key": lk})
        assert op["status"] == "completed"

    async def test_completed_lock_rejected(self):
        db = _patch_db()
        uid = "usr_done"
        lk = "account_deletion:usr_done"
        await db.users.insert_one({"user_id": uid, "email": "dn@perix.app", "name": "DN", "password_hash": "x", "is_deleted": True, "created_at": _now_utc()})
        await db.deletion_operations.insert_one({"lock_key": lk, "user_id": uid, "status": "completed", "completed_steps": ["personal_content", "user_tombstone"], "started_at": _now_utc(), "updated_at": _now_utc()})

        from services.entity_ownership import acquire_deletion_lock
        l = await acquire_deletion_lock(uid)
        assert l is None
