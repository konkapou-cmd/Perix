"""Saved items Pydantic models."""
from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime


class SavedItemCreate(BaseModel):
    item_type: str  # "event", "activity", "job", "post", "business"
    item_id: str


class SavedItemResponse(BaseModel):
    saved_id: str
    user_id: str
    item_type: str
    item_id: str
    created_at: datetime
    item_data: Optional[Any] = None


class SavedToggleResponse(BaseModel):
    is_saved: bool


class SavedListResponse(BaseModel):
    items: List[SavedItemResponse]
    total: int
