"""Traffic-observation adapter for the motion engine.

Phase 2 uses the Phase-1 static/historical traffic profiles. Future live
providers (for example Google Routes traffic observations where permitted)
must plug in here so bus.py and engine.py remain provider-agnostic.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from mobility.traffic_profiles import traffic_for_edges

PROVIDER_NAME = "STATIC_PROFILE_V1"


async def traffic_snapshot_for_edges(
    edges: list[dict],
    when: datetime,
    *,
    region_id: Optional[str] = None,
    network_id: Optional[str] = None,
) -> dict:
    by_edge = await traffic_for_edges(
        edges,
        when,
        region_id=region_id,
        network_id=network_id,
    )
    versions = sorted(
        {
            str(value.get("profile_version"))
            for value in by_edge.values()
            if value.get("profile_version")
        }
    )
    return {
        "provider": PROVIDER_NAME,
        "profile_versions": versions,
        "by_edge": by_edge,
    }
