"""City Ads promotion models (policy v18, sandbox)."""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class CreativeInput(BaseModel):
    media_url: Optional[str] = None
    media_type: Optional[str] = None  # "image" | "video"
    title: Optional[str] = None
    text: Optional[str] = None
    click_target_type: Optional[str] = None  # business | event | service | product
    click_target_id: Optional[str] = None
    mux_playback_id: Optional[str] = None
    mux_thumbnail_url: Optional[str] = None


class CampaignCreate(BaseModel):
    business_id: str
    city_id: str
    start_date: str
    end_date: str
    creative: CreativeInput


class CampaignActivate(BaseModel):
    business_id: str


class CampaignResponse(BaseModel):
    campaign_id: str
    business_id: str
    city_id: str
    start_date: str
    end_date: str
    creative: Dict[str, Any] = {}
    status: str
    payment_status: str = "none"
    review_status: str = "pending"
    reservations: List[Dict[str, Any]] = []


class ImpressionInput(BaseModel):
    campaign_id: str
    city_id: str
    local_date: str
    slot_number: int
    viewer_key: str


class ImpressionResponse(BaseModel):
    counted: bool
    reason: Optional[str] = None


class CarouselPosition(BaseModel):
    position: int
    shown_group: str
    campaign_id: Optional[str] = None
    business_id: Optional[str] = None
    creative: Optional[Dict[str, Any]] = None
    sponsored: bool = False


class CarouselResponse(BaseModel):
    city_id: str
    local_date: str
    positions: List[CarouselPosition]
