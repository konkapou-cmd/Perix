"""
Perix - City Social Media API
Refactored modular architecture - February 2026
"""
import asyncio
import time
from collections import defaultdict
from fastapi import FastAPI, Request, HTTPException
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

import os
from database import db, build_category_tree, create_indexes
from routes import api_router
from utils.cleanup import run_cleanup, start_cleanup_scheduler, setup_ttl_indexes
from utils.push_notifications import send_event_reminder_notification


class RateLimiter:
    def __init__(self):
        self.requests: dict = defaultdict(list)

    def is_allowed(self, key: str, limit: int, window: int) -> bool:
        now = time.time()
        self.requests[key] = [t for t in self.requests[key] if now - t < window]
        if len(self.requests[key]) >= limit:
            return False
        self.requests[key].append(now)
        return True

rate_limiter = RateLimiter()

RATE_LIMITS = {
    "/api/auth/login": (30, 60),
    "/api/auth/register": (30, 60),
    "/api/auth/google-session": (5, 60),
    "/api/uploads/": (20, 60),
    "/api/media/": (20, 60),
    "/api/calls/initiate": (10, 60),
    "/api/messages/send": (30, 60),
}

DEFAULT_LIMIT = (60, 60)

# Initialize scheduler
scheduler = AsyncIOScheduler()

app = FastAPI(
    title="Perix - City Social Media API",
    description="""
## Social Media Platform for Businesses, Artists & Users

### Features:
- **Authentication**: Register, login, logout with session tokens
- **Posts**: Create, read, like, comment on posts with media support
- **Stories**: 24-hour ephemeral content
- **Businesses**: Business profiles with categories, events, fan gallery
- **Artists**: Artist profiles with genres, booking requests, fan gallery
- **Events**: Create and attend events
- **Activities**: Private activities with invitations
- **Messages**: Direct messaging between users
- **Feed**: Personalized home feed with location filtering

### Authentication:
All endpoints except `/api/auth/register` and `/api/auth/login` require authentication.
Use the session token in the `Authorization: Bearer <token>` header.
    """,
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# Rate limiting middleware
@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path
    client_ip = request.client.host if request.client else "unknown"

    limit, window = DEFAULT_LIMIT
    for prefix, cfg in RATE_LIMITS.items():
        if path.startswith(prefix):
            limit, window = cfg
            break

    key = f"{client_ip}:{path}"
    if not rate_limiter.is_allowed(key, limit, window):
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many requests. Please try again later."},
        )

    response = await call_next(request)
    return response

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the main API router
app.include_router(api_router)


@app.get("/api/ping-deploy")
async def ping_deploy():
    return {"deployed": True, "commit": "dbd5cf0"}


@app.post("/api/repair-orphans")
async def repair_orphans(dry_run: bool = True):
    from services.entity_ownership import repair_orphaned_entities
    result = await repair_orphaned_entities(dry_run=dry_run)
    return {"dry_run": dry_run, "checked": result.total_checked,
            "hidden": result.hidden, "by_collection": result.by_collection}


