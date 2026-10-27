"""Do not treat simulated history as a newer provider observation."""
import hashlib
import uuid
from mobility.timing_evidence import REALTIME_BASES

MODEL_EPOCH = uuid.uuid4().hex[:12]
EPSILON_M = 0.000001


def estimate_revision(identity, correction=None):
    token = correction or hashlib.sha256(repr(identity).encode()).hexdigest()[:16]
    return MODEL_EPOCH + ':' + token


def source_frontier_conflict(previous_source, current_source, stop_progress, progress, now_sec):
    """Return the revised source anchor that a cached virtual position outruns.

    Only a changed, usable source clock can contradict simulation. Schedule/
    NO_DATA alone is not upgraded into a physical stop observation. No source
    coordinate is changed here and no actual GPS state enters this helper.
    """
    if len(previous_source) != len(current_source) or len(stop_progress) < len(current_source):
        return None
    if [(e.get('stop_id'), e.get('stop_sequence')) for e in previous_source] != [
            (e.get('stop_id'), e.get('stop_sequence')) for e in current_source]:
        return None
    for index, (old, new) in enumerate(zip(previous_source, current_source)):
        if new.get('relationship') in ('SKIPPED', 'NO_DATA') or new.get('timing_order_adjusted'):
            continue
        basis = new.get('timing_basis')
        arrival_usable = basis in REALTIME_BASES
        departure_usable = new.get('departure_timing_basis') in REALTIME_BASES
        if not arrival_usable and not departure_usable:
            continue
        arrival = new['predicted_arrival']; departure = new['predicted_departure']
        anchor = float(stop_progress[index])
        if (arrival_usable and arrival != old['predicted_arrival'] and arrival > now_sec and index > 0
                and progress >= anchor - EPSILON_M):
            return {'reason': 'REVISED_SOURCE_ARRIVAL_AHEAD', 'anchor_index': index}
        if (departure_usable and departure != old['predicted_departure'] and departure > now_sec
                and progress > anchor + EPSILON_M):
            return {'reason': 'REVISED_SOURCE_DEPARTURE_AHEAD', 'anchor_index': index}
        explicit = new.get('provider_predicted_arrival_s') is not None or new.get('provider_predicted_departure_s') is not None
        revised = (arrival != old['predicted_arrival'] or departure != old['predicted_departure']
                   or (explicit and old.get('provider_predicted_arrival_s') is None and old.get('provider_predicted_departure_s') is None))
        if explicit and revised and departure <= now_sec and progress < anchor - EPSILON_M:
            return {'reason': 'REVISED_SOURCE_ANCHOR_PASSED', 'anchor_index': index}
    return None


def source_start_index(timeline, now_sec):
    """Start a fresh simulation at the latest usable source timing anchor.

    Earlier simulated delays are not evidence overriding a later source clock.
    Retain one final leg when the destination event is already in the past.
    """
    result = None
    for index, entry in enumerate(timeline):
        if entry.get('relationship') in ('SKIPPED', 'NO_DATA') or entry.get('timing_order_adjusted'):
            continue
        arrival_known = entry.get('provider_predicted_arrival_s') is not None or entry.get('timing_basis') == 'STOP_DELAY'
        departure_known = entry.get('provider_predicted_departure_s') is not None
        if ((arrival_known and entry['predicted_arrival'] <= now_sec)
                or (departure_known and entry['predicted_departure'] <= now_sec)):
            result = index
    if result is not None:
        result = min(result, max(0, len(timeline) - 2))
    return result


def initial_source_index(timeline, now_sec):
    """Choose an initial modeled source interval, not an observed passage.

    A fresh page can initialize from timetable/propagated clocks. Do not replay
    accumulated simulated lateness from the first stop as historical fact.
    Arrived-but-not-departed occurrences remain the current source interval.
    """
    usable=[i for i,e in enumerate(timeline) if e.get('relationship')!='SKIPPED'
            and not e.get('timing_order_adjusted')]
    if len(usable)<2:
        return None
    index=usable[0]
    for candidate in usable:
        if float(timeline[candidate]['predicted_arrival'])>now_sec:
            break
        index=candidate
        if float(timeline[candidate]['predicted_departure'])>now_sec:
            break
    return index if index!=usable[-1] else usable[-2]
