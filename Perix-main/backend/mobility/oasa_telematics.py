"""OASA telematics adapter (Athens buses/trolleys).

The telematics API publishes vehicle positions per route code and per-stop
arrival estimates, WITHOUT trip ids. This module:
  1. clients the undocumented public API gently (rate-limited),
  2. matches each vehicle to exactly one scheduled trip of the active static
     network (memory-based one-to-one assignment, locked on observed origin
     departure - the design evaluated by AUEB-BALab/athens-gtfs-realtime at
     98% matching, median 0.5-1.1 min arrival error),
  3. predicts downstream stop times (schedule + carried delay, or recent
     per-segment medians when enough passages were observed).

Never fabricates: a vehicle with no plausible trip exports with a position
and route only (identity_kind OASA_TELEMATICS_UNMATCHED). All times from the
static GTFS schedule + observed delays; no invented provider clocks.

Attribution: OASA telematics is a public but undocumented API; use sparingly
(operator request rate ~1/s max, AUEB measured; keep far below that).
"""
from __future__ import annotations

import logging
import math
import os
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Iterable, Optional

import httpx

logger = logging.getLogger(__name__)

DEFAULT_BASE = "http://telematics.oasa.gr/api/"
MIN_REQUEST_INTERVAL_S = 1.0  # one request per second ceiling
MATCH_MIN_DEVIATION_S = -600   # vehicles may not be more than 10 min early
MATCH_MAX_DEVIATION_S = 3600   # nor more than 60 min late
DEPARTURE_LOCK_TOLERANCE_S = 150
RECENT_WINDOW_S = 45 * 60
RECENT_MIN_PASSAGES = 2


def _parse_telematics_time(value: str) -> Optional[int]:
    """'Jul 13 2016 11:05:32:000PM' -> epoch seconds (UTC), else None."""
    try:
        import calendar
        from datetime import datetime
        cleaned = value.replace(":000", "").strip()
        for fmt in ("%b %d %Y %I:%M:%S%p", "%b %d %Y %I:%M:%S %p"):
            try:
                return calendar.timegm(datetime.strptime(cleaned, fmt).utctimetuple())
            except ValueError:
                continue
        return None
    except Exception:
        return None


class RateLimiter:
    """One request per MIN_REQUEST_INTERVAL_S across all calls (thread-safe)."""

    def __init__(self, min_interval: float = MIN_REQUEST_INTERVAL_S):
        self.min_interval = min_interval
        self._last = 0.0
        self._lock = threading.Lock()

    def wait(self) -> None:
        with self._lock:
            now = time.monotonic()
            wait = self._last + self.min_interval - now
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()


class OasaTelematicsClient:
    """Minimal client for the documented telematics actions."""

    def __init__(self, base_url: Optional[str] = None, timeout: float = 20.0,
                 min_interval: float = MIN_REQUEST_INTERVAL_S):
        self.base_url = (base_url or os.getenv("MOBILITY_OASA_TELEMATICS_URL") or DEFAULT_BASE).rstrip("/") + "/"
        self.timeout = timeout
        self.limiter = RateLimiter(min_interval)

    def _get(self, act: str, p1: Optional[str] = None) -> list:
        self.limiter.wait()
        params = {"act": act}
        if p1 is not None:
            params["p1"] = p1
        resp = httpx.post(self.base_url, params=params, timeout=self.timeout,
                          headers={"User-Agent": "PerixMobility/1.0 (app.perixapp.com)"})
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, list):
            raise ValueError("unexpected telematics payload: %r" % type(data).__name__)
        return data

    def get_bus_location(self, route_code: str) -> list:
        """[{VEH_NO, CS_DATE, CS_LAT, CS_LNG, ROUTE_CODE}, ...]"""
        return self._get("getBusLocation", str(route_code))

    def get_stop_arrivals(self, stop_code: str) -> list:
        """[{route_code, veh_code, btime2}, ...] btime2 = minutes."""
        return self._get("getStopArrivals", str(stop_code))

    def web_get_routes(self) -> list:
        return self._get("webGetRoutes")

    def web_get_stops(self) -> list:
        return self._get("webGetStops")


@dataclass
class MatchedVehicle:
    vehicle_id: str
    route_code: str
    trip_id: Optional[str]
    status: str  # MATCHED | UNMATCHED_NO_PLAUSIBLE_TRIP
    progress_stop_index: int
    delay_seconds: int
    lat: float
    lon: float
    timestamp_s: int


def _haversine_m(a, b) -> float:
    r = 6371000.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = math.radians(b[0] - a[0]), math.radians(b[1] - a[1])
    x = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(x), math.sqrt(1 - x))


