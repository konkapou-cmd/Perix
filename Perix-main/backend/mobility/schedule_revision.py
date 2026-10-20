"""Pure Perix GTFS day/temporary-pattern acceptance gate (Phase 4).

Does not fetch official data, infer closures, generate trips, or mutate a feed.
A separately operator-reviewed contract may require exact route/stop sequences.
Without a contract, the gate catches structural violations only.
"""
from __future__ import annotations

import math
from collections import defaultdict
from datetime import date, datetime, timedelta
from urllib.parse import urlsplit


def service_day_for(local_now: datetime, service_day_start_hour: int = 4) -> date:
    """Service day is not the midnight calendar day (03:15 still yesterday)."""
    if local_now.tzinfo is None:
        raise ValueError('timezone-aware datetime required')
    if not 0 <= service_day_start_hour < 24:
        raise ValueError('invalid service day start hour')
    return (local_now - timedelta(days=1)).date() if local_now.hour < service_day_start_hour else local_now.date()


def seconds_until_next_service_day(local_now: datetime, service_day_start_hour: int = 4) -> float:
    """Keep the GTFS refresh aligned with service-day rollover."""
    if local_now.tzinfo is None:
        raise ValueError('timezone-aware datetime required')
    start = local_now.replace(hour=service_day_start_hour, minute=0, second=0, microsecond=0)
    if start <= local_now:
        start += timedelta(days=1)
    return max(0.0, (start - local_now).total_seconds())


def _service_date(value):
    if not isinstance(value, str):
        raise ValueError('service_date must be YYYY-MM-DD')
    return date.fromisoformat(value)


def _seconds(value, service_day_start_hour=4):
    # Parse a GTFS "HH:MM[:SS]" time as seconds since service-day start.
    # GTFS allows hours 24..47 for trips that run past midnight, so we keep
    # the raw hour value. Midnight rollover is handled by the caller
    # (audit_schedule) by detecting a time that goes backwards relative to
    # the previous stop and shifting the remainder of the trip forward by
    # 24h. This is robust to feeds that mix "24:xx" and "00:xx" notation.
    try:
        parts = str(value).split(':')
        if len(parts) not in (2, 3):
            return None
        hour, minute = int(parts[0]), int(parts[1])
        second = int(parts[2]) if len(parts) == 3 else 0
        if hour < 0 or hour > 47 or not (0 <= minute < 60) or not (0 <= second < 60):
            return None
        return hour * 3600 + minute * 60 + second
    except (TypeError, ValueError):
        return None


def _haversine(a, b):
    radius = 6371000.0
    x, y = (math.radians(float(a[0])), math.radians(float(b[0])))
    dl = math.radians(float(b[0]) - float(a[0]))
    dg = math.radians(float(b[1]) - float(a[1]))
    v = math.sin(dl / 2) ** 2 + math.cos(x) * math.cos(y) * math.sin(dg / 2) ** 2
    return 2 * radius * math.atan2(math.sqrt(v), math.sqrt(max(0, 1 - v)))


def choose_contract(raw, *, region_id, network_id, service_date):
    """Validate a reviewer-supplied manifest and select it only in its date window.

    A signed approval and source verification are OUTSIDE this pure module.
    `approved_by` and `source_url` are audit metadata, not proof of authenticity.
    """
    if raw is None or raw == {}:
        return None
    if not isinstance(raw, dict):
        raise ValueError('MOBILITY_REVISION_CONTRACT_JSON must be an object')
    if raw.get('schema_version') != 1:
        raise ValueError('unsupported revision contract schema')
    if not raw.get('region_id') or not raw.get('network_id'):
        raise ValueError('revision contract must name the region and network')
    if str(raw['region_id']) != str(region_id) or str(raw['network_id']) != str(network_id):
        raise ValueError('revision contract has wrong region/network (refusing silent ignore)')
    start = _service_date(raw.get('valid_from'))
    end = _service_date(raw.get('valid_until'))
    if end < start:
        raise ValueError('reversed revision contract date interval')
    expected = raw.get('required_routes')
    if not isinstance(expected, list) or not expected:
        raise ValueError('revision contract must include required_routes')
    for route in expected:
        if not isinstance(route, dict) or not str(route.get('route_number') or '').strip():
            raise ValueError('every required route needs a route_number')
        if route.get('required_patterns') is not None and not isinstance(route['required_patterns'], list):
            raise ValueError('required_patterns must be a list')
        if route.get('strict_patterns') and not route.get('required_patterns'):
            raise ValueError('strict_patterns needs an explicit list of approved patterns')
        for pat in route.get('required_patterns') or []:
            if not isinstance(pat, dict) or not isinstance(pat.get('stop_ids'), list) or len(pat['stop_ids']) < 2:
                raise ValueError('a required pattern needs an ordered list of at least two stop_ids')
    # This is *documentation* and enables an operator to audit a reference.
    # It does not validate whether the reference is official.
    if not isinstance(raw.get('temporary_stops', []), list):
        raise ValueError('temporary_stops must be a list')
    if not raw.get('approved_by') or urlsplit(str(raw.get('source_url') or '')).scheme != 'https':
        raise ValueError('revision contract needs reviewer label and HTTPS source URL')
    sd = _service_date(service_date)
    return raw if start <= sd <= end else None


