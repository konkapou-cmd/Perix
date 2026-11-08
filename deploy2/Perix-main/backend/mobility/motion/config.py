"""Region-aware motion-engine configuration.

The defaults are intentionally conservative and are calibration parameters,
not claims about a specific operator or city. A mobility region can override
any value through its optional ``motion`` object.
"""
from __future__ import annotations

from copy import deepcopy
from typing import Optional

from mobility.regions import MobilityRegion, get_active_region


DEFAULT_MOTION_CONFIG = {
    "common": {
        "trajectory_step_m": 5.0,
        "calibration_iterations": 10,
        "plan_cache_seconds": 12.0,
        "infrastructure_total_tolerance_m": 25.0,
        "infrastructure_total_tolerance_ratio": 0.02,
    },
    "bus": {
        "acceleration_mps2": 0.95,
        "braking_mps2": 1.20,
        "max_speed_kmh": 50.0,
        "default_speed_kmh": {
            "motorway": 50.0,
            "trunk": 50.0,
            "primary": 50.0,
            "secondary": 50.0,
            "tertiary": 45.0,
            "unclassified": 40.0,
            "residential": 30.0,
            "service": 20.0,
            "living_street": 10.0,
        },
        "turn_speed_kmh": {
            "20": 35.0,
            "40": 25.0,
            "70": 15.0,
        },
        "road_signal_enabled": True,
        "road_signal_cycle_s": 90.0,
        "road_signal_green_ratio": 0.55,
        "road_signal_max_hold_s": 50.0,
        "road_signal_min_stop_s": 4.0,
    },
    "tram": {
        "acceleration_mps2": 0.80,
        "braking_mps2": 1.00,
        "max_speed_kmh": 55.0,
        "default_speed_kmh": 45.0,
        "turn_speed_kmh": {
            "20": 35.0,
            "40": 28.0,
            "70": 20.0,
        },
        # Rail-signal phase timing is operator-specific. Keep the periodic
        # model disabled until a region has calibrated values.
        "rail_signal_enabled": False,
        "rail_signal_cycle_s": 60.0,
        "rail_signal_green_ratio": 0.75,
        "rail_signal_max_hold_s": 30.0,
        "rail_signal_min_stop_s": 3.0,
    },
}


def _deep_merge(base: dict, override: dict) -> dict:
    out = deepcopy(base)
    for key, value in (override or {}).items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = value
    return out


def motion_config_for(
    mode: str,
    region: Optional[MobilityRegion] = None,
) -> dict:
    """Return validated-ish merged common + mode config for one region."""
    resolved_region = region or get_active_region()
    resolved_mode = "tram" if str(mode).lower() == "tram" else "bus"

    common = _deep_merge(
        DEFAULT_MOTION_CONFIG["common"],
        (resolved_region.motion or {}).get("common") or {},
    )
    specific = _deep_merge(
        DEFAULT_MOTION_CONFIG[resolved_mode],
        (resolved_region.motion or {}).get(resolved_mode) or {},
    )
    return {**common, **specific, "mode": resolved_mode}