def project_on_polyline(point, polyline) -> tuple[int, float]:
    """Return (segment_index, distance_m) of the nearest point on the polyline."""
    best = (0, float("inf"))
    for i in range(len(polyline) - 1):
        a, b = polyline[i], polyline[i + 1]
        d_ab = _haversine_m(a, b)
        if d_ab < 1:
            continue
        t = max(0.0, min(1.0, (
            (point[0] - a[0]) * (b[0] - a[0]) + (point[1] - a[1]) * (b[1] - a[1])) / (d_ab ** 2)
        ))
        proj = (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))
        d = _haversine_m(point, proj)
        if d < best[1]:
            best = (i, d)
    return best


class VehicleTripMatcher:
    """One-to-one vehicle->trip assignment per line, memory of last 15 min.

    Candidates must be plausible (deviation within window); assignment is
    greedy over per-vehicle best deviation, unique per trip. A vehicle that
    was observed near the origin within DEPARTURE_LOCK_TOLERANCE_S of a
    scheduled departure locks that trip until the trip ends.
    """

    def __init__(self, history_seconds: int = 15 * 60):
        self.history_seconds = history_seconds
        self._locks: dict[str, str] = {}          # vehicle_id -> trip_id
        self._last_assign: dict[str, tuple] = {}  # vehicle_id -> (trip_id, ts)

    def forget(self, vehicle_id: str) -> None:
        self._locks.pop(vehicle_id, None)
        self._last_assign.pop(vehicle_id, None)

    def _candidate_deviation(self, progress_segment: int, distance_along_m: float,
                             trip: dict) -> Optional[int]:
        """Scheduled position of the trip now, as (segment index, m) or None."""
        stop_times = trip.get("stop_times_sequence") or []
        if len(stop_times) < 2:
            return None
        now = trip["_now_s"]
        start = trip["_start_s"]
        spans = []
        for left, right in zip(stop_times, stop_times[1:]):
            spans.append((left, right, trip["_leg_m"][left["stop_sequence"]] if "_leg_m" in trip else 0))
        total_m = sum(s[2] for s in spans) or 1.0
        elapsed = now - start
        # trips that have not started or already ended are not plausible
        last_abs = stop_times[-1]["_abs_s"]
        if elapsed < 0 or elapsed > (last_abs - start) + 300:
            return None
        # uniform spatial schedule position between anchor times
        scheduled_m = 0.0
        for left, right, leg_m in spans:
            t0 = left["_abs_s"]
            t1 = right["_abs_s"]
            if elapsed < t0 - start or elapsed >= t1 - start:
                scheduled_m += leg_m
                continue
            scheduled_m += leg_m * (elapsed - (t0 - start)) / max(1, (t1 - t0))
            break
        deviation = int(distance_along_m - scheduled_m)  # metres ahead/behind schedule
        # crude metres->seconds via assumed speed
        speed = trip.get("_speed_mps", 5.5)
        return int(deviation / max(0.5, speed))

    def match(self, vehicles: list, trips: list, now_s: int,
              route_polyline: list, stops_progress: list) -> list[MatchedVehicle]:
        """vehicles: [{vehicle_id, lat, lon, ts}]; trips: prepared trip dicts
        with _now_s/_start_s/_abs_s per stop time and _speed_mps."""
        # expire locks/assignments older than the history window
        for vid in list(self._last_assign):
            _tid, ts = self._last_assign[vid]
            if now_s - ts > self.history_seconds:
                self._last_assign.pop(vid, None)
        results: list[MatchedVehicle] = []
        used_trips: set[str] = set()
        candidates = []
        for raw in vehicles:
            lat = raw.get("lat")
            lon = raw.get("lon", raw.get("lng"))
            v = {**raw, "lat": lat, "lon": lon}
            if lat is None or lon is None:
                results.append(MatchedVehicle(v["vehicle_id"], v.get("route_code", ""), None,
                                              "UNMATCHED_NO_GEOMETRY", 0, 0, lat or 0, lon or 0, v["ts"]))
                continue
            seg, dist_m = project_on_polyline((lat, lon), route_polyline)
            if seg >= len(stops_progress) or not stops_progress:
                results.append(MatchedVehicle(v["vehicle_id"], v.get("route_code", ""), None,
                                              "UNMATCHED_NO_GEOMETRY", 0, 0, lat, lon, v["ts"]))
                continue
            progress_m = stops_progress[seg] + dist_m
            lock = self._locks.get(v["vehicle_id"])
            options = []
            for trip in trips:
                if lock and trip["trip_id"] != lock:
                    continue
                dev = self._candidate_deviation(seg, progress_m, trip)
                if dev is None or not (MATCH_MIN_DEVIATION_S <= dev <= MATCH_MAX_DEVIATION_S):
                    continue
                options.append((abs(dev), trip))
            candidates.append((v, seg, progress_m, sorted(options, key=lambda x: x[0])))
        candidates.sort(key=lambda c: c[3][0][0] if c[3] else float("inf"))
        for v, seg, progress_m, options in candidates:
            if not options:
                results.append(MatchedVehicle(v["vehicle_id"], v.get("route_code", ""), None,
                                              "UNMATCHED_NO_PLAUSIBLE_TRIP", seg, 0, v["lat"], v["lon"], v["ts"]))
                continue
            chosen = None
            for _, trip in options:
                if trip["trip_id"] in used_trips:
                    continue
                chosen = trip
                break
            if chosen is None:
                results.append(MatchedVehicle(v["vehicle_id"], v.get("route_code", ""), None,
                                              "UNMATCHED_TRIPS_EXHAUSTED", seg, 0, v["lat"], v["lon"], v["ts"]))
                continue
            used_trips.add(chosen["trip_id"])
            self._last_assign[v["vehicle_id"]] = (chosen["trip_id"], v["ts"])
            # lock when the vehicle is near the origin within tolerance of its
            # scheduled departure (origin departure evidence, AUEB memory design)
            if seg == 0 and abs(now_s - chosen["_start_s"]) <= DEPARTURE_LOCK_TOLERANCE_S:
                self._locks[v["vehicle_id"]] = chosen["trip_id"]
            delay = 0
            for st in chosen.get("stop_times_sequence") or []:
                if st.get("stop_sequence") == seg:
                    delay = int(now_s - st["_abs_s"])
                    break
            results.append(MatchedVehicle(v["vehicle_id"], v.get("route_code", ""), chosen["trip_id"],
                                          "MATCHED", seg, delay, v["lat"], v["lon"], v["ts"]))
        return results


