"""Region-aware motion-engine configuration.

The defaults are intentionally conservative and are calibration parameters,
not claims about a specific operator or city. A mobility region can override
any value through its optional ``motion`` object.
"""
from __future__ import annotations

from copy import deepcopy
from typing import Optional

from mobility.regions import MobilityRegion, get_active_region


# Optical station-cycle policy only; never provider timestamps or physical dwell.
STATION_CYCLE_STOP_LEAD_S = 30.0
# Preserve a twenty-second approach/deceleration window before parking.
STATION_CYCLE_APPROACH_LEAD_S = 50.0


DEFAULT_MOTION_CONFIG = {
    "visual": {
        "visual_rule_version": "station-relative-v1",
        "initial_coverage_s": 40.0,
        "rolling_coverage_s": 15.0,
        "initial_preparation_budget_s": 2.0,
        "relative_motion_levels": [1, 2, 3, 4, 5, 6],
        "relative_motion_rate_per_s": 1.0,
        "handover_min_ramp_s": 2.0,
    },
    "common": {
        "trajectory_step_m": 5.0,
        "calibration_iterations": 10,
        "plan_cache_seconds": 12.0,
        "infrastructure_total_tolerance_m": 25.0,
        "infrastructure_total_tolerance_ratio": 0.02,
    },
    "bus": {
        "acceleration_mps2": 1.20,
        "braking_mps2": 1.40,
        "max_speed_kmh": 60.0,
        "default_speed_kmh": {
            "motorway": 60.0,
            "trunk": 60.0,
            "primary": 60.0,
            "secondary": 55.0,
            "tertiary": 50.0,
            "unclassified": 45.0,
            "residential": 35.0,
            "service": 25.0,
            "living_street": 15.0,
        },
        "turn_speed_kmh": {
            "20": 40.0,
            "40": 30.0,
            "70": 20.0,
        },
        "road_signal_enabled": True,
        "road_signal_cycle_s": 60.0,
        "road_signal_green_ratio": 0.65,
        "road_signal_max_hold_s": 35.0,
        "road_signal_min_stop_s": 3.0,
    },
    "tram": {
        "acceleration_mps2": 1.00,
        "braking_mps2": 1.20,
        "max_speed_kmh": 65.0,
        "default_speed_kmh": 50.0,
        "turn_speed_kmh": {
            "20": 40.0,
            "40": 32.0,
            "70": 24.0,
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
    visual = _deep_merge(DEFAULT_MOTION_CONFIG["visual"], (resolved_region.motion or {}).get("visual") or {})
    return {**common, **specific, "mode": resolved_mode, "visual": visual}


def visual_scale_parameters(visual: dict) -> dict:
    """Publication-only scale marks; do not feed these into profile signatures.

    Half marks guide presentation. Motion remains fully continuous, including
    values between the marks; physical units/source clock windows are untouched.
    """
    result = {**visual, 'relative_motion_continuous': True,
            'relative_motion_fractional_step': 0.5,
            'relative_motion_level_marks': [1+i*0.5 for i in range(11)]}
    if visual.get('visual_rule_version') == 'station-cycle-v2':
        result.update(station_approach_lead_s=STATION_CYCLE_APPROACH_LEAD_S,
                      station_stop_lead_s=STATION_CYCLE_STOP_LEAD_S, station_window_occurrences=3)
    return result
