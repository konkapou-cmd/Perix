"""Contacts routes - Find friends from phone contacts and invite new users."""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from pydantic import BaseModel
import re

from database import db
from models.user import UserPublic
from utils.helpers import generate_id, now_utc
from routes.dependencies import get_current_user, build_user_public

router = APIRouter(prefix="/contacts", tags=["Contacts"])


class PhoneContact(BaseModel):
    name: str
    phone_numbers: List[str]


class ContactsCheckRequest(BaseModel):
    contacts: List[PhoneContact]


class MatchedContact(BaseModel):
    contact_name: str
    phone_number: str
    user_id: str
    user_name: str
    profile_photo: Optional[str] = None
    is_friend: bool


class InvitableContact(BaseModel):
    name: str
    phone_number: str


def normalize_phone(phone: str) -> str:
    """Normalize phone number for comparison - remove all non-digits."""
    digits = re.sub(r'\D', '', phone)
    # Handle common formats - keep last 10 digits for comparison
    if len(digits) > 10:
        return digits[-10:]
    return digits


@router.post("/check")
async def check_contacts(
    payload: ContactsCheckRequest,
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Check which phone contacts are already on Perix.
    Returns matched users and contacts that can be invited.
    """
    # Collect all phone numbers and normalize them
    phone_to_contact = {}  # normalized_phone -> contact info
    for contact in payload.contacts:
        for phone in contact.phone_numbers:
            normalized = normalize_phone(phone)
            if normalized and len(normalized) >= 7:  # Valid phone length
                phone_to_contact[normalized] = {
                    "name": contact.name,
                    "original_phone": phone
                }
    
    if not phone_to_contact:
        return {
            "matched_users": [],
            "invitable_contacts": [],
            "total_checked": 0
        }
    
    # Get current user's user-type friends for is_friend check
    user_friends = {
        f["entity_id"] for f in (current_user.friends or [])
        if isinstance(f, dict) and f.get("entity_type") == "user"
    }
    
    # Find users with matching phone numbers
    # We need to search by normalized phone numbers
    all_users = await db.users.find(
        {"phone": {"$exists": True, "$ne": None}},
        {"_id": 0, "password_hash": 0}
    ).to_list(10000)
    
    matched_users = []
    matched_phones = set()
    
    for user in all_users:
        user_phone = user.get("phone", "")
        if not user_phone:
            continue
        
        normalized_user_phone = normalize_phone(user_phone)
        
        # Check if this user's phone matches any contact
        if normalized_user_phone in phone_to_contact:
            contact_info = phone_to_contact[normalized_user_phone]
            matched_phones.add(normalized_user_phone)
            
            # Don't include self
            if user["user_id"] != current_user.user_id:
                matched_users.append({
                    "contact_name": contact_info["name"],
                    "phone_number": contact_info["original_phone"],
                    "user_id": user["user_id"],
                    "user_name": user.get("name", "User"),
                    "profile_photo": user.get("profile_photo") or user.get("picture"),
                    "is_friend": user["user_id"] in user_friends
                })
    
    # Find contacts that can be invited (not on Perix)
    invitable_contacts = []
    for normalized, contact_info in phone_to_contact.items():
        if normalized not in matched_phones:
            invitable_contacts.append({
                "name": contact_info["name"],
                "phone_number": contact_info["original_phone"]
            })
    
    # Sort: non-friends first (to encourage adding), then by name
    matched_users.sort(key=lambda x: (x["is_friend"], x["contact_name"].lower()))
    invitable_contacts.sort(key=lambda x: x["name"].lower())
    
    return {
        "matched_users": matched_users[:50],  # Limit to 50
        "invitable_contacts": invitable_contacts[:100],  # Limit to 100
        "total_checked": len(phone_to_contact),
        "total_matched": len(matched_users),
        "total_invitable": len(invitable_contacts)
    }


@router.post("/invite-tracking")
async def track_invite(
    phone_number: str,
    invite_method: str,  # "sms", "whatsapp", "other"
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Track when a user sends an invite to someone.
    Used for referral tracking and analytics.
    """
    normalized_phone = normalize_phone(phone_number)
    
    # Check if already invited by this user
    existing = await db.invites.find_one({
        "inviter_id": current_user.user_id,
        "phone_normalized": normalized_phone
    })
    
    if existing:
        # Update invite count
        await db.invites.update_one(
            {"_id": existing["_id"]},
            {
                "$inc": {"invite_count": 1},
                "$set": {"last_invited_at": now_utc()}
            }
        )
        return {"success": True, "message": "Invite tracked", "new_invite": False}
    
    # Create new invite record
    invite_doc = {
        "invite_id": generate_id("inv"),
        "inviter_id": current_user.user_id,
        "inviter_name": current_user.name,
        "phone_normalized": normalized_phone,
        "phone_original": phone_number,
        "invite_method": invite_method,
        "invite_count": 1,
        "created_at": now_utc(),
        "last_invited_at": now_utc(),
        "converted": False,  # Will be set to True when invitee joins
        "converted_user_id": None,
    }
    
    await db.invites.insert_one(invite_doc)
    
    return {"success": True, "message": "Invite tracked", "new_invite": True}


@router.get("/my-invites")
async def get_my_invites(
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Get all invites sent by the current user.
    Shows which have converted (joined Perix).
    """
    invites = await db.invites.find(
        {"inviter_id": current_user.user_id},
        {"_id": 0}
    ).sort("last_invited_at", -1).to_list(100)
    
    # Get converted user info
    converted_ids = [inv["converted_user_id"] for inv in invites if inv.get("converted_user_id")]
    converted_users = {}
    
    if converted_ids:
        users = await db.users.find(
            {"user_id": {"$in": converted_ids}},
            {"_id": 0, "password_hash": 0}
        ).to_list(100)
        converted_users = {u["user_id"]: u for u in users}
    
    result = []
    for inv in invites:
        invite_data = {
            "invite_id": inv["invite_id"],
            "phone": inv["phone_original"],
            "invite_count": inv["invite_count"],
            "created_at": inv["created_at"].isoformat() if hasattr(inv["created_at"], 'isoformat') else str(inv["created_at"]),
            "converted": inv.get("converted", False),
        }
        
        if inv.get("converted_user_id") and inv["converted_user_id"] in converted_users:
            user = converted_users[inv["converted_user_id"]]
            invite_data["converted_user"] = {
                "user_id": user["user_id"],
                "name": user.get("name"),
                "profile_photo": user.get("profile_photo") or user.get("picture"),
            }
        
        result.append(invite_data)
    
    # Stats
    total_invites = len(invites)
    total_converted = sum(1 for inv in invites if inv.get("converted"))
    
    return {
        "invites": result,
        "stats": {
            "total_invites": total_invites,
            "total_converted": total_converted,
            "conversion_rate": round(total_converted / total_invites * 100, 1) if total_invites > 0 else 0
        }
    }


@router.get("/referral-code")
async def get_referral_code(
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Get or generate a referral code for the current user.
    """
    # Check if user already has a referral code
    user = await db.users.find_one(
        {"user_id": current_user.user_id},
        {"referral_code": 1}
    )
    
    if user and user.get("referral_code"):
        return {"referral_code": user["referral_code"]}
    
    # Generate new referral code
    # Use first 4 letters of name + random 4 chars
    import random
    import string
    
    name_part = re.sub(r'[^a-zA-Z]', '', current_user.name or "USER")[:4].upper()
    random_part = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
    referral_code = f"{name_part}{random_part}"
    
    # Ensure uniqueness
    while await db.users.find_one({"referral_code": referral_code}):
        random_part = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
        referral_code = f"{name_part}{random_part}"
    
    # Save to user
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"referral_code": referral_code}}
    )
    
    return {"referral_code": referral_code}