@app.post("/api/clean-marketplace")
async def clean_marketplace():
    """Transfer orphan personal listings to current user, hide business orphans."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    # Find all active user-listings whose owner doesn't exist or is deleted
    personal = await db.listings.find(
        {"seller_type": {"$in": ["user", None]}, "is_active": True},
        {"listing_id": 1, "owner_id": 1, "seller_id": 1, "title": 1}
    ).to_list(5000)

    owner_ids = list({(l.get("seller_id") or l.get("owner_id")) for l in personal if l.get("seller_id") or l.get("owner_id")})
    active_users = {u["user_id"] for u in await db.users.find(
        {"user_id": {"$in": owner_ids}, "is_deleted": {"$ne": True}}, {"user_id": 1}
    ).to_list(len(owner_ids))}

    transferred = 0
    hidden_biz = 0
    for l in personal:
        owner = l.get("seller_id") or l.get("owner_id")
        if owner and owner not in active_users:
            # Find the old user's email
            old_user = await db.users.find_one({"user_id": owner}, {"email": 1})
            if old_user and old_user.get("email") == "konkapou@gmail.com":
                await db.listings.update_one(
                    {"listing_id": l["listing_id"]},
                    {"$set": {"owner_id": "user_6577e46653dc",
                              "seller_id": "user_6577e46653dc",
                              "seller_type": "user",
                              "listing_type": l.get("listing_type") or "product",
                              "status": "published",
                              "is_hidden": False,
                              "is_active": True,
                              "updated_at": now}}
                )
                transferred += 1
            else:
                await db.listings.update_one(
                    {"listing_id": l["listing_id"]},
                    {"$set": {"is_active": False, "status": "hidden",
                              "hidden_reason": "orphaned_owner_missing", "updated_at": now}}
                )
                hidden_biz += 1

    # Hide business listings with missing/inactive businesses
    biz_listings = await db.listings.find(
        {"seller_type": "business", "is_active": True},
        {"listing_id": 1, "business_id": 1}
    ).to_list(5000)
    if biz_listings:
        biz_ids = list({l["business_id"] for l in biz_listings if l.get("business_id")})
        active_biz = {b["business_id"] for b in await db.businesses.find(
            {"business_id": {"$in": biz_ids}, "is_active": True, "is_hidden": {"$ne": True}},
            {"business_id": 1}
        ).to_list(len(biz_ids))}
        for l in biz_listings:
            if l.get("business_id") not in active_biz:
                await db.listings.update_one(
                    {"listing_id": l["listing_id"]},
                    {"$set": {"is_active": False, "status": "hidden",
                              "hidden_reason": "orphaned_business_missing", "updated_at": now}}
                )
                hidden_biz += 1

    return {"transferred_to_user": transferred, "hidden_orphans": hidden_biz}


# Reminder processing function
async def process_event_reminders():
    """Process and send all due event reminders."""
    from datetime import datetime, timezone
    
    try:
        current_time = datetime.now(timezone.utc).isoformat()
        
        # Find all pending reminders that are due
        due_reminders = await db.event_reminders.find({
            "status": "pending",
            "remind_at": {"$lte": current_time}
        }, {"_id": 0}).to_list(length=100)
        
        if not due_reminders:
            return
        
        print(f"[Reminder Scheduler] Processing {len(due_reminders)} due reminders...")
        
        sent_count = 0
        failed_count = 0
        
        for reminder in due_reminders:
            try:
                # Get user's push token
                user = await db.users.find_one(
                    {"user_id": reminder["user_id"]},
                    {"_id": 0, "push_token": 1, "name": 1}
                )
                
                if user and user.get("push_token"):
                    await send_event_reminder_notification(
                        push_token=user["push_token"],
                        event_title=reminder.get("event_title", "Event"),
                        event_id=reminder["event_id"],
                        reminder_id=reminder["reminder_id"]
                    )
                    
                    # Mark as sent
                    await db.event_reminders.update_one(
                        {"reminder_id": reminder["reminder_id"]},
                        {"$set": {
                            "status": "sent", 
                            "sent_at": current_time
                        }}
                    )
                    sent_count += 1
                    print(f"[Reminder] Sent reminder for event: {reminder.get('event_title')}")
                else:
                    # Mark as failed (no push token)
                    await db.event_reminders.update_one(
                        {"reminder_id": reminder["reminder_id"]},
                        {"$set": {"status": "failed", "error": "No push token"}}
                    )
                    failed_count += 1
                    
            except Exception as e:
                # Mark as failed
                await db.event_reminders.update_one(
                    {"reminder_id": reminder["reminder_id"]},
                    {"$set": {"status": "failed", "error": str(e)}}
                )
                failed_count += 1
                print(f"[Reminder] Failed to send: {e}")
        
        if sent_count > 0 or failed_count > 0:
            print(f"[Reminder Scheduler] Processed: {sent_count} sent, {failed_count} failed")
            
    except Exception as e:
        print(f"[Reminder Scheduler] Error: {e}")


@app.on_event("startup")
async def startup_db():
    """Initialize database and category tree on startup."""
    build_category_tree()
    # Create database indexes for better performance
    await create_indexes()
    # Setup TTL indexes for automatic document expiration
    await setup_ttl_indexes()
    # Run initial cleanup of old data
    await run_cleanup()
    # Backfill legacy services with missing status
    await migrate_service_status()
    # Start background cleanup scheduler (runs every 6 hours)
    asyncio.create_task(start_cleanup_scheduler(interval_hours=6))
    
    # Start the reminder scheduler (runs every minute)
    scheduler.add_job(
        process_event_reminders,
        IntervalTrigger(minutes=1),
        id="event_reminder_job",
        name="Process Event Reminders",
        replace_existing=True
    )
    scheduler.start()
    print("[Scheduler] Event reminder scheduler started (runs every 1 minute)")


async def migrate_service_status():
    """Backfill legacy services that have no status field."""
    try:
        result = await db.services.update_many(
            {
                "$or": [
                    {"status": {"$exists": False}},
                    {"status": None},
                ],
            },
            {"$set": {"status": "published"}},
        )
        if result.modified_count > 0:
            print(f"[Migration] Backfilled {result.modified_count} legacy services with status=published")
    except Exception as e:
        print(f"[Migration] Service status backfill failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    """Clean up database connection and scheduler on shutdown."""
    scheduler.shutdown(wait=False)
    print("[Scheduler] Reminder scheduler stopped")
