"""Real MongoDB writes; provider responses are synthetic and never fetched."""
import asyncio
from datetime import datetime, timedelta, timezone
import os
from types import SimpleNamespace

import pytest


pytestmark = pytest.mark.skipif(
    os.environ.get("MONGO_URL") != "mongodb://127.0.0.1:27017"
    or os.environ.get("DB_NAME") != "perix_mobility_ci_disposable",
    reason="Requires explicitly configured disposable loopback MongoDB",
)


@pytest.mark.asyncio
async def test_realtime_worker_monotonic_writes_and_transitions(test_db, monkeypatch):
    import httpx
    from google.transit import gtfs_realtime_pb2
    from routes import mobility
    from utils import mobility_workers as worker

    now = int(datetime.now(timezone.utc).timestamp())
    today = datetime.now(timezone.utc).date()
    network = {
        "version_id": "A",
        "service_date": (today - timedelta(days=1)).isoformat(),
        "activated_at": datetime.fromtimestamp(now - 300, timezone.utc).isoformat(),
        "routes": [{
            "route_number": "synthetic",
            "trips": [{
                "trip_id": "synthetic-trip",
                "gtfs_route_id": "synthetic-route",
                "stop_ids": ["synthetic-stop"],
                "stop_sequences": [1],
            }],
        }],
    }
    body = b""

    async def active_network():
        return network

    async def end_cycle(_):
        raise asyncio.CancelledError

    def response(request):
        assert str(request.url) == "http://127.0.0.1:9/synthetic-feed"
        return httpx.Response(200, content=body)

    client_class = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kwargs: client_class(transport=httpx.MockTransport(response), **kwargs),
    )
    monkeypatch.setattr(mobility, "_get_active_network", active_network)
    monkeypatch.setattr(worker, "db", test_db)
    monkeypatch.setattr(worker, "REALTIME_URL", "http://127.0.0.1:9/synthetic-feed")
    monkeypatch.setattr(worker, "_ACTIVE_REGION", SimpleNamespace(
        region_id="synthetic-region", network_id="synthetic-network",
        realtime_type="GTFS_RT", timezone="UTC", service_day_start_hour=0,
    ))
    monkeypatch.setattr(worker, "asyncio", SimpleNamespace(sleep=end_cycle))
    logs = []
    monkeypatch.setattr(worker, "_log", logs.append)
    collection = test_db.mobility_realtime
    await collection.create_index(
        [("region_id", 1), ("network_id", 1), ("trip_id", 1)], unique=True,
    )

    async def cycle(timestamp, delay, expected_timestamp, expected_delay):
        nonlocal body
        feed = gtfs_realtime_pb2.FeedMessage()
        feed.header.gtfs_realtime_version = "2.0"
        feed.header.timestamp = timestamp
        entity = feed.entity.add()
        entity.id = "synthetic"
        entity.trip_update.trip.trip_id = "synthetic-trip"
        entity.trip_update.trip.start_date = network["service_date"].replace("-", "")
        stop = entity.trip_update.stop_time_update.add()
        stop.stop_id = "synthetic-stop"
        stop.stop_sequence = 1
        stop.arrival.delay = delay
        body = feed.SerializeToString()
        with pytest.raises(asyncio.CancelledError):
            await worker._realtime_worker()
        assert not any("cycle error" in line for line in logs), logs
        assert await collection.count_documents({}) == 1
        row = await collection.find_one({"trip_id": "synthetic-trip"})
        assert row["feed_timestamp"] == expected_timestamp
        assert row["delay_seconds"] == expected_delay
        return row

    await cycle(now - 100, 10, now - 100, 10)
    await cycle(now - 110, 99, now - 100, 10)
    await cycle(now - 100, 99, now - 100, 10)
    await cycle(now - 90, 9, now - 90, 9)
    network["version_id"] = "B"
    network["activated_at"] = datetime.fromtimestamp(now - 80, timezone.utc).isoformat()
    row = await cycle(now - 70, 7, now - 70, 7)
    assert row["network_version_id"] == "B"
    network["version_id"] = "A"
    network["activated_at"] = datetime.fromtimestamp(now - 300, timezone.utc).isoformat()
    row = await cycle(now - 60, 99, now - 70, 7)
    assert row["network_version_id"] == "B"
    network["service_date"] = today.isoformat()
    row = await cycle(now - 50, 5, now - 50, 5)
    assert row["service_date"] == today.isoformat()
    network["service_date"] = (today - timedelta(days=1)).isoformat()
    row = await cycle(now - 40, 99, now - 50, 5)
    assert row["service_date"] == today.isoformat()


