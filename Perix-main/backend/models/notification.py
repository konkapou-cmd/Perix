"""Notification-related Pydantic models."""
from pydantic import BaseModel
from typing import Optional, Dict


class PushTokenRegister(BaseModel):
    push_token: str
    platform: str = "android"  # "ios" or "android"


class NotificationPayload(BaseModel):
    title: str
    body: str
    data: Optional[Dict] = None


class NotificationPreferences(BaseModel):
    messages: bool = True
    events: bool = True
    activities: bool = True
    friendRequests: bool = True
    calls: bool = True
    marketing: bool = False


class NotificationPreferencesResponse(BaseModel):
    messages: bool = True
    events: bool = True
    activities: bool = True
    friendRequests: bool = True
    calls: bool = True
    marketing: bool = False
