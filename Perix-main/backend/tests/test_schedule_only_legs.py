"""Schedule-only legs suppress the moving pin but keep stop ETAs via arrivals."""
from unittest.mock import AsyncMock

import pytest

from routes import mobility as routes


def route_trip():
    route = {'mode': 'tram', 'route_number': 'N8', 'stops': [
        {'stop_id': 'A', 'name': 'A', 'lat': 52.0, 'lng': 11.6},
        {'stop_id': 'B', 'name': 'B', 'lat': 52.01, 'lng': 11.61}]}
    trip = {'trip_id': 'T', 'stop_ids': ['A', 'B'],
            'stop_times': {'A': '23:32', 'B': '23:34'}}
    return route, trip


def path_for(pattern_id):
    return {'points': [[52.0, 11.6], [52.01, 11.61]], 'cumulative': [0.0, 800.0],
            'stop_progress': [0.0, 800.0], 'pattern_id': pattern_id}


def motion_between(next_idx=1, distance_m=400.0):
    return {'motion_available': True, 'progress_m': 400.0,
            'next_timeline_index': next_idx,
            'distance_to_next_stop_m': distance_m,
            'reference_service_s': 23 * 3600 + 33 * 60}


def test_known_leg_keeps_estimate_and_unknown_leg_suppresses_pin(monkeypatch):
    pass


@pytest.mark.asyncio
async def test_known_leg_keeps_estimate(monkeypatch):
    from mobility import motion as motion_pkg
    route, trip = route_trip()
    monkeypatch.setattr(routes, '_trip_path_geometry', AsyncMock(return_value=path_for('N8:2bfdf50506')))
    monkeypatch.setattr(routes, 'MOTION_ENGINE_ENABLED', True)
    monkeypatch.setattr(motion_pkg, 'position_for_trip', AsyncMock(return_value=motion_between()))
    # a_idx 0 is not in the review-only set -> pin allowed
    assert routes.is_schedule_only_leg('N8:2bfdf50506', 0) is False
    assert routes.is_schedule_only_leg('N5:14ef0cbce5', 6) is True
    assert routes.is_schedule_only_leg('N5:14ef0cbce5', 4) is True
    assert routes.is_schedule_only_leg('52:75afb29eba', 9) is True
    assert routes.is_schedule_only_leg('52:75afb29eba', 8) is False
    assert routes.is_schedule_only_leg('52:75afb29eba', 19) is True
    out = await routes._estimate_trip_position(route, trip, 23 * 3600 + 33 * 60, {}, version_id='v',
                                               network={'version_id': 'v', 'service_date': '2026-11-02'})
    assert out is not None and out['position_source'] in ('SCHEDULE_ESTIMATE', 'REALTIME_ESTIMATE')


@pytest.mark.asyncio
async def test_review_only_leg_between_stops_returns_none_keeping_arrivals(monkeypatch):
    from mobility import motion as motion_pkg
    route, trip = route_trip()
    # Pattern N8 leg 16 is schedule-only; reuse the same two-stop shape but
    # label the path with that pattern and force next_idx=17 equivalent.
    # For this two-stop fixture the leg index is 0, so patch the helper
    # to treat leg 0 of this synthetic pattern as unknown.
    monkeypatch.setattr(routes, '_trip_path_geometry', AsyncMock(return_value=path_for('SYNTH:1')))
    monkeypatch.setattr(routes, 'MOTION_ENGINE_ENABLED', True)
    monkeypatch.setattr(motion_pkg, 'position_for_trip', AsyncMock(return_value=motion_between(next_idx=1, distance_m=400.0)))
    monkeypatch.setattr(routes, 'is_schedule_only_leg', lambda pid, a: True)
    out = await routes._estimate_trip_position(route, trip, 23 * 3600 + 33 * 60, {}, version_id='v',
                                               network={'version_id': 'v', 'service_date': '2026-11-02'})
    assert out is None
    timeline = routes._predicted_stop_timeline(route, trip, None)
    assert len(timeline) == 2  # ETAs remain via arrivals


@pytest.mark.asyncio
async def test_at_stop_allows_standing_even_on_review_leg(monkeypatch):
    from mobility import motion as motion_pkg
    route, trip = route_trip()
    monkeypatch.setattr(routes, '_trip_path_geometry', AsyncMock(return_value=path_for('SYNTH:1')))
    monkeypatch.setattr(routes, 'MOTION_ENGINE_ENABLED', True)
    monkeypatch.setattr(motion_pkg, 'position_for_trip', AsyncMock(return_value=motion_between(next_idx=1, distance_m=0.0)))
    monkeypatch.setattr(routes, 'is_schedule_only_leg', lambda pid, a: True)
    out = await routes._estimate_trip_position(route, trip, 23 * 3600 + 33 * 60, {}, version_id='v',
                                               network={'version_id': 'v', 'service_date': '2026-11-02'})
    assert out is not None
