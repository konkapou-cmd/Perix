"""Database connection and category management."""
from motor.motor_asyncio import AsyncIOMotorClient
from typing import Dict, List
from config import MONGO_URL, DB_NAME

# MongoDB client
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# Category data structures
CATEGORY_TREE: List[Dict] = []
CATEGORY_LOOKUP: Dict[str, Dict] = {}


async def _safe_create_index(collection, keys, **kwargs):
    """Create an index, silently skip if it fails (e.g. conflicting data)."""
    try:
        await collection.create_index(keys, **kwargs)
    except Exception:
        pass


async def create_indexes():
    """Create database indexes for better query performance."""
    # Users collection indexes
    await db.users.create_index("user_id", unique=True)
    await db.users.create_index("email", unique=True)
    
    # Posts collection indexes
    await db.posts.create_index([("created_at", -1)])
    await db.posts.create_index("user_id")
    await db.posts.create_index([("user_id", 1), ("actor_type", 1), ("created_at", -1)])
    
    # Messages collection indexes
    await db.messages.create_index([("from_user_id", 1), ("to_user_id", 1)])
    await db.messages.create_index([("to_user_id", 1), ("read", 1)])
    await db.messages.create_index([("created_at", -1)])
    
    # Businesses collection indexes
    await db.businesses.create_index("business_id", unique=True)
    await db.businesses.create_index("owner_id")
    # 2dsphere removed — not supported by FerretDB
    
    # Artists collection indexes
    await db.artists.create_index("artist_id", unique=True)
    await db.artists.create_index("user_id")
    # 2dsphere removed — not supported by FerretDB
    
    # Calls collection indexes
    await db.calls.create_index("caller_id")
    await db.calls.create_index("callee_id")
    await db.calls.create_index([("created_at", -1)])
    
    # Events collection indexes
    await db.events.create_index([("start_date", -1)])
    await db.events.create_index("business_id")
    
    # Story views collection indexes (for analytics)
    await db.story_views.create_index("story_id")
    await db.story_views.create_index([("story_id", 1), ("viewed_at", -1)])
    await db.story_views.create_index([("user_id", 1), ("viewed_at", -1)])
    
    # Story reactions collection indexes
    await db.story_reactions.create_index("story_id")
    await db.story_reactions.create_index([("story_id", 1), ("user_id", 1)])

    # Saved items collection indexes
    await db.saved_items.create_index(
        [("user_id", 1), ("item_type", 1), ("item_id", 1)],
        unique=True,
    )

    # Session token index for auth lookups
    await db.users.create_index("session_token")

    # Event ID unique index
    await db.events.create_index("event_id", unique=True)

    # Activity ID unique index
    await db.activities.create_index("activity_id", unique=True)
    await db.activities.create_index("creator_id")
    # Activities store location as address string; geo filtering uses
    # Python-side haversine on latitude/longitude fields, so no 2dsphere.

    # Job indexes
    await db.jobs.create_index("job_id", unique=True)
    await db.jobs.create_index("business_id")
    # Jobs store location as address string; geo filtering uses
    # Python-side haversine on latitude/longitude fields, so no 2dsphere.

    # Business slug index
    await db.businesses.create_index("slug")

    # Message conversation indexes
    await db.conversations.create_index([("user_ids", 1)])
    await db.conversations.create_index([("updated_at", -1)])

    # Activity & event message indexes for group chat
    await db.activity_messages.create_index("activity_id")
    await db.activity_messages.create_index([("activity_id", 1), ("created_at", -1)])
    await db.event_messages.create_index("event_id")
    await db.event_messages.create_index([("event_id", 1), ("created_at", -1)])

    # Push tokens index
    await db.push_tokens.create_index("user_id")

    # Notification indexes
    await db.notifications.create_index("user_id")
    await db.notifications.create_index([("user_id", 1), ("read", 1)])

    # Friend requests indexes
    await db.friend_requests.create_index([("to_user_id", 1), ("status", 1)])
    await db.friend_requests.create_index([("from_user_id", 1), ("status", 1)])

    # Job applications index
    await db.job_applications.create_index("job_id")
    await db.job_applications.create_index("user_id")

    # Stories indexes
    await db.stories.create_index("actor_id")
    await db.stories.create_index([("actor_id", 1), ("actor_type", 1)])
    await db.stories.create_index([("expires_at", 1)])

    # Seen notifications index
    await db.seen_notifications.create_index("user_id")

    # Event reminders index
    await db.event_reminders.create_index([("user_id", 1), ("status", 1)])
    await db.event_reminders.create_index([("status", 1), ("remind_at", 1)])


