"""Subscriptions routes."""
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict
from datetime import timedelta
import httpx

from database import db
from models.user import UserPublic
from models.subscription import SubscriptionPlanResponse, SubscriptionCreate, SubscriptionResponse
from utils.helpers import generate_id, now_utc
from config import PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_BASE_URL
from routes.dependencies import get_current_user

router = APIRouter(prefix="/subscriptions", tags=["Subscriptions"])


async def paypal_get_access_token() -> str:
    if not PAYPAL_CLIENT_ID or not PAYPAL_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="PayPal credentials not configured")
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{PAYPAL_BASE_URL}/v1/oauth2/token",
            auth=(PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={"grant_type": "client_credentials"},
        )
    if response.status_code >= 400:
        raise HTTPException(status_code=500, detail="Unable to authenticate PayPal")
    return response.json()["access_token"]


async def paypal_create_product(access_token: str) -> str:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{PAYPAL_BASE_URL}/v1/catalogs/products",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json={
                "name": "Perix Business",
                "description": "Business subscription for Perix",
                "type": "SERVICE",
                "category": "SOFTWARE",
            },
        )
    if response.status_code >= 400:
        raise HTTPException(status_code=500, detail="Failed to create PayPal product")
    return response.json()["id"]


async def paypal_create_plan(
    access_token: str,
    product_id: str,
    plan_name: str,
    interval_unit: str,
    interval_count: int,
    price: str,
) -> str:
    payload = {
        "product_id": product_id,
        "name": plan_name,
        "billing_cycles": [
            {
                "frequency": {"interval_unit": "DAY", "interval_count": 10},
                "tenure_type": "TRIAL",
                "sequence": 1,
                "total_cycles": 1,
                "pricing_scheme": {
                    "fixed_price": {"value": "0", "currency_code": "EUR"}
                },
            },
            {
                "frequency": {
                    "interval_unit": interval_unit,
                    "interval_count": interval_count,
                },
                "tenure_type": "REGULAR",
                "sequence": 2,
                "total_cycles": 0,
                "pricing_scheme": {
                    "fixed_price": {"value": price, "currency_code": "EUR"}
                },
            },
        ],
        "payment_preferences": {
            "auto_bill_outstanding": True,
            "payment_failure_threshold": 3,
        },
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{PAYPAL_BASE_URL}/v1/billing/plans",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json=payload,
        )
    if response.status_code >= 400:
        raise HTTPException(status_code=500, detail="Failed to create PayPal plan")
    return response.json()["id"]


async def ensure_paypal_plans() -> Dict[str, str]:
    config = await db.paypal_config.find_one({"_id": "paypal"})
    access_token = await paypal_get_access_token()
    product_id = config.get("product_id") if config else None
    if not product_id:
        product_id = await paypal_create_product(access_token)

    monthly_plan_id = config.get("monthly_plan_id") if config else None
    yearly_plan_id = config.get("yearly_plan_id") if config else None

    if not monthly_plan_id:
        monthly_plan_id = await paypal_create_plan(
            access_token,
            product_id,
            "Perix Monthly",
            "MONTH",
            1,
            "24.99",
        )
    if not yearly_plan_id:
        yearly_plan_id = await paypal_create_plan(
            access_token,
            product_id,
            "Perix Yearly",
            "YEAR",
            1,
            "249.99",
        )

    await db.paypal_config.update_one(
        {"_id": "paypal"},
        {
            "$set": {
                "product_id": product_id,
                "monthly_plan_id": monthly_plan_id,
                "yearly_plan_id": yearly_plan_id,
            }
        },
        upsert=True,
    )
    return {"monthly_plan_id": monthly_plan_id, "yearly_plan_id": yearly_plan_id}


@router.get("/plans", response_model=SubscriptionPlanResponse)
async def subscription_plans(current_user: UserPublic = Depends(get_current_user)):
    plans = await ensure_paypal_plans()
    return SubscriptionPlanResponse(
        monthly_plan_id=plans["monthly_plan_id"],
        yearly_plan_id=plans["yearly_plan_id"],
        trial_days=90,
        monthly_price=24.99,
        yearly_price=249.99,
        currency="EUR",
    )


@router.post("/create", response_model=SubscriptionResponse)
async def create_subscription(
    payload: SubscriptionCreate, current_user: UserPublic = Depends(get_current_user)
):
    business = await db.businesses.find_one(
        {"business_id": payload.business_id, "owner_id": current_user.user_id},
        {"_id": 0},
    )
    if not business:
        raise HTTPException(status_code=403, detail="Not authorized")

    plans = await ensure_paypal_plans()
    plan_id = (
        plans["monthly_plan_id"]
        if payload.plan_type == "monthly"
        else plans["yearly_plan_id"]
    )

    access_token = await paypal_get_access_token()
    subscription_id = generate_id("sub")

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{PAYPAL_BASE_URL}/v1/billing/subscriptions",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={
                "plan_id": plan_id,
                "custom_id": subscription_id,
                "application_context": {
                    "brand_name": "Perix",
                    "locale": "en-US",
                    "shipping_preference": "NO_SHIPPING",
                    "user_action": "SUBSCRIBE_NOW",
                    "return_url": f"{PAYPAL_BASE_URL}/api/subscriptions/return",
                    "cancel_url": f"{PAYPAL_BASE_URL}/api/subscriptions/cancel",
                },
            },
        )

    if response.status_code >= 400:
        raise HTTPException(status_code=500, detail="Failed to create subscription")

    data = response.json()
    approval_link = next(
        (link["href"] for link in data.get("links", []) if link["rel"] == "approve"),
        "",
    )

    await db.subscriptions.insert_one(
        {
            "subscription_id": subscription_id,
            "paypal_subscription_id": data["id"],
            "business_id": payload.business_id,
            "plan_type": payload.plan_type,
            "status": "pending",
            "created_at": now_utc(),
        }
    )

    return SubscriptionResponse(
        subscription_id=subscription_id,
        approval_url=approval_link,
        status="pending",
    )


