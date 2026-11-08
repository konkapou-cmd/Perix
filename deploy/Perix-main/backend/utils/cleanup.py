"""
Automatic cleanup utilities for old data.
- Activities/Events: Deleted after 1 day past their end time
- Posts: NEVER auto-deleted (2-week rule removed per product decision)
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from database import db

logger = logging.getLogger(__name__)

# Cleanup intervals
EVENT_CLEANUP_DAYS = 1  # Events older than 1 day after end_time


async def cleanup_old_events():
    """Delete events that ended more than 1 day ago."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=EVENT_CLEANUP_DAYS)
    
    # Delete events where end_time or start_time (if no end_time) is older than cutoff
    result = await db.events.delete_many({
        "$or": [
            {"end_time": {"$lt": cutoff}},
            {"end_time": None, "start_time": {"$lt": cutoff}},
            {"end_time": {"$exists": False}, "start_time": {"$lt": cutoff}}
        ]
    })
    
    if result.deleted_count > 0:
        logger.info(f"Cleaned up {result.deleted_count} old events")
    
    return result.deleted_count


async def cleanup_old_activities():
    """Delete activities that ended more than 1 day ago."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=EVENT_CLEANUP_DAYS)
    
    # Delete activities where date + time is older than cutoff
    result = await db.activities.delete_many({
        "$or": [
            {"end_time": {"$lt": cutoff}},
            {"end_time": None, "date": {"$lt": cutoff}},
            {"end_time": {"$exists": False}, "date": {"$lt": cutoff}}
        ]
    })
    
    if result.deleted_count > 0:
        logger.info(f"Cleaned up {result.deleted_count} old activities")
    
    return result.deleted_count


async def cleanup_old_posts():
    """Posts are no longer auto-deleted (2-week rule removed)."""
    return 0


# Retention windows for account-deletion data (disclosed in the privacy policy)
DEACTIVATED_CONTENT_RETENTION_DAYS = 30  # hidden business/artist content purge
TOMBSTONE_RETENTION_DAYS = 365  # deleted-account technical records


async def purge_deactivated_content():
    """Permanently delete content that was deactivated by account deletion
    after the disclosed retention window (30 days), and delete old account
    tombstones after 12 months."""
    now = datetime.now(timezone.utc)
    content_cutoff = now - timedelta(days=DEACTIVATED_CONTENT_RETENTION_DAYS)
    tombstone_cutoff = now - timedelta(days=TOMBSTONE_RETENTION_DAYS)

    hidden_query = {"is_hidden": True, "owner_deleted_at": {"$lt": content_cutoff}}
    status_query = {
        "$or": [{"is_hidden": True}, {"status": "hidden"}],
        "owner_deleted_at": {"$lt": content_cutoff},
    }

    collections = [
        ("posts", "post_id", hidden_query),
        ("stories", "story_id", hidden_query),
        ("events", "event_id", hidden_query),
        ("activities", "activity_id", hidden_query),
        ("listings", "listing_id", status_query),
        ("services", "service_id", status_query),
        ("jobs", "job_id", status_query),
    ]
    purged = {}
    for name, id_field, query in collections:
        try:
            r = await getattr(db, name).delete_many(query)
            purged[name] = r.deleted_count
        except Exception as e:
            logger.warning(f"Purge {name} failed: {e}")

    try:
        r = await db.businesses.delete_many(hidden_query)
        purged["businesses"] = r.deleted_count
    except Exception as e:
        logger.warning(f"Purge businesses failed: {e}")

    try:
        r = await db.artists.delete_many(hidden_query)
        purged["artists"] = r.deleted_count
    except Exception as e:
        logger.warning(f"Purge artists failed: {e}")

    try:
        r = await db.users.delete_many(
            {"is_deleted": True, "deleted_at": {"$lt": tombstone_cutoff}}
        )
        purged["tombstones"] = r.deleted_count
    except Exception as e:
        logger.warning(f"Purge tombstones failed: {e}")

    if any(purged.values()):
        logger.info(f"Retention purge complete: {purged}")
    return purged


async def run_cleanup():
    """Run all cleanup tasks."""
    logger.info("Starting automatic cleanup...")
    
    events_deleted = await cleanup_old_events()
    activities_deleted = await cleanup_old_activities()
    posts_deleted = await cleanup_old_posts()
    purged = await purge_deactivated_content()
    
    total = events_deleted + activities_deleted + posts_deleted
    if total > 0:
        logger.info(f"Cleanup complete: {events_deleted} events, {activities_deleted} activities, {posts_deleted} posts deleted")
    else:
        logger.info("Cleanup complete: No old data to remove")
    
    return {
        "events_deleted": events_deleted,
        "activities_deleted": activities_deleted,
        "posts_deleted": posts_deleted,
        "retention_purged": purged,
    }


async def start_cleanup_scheduler(interval_hours: int = 6):
    """Start a background task that runs cleanup periodically."""
    while True:
        try:
            await run_cleanup()
        except Exception as e:
            logger.error(f"Cleanup task error: {e}")
        
        # Wait for next cleanup cycle
        await asyncio.sleep(interval_hours * 3600)


async def setup_ttl_indexes():
    """
    Create TTL indexes for automatic document expiration.
    Note: These are backup indexes - the main cleanup is done via run_cleanup()
    """
    try:
        # TTL index for stories (already expires via expires_at field)
        # Stories use their own expires_at field
        
        # For events - we'll use a cleanup_at field that we set
        # TTL index deletes documents when cleanup_at passes
        await db.events.create_index(
            "cleanup_at",
            expireAfterSeconds=0,
            sparse=True,
            background=True
        )
        
        # For activities
        await db.activities.create_index(
            "cleanup_at",
            expireAfterSeconds=0,
            sparse=True,
            background=True
        )
        
        # For posts - no TTL expiration (2-week rule removed).
        # Drop the legacy index if it exists so old posts never expire.
        try:
            await db.posts.drop_index("auto_expire_at_1")
        except Exception:
            pass

        logger.info("TTL indexes created/verified")
    except Exception as e:
        logger.warning(f"Could not create TTL indexes: {e}")
