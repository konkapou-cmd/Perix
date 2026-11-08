"""Offline, read-only InfraNode matching trial; NEVER an ingestion worker.

Accepted means eligible for comparison only. This tool cannot write Mongo,
publish positions, change source clocks or choose a trip by nearest time.
Reviewed bindings are version/date-scoped test inputs, not a station database.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime
import hashlib
import json
import math
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mobility.realtime_freshness import is_recent_feed_generation, is_recent_trip_update
from mobility.realtime_trip_identity import build_trip_index, match_trip_update, _time_seconds

MAX_SOURCE_AGE_S = 180
MAX_REFERENCE_AGE_S = 30
SCOPE = ('region_id', 'network_id', 'version_id', 'service_date')


def _epoch(value):
    """Do not silently interpret naive timestamps or receipt clocks as source."""
    if type(value) in (int, float):
        return float(value) if math.isfinite(value) and value > 0 else None
    if not isinstance(value, str):
        return None
    try:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return dt.timestamp() if dt.tzinfo is not None else None
    except (ValueError, OverflowError):
        return None


def _source_clock(envelope, row, now):
    # Source observations stay source observations, not fabricated feed/trip clocks.
    values = [v for v in (row.get('observed_at'), (envelope.get('meta') or {}).get('as_of'),
                          (envelope.get('data') or {}).get('observed_at')) if v is not None]
    if not values:
        return None, ['SOURCE_CLOCK_MISSING']
    epochs = [_epoch(v) for v in values]
    if any(v is None for v in epochs):
        return None, ['SOURCE_CLOCK_INVALID']
    if max(epochs)-min(epochs) > 1:
        return None, ['SOURCE_CLOCK_CONFLICT']
    clock = min(epochs)
    if not is_recent_feed_generation(int(clock), int(now), MAX_SOURCE_AGE_S):
        return clock, ['SOURCE_CLOCK_FUTURE' if clock > now else 'SOURCE_CLOCK_STALE']
    return clock, []


def _feed_clock(envelope, row, now):
    """Only an explicitly supplied feed-generation clock can validate feed order."""
    values = [v for v in (row.get('feed_timestamp'), (envelope.get('meta') or {}).get('feed_timestamp'))
              if v is not None]
    if not values:
        return None, ['FEED_GENERATION_MISSING']
    epochs = [_epoch(v) for v in values]
    if any(v is None for v in epochs) or max(epochs)-min(epochs) > 1:
        return None, ['FEED_GENERATION_INVALID_OR_CONFLICTING']
    clock = min(epochs)
    if not is_recent_feed_generation(int(clock), int(now), MAX_SOURCE_AGE_S):
        return clock, ['FEED_GENERATION_FUTURE' if clock > now else 'FEED_GENERATION_STALE']
    return clock, []


def _scope_errors(network, bindings):
    return ['BINDING_SCOPE_MISMATCH'] if any(not network.get(k) or bindings.get(k) != network.get(k)
                                             for k in SCOPE) else []


def _reviewed_map(rows, source_key, target_key):
    grouped = {}
    for row in rows or []:
        if row.get('status') != 'REVIEWED' or not row.get(source_key) or not row.get(target_key):
            continue
        grouped.setdefault(str(row[source_key]), set()).add(str(row[target_key]))
    return {key: next(iter(values)) for key, values in grouped.items() if len(values) == 1}, {
        key for key, values in grouped.items() if len(values) != 1}


def _rows(envelope):
    data = envelope.get('data')
    if not isinstance(data, dict) or not isinstance(data.get('payload'), dict):
        return []
    payload = data['payload']
    if payload.get('kind') == 'transit_departure':
        if not isinstance(payload.get('departures'), list):
            return []
        return [dict(r, source_stop_id=r.get('stop_id') or payload.get('stop_id'))
                for r in payload.get('departures', []) if isinstance(r, dict)]
    if payload.get('kind') == 'transit_trip':
        if not isinstance(payload.get('stop_time_updates'), list):
            return []
        # Trip-wide values must not become invented explicit per-stop events.
        events = {event+suffix for event in ('arrival','departure') for suffix in
                  ('_delay','_delay_seconds','_time','_epoch','_time_iso')}
        common = {k:v for k,v in payload.items() if k not in events and k not in
                  ('stop_relationship','stop_schedule_relationship','stop_sequence')}
        return [{**common, **stop, 'source_stop_id': stop.get('stop_id'),
                 'trip_schedule_relationship': payload.get('trip_schedule_relationship', payload.get('schedule_relationship')),
                 'stop_relationship': stop.get('stop_relationship'),
                 'stop_schedule_relationship': stop.get('stop_schedule_relationship',stop.get('schedule_relationship'))}
                for stop in payload.get('stop_time_updates', []) if isinstance(stop, dict)]
    return []


def _date(row):
    dates = []
    for value in (row.get('start_date'), row.get('service_date')):
        if value is None:
            continue
        if not isinstance(value, str):
            return None
        parsed = None
        for fmt in ('%Y%m%d', '%Y-%m-%d'):
            try:
                day = datetime.strptime(value, fmt).date().isoformat()
                if day.replace('-', '') == value or day == value:
                    parsed = day
                    break
            except ValueError:
                pass
        if parsed is None:
            return None
        dates.append(parsed)
    return dates[0] if dates and len(set(dates)) == 1 else None


def _event_delays(row):
    result, errors = {}, []
    for event in ('arrival', 'departure'):
        key = event+'_delay'
        value = row.get(key, row.get(event+'_delay_seconds'))
        if value is not None:
            if type(value) is not int:
                errors.append('EVENT_DELAY_INVALID')
            else:
                result[event] = value
    # InfraNode's generic delay_s may be a departure OR arrival fallback. Preserve
    # it diagnostically, but do not convert it to an explicit departure anchor.
    if not result:
        errors.append('EVENT_BASIS_UNVERIFIED' if row.get('delay_s') is not None else 'EVENT_DELAY_MISSING')
    return result, errors


def _stop_relationship(row):
    value = row.get('stop_relationship')
    if value is None:
        value = row.get('stop_schedule_relationship')
    if value is None and 'stop_time_updates' in row:
        value = row.get('schedule_relationship')
    if type(value) is int:
        return {0: 'SCHEDULED', 1: 'SKIPPED', 2: 'NO_DATA'}.get(value)
    return value if value in ('SCHEDULED', 'SKIPPED', 'NO_DATA') else None


def _event_times(row):
    result, errors = {}, []
    for event in ('arrival', 'departure'):
        values = [v for v in (row.get(event+'_time'), row.get(event+'_epoch'), row.get(event+'_time_iso'))
                  if v is not None and not (type(v) is int and v == 0)]
        if not values:
            continue
        epochs = [_epoch(v) for v in values]
        if any(v is None for v in epochs) or max(epochs)-min(epochs) > 1:
            errors.append('EVENT_TIME_INVALID_OR_CONFLICTING')
        else:
            result[event] = min(epochs)
    return result, errors


def _reference(row, reference, now):
    if reference is None:
        return {'status': 'NOT_PROVIDED'}
    if not row['event_delays_seconds'] and not row['event_times_epoch']:
        return {'status': 'OPERATIONS_NOT_TIMING'}
    matches = [r for r in reference if all(r.get(k) == row.get(k) for k in
               ('region_id', 'network_id', 'network_version_id', 'target_trip_id',
                'service_date', 'target_stop_id', 'stop_sequence'))]
    if len(matches) != 1:
        return {'status': 'MISSING' if not matches else 'AMBIGUOUS'}
    ref = matches[0]
    stamp = _epoch(ref.get('captured_at'))
    if ref.get('source') != 'INSA' or stamp is None or not 0 <= now-stamp <= MAX_REFERENCE_AGE_S:
        return {'status': 'STALE_OR_INVALID'}
    differences, time_differences = {}, {}
    for event, delay in row['event_delays_seconds'].items():
        value = ref.get(event+'_delay_seconds')
        if type(value) is int:
            differences[event] = delay-value
    for event, epoch in row['event_times_epoch'].items():
        value = _epoch(ref.get(event+'_epoch'))
        if value is not None:
            time_differences[event] = epoch-value
    return {'status': 'COMPARED' if differences or time_differences else 'EVENT_NOT_AVAILABLE',
            'semantics': 'EXPLICIT_SOURCE_EVENT_VALUES_ONLY',
            'reference_captured_epoch': stamp,
            'delay_difference_seconds': differences, 'time_difference_seconds': time_differences}


def evaluate_capture(network, bindings, captures, *, now_epoch, reference=None):
    """No source replacement: return candidates, rejection reasons and comparisons.

    Cross-feed matching requires a COMPLETE ordered stop signature, explicit date,
    exact second-preserved start and a unique candidate. Reviewed ID crosswalks
    may instead identify a trip, but are never generated from line/nearest time.
    """
    if type(now_epoch) not in (int, float) or not math.isfinite(now_epoch):
        raise ValueError('Finite explicit trial clock required')
    index = build_trip_index(network)
    indexed_stops = {s for ref in index.values() for s in ref['stop_ids']}
    stops, ambiguous_stops = _reviewed_map(bindings.get('stops'), 'source_stop_id', 'target_stop_id')
    trips, ambiguous_trips = _reviewed_map(bindings.get('trips'), 'source_trip_id', 'target_trip_id')
    routes, ambiguous_routes = _reviewed_map(bindings.get('routes'), 'source_route_id', 'target_route_id')
    sha = (network.get('static_input') or {}).get('sha256')
    same_namespace = (bindings.get('trip_namespace') == 'SAME_GTFS_ARCHIVE'
                      and isinstance(sha, str) and len(sha) == 64
                      and bindings.get('source_static_input_sha256') == sha)
    source_trip_objects = {str(t.get('trip_id')): t for r in network.get('routes', []) for t in r.get('trips', [])}
    results, envelopes = [], []
    for capture in captures:
        envelope = capture.get('response', capture)
        data = envelope.get('data')
        status = (envelope.get('meta') or {}).get('source_status')
        base = _scope_errors(network, bindings)
        if capture.get('http_status', 200) != 200:
            base.append('HTTP_RESPONSE_NOT_OK')
        if status != 'ok':
            base.append('SOURCE_STATUS_'+str(status or 'UNKNOWN').upper())
        if not isinstance(data, dict) or data.get('source') != 'gtfs_rt' or data.get('city_slug') != 'magdeburg':
            base.append('SOURCE_SCOPE_INVALID')
        if isinstance(data, dict):
            payload = data.get('payload')
            fields = {'transit_departure':'departures', 'transit_trip':'stop_time_updates'}
            kind = payload.get('kind') if isinstance(payload, dict) else None
            field = fields.get(kind)
            if field is None:
                base.append('PAYLOAD_SCHEMA_UNSUPPORTED')
            elif not isinstance(payload.get(field), list) or any(not isinstance(r, dict) for r in payload[field]):
                base.append('PAYLOAD_RECORDS_INVALID')
        extracted = _rows(envelope)
        envelopes.append({'source_status': status, 'records': len(extracted), 'issues': list(base)})
        for row in extracted:
            errors = list(base)
            clock, clock_errors = _source_clock(envelope, row, now_epoch)
            errors.extend(clock_errors)
            feed_clock, feed_errors = _feed_clock(envelope, row, now_epoch)
            errors.extend(feed_errors)
            trip_clock = row.get('trip_update_timestamp')
            if not is_recent_trip_update(trip_clock, int(now_epoch), MAX_SOURCE_AGE_S):
                errors.append('TRIP_UPDATE_CLOCK_INVALID_OR_STALE')
            day = _date(row)
            if day is None:
                errors.append('SERVICE_DATE_MISSING_OR_INVALID')
            elif day != network.get('service_date'):
                errors.append('WRONG_SERVICE_DATE')
            relationship = row.get('trip_schedule_relationship', row.get('schedule_relationship'))
            if relationship not in ('SCHEDULED', 'CANCELED', 'DELETED'):
                errors.append('TRIP_RELATIONSHIP_UNAVAILABLE_OR_UNSUPPORTED')
            event_delays, event_errors = _event_delays(row)
            event_times, time_errors = _event_times(row)
            stop_relationship = _stop_relationship(row)
            if stop_relationship is None:
                errors.append('STOP_RELATIONSHIP_UNAVAILABLE_OR_UNSUPPORTED')
            if relationship == 'SCHEDULED' and stop_relationship == 'SCHEDULED':
                errors.extend(e for e in event_errors if not event_times or e == 'EVENT_DELAY_INVALID')
                errors.extend(time_errors)
            if relationship in ('CANCELED', 'DELETED') or stop_relationship in ('SKIPPED', 'NO_DATA'):
                event_delays = {}
                event_times = {}
            source_stop = str(row.get('source_stop_id') or '')
            target_stop = stops.get(source_stop)
            if same_namespace and source_stop in indexed_stops:
                target_stop = source_stop
            if source_stop in ambiguous_stops:
                errors.append('PLATFORM_BINDING_AMBIGUOUS')
            elif target_stop is None:
                errors.append('PLATFORM_UNRESOLVED')
            sequence = row.get('stop_sequence')
            if type(sequence) is not int:
                errors.append('STOP_SEQUENCE_INVALID')
            line = str(row.get('route_short_name') or row.get('line') or '')
            candidates = [ref for ref in index.values() if (not line or ref['route_number'] == line)
                          and ref['original_stop_sequences'] and any(s == target_stop and n == sequence
                              for s, n in zip(ref['stop_ids'], ref['stop_sequences']))]
            source_trip = str(row.get('trip_id') or '')
            identity_basis = None
            target_trip = trips.get(source_trip)
            if source_trip in ambiguous_trips:
                errors.append('TRIP_CROSSWALK_AMBIGUOUS')
                target_trip = None
            elif target_trip:
                identity_basis = 'REVIEWED_DATED_CROSSWALK'
            elif same_namespace and source_trip in index:
                target_trip, identity_basis = source_trip, 'SAME_VERIFIED_GTFS_ARCHIVE'
            elif source_trip and source_trip not in ambiguous_trips:
                full = row.get('stop_time_updates')
                start = _time_seconds(row.get('start_time'))
                signature = []
                if row.get('stops_complete') is True and isinstance(full, list) and len(full) >= 2:
                    for stop in full:
                        if not isinstance(stop, dict):
                            signature = []
                            break
                        sid = stops.get(str(stop.get('stop_id') or ''))
                        seq = stop.get('stop_sequence')
                        if sid is None or type(seq) is not int:
                            signature = []
                            break
                        signature.append((sid, seq))
                exact = []
                if signature and start is not None and day == network.get('service_date') and line:
                    for ref in candidates:
                        obj = source_trip_objects[ref['trip_id']]
                        ordered = obj.get('stop_times_sequence') or []
                        first = ordered[0].get('departure_time') if ordered else None
                        if (obj.get('source_time_seconds_preserved') is True and isinstance(first, str)
                                and len(first.split(':')) == 3 and isinstance(row.get('start_time'), str)
                                and len(row['start_time'].split(':')) == 3
                                and list(zip(ref['stop_ids'], ref['stop_sequences'])) == signature
                                and _time_seconds(first) == start):
                            exact.append(ref['trip_id'])
                if len(exact) == 1:
                    target_trip, identity_basis = exact[0], 'EXACT_DATED_FULL_SIGNATURE'
                elif len(exact) > 1:
                    errors.append('FULL_SIGNATURE_AMBIGUOUS')
            if not target_trip or target_trip not in index:
                errors.append('TRIP_IDENTITY_UNRESOLVED')
            else:
                ref = index[target_trip]
                if ref not in candidates:
                    errors.append('TRIP_PLATFORM_OR_LINE_MISMATCH')
                rid = row.get('route_id')
                target_route = rid if same_namespace else routes.get(str(rid))
                if rid and (str(rid) in ambiguous_routes or not target_route):
                    errors.append('SOURCE_ROUTE_UNRESOLVED')
                descriptor = {'trip_id': target_trip, 'start_date': day.replace('-', '') if day else '',
                              'schedule_relationship': relationship, 'route_id': target_route or '',
                              'direction_id': row.get('direction_id')}
                # The full-signature path already checks the exact canonical start.
                if identity_basis != 'EXACT_DATED_FULL_SIGNATURE' and row.get('start_time'):
                    descriptor['start_time'] = row['start_time']
                if feed_clock is not None and relationship in ('SCHEDULED', 'CANCELED', 'DELETED'):
                    _, reason = match_trip_update(descriptor, [{'stop_id': target_stop, 'stop_sequence': sequence}],
                        index, feed_timestamp=int(feed_clock), timezone_name=network.get('timezone', 'Europe/Berlin'),
                        service_day_start_hour=4, activated_at=network.get('activated_at'))
                    if reason != 'MATCHED':
                        errors.append(reason)
            outcome = {'source_trip_id': source_trip, 'source_stop_id': source_stop,
                       'region_id': network.get('region_id'), 'network_id': network.get('network_id'),
                       'network_version_id': network.get('version_id'),
                       'target_trip_id': target_trip, 'target_stop_id': target_stop,
                       'service_date': day, 'stop_sequence': sequence, 'line': line,
                       'daily_candidate_count': len(candidates), 'identity_basis': identity_basis,
                       'source_observation_epoch': clock, 'source_age_s': now_epoch-clock if clock is not None else None,
                       'source_clock_basis': 'PROVIDER_OBSERVATION_NOT_RELABELED_AS_FEED_OR_TRIP',
                       'feed_generation_epoch': feed_clock, 'trip_update_timestamp': trip_clock,
                       'reported_delay_s': row.get('delay_s'), 'event_delays_seconds': event_delays,
                       'event_times_epoch': event_times,
                       'trip_schedule_relationship': relationship,
                       'stop_relationship': stop_relationship,
                       'accepted_for_comparison': not errors, 'rejection_reasons': sorted(set(errors))}
            outcome['insa_comparison'] = (_reference(outcome, reference, now_epoch) if not errors
                                          else {'status': 'NOT_ELIGIBLE'})
            results.append(outcome)
    rejected = Counter(reason for r in results for reason in r['rejection_reasons'])
    return {'schema': 'perix-infranode-readonly-trial-v1', 'network_scope': {k: network.get(k) for k in SCOPE},
            'now_epoch': now_epoch, 'read_only': True, 'production_ingestion_authorized': False,
            'source_age_limit_s': MAX_SOURCE_AGE_S, 'reference_age_limit_s': MAX_REFERENCE_AGE_S,
            'counts': {'records': len(results), 'accepted_for_comparison': sum(r['accepted_for_comparison'] for r in results),
                       'rejected': sum(not r['accepted_for_comparison'] for r in results),
                       'insa_compared': sum(r['insa_comparison']['status'] == 'COMPARED' for r in results)},
            'rejection_counts': dict(sorted(rejected.items())), 'envelopes': envelopes, 'records': results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('network', 'bindings', 'capture', 'output'):
        parser.add_argument('--'+name, type=Path, required=True)
    parser.add_argument('--reference', type=Path)
    parser.add_argument('--now-epoch', type=float, help='Controlled OFFLINE test clock, not live freshness evidence')
    args = parser.parse_args()
    values = [json.loads(p.read_text(encoding='utf-8'), parse_constant=_reject_json_constant)
              for p in (args.network, args.bindings, args.capture)]
    reference = json.loads(args.reference.read_text(encoding='utf-8'),
                           parse_constant=_reject_json_constant) if args.reference else None
    result = evaluate_capture(*values, now_epoch=args.now_epoch if args.now_epoch is not None else time.time(), reference=reference)
    result['controlled_offline_clock'] = args.now_epoch is not None
    result['adapter_source_sha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    inputs = [args.network, args.bindings, args.capture]+([args.reference] if args.reference else [])
    result['input_sha256'] = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs}
    with args.output.open('x', encoding='utf-8') as stream:
        json.dump(result, stream, indent=2, allow_nan=False)
    print(json.dumps({'output': str(args.output), **result['counts'], 'read_only': True}))


def _reject_json_constant(value):
    raise ValueError('Invalid JSON numeric constant: '+value)


if __name__ == '__main__':
    main()
