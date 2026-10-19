"""Read-only comparison of active GTFS trip stop names with dated official lists.

A PUBLIC webpage is an audit reference, never verified geometry, an operator
signature, a GTFS stop-ID authority, an ETA observation, or permission to deploy.
The bundled Magdeburg reference is a MANUAL transcription with known editorial
inconsistencies; do not silently map public route labels to different GTFS IDs.
"""
from __future__ import annotations

from difflib import SequenceMatcher
from datetime import date
import re
import unicodedata
from typing import Any

# Only documented spellings, not geographic proximity or fuzzy guesses.
_ALIAS = {
    'pablo-piccasso-strasse': 'pablo-picasso-strasse',
    'g hauptmann strasse': 'gerhart-hauptmann-strasse',
    'g-hauptmann-strasse': 'gerhart-hauptmann-strasse',
    'turmschanzenstrasse-friedensbr': 'turmschanzenstrasse-friedensbruecke',
    'cracau-pechauer-platz': 'cracau',
}


def normalize_stop_name(value: Any) -> str:
    """Deterministic, conservative comparison for published vs GTFS names."""
    text = str(value or '').casefold().strip()
    text = text.replace('ä', 'ae').replace('ö', 'oe').replace('ü', 'ue').replace('ß', 'ss')
    text = unicodedata.normalize('NFKD', text)
    text = ''.join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r'[^a-z0-9]+', '-', text).strip('-')
    return _ALIAS.get(text, text)


def _service_date(network: dict) -> str:
    return str(network.get('service_date') or '')


def _trip_stop_names(route: dict, trip: dict) -> tuple[list[str], list[str]]:
    stops_by_id = {str(x.get('stop_id')): str(x.get('name') or '') for x in route.get('stops') or []}
    ids = [str(x) for x in (trip.get('stop_ids') or [])]
    return ids, [stops_by_id.get(x, '') for x in ids]


def _pattern_identity(trip: dict) -> tuple[str, ...]:
    return tuple(str(x) for x in (trip.get('stop_ids') or []))


