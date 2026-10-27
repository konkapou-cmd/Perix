from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from google.transit import gtfs_realtime_pb2

from mobility.timing_evidence import extract_trip_timing
from mobility.realtime_order import expected_accept, monotonic_update_pipeline, InvalidRealtimeClock
from mobility.realtime_freshness import is_recent_trip_update, operational_only
from routes import mobility as routes


def test_proto_extraction_retains_original_occurrences_and_does_not_invent_a_trip_timestamp():
    update = gtfs_realtime_pb2.TripUpdate()
    update.trip.trip_id = 'T'
    for sid, sequence, delay in [('A', 10, -8), ('B', 20, 27), ('A', 30, 120)]:
        stop = update.stop_time_update.add(); stop.stop_id = sid; stop.stop_sequence = sequence
        stop.arrival.delay = delay; stop.departure.delay = delay + 10
    matched = {'stop_ids': ['A', 'B', 'A'], 'stop_sequences': [10, 20, 30], 'original_stop_sequences': True}
    value = extract_trip_timing(update, matched, {0: 'SCHEDULED'})
    assert value['trip_delay_kind'] == 'FIRST_STOP_DERIVED' and value['delay_seconds'] == -8
    assert value['trip_update_timestamp'] is None
    assert value['stop_predictions_by_sequence']['10']['arrival_delay_seconds'] == -8
    assert value['stop_predictions_by_sequence']['30']['arrival_delay_seconds'] == 120
    assert value['stop_predictions']['A']['arrival_delay_seconds'] == 120  # compatible legacy field
    update.delay = 0; update.timestamp = int(datetime.now(timezone.utc).timestamp())
    newer = extract_trip_timing(update, matched, {0: 'SCHEDULED'})
    assert newer['trip_delay_kind'] == 'EXPLICIT_TRIP_DELAY' and newer['delay_seconds'] == 0
    assert newer['trip_update_timestamp'] == update.timestamp


def candidate(feed, trip_time=None, date='2026-10-25', version='v'):
    return {'region_id': 'magdeburg', 'network_id': 'de-magdeburg-mvb', 'network_version_id': version,
            'service_date': date, 'trip_id': 'T', 'feed_timestamp': feed,
            'network_activation_epoch': 0, 'trip_update_timestamp': trip_time}


def test_new_feed_cannot_revert_a_newer_known_trip_clock_even_after_a_missing_timestamp():
    now = int(datetime.now(timezone.utc).timestamp())
    old = candidate(now - 2, now - 20)
    assert not expected_accept(old, candidate(now, now - 30))
    assert expected_accept(old, candidate(now, now - 10))
    assert expected_accept(old, candidate(now, None))  # explicitly unknown ordering, not invented source time
    unknown = {**candidate(now - 1, None), 'trip_timestamp_highwater': now - 20}
    assert not expected_accept(unknown, candidate(now, now - 30))
    assert expected_accept({**old, 'service_date': '2026-10-24'}, candidate(now, now - 30))
    pipeline = monotonic_update_pipeline(candidate(now, None))
    assert 'trip_timestamp_highwater' in repr(pipeline)
    assert '$literal' in repr(pipeline)


def test_invalid_trip_source_clocks_are_not_promoted_by_a_new_feed_header():
    now = int(datetime.now(timezone.utc).timestamp())
    with pytest.raises(InvalidRealtimeClock):
        monotonic_update_pipeline(candidate(now, now + 1000))
    assert is_recent_trip_update(None, now)  # UNKNOWN, not proof of freshness
    assert not is_recent_trip_update(now - 181, now)
    assert not is_recent_trip_update(now + 121, now)
    assert is_recent_trip_update(now - 15, now)


@pytest.mark.asyncio
async def test_expired_timing_cannot_resurrect_source_cancellations_or_skips(monkeypatch):
    now = datetime.now(timezone.utc)
    net = {'version_id': 'v', 'service_date': '2026-10-25'}
    base = {**candidate(int(now.timestamp()) - 1000, int(now.timestamp()) - 1000),
            'source_match_validated': True, 'updated_at': now.isoformat(),
            'stop_predictions': {'A': {'arrival_delay_seconds': 90}}, 'stop_delays': {'A': 90}}
    cancelled = {**base, 'trip_id': 'cancelled', 'trip_schedule_relationship': 'CANCELED'}
    skipped = {**base, 'trip_id': 'skipped', 'trip_schedule_relationship': 'SCHEDULED', 'stop_relationships': {'A': 'SKIPPED'}}
    normal = {**base, 'trip_id': 'expired', 'trip_schedule_relationship': 'SCHEDULED'}
    originals = deepcopy([cancelled, skipped, normal])
    monkeypatch.setattr(routes, 'db', SimpleNamespace(
        mobility_realtime=SimpleNamespace(find=lambda *args: SimpleNamespace(to_list=AsyncMock(return_value=[]))),
        mobility_trip_realtime_journeys=SimpleNamespace(find=lambda *args: SimpleNamespace(to_list=AsyncMock(return_value=[cancelled, skipped, normal])))))
    value = await routes._realtime_delays_for(['cancelled', 'skipped', 'expired'], network=net)
    assert set(value) == {'cancelled', 'skipped'}
    assert value['cancelled']['trip_schedule_relationship'] == 'CANCELED'
    assert value['skipped']['stop_relationships']['A'] == 'SKIPPED'
    assert value['skipped']['stop_predictions'] == {} and value['skipped']['delay_seconds'] == 0
    assert value['skipped']['source_timing_status'] == 'STALE_FEED'
    assert [cancelled, skipped, normal] == originals
    stripped = operational_only(cancelled, 'STALE_TRIP_UPDATE')
    assert stripped['trip_delay_observed'] is False
