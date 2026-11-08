"""Read-only GTFS shape inventory for an explicitly selected service date.

This tool reports evidence, not permission to use a feed, GPS, geometric
accuracy, or authorization to activate routes. Stop-only shapes are a review
signal: stop-to-stop lines do not establish the tracks between stops.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import math
import re
import zipfile
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path


def _read_table(archive, name, required=True, columns=()):
    matches = [item for item in archive.infolist() if item.filename.lower() == name]
    if not matches:
        if required:
            raise ValueError(f'missing {name}')
        return []
    if len(matches) != 1:
        raise ValueError(f'duplicate {name}')
    item = matches[0]
    if item.file_size > 256 * 1024 * 1024:
        raise ValueError(f'{name} exceeds inspection size limit')
    with archive.open(item) as raw:
        text = io.TextIOWrapper(raw, encoding='utf-8-sig', newline='')
        reader = csv.DictReader(text)
        if (not reader.fieldnames or len(set(reader.fieldnames)) != len(reader.fieldnames)
                or not set(columns).issubset(reader.fieldnames)):
            raise ValueError(f'invalid header in {name}')
        return list(reader)


def _gtfs_date(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{8}', value):
        raise ValueError('invalid GTFS date')
    return date(int(value[:4]), int(value[4:6]), int(value[6:]))


def _unique(rows, key, label):
    result = {}
    for row in rows:
        value = row.get(key)
        if not value or value in result:
            raise ValueError(f'missing or duplicate {label}')
        result[value] = row
    return result


def _coord(lat, lon):
    try:
        a, b = float(lat), float(lon)
    except (TypeError, ValueError):
        raise ValueError('invalid coordinates') from None
    if not math.isfinite(a) or not math.isfinite(b) or not -90 <= a <= 90 or not -180 <= b <= 180:
        raise ValueError('invalid coordinates')
    return a, b


def inspect_archive(archive, day):
    """Inventory shapes linked to active trips, with no route adoption decisions."""
    if not isinstance(day, date):
        raise ValueError('service date required')
    routes = _unique(_read_table(archive, 'routes.txt', columns=('route_id',)), 'route_id', 'route_id')
    trips = _unique(_read_table(archive, 'trips.txt', columns=('trip_id', 'service_id', 'route_id')), 'trip_id', 'trip_id')
    stops = _read_table(archive, 'stops.txt', columns=('stop_lat', 'stop_lon'))
    weekdays = ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
    calendar = _read_table(archive, 'calendar.txt', required=False,
                           columns=('service_id', 'start_date', 'end_date', *weekdays))
    exceptions = _read_table(archive, 'calendar_dates.txt', required=False,
                             columns=('service_id', 'date', 'exception_type'))
    if not calendar and not exceptions:
        raise ValueError('calendar or calendar_dates required')
    services = _unique(calendar, 'service_id', 'calendar service_id')
    active = set()
    for sid, row in services.items():
        start, end = _gtfs_date(row.get('start_date')), _gtfs_date(row.get('end_date'))
        if start > end or any(row.get(w) not in ('0', '1') for w in weekdays):
            raise ValueError('invalid calendar service')
        if start <= day <= end and row[weekdays[day.weekday()]] == '1':
            active.add(sid)
    seen_exceptions = set()
    for row in exceptions:
        sid = row.get('service_id')
        exday = _gtfs_date(row.get('date'))
        typ = row.get('exception_type')
        if not sid or typ not in ('1', '2') or (sid, exday) in seen_exceptions:
            raise ValueError('invalid or duplicate calendar exception')
        seen_exceptions.add((sid, exday))
        if exday == day:
            if typ == '1':
                active.add(sid)
            else:
                active.discard(sid)

    stop_points = set()
    for row in stops:
        if row.get('stop_lat') or row.get('stop_lon'):
            stop_points.add(_coord(row.get('stop_lat'), row.get('stop_lon')))
    if not stop_points:
        raise ValueError('no stop coordinates')
    shape_rows = _read_table(archive, 'shapes.txt', required=False,
                             columns=('shape_id', 'shape_pt_sequence', 'shape_pt_lat', 'shape_pt_lon'))
    shapes = defaultdict(list)
    sequences = set()
    for row in shape_rows:
        sid, seq = row.get('shape_id'), row.get('shape_pt_sequence')
        if not sid or not seq or not seq.isascii() or not seq.isdigit():
            raise ValueError('invalid shape identity or sequence')
        key = (sid, int(seq))
        if key in sequences:
            raise ValueError('duplicate shape sequence')
        sequences.add(key)
        shapes[sid].append((int(seq), _coord(row.get('shape_pt_lat'), row.get('shape_pt_lon'))))

    used = defaultdict(list)
    missing_shape_id = 0
    active_count = 0
    known_services = set(services) | {sid for sid, _ in seen_exceptions}
    for trip in trips.values():
        if trip.get('service_id') not in known_services or trip.get('route_id') not in routes:
            raise ValueError('invalid trip service or route identity')
        if trip['service_id'] not in active:
            continue
        active_count += 1
        sid = trip.get('shape_id') or ''
        if not sid:
            missing_shape_id += 1
        else:
            used[sid].append(trip)

    result_shapes = []
    for sid, linked in sorted(used.items()):
        pts = [point for _, point in sorted(shapes.get(sid, []))]
        counts = Counter(t['route_id'] for t in linked)
        matches = sum(p in stop_points for p in pts)
        result_shapes.append({
            'shape_id': sid, 'active_trip_count': len(linked),
            'routes': [{'route_id': rid, 'route_short_name': routes[rid].get('route_short_name') or '',
                        'route_type': routes[rid].get('route_type') or '', 'active_trip_count': n}
                       for rid, n in sorted(counts.items())],
            'shape_present': bool(pts), 'point_count': len(pts),
            'points_exactly_matching_any_feed_stop': matches,
            'all_points_match_feed_stops': bool(pts) and matches == len(pts),
            'adjacent_duplicate_points': sum(a == b for a, b in zip(pts, pts[1:])),
            'diagnostic_flags': (['SHAPE_NOT_FOUND'] if not pts else
                                 (['INSUFFICIENT_POINTS'] if len(pts) < 2 else []) +
                                 (['ALL_VERTICES_ARE_STOP_COORDINATES'] if matches == len(pts) else [])),
        })
    return {'service_date': day.isoformat(), 'active_trips': active_count,
            'active_trips_without_shape_id': missing_shape_id,
            'active_trips_with_missing_shape': sum(len(v) for sid, v in used.items() if not shapes.get(sid)),
            'active_shape_count': len(used), 'shapes': result_shapes,
            'limits': ['Exact coordinate matches are a triage signal, not proof of route quality.',
                       'Presence of intermediate points is not proof of geometry accuracy or rights.',
                       'Service selection uses calendar files only; feed_info validity is not checked.',
                       'No trip-to-PERIX identity matching, GPS validation or route activation was performed.']}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gtfs', type=Path, required=True)
    parser.add_argument('--service-date', required=True, help='Service date YYYY-MM-DD')
    parser.add_argument('--output', type=Path, help='New report file, never overwritten')
    args = parser.parse_args(argv)
    day = date.fromisoformat(args.service_date)
    digest = hashlib.sha256()
    with args.gtfs.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
        source.seek(0)
        with zipfile.ZipFile(source) as archive:
            result = inspect_archive(archive, day)
    result['input_sha256'] = digest.hexdigest()
    output = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        with args.output.open('x', encoding='utf-8', newline='\n') as target:
            target.write(output)
    else:
        print(output, end='')


if __name__ == '__main__':
    main()