@router.get("/status/{subscription_id}")
async def subscription_status(
    subscription_id: str, current_user: UserPublic = Depends(get_current_user)
):
    subscription = await db.subscriptions.find_one(
        {"subscription_id": subscription_id}, {"_id": 0}
    )
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")

    access_token = await paypal_get_access_token()
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{PAYPAL_BASE_URL}/v1/billing/subscriptions/{subscription['paypal_subscription_id']}",
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if response.status_code >= 400:
        return {"status": subscription["status"]}

    paypal_status = response.json().get("status", "").lower()

    if paypal_status == "active" and subscription["status"] != "active":
        plan_type = subscription["plan_type"]
        duration = timedelta(days=30) if plan_type == "monthly" else timedelta(days=365)
        expires_at = now_utc() + duration
        await db.subscriptions.update_one(
            {"subscription_id": subscription_id},
            {"$set": {"status": "active"}},
        )
        await db.businesses.update_one(
            {"business_id": subscription["business_id"]},
            {
                "$set": {
                    "subscription_status": "active",
                    "plan_type": plan_type,
                    "subscription_expires_at": expires_at,
                }
            },
        )
        return {"status": "active", "expires_at": expires_at.isoformat()}

    return {"status": paypal_status or subscription["status"]}


@router.get("/return", name="paypal_return", include_in_schema=False)
async def paypal_return():
    return {"message": "Subscription activated successfully"}


@router.get("/cancel", name="paypal_cancel", include_in_schema=False)
async def paypal_cancel():
    return {"message": "Subscription cancelled"}



# ============== VOUCHER CODES ==============

from pydantic import BaseModel

# Define valid voucher codes
VOUCHER_CODES = {
    "2SPECIAL": {
        "months_free": 2,
        "description": "2 months free subscription",
        "max_uses": None,  # Unlimited uses
        "active": True,
    },
}


class VoucherRequest(BaseModel):
    voucher_code: str
    business_id: str


class VoucherResponse(BaseModel):
    success: bool
    message: str
    months_free: int = 0
    expires_at: str = ""


@router.post("/voucher/apply", response_model=VoucherResponse)
async def apply_voucher(
    request: VoucherRequest,
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Apply a voucher code to a business subscription.
    Currently supports:
    - 2SPECIAL: 2 months free subscription
    """
    code = request.voucher_code.upper().strip()
    
    # Check if voucher code exists
    if code not in VOUCHER_CODES:
        raise HTTPException(status_code=400, detail="Invalid voucher code")
    
    voucher = VOUCHER_CODES[code]
    
    # Check if voucher is active
    if not voucher["active"]:
        raise HTTPException(status_code=400, detail="This voucher code has expired")
    
    # Verify business exists and belongs to user
    business = await db.businesses.find_one(
        {"business_id": request.business_id},
        {"_id": 0}
    )
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    if business["owner_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Check if voucher already used for this business
    existing_voucher = await db.voucher_uses.find_one({
        "business_id": request.business_id,
        "voucher_code": code
    })
    if existing_voucher:
        raise HTTPException(status_code=400, detail="This voucher has already been used for this business")
    
    # Calculate new expiration date
    current_expires = business.get("subscription_expires_at")
    if current_expires and current_expires > now_utc():
        # Add months to existing subscription
        new_expires = current_expires + timedelta(days=voucher["months_free"] * 30)
    else:
        # Start fresh subscription
        new_expires = now_utc() + timedelta(days=voucher["months_free"] * 30)
    
    # Update business subscription
    await db.businesses.update_one(
        {"business_id": request.business_id},
        {"$set": {
            "subscription_status": "active",
            "subscription_expires_at": new_expires,
            "subscription_plan": "voucher",
        }}
    )
    
    # Record voucher use
    await db.voucher_uses.insert_one({
        "voucher_use_id": generate_id("voucher"),
        "voucher_code": code,
        "business_id": request.business_id,
        "user_id": current_user.user_id,
        "applied_at": now_utc(),
        "months_granted": voucher["months_free"],
    })
    
    return VoucherResponse(
        success=True,
        message=f"Voucher applied! You have {voucher['months_free']} months free.",
        months_free=voucher["months_free"],
        expires_at=new_expires.isoformat()
    )


@router.get("/voucher/check/{voucher_code}")
async def check_voucher(voucher_code: str, current_user: UserPublic = Depends(get_current_user)):
    """Check if a voucher code is valid (without applying it)."""
    code = voucher_code.upper().strip()
    
    if code not in VOUCHER_CODES:
        return {"valid": False, "message": "Invalid voucher code"}
    
    voucher = VOUCHER_CODES[code]
    
    if not voucher["active"]:
        return {"valid": False, "message": "This voucher code has expired"}
    
    return {
        "valid": True,
        "months_free": voucher["months_free"],
        "description": voucher["description"]
    }
