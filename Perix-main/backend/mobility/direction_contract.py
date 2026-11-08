"""Line-owned directed stop occurrences and legs; never a marker's route choice.

No database access, routing, reversal, nearest-point search or clock mutation.
Certifies an already routed directed edge chain against its source stop order.
"""
import hashlib
import json
import math

from mobility.approach import path_fingerprint

SCHEMA = 1


class DirectionContractError(ValueError):
    pass


def _digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'),
                                     allow_nan=False).encode()).hexdigest()


def _points(values):
    try:
        result = [[float(p[0]), float(p[1])] for p in values]
    except (TypeError, ValueError, IndexError):
        raise DirectionContractError('INVALID_DIRECTED_POINTS')
    if len(result) < 2 or any(not math.isfinite(a) or not math.isfinite(b)
                             or not -90 <= a <= 90 or not -180 <= b <= 180 for a, b in result):
        raise DirectionContractError('INVALID_DIRECTED_POINTS')
    return result


def _distance(a, b):
    a1, a2 = math.radians(a[0]), math.radians(b[0])
    dlat, dlon = a2-a1, math.radians(b[1]-a[1])
    h = math.sin(dlat/2)**2+math.cos(a1)*math.cos(a2)*math.sin(dlon/2)**2
    return 6371000*2*math.asin(math.sqrt(min(1, max(0, h))))


def direction_key(pattern):
    raw_ids = pattern.get('stop_ids') or []
    if any(x is None or isinstance(x, bool) for x in raw_ids):
        raise DirectionContractError('MISSING_DIRECTED_STOP_ORDER')
    ids = [str(x) for x in raw_ids]
    if len(ids) < 2 or any(not x for x in ids) or not str(pattern.get('route_number') or ''):
        raise DirectionContractError('MISSING_DIRECTED_STOP_ORDER')
    return _digest([str(pattern.get('mode') or 'bus'), str(pattern['route_number']), ids])


