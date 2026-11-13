"""Entitlement snapshot models (policy v18 -> v19, shadow mode)."""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class RedemptionInfo(BaseModel):
    code: str
    plan: str
    redeemed_at: Optional[str] = None
    profile_complete_deadline: Optional[str] = None
    reverted: bool = False


class EntitlementSnapshot(BaseModel):
    policy_version: str
    enforcement_mode: str
    actor_type: str
    actor_id: str
    period_key: Optional[str] = None
    period_zone: Optional[str] = None
    effective_plan: Optional[str] = None
    subscription_status: Optional[str] = None
    founder_active: bool = False
    founder_until: Optional[str] = None
    limits: Dict[str, Any] = {}
    usage: Dict[str, Any] = {}
    remaining: Dict[str, Any] = {}
    next_reset_at: Optional[str] = None
    reason_codes: List[str] = []
    # v19: interim redemption codes (User100 / Pro100) and the Business
    # plan grant applied when the business is created.
    business_plan_grant: Optional[str] = None
    redemption: Optional[RedemptionInfo] = None
