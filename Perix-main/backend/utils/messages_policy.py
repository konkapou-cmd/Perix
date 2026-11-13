"""Message quota, retention and media-window policy (v18 -> v19), feature-flagged.

Every enforcement switch is OFF by default: nothing changes in production
until the flags are enabled after the 1-1 tests.
- MESSAGE_QUOTA_ENFORCEMENT=1  -> 30 monthly sends for Free, unlimited for Premium
- RETENTION_ENFORCEMENT=1      -> 30-day expiry with active-context exemption
- MEDIA_WINDOW_ENFORCEMENT=1   -> latest 15 media files per conversation
"""
import os
from datetime import timedelta
from typing import Optional, Tuple

from fastapi import HTTPException

from database import db
from utils.helpers import now_utc

MESSAGE_QUOTA_ENFORCEMENT = os.environ.get("MESSAGE_QUOTA_ENFORCEMENT", "0") == "1"
RETENTION_ENFORCEMENT = os.environ.get("RETENTION_ENFORCEMENT", "0") == "1"
MEDIA_WINDOW_ENFORCEMENT = os.environ.get("MEDIA_WINDOW_ENFORCEMENT", "0") == "1"

FREE_MESSAGE_LIMIT = 30
PREMIUM_MESSAGE_LIMIT = None  # v19: Premium has unlimited messages
RETENTION_DAYS = 30
MEDIA_WINDOW_FILES = 15
RETENTION_POLICY_VERSION = "v19"

# context_type -> (collection, id_field)
CONTEXT_MAP = {
    "booking": ("bookings", "booking_id"),
    "activity": ("activities", "activity_id"),
    "event": ("events", "event_id"),
    "service": ("services", "service_id"),
    "item": ("listings", "listing_id"),
    "listing": ("listings", "listing_id"),
    "job": ("jobs", "job_id"),
}


def personal_message_limit(user_doc: Optional[dict]) -> Optional[int]:
    """Monthly send limit for personal actors; None = unlimited (Premium)."""
    if (user_doc or {}).get("account_plan") == "premium_user":
        return PREMIUM_MESSAGE_LIMIT
    return FREE_MESSAGE_LIMIT


async def resolve_sender_identity(
    current_user,
    sender_type: Optional[str],
    sender_business_id: Optional[str],
) -> Tuple[str, str]:
    """Server-verified sender identity.

    Business identity is only granted when the caller owns the business;
    otherwise the send is recorded under the personal identity (the backend
    never lets a client impersonate a business it does not own).
    """
    if sender_type == "business" and sender_business_id:
        business = await db.businesses.find_one(
            {"business_id": sender_business_id, "owner_id": current_user.user_id},
            {"_id": 0, "business_id": 1},
        )
        if business:
            return "business", sender_business_id
    return "user", current_user.user_id


async def validate_message_context(
    context_type: Optional[str],
    context_id: Optional[str],
) -> Tuple[Optional[str], Optional[str], Optional[dict]]:
    """Server-validate a context link; existence is verified in the DB.

    Returns (context_type, context_id, full_doc).
    """
    if not context_type and not context_id:
        return None, None, None
    if not context_type or not context_id:
        raise HTTPException(
            status_code=400,
            detail="Both context_type and context_id are required",
        )
    if context_type not in CONTEXT_MAP:
        raise HTTPException(status_code=400, detail="Invalid context_type")
    collection, id_field = CONTEXT_MAP[context_type]
    doc = await db[collection].find_one({id_field: context_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=400, detail="Referenced context not found")
    return context_type, context_id, doc


def _parse_dt(value):
    from datetime import datetime
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def context_is_active(context_type: Optional[str], context_doc: Optional[dict]) -> bool:
    """Active-case definition (decision D12) used for the retention exemption."""
    if not context_type or not context_doc:
        return False
    if context_type == "booking":
        return (context_doc.get("status") or "") in ("pending", "confirmed")
    if context_type in ("activity", "event"):
        end = context_doc.get("end_time") or context_doc.get("date")
        if not end:
            return True
        end_dt = _parse_dt(end)
        return end_dt is not None and end_dt >= now_utc()
    if context_type == "service":
        return bool(context_doc.get("is_active", True)) and (context_doc.get("status") or "published") == "published"
    if context_type in ("item", "listing"):
        return bool(context_doc.get("is_active", True)) and (context_doc.get("status") or "") == "published"
    if context_type == "job":
        return bool(context_doc.get("is_active", True)) and (context_doc.get("status") or "").lower() not in ("closed", "filled", "inactive")
    return False


def message_policy_fields(
    *,
    sender_identity_type: str,
    sender_identity_id: str,
    conversation_id: Optional[str],
    context_type: Optional[str],
    context_id: Optional[str],
    context_active: bool,
) -> dict:
    """Additive fields stored on every new message (enforcement stays off)."""
    fields = {
        "sender_identity_type": sender_identity_type,
        "sender_identity_id": sender_identity_id,
        "retention_policy_version": RETENTION_POLICY_VERSION,
        "media_retired": False,
    }
    if conversation_id:
        fields["conversation_id"] = conversation_id
    if context_type:
        fields["context_type"] = context_type
        fields["context_id"] = context_id
    if context_active:
        fields["retention_exempt"] = True
        fields["expires_at"] = None
    else:
        fields["retention_exempt"] = False
        fields["expires_at"] = now_utc() + timedelta(days=RETENTION_DAYS)
    return fields


def conversation_scope(user_id: str, entity_type: str, entity_id: Optional[str]) -> dict:
    """The message-pair scope of one conversation (matches the legacy
    delete-conversation semantics)."""
    if entity_type == "business" and entity_id:
        return {"$or": [
            {"from_user_id": user_id, "to_business_id": entity_id},
            {"entity_type": "business", "to_business_id": entity_id, "from_user_id": {"$ne": user_id}},
        ]}
    if entity_type == "artist" and entity_id:
        return {"$or": [
            {"from_user_id": user_id, "to_artist_id": entity_id},
            {"entity_type": "artist", "to_artist_id": entity_id, "from_user_id": {"$ne": user_id}},
        ]}
    return {"$or": [
        {"from_user_id": user_id, "to_user_id": entity_id},
        {"from_user_id": entity_id, "to_user_id": user_id},
    ]}


async def enforce_media_window(
    user_id: str,
    entity_type: str,
    entity_id: Optional[str],
) -> None:
    """Retire media attachments beyond the latest 15 files per conversation.

    Retirement is logical (media_retired=True); physical file cleanup stays a
    separate, carefully reviewed step.
    """
    if not MEDIA_WINDOW_ENFORCEMENT:
        return
    scope = conversation_scope(user_id, entity_type, entity_id)
    query = {
        **scope,
        "media_url": {"$ne": None},
        "media_retired": {"$ne": True},
    }
    media_messages = await db.messages.find(query, {"message_id": 1}).sort("created_at", 1).to_list(200)
    if len(media_messages) <= MEDIA_WINDOW_FILES:
        return
    to_retire = media_messages[: len(media_messages) - MEDIA_WINDOW_FILES]
    for msg in to_retire:
        await db.messages.update_one(
            {"message_id": msg["message_id"]},
            {"$set": {"media_retired": True, "media_retired_at": now_utc()}},
        )
