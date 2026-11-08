"""Read-only GTFS inventory: diagnostics never certify a shape."""
import io
import subprocess
import sys
import zipfile
from datetime import date
from pathlib import Path

import pytest

from tools.inspect_gtfs_shapes import inspect_archive


@pytest.fixture
def tables():
    return {
        'routes.txt': 'route_id,route_short_name,route_type\nr,1,0\n',
        'trips.txt': 'route_id,service_id,trip_id,shape_id\nr,s,t1,a\nr,s,t2,b\nr,s,t3,\nr,s,t4,missing\nr,other,t5,a\n',
        'stops.txt': 'stop_id,stop_lat,stop_lon\nx,52,11\ny,52.001,11\n',
        'calendar.txt': 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\ns,1,1,1,1,1,1,1,20261101,20261130\nother,0,0,0,0,0,0,0,20261101,20261130\n',
        'calendar_dates.txt': 'service_id,date,exception_type\nother,20261103,1\ns,20261103,2\n',
        'shapes.txt': 'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\na,52,11,0\na,52.001,11,1\nb,52,11,0\nb,52.0005,11.0001,1\nb,52.001,11,2\n',
    }


def archive(tables):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as z:
        for name, content in tables.items():
            z.writestr(name, content)
    buffer.seek(0)
    return zipfile.ZipFile(buffer)


def test_shape_quality_is_diagnostic_and_missing_shapes_are_explicit(tables):
    with archive(tables) as z:
        result = inspect_archive(z, date(2026, 11, 2))
    assert result['active_trips'] == 4
    assert result['active_trips_without_shape_id'] == 1
    assert result['active_trips_with_missing_shape'] == 1
    shapes = {x['shape_id']: x for x in result['shapes']}
    assert shapes['a']['all_points_match_feed_stops']
    assert shapes['a']['diagnostic_flags'] == ['ALL_VERTICES_ARE_STOP_COORDINATES']
    assert shapes['b']['point_count'] == 3
    assert not shapes['b']['all_points_match_feed_stops']
    assert shapes['missing']['diagnostic_flags'] == ['SHAPE_NOT_FOUND']
    assert 'not proof' in result['limits'][1]


def test_calendar_exceptions_control_exact_service_date(tables):
    with archive(tables) as z:
        result = inspect_archive(z, date(2026, 11, 3))
    assert result['active_trips'] == 1
    assert [s['shape_id'] for s in result['shapes']] == ['a']


@pytest.mark.parametrize('bad', ['unknown_service', 'coordinate', 'sequence', 'duplicate_trip', 'header', 'exception'])
def test_untrusted_or_ambiguous_input_fails_closed(tables, bad):
    if bad == 'unknown_service': tables['trips.txt'] += 'r,unknown,t6,a\n'
    if bad == 'coordinate': tables['shapes.txt'] += 'c,nan,11,1\n'
    if bad == 'sequence': tables['shapes.txt'] += 'a,52,11,0\n'
    if bad == 'duplicate_trip': tables['trips.txt'] += 'r,s,t1,a\n'
    if bad == 'header': tables['shapes.txt'] = 'shape_id,shape_pt_lat\n'
    if bad == 'exception': tables['calendar_dates.txt'] += 'other,20261103,2\n'
    with archive(tables) as z, pytest.raises(ValueError):
        inspect_archive(z, date(2026, 11, 2))


def test_missing_shapes_file_remains_unavailable_not_certified(tables):
    del tables['shapes.txt']
    with archive(tables) as z:
        result = inspect_archive(z, date(2026, 11, 2))
    assert result['active_trips_with_missing_shape'] == 3
    assert all(x['diagnostic_flags'] == ['SHAPE_NOT_FOUND'] for x in result['shapes'])


def test_cli_refuses_existing_output(tables, tmp_path):
    source = tmp_path / 'feed.zip'
    with zipfile.ZipFile(source, 'w') as z:
        for name, content in tables.items():
            z.writestr(name, content)
    output = tmp_path / 'report.json'
    output.write_text('keep', encoding='utf-8')
    tool = Path(__file__).resolve().parents[1] / 'tools' / 'inspect_gtfs_shapes.py'
    proc = subprocess.run([sys.executable, '-B', str(tool), '--gtfs', str(source),
                           '--service-date', '2026-11-02', '--output', str(output)],
                          capture_output=True, text=True, timeout=30)
    assert proc.returncode != 0
    assert output.read_text(encoding='utf-8') == 'keep'
