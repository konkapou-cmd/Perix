"""Optical delay allocation at upcoming topology, never a congestion diagnosis."""
import math
from mobility.motion.common import sample_trajectory, trajectory_time_at_progress


def relative_profile(profile, visual, *, reference_peak=None):
    """Keep the existing solver's spatial envelope in dimensionless levels 1–6.

    Physical solver/configuration units remain untouched. Only this optical
    copy is normalized; endpoint ramps may pass below level 1 on their way to
    an authorized station zero. Intermediate levels, including 4, are continuous.
    """
    segments = profile.get('segments') or []
    if not segments:
        return profile
    peak = reference_peak if reference_peak is not None else max(max(s['v0'], s['v1']) for s in segments)
    if peak <= 0:
        return profile
    points = [segments[0]['p0']] + [s['p1'] for s in segments]
    speeds = [segments[0]['v0']] + [s['v1'] for s in segments]
    speeds = [0.0 if v <= 1e-9 else max(1.0, min(6.0, 6*v/peak)) for v in speeds]
    rate = max(0.01, float(visual['relative_motion_rate_per_s']))
    for i in range(1, len(points)):
        speeds[i] = min(speeds[i], math.sqrt(speeds[i-1]**2+2*rate*(points[i]-points[i-1])))
    for i in range(len(points)-2, -1, -1):
        speeds[i] = min(speeds[i], math.sqrt(speeds[i+1]**2+2*rate*(points[i+1]-points[i])))
    result, elapsed = [], 0.0
    for i, original in enumerate(segments):
        distance = points[i+1]-points[i]
        if distance <= 0 or speeds[i]+speeds[i+1] <= 0:
            return profile  # Do not fabricate a missing moving phase.
        duration = 2*distance/(speeds[i]+speeds[i+1])
        result.append({**original, 't0': elapsed, 't1': elapsed+duration,
                       'v0': speeds[i], 'v1': speeds[i+1]})
        elapsed += duration
    return {**profile, 'segments': result, 'duration_s': elapsed,
            'relative_motion_levels': [1, 2, 3, 4, 5, 6]}


def topology_neighbors(infra):
    result = {}
    for edge in infra.get('edges') or []:
        a, b = edge.get('from_node'), edge.get('to_node')
        if a is not None and b is not None:
            result.setdefault(a, set()).add(b)
            result.setdefault(b, set()).add(a)
    return result


def bounded_infrastructure(infra, start, end):
    # Directed-turn sampling uses a 20 m bearing window. Retain that padding
    # and original edge order, but do not rescan an entire route for every leg.
    return {**infra, 'edges': [e for e in infra.get('edges') or []
        if float(e['to_m']) >= start-20 and float(e['from_m']) <= end+20]}


def remaining_profile(plan, index, parameters):
    from mobility.motion.bus import build_bus_leg
    from mobility.motion.tram import build_tram_leg
    from mobility.motion.engine import _spatial_slowdown_priors
    recipe = plan['context_recipe']
    full_infra, config = recipe['infrastructure'], recipe['config']
    start, end = parameters['start_m'], plan['stop_progress'][index+1]
    infra = bounded_infrastructure(full_infra, start, end)
    traffic = recipe['traffic_by_leg'][index]
    neighbors = recipe.get('_topology_neighbors')
    if neighbors is None: neighbors = topology_neighbors(full_infra)
    priors = _spatial_slowdown_priors(infra, recipe['mode'], start, end, traffic, config,
        topology_neighbors=neighbors)
    kwargs = dict(edges=infra.get('edges') or [], signals=[], start_m=start, end_m=end,
        departure_service_s=0, config=config, slowdowns=priors,
        initial_speed_kmh=parameters['initial_speed_kmh'], slowdown_strength=parameters['strength'])
    profile = (build_tram_leg(**kwargs) if recipe['mode'] == 'tram'
               else build_bus_leg(**kwargs, traffic_by_edge=traffic))
    # A stronger remaining-tail shape must not pick a different level unit and
    # silently change its starting speed. All revisions share the leg's baseline.
    reference = recipe['physical_profiles'][index]
    peak = max(max(s['v0'], s['v1']) for s in reference['segments'])
    return relative_profile(profile, config['visual'], reference_peak=peak), priors


def allocate_visual_delay(plan, previous, *, index, now_s, progress_m):
    """Return reproducible remaining-profile parameters on a later forecast.

    Only an already departed leg uses road slowing. Future-leg surplus belongs
    to station waiting and must never be charged again by this allocator.
    """
    if not plan.get('context_recipe'):
        return None
    old, new = previous['legs'][index], plan['legs'][index]
    if now_s <= old['departure_s'] or now_s <= new['departure_s']:
        return None
    old_window, new_window = old['arrival_s']-now_s, new['arrival_s']-now_s
    if old_window <= 0 or new_window <= old_window or progress_m >= new['end_m']:
        return None
    # km/h below is only a solver recipe input from the untouched physical
    # envelope, never a renamed relative level or a published visual speed.
    reference = plan['context_recipe']['physical_profiles'][index]
    peak = max(max(s['v0'], s['v1']) for s in reference['segments'])
    old_profile = old['profile']
    instant = sample_trajectory(old_profile, trajectory_time_at_progress(old_profile, progress_m))
    initial_level = instant['speed_kmh']/3.6
    parameters = dict(start_m=progress_m, initial_speed_kmh=initial_level*peak/6*3.6,
        strength=max(plan['visual_context']['spatial_strength'],
                     (old.get('profile_parameters') or {}).get('strength', 0)))
    free, priors = remaining_profile(plan, index, parameters)
    if not priors or not free.get('segments'):
        return None
    low, high = parameters['strength'], 1.0
    target = free['duration_s'] * new_window / old_window
    maximum, _ = remaining_profile(plan, index, {**parameters, 'strength': high})
    if maximum['duration_s'] <= target:
        return {**parameters, 'strength': high}
    for _ in range(12):
        mid = (low+high)/2
        candidate, _ = remaining_profile(plan, index, {**parameters, 'strength': mid})
        if candidate['duration_s'] < target:
            low = mid
        else:
            high = mid
    return {**parameters, 'strength': (low+high)/2}
