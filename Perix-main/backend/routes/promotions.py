"""City Ads promotion routes (policy v18, sandbox, feature-flagged)."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from database import db
from models.promotion import (
    CampaignActivate,
    CampaignCreate,
    CampaignResponse,
    CarouselResponse,
    ImpressionInput,
    ImpressionResponse,
)
from models.user import UserPublic
from routes.dependencies import get_current_user
from services import ad_inventory

router = APIRouter(prefix="/promotions", tags=["City Ads"])


@router.post("/campaigns", response_model=CampaignResponse)
async def create_campaign(
    payload: CampaignCreate,
    current_user: UserPublic = Depends(get_current_user),
):
    """Hold a City Ads campaign for one city across all requested days."""
    business = await db.businesses.find_one(
        {"business_id": payload.business_id, "owner_id": current_user.user_id}, {"_id": 0, "business_id": 1}
    )
    if not business:
        raise HTTPException(status_code=403, detail="Not authorized for this business")
    return await ad_inventory.reserve_campaign(
        payload.business_id,
        payload.city_id,
        payload.start_date,
        payload.end_date,
        payload.creative.model_dump(),
    )


@router.post("/campaigns/{campaign_id}/activate", response_model=CampaignResponse)
async def activate_campaign(
    campaign_id: str,
    payload: CampaignActivate,
    current_user: UserPublic = Depends(get_current_user),
):
    business = await db.businesses.find_one(
        {"business_id": payload.business_id, "owner_id": current_user.user_id}, {"_id": 0, "business_id": 1}
    )
    if not business:
        raise HTTPException(status_code=403, detail="Not authorized for this business")
    return await ad_inventory.activate_campaign(campaign_id, payload.business_id)


@router.get("/availability")
async def get_availability(
    city_id: str = Query(...),
    start_date: str = Query(...),
    end_date: str = Query(...),
):
    return await ad_inventory.availability(city_id, start_date, end_date)


@router.get("/carousel", response_model=CarouselResponse)
async def get_carousel(
    city_id: str = Query(...),
    local_date: str = Query(...),
    viewer_key: str = Query(...),
):
    return await ad_inventory.carousel(city_id, local_date, viewer_key)


@router.post("/impressions", response_model=ImpressionResponse)
async def record_impression(payload: ImpressionInput):
    return await ad_inventory.record_impression(
        payload.campaign_id,
        payload.city_id,
        payload.local_date,
        payload.slot_number,
        payload.viewer_key,
    )
