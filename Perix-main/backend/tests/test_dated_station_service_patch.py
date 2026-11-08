"""Synthetic dated-service regression cases; no provider/network/database reads.

Prepared only. Do not invoke broad test discovery or the shared test_db fixture.
"""
from copy import deepcopy
from datetime import datetime
from unittest.mock import AsyncMock
from zoneinfo import ZoneInfo

import pytest


@pytest.fixture(autouse=True)
def no_external_connections(monkeypatch):
    import socket
    original_connect, original_connect_ex = socket.socket.connect, socket.socket.connect_ex

    def guarded(original):
        def connect(sock, address, *args, **kwargs):
            # Windows asyncio may create its own loopback socketpair. Permit
            # that machinery, never a provider or the deliberately disabled DB.
            if not isinstance(address, tuple) or address[0] not in ('127.0.0.1', '::1') or address[1] == 1:
                raise AssertionError('Synthetic station suite forbids external/database connections')
            return original(sock, address, *args, **kwargs)
        return connect

    monkeypatch.setattr(socket.socket, 'connect', guarded(original_connect))
    monkeypatch.setattr(socket.socket, 'connect_ex', guarded(original_connect_ex))


def network(day, numbers):
    routes = []
    # Keep yesterday's route catalogue, but supply only today's dated trips.
    for number in ('1', '2', '5', '10'):
        mode = 'tram' if number in ('1', '10') else 'bus'
        platform = 'rail' if mode == 'tram' else 'road'
        routes.append(dict(route_number=number, mode=mode, stops=[dict(
            stop_id=platform, parent_station='central', name='Central', lat=52.1, lng=11.6)],
            trips=[dict(trip_id=f'{day}-{number}', headsign=f'Terminal {number}', stop_ids=[platform])]
            if number in numbers else []))
    return dict(version_id='same-version', service_date=day, routes=routes)


@pytest.mark.parametrize('legacy', [False, True])
def test_yesterday_1_10_2_becomes_today_2_10_5_without_renaming_station(legacy):
    from mobility.domain import _physical_stops
    project = _physical_stops
    if legacy:
        from routes.mobility import _physical_stop_groups
        project = _physical_stop_groups
    yesterday = network('2026-11-02', {'1', '10', '2'})
    today = network('2026-11-03', {'2', '10', '5'})
    before = deepcopy((yesterday, today))
    old, new = project(yesterday), project(today)
    assert len(old) == len(new) == 1
    assert old[0]['stop_id'] == new[0]['stop_id'] == 'physical:central'
    assert old[0]['name'] == new[0]['name'] == 'Central'
    assert {r['route_number'] for r in old[0]['routes']} == {'1', '10', '2'}
    assert {r['route_number'] for r in new[0]['routes']} == {'2', '10', '5'}
    assert new[0]['modes'] == ['bus', 'tram']
    platforms = {p['platform_id']: p for p in new[0]['platforms']}
    assert set(platforms) == {'rail', 'road'}
    assert platforms['rail']['routes'] == ['10']
    assert set(platforms['road']['routes']) == {'2', '5'}
    assert platforms['rail']['directions'] == ['Terminal 10']
    assert set(platforms['road']['directions']) == {'Terminal 2', 'Terminal 5'}
    assert (yesterday, today) == before


@pytest.mark.parametrize('legacy', [False, True])
def test_same_name_far_away_is_not_a_duplicate_platform_of_this_station(legacy):
    from mobility.domain import _physical_stops
    project = _physical_stops
    if legacy:
        from routes.mobility import _physical_stop_groups
        project = _physical_stop_groups
    source = network('2026-11-03', {'2'})
    source['routes'] = [source['routes'][1]]
    first = source['routes'][0]['stops'][0]
    first.pop('parent_station')
    source['routes'][0]['stops'].append({**first, 'stop_id': 'distant', 'lat': 52.2})
    source['routes'][0]['trips'][0]['stop_ids'].append('distant')
    result = project(source)
    assert len(result) == 2
    assert len({s['stop_id'] for s in result}) == 2
    assert result[0]['stop_id'] == 'physical:central'
    assert {frozenset(s['stop_ids']) for s in result} == {frozenset({'road'}), frozenset({'distant'})}