def build_direction_contract(*, scope, pattern, points, segments, platforms,
                             max_platform_distance_m=120.0):
    """Certify stop 0 -> ... -> stop N, including repeated-stop occurrences.

    Segment indexes may be stored unordered, but their points/edges are NEVER
    reversed. Every consecutive pair must be present exactly once and join at
    the same directed graph node AND coordinate. Geometry must be exactly the
    ordered concatenation, not another path passing near the same platforms.
    """
    key = direction_key(pattern)
    ids = [str(x) for x in pattern['stop_ids']]
    full = _points(points)
    required = ('region_id', 'network_id', 'version_id', 'pattern_id')
    if any(not str(scope.get(k) or '') for k in required):
        raise DirectionContractError('MISSING_DIRECTION_SCOPE')
    if len(platforms) != len(ids):
        raise DirectionContractError('MISSING_DIRECTION_PLATFORMS')
    if len(segments) != len(ids)-1:
        raise DirectionContractError('DIRECTION_LEG_COUNT_MISMATCH')
    by_index = {}
    for segment in segments:
        if 'ok' in segment and segment['ok'] is not True:
            raise DirectionContractError('UNREADY_DIRECTED_LEG')
        a, b = segment.get('a_idx'), segment.get('b_idx')
        if type(a) is not int or type(b) is not int or not 0 <= a < len(ids)-1 or b != a+1 or a in by_index:
            raise DirectionContractError('INVALID_DIRECTION_LEG_INDEX')
        by_index[a] = segment
    assembled, boundaries, legs = [], [0.0], []
    previous_node = None
    for i in range(len(ids)-1):
        segment = by_index[i]
        pts = _points(segment.get('points') or [])
        start, end = segment.get('start_node_id'), segment.get('end_node_id')
        edges = [str(x) for x in segment.get('edge_ids') or []]
        if start is None or end is None or len(edges) != len(pts)-1:
            raise DirectionContractError('MISSING_DIRECTED_EDGE_CHAIN')
        node = str(start)
        for edge in edges:
            parts = edge.rsplit(':', 2)
            if len(parts) != 3 or parts[-2] != node:
                raise DirectionContractError('REVERSED_OR_DISCONNECTED_EDGE')
            node = parts[-1]
        if node != str(end):
            raise DirectionContractError('WRONG_DIRECTED_LEG_ENDPOINT')
        if previous_node is not None and (str(start) != previous_node or pts[0] != assembled[-1]):
            raise DirectionContractError('DISCONNECTED_DIRECTED_LEGS')
        for index, point in ((i, pts[0]), (i+1, pts[-1])):
            platform = platforms[index]
            if str(platform.get('platform_id') or platform.get('stop_id') or ids[index]) != ids[index]:
                raise DirectionContractError('WRONG_PLATFORM_OCCURRENCE')
            try:
                coordinate = [float(platform['latitude']), float(platform['longitude'])]
            except (KeyError, TypeError, ValueError):
                raise DirectionContractError('MISSING_DIRECTION_PLATFORMS')
            if (any(not math.isfinite(v) for v in coordinate) or not -90 <= coordinate[0] <= 90
                    or not -180 <= coordinate[1] <= 180 or _distance(point, coordinate) > max_platform_distance_m):
                raise DirectionContractError('DIRECTED_LEG_ENDPOINT_OFF_PLATFORM')
        length = sum(_distance(a, b) for a, b in zip(pts, pts[1:]))
        if length <= 0:
            raise DirectionContractError('ZERO_LENGTH_DIRECTED_LEG')
        first = len(assembled)-1 if assembled else 0
        assembled.extend(pts[1:] if assembled else pts)
        legs.append(dict(from_index=i, to_index=i+1, from_stop_id=ids[i], to_stop_id=ids[i+1],
            from_m=boundaries[-1], to_m=round(boundaries[-1]+length, 6),
            first_point_index=first, last_point_index=len(assembled)-1,
            start_node_id=str(start), end_node_id=str(end), edge_fingerprint=_digest(edges)))
        boundaries.append(round(boundaries[-1]+length, 6))
        previous_node = str(end)
    if assembled != full:
        raise DirectionContractError('GEOMETRY_NOT_DIRECTED_LEG_ASSEMBLY')
    contract = dict(schema=SCHEMA, authority='LINE_GENERATION',
        scope={k:str(scope[k]) for k in required}, mode=str(pattern.get('mode') or 'bus'),
        route_number=str(pattern['route_number']), direction_key=key,
        ordered_stop_ids=ids, origin_stop_id=ids[0], terminal_stop_id=ids[-1],
        platforms=[dict(platform_id=sid,latitude=float(p['latitude']),longitude=float(p['longitude']))
                   for sid,p in zip(ids,platforms)],
        geometry_fingerprint=path_fingerprint(full), stop_progress_m=boundaries, legs=legs)
    contract['fingerprint'] = _digest(contract)
    return contract


def platforms_match_contract(contract, platforms):
    try:
        return contract.get('platforms') == [dict(platform_id=str(p['platform_id']),
            latitude=float(p['latitude']),longitude=float(p['longitude'])) for p in platforms]
    except (KeyError,TypeError,ValueError):
        return False


def verify_direction_contract(contract, *, scope, pattern, points, geometry_fingerprint=None):
    """Check immutable metadata before consuming it. No marker-side repair."""
    if not isinstance(contract, dict) or contract.get('schema') != SCHEMA:
        return False
    try:
        payload = {k:v for k,v in contract.items() if k != 'fingerprint'}
        return (contract.get('fingerprint') == _digest(payload)
            and contract.get('authority') == 'LINE_GENERATION'
            and contract.get('scope') == {k:str(scope[k]) for k in ('region_id','network_id','version_id','pattern_id')}
            and contract.get('direction_key') == direction_key(pattern)
            and contract.get('ordered_stop_ids') == [str(x) for x in pattern['stop_ids']]
            and contract.get('geometry_fingerprint') == (geometry_fingerprint or path_fingerprint(points)))
    except (KeyError, TypeError, ValueError):
        return False
