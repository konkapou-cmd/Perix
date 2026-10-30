"""Traffic-observation adapter for the motion engine.

Static profiles remain the fallback. Baseline callers never consume Google.
Google Locator reads fresh observations; refresh also requires caller and
environment opt-in.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from typing import Literal

from mobility.traffic_profiles import traffic_for_edges
from mobility.motion.google_traffic import google_traffic_for_edges

PROVIDER_NAME = "STATIC_PROFILE_V1"
TrafficContext = Literal["baseline", "google_locator"]


def validate_traffic_context(value: str) -> str:
    if value not in ("baseline", "google_locator"):
        raise ValueError("invalid traffic context")
    return value


async def traffic_snapshot_for_edges(
    edges: list[dict],
    when: datetime,
    *,
    region_id: Optional[str] = None,
    network_id: Optional[str] = None,
    allow_live_fetch: bool = False,
    traffic_context: TrafficContext = "baseline",
) -> dict:
    validate_traffic_context(traffic_context)
    static = await traffic_for_edges(
        edges,
        when,
        region_id=region_id,
        network_id=network_id,
    )
    by_edge = {
        edge_id: {**value, "provider": PROVIDER_NAME}
        for edge_id, value in static.items()
    }
    google = await google_traffic_for_edges(
        edges, when, region_id=region_id, network_id=network_id,
        allow_live_fetch=allow_live_fetch,
    ) if traffic_context == "google_locator" else {}
    by_edge.update(google)
    providers = sorted({value["provider"] for value in by_edge.values()})
    versions = sorted(
        {
            str(value.get("profile_version"))
            for value in by_edge.values()
            if value.get("profile_version")
        }
    )
    snapshot = {
        "provider": "+".join(providers) if google else PROVIDER_NAME,
        "providers": providers,
        "profile_versions": versions,
        "by_edge": by_edge,
    }
    return snapshot
