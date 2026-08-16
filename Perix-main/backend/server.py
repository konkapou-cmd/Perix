"""
Perix - City Social Media API
Refactored modular architecture - February 2026
Deploy marker 2026-08-16c: City Ad publish fixes — idempotent story/post creation (client_request_id),
Mux SDK calls moved off the event loop (asyncio.to_thread), /stories/my-stories route order fix,
feed excludes stories without media_url — trigger Railway deploy
"""
import asyncio
import time
from collections import defaultdict
from fastapi import FastAPI, Request, HTTPException, Depends, Query
from routes.dependencies import get_current_user
from models.user import UserPublic
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
    return {"deployed": True, "commit": os.getenv("APP_COMMIT_SHA", "unknown")}


@app.post("/api/admin/transfer-marketplace")
async def transfer_marketplace(
    source_user_id: str = Query(..., description="Source account ID (deleted/orphaned user)"),
    destination_user_id: str = Query(..., description="Destination account ID (receives listings)"),
    dry_run: bool = Query(True, description="Preview without making changes"),
    confirm: bool = Query(False, description="Required for non-dry-run execution"),
    current_user: UserPublic = Depends(get_current_user),
):
    """Admin-only: Transfer orphan listings and repair missing canonical fields.

    - Transfers listings owned by source_user_id to destination_user_id
    - Sets complete canonical fields: seller_id, seller_type, publication_scope
    - Preserves existing listing_type (only defaults to "product" when missing)
    - Also repairs already-transferred listings with missing ownership fields
    """
    from routes.admin import verify_admin
    from datetime import datetime, timezone
    import uuid

    await verify_admin(current_user)

    if not dry_run and not confirm:
        raise HTTPException(status_code=400, detail="Set confirm=true for non-dry-run execution")

    now = datetime.now(timezone.utc)
    audit_id = str(uuid.uuid4())

    # Transfer orphan personal listings: source → destination
    transfer_candidates = await db.listings.find(
        {
            "seller_type": {"$in": ["user", None]},
            "is_active": True,
            "$or": [
                {"seller_id": source_user_id},
                {"owner_id": source_user_id},
            ],
        },
        {"listing_id": 1, "title": 1, "listing_type": 1},
    ).to_list(500)

    transferred_ids = []
    for l in transfer_candidates:
        if not dry_run:
            update_fields = {
                "owner_id": destination_user_id,
                "seller_id": destination_user_id,
                "seller_type": "user",
                "status": "published",
                "is_hidden": False,
                "is_active": True,
                "publication_scope": "profile_and_marketplace",
                "updated_at": now,
            }
            if not l.get("listing_type"):
                update_fields["listing_type"] = "product"
            await db.listings.update_one(
                {"listing_id": l["listing_id"]},
                {"$set": update_fields},
            )
        transferred_ids.append(l["listing_id"])

    # Repair already-transferred listings with missing canonical ownership fields
    repair_candidates = await db.listings.find(
        {
            "owner_id": destination_user_id,
            "$or": [
                {"seller_id": {"$exists": False}},
                {"seller_id": None},
                {"seller_type": {"$exists": False}},
                {"seller_type": None},
                {"publication_scope": {"$exists": False}},
                {"publication_scope": None},
            ],
        },
        {"listing_id": 1, "title": 1, "listing_type": 1},
    ).to_list(500)

    repaired_ids = []
    for l in repair_candidates:
        if not dry_run:
            update_fields = {
                "seller_id": destination_user_id,
                "seller_type": "user",
                "publication_scope": "profile_and_marketplace",
                "status": "published",
                "is_hidden": False,
                "is_active": True,
                "updated_at": now,
            }
            if not l.get("listing_type"):
                update_fields["listing_type"] = "product"
            await db.listings.update_one(
                {"listing_id": l["listing_id"]},
                {"$set": update_fields},
            )
        repaired_ids.append(l["listing_id"])

    return {
        "dry_run": dry_run,
        "audit_id": audit_id,
        "source_user_id": source_user_id,
        "destination_user_id": destination_user_id,
        "transferred": {
            "count": len(transferred_ids),
            "listing_ids": transferred_ids,
        },
        "repaired": {
            "count": len(repaired_ids),
            "listing_ids": repaired_ids,
        },
    }


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
