"""Offline civil-date, strict identity and retained carryover regressions."""
import asyncio
import io
import json
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, mock_open
from zoneinfo import ZoneInfo
import zipfile

import pytest

from mobility import domain
from mobility.service_clock import _static_service_date, service_seconds
from mobility.schedule_revision import service_day_for, seconds_until_next_service_day
from mobility.realtime_trip_identity import build_trip_index, match_trip_update
from routes import mobility as routes
from utils import gtfs, mobility_workers as workers

TZ = "Europe/Berlin"


def local(value):
    return datetime.fromisoformat(value).replace(tzinfo=ZoneInfo(TZ))


def network(day, start="00:10", end="00:30"):
    return {
        "version_id": f"v-{day}", "service_date": day, "name": f"GTFS {day}",
        "region_id": "magdeburg", "network_id": "de-magdeburg-mvb",
        "activated_at": "2026-10-22T00:00:00+02:00",
        "routes": [{"route_number": "N", "mode": "bus", "stops": [
            {"stop_id": "A", "name": "A", "lat": 52.1, "lng": 11.6},
            {"stop_id": "B", "name": "B", "lat": 52.11, "lng": 11.61}],
            "trips": [{"trip_id": "same-id", "start": start, "end": end,
                       "stop_ids": ["A", "B"], "stop_sequences": [0, 1],
                       "stop_times": {"A": start, "B": end}}]}],
    }


@pytest.mark.parametrize("clock", ["00:00", "02:35", "03:59", "04:00", "23:59"])
def test_civil_date_never_uses_display_boundary(monkeypatch, clock):
    now = local(f"2026-10-23T{clock}")
    assert _static_service_date(now, TZ) == "2026-10-23"
    assert service_day_for(now, 4).isoformat() == ("2026-10-22" if clock < "04:00" else "2026-10-23")
    monkeypatch.setattr(routes, "_berlin_now", lambda: now)
    raw = routes._time_to_seconds(clock)
    assert routes._now_service_seconds("2026-10-23") == raw
    assert routes._now_service_seconds("2026-10-22") == raw + 86400
    assert routes._now_service_seconds("2026-10-24") == raw - 86400


def test_timezone_midnight_dst_and_naive_rejection():
    assert _static_service_date(datetime.fromisoformat("2026-10-22T22:00:00+00:00"), TZ) == "2026-10-23"
    for day in ("2026-03-29", "2026-10-25"):
        now = local(f"{day}T04:00")
        assert service_seconds(now, day, TZ) == 14400
    for fold in (0, 1):
        now = local("2026-10-25T02:30").replace(fold=fold)
        assert service_seconds(now, "2026-10-25", TZ) == 9000
        assert routes._epoch_to_service_seconds(now.timestamp(), "2026-10-25") == 9000
    assert seconds_until_next_service_day(local("2026-03-29T00:00"), 0) == 23 * 3600
    assert seconds_until_next_service_day(local("2026-10-25T00:00"), 0) == 25 * 3600
    with pytest.raises(ValueError):
        _static_service_date(datetime(2026, 10, 23), TZ)


@pytest.mark.parametrize("start,end,valid", [("00:10", "00:30", True), ("24:10", "24:30", True),
                                            ("03:50", "04:00", True), ("23:50", "00:05", False),
                                            ("02:35", "02:30", False)])
def test_raw_clocks_and_true_backwards_fail_closed(start, end, valid):
    route = network("2026-10-23", start, end)["routes"][0]
    timeline = routes._predicted_stop_timeline(route, route["trips"][0], None)
    assert bool(timeline) is valid
    if valid:
        assert timeline[0]["scheduled"] == routes._time_to_seconds(start)
        assert domain._hhmm_to_sec(start) == routes._time_to_seconds(start)


def test_previous_24xx_and_current_00xx_have_same_epoch_but_distinct_identity():
    now = local("2026-10-23T00:20")
    for day, start, end, expected in [("2026-10-22", "24:10", "24:30", 87600),
                                      ("2026-10-23", "00:10", "00:30", 1200)]:
        net = network(day, start, end)
        route = net["routes"][0]
        rt = {"service_date": day, "stop_predictions": {"A": {"arrival_epoch": now.timestamp()}}}
        timeline = routes._predicted_stop_timeline(route, route["trips"][0], rt)
        assert timeline[0]["predicted_arrival"] == expected
        assert timeline[0]["delay_seconds"] == 600
        assert timeline[0]["predicted_arrival"] == service_seconds(now, day, TZ)


