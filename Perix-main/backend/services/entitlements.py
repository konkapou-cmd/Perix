"""Server-side entitlement resolver (policy v18, shadow mode).

Read-only snapshot per verified actor. Enforcement stays OFF until later
phases: every snapshot carries `enforcement_mode: "shadow"`.
The resolver is the single source of truth for plan limits; UI copies
(frontend/lib/constants/planLimits.ts) are indicative only.
"""
from datetime import datetime
from typing import Any, Dict, Optional

from database import db
from utils.helpers import now_utc
from utils.quota import (
    DEFAULT_PERIOD_ZONE,
    get_usage,
    next_period_start,
    period_key_for_month,
)

POLICY_VERSION = "v18"

PERSONAL_PLANS = ("free_user", "premium_user")

FREE_MESSAGE_LIMIT = 30
PREMIUM_MESSAGE_LIMIT = 200
FREE_CLASSIFIED_ADS = 3

POST_LIMITS = {"free_user": 3, "premium_user": 12, "business": 24}

GALLERY_PHOTO_LIMITS = {"free_user": 3, "premium_user": 12, "business": 30}
GALLERY_VIDEO_LIMITS = {"free_user": 0, "premium_user": 6, "business": 12}

PREMIUM_PERSONAL_PRODUCTS = 10
PREMIUM_PERSONAL_HOMES = 1

BUSINESS_PRODUCTS = 50
BUSINESS_SERVICES = 10
BUSINESS_MENU = 100
BUSINESS_PROPERTIES = 20
BUSINESS_HOTEL_TYPES = 10
BUSINESS_HOTEL_UNITS = 100
BUSINESS_VEHICLES = 50
BUSINESS_EVENTS = 4


