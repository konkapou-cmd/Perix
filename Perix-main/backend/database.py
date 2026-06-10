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
            "services": True,
            "menu": False,
            "rentals": False,
            "gym": False,
            "salon": False,
        }

    CATEGORIES = [
        {
            "name": "🏃 Sports, Fitness & Wellness",
            "slug": "sports-fitness-wellness",
            "groups": [
                {
                    "name": "Fitness",
                    "slug": "fitness",
                    "subcategories": ["gyms", "crossfit", "functional-training", "personal-training", "pilates", "yoga", "group-fitness"],
                },
                {
                    "name": "Sports",
                    "slug": "sports",
                    "subcategories": ["team-sports", "racket-sports", "swimming", "martial-arts", "climbing", "cycling", "running-clubs", "water-sports", "winter-sports", "extreme-sports"],
                },
                {
                    "name": "Wellness & Recovery",
                    "slug": "wellness-recovery",
                    "subcategories": ["physiotherapy", "rehabilitation", "sports-massage", "recovery-centers", "wellness-centers", "meditation"],
                },
            ],
        },
        {
            "name": "👕 Fashion & Accessories",
            "slug": "fashion-accessories",
            "groups": [
                {
                    "name": "Clothing",
                    "slug": "clothing",
                    "subcategories": ["casual-wear", "formal-wear", "sportswear", "childrens-clothing", "vintage-thrift"],
                },
                {
                    "name": "Footwear",
                    "slug": "footwear",
                    "subcategories": ["sneakers", "formal-shoes", "athletic-footwear"],
                },
                {
                    "name": "Accessories",
                    "slug": "accessories",
                    "subcategories": ["jewelry", "watches", "sunglasses", "fashion-accessories"],
                },
                {
                    "name": "Specialty",
                    "slug": "specialty",
                    "subcategories": ["tailoring-custom", "bags-leather-goods", "luxury-fashion"],
                },
            ],
        },
        {
            "name": "🎭 Entertainment & Events",
            "slug": "entertainment-events",
            "groups": [
                {
                    "name": "Experiences",
                    "slug": "experiences",
                    "subcategories": ["cinema", "theatre", "stand-up-comedy", "cultural-events", "exhibitions"],
                },
                {
                    "name": "Gaming & Activities",
                    "slug": "gaming-activities",
                    "subcategories": ["escape-rooms", "vr-gaming", "arcades", "bowling", "billiards"],
                },
                {
                    "name": "Family Entertainment",
                    "slug": "family-entertainment",
                    "subcategories": ["indoor-playgrounds", "family-activity-centers"],
                },
                {
                    "name": "Venues",
                    "slug": "venues",
                    "subcategories": ["event-venues", "concert-halls"],
                },
                {
                    "name": "Artists & Performers",
                    "slug": "artists-performers",
                    "subcategories": ["djs", "bands", "singers", "comedians", "magicians", "dancers", "actors", "mcs-hosts", "cultural-groups"],
                },
            ],
        },
        {
            "name": "🍸 Nightlife & Social",
            "slug": "nightlife-social",
            "groups": [
                {
                    "name": "Bars",
                    "slug": "bars",
                    "subcategories": ["cocktail-bars", "wine-bars", "beer-bars", "sports-bars"],
                },
                {
                    "name": "Music Venues",
                    "slug": "music-venues",
                    "subcategories": ["rock-bars", "jazz-bars", "live-folk-music", "live-music-venues"],
                },
                {
                    "name": "Clubs",
                    "slug": "clubs",
                    "subcategories": ["dj-clubs", "dance-clubs", "after-hours-clubs"],
                },
            ],
        },
        {
            "name": "🏢 Professional Services",
            "slug": "professional-services",
            "groups": [
                {
                    "name": "Legal & Financial",
                    "slug": "legal-financial",
                    "subcategories": ["law-firms", "accounting", "tax-services", "insurance"],
                },
                {
                    "name": "Consulting & Marketing",
                    "slug": "consulting-marketing",
                    "subcategories": ["consulting", "marketing-digital", "translation-services"],
                },
                {
                    "name": "Tech & IT",
                    "slug": "tech-it",
                    "subcategories": ["it-services", "software-development", "web-design"],
                },
                {
                    "name": "Real Estate",
                    "slug": "real-estate",
                    "subcategories": ["real-estate-agents", "property-management"],
                },
            ],
        },
        {
            "name": "💄 Beauty & Personal Care",
            "slug": "beauty-care",
            "groups": [
                {
                    "name": "Hair",
                    "slug": "hair",
                    "subcategories": ["hair-salons", "barbershops"],
                },
                {
                    "name": "Nails & Skin",
                    "slug": "nails-skin",
                    "subcategories": ["nail-salons", "dermatology-laser", "facial-body-treatments"],
                },
                {
                    "name": "Wellness",
                    "slug": "wellness-beauty",
                    "subcategories": ["spas", "makeup-services", "tanning-salons"],
                },
            ],
        },
        {
            "name": "🎓 Education & Creativity",
            "slug": "education-creativity",
            "groups": [
                {
                    "name": "Academic",
                    "slug": "academic",
                    "subcategories": ["tutoring", "language-schools"],
                },
                {
                    "name": "Creative",
                    "slug": "creative",
                    "subcategories": ["music-schools", "dance-schools", "art-workshops"],
                },
            ],
        },
        {
            "name": "🍽️ Food & Dining",
            "slug": "food-dining",
            "groups": [
                {
                    "name": "Restaurant Types",
                    "slug": "restaurant-types",
                    "subcategories": ["casual-dining", "fine-dining", "fast-casual", "buffet", "food-courts"],
                },
                {
                    "name": "Cuisine",
                    "slug": "cuisine",
                    "subcategories": ["italian", "asian", "greek", "balkan", "german", "african", "american", "arabic", "japanese", "chinese", "korean", "thai", "mexican", "indian", "mediterranean"],
                },
                {
                    "name": "Specialty",
                    "slug": "specialty",
                    "subcategories": ["seafood", "steakhouse", "vegan", "vegetarian", "brunch", "pizza", "burger"],
                },
                {
                    "name": "Drinks & Cafés",
                    "slug": "drinks-cafes",
                    "subcategories": ["cafes", "coffee-shops", "bakeries"],
                },
            ],
        },
        {
            "name": "🏠 Rentals",
            "slug": "rentals",
            "groups": [
                {
                    "name": "Rentals",
                    "slug": "rentals",
                    "subcategories": ["apartments", "houses", "studios", "rooms", "commercial-spaces"],
                },
            ],
        },
        {
            "name": "🛒 Shopping & Retail",
            "slug": "shopping-retail",
            "groups": [
                {
                    "name": "Shopping & Retail",
                    "slug": "shopping-retail",
                    "subcategories": ["electronics", "home-goods", "furniture", "books-stationery", "florists", "gifts-souvenirs"],
                },
            ],
        },
        {
            "name": "🚗 Automotive",
            "slug": "automotive",
            "groups": [
                {
                    "name": "Automotive",
                    "slug": "automotive",
                    "subcategories": ["car-dealers", "car-rentals", "repair-shops", "car-washes"],
                },
            ],
        },
        {
            "name": "🏥 Healthcare",
            "slug": "healthcare",
            "groups": [
                {
                    "name": "Healthcare",
                    "slug": "healthcare",
                    "subcategories": ["doctors", "dentists", "clinics", "pharmacies", "mental-health"],
                },
            ],
        },
        {
            "name": "🐾 Pets",
            "slug": "pets",
            "groups": [
                {
                    "name": "Pets",
                    "slug": "pets",
                    "subcategories": ["veterinarians", "pet-grooming", "pet-supplies"],
                },
            ],
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
            "groups": [],
        }

        for group in cat.get("groups", []):
            group_slug = group["slug"]
            group_name = group["name"]
            group_subs = []

            for sub_slug in group["subcategories"]:
                sub_name = sub_slug.replace("-", " ").title()
                modules = make_modules()
                if root_slug in ("rentals", "rental-real-estate"):
                    modules["rentals"] = True
                if root_slug == "sports-fitness-wellness":
                    modules["gym"] = True
                if root_slug == "beauty-care":
                    modules["salon"] = True
                if root_slug == "food-dining":
                    modules["menu"] = True
                tools = [key for key, value in modules.items() if value]

                subcategory = {
                    "name": sub_name,
                    "slug": sub_slug,
                    "group_slug": group_slug,
                    "group_name": group_name,
                    "modules": modules,
                    "tools": tools,
                }
                group_subs.append(subcategory)
                lookup[sub_slug] = {
                    **subcategory,
                    "root_slug": root_slug,
                    "root_name": root_name,
                }

            roots[root_slug]["groups"].append({
                "name": group_name,
                "slug": group_slug,
                "subcategories": group_subs,
            })

    CATEGORY_TREE = list(roots.values())
    CATEGORY_LOOKUP = lookup
