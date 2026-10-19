"""Offline Perix Mobility V6 evidence-based release gate.

This performs technical cross-checks on explicit exports, never claims official
approval, live vehicle position accuracy or Google ETA parity. The provided
operator contract is audit metadata, not proof of authorship.
"""
from __future__ import annotations

from collections import Counter, defaultdict
import hashlib
from datetime import datetime, timezone
import math
from typing import Any

from mobility.realtime_trip_identity import build_trip_index, match_trip_update
from mobility.schedule_revision import audit_schedule, choose_contract
from mobility.official_route_audit import official_route_audit


def _epoch(value: Any) -> float:
    if isinstance(value, (float, int)):
        return float(value)
    if not value:
        raise ValueError('missing timestamp')
    if isinstance(value, str) and value.strip().replace('.', '', 1).isdigit():
        return float(value)
    dt = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    if dt.tzinfo is None:
        raise ValueError('UTC/offset required for observations')
    return dt.timestamp()


def _percentile(sorted_values: list[float], q: float) -> float:
    if not sorted_values:
        raise ValueError('empty metric sample')
    i = (len(sorted_values) - 1) * q
    lo, hi = math.floor(i), math.ceil(i)
    return sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (i - lo)


def _xy(point):
    if isinstance(point, dict):
        return float(point['latitude']), float(point['longitude'])
    return float(point[0]), float(point[1])


def _nearest_progress_m(points: list, stop: dict) -> tuple[float, float]:
    """Nearest distance and cumulative route progress in local metric projection.

    Designed for a small urban area; never used to calculate or change routing.
    """
    lat, lng = _xy(stop)
    midlat = math.radians(lat)
    mlat, mlng = 111195.0, 111195.0 * math.cos(midlat)
    vertices = [_xy(p) for p in points]
    cursor, best = 0.0, (float('inf'), 0.0)
    for a, b in zip(vertices, vertices[1:]):
        x1, y1 = (a[0] - lat) * mlat, (a[1] - lng) * mlng
        x2, y2 = (b[0] - lat) * mlat, (b[1] - lng) * mlng
        dx, dy = x2 - x1, y2 - y1
        len2 = dx * dx + dy * dy
        t = min(1.0, max(0.0, -(x1 * dx + y1 * dy) / len2)) if len2 else 0.0
        dist = math.hypot(x1 + t * dx, y1 + t * dy)
        length = math.sqrt(len2)
        if dist < best[0]:
            best = (dist, cursor + t * length)
        cursor += length
    return best


def map_geometry_audit(map_payload: dict, *, max_stop_distance_m: float = 100) -> dict:
    """Check *provided* published lines; no hidden fabricated polyline fallback."""
    errors = []
    warnings = []
    lines = map_payload.get('lines') if isinstance(map_payload, dict) else None
    if not isinstance(lines, list) or not lines:
        return {'checked_lines': 0, 'errors': [{'code': 'NO_PUBLISHED_LINES'}], 'warnings': []}
    for line in lines:
        route = str(line.get('route_number') or '')
        pattern = str(line.get('pattern_id') or '')
        points, stops = line.get('points') or [], line.get('stops') or []
        ident = {'route_number': route, 'pattern_id': pattern}
        if not line.get('valid', True):
            errors.append({'code': 'INVALID_GEOMETRY', **ident})
            continue
        if len(points) < 2:
            errors.append({'code': 'MISSING_GEOMETRY', **ident})
            continue
        if len(stops) < 2:
            errors.append({'code': 'MISSING_PLATFORM_ANCHORS', **ident})
            continue
        previous_progress = -float('inf')
        for stop in stops:
            sid = str(stop.get('stop_id') or '')
            try:
                dist, progress = _nearest_progress_m(points, stop)
            except (ValueError, TypeError, KeyError, OverflowError):
                errors.append({'code': 'INVALID_STOP_COORDINATE', 'stop_id': sid, **ident})
                continue
            if not math.isfinite(dist):
                errors.append({'code': 'INVALID_STOP_COORDINATE', 'stop_id': sid, **ident})
                continue
            if dist > max_stop_distance_m:
                errors.append({'code': 'STOP_OFF_ROUTE', 'stop_id': sid, 'distance_m': round(dist), **ident})
            # Allow GPS/geometry noise, but not reversed ordered stops.
            if progress + 15 < previous_progress:
                errors.append({'code': 'REVERSED_STOP_ORDER', 'stop_id': sid, **ident})
            previous_progress = max(previous_progress, progress)
        if str(line.get('source') or '').upper() in ('', 'UNKNOWN', 'STOP_POLYLINE'):
            warnings.append({'code': 'UNVERIFIED_GEOMETRY_SOURCE', **ident})
    return {'checked_lines': len(lines), 'errors': errors[:100], 'warnings': warnings[:100]}