@pytest.mark.asyncio
async def test_motor_concurrent_new_row_upserts(test_db):
    from pymongo import UpdateOne
    from pymongo.errors import BulkWriteError
    from mobility.realtime_order import monotonic_update_pipeline

    collection = test_db.mobility_realtime
    await collection.create_index(
        [("region_id", 1), ("network_id", 1), ("trip_id", 1)], unique=True,
    )
    now = int(datetime.now(timezone.utc).timestamp())
    key = {
        "region_id": "synthetic-region", "network_id": "synthetic-network",
        "trip_id": "synthetic-trip",
    }

    async def write(offset):
        doc = {
            **key, "network_version_id": "A",
            "service_date": datetime.now(timezone.utc).date().isoformat(),
            "network_activation_epoch": now - 200,
            "feed_timestamp": now - 100 + offset, "delay_seconds": offset,
        }
        update = monotonic_update_pipeline(doc)
        try:
            await collection.bulk_write([UpdateOne(key, update, upsert=True)], ordered=False)
        except BulkWriteError as exc:
            errors = exc.details.get("writeErrors", [])
            assert errors and all(error["code"] == 11000 for error in errors)
            result = await collection.bulk_write(
                [UpdateOne(key, update, upsert=False)], ordered=False,
            )
            assert result.matched_count == 1

    await asyncio.gather(*(write(offset) for offset in reversed(range(100))))
    assert await collection.count_documents({}) == 1
    row = await collection.find_one(key)
    assert row["feed_timestamp"] == now - 1
    assert row["delay_seconds"] == 99


@pytest.mark.asyncio
async def test_realtime_worker_retries_actual_duplicate_key_bulk_write(test_db, monkeypatch):
    import httpx
    from google.transit import gtfs_realtime_pb2
    from pymongo.errors import BulkWriteError
    from routes import mobility
    from utils import mobility_workers as worker

    now = int(datetime.now(timezone.utc).timestamp())
    service_date = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
    network = {
        "version_id": "retry-version",
        "service_date": service_date,
        "activated_at": datetime.fromtimestamp(now - 300, timezone.utc).isoformat(),
        "routes": [{
            "route_number": "retry-route",
            "trips": [{
                "trip_id": "retry-trip",
                "gtfs_route_id": "retry-route-id",
                "stop_ids": ["retry-stop"],
                "stop_sequences": [1],
            }],
        }],
    }
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.header.gtfs_realtime_version = "2.0"
    feed.header.timestamp = now - 100
    entity = feed.entity.add()
    entity.id = "retry-entity"
    entity.trip_update.trip.trip_id = "retry-trip"
    entity.trip_update.trip.start_date = service_date.replace("-", "")
    stop = entity.trip_update.stop_time_update.add()
    stop.stop_id = "retry-stop"
    stop.stop_sequence = 1
    stop.arrival.delay = 42
    body = feed.SerializeToString()

    async def active_network():
        return network

    async def end_cycle(_):
        raise asyncio.CancelledError

    def response(request):
        assert str(request.url) == "http://127.0.0.1:9/retry-feed"
        return httpx.Response(200, content=body)

    client_class = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kwargs: client_class(transport=httpx.MockTransport(response), **kwargs),
    )
    monkeypatch.setattr(mobility, "_get_active_network", active_network)
    monkeypatch.setattr(worker, "db", test_db)
    monkeypatch.setattr(worker, "REALTIME_URL", "http://127.0.0.1:9/retry-feed")
    monkeypatch.setattr(worker, "_ACTIVE_REGION", SimpleNamespace(
        region_id="retry-region", network_id="retry-network",
        realtime_type="GTFS_RT", timezone="UTC", service_day_start_hour=0,
    ))
    monkeypatch.setattr(worker, "asyncio", SimpleNamespace(sleep=end_cycle))
    logs = []
    monkeypatch.setattr(worker, "_log", logs.append)

    collection = test_db.mobility_realtime
    key = {
        "region_id": "retry-region",
        "network_id": "retry-network",
        "trip_id": "retry-trip",
    }
    await collection.create_index(
        [("region_id", 1), ("network_id", 1), ("trip_id", 1)], unique=True,
    )
    assert await collection.count_documents({}) == 0

    original_bulk_write = type(collection).bulk_write
    bulk_write_calls = 0
    duplicate_errors = []

    async def create_winning_upsert_then_write(self, requests, **kwargs):
        nonlocal bulk_write_calls
        if self.full_name == collection.full_name:
            bulk_write_calls += 1
            if bulk_write_calls == 1:
                await collection.insert_one({
                    **key,
                    "network_version_id": "retry-version",
                    "service_date": service_date,
                    "network_activation_epoch": now - 300,
                    "feed_timestamp": now - 200,
                    "delay_seconds": 1,
                })
            try:
                return await original_bulk_write(self, requests, **kwargs)
            except BulkWriteError as exc:
                duplicate_errors.append(exc.details)
                raise
        return await original_bulk_write(self, requests, **kwargs)

    monkeypatch.setattr(
        type(collection), "bulk_write", create_winning_upsert_then_write,
    )

    with pytest.raises(asyncio.CancelledError):
        await worker._realtime_worker()

    assert len(duplicate_errors) == 1
    errors = duplicate_errors[0]["writeErrors"]
    assert len(errors) == 1 and errors[0]["code"] == 11000
    assert bulk_write_calls == 2
    row = await collection.find_one(key)
    assert await collection.count_documents({}) == 1
    assert row["feed_timestamp"] == now - 100
    assert row["delay_seconds"] == 42
    assert not any("cycle error" in line for line in logs), logs
    assert any("stored=1" in line for line in logs), logs
