"""Read-only public directory, served exclusively from Perix MongoDB."""
from fastapi import APIRouter, HTTPException, Query
from database import db
from public_services.models import PublicService, PublicServicePage
from public_services.repository import TAXONOMY, get_public_service, list_public_services

router = APIRouter(prefix="/public-services", tags=["Public services"])


@router.get("/taxonomy")
async def public_services_taxonomy():
    return TAXONOMY


@router.get("", response_model=PublicServicePage)
async def public_services_list(
    country_code: str = Query(..., pattern=r"^[A-Z]{2}$"),
    city_id: str = Query(..., min_length=1, max_length=80),
    category_id: str | None = Query(None, max_length=100),
    q: str | None = Query(None, max_length=120),
    min_lat: float | None = Query(None, ge=-90, le=90, allow_inf_nan=False),
    max_lat: float | None = Query(None, ge=-90, le=90, allow_inf_nan=False),
    min_lng: float | None = Query(None, ge=-180, le=180, allow_inf_nan=False),
    max_lng: float | None = Query(None, ge=-180, le=180, allow_inf_nan=False),
    cursor: str | None = Query(None, pattern=r"^ps_[a-f0-9]{24}$"),
    limit: int = Query(50, ge=1, le=100),
    include_unlocated: bool = False,
):
    bounds = (min_lat, max_lat, min_lng, max_lng)
    if any(v is not None for v in bounds) and not all(v is not None for v in bounds):
        raise HTTPException(422, "Supply all four viewport bounds")
    return await list_public_services(db.public_services, country_code=country_code, city_id=city_id,
                                     category_id=category_id, q=q,
                                     bounds=bounds if min_lat is not None else None, cursor=cursor, limit=limit,
                                     include_unlocated=include_unlocated)


@router.get("/{service_id}", response_model=PublicService)
async def public_service_detail(service_id: str):
    return await get_public_service(db.public_services, service_id)