def _parse_dt(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _iso(value: Any) -> Optional[str]:
    dt = _parse_dt(value)
    return dt.isoformat() if dt else None


def _personal_plan(user_doc: Dict) -> str:
    plan = user_doc.get("account_plan")
    return plan if plan in PERSONAL_PLANS else "free_user"


def _personal_limits(plan: str) -> Dict[str, Any]:
    return {
        "messages_per_month": FREE_MESSAGE_LIMIT if plan == "free_user" else PREMIUM_MESSAGE_LIMIT,
        "posts": POST_LIMITS[plan],
        "gallery_photos": GALLERY_PHOTO_LIMITS[plan],
        "gallery_videos": GALLERY_VIDEO_LIMITS[plan],
        "classified_ads": FREE_CLASSIFIED_ADS,
        "personal_products": 0 if plan == "free_user" else PREMIUM_PERSONAL_PRODUCTS,
        "personal_homes": 0 if plan == "free_user" else PREMIUM_PERSONAL_HOMES,
    }


def _business_limits() -> Dict[str, Any]:
    return {
        "messages_per_month": None,  # unlimited
        "posts": POST_LIMITS["business"],
        "gallery_photos": GALLERY_PHOTO_LIMITS["business"],
        "gallery_videos": GALLERY_VIDEO_LIMITS["business"],
        "products": BUSINESS_PRODUCTS,
        "services": BUSINESS_SERVICES,
        "menu_entries": BUSINESS_MENU,
        "properties": BUSINESS_PROPERTIES,
        "hotel_room_types": BUSINESS_HOTEL_TYPES,
        "hotel_physical_units": BUSINESS_HOTEL_UNITS,
        "vehicles_for_sale": BUSINESS_VEHICLES,
        "events": BUSINESS_EVENTS,
    }


async def build_entitlement_snapshot(
    actor_type: str,
    actor_id: str,
    owner_user: Any,
) -> Dict[str, Any]:
    """Compute the read-only entitlement snapshot for a verified actor.

    actor ownership is checked by the caller (routes/subscriptions.py).
    """
    period_key = period_key_for_month(now_utc(), DEFAULT_PERIOD_ZONE)
    base = {
        "policy_version": POLICY_VERSION,
        "enforcement_mode": "shadow",
        "actor_type": actor_type,
        "actor_id": actor_id,
        "period_key": period_key,
        "period_zone": DEFAULT_PERIOD_ZONE,
        "reason_codes": [],
    }

    if actor_type == "user":
        # v19: interim codes revert automatically if the profile stays
        # incomplete past the 2-day window.
        from utils.redemption import apply_due_reverts

        await apply_due_reverts(actor_id)
        user_doc = await db.users.find_one({"user_id": actor_id}, {"_id": 0})
        plan = _personal_plan(user_doc or {})
        limits = _personal_limits(plan)
        usage = await get_usage("user", actor_id, period_key)
        remaining = max(0, int(limits["messages_per_month"]) - usage)
        redeemed_codes = (user_doc or {}).get("redeemed_codes") or []
        redeemed_at = (user_doc or {}).get("redeemed_at")
        return {
            **base,
            "effective_plan": plan,
            "subscription_status": "premium" if plan == "premium_user" else "free",
            "founder_active": False,
            "founder_until": None,
            "limits": limits,
            "usage": {"messages_sent_month": usage},
            "remaining": {"messages": remaining},
            "next_reset_at": next_period_start(period_key, DEFAULT_PERIOD_ZONE).isoformat(),
            # v19: interim redemption codes (User100 / Pro100).
            "business_plan_grant": (user_doc or {}).get("business_plan_grant"),
            "redemption": (
                {
                    "code": redeemed_codes[-1],
                    "plan": "premium_user" if plan == "premium_user" else "business",
                    "redeemed_at": _iso(redeemed_at),
                    "profile_complete_deadline": _iso((user_doc or {}).get("profile_complete_deadline")),
                    "reverted": bool((user_doc or {}).get("redemption_reverted")),
                }
                if redeemed_codes and redeemed_at
                else None
            ),
        }

    business_doc = await db.businesses.find_one({"business_id": actor_id}, {"_id": 0})
    if not business_doc:
        return {
            **base,
            "effective_plan": None,
            "subscription_status": "missing",
            "founder_active": False,
            "founder_until": None,
            "limits": {},
            "usage": {},
            "remaining": {},
            "next_reset_at": None,
            "reason_codes": ["business_not_found"],
        }

    plan_type = business_doc.get("plan_type") or "business"
    founder_until = business_doc.get("free_until")
    founder_until_dt = _parse_dt(founder_until)
    founder_active = bool(plan_type == "founder" and founder_until_dt and founder_until_dt >= now_utc())

    # Founder protection (v18/D09): founder businesses are never auto-converted
    # to a chargeable plan. The snapshot reports the founder window; any future
    # review decision is a separate, explicit owner action.
    subscription_status = business_doc.get("subscription_status") or "active"

    # Read-only domain usage for the UI (enforcement stays off until Φ3 flag).
    from utils.business_quotas import QUOTAS, count_bucket, hotel_units_total
    usage = {}
    remaining = {}
    count_buckets = [
        "professional_service",
        "catalog_product",
        "menu_entry",
        "vehicle_inventory",
        "rental_inventory",
        "hospitality_inventory",
    ]
    for bucket in count_buckets:
        count = await count_bucket(actor_id, bucket)
        usage[bucket] = count
        remaining[bucket] = max(0, QUOTAS[bucket] - count)
    units = await hotel_units_total(actor_id)
    usage["hospitality_units"] = units
    remaining["hospitality_units"] = max(0, QUOTAS["hospitality_units"] - units)
    # Φ7 (policy v18): basic Business plan has 4 active events (read-only).
    from utils.events_policy import BUSINESS_ACTIVE_EVENTS, count_active_business_events
    active_events = await count_active_business_events(actor_id)
    usage["events"] = active_events
    remaining["events"] = max(0, BUSINESS_ACTIVE_EVENTS - active_events)
    usage["messages_sent_month"] = None  # business messaging is unlimited

    return {
        **base,
        "effective_plan": "business",
        "subscription_status": subscription_status,
        "founder_active": founder_active,
        "founder_until": founder_until_dt.isoformat() if founder_until_dt else None,
        "limits": _business_limits(),
        "usage": usage,
        "remaining": {"messages": None, "messages_unlimited": True, **remaining},
        "next_reset_at": next_period_start(period_key, DEFAULT_PERIOD_ZONE).isoformat(),
    }
