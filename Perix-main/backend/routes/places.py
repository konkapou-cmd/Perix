"""Places search proxy using OpenStreetMap Nominatim."""
import asyncio
import logging
import time
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

# Nominatim usage policy: max 1 request per second. Throttle all outgoing
# requests so bursts of keystrokes don't get rate-limited (429/403).
_nominatim_lock = asyncio.Lock()
_last_nominatim_request = 0.0


def _extract_public_label(address: dict) -> Optional[str]:
    for key in ("road", "pedestrian", "city", "town", "village", "municipality", "county"):
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
    global _last_nominatim_request
    try:
        params: dict = {
            "q": input,
            "format": "jsonv2",
            "limit": 10,
            "addressdetails": 1,
            "accept-language": "en",
            "dedupe": 1,
        }
        if near_lat is not None and near_lng is not None:
            vb_lat_delta = 0.6
            vb_lng_delta = 0.6
            params["lat"] = near_lat
            params["lon"] = near_lng
            params["viewbox"] = f"{near_lng - vb_lng_delta},{near_lat + vb_lat_delta},{near_lng + vb_lng_delta},{near_lat - vb_lat_delta}"

        async with _nominatim_lock:
            now = time.monotonic()
            wait = 1.1 - (now - _last_nominatim_request)
            if wait > 0:
                await asyncio.sleep(wait)

            results = None
            last_err = None
            for attempt in range(3):
                try:
                    async with httpx.AsyncClient(timeout=15) as client:
                        resp = await client.get(
                            NOMINATIM_URL,
                            params=params,
                            headers=HEADERS,
                        )
                        if resp.status_code in (429, 403):
                            # Rate limited — back off and retry
                            last_err = f"Nominatim rate limit ({resp.status_code})"
                            await asyncio.sleep(1.2 * (attempt + 1))
                            continue
                        resp.raise_for_status()
                        results = resp.json()
                        break
                except Exception as e:
                    last_err = e
                    if attempt < 2:
                        await asyncio.sleep(0.5 * (attempt + 1))

            _last_nominatim_request = time.monotonic()

        if results is None:
            logger.warning(f"Places autocomplete failed after retries: {last_err}")
            return {"predictions": []}

        predictions = []
        for r in results:
            address = r.get("address", {})
            predictions.append({
                "place_id": r.get("place_id", r.get("osm_id", "")),
                "description": r.get("display_name", ""),
                "lat": float(r["lat"]) if r.get("lat") else None,
                "lon": float(r["lon"]) if r.get("lon") else None,
                "lng": float(r["lon"]) if r.get("lon") else None,
                "public_location_label": _extract_public_label(address),
            })
        return {"predictions": predictions}
    except Exception as e:
        logger.warning(f"Places autocomplete failed: {e}")
        return {"predictions": []}
