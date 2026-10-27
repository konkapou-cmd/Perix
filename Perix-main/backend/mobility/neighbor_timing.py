"""Combine adjacent source stop constraints without manufacturing observations."""
from copy import deepcopy


def _direct(entry):
    return (entry.get('provider_predicted_arrival_s') is not None
            or entry.get('provider_predicted_departure_s') is not None
            or entry.get('timing_basis') == 'STOP_DELAY')


def combine_neighbor_timings(timeline):
    """Bound *missing* stop clocks between consecutive source anchors.

    Scheduled elapsed time supplies only the relative allocation within the
    interval. It is not distance, GPS, a measured passage or a signal phase.
    Do not move a distant stop's additional lateness upstream by assumption:
    it could arise on the following leg. An earlier downstream constraint can
    cap carried delay; a later one leaves the one-sided estimate intact. The
    actual upcoming stop target is fitted by the motion engine in either case.
    Explicit clocks/skips/NO_DATA/local updates are never overwritten.
    """
    result = deepcopy(timeline)
    previous = None
    for right, stop in enumerate(result):
        if stop.get('relationship') == 'NO_DATA':
            previous = None
            continue
        if stop.get('relationship') == 'SKIPPED' or not _direct(stop):
            continue
        left = previous
        previous = right
        if left is None or right <= left + 1:
            continue
        origin = result[left]
        # A departure-only update is not a direct arrival constraint. It may
        # mean the vehicle is dwelling; don't silently convert it into arrival.
        if stop.get('provider_predicted_arrival_s') is None and stop.get('timing_basis') != 'STOP_DELAY':
            continue
        scheduled_start = origin['scheduled_departure']
        scheduled_end = stop['scheduled_arrival']
        source_start = origin['predicted_departure']
        source_end = stop['predicted_arrival']
        if scheduled_end <= scheduled_start or source_end <= source_start:
            continue
        for entry in result[left + 1:right]:
            if entry.get('relationship') == 'SKIPPED':
                continue
            for field, scheduled in (('predicted_arrival', 'scheduled_arrival'),
                                     ('predicted_departure', 'scheduled_departure')):
                ratio = (entry[scheduled] - scheduled_start) / (scheduled_end - scheduled_start)
                upper_bound = round(source_start + max(0.0, min(1.0, ratio)) * (source_end - source_start))
                entry[field] = min(entry[field], upper_bound)
            entry.update(
                timing_basis='BETWEEN_STOP_UPDATES', departure_timing_basis='BETWEEN_STOP_UPDATES',
                timing_anchor_stop_id=origin['stop_id'], timing_anchor_sequence=origin.get('stop_sequence'),
                timing_anchor_delay_seconds=entry['predicted_arrival'] - entry['scheduled_arrival'],
                timing_next_anchor_stop_id=stop['stop_id'], timing_next_anchor_sequence=stop.get('stop_sequence'),
                timing_previous_departure_s=source_start, timing_next_arrival_s=source_end,
                timing_neighbor_constraint='DOWNSTREAM_TIME_BOUND',
            )
    return result


def order_timeline(timeline):
    """Order derived clocks only *after* both neighbouring constraints are used.

    Keep raw provider clocks even if contradictory. Flag adjusted/inherited
    timing so reconciliation never mistakes an ordering repair for observation.
    """
    previous_departure = None
    inherited_conflict = False
    for entry in timeline:
        arrival, departure = entry['predicted_arrival'], entry['predicted_departure']
        if previous_departure is not None:
            arrival = max(arrival, previous_departure)
        departure = max(departure, arrival)
        adjusted = arrival != entry['predicted_arrival'] or departure != entry['predicted_departure']
        if entry.get('relationship') == 'NO_DATA':
            inherited_conflict = False
        elif _direct(entry):
            inherited_conflict = adjusted
        entry['timing_order_adjusted'] = adjusted or inherited_conflict
        entry['predicted_arrival'], entry['predicted_departure'] = arrival, departure
        entry['delay_seconds'] = arrival - entry['scheduled_arrival']
        if entry.get('relationship') != 'SKIPPED':
            previous_departure = departure
    return timeline
