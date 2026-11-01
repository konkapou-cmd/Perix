"""Realtime window extension: fresh realtime with future departures wins.

A delayed trip whose schedule window passed (e.g. Sunday service running
late) must not park at a terminus while its own realtime still shows future
departures. Stale feed rows never qualify.
"""
from routes.mobility import _select_run_trip


def _route():
    stops = [{'stop_id': 'A', 'lat': 52.10, 'lng': 11.60},
             {'stop_id': 'B', 'lat': 52.12, 'lng': 11.62}]
    return {'route_number': '5', 'mode': 'tram', 'stops': stops}


def _trip():
    return {'trip_id': 'T1',
            'stop_ids': ['A', 'B'],
            'stop_times': {'A': '10:00:00', 'B': '10:10:00'},
            'stop_times_arrival': {'A': '10:00:00', 'B': '10:10:00'}}


def _run():
    trip = _trip()
    window = {'trip': trip, 'start': 36000, 'end': 36600}
    return {'trips': [window], 'start': 36000, 'end': 36600}


def test_delayed_past_schedule_window_stays_active_on_fresh_realtime():
    run = _run()
    delays = {'T1': {'delay_seconds': 1800, 'trip_delay_observed': True}}
    trip, basis = _select_run_trip(run, 37200, delays, _route())
    assert basis == 'SOURCE_REALTIME_ACTIVE'
    assert str(trip['trip']['trip_id']) == 'T1'


def test_stale_feed_never_reopens_a_finished_window():
    run = _run()
    delays = {'T1': {'delay_seconds': 1800, 'trip_delay_observed': True,
                     'source_timing_status': 'STALE_FEED'}}
    trip, basis = _select_run_trip(run, 37200, delays, _route())
    assert basis == 'NO_ACTIVE_WINDOW' and trip is None


def test_no_realtime_keeps_previous_behavior():
    run = _run()
    assert _select_run_trip(run, 37200, {}, _route())[1] == 'NO_ACTIVE_WINDOW'
    assert _select_run_trip(run, 37200)[1] == 'NO_ACTIVE_WINDOW'
    trip, basis = _select_run_trip(run, 36100, {}, _route())
    assert basis == 'SOURCE_ACTIVE' and str(trip['trip']['trip_id']) == 'T1'