def map_pattern_audit(network: dict, map_payload: dict) -> dict:
    """Require each GTFS trip pattern to match a published, ordered map pattern.

    Exactly reproduces mobility.domain._pattern_key/_pattern_id's current
    identity rules without importing a database-connected application module.
    """
    expected = {}
    for route in network.get('routes') or []:
        number = str(route.get('route_number') or '')
        for trip in route.get('trips') or []:
            stop_ids = [str(s) for s in trip.get('stop_ids') or []]
            key = str(trip.get('shape_id') or
                      f"{trip.get('headsign') or ''}:{'>'.join(stop_ids)}")
            pattern_id = f"{number}:{hashlib.sha1(key.encode('utf-8')).hexdigest()[:10]}"
            record = {'route_number': number, 'mode': str(route.get('mode') or 'bus'),
                      'direction': str(trip.get('headsign') or ''), 'stop_ids': stop_ids}
            if pattern_id in expected and expected[pattern_id] != record:
                return {'expected_patterns': len(expected), 'errors': [
                    {'code': 'AMBIGUOUS_PATTERN_ID', 'pattern_id': pattern_id}]}
            expected[pattern_id] = record
    actual = {}
    errors = []
    for line in map_payload.get('lines') or []:
        pid = str(line.get('pattern_id') or '')
        if pid in actual:
            errors.append({'code': 'DUPLICATE_MAP_PATTERN', 'pattern_id': pid})
        actual[pid] = line
    for pid, pattern in expected.items():
        line = actual.get(pid)
        if line is None:
            errors.append({'code': 'MISSING_ACTIVE_GTFS_PATTERN', 'pattern_id': pid,
                           'route_number': pattern['route_number']})
            continue
        actual_ids = [str(s.get('stop_id') or '') for s in line.get('stops') or []]
        if (str(line.get('route_number') or '') != pattern['route_number'] or
                str(line.get('mode') or '') != pattern['mode'] or
                str(line.get('direction') or '') != pattern['direction'] or
                actual_ids != pattern['stop_ids']):
            errors.append({'code': 'MAP_TRIP_PATTERN_MISMATCH', 'pattern_id': pid,
                           'route_number': pattern['route_number']})
    for pid in actual:
        if pid not in expected:
            errors.append({'code': 'MAP_PATTERN_NOT_IN_ACTIVE_GTFS', 'pattern_id': pid})
    return {'expected_patterns': len(expected), 'published_patterns': len(actual),
            'errors': errors[:100]}


def realtime_audit(network: dict, feed: dict, *, max_age_s: int = 120,
                   min_eligible_updates: int = 1, min_acceptance_pct: float = 80) -> dict:
    """Replay NORMALIZED GTFS-RT TripUpdates with Phase-5 identity rules.

    The nationwide feed may contain mostly unrelated operators. Do not divide
    matches by ALL source updates; report eligible active-trip updates separately.
    """
    index = build_trip_index(network)
    updates = feed.get('trip_updates') or []
    feed_timestamp = feed.get('feed_timestamp')
    captured_at = feed.get('captured_at')
    errs = []
    try:
        timestamp, captured = _epoch(feed_timestamp), _epoch(captured_at)
        age = captured - timestamp
        if age < -30 or age > max_age_s:
            errs.append({'code': 'STALE_OR_FUTURE_FEED', 'age_seconds': round(age)})
    except (ValueError, TypeError, OverflowError):
        errs.append({'code': 'MISSING_OR_BAD_FEED_TIMESTAMP'})
        age = None
    reasons = Counter()
    identities = set()
    duplicates = set()
    eligible = 0
    accepted = 0
    for item in updates:
        desc = item.get('descriptor') or {}
        tid = str(desc.get('trip_id') or '')
        if tid not in index:
            reasons['OUT_OF_NETWORK_OR_AMBIGUOUS_TRIP'] += 1
            continue
        eligible += 1
        if tid in identities:
            duplicates.add(tid)
            reasons['DUPLICATE_TRIP_UPDATE'] += 1
            continue
        identities.add(tid)
        ref, reason = match_trip_update(
            desc, item.get('stop_updates') or [], index,
            feed_timestamp=feed_timestamp,
            timezone_name=str(network.get('timezone') or 'Europe/Berlin'),
            service_day_start_hour=int(network.get('service_day_start_hour') or 4),
            activated_at=network.get('activated_at'),
        )
        reasons[reason] += 1
        if ref is not None:
            accepted += 1
    if duplicates:
        errs.append({'code': 'DUPLICATE_REALTIME_TRIP_UPDATES', 'count': len(duplicates)})
    if eligible < min_eligible_updates:
        errs.append({'code': 'INSUFFICIENT_ELIGIBLE_REALTIME', 'eligible_updates': eligible,
                     'required': min_eligible_updates})
    if eligible and accepted * 100 / eligible < min_acceptance_pct:
        errs.append({'code': 'LOW_REALTIME_IDENTITY_ACCEPTANCE', 'percentage': round(100 * accepted / eligible, 1),
                     'required_pct': min_acceptance_pct})
    return {'total_updates': len(updates), 'active_trip_count': len(index),
            'eligible_updates': eligible, 'accepted_updates': accepted,
            'accepted_eligible_pct': round(100 * accepted / eligible, 1) if eligible else 0,
            'reasons': dict(sorted(reasons.items())), 'feed_age_seconds': age, 'errors': errs}