def official_route_audit(network: dict, reference: dict) -> dict:
    """Compare eight published *directions* with exact active GTFS trip order.

    PASS requires a trip with precisely the same ordered stop names and termini
    in each official direction. Short-turn/extra trips are warnings for human
    review, not silently assumed errors. Pass says STOP-LIST MATCH ONLY.
    """
    problems: list[dict] = []
    missing: list[str] = []
    warnings: list[dict] = []
    variants: list[dict] = []

    if not isinstance(network, dict) or not isinstance(reference, dict):
        return {'status': 'INSUFFICIENT_EVIDENCE', 'errors': [],
                'missing_evidence': ['active_network_or_official_reference'],
                'variants': []}
    for field in ('region_id', 'network_id'):
        lhs = str(network.get(field) or '')
        rhs = str(reference.get(field) or '')
        if not lhs or not rhs:
            missing.append(f'{field}_in_both_sources')
        elif lhs != rhs:
            problems.append({'code': 'SCOPE_MISMATCH', 'field': field, 'network': lhs, 'reference': rhs})
    day = _service_date(network)
    try:
        service_date = date.fromisoformat(day)
        valid_from = date.fromisoformat(reference['valid_from'])
        valid_until = date.fromisoformat(reference['valid_until'])
    except (ValueError, KeyError, TypeError):
        missing.append('dated_network_and_reference')
        service_date = valid_from = valid_until = None
    if service_date and valid_from and valid_until and not (valid_from <= service_date <= valid_until):
        return {'status': 'OUTSIDE_REFERENCE_WINDOW', 'service_date': day,
                'reference_valid_from': str(valid_from), 'reference_valid_until': str(valid_until),
                'variants': [], 'matched_variants': 0, 'total_variants': 0,
                'errors': problems, 'missing_evidence': ['reference_for_current_service_date'],
                'warnings': warnings, 'operator_approved': False}
    if not reference.get('source_url', '').startswith('https://'):
        missing.append('official_https_source_url')
    if reference.get('reference_type') != 'PUBLIC_MVB_ROUTE_LIST_MANUAL_TRANSCRIPTION':
        missing.append('identified_reference_type')
    if not reference.get('operator_approved', False):
        missing.append('operator_approval_of_transcription_and_gtfs_stop_mapping')
    routes = reference.get('routes') or []
    if not routes:
        missing.append('official_route_directions')
    found_route_numbers = {str(r.get('route_number')) for r in network.get('routes') or []}
    matched = 0
    for expected in routes:
        route_number = str(expected.get('route_number') or '')
        expected_names = [str(n) for n in expected.get('stop_names') or []]
        target = [normalize_stop_name(n) for n in expected_names]
        identity = {'route_number': route_number, 'from': expected.get('from'), 'to': expected.get('to')}
        candidates = [r for r in (network.get('routes') or [])
                      if str(r.get('route_number') or '') == route_number
                      and str(r.get('mode') or '') == str(expected.get('mode') or 'tram')]
        if not candidates:
            msg = 'NO_ROUTE_NUMBER_IN_ACTIVE_GTFS' if route_number not in found_route_numbers else 'ROUTE_MODE_MISMATCH'
            problems.append({'code': msg, **identity})
            variants.append({**identity, 'status': 'MISSING_ROUTE', 'closest': None})
            continue
        if len(target) < 2 or not all(target):
            problems.append({'code': 'INVALID_OFFICIAL_STOP_LIST', **identity})
            variants.append({**identity, 'status': 'INVALID_REFERENCE'})
            continue
        best: tuple[float, dict, dict] | None = None
        patterns = set()
        full_matches = []
        for route in candidates:
            for trip in route.get('trips') or []:
                ids, names = _trip_stop_names(route, trip)
                normalized = [normalize_stop_name(n) for n in names]
                patterns.add(_pattern_identity(trip))
                if not ids or any(not x for x in normalized):
                    continue
                if normalized == target:
                    full_matches.append((trip, ids))
                similarity = SequenceMatcher(a=target, b=normalized, autojunk=False).ratio()
                if best is None or similarity > best[0]:
                    best = (similarity, trip, {'names': names, 'stop_ids': ids})
        if full_matches:
            matched += 1
            sample_trip, sample_ids = full_matches[0]
            variants.append({**identity, 'status': 'STOP_LIST_MATCH',
                             'matching_trips': len(full_matches), 'example_trip_id': str(sample_trip.get('trip_id') or ''),
                             'number_of_stops': len(sample_ids), 'exact_trip_stop_id_order': sample_ids})
        else:
            nearest = ({'trip_id': str(best[1].get('trip_id') or ''),
                        'similarity_pct': round(best[0] * 100, 1),
                        'stop_names': best[2]['names'][:70]} if best else None)
            problems.append({'code': 'NO_GTFS_TRIP_MATCHES_OFFICIAL_DIRECTION', **identity,
                             'closest_trip': nearest})
            variants.append({**identity, 'status': 'STOP_LIST_MISMATCH', 'closest': nearest})
        if len(patterns) > 2:
            missing.append('operator_review_of_additional_trip_patterns:' + route_number)
            warnings.append({'code': 'ADDITIONAL_TRIP_PATTERNS_NEED_OPERATOR_REVIEW',
                             'route_number': route_number, 'unique_patterns': len(patterns)})
    if problems:
        status = 'BLOCKED'
    elif missing:
        status = 'INSUFFICIENT_EVIDENCE'
    else:
        status = 'STOP_LIST_TECHNICAL_MATCH'
    return {'status': status, 'service_date': day, 'total_variants': len(routes),
            'matched_variants': matched, 'errors': problems[:100],
            'warnings': warnings[:100], 'missing_evidence': sorted(set(missing)),
            'variants': variants, 'source_url': reference.get('source_url'),
            'operator_approved': bool(reference.get('operator_approved')),
            'what_is_proven': 'Published public stop names and direction order only. No timetable times, GPS, realtime, approval or physical platform accuracy.'}
