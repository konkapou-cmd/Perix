"""Route-split storage: large networks are header + per-route block docs and
assemble back to the exact single-doc shape. Small networks stay single-doc."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

import mobility.network_store as store
import routes.mobility as mobility_routes


class MemoryCursor:
    def __init__(self, docs):
        self.docs = list(docs)

    def sort(self, key, direction):
        if isinstance(key, str):
            self.docs.sort(key=lambda d: d.get(key), reverse=(direction == -1))
        else:
            self.docs.sort(key=lambda d: [d.get(k) for k in key], reverse=(direction == -1))
        return self

    async def to_list(self, length=None):
        return self.docs if length is None else self.docs[:length]


class MemoryCollection:
    def __init__(self):
        self.docs = []

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def insert_many(self, docs, ordered=False):
        self.docs.extend(dict(d) for d in docs)

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                return dict(d)
        return None

    def find(self, query, projection=None):
        def matches(doc):
            for key, value in query.items():
                if isinstance(value, dict) and "$in" in value:
                    if doc.get(key) not in value["$in"]:
                        return False
                elif doc.get(key) != value:
                    return False
            return True

        return MemoryCursor([d for d in self.docs if matches(d)])


def make_route(number, trips=2):
    return {
        "route_number": number,
        "mode": "bus",
        "name": f"Line {number}",
        "stops": [{"stop_id": f"s{i}", "name": f"Stop {i}", "lat": 52.1 + i * 0.001, "lng": 11.6 + i * 0.001}
                  for i in range(3)],
        "trips": [{"trip_id": f"{number}-{i}", "stop_ids": ["s0", "s1", "s2"],
                   "stop_sequences": [0, 1, 2],
                   "stop_times": {f"s{j}": f"0{j}:00" for j in range(3)},
                   "stop_times_arrival": {f"s{j}": f"0{j}:00" for j in range(3)},
                   "stop_times_sequence": [{"stop_id": f"s{j}", "stop_sequence": j,
                                            "arrival_time": f"0{j}:00",
                                            "departure_time": f"0{j}:00"} for j in range(3)]}
                  for i in range(trips)],
    }


def fake_region():
    return SimpleNamespace(region_id="magdeburg", network_id="de-magdeburg-mvb",
                           timezone="Europe/Berlin", country="DE", service_day_start_hour=4)


@pytest.fixture()
def memory_db(monkeypatch):
    fake = SimpleNamespace()
    fake.bus_network_versions = MemoryCollection()
    fake.bus_network_route_blocks = MemoryCollection()
    fake.bus_network_trip_times_blocks = MemoryCollection()
    fake.bus_network_trip_windows_blocks = MemoryCollection()
    monkeypatch.setattr(mobility_routes, "db", fake)
    monkeypatch.setattr(store, "db", fake)
    monkeypatch.setattr(mobility_routes, "get_active_region", fake_region)
    monkeypatch.setattr(mobility_routes, "_get_active_network", AsyncMock(return_value=None))
    monkeypatch.setattr(mobility_routes, "_broadcast", lambda *a, **k: None)
    return fake


def test_small_network_stays_single_doc_byte_identical(memory_db):
    routes = [make_route(f"{i}") for i in range(3)]
    result = asyncio.run(mobility_routes._create_network_version(routes, "small"))
    doc = memory_db.bus_network_versions.docs[0]
    assert doc["routes"] == routes
    assert "routes_split" not in doc
    assert memory_db.bus_network_route_blocks.docs == []
    assembled = asyncio.run(store.assemble_network_routes(doc))
    assert assembled == doc
    assert result["version_id"] == doc["version_id"]


def test_large_network_splits_and_reassembles_in_order(monkeypatch, memory_db):
    monkeypatch.setattr(store, "ROUTE_SPLIT_BYTES", 500)  # every test route > this
    monkeypatch.setattr(store, "SERIALIZE_TRIP_GATE", 0)
    routes = [make_route(f"{i}", trips=2) for i in range(5)]
    result = asyncio.run(mobility_routes._create_network_version(routes, "large"))
    docs = memory_db.bus_network_versions.docs
    assert len(docs) == 1
    header = docs[0]
    assert header["routes_split"] is True
    assert header["routes_count"] == 5
    assert header["occurrence_timing"] is True
    assert "routes" not in header
    blocks = memory_db.bus_network_route_blocks.docs
    assert len(blocks) == 5
    assert [b["route_index"] for b in blocks] == [0, 1, 2, 3, 4]
    assert [b["route_number"] for b in blocks] == ["0", "1", "2", "3", "4"]
    # light assembly: shells keep identity/geometry, timing is detached
    light = asyncio.run(store.assemble_network_routes(header))
    assert light["routes"] != routes
    for route in light["routes"]:
        for trip in route["trips"]:
            assert "stop_times_sequence" not in trip
            assert "stop_times" not in trip
            assert "stop_times_arrival" not in trip
            assert trip.get("stop_ids") == ["s0", "s1", "s2"]
    # include_times assembly: identical to the original payload
    full = asyncio.run(store.assemble_network_routes(header, include_times=True))
    assert full["routes"] == routes
    assert full["version_id"] == result["version_id"]
    # times blocks exist and are keyed by route_index
    times_docs = memory_db.bus_network_trip_times_blocks.docs
    assert len(times_docs) == 5
    assert times_docs[2]["trips"][0]["trip_id"] == "2-0"
    assert "stop_times_sequence" in times_docs[2]["trips"][0]


def test_attach_route_times_respects_allowlist(monkeypatch, memory_db):
    monkeypatch.setattr(store, "ROUTE_SPLIT_BYTES", 500)
    monkeypatch.setattr(store, "SERIALIZE_TRIP_GATE", 0)
    routes = [make_route(f"{i}") for i in range(3)]
    asyncio.run(mobility_routes._create_network_version(routes, "allow"))
    header = memory_db.bus_network_versions.docs[0]
    light = asyncio.run(store.assemble_network_routes(header))
    asyncio.run(store.attach_route_times(light["routes"], header["version_id"], route_numbers={"1"}))
    for route in light["routes"]:
        if route["route_number"] == "1":
            assert route["trips"][0]["stop_times_sequence"]
        else:
            assert "stop_times_sequence" not in route["trips"][0]


def test_attach_route_times_filters_by_trip_ids(monkeypatch, memory_db):
    monkeypatch.setattr(store, "ROUTE_SPLIT_BYTES", 500)
    monkeypatch.setattr(store, "SERIALIZE_TRIP_GATE", 0)
    routes = [make_route("0", trips=3)]
    asyncio.run(mobility_routes._create_network_version(routes, "trips"))
    header = memory_db.bus_network_versions.docs[0]
    light = asyncio.run(store.assemble_network_routes(header))
    asyncio.run(store.attach_route_times(light["routes"], header["version_id"], trip_ids={"0-1"}))
    trips = light["routes"][0]["trips"]
    assert "stop_times_sequence" in trips[1]
    assert "stop_times_sequence" not in trips[0]
    assert "stop_times_sequence" not in trips[2]


def test_window_fast_path_reconstructs_stop_dicts():
    route = {"route_number": "1", "stops": [{"stop_id": "A", "lat": 52.1, "lng": 11.6},
                                            {"stop_id": "B", "lat": 52.2, "lng": 11.7}]}
    trip = {"trip_id": "t1",
            "window": {"start": 100, "end": 200, "first_stop_id": "A", "last_stop_id": "B",
                       "ordered": ["A|100", "B|200"]}}
    win = mobility_routes._trip_window(route, trip, None)
    assert win["start"] == 100 and win["end"] == 200
    assert win["first_stop"]["lat"] == 52.1
    assert win["last_stop"]["lng"] == 11.7
    assert win["ordered"][0][0]["stop_id"] == "A"
    assert win["ordered"][1][1] == 200


def test_predicted_timeline_fast_path_reconstructs_stop():
    route = {"route_number": "1", "stops": [{"stop_id": "A", "lat": 52.1, "lng": 11.6},
                                            {"stop_id": "B", "lat": 52.2, "lng": 11.7}]}
    trip = {"trip_id": "t1", "base_timeline": [
        {"stop_id": "A", "predicted_arrival": 100, "predicted_departure": 110, "relationship": "NO_DATA"},
        {"stop_id": "B", "predicted_arrival": 200, "predicted_departure": 210, "relationship": "NO_DATA"}]}
    timeline = mobility_routes._predicted_stop_timeline(route, trip, None)
    assert timeline[0]["stop"]["lat"] == 52.1
    assert timeline[1]["stop"]["stop_id"] == "B"
    assert timeline[1]["predicted_arrival"] == 200
    # realtime present must NOT use the fast path
    slow = mobility_routes._predicted_stop_timeline(route, trip, {"delay_seconds": 60})
    assert slow == [] or slow != timeline  # raw fields missing -> empty/error path, never the base


def test_windows_blocks_stored_and_attached(monkeypatch, memory_db):
    monkeypatch.setattr(store, "ROUTE_SPLIT_BYTES", 500)
    monkeypatch.setattr(store, "SERIALIZE_TRIP_GATE", 0)
    routes = [make_route("0", trips=2)]
    asyncio.run(mobility_routes._create_network_version(routes, "win"))
    header = memory_db.bus_network_versions.docs[0]
    win_docs = memory_db.bus_network_trip_windows_blocks.docs
    assert len(win_docs) == 1
    stored = win_docs[0]["trips"]
    assert stored[0]["trip_id"] == "0-0"
    assert "start" in stored[0] and "ordered" in stored[0]
    light = asyncio.run(store.assemble_network_routes(header))
    assert "window" not in light["routes"][0]["trips"][0]
    asyncio.run(store.attach_route_windows(light["routes"], header["version_id"]))
    for trip in light["routes"][0]["trips"]:
        assert isinstance(trip.get("window"), dict)
        assert trip["window"].get("start") is not None


def test_assemble_passthrough_and_none():
    assert asyncio.run(store.assemble_network_routes(None)) is None
    plain = {"version_id": "net_x", "routes": [{"route_number": "1"}]}
    assert asyncio.run(store.assemble_network_routes(plain)) == plain
    empty_split = {"version_id": "net_y", "routes_split": True}
    assembled = asyncio.run(store.assemble_network_routes(empty_split))
    assert assembled == {"version_id": "net_y", "routes_split": True, "routes": []}


def test_split_import_streams_one_route_at_a_time(monkeypatch, memory_db):
    monkeypatch.setattr(store, "ROUTE_SPLIT_BYTES", 500)
    monkeypatch.setattr(store, "SERIALIZE_TRIP_GATE", 0)
    routes = [make_route(f"{i}") for i in range(4)]
    order = []

    original = memory_db.bus_network_route_blocks.insert_one
    async def spy(doc):
        order.append(doc["route_index"])
        await original(doc)
    memory_db.bus_network_route_blocks.insert_one = spy
    asyncio.run(mobility_routes._create_network_version(routes, "streamed"))
    assert order == [0, 1, 2, 3]
    assert len(memory_db.bus_network_route_blocks.docs) == 4
    assert len(memory_db.bus_network_trip_times_blocks.docs) == 4
    assert len(memory_db.bus_network_trip_windows_blocks.docs) == 4
