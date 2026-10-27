"""Occurrence-aware GTFS-RT evidence, without inventing source clocks."""
from collections import Counter
import hashlib
import json

REALTIME_BASES = frozenset(('DIRECT_STOP_UPDATE', 'STOP_DELAY', 'PROPAGATED_STOP_DEPARTURE',
                            'TRIP_DELAY', 'FROM_DEPARTURE_UPDATE', 'FROM_ARRIVAL_UPDATE', 'BETWEEN_STOP_UPDATES'))


def has_realtime_timing(entry):
    return entry.get('timing_basis') in REALTIME_BASES or entry.get('departure_timing_basis') in REALTIME_BASES


def stop_evidence(realtime, sid, sequence=None, repeated=False):
    """Prefer source sequence identity; ambiguous repeated IDs are not guessed."""
    raw_sid, sid = sid, str(sid)
    if sequence is not None:
        key = str(sequence)
        prediction = (realtime.get("stop_predictions_by_sequence") or {}).get(key)
        relationship = (realtime.get("stop_relationships_by_sequence") or {}).get(key)
        delay = (realtime.get("stop_delays_by_sequence") or {}).get(key)
        records = [v for v in (prediction, relationship, delay) if v is not None]
        if records:
            if any(not isinstance(v, dict) or str(v.get("stop_id")) != sid for v in records):
                return {}, None, "SCHEDULED", True
            return (
                {k: v for k, v in (prediction or {}).items() if k != "stop_id"},
                (delay or {}).get("delay_seconds"),
                str((relationship or {}).get("relationship") or "SCHEDULED").upper(),
                False,
            )
    predictions = realtime.get("stop_predictions") or {}
    delays = realtime.get("stop_delays") or {}
    relationships = realtime.get("stop_relationships") or {}
    if repeated:
        ambiguous = any(sid in values or raw_sid in values for values in (predictions, delays, relationships))
        return {}, None, "SCHEDULED", ambiguous
    return (predictions.get(sid, predictions.get(raw_sid)) or {}, delays.get(sid, delays.get(raw_sid)),
            str(relationships.get(sid, relationships.get(raw_sid)) or "SCHEDULED").upper(), False)


def occurrence_counts(stops):
    return Counter(str(s.get("stop_id")) for s in stops)


def timing_evidence(entry):
    """Small backwards-compatible projection shared by fleet/boards/details."""
    return {k: entry.get(k) for k in (
        "timing_basis", "departure_timing_basis", "timing_anchor_stop_id",
        "timing_anchor_sequence", "timing_anchor_delay_seconds",
        "provider_predicted_arrival_s", "provider_predicted_departure_s",
        "ambiguous_stop_update", "timing_order_adjusted", "stop_sequence",
        "timing_next_anchor_stop_id", "timing_next_anchor_sequence",
        "timing_previous_departure_s", "timing_next_arrival_s",
        "timing_neighbor_constraint",
    )}


def extract_trip_timing(update, matched, relationship_names):
    """Normalize provider fields without conflating arrival/departure or visits."""
    from mobility.realtime_trip_identity import stop_id_for_sequence
    stop_delays, predictions, relationships = {}, {}, {}
    sequence_delays, sequence_predictions, sequence_relationships = {}, {}, {}
    first_delay = None
    for value in update.stop_time_update:
        sequence = int(value.stop_sequence) if value.HasField("stop_sequence") else None
        sid = str(value.stop_id or "")
        if not sid and sequence is not None:
            sid = stop_id_for_sequence(matched, sequence) or ""
        if not sid:
            continue
        rel = relationship_names.get(int(value.schedule_relationship), "SCHEDULED")
        relationships[sid] = rel
        prediction = {}
        for field in ("arrival", "departure"):
            if not value.HasField(field):
                continue
            event = getattr(value, field)
            if event.HasField("delay"):
                prediction[field + "_delay_seconds"] = int(event.delay)
            if event.HasField("time") and event.time:
                prediction[field + "_epoch"] = int(event.time)
        delay = prediction.get("arrival_delay_seconds", prediction.get("departure_delay_seconds"))
        if delay is not None:
            stop_delays[sid] = delay
            if first_delay is None:
                first_delay = delay
        if prediction:
            predictions[sid] = prediction
        if (sequence is not None and matched.get("original_stop_sequences")
                and stop_id_for_sequence(matched, sequence) == sid):
            key = str(sequence)
            sequence_relationships[key] = {"stop_id": sid, "relationship": rel}
            if prediction:
                sequence_predictions[key] = {"stop_id": sid, **prediction}
            if delay is not None:
                sequence_delays[key] = {"stop_id": sid, "delay_seconds": delay}
    explicit = int(update.delay) if update.HasField("delay") else None
    result = {
        "delay_seconds": explicit if explicit is not None else first_delay if first_delay is not None else 0,
        "trip_delay_observed": explicit is not None or first_delay is not None,
        "trip_delay_kind": "EXPLICIT_TRIP_DELAY" if explicit is not None else "FIRST_STOP_DERIVED" if first_delay is not None else "NONE",
        "stop_delays": stop_delays, "stop_predictions": predictions, "stop_relationships": relationships,
        "stop_delays_by_sequence": sequence_delays, "stop_predictions_by_sequence": sequence_predictions,
        "stop_relationships_by_sequence": sequence_relationships,
    }
    result["timing_fingerprint"] = hashlib.sha256(json.dumps(result, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:24]
    result["trip_update_timestamp"] = int(update.timestamp) if update.HasField("timestamp") else None
    result["source_match_validated"] = True
    return result
