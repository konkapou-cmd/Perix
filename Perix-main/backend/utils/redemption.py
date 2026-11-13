"""Redemption codes (v19 interim access, no payment yet).

We distribute two codes instead of charging until Stripe billing lands:
- "User100" -> Premium plan for the user account (first 100 redemptions)
- "Pro100"  -> Business plan grant, applied when the business is created
Redeeming starts a 2-day window to complete the profile (trust & safety:
we advise members to use their own photo). If the profile is not completed
within the window, the granted plan reverts. A code can never be redeemed
twice by the same email — not even from a new account.
"""
from datetime import timedelta
from typing import Any, Dict, Optional

from database import db
from utils.helpers import now_utc

# code -> {"plan": target, "max_uses": redemptions allowed}
REDEMPTION_CODES = {
    "User100": {"plan": "premium_user", "max_uses": 100},
    "Pro100": {"plan": "business", "max_uses": 100},
}

PROFILE_DEADLINE_DAYS = 2

POLICY_VERSION = "v19"


def _parse_dt(value: Any):
    from datetime import datetime

    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


async def _user_posts_count(user_id: str) -> int:
    return await db.posts.count_documents({"actor_type": "user", "actor_id": user_id})


async def _profile_complete(user: Dict) -> bool:
    """v19 complete Premium profile: own photo, bio, cover, 3 gallery photos,
    1 post and a verified email (confirmed during registration)."""
    has_photo = bool(user.get("profile_photo") or user.get("picture"))
    has_bio = bool(user.get("bio"))
    has_cover = bool(user.get("cover_photo"))
    gallery = user.get("gallery_images") or []
    posts = await _user_posts_count(user.get("user_id", ""))
    email_verified = bool(user.get("email_verified"))
    return (
        has_photo
        and has_bio
        and has_cover
        and len(gallery) >= 3
        and posts >= 1
        and email_verified
    )


def _business_complete(business: Dict, posts_count: int) -> bool:
    """v19 complete Business profile: photo, cover, category, address, opening
    hours, 6 gallery photos and 1 post."""
    has_photo = bool(business.get("logo_image") or business.get("profile_photo"))
    has_cover = bool(business.get("cover_image"))
    has_category = bool(business.get("category"))
    has_address = bool(business.get("address"))
    has_hours = bool(business.get("opening_hours"))
    gallery = business.get("gallery_images") or []
    return (
        has_photo
        and has_cover
        and has_category
        and has_address
        and has_hours
        and len(gallery) >= 6
        and posts_count >= 1
    )


async def ensure_redemption_codes() -> None:
    """Create the two code documents once (idempotent)."""
    for code, cfg in REDEMPTION_CODES.items():
        await db.redemption_codes.update_one(
            {"code": code},
            {
                "$setOnInsert": {
                    "code": code,
                    "plan": cfg["plan"],
                    "max_uses": cfg["max_uses"],
                    "used_count": 0,
                    "active": True,
                    "created_at": now_utc(),
                }
            },
            upsert=True,
        )


async def apply_due_reverts(user_id: str) -> Optional[str]:
    """Revert a granted plan when the 2-day window passed and the profile is
    still incomplete. Returns the reverted code, or None."""
    user = await db.users.find_one({"user_id": user_id})
    if not user or user.get("redemption_reverted"):
        return None
    deadline = _parse_dt(user.get("profile_complete_deadline"))
    if not deadline or deadline > now_utc():
        return None

    redeemed = user.get("redeemed_codes") or []
    last_code = redeemed[-1] if redeemed else None
    cfg = REDEMPTION_CODES.get(last_code)

    if cfg and cfg["plan"] == "premium_user":
        if await _profile_complete(user):
            return None
    elif cfg and cfg["plan"] == "business":
        # Complete Business profile: photo, cover, category, address, hours,
        # 6 gallery photos and 1 post. No founder downgrade anymore — the
        # granted business keeps its plan; only the grant itself is revoked.
        business = await db.businesses.find_one(
            {"owner_id": user_id}, {"_id": 0}
        )
        if not business:
            return None
        posts = await db.posts.count_documents(
            {"actor_type": "business", "actor_id": business.get("business_id", "")}
        )
        if _business_complete(business, posts):
            return None
    else:
        return None

    update: Dict[str, Any] = {
        "redemption_reverted": True,
        "redemption_reverted_at": now_utc(),
    }
    if cfg["plan"] == "premium_user":
        update["account_plan"] = "free_user"
    else:
        update["business_plan_grant"] = None
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": update, "$unset": {"profile_complete_deadline": ""}},
    )
    return last_code


async def redeem_code(user_id: str, email: str, raw_code: str) -> Dict[str, Any]:
    code = (raw_code or "").strip()
    cfg = REDEMPTION_CODES.get(code)
    if not cfg:
        return {
            "ok": False,
            "error": "invalid_code",
            "message": "Ο κωδικός δεν είναι έγκυρος.",
        }

    await ensure_redemption_codes()

    user = await db.users.find_one({"user_id": user_id})
    if not user:
        return {
            "ok": False,
            "error": "user_not_found",
            "message": "Δεν βρέθηκε ο λογαριασμός.",
        }

    normalized_email = (email or "").strip().lower()
    # The same email can never redeem the same code again — not even from a
    # new account.
    if normalized_email:
        used_by_email = await db.users.find_one(
            {"email": normalized_email, "redeemed_codes": code},
            {"_id": 1},
        )
        if used_by_email:
            return {
                "ok": False,
                "error": "already_redeemed",
                "message": "Ο κωδικός έχει ήδη χρησιμοποιηθεί από αυτό το email.",
            }

    already = user.get("redeemed_codes") or []
    if code in already:
        return {
            "ok": False,
            "error": "already_redeemed",
            "message": "Έχεις ήδη χρησιμοποιήσει αυτόν τον κωδικό.",
        }

    # Atomic claim for the first 100 uses; once used_count hits max_uses the
    # code stops matching and is considered expired.
    claim = await db.redemption_codes.update_one(
        {"code": code, "used_count": {"$lt": cfg["max_uses"]}},
        {"$inc": {"used_count": 1}},
    )
    if claim.modified_count == 0:
        return {
            "ok": False,
            "error": "exhausted",
            "message": "Ο κωδικός έχει εξαντληθεί (ισχύει για τους πρώτους 100).",
        }

    deadline = now_utc() + timedelta(days=PROFILE_DEADLINE_DAYS)
    update: Dict[str, Any] = {
        "redeemed_codes": already + [code],
        "redeemed_at": now_utc(),
        "profile_complete_deadline": deadline,
    }
    if cfg["plan"] == "premium_user":
        update["account_plan"] = "premium_user"
        plan_label = "Premium"
    else:
        update["business_plan_grant"] = "business"
        plan_label = "Business"

    await db.users.update_one({"user_id": user_id}, {"$set": update})

    return {
        "ok": True,
        "plan": plan_label,
        "code": code,
        "profile_complete_deadline": deadline.isoformat(),
        "message": (
            f"Ο κωδικός {code} ενεργοποίησε το {plan_label} πλάνο. "
            f"Έχεις {PROFILE_DEADLINE_DAYS} μέρες να ολοκληρώσεις το προφίλ σου, "
            "αλλιώς το πλάνο επιστρέφει αυτόματα."
        ),
    }