def eta_accuracy_audit(rows: list[dict], *, min_observations: int = 30, max_mae_seconds: float = 120) -> dict:
    """Requires independent observed physical arrivals, not Google estimates."""
    errors = []
    samples = []
    seen = set()
    for row in rows:
        key = (str(row.get('service_date') or ''), str(row.get('trip_id') or ''), str(row.get('stop_id') or ''))
        if not all(key[1:]) or not key[0]:
            errors.append({'code': 'OBSERVATION_IDENTITY_INCOMPLETE'})
            continue
        if key in seen:
            errors.append({'code': 'DUPLICATE_INDEPENDENT_OBSERVATION', 'trip_id': key[1], 'stop_id': key[2]})
            continue
        seen.add(key)
        if str(row.get('observation_source') or '').upper() not in ('VALIDATED_GPS', 'OPERATOR_ACTUAL'):
            errors.append({'code': 'OBSERVATION_GROUND_TRUTH_UNVERIFIED', 'trip_id': key[1]})
            continue
        try:
            prediction = _epoch(row.get('predicted_utc'))
            actual = _epoch(row.get('observed_utc'))
            issued = _epoch(row.get('forecast_issued_utc'))
            if issued > actual or issued > prediction:
                raise ValueError('forecast issued after event or prediction')
            if actual - issued > 3600:
                raise ValueError('forecast more than 60 minutes before arrival')
            diff = prediction - actual
            if not math.isfinite(diff):
                raise ValueError('nonfinite delta')
            samples.append({'abs_error': abs(diff), 'bias': diff, 'source': str(row.get('eta_source') or 'UNKNOWN')})
        except (ValueError, TypeError, OverflowError):
            errors.append({'code': 'BAD_OBSERVATION_TIMESTAMP', 'trip_id': key[1]})
    if len(samples) < min_observations:
        errors.append({'code': 'INSUFFICIENT_OBSERVATIONS', 'count': len(samples), 'required': min_observations})
    result = {'samples': len(samples), 'errors': errors[:100], 'by_source': {}}
    if samples:
        abs_errors = sorted(item['abs_error'] for item in samples)
        mae = sum(abs_errors) / len(abs_errors)
        result.update({'mae_seconds': round(mae, 2),
                       'p90_abs_error_seconds': round(_percentile(abs_errors, .9), 2),
                       'bias_seconds': round(sum(s['bias'] for s in samples) / len(samples), 2)})
        if mae > max_mae_seconds:
            errors.append({'code': 'ETA_MAE_EXCEEDS_THRESHOLD', 'mae_seconds': round(mae, 1),
                           'threshold': max_mae_seconds})
        groups = defaultdict(list)
        for s in samples:
            groups[s['source']].append(s['abs_error'])
        result['by_source'] = {k: {'samples': len(vals), 'mae_seconds': round(sum(vals)/len(vals), 2)}
                               for k, vals in sorted(groups.items())}
    result['errors'] = errors[:100]
    return result