@pytest.mark.parametrize('legacy', [False, True])
@pytest.mark.parametrize('second_name', ['  CENTRAL  ', 'Central\u00a0', 'Central'])
def test_nearby_name_variants_group_without_rewriting_provider_display_names(legacy, second_name):
    from mobility.domain import _physical_stops
    project = _physical_stops
    if legacy:
        from routes.mobility import _physical_stop_groups
        project = _physical_stop_groups
    source = network('2026-11-03', {'2', '10'})
    for route in source['routes']:
        for stop in route['stops']:
            stop.pop('parent_station')
            if stop['stop_id'] == 'rail':
                stop.update(name=second_name, lat=52.1001)
    before = deepcopy(source)
    result = project(source)
    assert len(result) == 1
    assert set(result[0]['stop_ids']) == {'rail', 'road'}
    assert source == before
    assert len(result[0]['platforms']) == 2


def test_unicode_composition_matches_but_punctuation_and_other_names_are_not_fuzzy_aliases():
    from mobility.domain import _stop_name_key, _physical_stops
    assert _stop_name_key('  Bo\u0308rde\u00a0 Platz ') == _stop_name_key('BÖRDE Platz')
    assert _stop_name_key('Central-West') != _stop_name_key('Central West')
    source = network('2026-11-03', {'2', '10'})
    for route in source['routes']:
        for stop in route['stops']:
            stop.pop('parent_station')
            if stop['stop_id'] == 'rail':
                stop['name'] = 'Different station'
    assert len(_physical_stops(source)) == 2


@pytest.mark.parametrize('legacy', [False, True])
def test_parent_station_keeps_platform_label_variants_without_duplicate_station_pins(legacy):
    from mobility.domain import _physical_stops
    project = _physical_stops
    if legacy:
        from routes.mobility import _physical_stop_groups
        project = _physical_stop_groups
    source = network('2026-11-03', {'2', '10'})
    for route in source['routes']:
        for stop in route['stops']:
            if stop['stop_id'] == 'rail':
                stop.update(name='Central SEV', lat=52.102)
    result = project(source)
    assert len(result) == 1
    assert result[0]['stop_id'] == 'physical:central'
    assert {p['name'] for p in result[0]['platforms']} == {'Central', 'Central SEV'}
    assert {r['route_number'] for r in result[0]['routes']} == {'2', '10'}


@pytest.mark.parametrize('legacy', [False, True])
def test_repeated_provider_platform_id_cannot_become_two_station_pins(legacy):
    from mobility.domain import _physical_stops
    project = _physical_stops
    if legacy:
        from routes.mobility import _physical_stop_groups
        project = _physical_stop_groups
    source = network('2026-11-03', {'2', '5'})
    source['routes'][2]['stops'][0]['name'] = 'Alternate provider spelling'
    result = project(source)
    platforms = [p['platform_id'] for s in result for p in s['platforms']]
    assert platforms.count('road') == 1
    assert set(result[0]['stop_ids']) == {'rail', 'road'}


def test_second_level_place_merge_unions_same_line_directions_and_keeps_bus_tram_distinct():
    from mobility.domain import _physical_stops
    source = network('2026-11-03', {'2', '10'})
    road = deepcopy(source['routes'][1])
    rail = deepcopy(source['routes'][3])
    rail.update(route_number='2')
    rail['stops'][0]['parent_station'] = 'other-parent'
    rail['trips'][0]['headsign'] = 'Rail terminal'
    opposite = deepcopy(road)
    opposite['stops'][0].update(stop_id='opposite-road', parent_station='third-parent')
    opposite['trips'][0].update(stop_ids=['opposite-road'], headsign='Opposite road terminal')
    result = _physical_stops({**source, 'routes': [road, rail, opposite]})
    assert len(result) == 1
    serving = {(r['mode'], r['route_number']): r['directions'] for r in result[0]['routes']}
    assert serving[('bus', '2')] == ['Opposite road terminal', 'Terminal 2']
    assert serving[('tram', '2')] == ['Rail terminal']


def test_unserved_station_keeps_physical_modes_and_coordinates_not_old_routes():
    from mobility.domain import _physical_stops
    result = _physical_stops(network('2026-11-03', set()))
    assert len(result) == 1
    assert result[0]['routes'] == []
    assert result[0]['modes'] == ['bus', 'tram']
    assert result[0]['latitude'] == 52.1
    assert all(not p['routes'] and not p['directions'] for p in result[0]['platforms'])


