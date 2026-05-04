"""Stripe subscription routes with promoter revenue sharing."""
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import Optional, Dict
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

from database import db
from models.user import UserPublic
from utils.helpers import generate_id, now_utc
from routes.dependencies import get_current_user
from routes.admin import verify_admin

load_dotenv()

router = APIRouter(prefix="/stripe", tags=["Stripe Subscriptions"])

# Get Stripe API key
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")

# ============== PRICING CONFIGURATION ==============
SUBSCRIPTION_PLANS = {
    "business_monthly": {
        "name": "Business Monthly",
        "price": 29.90,
        "discounted_price": 14.99,  # With MagdeburgPro voucher
        "interval": "month",
        "features": ["visible_on_map", "event_creation", "analytics", "priority_support"]
    },
    "business_yearly": {
        "name": "Business Yearly",
        "price": 299.00,  # 10 months (2 months free)
        "discounted_price": 149.90,  # With MagdeburgPro voucher
        "interval": "year",
        "features": ["visible_on_map", "event_creation", "analytics", "priority_support"]
    }
}

# Voucher codes configuration
VOUCHER_CODES = {
    "MAGDEBURGPRO": {
        "discount_type": "special_pricing",
        "monthly_price": 14.99,
        "yearly_price": 149.90,
        "description": "Special promotional pricing",
        "active": True
    },
    "2SPECIAL": {
        "discount_type": "free_months",
        "months_free": 2,
        "description": "2 months free subscription",
        "active": True
    }
}

# Revenue split: 70% platform, 30% promoter
PLATFORM_SHARE = 0.70
PROMOTER_SHARE = 0.30


# ============== PYDANTIC MODELS ==============
class SubscriptionPlanInfo(BaseModel):
    plan_id: str
    name: str
    price: float
    discounted_price: Optional[float] = None
    interval: str
    features: list
    currency: str = "EUR"


class CreateCheckoutRequest(BaseModel):
    business_id: str
    plan_type: str  # "monthly" or "yearly"
    voucher_code: Optional[str] = None
    promoter_code: Optional[str] = None
    origin_url: str


class CheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str
    amount: float
    currency: str