def release_gate(network: dict, *, realtime: dict | None = None, map_payload: dict | None = None,
                 observations: list[dict] | None = None, contract: dict | None = None,
                 detours: dict | None = None, min_observations: int = 30,
                 max_mae_seconds: float = 120, max_stop_distance_m: float = 100,
                 max_feed_age_s: int = 120, min_eligible_updates: int = 1,
                 min_acceptance_pct: float = 80,
                 official_reference: dict | None = None,
                 require_official_reference: bool = False) -> dict:
    """Fail closed. Technical PASS is NOT official/operator production signoff."""
    reports = {}
    blocking, missing = [], []
    scope = (str(network.get('region_id') or ''), str(network.get('network_id') or ''),
             str(network.get('service_date') or ''))
    checked_contract = None
    if contract is None:
        missing.append('operator_reviewed_special_service_contract')
    else:
        try:
            checked_contract = choose_contract(contract, region_id=scope[0], network_id=scope[1], service_date=scope[2])
            if checked_contract is None:
                blocking.append('CONTRACT_OUTSIDE_SERVICE_DATE')
        except (ValueError, TypeError) as exc:
            blocking.append('CONTRACT_INVALID:' + str(exc))
    try:
        schedule = audit_schedule(network, contract=checked_contract)
        reports['schedule'] = schedule
        if not schedule['ready_to_import']:
            blocking.append('SCHEDULE_VALIDATION_FAILED')
    except (ValueError, KeyError, TypeError) as exc:
        blocking.append('SCHEDULE_AUDIT_ERROR:' + str(exc))
    if realtime is None:
        missing.append('captured_gtfs_rt_feed')
    else:
        if not network.get('activated_at'):
            missing.append('active_network_activation_timestamp')
        rt = realtime_audit(network, realtime, max_age_s=max_feed_age_s,
                            min_eligible_updates=min_eligible_updates,
                            min_acceptance_pct=min_acceptance_pct)
        reports['realtime'] = rt
        if rt['errors'] or (rt['eligible_updates'] and rt['accepted_updates'] == 0):
            blocking.append('REALTIME_REPLAY_FAILED')
    if map_payload is None:
        missing.append('published_map_and_stop_positions')
    else:
        geo = map_geometry_audit(map_payload, max_stop_distance_m=max_stop_distance_m)
        reports['geometry'] = geo
        pattern_check = map_pattern_audit(network, map_payload)
        reports['map_pattern_alignment'] = pattern_check
        if geo['errors'] or pattern_check['errors']:
            blocking.append('GEOMETRY_ALIGNMENT_FAILED')
    if observations is None:
        missing.append('independent_observed_arrivals')
    else:
        eta = eta_accuracy_audit(observations, min_observations=min_observations,
                                 max_mae_seconds=max_mae_seconds)
        reports['eta'] = eta
        if eta['errors']:
            blocking.append('ETA_ACCURACY_FAILED')
    if detours is None:
        missing.append('verified_detour_diagnostic')
    else:
        patterns = detours.get('patterns') or []
        unsafe = [{'pattern_id': p.get('pattern_id'), 'status': p.get('status')}
                  for p in patterns if p.get('safe') is False]
        reports['detours'] = {'patterns_checked': len(patterns), 'unsafe': unsafe}
        if unsafe:
            blocking.append('UNSAFE_VERIFIED_DETOUR_PATTERN')
        if not patterns:
            missing.append('nonempty_detour_diagnostic')
    # V7: independently published stop ORDER only, not a signed operator
    # timetable, arrival event, temporary platform coordinate or geometry.
    if official_reference is None:
        if require_official_reference:
            missing.append('dated_operator_reviewed_official_stop_list')
    else:
        official = official_route_audit(network, official_reference)
        reports['official_route_stop_order'] = official
        if official['status'] == 'BLOCKED':
            blocking.append('OFFICIAL_ROUTE_STOP_ORDER_CONFLICT')
        elif official['status'] == 'OUTSIDE_REFERENCE_WINDOW':
            missing.append('official_reference_applicable_to_current_service_date')
        else:
            for item in official.get('missing_evidence') or []:
                missing.append('official_reference:' + str(item))
    # Approval metadata is not a cryptographic/operator signature.
    status = 'BLOCKED' if blocking else ('INSUFFICIENT_EVIDENCE' if missing else 'TECHNICAL_PASS')
    return {
        'status': status,
        'safe_to_deploy_automatically': False,
        'required_human_approval': 'Operator verifies official contract and temporary stops; reviewer approves staging motion and rollback',
        'blocking': blocking,
        'missing_evidence': missing,
        'scope': {'region_id': scope[0], 'network_id': scope[1], 'service_date': scope[2],
                  'version_id': str(network.get('version_id') or '')},
        'reports': reports,
        'notes': ['Synthetic tests do not prove real MVB data accuracy.',
                  'The gate does not compare to Google Maps and does not measure animated position smoothness.',
                  'A contract HTTPS URL/reviewer label is metadata, not a verified signature.'],
    }
