"""Subscription contract models (policy v18).

The collections are defined now so the entitlement resolver and later
billing phases share one contract. No real charging is implemented in the
shadow phase.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SubscriptionRecord(BaseModel):
    subscriber_id: str
    plan_id: str
    status: str  # active | cancelled | past_due | expired | founder
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None
    founder_exemption: bool = False
    created_at: Optional[datetime] = None


class SubscriptionResponse(SubscriptionRecord):
    subscription_id: str
