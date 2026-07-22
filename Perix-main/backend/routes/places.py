"""Places search proxy using OpenStreetMap Nominatim."""
import logging
from typing import Optional
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


def _extract_public_label(address: dict) -> Optional[str]:
    for key in ("city", "town", "village", "municipality", "county"):
        val = address.get(key)
        if val:
            return val
    return None


@router.get("/autocomplete")
async def places_autocomplete(
    input: str = Query(..., min_length=2),
    near_lat: Optional[float] = Query(None),
    near_lng: Optional[float] = Query(None),
    current_user: UserPublic = Depends(get_current_user),
):
    try:
        params: dict = {
            "q": input,
            "format": "json",
            "limit": 8,
            "addressdetails": 1,
        }
        if near_lat is not None and near_lng is not None:
            vb_lat_delta = 0.5
            vb_lng_delta = 0.5
            params["lat"] = near_lat
            params["lon"] = near_lng
            params["viewbox"] = f"{near_lng - vb_lng_delta},{near_lat + vb_lat_delta},{near_lng + vb_lng_delta},{near_lat - vb_lat_delta}"

        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                NOMINATIM_URL,
                params=params,
                headers=HEADERS,
            )
            results = resp.json()
            predictions = []
            for r in results:
                address = r.get("address", {})
                predictions.append({
                    "place_id": r.get("place_id", r.get("osm_id", "")),
                    "description": r.get("display_name", ""),
                    "lat": float(r["lat"]) if r.get("lat") else None,
                    "lon": float(r["lon"]) if r.get("lon") else None,
                    "public_location_label": _extract_public_label(address),
                })
            return {"predictions": predictions}
    except Exception as e:
        logger.warning(f"Places autocomplete failed: {e}")
        return {"predictions": []}
