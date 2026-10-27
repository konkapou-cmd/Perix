"""Conservative source attribution for Perix transit arrival predictions.

A LIVE position does not make an arrival-time prediction GPS-derived.
GTFS-RT NO_DATA is not an independently verified realtime ETA.
"""
from typing import Optional


def eta_source_for_stop(realtime: Optional[dict], stop_id: str, entry: Optional[dict] = None) -> str:
    if entry and entry.get('timing_basis') is not None:
        return {'DIRECT_STOP_UPDATE': 'REALTIME', 'STOP_DELAY': 'REALTIME',
                'PROPAGATED_STOP_DEPARTURE': 'REALTIME_PROPAGATED',
                'FROM_DEPARTURE_UPDATE': 'REALTIME_PROPAGATED',
                'BETWEEN_STOP_UPDATES': 'REALTIME_PROPAGATED',
                'TRIP_DELAY': 'REALTIME'}.get(entry['timing_basis'], 'SCHEDULE')
    if not realtime:
        return "SCHEDULE"
    sid = str(stop_id)
    relationship = (realtime.get("stop_relationships") or {}).get(sid, "SCHEDULED")
    if str(relationship).upper() == "NO_DATA":
        return "SCHEDULE"
    predictions = (realtime.get("stop_predictions") or {}).get(sid) or {}
    if any(predictions.get(k) is not None for k in (
        "arrival_epoch", "departure_epoch",
        "arrival_delay_seconds", "departure_delay_seconds"
    )):
        return "REALTIME"
    if sid in (realtime.get("stop_delays") or {}):
        return "REALTIME"
    if realtime.get("trip_delay_observed") is True:
        return "REALTIME"
    # Compatibility with older stored GTFS-RT docs that lack the observed flag:
    # a nonzero trip delay is evidence, a synthetic zero is not.
    if realtime.get("trip_delay_observed") is None and int(realtime.get("delay_seconds") or 0) != 0:
        return "REALTIME"
    return "SCHEDULE"
