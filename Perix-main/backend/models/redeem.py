"""Redemption code models (v19 interim access)."""
from typing import Optional

from pydantic import BaseModel


class RedeemRequest(BaseModel):
    code: str


class RedeemResponse(BaseModel):
    ok: bool
    error: Optional[str] = None
    plan: Optional[str] = None
    code: Optional[str] = None
    profile_complete_deadline: Optional[str] = None
    message: str = ""
