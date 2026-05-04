"""Subscription-related Pydantic models."""
from pydantic import BaseModel


class SubscriptionPlanResponse(BaseModel):
    monthly_plan_id: str
    yearly_plan_id: str
    trial_days: int
    monthly_price: float
    yearly_price: float
    currency: str


class SubscriptionCreate(BaseModel):
    business_id: str
    plan_type: str


class SubscriptionResponse(BaseModel):
    subscription_id: str
    approval_url: str
    status: str
