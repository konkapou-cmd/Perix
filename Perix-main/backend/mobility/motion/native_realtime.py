"""Occurrence-safe GTFS-RT boundary for private native shadow replay.

The published worker currently stores receipt time and stop-id dictionaries.
This boundary preserves source clocks and stop_sequence without changing that
worker or passenger normalization. No inferred delay is added to an epoch time.
"""
from datetime import date, datetime
from zoneinfo import ZoneInfo

from utils.gtfs import _time_seconds


def trip_update_record(update, feed_timestamp):
    trip_names = {0: 'SCHEDULED', 1: 'ADDED', 2: 'UNSCHEDULED', 3: 'CANCELED',
                  5: 'REPLACEMENT', 6: 'DUPLICATED', 7: 'DELETED'}
    stop_names = {0: 'SCHEDULED', 1: 'SKIPPED', 2: 'NO_DATA', 3: 'UNSCHEDULED'}
    stops = []
    for s in update.stop_time_update:
        row = {'stop_id': str(s.stop_id),
            'stop_sequence': int(s.stop_sequence) if s.HasField('stop_sequence') else None,
            'relationship': stop_names.get(int(s.schedule_relationship), 'UNKNOWN')}
        for field in ('arrival', 'departure'):
            if s.HasField(field):
                event = getattr(s, field)
                row[field] = {k: int(getattr(event, k)) for k in ('time', 'delay', 'uncertainty') if event.HasField(k)}
        stops.append(row)
    return {'trip_id': str(update.trip.trip_id), 'start_date': str(update.trip.start_date),
        'start_time': str(update.trip.start_time),
        'trip_relationship': trip_names.get(int(update.trip.schedule_relationship), 'UNKNOWN'),
        'trip_delay': int(update.delay) if update.HasField('delay') else None,
        'source_epoch': int(update.timestamp) if update.HasField('timestamp') and update.timestamp else int(feed_timestamp),
        'source_clock_basis': 'TRIP_UPDATE' if update.HasField('timestamp') and update.timestamp else 'FEED_HEADER',
        'feed_epoch': int(feed_timestamp), 'stops': stops}


def normalize_timeline(trip, update, *, service_date, timezone):
    if str(trip.get('trip_id')) != str(update['trip_id']):
        raise ValueError('TRIP_ID_MISMATCH')
    expected = date.fromisoformat(service_date)
    if update.get('start_date') and update['start_date'] != expected.strftime('%Y%m%d'):
        raise ValueError('SERVICE_DATE_MISMATCH')
    if update.get('trip_relationship') in ('CANCELED', 'DELETED'):
        return []
    if update.get('trip_relationship') != 'SCHEDULED':
        raise ValueError('UNSUPPORTED_TRIP_RELATIONSHIP')
    occurrences = trip.get('stop_times_sequence') or []
    if not occurrences:
        raise ValueError('EXACT_STOP_OCCURRENCES_REQUIRED')
    sequences = [e.get('stop_sequence') for e in occurrences]
    if any(type(s) is not int for s in sequences) or sequences != sorted(set(sequences)):
        raise ValueError('INVALID_STATIC_SEQUENCE')
    by_sequence = {}
    last = -1
    for s in update.get('stops', []):
        sequence = s.get('stop_sequence')
        if sequence is None:
            choices = [e['stop_sequence'] for e in occurrences if str(e['stop_id']) == str(s.get('stop_id'))]
            if len(choices) != 1:
                raise ValueError('AMBIGUOUS_REALTIME_OCCURRENCE')
            sequence = choices[0]
        if sequence not in sequences or sequence <= last:
            raise ValueError('INVALID_REALTIME_SEQUENCE')
        static = occurrences[sequences.index(sequence)]
        if s.get('stop_id') and str(s['stop_id']) != str(static['stop_id']):
            raise ValueError('STOP_ID_SEQUENCE_MISMATCH')
        if s.get('relationship', 'SCHEDULED') not in ('SCHEDULED', 'SKIPPED', 'NO_DATA'):
            raise ValueError('UNSUPPORTED_STOP_RELATIONSHIP')
        by_sequence[sequence] = s
        last = sequence

    def service_seconds(epoch):
        d = datetime.fromtimestamp(epoch, ZoneInfo(timezone))
        return (d.date()-expected).days*86400+d.hour*3600+d.minute*60+d.second

    delay = update.get('trip_delay')
    basis = 'RT_TRIP_DELAY' if delay is not None else 'SCHEDULE'
    delay = delay or 0
    no_data = False
    result = []
    for static in occurrences:
        seq = static['stop_sequence']
        rt = by_sequence.get(seq, {})
        rel = rt.get('relationship', 'SCHEDULED')
        sa = _time_seconds(static['arrival_time'], 'native arrival')
        sd = _time_seconds(static['departure_time'], 'native departure')
        if sd < sa:
            raise ValueError('INVALID_STATIC_DWELL')
        if rel == 'NO_DATA':
            no_data, delay, basis = True, 0, 'SCHEDULE'
        elif rel != 'SKIPPED' and (rt.get('arrival') or rt.get('departure')):
            no_data = False
        prediction = {}
        if not no_data and rel != 'SKIPPED':
            for field, scheduled in (('arrival', sa), ('departure', sd)):
                event = rt.get(field) or {}
                if 'time' in event:
                    prediction[field] = service_seconds(event['time'])
                elif 'delay' in event:
                    prediction[field] = scheduled+event['delay']
        arr = prediction.get('arrival')
        dep = prediction.get('departure')
        if arr is None:
            arr = sa+(dep-sd if dep is not None else delay)
        if dep is None:
            dep = sd+(arr-sa)
        if dep < arr:
            raise ValueError('CONTRADICTORY_ARRIVAL_DEPARTURE')
        if prediction:
            delay, basis = dep-sd, 'RT_EXPLICIT'
        row_basis = basis if prediction or basis == 'SCHEDULE' else 'RT_PROPAGATED'
        result.append({'stop_id': str(static['stop_id']), 'stop_sequence': seq,
            'scheduled_arrival': sa, 'scheduled_departure': sd, 'scheduled': sa,
            'predicted_arrival': arr, 'predicted_departure': dep,
            'delay_seconds': arr-sa, 'relationship': 'NO_DATA' if no_data and rel != 'SKIPPED' else rel,
            'prediction_basis': row_basis})
    return result
