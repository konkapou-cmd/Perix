"""Stateful continuity helpers for realtime motion-plan replacement."""
from __future__ import annotations
import os
from typing import Optional

HANDOVER_SCHEMA_VERSION = 1
HANDOVER_MAX_AGE_S = 90.0
BACKWARD_TOLERANCE_M = 0.5

def handover_enabled() -> bool:
    return os.getenv("MOBILITY_PLAN_HANDOVER_ENABLED", "false").lower() == "true"



def stable_trip_identity(*, region_id: str, network_id: str, version_id: str,
                         pattern_id: str, trip_id: str,
                         derived_generation: Optional[str]) -> tuple[str, ...]:
    return (
        str(region_id), str(network_id), str(version_id),
        str(pattern_id), str(trip_id), str(derived_generation or ""),
    )


def handover_anchor_from_state(state: Optional[dict], *, now_service_s: float,
                               total_m: float,
                               max_age_s: float = HANDOVER_MAX_AGE_S) -> Optional[dict]:
    if not state:
        return None
    previous_service_s = float(state.get("service_s") or 0.0)
    now_value = float(now_service_s)
    if previous_service_s <= 0.0 or now_value < previous_service_s:
        return None
    if now_value - previous_service_s > float(max_age_s):
        return None
    progress = float(state.get("progress_m") or 0.0)
    total = max(0.0, float(total_m))
    if progress <= 0.5 or progress >= max(0.5, total - 0.5):
        return None
    return {
        "schema_v": HANDOVER_SCHEMA_VERSION,
        "progress_m": progress,
        "speed_kmh": max(0.0, float(state.get("speed_kmh") or 0.0)),
        "service_s": now_value,
        "previous_service_s": previous_service_s,
        "previous_next_timeline_index": state.get("next_timeline_index"),
        "carried_lateness_s": max(
            0.0, float(state.get("carried_lateness_s") or 0.0)
        ),
        "previous_fit": state.get("fit"),
        "previous_timeline_signature": state.get("timeline_signature"),
    }


def find_handover_leg_index(anchors: list[dict], progress_m: float,
                            *, tolerance_m: float = 1.0) -> Optional[int]:
    if len(anchors or []) < 2:
        return None
    progress = float(progress_m)
    tol = max(0.0, float(tolerance_m))
    for index in range(len(anchors) - 1):
        start = float(anchors[index].get("progress_m") or 0.0)
        end = float(anchors[index + 1].get("progress_m") or 0.0)
        if start - tol <= progress < end - tol:
            return index
        if abs(progress - start) <= tol and end > start:
            return index
    return None


def continuity_guard(sampled: dict, previous_state: Optional[dict],
                     *, tolerance_m: float = BACKWARD_TOLERANCE_M) -> dict:
    out = dict(sampled or {})
    out.setdefault("continuity_clamp_m", 0.0)
    out.setdefault("backward_resample_prevented_m", 0.0)
    if not previous_state or out.get("progress_m") is None:
        return out
    previous = float(previous_state.get("progress_m") or 0.0)
    current = float(out.get("progress_m") or 0.0)
    regression = previous - current
    if regression <= max(0.0, float(tolerance_m)):
        return out
    out["backward_resample_prevented_m"] = round(regression, 3)
    out["continuity_clamp_m"] = round(regression, 3)
    out["progress_m"] = previous
    out["speed_kmh"] = 0.0
    out["motion_state"] = "CONTINUITY_GUARD"
    return out


def state_from_sample(*, sample: dict, service_s: float,
                      timeline_signature: str) -> dict:
    return {
        "schema_v": HANDOVER_SCHEMA_VERSION,
        "progress_m": float(sample.get("progress_m") or 0.0),
        "speed_kmh": max(0.0, float(sample.get("speed_kmh") or 0.0)),
        "service_s": float(service_s),
        "next_timeline_index": sample.get("next_timeline_index"),
        "carried_lateness_s": max(
            0.0, float(sample.get("carried_lateness_s") or 0.0)
        ),
        "fit": sample.get("fit"),
        "timeline_signature": str(timeline_signature),
    }
