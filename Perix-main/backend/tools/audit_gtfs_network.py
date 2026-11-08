"""Read-only dated GTFS static trip/stop/timetable comparison.

Streams large stop_times.txt; no extraction, network, DB or data activation.
Matching shows timetable consistency only, not route geometry or GPS accuracy.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import math
import sys
import zipfile
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mobility.realtime_trip_identity import _service_date, _time_seconds
from mobility.roads import _haversine_m
from mobility.stop_occurrences import stop_occurrence_times


def rows(archive, name, columns, required=True):
    matches = [item for item in archive.infolist() if item.filename.lower() == name]
    if not matches and not required:
        return
    if len(matches) != 1:
        raise ValueError(f'missing or duplicate {name}')
    with archive.open(matches[0]) as raw:
        text = io.TextIOWrapper(raw, encoding='utf-8-sig', newline='')
        reader = csv.DictReader(text)
        if not reader.fieldnames or len(reader.fieldnames) != len(set(reader.fieldnames)) or not set(columns).issubset(reader.fieldnames):
            raise ValueError(f'invalid {name} header')
        yield from reader


def _day(text):
    if len(str(text or '')) != 8 or not str(text).isascii() or not str(text).isdigit():
        raise ValueError('invalid GTFS service date')
    text = str(text)
    return date(int(text[:4]), int(text[4:6]), int(text[6:]))


def active_services(archive, day):
    weekdays = ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
    active, known, seen_exception = set(), set(), set()
    for row in rows(archive, 'calendar.txt', ('service_id', 'start_date', 'end_date', *weekdays), required=False):
        sid = row['service_id']
        start, end = _day(row['start_date']), _day(row['end_date'])
        if not sid or sid in known or start > end or any(row.get(w) not in ('0', '1') for w in weekdays):
            raise ValueError('invalid calendar service')
        known.add(sid)
        if start <= day <= end and row[weekdays[day.weekday()]] == '1': active.add(sid)
    for row in rows(archive, 'calendar_dates.txt', ('service_id', 'date', 'exception_type'), required=False):
        sid, dt, kind = row['service_id'], _day(row['date']), row['exception_type']
        if not sid or kind not in ('1', '2') or (sid, dt) in seen_exception:
            raise ValueError('invalid calendar exception')
        known.add(sid); seen_exception.add((sid, dt))
        if dt == day:
            if kind == '1': active.add(sid)
            else: active.discard(sid)
    if not known:
        raise ValueError('calendar data unavailable')
    return active, known


def audit_stop_metadata(network, archive):
    """Compare unique network stops with feed coordinates, never a GPS survey."""
    version, day = str(network.get('version_id') or ''), _service_date(network)
    if not version or not day:
        raise ValueError('explicit dated network identity required')
    expected = {}
    for route in network.get('routes') or []:
        for stop in route.get('stops') or []:
            sid = str(stop.get('stop_id') or '')
            item = (stop.get('lat'), stop.get('lng'), stop.get('name'))
            if not sid or (sid in expected and expected[sid] != item):
                raise ValueError('missing or ambiguous network stop')
            expected[sid] = item
    if not expected:
        raise ValueError('network stops unavailable')
    matches = {}
    for row in rows(archive, 'stops.txt', ('stop_id', 'stop_name', 'stop_lat', 'stop_lon')):
        sid = row['stop_id']
        if sid not in expected: continue
        if sid in matches: raise ValueError('duplicate matched GTFS stop')
        matches[sid] = row
    counts, issues, maximum = Counter(), [], 0.0
    for sid, (lat, lon, name) in expected.items():
        counts['expected_stops'] += 1
        source = matches.get(sid)
        if not source:
            counts['missing_stop_ids'] += 1; issues.append({'stop_id': sid, 'reason': 'STOP_NOT_IN_GTFS'}); continue
        counts['matched_stop_ids'] += 1
        try:
            coords = [float(lat), float(lon), float(source['stop_lat']), float(source['stop_lon'])]
            if not all(math.isfinite(x) for x in coords) or not all(-90 <= coords[i] <= 90 for i in (0, 2)) or not all(-180 <= coords[i] <= 180 for i in (1, 3)):
                raise ValueError()
            distance = _haversine_m(*coords)
        except (ValueError, TypeError):
            counts['invalid_coordinates'] += 1; issues.append({'stop_id': sid, 'reason': 'INVALID_COORDINATES'}); continue
        maximum = max(maximum, distance)
        if distance <= 1:
            counts['coordinates_within_1m'] += 1
        else:
            counts['coordinates_over_1m'] += 1
            issues.append({'stop_id': sid, 'reason': 'COORDINATE_DISAGREEMENT', 'distance_m': round(distance, 2)})
        if str(name or '') == source['stop_name']: counts['names_exact'] += 1
        else: counts['names_different'] += 1
    return {'scope': {'network_version_id': version, 'service_date': day}, 'counts': dict(counts),
            'maximum_distance_m': round(maximum, 3), 'issues': issues,
            'limits': ['Matching feed coordinates are not independent GPS, a survey, or proof of platform direction.',
                       'Archive parity does not prove which feed production imported.']}


def audit_archive(network, archive):
    version, day_text = str(network.get('version_id') or ''), _service_date(network)
    if not version or not day_text:
        raise ValueError('explicit dated network identity required')
    day = date.fromisoformat(day_text)
    expected = {}
    for route in network.get('routes') or []:
        for trip in route.get('trips') or []:
            tid = str(trip.get('trip_id') or '')
            if not tid or tid in expected:
                raise ValueError('missing or duplicate network trip ID')
            visits = stop_occurrence_times(trip)
            if visits is None:
                raise ValueError('network stop occurrence times unavailable')
            expected[tid] = (route, trip, visits)
    if not expected:
        raise ValueError('no network trips')
    active, known = active_services(archive, day)
    route_rows = {}
    for row in rows(archive, 'routes.txt', ('route_id', 'route_short_name', 'agency_id', 'route_type')):
        rid = row['route_id']
        if not rid or rid in route_rows: raise ValueError('invalid GTFS route ID')
        route_rows[rid] = row
    source_trips = {}
    for row in rows(archive, 'trips.txt', ('trip_id', 'route_id', 'service_id')):
        tid = row['trip_id']
        if tid not in expected: continue
        if tid in source_trips: raise ValueError('duplicate matched GTFS trip')
        source_trips[tid] = row
    source_visits = defaultdict(list)
    for row in rows(archive, 'stop_times.txt', ('trip_id', 'stop_id', 'stop_sequence', 'arrival_time', 'departure_time')):
        tid = row['trip_id']
        if tid not in expected: continue
        try: seq = int(row['stop_sequence'])
        except ValueError: raise ValueError('invalid GTFS stop sequence') from None
        source_visits[tid].append((seq, row))

    counts = Counter()
    issues = []
    modes = defaultdict(Counter)
    for tid, (route, trip, visits) in expected.items():
        counts['network_trips'] += 1
        mode = str(route.get('mode') or '')
        modes[mode]['network_trips'] += 1
        source = source_trips.get(tid)
        if not source:
            counts['missing_trip_ids'] += 1; issues.append({'trip_id': tid, 'reason': 'TRIP_ID_NOT_IN_FEED'}); continue
        counts['matched_trip_ids'] += 1
        src_route, src_service = source['route_id'], source['service_id']
        source_route = route_rows.get(src_route)
        if (not source_route or src_route != str(trip.get('gtfs_route_id') or '')
                or src_service != str(trip.get('service_id') or '')
                or source_route['route_short_name'] != str(route.get('route_number') or '')
                or source_route['agency_id'] not in {str(x) for x in route.get('gtfs_agency_ids') or []}):
            counts['trip_identity_mismatch'] += 1; issues.append({'trip_id': tid, 'reason': 'ROUTE_AGENCY_OR_SERVICE_MISMATCH'}); continue
        expected_route_type = {'tram': '0', 'bus': '3'}.get(mode)
        if expected_route_type is None or source_route['route_type'] != expected_route_type:
            counts['route_mode_mismatch_or_unsupported'] += 1
            issues.append({'trip_id': tid, 'reason': 'GTFS_ROUTE_TYPE_MISMATCH_OR_UNSUPPORTED'}); continue
        if src_service not in known or src_service not in active:
            counts['inactive_or_unknown_service'] += 1; issues.append({'trip_id': tid, 'reason': 'SERVICE_NOT_ACTIVE_ON_DATE'}); continue
        counts['date_and_route_identity_matched'] += 1
        raw_visits = sorted(source_visits.get(tid, []), key=lambda x: x[0])
        if len(raw_visits) != len(visits) or len({seq for seq, _ in raw_visits}) != len(raw_visits) or any(
                seq != visit['stop_sequence'] or str(src['stop_id']) != str(visit['stop_id'])
                for (seq, src), visit in zip(raw_visits, visits)):
            counts['stop_occurrence_mismatch_trips'] += 1; issues.append({'trip_id': tid, 'reason': 'STOP_OCCURRENCE_MISMATCH'}); continue
        counts['stop_occurrence_matched_trips'] += 1
        counts['matched_stop_occurrences'] += len(visits)
        for (_, src), visit in zip(raw_visits, visits):
            pairs = []
            for key in ('arrival_time', 'departure_time'):
                a, b = _time_seconds(src[key]), _time_seconds(visit[key])
                if a is None or b is None:
                    pairs = []; break
                pairs.append((a, b))
            if not pairs:
                counts['invalid_time_occurrences'] += 1; continue
            counts['valid_time_occurrences'] += 1
            if all(a // 60 == b // 60 for a, b in pairs): counts['matched_minute_time_pairs'] += 1
            else:
                counts['mismatched_minute_time_pairs'] += 1
                issues.append({'trip_id': tid, 'stop_sequence': visit['stop_sequence'], 'reason': 'SCHEDULE_MINUTE_MISMATCH'})
            if all(a == b for a, b in pairs): counts['matched_exact_second_time_pairs'] += 1
    return {'scope': {'network_version_id': version, 'service_date': day_text},
            'counts': dict(counts), 'by_mode': {k: dict(v) for k, v in modes.items()},
            'issues': issues, 'limits': ['Matching a captured feed does not prove which feed production imported.',
                'Calendar and scheduled times are static source data, not realtime or observed vehicle movement.',
                'No route geometry, infrastructure direction, traffic, GPS or physical accuracy was checked.']}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--network', required=True, type=Path)
    parser.add_argument('--gtfs', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--stops-only', action='store_true', help='Compare stop metadata without scanning stop_times.txt')
    args = parser.parse_args(argv)
    if args.output.exists(): raise FileExistsError('Refusing to overwrite report')
    network_data = args.network.read_bytes()
    digest = hashlib.sha256()
    with args.gtfs.open('rb') as raw:
        for chunk in iter(lambda: raw.read(1024*1024), b''): digest.update(chunk)
        raw.seek(0)
        with zipfile.ZipFile(raw) as z:
            result = (audit_stop_metadata if args.stops_only else audit_archive)(json.loads(network_data), z)
    result['input_sha256'] = {'network': hashlib.sha256(network_data).hexdigest(), 'gtfs_zip': digest.hexdigest()}
    with args.output.open('x', encoding='utf-8', newline='\n') as f:
        json.dump(result, f, ensure_ascii=False, indent=2, allow_nan=False); f.write('\n')
    print(json.dumps({'report': str(args.output), **result['scope'], **result['counts']}, ensure_ascii=True))


if __name__ == '__main__': main()
