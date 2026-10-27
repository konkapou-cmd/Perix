"""Validate ordered static stop visits without collapsing repeated stop IDs."""


def stop_occurrence_times(trip: dict):
    """Return aligned visits, None for legacy data; reject malformed new data."""
    if "stop_times_sequence" not in trip:
        return None
    visits = trip["stop_times_sequence"]
    ids = trip.get("stop_ids") or []
    sequences = trip.get("stop_sequences") or []
    if not isinstance(visits, list) or not ids or not (len(visits) == len(ids) == len(sequences)):
        raise ValueError("Incomplete stop occurrence times")
    previous = -1
    for sid, sequence, visit in zip(ids, sequences, visits):
        if (
            not isinstance(visit, dict)
            or type(sequence) is not int
            or sequence <= previous
            or visit.get("stop_sequence") != sequence
            or str(visit.get("stop_id")) != str(sid)
            or not isinstance(visit.get("arrival_time"), str)
            or not visit["arrival_time"]
            or not isinstance(visit.get("departure_time"), str)
            or not visit["departure_time"]
        ):
            raise ValueError("Misaligned stop occurrence times")
        previous = sequence
    return visits