class PromoterRegistration(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    bank_details: Optional[str] = None  # For payout info


class PromoterResponse(BaseModel):
    promoter_id: str
    promoter_code: str
    name: str
    email: str
    share_percentage: float


# ============== HELPER FUNCTIONS ==============
def get_price_for_plan(plan_type: str, voucher_code: Optional[str] = None) -> float:
    """Get the price for a plan, applying voucher if valid."""
    plan_key = f"business_{plan_type}"
    if plan_key not in SUBSCRIPTION_PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan type")
    
    plan = SUBSCRIPTION_PLANS[plan_key]
    
    if voucher_code:
        code = voucher_code.upper().strip()
        if code in VOUCHER_CODES and VOUCHER_CODES[code]["active"]:
            voucher = VOUCHER_CODES[code]
            if voucher["discount_type"] == "special_pricing":
                return voucher["monthly_price"] if plan_type == "monthly" else voucher["yearly_price"]
    
    return plan["price"]


async def get_promoter_by_code(code: str) -> Optional[dict]:
    """Get promoter by their referral code."""
    return await db.promoters.find_one({"promoter_code": code.upper()}, {"_id": 0})


# ============== PROMOTER ROUTES ==============
@router.post("/promoters/register", response_model=PromoterResponse)
async def register_promoter(
    data: PromoterRegistration,
    current_user: UserPublic = Depends(get_current_user)
):
    """Register a new promoter (affiliate partner)."""
    # Check if user is already a promoter
    existing = await db.promoters.find_one({"user_id": current_user.user_id})
    if existing:
        raise HTTPException(status_code=400, detail="You are already registered as a promoter")
    
    # Generate unique promoter code
    import random
    import string
    base_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    promoter_code = f"PRO{base_code}"
    
    promoter_id = generate_id("promoter")
    
    promoter_doc = {
        "promoter_id": promoter_id,
        "user_id": current_user.user_id,
        "promoter_code": promoter_code,
        "name": data.name,
        "email": data.email,
        "phone": data.phone,
        "bank_details": data.bank_details,
        "share_percentage": PROMOTER_SHARE * 100,  # 30%
        "total_earnings": 0.0,
        "pending_payout": 0.0,
        "total_referrals": 0,
        "created_at": now_utc(),
        "status": "active"
    }
    
    await db.promoters.insert_one(promoter_doc)
    
    return PromoterResponse(
        promoter_id=promoter_id,
        promoter_code=promoter_code,
        name=data.name,
        email=data.email,
        share_percentage=PROMOTER_SHARE * 100
    )


@router.get("/promoters/me")
async def get_my_promoter_profile(current_user: UserPublic = Depends(get_current_user)):
    """Get current user's promoter profile and stats."""
    promoter = await db.promoters.find_one({"user_id": current_user.user_id}, {"_id": 0})
    if not promoter:
        raise HTTPException(status_code=404, detail="You are not registered as a promoter")
    
    # Get recent referrals
    referrals = await db.payment_transactions.find(
        {"promoter_id": promoter["promoter_id"], "payment_status": "paid"},
        {"_id": 0}
    ).sort("created_at", -1).limit(10).to_list(10)
    
    return {
        **promoter,
        "recent_referrals": referrals
    }


@router.get("/promoters/validate/{code}")
async def validate_promoter_code(code: str, current_user: UserPublic = Depends(get_current_user)):
    """Validate a promoter referral code."""
    promoter = await get_promoter_by_code(code)
    if not promoter or promoter.get("status") != "active":
        return {"valid": False, "message": "Invalid or inactive promoter code"}
    
    return {
        "valid": True,
        "promoter_name": promoter["name"],
        "message": f"Referred by {promoter['name']}"
    }


# ============== SUBSCRIPTION ROUTES ==============
@router.get("/plans")
async def get_subscription_plans():
    """Get available subscription plans."""
    plans = []
    for plan_id, plan_data in SUBSCRIPTION_PLANS.items():
        plans.append(SubscriptionPlanInfo(
            plan_id=plan_id,
            name=plan_data["name"],
            price=plan_data["price"],
            discounted_price=plan_data.get("discounted_price"),
            interval=plan_data["interval"],
            features=plan_data["features"]
        ))
    return {"plans": plans, "voucher_available": True}


@router.post("/checkout/create", response_model=CheckoutResponse)
async def create_checkout_session(
    request: Request,
    data: CreateCheckoutRequest,
    current_user: UserPublic = Depends(get_current_user)
):
    """Create a Stripe checkout session for business subscription."""
    from emergentintegrations.payments.stripe.checkout import (
        StripeCheckout, CheckoutSessionRequest
    )
    
    # Verify business ownership
    business = await db.businesses.find_one(
        {"business_id": data.business_id, "owner_id": current_user.user_id},
        {"_id": 0}
    )
    if not business:
        raise HTTPException(status_code=403, detail="Not authorized to manage this business")
    
    # Check if already subscribed
    if business.get("subscription_status") == "active":
        expires_at = business.get("subscription_expires_at")
        if expires_at and expires_at > now_utc():
            raise HTTPException(status_code=400, detail="Business already has an active subscription")
    
    # Validate plan type
    if data.plan_type not in ["monthly", "yearly"]:
        raise HTTPException(status_code=400, detail="Invalid plan type. Use 'monthly' or 'yearly'")
    
    # Get price (with voucher if applicable)
    amount = get_price_for_plan(data.plan_type, data.voucher_code)
    
    # Validate promoter code if provided
    promoter = None
    if data.promoter_code:
        promoter = await get_promoter_by_code(data.promoter_code)
        if not promoter or promoter.get("status") != "active":
            raise HTTPException(status_code=400, detail="Invalid promoter code")
    
    # Build success and cancel URLs
    success_url = f"{data.origin_url}/subscription/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{data.origin_url}/subscription/cancel"
    
    # Generate session ID
    session_id = generate_id("checkout")
    
    # Metadata for tracking
    metadata = {
        "business_id": data.business_id,
        "user_id": current_user.user_id,
        "plan_type": data.plan_type,
        "voucher_code": data.voucher_code or "",
        "promoter_id": promoter["promoter_id"] if promoter else "",
        "promoter_code": data.promoter_code or "",
        "internal_session_id": session_id
    }
    
    # Initialize Stripe
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/stripe/webhook"
    
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    
    # Create checkout session
    checkout_request = CheckoutSessionRequest(
        amount=float(amount),
        currency="eur",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=metadata
    )
    
    session = await stripe_checkout.create_checkout_session(checkout_request)
    
    # Calculate revenue split
    platform_amount = round(amount * PLATFORM_SHARE, 2)
    promoter_amount = round(amount * PROMOTER_SHARE, 2) if promoter else 0
    
    # Create payment transaction record
    transaction_doc = {
        "transaction_id": session_id,
        "stripe_session_id": session.session_id,
        "business_id": data.business_id,
        "user_id": current_user.user_id,
        "plan_type": data.plan_type,
        "amount": amount,
        "currency": "EUR",
        "voucher_code": data.voucher_code,
        "promoter_id": promoter["promoter_id"] if promoter else None,
        "promoter_code": data.promoter_code,
        "platform_amount": platform_amount,
        "promoter_amount": promoter_amount,
        "payment_status": "pending",
        "created_at": now_utc()
    }
    
    await db.payment_transactions.insert_one(transaction_doc)
    
    return CheckoutResponse(
        checkout_url=session.url,
        session_id=session.session_id,
        amount=amount,
        currency="EUR"
    )


@router.get("/checkout/status/{session_id}")
async def get_checkout_status(
    session_id: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """Check the status of a checkout session and activate subscription if paid."""
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    
    # Find the transaction
    transaction = await db.payment_transactions.find_one(
        {"stripe_session_id": session_id},
        {"_id": 0}
    )
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Verify ownership
    if transaction["user_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # If already processed, return current status
    if transaction["payment_status"] == "paid":
        business = await db.businesses.find_one(
            {"business_id": transaction["business_id"]},
            {"_id": 0, "subscription_status": 1, "subscription_expires_at": 1}
        )
        return {
            "status": "complete",
            "payment_status": "paid",
            "subscription_active": True,
            "expires_at": business.get("subscription_expires_at").isoformat() if business.get("subscription_expires_at") else None
        }
    
    # Check with Stripe
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
    
    try:
        status = await stripe_checkout.get_checkout_status(session_id)
    except Exception as e:
        return {"status": "pending", "payment_status": transaction["payment_status"]}
    
    if status.payment_status == "paid" and transaction["payment_status"] != "paid":
        # Activate subscription
        plan_type = transaction["plan_type"]
        duration = timedelta(days=30) if plan_type == "monthly" else timedelta(days=365)
        expires_at = now_utc() + duration
        
        # Update business
        await db.businesses.update_one(
            {"business_id": transaction["business_id"]},
            {"$set": {
                "subscription_status": "active",
                "subscription_plan": plan_type,
                "subscription_expires_at": expires_at,
                "visible_on_map": True,
                "can_create_events": True
            }}
        )
        
        # Update transaction
        await db.payment_transactions.update_one(
            {"stripe_session_id": session_id},
            {"$set": {
                "payment_status": "paid",
                "paid_at": now_utc()
            }}
        )
        
        # Update promoter earnings if applicable
        if transaction.get("promoter_id"):
            await db.promoters.update_one(
                {"promoter_id": transaction["promoter_id"]},
                {
                    "$inc": {
                        "total_earnings": transaction["promoter_amount"],
                        "pending_payout": transaction["promoter_amount"],
                        "total_referrals": 1
                    }
                }
            )
        
        return {
            "status": "complete",
            "payment_status": "paid",
            "subscription_active": True,
            "expires_at": expires_at.isoformat()
        }
    
    return {
        "status": status.status,
        "payment_status": status.payment_status
    }


@router.post("/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events."""
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    
    body = await request.body()
    signature = request.headers.get("Stripe-Signature", "")
    
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
    
    try:
        event = await stripe_checkout.handle_webhook(body, signature)
        
        if event.payment_status == "paid":
            # Find and process the transaction
            transaction = await db.payment_transactions.find_one(
                {"stripe_session_id": event.session_id},
                {"_id": 0}
            )
            
            if transaction and transaction["payment_status"] != "paid":
                # Same activation logic as status endpoint
                plan_type = transaction["plan_type"]
                duration = timedelta(days=30) if plan_type == "monthly" else timedelta(days=365)
                expires_at = now_utc() + duration
                
                await db.businesses.update_one(
                    {"business_id": transaction["business_id"]},
                    {"$set": {
                        "subscription_status": "active",
                        "subscription_plan": plan_type,
                        "subscription_expires_at": expires_at,
                        "visible_on_map": True,
                        "can_create_events": True
                    }}
                )
                
                await db.payment_transactions.update_one(
                    {"stripe_session_id": event.session_id},
                    {"$set": {
                        "payment_status": "paid",
                        "paid_at": now_utc()
                    }}
                )
                
                if transaction.get("promoter_id"):
                    await db.promoters.update_one(
                        {"promoter_id": transaction["promoter_id"]},
                        {
                            "$inc": {
                                "total_earnings": transaction["promoter_amount"],
                                "pending_payout": transaction["promoter_amount"],
                                "total_referrals": 1
                            }
                        }
                    )
        
        return {"received": True}
    except Exception as e:
        print(f"Webhook error: {e}")
        raise HTTPException(status_code=400, detail="Webhook processing failed")


# ============== VOUCHER ROUTES ==============
@router.get("/voucher/check/{code}")
async def check_voucher_code(code: str, current_user: UserPublic = Depends(get_current_user)):
    """Check if a voucher code is valid."""
    code = code.upper().strip()
    
    if code not in VOUCHER_CODES:
        return {"valid": False, "message": "Invalid voucher code"}
    
    voucher = VOUCHER_CODES[code]
    if not voucher["active"]:
        return {"valid": False, "message": "This voucher has expired"}
    
    if voucher["discount_type"] == "special_pricing":
        return {
            "valid": True,
            "discount_type": "special_pricing",
            "monthly_price": voucher["monthly_price"],
            "yearly_price": voucher["yearly_price"],
            "description": voucher["description"]
        }
    else:
        return {
            "valid": True,
            "discount_type": "free_months",
            "months_free": voucher["months_free"],
            "description": voucher["description"]
        }


@router.post("/voucher/apply")
async def apply_free_months_voucher(
    business_id: str,
    voucher_code: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """Apply a free months voucher (like 2SPECIAL) to extend subscription."""
    code = voucher_code.upper().strip()
    
    if code not in VOUCHER_CODES:
        raise HTTPException(status_code=400, detail="Invalid voucher code")
    
    voucher = VOUCHER_CODES[code]
    if not voucher["active"]:
        raise HTTPException(status_code=400, detail="This voucher has expired")
    
    if voucher["discount_type"] != "free_months":
        raise HTTPException(status_code=400, detail="This voucher requires payment checkout")
    
    # Verify business ownership
    business = await db.businesses.find_one(
        {"business_id": business_id, "owner_id": current_user.user_id},
        {"_id": 0}
    )
    if not business:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Check if voucher already used
    existing = await db.voucher_uses.find_one({
        "business_id": business_id,
        "voucher_code": code
    })
    if existing:
        raise HTTPException(status_code=400, detail="Voucher already used for this business")
    
    # Calculate new expiration
    current_expires = business.get("subscription_expires_at")
    if current_expires and current_expires > now_utc():
        new_expires = current_expires + timedelta(days=voucher["months_free"] * 30)
    else:
        new_expires = now_utc() + timedelta(days=voucher["months_free"] * 30)
    
    # Update business
    await db.businesses.update_one(
        {"business_id": business_id},
        {"$set": {
            "subscription_status": "active",
            "subscription_expires_at": new_expires,
            "visible_on_map": True,
            "can_create_events": True
        }}
    )
    
    # Record voucher use
    await db.voucher_uses.insert_one({
        "voucher_use_id": generate_id("voucher"),
        "voucher_code": code,
        "business_id": business_id,
        "user_id": current_user.user_id,
        "applied_at": now_utc(),
        "months_granted": voucher["months_free"]
    })
    
    return {
        "success": True,
        "message": f"Voucher applied! {voucher['months_free']} months free.",
        "expires_at": new_expires.isoformat()
    }


# ============== ADMIN ROUTES FOR PROMOTER PAYOUTS ==============
@router.get("/admin/promoters")
async def admin_list_promoters(current_user: UserPublic = Depends(get_current_user)):
    """List all promoters with their earnings (admin only)."""
    await verify_admin(current_user)
    
    promoters = await db.promoters.find({}, {"_id": 0}).to_list(100)
    return {"promoters": promoters}


@router.post("/admin/promoters/{promoter_id}/payout")
async def process_promoter_payout(
    promoter_id: str,
    amount: float,
    current_user: UserPublic = Depends(get_current_user)
):
    """Process a payout to a promoter (admin only)."""
    await verify_admin(current_user)
    
    promoter = await db.promoters.find_one({"promoter_id": promoter_id}, {"_id": 0})
    if not promoter:
        raise HTTPException(status_code=404, detail="Promoter not found")
    
    if amount > promoter.get("pending_payout", 0):
        raise HTTPException(status_code=400, detail="Amount exceeds pending payout")
    
    # Record payout
    payout_id = generate_id("payout")
    await db.promoter_payouts.insert_one({
        "payout_id": payout_id,
        "promoter_id": promoter_id,
        "amount": amount,
        "processed_by": current_user.user_id,
        "processed_at": now_utc(),
        "status": "completed"
    })
    
    # Update promoter balance
    await db.promoters.update_one(
        {"promoter_id": promoter_id},
        {"$inc": {"pending_payout": -amount}}
    )
    
    return {
        "success": True,
        "payout_id": payout_id,
        "amount": amount,
        "new_pending_balance": promoter["pending_payout"] - amount
    }


@router.get("/admin/transactions")
async def admin_list_transactions(current_user: UserPublic = Depends(get_current_user)):
    """List all payment transactions (admin only)."""
    await verify_admin(current_user)
    
    transactions = await db.payment_transactions.find(
        {},
        {"_id": 0}
    ).sort("created_at", -1).limit(100).to_list(100)
    
    return {"transactions": transactions}


@router.get("/admin/stats")
async def admin_get_monetization_stats(current_user: UserPublic = Depends(get_current_user)):
    """Get monetization overview stats (admin only)."""
    await verify_admin(current_user)
    
    # Count totals
    total_promoters = await db.promoters.count_documents({})
    active_promoters = await db.promoters.count_documents({"status": "active"})
    
    # Sum earnings
    pipeline = [
        {"$group": {
            "_id": None,
            "total_earnings": {"$sum": "$total_earnings"},
            "total_pending": {"$sum": "$pending_payout"},
            "total_referrals": {"$sum": "$total_referrals"}
        }}
    ]
    earnings_result = await db.promoters.aggregate(pipeline).to_list(1)
    earnings = earnings_result[0] if earnings_result else {
        "total_earnings": 0,
        "total_pending": 0,
        "total_referrals": 0
    }
    
    # Transaction stats
    total_transactions = await db.payment_transactions.count_documents({})
    paid_transactions = await db.payment_transactions.count_documents({"payment_status": "paid"})
    
    # Revenue pipeline
    revenue_pipeline = [
        {"$match": {"payment_status": "paid"}},
        {"$group": {
            "_id": None,
            "total_revenue": {"$sum": "$amount"},
            "platform_revenue": {"$sum": "$platform_amount"},
            "promoter_revenue": {"$sum": "$promoter_amount"}
        }}
    ]
    revenue_result = await db.payment_transactions.aggregate(revenue_pipeline).to_list(1)
    revenue = revenue_result[0] if revenue_result else {
        "total_revenue": 0,
        "platform_revenue": 0,
        "promoter_revenue": 0
    }
    
    return {
        "promoters": {
            "total": total_promoters,
            "active": active_promoters
        },
        "earnings": {
            "total_earned": earnings.get("total_earnings", 0),
            "pending_payouts": earnings.get("total_pending", 0),
            "total_referrals": earnings.get("total_referrals", 0)
        },
        "transactions": {
            "total": total_transactions,
            "paid": paid_transactions
        },
        "revenue": {
            "total": revenue.get("total_revenue", 0),
            "platform": revenue.get("platform_revenue", 0),
            "promoters": revenue.get("promoter_revenue", 0)
        }
    }
