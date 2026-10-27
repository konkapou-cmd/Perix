"""Read-only identity checks for a shared national GTFS-RT ServiceAlert feed.

An alert with local region_id added by an importer is NOT proof that the
underlying GTFS identifiers belong to that region. Reject unidentified,
nationwide and mostly out-of-region notices (fail closed).
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class LocalScope:
    route_ids: frozenset[str]
    stop_ids: frozenset[str]
    trip_ids: frozenset[str]
    agency_ids: frozenset[str]
    version_id: str


def build_alert_scope(network: dict) -> LocalScope:
    route_ids, stop_ids, trip_ids, agencies = set(), set(), set(), set()
    for route in network.get('routes') or []:
        route_ids.update(str(x) for x in route.get('gtfs_route_ids') or [] if x)
        agencies.update(str(x) for x in route.get('gtfs_agency_ids') or [] if x)
        stop_ids.update(str(s['stop_id']) for s in route.get('stops') or [] if s.get('stop_id'))
        for t in route.get('trips') or []:
            if t.get('trip_id'):
                trip_ids.add(str(t['trip_id']))
            if t.get('gtfs_route_id'):
                route_ids.add(str(t['gtfs_route_id']))
    return LocalScope(frozenset(route_ids), frozenset(stop_ids), frozenset(trip_ids),
                      frozenset(agencies), str(network.get('version_id') or ''))


def selector_local(selector: dict, scope: LocalScope) -> bool:
    """Every supplied GTFS identifier must match; route *numbers* do not count."""
    keys = [('route_id', scope.route_ids), ('stop_id', scope.stop_ids),
            ('trip_id', scope.trip_ids), ('agency_id', scope.agency_ids)]
    present = [(str(selector[k]), ids) for k, ids in keys if selector.get(k) not in (None, '')]
    # A route_type alone or an unqualified stop_id cannot establish agency
    # identity in a nationwide feed (different agencies may reuse stop IDs).
    strong_id = any(selector.get(k) not in (None, '') for k in ('route_id','trip_id','agency_id'))
    return strong_id and bool(present) and all(value in ids for value, ids in present)


def scope_alert(selectors: list[dict], scope: LocalScope) -> dict:
    if not scope.version_id:
        return {'accepted': False, 'reason': 'NO_ACTIVE_VERSION', 'entities': []}
    if not selectors:
        return {'accepted': False, 'reason': 'UNSCOPED_NATIONWIDE', 'entities': []}
    local = [s for s in selectors if selector_local(s, scope)]
    total = len(selectors)
    if not local:
        return {'accepted': False, 'reason': 'NO_LOCAL_IDENTIFIERS', 'entities': []}
    # A shared national alert may list thousands of trips of many agencies.
    # Seeing one local trip among them does NOT make it a Magdeburg notice.
    ratio = len(local) / total
    if ratio < 0.80:
        return {'accepted': False, 'reason': 'MIXED_OR_NATIONWIDE',
                'matched': len(local), 'total': total, 'entities': []}
    return {'accepted': True, 'reason': 'LOCAL_GTFS_IDENTIFIERS',
            'matched': len(local), 'total': total, 'entities': local}


def visible_scoped_alert(alert: dict, version_id: str, now_epoch: int) -> bool:
    from mobility.alert_lifecycle import alert_is_current
    return (bool(version_id) and alert.get('scope_verified') is True
            and str(alert.get('network_version_id') or '') == str(version_id)
            and alert_is_current(alert, now_epoch))