def build_category_tree() -> None:
    """Build hardcoded category structure with all events enabled."""
    global CATEGORY_TREE, CATEGORY_LOOKUP

    def make_modules():
        return {
            "events": True,
            "tickets": True,
            "jobs": True,
            "bookings": True,
            "rentals": False,
            "gym": False,
            "salon": False,
        }

    CATEGORIES = [
        {
            "name": "🟢 Sports & Wellness",
            "slug": "sports-wellness",
            "subcategories": [
                "gyms", "team-sports", "racket-sports", "martial-arts",
                "swimming", "crossfit-functional", "extreme-sports",
                "dance", "personal-training", "wellness-rehabilitation"
            ]
        },
        {
            "name": "👕 Fashion & Retail",
            "slug": "fashion-retail",
            "subcategories": [
                "casual-wear", "formal-wear", "sportswear", "footwear",
                "accessories", "childrens-clothing", "vintage-thrift",
                "tailoring-custom", "bags-leather-goods"
            ]
        },
        {
            "name": "🎭 Entertainment",
            "slug": "entertainment",
            "subcategories": [
                "cinema", "theatre", "bowling", "escape-rooms",
                "vr-gaming", "stand-up-comedy", "indoor-playgrounds",
                "arcade", "event-venues", "exhibitions-cultural"
            ]
        },
        {
            "name": "🍸 Bars & Nightlife",
            "slug": "bars-nightlife",
            "subcategories": [
                "cocktail-bars", "wine-bars", "beer-bars", "rock-bars",
                "jazz-bars", "clubs-dj", "live-folk-music", "sports-bars",
                "activity-bars", "rooftop-bars", "beach-bars", "after-hours"
            ]
        },
        {
            "name": "🏢 Professional Services",
            "slug": "professional-services",
            "subcategories": [
                "law-firms", "accounting", "real-estate", "travel-agencies",
                "insurance", "consulting", "marketing-digital",
                "it-services", "translation-services"
            ]
        },
        {
            "name": "💄 Beauty & Personal Care",
            "slug": "beauty-care",
            "subcategories": [
                "hair-salons", "barbershops", "nail-salons", "spas",
                "dermatology-laser", "makeup-services",
                "facial-body-treatments", "tanning-salons"
            ]
        },
        {
            "name": "🎓 Education & Creativity",
            "slug": "education-creativity",
            "subcategories": [
                "tutoring", "language-schools", "music-schools",
                "dance-schools", "art-workshops"
            ]
        },
        {
            "name": "🍽️ Restaurants",
            "slug": "restaurants",
            "subcategories": [
                "italian", "asian", "greek", "balkan",
                "german", "african", "american", "arabic"
            ]
        },
        {
            "name": "🏠 Rental & Real Estate",
            "slug": "rental-real-estate",
            "subcategories": [
                "apartments", "houses", "studios", "rooms",
                "commercial-spaces"
            ]
        },
    ]

    roots: Dict[str, Dict] = {}
    lookup: Dict[str, Dict] = {}

    for cat in CATEGORIES:
        root_slug = cat["slug"]
        root_name = cat["name"]

        roots[root_slug] = {
            "name": root_name,
            "slug": root_slug,
            "subcategories": [],
        }

        for sub_slug in cat["subcategories"]:
            sub_name = sub_slug.replace("-", " ").title()
            modules = make_modules()
            if root_slug == "rental-real-estate":
                modules["rentals"] = True
            tools = [key for key, value in modules.items() if value]

            subcategory = {
                "name": sub_name,
                "slug": sub_slug,
                "modules": modules,
                "tools": tools,
            }
            roots[root_slug]["subcategories"].append(subcategory)
            lookup[sub_slug] = {
                **subcategory,
                "root_slug": root_slug,
                "root_name": root_name,
            }

    CATEGORY_TREE = list(roots.values())
    CATEGORY_LOOKUP = lookup
