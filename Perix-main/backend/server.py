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


@app.on_event("shutdown")
async def shutdown_db_client():
    """Clean up database connection and scheduler on shutdown."""
    scheduler.shutdown(wait=False)
    print("[Scheduler] Reminder scheduler stopped")
