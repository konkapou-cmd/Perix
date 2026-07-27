"""Business product permission policy — maps business root_category + subcategory to allowed Marketplace categories."""

from typing import Optional, Literal

PolicyMode = Literal["category_matrix", "custom"]


class ProductPermission:
    def __init__(self, allowed: dict[str, str | list[str] | None]):
        self._allowed = allowed  # category_key -> "*" | [subcategory_keys] | None

    def allows(self, category: str, subcategory: Optional[str] = None) -> bool:
        if category not in self._allowed:
            return False
        value = self._allowed[category]
        if value == "*":
            return True
        if value is None:
            return False
        if subcategory is None:
            return True
        return subcategory in value

    def to_response(self) -> list[dict]:
        result = []
        for cat_key, subs in self._allowed.items():
            result.append({
                "category": cat_key,
                "subcategories": subs if subs == "*" else list(subs) if subs else [],
                "unrestricted": subs == "*",
            })
        return result

    @property
    def is_empty(self) -> bool:
        return len(self._allowed) == 0


BUSINESS_PRODUCT_POLICY: dict[str, dict[str, dict[str, str | list[str] | None]]] = {
    "shopping-retail": {
        "electronics": {
            "electronics": "*",
        },
        "home-goods": {
            "home_garden_diy": [
                "kitchen_household",
                "large_appliances",
                "small_appliances",
                "decoration",
                "lighting",
                "storage",
            ],
        },
        "furniture": {
            "home_garden_diy": [
                "furniture",
                "storage",
            ],
        },
        "books-stationery": {
            "media_music": ["books"],
            "office_business": ["office_supplies"],
        },
        "florists": {
            "home_garden_diy": ["garden", "decoration"],
        },
    },
    "fashion-accessories": {
        "casual-wear": {
            "fashion": [
                "womens_clothing",
                "mens_clothing",
                "kids_clothing",
            ],
        },
        "sportswear": {
            "fashion": ["sportswear"],
            "sports_outdoor": ["outdoor_clothing"],
        },
        "sneakers": {
            "fashion": ["shoes"],
        },
        "jewelry": {
            "fashion": ["jewelry"],
        },
        "watches": {
            "fashion": ["watches"],
        },
        "bags-leather-goods": {
            "fashion": ["bags", "fashion_accessories"],
        },
    },
    "beauty-care": {
        "hair-salons": {
            "beauty_wellness": ["haircare", "hair_styling", "beauty_accessories"],
        },
        "barbershops": {
            "beauty_wellness": ["haircare", "hair_styling", "personal_care"],
        },
        "nail-salons": {
            "beauty_wellness": ["nailcare", "beauty_accessories"],
        },
        "makeup-services": {
            "beauty_wellness": ["makeup", "skincare", "beauty_accessories"],
        },
        "spas": {
            "beauty_wellness": ["skincare", "wellness_devices", "personal_care"],
        },
    },
    "pets": {
        "pet-supplies": {
            "pet_supplies": "*",
        },
        "pet-grooming": {
            "pet_supplies": ["pet_care"],
        },
    },
    "sports-fitness-wellness": {
        "gyms": {
            "sports_outdoor": ["fitness", "sports_accessories", "sportswear"],
        },
        "personal-training": {
            "sports_outdoor": ["fitness", "sports_accessories"],
        },
        "cycling": {
            "bikes_mobility": "*",
        },
        "running-clubs": {
            "sports_outdoor": ["running", "sports_accessories", "outdoor_clothing"],
        },
    },
}


def resolve_product_permission(root_category: str, subcategory: str) -> ProductPermission:
    root_policy = BUSINESS_PRODUCT_POLICY.get(root_category)
    if not root_policy:
        return ProductPermission({})

    sub_policy = root_policy.get(subcategory)
    if not sub_policy:
        return ProductPermission({})

    return ProductPermission(sub_policy)


def validate_business_product_category(business: dict, category: Optional[str], subcategory: Optional[str]):
    if not category:
        return

    from fastapi import HTTPException

    permission = resolve_product_permission(
        business.get("root_category", ""),
        business.get("subcategory", ""),
    )

    if permission.is_empty:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "BUSINESS_PRODUCTS_NOT_ALLOWED",
                "message": "Products are not enabled for this business category.",
            },
        )

    if not permission.allows(category, subcategory):
        raise HTTPException(
            status_code=422,
            detail={
                "code": "PRODUCT_CATEGORY_NOT_ALLOWED",
                "category": category,
                "subcategory": subcategory,
                "allowed": permission.to_response(),
            },
        )
