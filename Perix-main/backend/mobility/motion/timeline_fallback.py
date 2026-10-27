"""One stop-constrained fallback plan, reusing canonical trajectory mathematics.

Generic speed/acceleration caps are model parameters, not observed road speeds.
No infrastructure, live signal phase, traffic queue, GPS or passage is invented.
"""
from collections import OrderedDict
import hashlib
import math
import time

from mobility.motion.common import build_speed_trajectory
from mobility.motion.config import motion_config_for
from mobility.motion.source_reconciliation import estimate_revision, source_start_index

MAX_PLANS = 64
MAX_TRAJECTORY_SEGMENTS = 50000
CACHE_SECONDS = 30
WINDOW_SECONDS = 90
_plans = OrderedDict()


def clear_fallback_cache():
    _plans.clear()


def cached_trip_windows(*, region_id, network_id, version_id, service_date):
    now = time.monotonic()
    windows = {}
    scope = (region_id, network_id, str(version_id), str(service_date))
    for key, value in _plans.items():
        if key[:4] == scope and 0 <= now - value['at'] <= WINDOW_SECONDS:
            windows[key[4]] = {'start': value['plan']['start_s'], 'end': value['plan']['end_s'],
                               'cached_at': value['at']}
    return windows


def _build(timeline, progress, mode, origin):
    from mobility.motion.engine import effective_timeline_from_plan
    config = motion_config_for(mode)
    indices = [i for i in range(origin, len(timeline)) if timeline[i].get('relationship') != 'SKIPPED']
    if len(indices) < 2:
        return None
    segments = []
    arrival = float(timeline[indices[0]]['predicted_arrival'])
    start = arrival
    speed_cap = min(float(config['max_speed_kmh']), 45.0 if mode == 'tram' else 50.0)
    for a, b in zip(indices, indices[1:]):
        current, nxt = timeline[a], timeline[b]
        dwell = max(0, current['predicted_departure'] - current['predicted_arrival'])
        departure = max(arrival + dwell, float(current['predicted_departure']))
        if departure > arrival:
            segments.append(dict(kind='DWELL', t0=arrival, t1=departure,
                progress_m=progress[a], timeline_index=a, next_timeline_index=a))
        trajectory = build_speed_trajectory(start_m=progress[a], end_m=progress[b],
            spans=[dict(from_m=progress[a], to_m=progress[b], speed_cap_kmh=speed_cap)],
            acceleration_mps2=config['acceleration_mps2'], braking_mps2=config['braking_mps2'],
            step_m=config['trajectory_step_m'])
        natural = float(trajectory['duration_s'])
        requested = max(0.0, float(nxt['predicted_arrival']) - departure)
        duration = max(natural, requested)
        scale = duration / natural if natural > 0 else 1.0
        arrival = departure + duration
        segments.append(dict(kind='MOVE', t0=departure, t1=arrival, trajectory=trajectory,
            time_scale=scale, from_timeline_index=a, next_timeline_index=b,
            from_stop_id=current['stop_id'], to_stop_id=nxt['stop_id'],
            natural_duration_s=natural, requested_duration_s=requested,
            arrival_target_error_s=max(0.0, arrival - nxt['predicted_arrival']),
            fit='TIMELINE_FALLBACK'))
    last = indices[-1]
    dwell = max(0, timeline[last]['predicted_departure'] - timeline[last]['predicted_arrival'])
    end = max(arrival + dwell, float(timeline[last]['predicted_departure']))
    if end > arrival:
        segments.append(dict(kind='DWELL', t0=arrival, t1=end, progress_m=progress[last],
            timeline_index=last, next_timeline_index=last))
    plan = dict(segments=segments, start_s=start, end_s=end)
    plan['effective_timeline'] = effective_timeline_from_plan(timeline, plan)
    return plan


def position_from_timeline(*, trip_id, mode, version_id, timeline, path, now_sec):
    from mobility.motion.engine import _sample_trip_plan, _timeline_signature
    from mobility.regions import get_active_region
    progress = path.get('stop_progress') or []
    if (len(progress) != len(timeline) or len(timeline) < 2
            or any(not math.isfinite(float(p)) or float(p) < 0 for p in progress)
            or any(b < a for a, b in zip(progress, progress[1:]))):
        return None
    usable = [i for i,e in enumerate(timeline) if e.get('relationship') != 'SKIPPED']
    if len(usable) < 2:
        return None
    origin = source_start_index(timeline, now_sec)
    origin = max(usable[0], origin if origin is not None else usable[0])
    origin = min(origin, usable[-2])
    region = get_active_region()
    identity = (region.region_id, region.network_id, str(version_id or ''),
                str(path.get('service_date') or ''), str(trip_id), str(path.get('pattern_id') or ''), str(mode))
    geometry = hashlib.sha256(repr((path.get('points'), progress, path.get('derived_generation'))).encode()).hexdigest()[:16]
    signature = _timeline_signature(timeline)
    key = (*identity, geometry, signature, origin)
    now = time.monotonic()
    for old, value in list(_plans.items()):
        if now - value['at'] > CACHE_SECONDS:
            _plans.pop(old, None)
    cached = _plans.get(key)
    if cached is None:
        plan = _build(timeline, progress, mode, origin)
        if not plan:
            return None
        size = sum(len(s.get('trajectory', {}).get('segments', [])) for s in plan['segments'])
        cached = dict(plan=plan, at=now, segments=size)
        if size <= MAX_TRAJECTORY_SEGMENTS:
            _plans[key] = cached
            while (len(_plans) > MAX_PLANS
                   or sum(value['segments'] for value in _plans.values()) > MAX_TRAJECTORY_SEGMENTS):
                _plans.popitem(last=False)
        from mobility.source_diagnostics import record_source_event
        record_source_event(dict(kind='TIMELINE_FALLBACK_REFRESH', region_id=region.region_id,
            network_id=region.network_id, version_id=str(version_id or ''),
            service_date=str(path.get('service_date') or ''), trip_id=str(trip_id),
            pattern_id=str(path.get('pattern_id') or ''), source_signature=signature,
            timeline=[[e.get('stop_id'), e.get('stop_sequence'), e['predicted_arrival'], e['predicted_departure']]
                      for e in timeline],
            model_timeline=[[e.get('stop_id'), e.get('stop_sequence'), e['predicted_arrival'], e['predicted_departure']]
                            for e in plan['effective_timeline']]))
    else:
        _plans.move_to_end(key)
    plan = cached['plan']
    effective = plan['effective_timeline']
    sample = _sample_trip_plan(plan, now_sec, effective, progress)
    if not sample:
        return None
    index = int(sample['next_timeline_index'])
    revision = hashlib.sha256(repr(key).encode()).hexdigest()[:20]
    correction_token = hashlib.sha256(repr((identity, geometry, signature)).encode()).hexdigest()[:24]
    return {**sample, 'motion_available': True, 'effective_timeline': [dict(e) for e in effective],
        'motion_plan_revision': 'timeline:' + revision,
        'estimate_revision': estimate_revision(identity, 'timeline:' + correction_token),
        'motion_model': 'TIMELINE_SPEED_ENVELOPE', 'motion_quality': 'TIMELINE_CONSTRAINED_FALLBACK',
        'distance_to_next_stop_m': max(0, progress[index] - sample['progress_m']),
        'source_correction': None, 'signal_stop_count': 0, 'traffic_edge_count': 0}
