"""Business publication quotas (policy v18, feature-flagged).

Enforcement is OFF by default. Set QUOTA_ENFORCEMENT=1 to enable it.
All counts use active published records, so drafts never consume quota and
bookings/slots never add published offers.
"""
import os
from typing import Optional

from fastapi import HTTPException

from database import db

QUOTA_ENFORCEMENT = os.environ.get("QUOTA_ENFORCEMENT", "0") == "1"

QUOTAS = {
    "professional_service": 10,
    "catalog_product": 50,
    "menu_entry": 100,
    "vehicle_inventory": 50,
    "rental_inventory": 20,
    "hospitality_inventory": 10,
    "hospitality_units": 100,
}

# Types that never count as a professional service position.
SPECIAL_SERVICE_TYPES = {
    "menu_item",
    "auto_vehicle",
    "rental_property",
    "hotel_room",
    "retail_product",
    "pet_product",
}

_PUBLISHED = {"is_active": True, "status": "published", "is_hidden": {"$ne": True}}


def bucket_for_type(service_type: str) -> str:
    if service_type == "menu_item":
        return "menu_entry"
    if service_type == "auto_vehicle":
        return "vehicle_inventory"
    if service_type == "rental_property":
        return "rental_inventory"
    if service_type == "hotel_room":
        return "hospitality_inventory"
    if service_type in ("retail_product", "pet_product"):
        return "catalog_product"
    return "professional_service"


async def count_bucket(business_id: str, bucket: str) -> int:
    if bucket == "professional_service":
        return await db.services.count_documents({
            "business_id": business_id,
            **_PUBLISHED,
            "type": {"$nin": list(SPECIAL_SERVICE_TYPES)},
        })
    if bucket == "catalog_product":
        # One product quota covers canonical product listings and the legacy
        # product-like Service records of the same business.
        service_products = await db.services.count_documents({
            "business_id": business_id,
            **_PUBLISHED,
            "type": {"$in": ["retail_product", "pet_product"]},
        })
        listing_products = await db.listings.count_documents({
            "business_id": business_id,
            "listing_type": "product",
            "status": "published",
            "is_active": True,
        })
        return service_products + listing_products
    types = {
        "menu_entry": ["menu_item"],
        "vehicle_inventory": ["auto_vehicle"],
        "rental_inventory": ["rental_property"],
        "hospitality_inventory": ["hotel_room"],
    }[bucket]
    return await db.services.count_documents({
        "business_id": business_id,
        **_PUBLISHED,
        "type": {"$in": types},
    })


async def hotel_units_total(business_id: str) -> int:
    docs = await db.services.find(
        {"business_id": business_id, "type": "hotel_room", **_PUBLISHED},
        {"inventory_count": 1},
    ).to_list(500)
    return sum(int(d.get("inventory_count") or 0) for d in docs)


async def assert_quota(
    business_id: str,
    bucket: str,
    *,
    adding: int = 1,
    extra_units_delta: int = 0,
) -> None:
    """Fail a publication that would exceed a business-wide quota.

    No-op while enforcement is disabled (shadow mode default).
    """
    if not QUOTA_ENFORCEMENT:
        return

    limit = QUOTAS[bucket]
    current = await count_bucket(business_id, bucket)
    if current + adding > limit:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "QUOTA_REACHED",
                "bucket": bucket,
                "limit": limit,
                "current": current,
            },
        )

    if bucket == "hospitality_inventory" and extra_units_delta > 0:
        units = await hotel_units_total(business_id)
        if units + extra_units_delta > QUOTAS["hospitality_units"]:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "QUOTA_REACHED",
                    "bucket": "hospitality_units",
                    "limit": QUOTAS["hospitality_units"],
                    "current_units": units,
                },
            )