def audit_schedule(network, *, contract=None, service_day_start_hour=4, previous=None, source_sha256=None):
    """Offline-safe audit of the already-parsed, day-specific GTFS network.

    `blocking_errors` means do not activate this candidate. `warnings`
    highlight parser limitations or changed stops needing human review.
    """
    if not isinstance(network, dict):
        raise ValueError('candidate network must be an object')
    day = str(network.get('service_date') or '')
    _service_date(day)
    routes = network.get('routes') or []
    errors, warnings = [], []
    seen_trips = {}
    by_line = defaultdict(list)
    all_stops = {}
    trip_count = 0
    for route in routes:
        line = str(route.get('route_number') or '').strip()
        mode = str(route.get('mode') or '').strip()
        by_line[(line, mode)].append(route)
        stops = {str(s.get('stop_id')): s for s in (route.get('stops') or []) if s.get('stop_id')}
        for sid, stop in stops.items():
            try:
                lat = float(stop.get('lat'))
                lng = float(stop.get('lng'))
                if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                    raise ValueError('out of range')
            except (ValueError, TypeError):
                errors.append({'code': 'INVALID_STOP_COORDINATES', 'route': line, 'stop_id': sid})
            all_stops.setdefault(sid, stop)
        for trip in route.get('trips') or []:
            trip_count += 1
            tid = str(trip.get('trip_id') or '').strip()
            if not tid or tid in seen_trips:
                errors.append({'code': 'DUPLICATE_OR_MISSING_TRIP_ID', 'route': line, 'trip_id': tid})
            seen_trips[tid] = line
            ids = [str(s) for s in trip.get('stop_ids') or []]
            if len(ids) < 2 or any(s not in stops for s in ids):
                errors.append({'code': 'INVALID_TRIP_STOPS', 'route': line, 'trip_id': tid})
                continue
            if len(ids) != len(set(ids)):
                # GTFS permits loops; Perix's current stop_times dict does not.
                warnings.append({'code': 'REPEATED_STOP_ID_UNSUPPORTED', 'route': line, 'trip_id': tid})
            departures = trip.get('stop_times') or {}
            arrivals = trip.get('stop_times_arrival') or departures
            prev_departure_raw = None
            prev_departure = None
            day_offset = 0
            for sid in ids:
                a_raw = _seconds(arrivals.get(sid), service_day_start_hour)
                d_raw = _seconds(departures.get(sid), service_day_start_hour)
                if a_raw is None or d_raw is None:
                    errors.append({'code': 'INVALID_TRIP_TIMELINE', 'route': line, 'trip_id': tid, 'stop_id': sid})
                    break
                # Detect midnight rollover: if the RAW arrival goes backwards
                # relative to the RAW previous departure AND the arrival is in
                # the early-morning window (hour < service_day_start_hour),
                # shift this and all subsequent stops forward by 24h. This
                # handles feeds that write past-midnight times as "00:xx"
                # instead of "24:xx", while still rejecting genuinely
                # backwards times like "23:50" -> "23:40".
                if (prev_departure_raw is not None and a_raw < prev_departure_raw
                        and a_raw // 3600 < service_day_start_hour):
                    day_offset += 24 * 3600
                a = a_raw + day_offset
                d = d_raw + day_offset
                if a > d or (prev_departure is not None and a < prev_departure):
                    errors.append({'code': 'INVALID_TRIP_TIMELINE', 'route': line, 'trip_id': tid, 'stop_id': sid})
                    break
                prev_departure_raw = d_raw
                prev_departure = d
    previous_stops = {}
    for route in (previous or {}).get('routes') or []:
        for stop in route.get('stops') or []:
            if stop.get('stop_id'):
                previous_stops[str(stop['stop_id'])] = stop
    moved = []
    for sid, stop in all_stops.items():
        old = previous_stops.get(sid)
        if old:
            try:
                meters = _haversine((stop['lat'], stop['lng']), (old['lat'], old['lng']))
            except (TypeError, ValueError, KeyError):
                continue
            if meters >= 25:
                moved.append({'stop_id': sid, 'distance_m': round(meters)})
    new_stops = sorted(set(all_stops) - set(previous_stops)) if previous else []
    if moved:
        warnings.append({'code': 'MOVED_PLATFORM_CANDIDATES', 'count': len(moved)})

    if contract:
        if not isinstance(contract, dict):
            raise ValueError('contract must be an object')
        if str(contract.get('region_id')) != str(network.get('region_id')) or str(contract.get('network_id')) != str(network.get('network_id')):
            errors.append({'code': 'CONTRACT_SCOPE_MISMATCH'})
        if not (str(contract.get('valid_from')) <= day <= str(contract.get('valid_until'))):
            errors.append({'code': 'CONTRACT_DATE_MISMATCH'})
        pinned_sha = str(contract.get('feed_sha256') or '').strip().lower()
        if pinned_sha and (not source_sha256 or str(source_sha256).lower() != pinned_sha):
            errors.append({'code': 'OFFICIAL_FEED_HASH_MISMATCH'})
        for prohibited in contract.get('prohibited_routes') or []:
            if any(ln == str(prohibited) for (ln, md) in by_line):
                errors.append({'code': 'PROHIBITED_ROUTE_PRESENT', 'route': str(prohibited)})
        for requirement in contract.get('required_routes') or []:
            number = str(requirement.get('route_number') or '').strip()
            mode = str(requirement.get('mode') or '').strip()
            candidates = [r for (ln, md), rs in by_line.items() if ln == number and (not mode or mode == md) for r in rs]
            if not candidates:
                errors.append({'code': 'REQUIRED_ROUTE_MISSING', 'route': number, 'mode': mode})
                continue
            trips = [t for r in candidates for t in (r.get('trips') or [])]
            if len(trips) < int(requirement.get('minimum_trips') or 1):
                errors.append({'code': 'REQUIRED_ROUTE_TOO_FEW_TRIPS', 'route': number})
            permitted = set()
            for target in requirement.get('required_patterns') or []:
                expected = [str(s) for s in target.get('stop_ids') or []]
                if not target.get('trip_id'):
                    permitted.add((tuple(expected), str(target.get('headsign') or '').strip()))
                headsign = str(target.get('headsign') or '').strip()
                required_id = str(target.get('trip_id') or '').strip()
                exact = [t for t in trips if [str(s) for s in t.get('stop_ids') or []] == expected
                         and (not headsign or str(t.get('headsign') or '') == headsign)
                         and (not required_id or str(t.get('trip_id') or '') == required_id)]
                if not exact:
                    errors.append({'code': 'REQUIRED_PATTERN_MISSING', 'route': number,
                                   'headsign': headsign, 'stop_ids': expected})
                elif any(len(t.get('stop_ids') or []) != len(set(t.get('stop_ids') or [])) for t in exact):
                    errors.append({'code': 'REQUIRED_PATTERN_UNSUPPORTED_LOOP', 'route': number})
            if requirement.get('strict_patterns'):
                rules = requirement.get('required_patterns') or []
                for trip in trips:
                    trip_ids = tuple(str(x) for x in trip.get('stop_ids') or [])
                    ok = any(
                        trip_ids == tuple(str(s) for s in pat.get('stop_ids') or [])
                        and (not pat.get('headsign') or str(trip.get('headsign') or '') == str(pat['headsign']))
                        and (not pat.get('trip_id') or str(trip.get('trip_id') or '') == str(pat['trip_id']))
                        for pat in rules
                    )
                    if not ok:
                        errors.append({'code': 'UNAPPROVED_PATTERN_ON_SPECIAL_LINE',
                                       'route': number, 'trip_id': str(trip.get('trip_id') or '')})
        for st in contract.get('temporary_stops') or []:
            sid = str(st.get('stop_id') or '')
            found = all_stops.get(sid)
            if not found:
                errors.append({'code': 'REQUIRED_TEMPORARY_STOP_MISSING', 'stop_id': sid})
                continue
            required_route = str(st.get('served_by_route') or '').strip()
            if required_route and not any(
                str(r.get('route_number')) == required_route
                and any(sid in [str(x) for x in t.get('stop_ids') or []]
                        for t in r.get('trips') or [])
                for r in routes
            ):
                errors.append({'code': 'TEMPORARY_STOP_NOT_SERVED_BY_REQUIRED_ROUTE',
                               'stop_id': sid, 'route': required_route})
            if st.get('name') and str(found.get('name') or '') != str(st['name']):
                errors.append({'code': 'TEMPORARY_STOP_NAME_MISMATCH', 'stop_id': sid})
            if st.get('platform_code') and str(found.get('platform_code') or '') != str(st['platform_code']):
                errors.append({'code': 'TEMPORARY_PLATFORM_CODE_MISMATCH', 'stop_id': sid})
            try:
                distance = _haversine((found['lat'], found['lng']), (st['latitude'], st['longitude']))
                if distance > float(st.get('tolerance_m', 35)):
                    errors.append({'code': 'TEMPORARY_STOP_POSITION_MISMATCH', 'stop_id': sid, 'distance_m': round(distance)})
            except (KeyError, TypeError, ValueError):
                errors.append({'code': 'TEMPORARY_STOP_REFERENCE_INVALID', 'stop_id': sid})
    return {
        'service_date': day,
        'region_id': network.get('region_id'),
        'network_id': network.get('network_id'),
        'route_count': len(routes),
        'trip_count': trip_count,
        'contract_applied': bool(contract),
        'ready_to_import': len(errors) == 0,
        'blocking_errors': errors[:200],
        'blocking_error_count': len(errors),
        'warnings': warnings[:100],
        'warning_count': len(warnings),
        'moved_stop_candidates': moved[:100],
        'new_stop_ids': new_stops[:100],
        'notes': 'No realtime/Google comparison; exact split-trip proof requires operator-reviewed route/pattern contract.',
    }