@router.post("/apply-referral")
async def apply_referral_code(
    referral_code: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """
    Apply a referral code when a new user signs up.
    Links the new user to their referrer.
    """
    # Check if user already has a referrer
    user = await db.users.find_one(
        {"user_id": current_user.user_id},
        {"referred_by": 1}
    )
    
    if user and user.get("referred_by"):
        raise HTTPException(status_code=400, detail="You already have a referrer")
    
    # Find referrer by code
    referrer = await db.users.find_one(
        {"referral_code": referral_code.upper()},
        {"_id": 0, "password_hash": 0}
    )
    
    if not referrer:
        raise HTTPException(status_code=404, detail="Invalid referral code")
    
    if referrer["user_id"] == current_user.user_id:
        raise HTTPException(status_code=400, detail="Cannot use your own referral code")
    
    # Update current user with referrer
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {
            "referred_by": referrer["user_id"],
            "referred_at": now_utc()
        }}
    )
    
    # Update referrer's stats
    await db.users.update_one(
        {"user_id": referrer["user_id"]},
        {"$inc": {"referral_count": 1}}
    )
    
    # Check if there was a phone-based invite and mark as converted
    user_phone = current_user.phone if hasattr(current_user, 'phone') else None
    if user_phone:
        normalized_phone = normalize_phone(user_phone)
        await db.invites.update_one(
            {
                "inviter_id": referrer["user_id"],
                "phone_normalized": normalized_phone
            },
            {"$set": {
                "converted": True,
                "converted_user_id": current_user.user_id,
                "converted_at": now_utc()
            }}
        )
    
    return {
        "success": True,
        "message": "Referral applied successfully",
        "referrer_name": referrer.get("name", "User")
    }