def test_dated_stop_merge_unions_service_without_mutating_the_domain():
    from mobility.domain import _physical_stops
    from mobility.v2 import _merge_service_stop
    current = _physical_stops(network('2026-11-03', {'2', '10', '5'}))[0]
    overnight = _physical_stops(network('2026-11-02', {'1'}))[0]
    before = deepcopy((current, overnight))
    merged = {}
    _merge_service_stop(merged, current)
    _merge_service_stop(merged, overnight)
    _merge_service_stop(merged, overnight)
    assert len(merged) == 1
    assert {r['route_number'] for r in merged['physical:central']['routes']} == {'1', '2', '5', '10'}
    assert len(merged['physical:central']['routes']) == 4
    assert (current, overnight) == before


@pytest.mark.asyncio
async def test_stop_cache_tracks_dated_trip_membership_even_in_same_version(monkeypatch):
    from routes import mobility as routes
    monkeypatch.setattr(routes, '_STOPS_CACHE', {'version_id': None, 'data': []})
    old = await routes._physical_stops_for(network('2026-11-03', {'1', '2', '10'}))
    new = await routes._physical_stops_for(network('2026-11-03', {'2', '5', '10'}))
    assert {r['route_number'] for r in old[0]['routes']} == {'1', '2', '10'}
    assert {r['route_number'] for r in new[0]['routes']} == {'2', '5', '10'}


@pytest.mark.asyncio
async def test_same_version_provider_name_correction_refreshes_labels_not_direction_fingerprint(monkeypatch):
    from routes import mobility as routes
    from mobility.domain import build_domain, _direction_inputs_fingerprint
    monkeypatch.setattr(routes, '_STOPS_CACHE', {'version_id': None, 'data': []})
    before = network('2026-11-03', {'2', '5', '10'})
    after = deepcopy(before)
    for route in after['routes']:
        for stop in route['stops']:
            stop['name'] = 'Corrected provider name'
    assert _direction_inputs_fingerprint(before) == _direction_inputs_fingerprint(after)
    assert (await routes._physical_stops_for(before))[0]['name'] == 'Central'
    assert (await routes._physical_stops_for(after))[0]['name'] == 'Corrected provider name'
    assert build_domain(before)['stops'][0]['name'] == 'Central'
    assert build_domain(after)['stops'][0]['name'] == 'Corrected provider name'


@pytest.mark.asyncio
async def test_map_and_stops_share_current_service_and_only_active_overnight_trips(monkeypatch):
    from routes import mobility as routes
    from mobility import v2
    from mobility.domain import _physical_stops
    today = network('2026-11-03', {'2', '10', '5'})
    yesterday = network('2026-11-02', {'1', '2'})
    frozen = datetime(2026, 11, 3, 12, 0, tzinfo=ZoneInfo('Europe/Berlin'))
    monkeypatch.setattr(routes, '_berlin_now', lambda: frozen)
    monkeypatch.setattr(routes, 'networks_for_journey_window', AsyncMock(return_value=[today, yesterday]))
    monkeypatch.setattr(routes, '_now_service_seconds', lambda *args: 100)
    monkeypatch.setattr(routes, '_realtime_delays_for', AsyncMock(return_value={}))
    monkeypatch.setattr(routes, '_predicted_stop_timeline', lambda route, trip, rt: [
        dict(predicted_arrival=90 if route['route_number'] == '1' else 0,
             predicted_departure=110 if route['route_number'] == '1' else 10)])

    async def domain(*, network):
        from mobility.domain import _pattern_id, _pattern_key
        return dict(network=dict(version_id=network['version_id']),
            stops=_physical_stops(network), patterns=[dict(pattern_id=_pattern_id(
                str(r['route_number']), _pattern_key(t))) for r in network['routes'] for t in r['trips']])

    monkeypatch.setattr(v2, '_domain', domain)
    monkeypatch.setattr(v2, '_map_dated', AsyncMock(side_effect=lambda d: dict(
        lines=[], stops=deepcopy(d['stops']), diversion_warnings=[])))
    stop_result = await v2.v2_stops(None)
    map_result = await v2.v2_map(None)
    assert stop_result == map_result['stops']
    assert {r['route_number'] for r in stop_result[0]['routes']} == {'1', '2', '5', '10'}
    overnight = (await v2._dated_service_domains())[1][1]
    assert {r['route_number'] for r in overnight['stops'][0]['routes']} == {'1'}
