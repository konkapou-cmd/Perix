"""Routes package - all API route modules."""
from fastapi import APIRouter

from routes.auth import router as auth_router
from routes.posts import router as posts_router
from routes.messages import router as messages_router
from routes.businesses import router as businesses_router
from routes.artists import router as artists_router
from routes.events import router as events_router
from routes.activities import router as activities_router
from routes.profiles import router as profiles_router
from routes.subscriptions import router as subscriptions_router
from routes.feed import router as feed_router
from routes.notifications import router as notifications_router
from routes.media import router as media_router
from routes.categories import router as categories_router
from routes.calls import router as calls_router
from routes.uploads import router as uploads_router
from routes.jobs import router as jobs_router
from routes.admin import router as admin_router
from routes.search import router as search_router
from routes.music import router as music_router
from routes.friend_requests import router as friend_requests_router
from routes.contacts import router as contacts_router
from routes.analytics import router as analytics_router
from routes.preview import router as preview_router
from routes.stripe_subscriptions import router as stripe_router
from routes.saved import router as saved_router
from routes.stories import router as stories_router
from routes.story_analytics import router as story_analytics_router
from routes.ws import router as ws_router
from routes.rentals import router as rentals_router
from routes.services import router as services_router
from routes.places import router as places_router
from routes.mux import router as mux_router

# Create main API router
api_router = APIRouter(prefix="/api")

# Include all route modules
api_router.include_router(auth_router)
api_router.include_router(posts_router)
api_router.include_router(messages_router)
api_router.include_router(businesses_router)
api_router.include_router(artists_router)
api_router.include_router(events_router)
api_router.include_router(activities_router)
api_router.include_router(profiles_router)
api_router.include_router(subscriptions_router)
api_router.include_router(feed_router)
api_router.include_router(notifications_router)
api_router.include_router(media_router)
api_router.include_router(categories_router)
api_router.include_router(calls_router)
api_router.include_router(uploads_router)
api_router.include_router(jobs_router)
api_router.include_router(admin_router)
api_router.include_router(search_router)
api_router.include_router(music_router)
api_router.include_router(friend_requests_router)
api_router.include_router(contacts_router)
api_router.include_router(analytics_router)
api_router.include_router(preview_router)
api_router.include_router(stripe_router)
api_router.include_router(saved_router)
api_router.include_router(stories_router)
api_router.include_router(story_analytics_router)
api_router.include_router(ws_router)
api_router.include_router(rentals_router)
api_router.include_router(services_router)
api_router.include_router(places_router)
api_router.include_router(mux_router)


@api_router.get("/")
async def root():
    return {"message": "Perix - City Social Media API"}
