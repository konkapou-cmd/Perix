"""Missing safe public read models, not a second feed or Locator engine."""
from fastapi import APIRouter, Query, HTTPException
from database import db
from public_services.discovery import Kind, CityEntity, read_detail, read_list, read_comments

router = APIRouter(prefix="/public-directory", tags=["Public read models"])


@router.get("/{kind}")
async def city_public_list(kind: Kind,
    min_lat: float = Query(..., ge=-90, le=90, allow_inf_nan=False),
    max_lat: float = Query(..., ge=-90, le=90, allow_inf_nan=False),
    min_lng: float = Query(..., ge=-180, le=180, allow_inf_nan=False),
    max_lng: float = Query(..., ge=-180, le=180, allow_inf_nan=False),
    root: str | None = Query(None, max_length=100),
    subcategories: str | None = Query(None, max_length=3000),
    themes: str | None = Query(None, max_length=2000),
    property_type: str | None = Query(None, max_length=80),
    job_type: str | None = Query(None, max_length=80),
    service_type: str | None = Query(None, max_length=80),
    q: str | None = Query(None, max_length=120),
    cursor: str | None = Query(None, max_length=120),
    city_id: str = Query("de-magdeburg", max_length=80),
    publisher_id: str | None = Query(None, max_length=120),
    publisher_type: str | None = Query(None, max_length=20),
    limit: int = Query(30, ge=1, le=100)):
    if kind == "user":
        raise HTTPException(422, "Public user profiles support direct detail reads only, not geospatial enumeration")
    return await read_list(db, kind, (min_lat, max_lat, min_lng, max_lng), root=root,
                           subcategories=subcategories.split(",") if subcategories else None,
                           themes=themes.split(",") if themes else None, property_type=property_type,
                           job_type=job_type, q=q, cursor=cursor, limit=limit, city_id=city_id,
                           publisher_id=publisher_id, publisher_type=publisher_type, service_type=service_type)


@router.get("/{kind}/{entity_id}", response_model=CityEntity)
async def city_public_detail(kind: Kind, entity_id: str):
    return await read_detail(db, kind, entity_id)


@router.get("/post/{post_id}/comments")
async def city_public_comments(post_id: str, skip: int = Query(0, ge=0, le=10000), limit: int = Query(30, ge=1, le=100)):
    return await read_comments(db, post_id, skip, limit)