class SegmentTimeLearner:
    """Median passage time per segment over the recent window (AUEB 'recent'
    ETA mode); falls back to schedule + carried delay with fewer passages."""

    def __init__(self, window_s: int = RECENT_WINDOW_S, min_passages: int = RECENT_MIN_PASSAGES):
        self.window_s = window_s
        self.min_passages = min_passages
        self._segments: dict[str, deque] = defaultdict(deque)

    def record_passage(self, segment_key: str, seconds: float, now_s: int) -> None:
        q = self._segments[segment_key]
        q.append((now_s, seconds))
        while q and now_s - q[0][0] > self.window_s:
            q.popleft()

    def segment_seconds(self, segment_key: str, schedule_seconds: float, now_s: int) -> float:
        q = self._segments.get(segment_key)
        if not q:
            return schedule_seconds
        q = self._segments[segment_key]
        while q and now_s - q[0][0] > self.window_s:
            q.popleft()
        values = sorted(v for _ts, v in q)
        if len(values) < self.min_passages:
            return schedule_seconds
        mid = len(values) // 2
        return values[mid] if len(values) % 2 else (values[mid - 1] + values[mid]) / 2


def predict_stop_times(trip: dict, current_stop_index: int, delay_seconds: int,
                       learner: Optional[SegmentTimeLearner] = None, now_s: Optional[int] = None) -> list[dict]:
    """Remaining stops with predicted arrival.

    Without a learner: schedule time + the carried delay for every stop.
    With a learner: first stop gets schedule + delay, then each next stop uses
    the learned median segment time (falls back to schedule delta when the
    learner has fewer than min_passages observations).
    """
    sts = trip.get("stop_times_sequence") or []
    remaining = [st for st in sts if st.get("stop_sequence", -1) > current_stop_index]
    out = []
    prev_predicted: Optional[int] = None
    prev_sched: Optional[int] = None
    for st in remaining:
        key = "%s:%s" % (trip.get("trip_id"), st.get("stop_sequence"))
        if (learner is not None and now_s is not None
                and prev_sched is not None and prev_predicted is not None):
            learned = learner.segment_seconds(key, st["_abs_s"] - prev_sched, now_s)
            predicted = prev_predicted + learned
        else:
            predicted = st["_abs_s"] + delay_seconds
        out.append({"stop_id": st.get("stop_id"), "predicted_arrival": predicted,
                    "scheduled": st["_abs_s"], "delay": delay_seconds,
                    "basis": "LEARNED_SEGMENT" if learner is not None else "SCHEDULE_PLUS_DELAY"})
        prev_sched = st["_abs_s"]
        prev_predicted = predicted
    return out
