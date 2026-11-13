"""Account entitlements and subscription routes (policy v18, shadow mode)."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from database import db
from models.entitlement import EntitlementSnapshot
from models.user import UserPublic
from routes.dependencies import get_current_user
from services.entitlements import build_entitlement_snapshot

router = APIRouter(prefix="/account", tags=["Account"])


@router.get("/entitlements", response_model=EntitlementSnapshot)
async def get_entitlements(
    actor_type: str = Query("user", pattern="^(user|business|artist)$"),
    actor_id: Optional[str] = None,
    current_user: UserPublic = Depends(get_current_user),
):
    """Server-computed entitlement snapshot for a verified actor.

    Ownership is verified server-side; the client can never read another
    owner's business snapshot. Artist is accepted only to return a clear
    deprecation error (decision D13).
    """
    if actor_type == "artist":
        raise HTTPException(
            status_code=400,
            detail="Artist identity is deprecated (decision D13); use a Business profile with an artists-performers specialty.",
        )

    if actor_type == "user":
        actor_id = current_user.user_id
    else:
        if not actor_id:
            raise HTTPException(status_code=400, detail="business_id is required for actor_type=business")
        business = await db.businesses.find_one(
            {"business_id": actor_id, "owner_id": current_user.user_id}, {"_id": 0, "business_id": 1}
        )
        if not business:
            raise HTTPException(status_code=403, detail="Not authorized for this business")

    return await build_entitlement_snapshot(actor_type, actor_id, current_user)
