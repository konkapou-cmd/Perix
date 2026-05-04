"""Places search proxy using OpenStreetMap Nominatim."""
import logging
from fastapi import APIRouter, Depends, Query

import httpx
from routes.dependencies import get_current_user, UserPublic

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/places", tags=["Places"])

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
HEADERS = {
    "User-Agent": "PerixApp/2.0 (perix.app)",
    "Accept": "application/json",
}


@router.get("/autocomplete")
async def places_autocomplete(
    input: str = Query(..., min_length=2),
    current_user: UserPublic = Depends(get_current_user),
):
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                NOMINATIM_URL,
                params={
                    "q": input,
                    "format": "json",
                    "limit": 5,
                    "addressdetails": 1,
                    "featuretype": "city",
                },
                headers=HEADERS,
            )
            results = resp.json()
            predictions = []
            for r in results:
                predictions.append({
                    "place_id": r.get("place_id", r.get("osm_id", "")),
                    "description": r.get("display_name", ""),
                    "lat": float(r["lat"]) if r.get("lat") else None,
                    "lng": float(r["lon"]) if r.get("lon") else None,
                })
            return {"predictions": predictions}
    except Exception as e:
        logger.warning(f"Places autocomplete failed: {e}")
        return {"predictions": []}
