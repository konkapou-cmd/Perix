"""Google Roads API - snap-to-road for GPS observations."""
import os
from typing import Optional

import httpx

GOOGLE_KEY = os.getenv("GOOGLE_API_KEY", "")
SNAP_URL = "https://roads.googleapis.com/v1/snapToRoads"


async def snap_to_road(vehicle_id: str, lat: float, lng: float) -> Optional[dict]:
    """Snap the current GPS point to the actual road using the previous two
    observations as a path (Google Roads API). Returns the snapped
    {latitude, longitude} or None."""
    if not GOOGLE_KEY:
        return None
    from database import db

    prev = (
        await db.mobility_position_observations.find({"vehicle_id": vehicle_id})
        .sort("received_at", -1)
        .limit(2)
        .to_list(2)
    )
    pts = [
        (float(p["latitude"]), float(p["longitude"]))
        for p in reversed(prev)
        if p.get("latitude") is not None and p.get("longitude") is not None
    ]
    pts.append((float(lat), float(lng)))
    path = "|".join(f"{a},{b}" for a, b in pts)
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(
                SNAP_URL,
                params={"path": path, "interpolate": "true", "key": GOOGLE_KEY},
            )
            if resp.status_code != 200:
                return None
            snapped = (resp.json().get("snappedPoints") or [])
            if not snapped:
                return None
            loc = snapped[-1].get("location") or {}
            if loc.get("latitude") is None or loc.get("longitude") is None:
                return None
            return {"latitude": float(loc["latitude"]), "longitude": float(loc["longitude"])}
    except Exception:
        return None