def test_parser_default_uses_civil_friday_calendar_and_exceptions(monkeypatch):
    class Frozen(datetime):
        @classmethod
        def now(cls, tz=None):
            return local("2026-10-23T02:35").astimezone(tz)

    monkeypatch.setattr(gtfs, "datetime", Frozen)
    files = {
        "agency.txt": "agency_id,agency_name\n190,Magdeburger\n",
        "calendar.txt": "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nthu,0,0,0,1,0,0,0,20261001,20261031\nfri,0,0,0,0,1,0,0,20261001,20261031\nremoved,0,0,0,0,1,0,0,20261001,20261031\n",
        "calendar_dates.txt": "service_id,date,exception_type\nremoved,20261023,2\nextra,20261023,1\n",
        "routes.txt": "route_id,agency_id,route_short_name,route_type\nr,190,N,3\n",
        "trips.txt": "route_id,service_id,trip_id\nr,thu,thu\nr,fri,fri\nr,removed,removed\nr,extra,extra\n",
        "stops.txt": "stop_id,stop_name,stop_lat,stop_lon\nA,A,52.1,11.6\nB,B,52.11,11.61\n",
        "stop_times.txt": "trip_id,stop_sequence,stop_id,arrival_time,departure_time\n" + "".join(
            f"{tid},0,A,01:00:00,01:00:00\n{tid},1,B,01:30:00,01:30:00\n"
            for tid in ("thu", "fri", "removed", "extra")),
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        for name, text in files.items():
            archive.writestr(name, text)
    current = gtfs.parse_gtfs_zip(buf.getvalue(), agency_regex="Magdeburger", timezone=TZ)
    previous = gtfs.parse_gtfs_zip(buf.getvalue(), "2026-10-22", agency_regex="Magdeburger", timezone=TZ)
    assert current["service_date"] == "2026-10-23"
    assert {t["trip_id"] for r in current["routes"] for t in r["trips"]} == {"fri", "extra"}
    assert {t["trip_id"] for r in previous["routes"] for t in r["trips"]} == {"thu"}


@pytest.mark.asyncio
@pytest.mark.parametrize("active_day,expected_imports", [("2026-10-22", 1), ("2026-10-23", 0)])
async def test_worker_unchanged_hash_still_imports_current_civil_date(monkeypatch, active_day, expected_imports):
    import hashlib
    from mobility import service_clock, schedule_revision, generations
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def client(**kwargs):
        yield SimpleNamespace(stream=stream)

    @asynccontextmanager
    async def stream(*args):
        async def chunks():
            yield b"safe-test-feed"
        yield SimpleNamespace(raise_for_status=lambda: None, aiter_bytes=chunks)

    active = network(active_day)
    active["routes"][0]["stops"][0]["location_type"] = 0
    state = {"value": hashlib.sha256(b"safe-test-feed").hexdigest(), "schema_v": workers.STATIC_SCHEMA_V}
    sync = SimpleNamespace(find_one=AsyncMock(return_value=state), replace_one=AsyncMock())
    audits = SimpleNamespace(replace_one=AsyncMock())
    monkeypatch.setattr(workers, "db", SimpleNamespace(mobility_sync_state=sync, mobility_schedule_audits=audits))
    monkeypatch.setattr(workers.httpx, "AsyncClient", client)
    monkeypatch.setattr("builtins.open", mock_open())
    monkeypatch.setattr(service_clock, "_static_service_date", lambda now, timezone: "2026-10-23")
    monkeypatch.setattr(workers, "_has_occurrence_timing", lambda net: True)
    monkeypatch.setattr(workers, "STATIC_GTFS_URL", "https://example.invalid/test.zip")
    monkeypatch.setattr(workers, "MIN_TRIPS", 1)
    monkeypatch.setattr(workers, "MIN_LINES", 1)
    monkeypatch.setattr(workers, "AUTO_ACTIVATE", True)
    monkeypatch.setattr(workers, "_merge_shapes", AsyncMock())
    monkeypatch.setattr(workers, "request_precompute", lambda *args, **kwargs: None)
    monkeypatch.setattr(generations, "atomic_generations_enabled", lambda: False)
    monkeypatch.setattr(routes, "_get_active_network", AsyncMock(return_value=active))
    parse = Mock(return_value=network("2026-10-23"))
    monkeypatch.setattr(gtfs, "parse_gtfs_zip_path", parse)
    create = AsyncMock(return_value={"version_id": "new", "diff": {}})
    activate = AsyncMock()
    monkeypatch.setattr(routes, "_create_network_version", create)
    monkeypatch.setattr(routes, "_activate_network_version", activate)
    monkeypatch.setattr(schedule_revision, "audit_schedule", lambda *args, **kwargs: {
        "ready_to_import": True, "service_date": "2026-10-23", "contract_applied": False,
        "blocking_error_count": 0, "warning_count": 0})
    monkeypatch.setattr(workers.asyncio, "sleep", AsyncMock(side_effect=asyncio.CancelledError))
    with pytest.raises(asyncio.CancelledError):
        await workers._static_worker()
    assert parse.call_count == create.await_count == expected_imports
    # Legacy force=True automatic promotion is intentionally no longer allowed.
    # Calendar import must still happen, but only atomic-ready versions activate.
    activate.assert_not_awaited()
    sync.replace_one.assert_not_awaited()
    if expected_imports:
        assert parse.call_args.kwargs["service_date"] == "2026-10-23"
        assert create.await_args.kwargs["service_date"] == "2026-10-23"


@pytest.mark.asyncio
async def test_retained_network_evidence_keeps_duplicate_trip_ids_separate(monkeypatch):
    current = network("2026-10-23")
    previous = network("2026-10-22", "24:10", "24:30")
    lookup = AsyncMock(return_value=previous)
    monkeypatch.setattr(routes, "db", SimpleNamespace(bus_network_versions=SimpleNamespace(find_one=lookup)))
    monkeypatch.setattr(routes, "_get_active_network", AsyncMock(return_value=current))
    monkeypatch.setattr(routes, "_berlin_now", lambda: local("2026-10-23T00:20"))
    rt = AsyncMock(return_value={})
    monkeypatch.setattr(routes, "_realtime_delays_for", rt)
    evidence = await routes._journey_window_evidence()
    assert len(evidence["networks"]) == 2
    keys = [n["journeys"][0]["journey_key"] for n in evidence["networks"]]
    assert keys[0] != keys[1]
    assert keys[0][-1] == keys[1][-1] == "same-id"
    assert [c.kwargs["network"]["version_id"] for c in rt.await_args_list] == [current["version_id"], previous["version_id"]]
    query = lookup.await_args.args[0]
    assert query["activated_at"] == {"$exists": True, "$ne": None}
    assert query["$or"][0] == {"service_date": "2026-10-22"}
    monkeypatch.setattr(routes, "_berlin_now", lambda: local("2026-10-23T02:35"))
    assert all(not n["journeys"] for n in (await routes._journey_window_evidence())["networks"])
    lookup.return_value = network("2026-10-20", "24:10", "24:30")
    assert await routes.networks_for_journey_window(current) == [current]


@pytest.mark.asyncio
async def test_version_persists_explicit_date_without_relabelling_previous(monkeypatch):
    previous = network("2026-10-22")
    insert = AsyncMock()
    monkeypatch.setattr(routes, "db", SimpleNamespace(bus_network_versions=SimpleNamespace(insert_one=insert)))
    monkeypatch.setattr(routes, "_get_active_network", AsyncMock(return_value=previous))
    monkeypatch.setattr(routes, "_broadcast", lambda event: None)
    await routes._create_network_version([], "GTFS 2026-10-23", service_date="2026-10-23")
    saved = insert.await_args.args[0]
    assert saved["service_date"] == "2026-10-23"
    assert saved["active"] is False
    assert previous["service_date"] == "2026-10-22"
    assert saved["version_id"] != previous["version_id"]


def test_captured_37_strict_descriptors_and_849_epoch_equations():
    evidence = Path(__file__).resolve().parents[2] / "overnight-probe.json"
    if not evidence.exists():
        pytest.skip("Isolated safe capture not packaged in application image")
    capture = json.loads(evidence.read_text(encoding="utf-8"))
    counts = {"2026-10-22": 0, "2026-10-23": 0}
    events = 0
    for item in capture["known_descriptors"]:
        raw = item["raw_stops"]
        for day in counts:
            # Rebuild each dated identity from the separately captured day;
            # this is a safe-evidence replay, not a fresh full-feed parse.
            trip = {"trip_id": item["descriptor"]["trip_id"],
                    **item["static_days"][day],
                    "stop_ids": [s["stop_id_sha256"] for s in raw],
                    "stop_sequences": [int(s["stop_sequence"]) for s in raw]}
            index = build_trip_index({"service_date": day, "version_id": f"preview-{day}",
                                      "routes": [{"trips": [trip]}]})
            descriptor = {k: v for k, v in item["descriptor"].items() if k != "present_fields"}
            descriptor["route_id"] = ""  # Capture hashes absent strings too.
            anchors = [{"stop_id": s["stop_id_sha256"], "stop_sequence": s["stop_sequence"]}
                       for s in item["stop_updates"]]
            matched, reason = match_trip_update(descriptor, anchors, index,
                feed_timestamp=capture["feed_timestamp"], timezone_name=TZ, service_day_start_hour=4,
                activated_at=capture["activation_bound_used_for_both_previews"])
            counts[day] += matched is not None
            assert reason == ("MATCHED" if day == "2026-10-23" else "WRONG_START_DATE")
        by_sequence = {int(s["stop_sequence"]): s for s in raw}
        for update in item["stop_updates"]:
            for kind in ("arrival", "departure"):
                event = update.get(kind) or {}
                if "time" not in event or "delay" not in event:
                    continue
                scheduled = routes._time_to_seconds(by_sequence[update["stop_sequence"]][f"{kind}_time"])
                assert routes._epoch_to_service_seconds(event["time"], "2026-10-23") == scheduled + event["delay"]
                assert routes._epoch_to_service_seconds(event["time"], "2026-10-22") == scheduled + event["delay"] + 86400
                events += 1
    assert counts == {"2026-10-22": 0, "2026-10-23": 37}
    assert events == 849
