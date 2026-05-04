"""
Automatic cleanup utilities for old data.
- Activities/Events: Deleted after 1 day past their end time
- Posts: Deleted after 2 weeks
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from database import db

logger = logging.getLogger(__name__)

# Cleanup intervals
EVENT_CLEANUP_DAYS = 1  # Events older than 1 day after end_time
POST_CLEANUP_DAYS = 14  # Posts older than 2 weeks


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
    """Delete posts older than 2 weeks."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=POST_CLEANUP_DAYS)
    
    result = await db.posts.delete_many({
        "created_at": {"$lt": cutoff}
    })
    
    if result.deleted_count > 0:
        logger.info(f"Cleaned up {result.deleted_count} old posts")
    
    return result.deleted_count


async def run_cleanup():
    """Run all cleanup tasks."""
    logger.info("Starting automatic cleanup...")
    
    events_deleted = await cleanup_old_events()
    activities_deleted = await cleanup_old_activities()
    posts_deleted = await cleanup_old_posts()
    
    total = events_deleted + activities_deleted + posts_deleted
    if total > 0:
        logger.info(f"Cleanup complete: {events_deleted} events, {activities_deleted} activities, {posts_deleted} posts deleted")
    else:
        logger.info("Cleanup complete: No old data to remove")
    
    return {
        "events_deleted": events_deleted,
        "activities_deleted": activities_deleted,
        "posts_deleted": posts_deleted
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
        
        # For posts - TTL based on expires_at field (2 weeks from creation)
        await db.posts.create_index(
            "auto_expire_at",
            expireAfterSeconds=0,
            sparse=True,
            background=True
        )
        
        logger.info("TTL indexes created/verified")
    except Exception as e:
        logger.warning(f"Could not create TTL indexes: {e}")
