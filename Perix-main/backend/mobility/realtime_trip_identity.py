"""Validate GTFS-Realtime TripUpdates against the activated Perix GTFS day.

No database, provider calls or Google Maps dependencies. All route and stop
identifiers must be taken from the active GTFS feed, never guessed from an alert.
A rejected update means *use the schedule*, not fabricate a new journey.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import re
from typing import Optional


def _service_date(network: dict) -> Optional[str]:
    date_string = str(network.get('service_date') or '')
    if re.fullmatch(r'\d{4}-\d{2}-\d{2}', date_string):
        return date_string
    match = re.search(r'(\d{4}-\d{2}-\d{2})', str(network.get('name') or ''))
    return match.group(1) if match else None


def _time_seconds(value: object) -> Optional[int]:
    parts = str(value or '').strip().split(':')
    if len(parts) not in (2, 3):
        return None
    try:
        nums = [int(p) for p in parts]
    except (ValueError, TypeError):
        return None
    h, m = nums[:2]
    s = nums[2] if len(nums) == 3 else 0
    if h < 0 or h > 47 or not 0 <= m < 60 or not 0 <= s < 60:
        return None
    return h * 3600 + m * 60 + s


def _from_gtfs(network: dict, trip: dict, route: dict, service_date: str) -> dict:
    ids = [str(s) for s in (trip.get('stop_ids') or [])]
    raw_sequences = trip.get('stop_sequences') or []
    if len(raw_sequences) != len(ids):
        raw_sequences = list(range(1, len(ids) + 1))
        has_original_sequences = False
    else:
        has_original_sequences = True
    return {
        'trip_id': str(trip['trip_id']),
        'service_date': service_date,
        'network_version_id': str(network['version_id']),
        'gtfs_route_id': str(trip.get('gtfs_route_id') or route.get('gtfs_route_id') or ''),
        'route_number': str(route.get('route_number') or ''),
        'start_time': str(trip.get('start') or ''),
        'direction_id': str(trip.get('direction_id')) if trip.get('direction_id') is not None else None,
        'stop_ids': ids,
        'stop_sequences': [int(x) for x in raw_sequences],
        'original_stop_sequences': has_original_sequences,
    }


def build_trip_index(network: dict) -> dict:
    """Unique trip_id -> one GTFS trip of one dated, versioned network.

    Duplicate IDs, even across public line variants, are ambiguous and rejected.
    """
    date_string = _service_date(network)
    version_id = str(network.get('version_id') or '')
    if not date_string or not version_id:
        return {}
    index = {}
    ambiguous = set()
    for route in network.get('routes') or []:
        for trip in route.get('trips') or []:
            tid = str(trip.get('trip_id') or '')
            if not tid or tid in ambiguous:
                continue
            if tid in index:
                index.pop(tid, None)
                ambiguous.add(tid)
                continue
            try:
                index[tid] = _from_gtfs(network, trip, route, date_string)
            except (TypeError, ValueError, KeyError):
                ambiguous.add(tid)
                index.pop(tid, None)
    return index


def _epoch(value: object) -> Optional[int]:
    if value in (None, ''):
        return None
    try:
        if isinstance(value, (int, float)):
            return int(value)
        if str(value).strip().isdigit():
            return int(str(value).strip())
        dt = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except (ValueError, TypeError, OverflowError):
        return None


def _generation_day(epoch: int, tz_name: str, start_hour: int) -> str:
    dt = datetime.fromtimestamp(epoch, ZoneInfo(tz_name))
    return (dt - timedelta(hours=start_hour)).date().isoformat()


def _valid_stop_anchors(ref: dict, updates: list[dict]) -> bool:
    ids, seqs = ref['stop_ids'], ref['stop_sequences']
    cursor = 0
    for item in updates:
        stop_id = str(item.get('stop_id') or '')
        raw_sequence = item.get('stop_sequence')
        if not stop_id and raw_sequence is None:
            return False
        matched = None
        for j in range(cursor, len(ids)):
            if stop_id and ids[j] != stop_id:
                continue
            # Only compare source GTFS stop_sequence with GTFS-RT when the
            # parser retained original numbers; synthetic indices are unsafe.
            if raw_sequence is not None and ref['original_stop_sequences']:
                try:
                    if seqs[j] != int(raw_sequence):
                        continue
                except (TypeError, ValueError):
                    return False
            matched = j
            break
        if matched is None:
            return False
        cursor = matched + 1
    return True


def stop_id_for_sequence(ref: dict, seq: object) -> Optional[str]:
    if not ref.get('original_stop_sequences'):
        return None
    try:
        value = int(seq)
    except (TypeError, ValueError):
        return None
    pairs = [(sid, n) for sid, n in zip(ref['stop_ids'], ref['stop_sequences']) if n == value]
    return pairs[0][0] if len(pairs) == 1 else None


def match_trip_update(
    descriptor: dict,
    stop_updates: list[dict],
    index: dict,
    *,
    feed_timestamp: Optional[int],
    timezone_name: str,
    service_day_start_hour: int,
    activated_at: Optional[str] = None,
) -> tuple[Optional[dict], str]:
    """Return (matched active trip, reason); never relax identity on failure.

    GTFS-RT permits `trip_id` alone for some scheduled trips. If `start_date`
    is absent, a source feed timestamp on today's service day is needed to
    rule out carryover after a timetable switch. `activated_at` also prevents
    pre-activation updates from being stamped onto a newly activated network.
    """
    tid = str(descriptor.get('trip_id') or '')
    ref = index.get(tid)
    if not ref:
        return None, 'UNKNOWN_OR_DUPLICATE_TRIP'
    relationship = str(descriptor.get('schedule_relationship') or 'SCHEDULED').upper()
    if relationship not in ('SCHEDULED', 'CANCELED', 'DELETED'):
        return None, 'UNSUPPORTED_TRIP_RELATIONSHIP'
    generated = _epoch(feed_timestamp)
    activated_epoch = _epoch(activated_at)
    # Version safety applies even when a descriptor specifies start_date:
    # a pre-activation feed snapshot must not update the just-switched version.
    if activated_epoch is not None and (generated is None or generated < activated_epoch):
        return None, 'PRE_ACTIVATION_SNAPSHOT'
    start_date = str(descriptor.get('start_date') or '')
    if start_date:
        if start_date != ref['service_date'].replace('-', ''):
            return None, 'WRONG_START_DATE'
    else:
        if generated is None:
            return None, 'NO_SERVICE_DATE_EVIDENCE'
        try:
            if _generation_day(generated, timezone_name, service_day_start_hour) != ref['service_date']:
                return None, 'WRONG_FEED_SERVICE_DAY'
        except (ValueError, OverflowError, KeyError):
            return None, 'BAD_FEED_TIMESTAMP'
    route_id = str(descriptor.get('route_id') or '')
    if route_id and (not ref['gtfs_route_id'] or route_id != ref['gtfs_route_id']):
        return None, 'WRONG_GTFS_ROUTE'
    direction = descriptor.get('direction_id')
    if direction is not None and ref.get('direction_id') is not None:
        if str(direction) != ref['direction_id']:
            return None, 'WRONG_DIRECTION'
    start_time = str(descriptor.get('start_time') or '')
    if start_time:
        provided, scheduled = _time_seconds(start_time), _time_seconds(ref['start_time'])
        if provided is None or scheduled is None or provided // 60 != scheduled // 60:
            return None, 'WRONG_START_TIME'
    if not _valid_stop_anchors(ref, stop_updates):
        return None, 'INCOMPATIBLE_STOP_SEQUENCE'
    return ref, 'MATCHED'
