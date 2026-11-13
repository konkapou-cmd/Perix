"""Redemption codes route (v19): POST /api/account/redeem.

Interim access without payment: User100 -> Premium, Pro100 -> Business
(first 100 uses each). Stripe billing replaces this later.
"""
from fastapi import APIRouter, Depends

from models.redeem import RedeemRequest, RedeemResponse
from models.user import UserPublic
from routes.dependencies import get_current_user
from utils.redemption import redeem_code

router = APIRouter(prefix="/account", tags=["Account"])


@router.post("/redeem", response_model=RedeemResponse)
async def redeem(
    payload: RedeemRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    return await redeem_code(
        current_user.user_id,
        getattr(current_user, "email", "") or "",
        payload.code,
    )
