"""Offline tests for the OASA telematics adapter (no network, no DB)."""
import os
import sys
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mobility.oasa_telematics import (
    DEPARTURE_LOCK_TOLERANCE_S,
    OasaTelematicsClient,
    RateLimiter,
    SegmentTimeLearner,
    VehicleTripMatcher,
    _parse_telematics_time,
    predict_stop_times,
    project_on_polyline,
)


def make_trip(trip_id, start_s, stop_times, speed_mps=5.5):
    sts = []
    for seq, (sid, t) in enumerate(stop_times):
        sts.append({"stop_sequence": seq, "stop_id": sid, "_abs_s": start_s + t})
    return {"trip_id": trip_id, "_start_s": start_s, "_now_s": 0,
            "stop_times_sequence": sts, "_speed_mps": speed_mps}


class ParseTimeTests(unittest.TestCase):
    def test_parse(self):
        self.assertIsNotNone(_parse_telematics_time("Jul 13 2016 09:05:32:000AM"))
        self.assertIsNone(_parse_telematics_time("garbage"))
        self.assertIsNone(_parse_telematics_time(""))


class RateLimiterTests(unittest.TestCase):
    def test_waits(self):
        rl = RateLimiter(min_interval=0.05)
        rl.wait()
        t0 = time.monotonic()
        rl.wait()
        self.assertGreaterEqual(time.monotonic() - t0, 0.04)


class ProjectionTests(unittest.TestCase):
    def test_on_segment(self):
        line = [(37.90, 23.70), (37.91, 23.70), (37.92, 23.70)]
        seg, d = project_on_polyline((37.9105, 23.70), line)
        self.assertEqual(seg, 1)
        self.assertLess(d, 60)


class MatcherTests(unittest.TestCase):
    def setUp(self):
        self.polyline = [(37.900, 23.700), (37.910, 23.700), (37.920, 23.700),
                         (37.930, 23.700), (37.940, 23.700)]
        # 5 stops: one every ~1.1 km; trip takes 4 * 10 min = 2400 s
        self.trips = [
            make_trip("t1", 100000, [("A", 0), ("B", 600), ("C", 1200), ("D", 1800), ("E", 2400)]),
            make_trip("t2", 100000 + 1800, [("A", 0), ("B", 600), ("C", 1200), ("D", 1800), ("E", 2400)]),
        ]
        self.now = 0

    def vehicle(self, vid, lat, lng, ts, route="2045"):
        return {"vehicle_id": vid, "lat": lat, "lng": lng, "ts": ts, "route_code": route}

    def match_vehicles(self, vehicles):
        for t in self.trips:
            t["_now_s"] = self.now
        m = VehicleTripMatcher(history_seconds=3600)
        return m.match(vehicles, self.trips, self.now, self.polyline,
                       [0, 1112, 2224, 3336, 4448])

    def test_two_vehicles_two_trips_one_to_one(self):
        self.now = 100000 + 1800
        # first vehicle halfway (segment 1-2, ~1668m) exactly on t2's schedule
        v1 = self.vehicle("v1", 37.915, 23.700, self.now)
        # second vehicle at segment 0 near t1's departure
        v2 = self.vehicle("v2", 37.9005, 23.700, self.now)
        res = {r.vehicle_id: r for r in self.match_vehicles([v1, v2])}
        self.assertEqual(res["v1"].status, "MATCHED")
        self.assertEqual(res["v2"].status, "MATCHED")
        self.assertNotEqual(res["v1"].trip_id, res["v2"].trip_id,
                            "one-to-one: distinct trips")

    def test_out_of_window_rejected(self):
        self.now = 100000 + 7200  # > 60 min after both departures
        v = self.vehicle("v1", 37.930, 23.700, self.now)
        res = self.match_vehicles([v])
        self.assertEqual(res[0].status, "UNMATCHED_NO_PLAUSIBLE_TRIP")
        self.assertIsNone(res[0].trip_id)

    def test_origin_departure_locks_trip(self):
        self.now = 100000 + 60  # 1 min after t1 departure
        m = VehicleTripMatcher(history_seconds=3600)
        for t in self.trips:
            t["_now_s"] = self.now
        v = self.vehicle("v1", 37.9002, 23.700, self.now)
        m.match([v], self.trips, self.now, self.polyline, [0, 1112, 2224, 3336, 4448])
        self.assertIn("v1", m._locks, "origin observation locks the trip")

    def test_lock_persists_to_later_cycle(self):
        m = VehicleTripMatcher(history_seconds=3600)
        self.now = 100000 + 60
        for t in self.trips:
            t["_now_s"] = self.now
        m.match([self.vehicle("v1", 37.9002, 23.700, self.now)], self.trips, self.now,
                self.polyline, [0, 1112, 2224, 3336, 4448])
        self.assertEqual(m._locks.get("v1"), "t1")
        # next cycle, vehicle advanced to segment 2; t1 is 30 min in: t1 is the
        # only candidate (locked), even if t2 dev would be smaller otherwise
        self.now = 100000 + 2400
        for t in self.trips:
            t["_now_s"] = self.now
        res = m.match([self.vehicle("v1", 37.922, 23.700, self.now)], self.trips, self.now,
                      self.polyline, [0, 1112, 2224, 3336, 4448])
        self.assertEqual(res[0].trip_id, "t1")
        self.assertEqual(res[0].status, "MATCHED")


class EtaTests(unittest.TestCase):
    def test_schedule_plus_delay(self):
        trip = make_trip("t1", 100000, [("A", 0), ("B", 600), ("C", 1200)])
        preds = predict_stop_times(trip, current_stop_index=0, delay_seconds=300)
        self.assertEqual(preds[0]["predicted_arrival"], 100000 + 600 + 300)
        self.assertEqual(preds[0]["basis"], "SCHEDULE_PLUS_DELAY")
        self.assertEqual(preds[1]["predicted_arrival"], 100000 + 1200 + 300)

    def test_learned_segments(self):
        learner = SegmentTimeLearner(window_s=3600, min_passages=2)
        now = 100000 + 600
        trip = make_trip("t1", 100000, [("A", 0), ("B", 600), ("C", 1200)])
        # two passages of 480s on segment B->C (vs schedule 600)
        learner.record_passage("t1:2", 480, now - 120)
        learner.record_passage("t1:2", 480, now - 60)
        preds = predict_stop_times(trip, current_stop_index=0, delay_seconds=0,
                                   learner=learner, now_s=now)
        # first stop (B) = schedule + delay; second (C) = B_pred + learned
        self.assertEqual(preds[1]["predicted_arrival"], preds[0]["predicted_arrival"] + 480)
        self.assertEqual(preds[1]["basis"], "LEARNED_SEGMENT")

    def test_learner_falls_back_below_min_passages(self):
        learner = SegmentTimeLearner(window_s=3600, min_passages=2)
        now = 100000 + 600
        trip = make_trip("t1", 100000, [("A", 0), ("B", 600), ("C", 1200)])
        learner.record_passage("t1:2", 480, now - 60)  # only one passage
        preds = predict_stop_times(trip, current_stop_index=0, delay_seconds=0,
                                   learner=learner, now_s=now)
        self.assertEqual(preds[1]["predicted_arrival"], 100000 + 1200)


if __name__ == "__main__":
    unittest.main()
