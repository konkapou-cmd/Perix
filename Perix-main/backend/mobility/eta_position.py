"""Flag physically impossible position/ETA combinations; NEVER invent ETA.

Straight-line distance is a LOWER bound on travel distance, so a required
minimum average speed above a generous ceiling reliably detects inconsistency.
It does not tell whether GTFS-RT ETA or a virtual vehicle position is wrong.
"""
from typing import Optional

SPEED_LIMIT_KMH = {'tram': 80.0, 'bus': 110.0, 'trolleybus': 100.0}


def position_eta_consistency(mode: str, eta_seconds: Optional[int],
                             distance_straight_m: Optional[float]) -> dict:
    if eta_seconds is None or distance_straight_m is None:
        return {'status': 'UNKNOWN', 'required_kmh': None}
    try:
        remaining = int(eta_seconds)
        distance = float(distance_straight_m)
    except (ValueError, TypeError):
        return {'status': 'UNKNOWN', 'required_kmh': None}
    if remaining < 0 or not (0 <= distance < 1000000):
        return {'status': 'UNKNOWN', 'required_kmh': None}
    ceiling = SPEED_LIMIT_KMH.get(str(mode).lower())
    if not ceiling:
        return {'status': 'UNKNOWN', 'required_kmh': None}
    if remaining == 0:
        speed = float('inf') if distance > 120 else 0.0
    else:
        speed = distance * 3.6 / remaining
    if speed > ceiling and distance > 180:
        return {'status': 'INCONSISTENT', 'required_kmh': round(speed, 1) if speed != float('inf') else None,
                'ceiling_kmh': ceiling, 'explanation': 'STRAIGHT_LINE_SPEED_IMPOSSIBLE'}
    return {'status': 'PLAUSIBLE_LOWER_BOUND_ONLY', 'required_kmh': round(speed, 1),
            'ceiling_kmh': ceiling}
