"""Synthetic physical-inventory/service separation; never uses test_db."""
from copy import deepcopy
from datetime import datetime
import io
from unittest.mock import AsyncMock
from zoneinfo import ZoneInfo
import zipfile

import pytest


def source(day='2026-11-04'):
    return dict(version_id='v-'+day, service_date=day, region_id='magdeburg', network_id='de-magdeburg-mvb',
        routes=[dict(route_number='2', mode='tram', stops=[
            dict(stop_id='A', name='A', lat=52.1, lng=11.6),
            dict(stop_id='B', name='B', lat=52.11, lng=11.61)], trips=[dict(
            trip_id='t', headsign='B', stop_ids=['A', 'B'], start='01:00', end='01:10')])],
        stop_catalogue=[dict(stop_id='C', name='Dormant platform', parent_station='C-parent',
                            lat=52.12, lng=11.62, modes=['bus'])])


@pytest.mark.parametrize('legacy', [False, True])
def test_non_serving_catalogue_platform_is_present_without_a_fabricated_route(legacy):
    from mobility.domain import _physical_stops
    project = _physical_stops
    if legacy:
        from routes.mobility import _physical_stop_groups
        project = _physical_stop_groups
    network = source()
    before = deepcopy(network)
    stops = project(network)
    dormant = next(s for s in stops if 'C' in s['stop_ids'])
    assert dormant['routes'] == []
    assert dormant['modes'] == ['bus']
    assert dormant['platforms'][0]['modes'] == ['bus']
    assert network == before


def test_catalogue_changes_cache_identity_not_direction_or_trip_templates():
    from mobility.domain import build_domain, _direction_inputs_fingerprint
    first = source()
    changed = deepcopy(first)
    changed['stop_catalogue'][0]['name'] = 'Corrected dormant name'
    assert _direction_inputs_fingerprint(first) == _direction_inputs_fingerprint(changed)
    a, b = build_domain(first), build_domain(changed)
    assert a['patterns'] == b['patterns'] and a['trip_templates'] == b['trip_templates']
    assert next(s for s in b['stops'] if 'C' in s['stop_ids'])['name'] == 'Corrected dormant name'


def test_complete_catalogue_applies_real_removals_not_day_filtering_and_legacy_retains_known_stops():
    from mobility.domain import build_domain
    from mobility.v2 import _stable_stops_with_service
    current, previous = source(), source('2026-11-03')
    previous['stop_catalogue'].append(dict(stop_id='D', name='Removed physical platform',
        parent_station='D-parent', lat=52.13, lng=11.63, modes=['bus']))
    domains = [(current, build_domain(current)), (previous, build_domain(previous))]
    complete = _stable_stops_with_service(domains, [domains[0]])
    assert not any('D' in s['stop_ids'] for s in complete)
    assert any('C' in s['stop_ids'] and not s['routes'] for s in complete)
    legacy = deepcopy(current)
    legacy.pop('stop_catalogue')
    domains[0] = (legacy, build_domain(legacy))
    retained = _stable_stops_with_service(domains, [domains[0]])
    assert any('D' in s['stop_ids'] and not s['routes'] for s in retained)


