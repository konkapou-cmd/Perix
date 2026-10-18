"""Operator-approved, per-region display labels for temporary transit patterns.

GTFS route/trip IDs remain untouched. No city or transport-company name is
hardcoded in this module; the optional manifest path comes from deployment
configuration (MOBILITY_DISPLAY_ALIASES_FILE). Unconfigured/unapproved inputs
are fail-closed. A pattern alias is valid only for an exact ordered sequence
of GTFS stop IDs, route, mode, service day and region/network identity.
"""
from __future__ import annotations

import hashlib
import json
import os
from datetime import date
from pathlib import Path
from functools import lru_cache


@lru_cache(maxsize=8)
def _load_manifest(path: str, modified_ns: int) -> dict | None:
    try:
        data = json.loads(Path(path).read_text(encoding='utf-8'))
        if not isinstance(data, dict) or data.get('operator_approved') is not True:
            return None
        if not isinstance(data.get('patterns'), dict):
            return None
        if not str(data.get('approved_by') or '').strip():
            return None
        return data
    except (OSError, UnicodeError, ValueError, TypeError):
        return None


def _manifest() -> dict | None:
    raw = os.getenv('MOBILITY_DISPLAY_ALIASES_FILE', '').strip()
    if not raw:
        return None
    try:
        return _load_manifest(raw, Path(raw).stat().st_mtime_ns)
    except OSError:
        return None


def display_alias(pattern_id: str, route_number: str, mode: str,
                  stop_ids: list[str], service_date: str, region_id: str,
                  network_id: str) -> dict | None:
    data = _manifest()
    if not data or region_id != data.get('region_id') or network_id != data.get('network_id'):
        return None
    try:
        day = date.fromisoformat(str(service_date))
        if not date.fromisoformat(str(data['valid_from'])) <= day <= date.fromisoformat(str(data['valid_until'])):
            return None
    except (ValueError, TypeError, KeyError):
        return None
    pat = data['patterns'].get(str(pattern_id))
    if not isinstance(pat, dict):
        return None
    if str(route_number) != str(pat.get('route_number')) or str(mode) != str(pat.get('mode')):
        return None
    if len(stop_ids or []) != pat.get('stop_count') or len(stop_ids or []) < 2:
        return None
    fingerprint = hashlib.sha256('|'.join(str(s) for s in stop_ids).encode('utf-8')).hexdigest()[:24]
    if fingerprint != pat.get('stop_ids_sha24'):
        return None
    label = str(pat.get('label') or '').strip()
    if not label or len(label) > 12:
        return None
    return {'display_route_number': label, 'display_route_source': 'OPERATOR_REVIEWED'}
