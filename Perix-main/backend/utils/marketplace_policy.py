"""Marketplace / listing policy (v18), feature-flagged.

- CLASSIFIED_AD_ENFORCEMENT=1 -> Free classified ads: max 3 active, 30 days
- PREMIUM_LIMITS_ENFORCEMENT=1 -> Premium: max 10 personal products, 1 home
"""
import os
from datetime import timedelta
from typing import Optional

from fastapi import HTTPException

from database import db
from utils.helpers import now_utc

CLASSIFIED_AD_ENFORCEMENT = os.environ.get("CLASSIFIED_AD_ENFORCEMENT", "0") == "1"
PREMIUM_LIMITS_ENFORCEMENT = os.environ.get("PREMIUM_LIMITS_ENFORCEMENT", "0") == "1"

FREE_CLASSIFIED_ADS = 3
CLASSIFIED_AD_DAYS = 30
PREMIUM_PERSONAL_PRODUCTS = 10
PREMIUM_PERSONAL_HOMES = 1

_PUBLISHED = {"status": "published", "is_active": True}


def personal_plan(user_doc: Optional[dict]) -> str:
    plan = (user_doc or {}).get("account_plan")
    return plan if plan in ("free_user", "premium_user") else "free_user"


def _active_or_unexpired(base: dict) -> dict:
    """Include an expiry condition only when expiry fields exist."""
    now = now_utc()
    return {
        **base,
        "$or": [
            {"expires_at": {"$gt": now}},
            {"expires_at": None},
            {"expires_at": {"$exists": False}},
        ],
    }


async def count_active_classified_ads(user_id: str) -> int:
    return await db.listings.count_documents(_active_or_unexpired({
        "owner_id": user_id,
        "listing_type": "product",
        "item_kind": "classified_ad",
        **_PUBLISHED,
    }))


async def count_active_personal_products(user_id: str) -> int:
    return await db.listings.count_documents(_active_or_unexpired({
        "owner_id": user_id,
        "seller_type": "user",
        "listing_type": "product",
        "item_kind": {"$ne": "classified_ad"},
        **_PUBLISHED,
    }))


async def count_active_personal_homes(user_id: str) -> int:
    return await db.listings.count_documents(_active_or_unexpired({
        "owner_id": user_id,
        "seller_type": "user",
        "listing_type": "home_rental",
        **_PUBLISHED,
    }))


def classified_ad_expiry():
    """Expiry for a new classified ad; None while the policy is disabled."""
    if not CLASSIFIED_AD_ENFORCEMENT:
        return None
    return now_utc() + timedelta(days=CLASSIFIED_AD_DAYS)


async def assert_classified_ad_ok(user_id: str) -> None:
    if not CLASSIFIED_AD_ENFORCEMENT:
        return
    current = await count_active_classified_ads(user_id)
    if current >= FREE_CLASSIFIED_ADS:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "QUOTA_REACHED",
                "bucket": "classified_ads",
                "limit": FREE_CLASSIFIED_ADS,
                "current": current,
            },
        )


async def assert_personal_product_ok(user_doc: Optional[dict]) -> None:
    if not PREMIUM_LIMITS_ENFORCEMENT:
        return
    if personal_plan(user_doc) != "premium_user":
        raise HTTPException(
            status_code=400,
            detail={"code": "PLAN_REQUIRED", "bucket": "personal_products"},
        )
    current = await count_active_personal_products((user_doc or {}).get("user_id", ""))
    if current >= PREMIUM_PERSONAL_PRODUCTS:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "QUOTA_REACHED",
                "bucket": "personal_products",
                "limit": PREMIUM_PERSONAL_PRODUCTS,
                "current": current,
            },
        )


async def assert_personal_home_ok(user_id: str) -> None:
    if not PREMIUM_LIMITS_ENFORCEMENT:
        return
    current = await count_active_personal_homes(user_id)
    if current >= PREMIUM_PERSONAL_HOMES:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "QUOTA_REACHED",
                "bucket": "personal_homes",
                "limit": PREMIUM_PERSONAL_HOMES,
                "current": current,
            },
        )
