"""Perix V14 candidate: atomic monotonic updates for one current GTFS-RT row.

One unique document per (region_id,network_id,trip_id), compatible with the
legacy unique index. MongoDB >= 4.2 update *pipeline* required; validate in
staging with the ACTUAL MongoDB version before authorizing any release.

A ranking deliberately rejects ambiguous same-day network transitions. It
never promotes a feed with unknown generation time to a realtime prediction.
"""
from __future__ import annotations

from datetime import datetime, timezone
import re
from typing import Any


class InvalidRealtimeClock(ValueError):
    pass


def activation_epoch(value: Any) -> int:
    """Return activation UNIX seconds, or zero for missing/invalid metadata."""
    if value in (None, ''):
        return 0
    try:
        if isinstance(value, (float, int)):
            return max(0, int(value))
        dt = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        # Naive activation stamps are ambiguous across host time zones.
        if dt.tzinfo is None:
            return 0
        return max(0, int(dt.timestamp()))
    except (ValueError, TypeError, OverflowError):
        return 0


def validate_candidate(doc: dict) -> None:
    for name in ('region_id', 'network_id', 'trip_id', 'network_version_id'):
        if not str(doc.get(name) or '').strip():
            raise ValueError(f'Missing realtime identity: {name}')
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', str(doc.get('service_date') or '')):
        raise ValueError('Missing/invalid realtime service_date')
    # Reject booleans, strings, nulls and impossible numbers as evidence.
    ts = doc.get('feed_timestamp')
    if type(ts) is not int or not 946684800 <= ts <= 4102444800:
        raise InvalidRealtimeClock('Valid GTFS-RT feed header timestamp is required')
    if ts > int(datetime.now(timezone.utc).timestamp()) + 120:
        raise InvalidRealtimeClock('GTFS-RT feed timestamp is implausibly in the future')
    act = doc.get('network_activation_epoch', 0)
    if type(act) is not int or act < 0 or (act and ts < act):
        raise InvalidRealtimeClock('Realtime feed predates the active network activation')


def _as_long(field: str) -> dict:
    return {'$convert': {'input': '$' + field, 'to': 'long', 'onError': -1, 'onNull': -1}}


def acceptance_condition(doc: dict) -> dict:
    """Expression evaluated atomically inside the destination Mongo document.

    Cases: new row; older service-day row; same day/version with older feed;
    same day/newer known version activation; or V12 legacy row whose prior
    feed timestamp unequivocally predates the newly activated network.
    Do not infer version order from opaque version IDs.
    """
    validate_candidate(doc)
    new_date = doc['service_date']
    new_version = doc['network_version_id']
    new_ts = doc['feed_timestamp']
    new_activation = doc.get('network_activation_epoch', 0)
    prev_date = {'$ifNull': ['$service_date', '']}
    prev_version = {'$ifNull': ['$network_version_id', '']}
    prev_clock = _as_long('feed_timestamp')
    prev_activation = _as_long('network_activation_epoch')
    newer_day = {'$lt': [prev_date, new_date]}
    same_day = {'$eq': [prev_date, new_date]}
    same_version = {'$eq': [prev_version, new_version]}
    newer_feed = {'$lt': [prev_clock, new_ts]}
    # Legacy V12 rows have no activation field. Only cross to a new version
    # if the prior row is provably older than this version's activation.
    legacy_safe = {'$and': [
        {'$lt': [prev_activation, 0]},
        {'$lt': [prev_clock, new_activation]},
    ]}
    newer_activation = {'$and': [
        {'$gt': [prev_activation, 0]},
        {'$lt': [prev_activation, new_activation]},
    ]}
    cross_version = {'$and': [
        {'$gt': [new_activation, 0]},
        {'$or': [newer_activation, legacy_safe]},
        newer_feed,
    ]}
    return {'$or': [
        {'$eq': [{'$ifNull': ['$_id', None]}, None]},
        newer_day,
        {'$and': [same_day, newer_feed, {'$or': [
            same_version,
            {'$and': [{'$not': [same_version]}, cross_version]},
        ]}]},
    ]}


def monotonic_update_pipeline(doc: dict) -> list[dict]:
    """Atomic update pipeline; discarded incoming updates leave row untouched.

    Using `$literal` prevents GTFS text containing `$` from being parsed as
    Mongo expressions. `$$ROOT` retains `_id` and any unrelated fields.
    """
    gate = acceptance_condition(doc)
    return [{'$replaceRoot': {'newRoot': {'$cond': [
        gate,
        {'$mergeObjects': ['$$ROOT', {'$literal': dict(doc)}]},
        '$$ROOT',
    ]}}}]


def expected_accept(old: dict | None, new: dict) -> bool:
    """Independent pure reference for offline tests; NOT a MongoDB substitute."""
    validate_candidate(new)
    if old is None:
        return True
    previous_day = str(old.get('service_date') or '')
    day = new['service_date']
    if previous_day < day:
        return True
    if previous_day != day:
        return False
    old_ts = old.get('feed_timestamp')
    try:
        old_ts = int(old_ts) if old_ts is not None else -1
    except (ValueError, TypeError):
        old_ts = -1
    if new['feed_timestamp'] <= old_ts:
        return False
    if old.get('network_version_id') == new['network_version_id']:
        return True
    activation = new.get('network_activation_epoch', 0)
    if not activation:
        return False
    previous_activation = old.get('network_activation_epoch')
    try:
        previous_activation = int(previous_activation) if previous_activation is not None else -1
    except (ValueError, TypeError):
        previous_activation = -1
    return ((previous_activation > 0 and activation > previous_activation)
            or (previous_activation < 0 and old_ts < activation))
