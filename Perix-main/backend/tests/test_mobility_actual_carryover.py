"""Actual cached MVB occurrence clocks, captured safely by staging preflight."""
import json
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from routes import mobility as routes
from mobility.service_clock import service_seconds


def test_all_actual_twenty_one_crossings_keep_occurrences_and_dated_keys():
    fixture = json.loads((Path(__file__).parent / "fixtures/civil_actual_carryover.json").read_text())
    assert len(fixture["gtfs_sha256"]) == 64
    for day, trips in fixture["days"].items():
        assert len(trips) == len({t["trip_id_sha256"] for t in trips}) == 21
        for item in trips:
            visits = item["occurrences"]
            # Feed clock seconds are not shifted or rounded on reconstruction.
            fmt = lambda s: f"{s // 3600:02d}:{s % 3600 // 60:02d}:{s % 60:02d}"
            trip = {"trip_id": item["trip_id_sha256"], "stop_ids": [v["stop_id_sha256"] for v in visits],
                    "stop_sequences": list(range(len(visits))),
                    "stop_times_sequence": [{"stop_id": v["stop_id_sha256"], "stop_sequence": i,
                        "arrival_time": fmt(v["arrival"]), "departure_time": fmt(v["departure"])} for i, v in enumerate(visits)]}
            route = {"stops": [{"stop_id": v["stop_id_sha256"]} for v in visits]}
            timeline = routes._predicted_stop_timeline(route, trip, None)
            assert [e["scheduled_arrival"] for e in timeline] == [v["arrival"] for v in visits]
            assert [e["scheduled_departure"] for e in timeline] == [v["departure"] for v in visits]
            assert max(v["departure"] for v in visits) >= 86400
            clock = max(86400, timeline[0]["scheduled_arrival"])
            now = datetime.fromisoformat(day).replace(tzinfo=ZoneInfo("Europe/Berlin")) + timedelta(seconds=clock)
            assert service_seconds(now, day, "Europe/Berlin") == clock
            assert timeline[0]["predicted_arrival"] <= clock <= timeline[-1]["predicted_departure"]
    previous, current = fixture["days"].values()
    assert {t["trip_id_sha256"] for t in previous} == {t["trip_id_sha256"] for t in current}