def test_gtfs_catalogue_covers_other_weekdays_but_timetable_is_still_date_correct():
    from utils.gtfs import parse_gtfs_zip
    files = {
        'agency.txt': 'agency_id,agency_name\np,Magdeburger\nforeign,Other agency\n',
        'calendar.txt': 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nwed,0,0,1,0,0,0,0,20261101,20261130\nthu,0,0,0,1,0,0,0,20261101,20261130\n',
        'routes.txt': 'route_id,agency_id,route_short_name,route_type\ntram,p,2,0\nbus,p,5,3\nx,foreign,X,3\n',
        'trips.txt': 'route_id,service_id,trip_id\ntram,wed,today\nbus,thu,tomorrow\nx,wed,foreign\n',
        'stops.txt': 'stop_id,stop_name,stop_lat,stop_lon\nA,A,52.1,11.6\nB,B,52.11,11.61\nC,C,52.12,11.62\nX,X,52.13,11.63\n',
        'stop_times.txt': 'trip_id,stop_sequence,stop_id,arrival_time,departure_time\ntoday,1,A,01:00:00,01:00:00\ntoday,2,B,01:10:00,01:10:00\ntomorrow,1,A,01:00:00,01:00:00\ntomorrow,2,C,01:10:00,01:10:00\nforeign,1,A,01:00:00,01:00:00\nforeign,2,X,01:10:00,01:10:00\n',
    }
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as archive:
        for name, text in files.items():
            archive.writestr(name, text)
    today = parse_gtfs_zip(buffer.getvalue(), '2026-11-04', agency_regex='Magdeburger')
    tomorrow = parse_gtfs_zip(buffer.getvalue(), '2026-11-05', agency_regex='Magdeburger')
    assert {t['trip_id'] for r in today['routes'] for t in r['trips']} == {'today'}
    assert {t['trip_id'] for r in tomorrow['routes'] for t in r['trips']} == {'tomorrow'}
    assert today['stop_catalogue'] == tomorrow['stop_catalogue']
    assert {s['stop_id'] for s in today['stop_catalogue']} == {'A', 'B', 'C'}
    assert next(s for s in today['stop_catalogue'] if s['stop_id'] == 'A')['modes'] == ['bus', 'tram']


@pytest.mark.asyncio
async def test_inactive_previous_patterns_remain_background_geometry_not_current_service(monkeypatch):
    from mobility import v2
    from mobility.domain import build_domain
    from routes import mobility as routes
    current, previous = source(), source('2026-11-03')
    monkeypatch.setattr(routes, 'networks_for_journey_window', AsyncMock(return_value=[current, previous]))
    monkeypatch.setattr(routes, '_berlin_now', lambda: datetime(2026, 11, 4, 12, tzinfo=ZoneInfo('Europe/Berlin')))
    monkeypatch.setattr(routes, '_now_service_seconds', lambda *a: 99999)
    monkeypatch.setattr(routes, '_realtime_delays_for', AsyncMock(return_value={}))
    monkeypatch.setattr(routes, '_predicted_stop_timeline', lambda *a: [dict(predicted_arrival=0, predicted_departure=10)])
    monkeypatch.setattr(v2, '_domain', AsyncMock(side_effect=lambda network: build_domain(network)))
    async def draw(domain):
        return dict(lines=[dict(pattern_id=p['pattern_id']) for p in domain['patterns']], diversion_warnings=[])
    monkeypatch.setattr(v2, '_map_dated', draw)
    result = await v2.v2_map(None)
    assert len(result['lines']) == 2
    assert next(l for l in result['lines'] if l['service_date'] == '2026-11-03')['service_active'] is False
    assert next(l for l in result['lines'] if l['service_date'] == '2026-11-04')['service_active'] is True
    assert any('C' in s['stop_ids'] and not s['routes'] for s in result['stops'])
    assert result['stops'] == await v2.v2_stops(None)


@pytest.mark.asyncio
async def test_retained_active_document_survives_an_empty_journey_window_without_claiming_old_service(monkeypatch):
    from mobility import v2
    from mobility.domain import build_domain
    from routes import mobility as routes
    stale = source('2026-10-01')
    monkeypatch.setattr(routes, 'networks_for_journey_window', AsyncMock(return_value=[]))
    monkeypatch.setattr(routes, '_get_active_network', AsyncMock(return_value=stale))
    monkeypatch.setattr(routes, '_berlin_now', lambda: datetime(2026, 11, 4, 12, tzinfo=ZoneInfo('Europe/Berlin')))
    monkeypatch.setattr(v2, '_domain', AsyncMock(side_effect=lambda network: build_domain(network)))
    domains = await v2._physical_map_domains()
    assert len(domains) == 1
    assert await v2._dated_service_domains(domains) == []
    stops = await v2.v2_stops(None)
    assert stops and all(not s['routes'] and not s['service_active'] for s in stops)
