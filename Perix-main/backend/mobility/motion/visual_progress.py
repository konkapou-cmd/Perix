"""Time-normalized visual progress, NOT a physical vehicle position solver.

Existing legal bus/tram trajectories supply the shape of the progress curve.
Source clocks supply its duration. Compression is explicitly visual and never
changes provider clocks, physical speed limits or the existing physics sampler.
Passenger integration is separately opt-in via MOBILITY_VISUAL_PROGRESS_ENABLED.
"""
from copy import deepcopy
import hashlib
import json
import math

from mobility.motion.common import sample_trajectory, trajectory_time_at_progress
from mobility.motion.config import STATION_CYCLE_STOP_LEAD_S, STATION_CYCLE_APPROACH_LEAD_S


def _number(value):
    return type(value) in (int, float) and math.isfinite(value)


def _profile_valid(profile, start, end):
    if not isinstance(profile, dict) or not _number(profile.get('duration_s')) or profile['duration_s'] <= 0:
        return False
    segments = profile.get('segments')
    if not isinstance(segments, list) or not segments:
        return False
    t, p = 0.0, start
    for s in segments:
        if not isinstance(s, dict) or any(not _number(s.get(k)) for k in ('t0', 't1', 'p0', 'p1', 'v0', 'v1')):
            return False
        if (abs(s['t0']-t) > 1e-5 or s['t1'] <= s['t0'] or abs(s['p0']-p) > 0.01
                or s['p1'] < s['p0'] or min(s['v0'], s['v1']) < 0):
            return False
        if abs((s['v0']+s['v1'])/2*(s['t1']-s['t0'])-(s['p1']-s['p0'])) > 0.02:
            return False
        t, p = s['t1'], s['p1']
    return abs(t-profile['duration_s']) <= 1e-5 and abs(p-end) <= 0.01


def copy_visual_plan(plan):
    """Copy mutable clock/leg records, sharing read-only trajectory recipes.

    Sampling never mutates profiles/infrastructure. Overrides replace a leg's
    profile rather than modifying template segments. Avoid copying an entire
    route's OSM infrastructure on every ordinary passenger poll.
    """
    return {**plan, 'wait_state': deepcopy(plan.get('wait_state', {})),
            'cycle_arrival_overrides': dict(plan.get('cycle_arrival_overrides', {})),
            'timeline': [dict(e) for e in plan['timeline']],
            'legs': [dict(leg) for leg in plan['legs']]}


def station_cycle_timing(plan):
    """The published optical policy is also a cache/shared-state boundary."""
    parameters = plan.get('visual_parameters') or {}
    stop = parameters.get('station_stop_lead_s', STATION_CYCLE_STOP_LEAD_S)
    approach = parameters.get('station_approach_lead_s', STATION_CYCLE_APPROACH_LEAD_S)
    if not _number(stop) or not _number(approach) or stop <= 0 or approach < stop:
        raise ValueError('Invalid optical station-cycle timing policy')
    return float(stop), float(approach)


def apply_station_cycles(plan):
    """Derive optical windows from accepted clocks, never overwrite the source."""
    if plan.get('visual_rule_version') != 'station-cycle-v2':
        return plan
    result = copy_visual_plan(plan)
    stop_lead, approach_lead = station_cycle_timing(plan)
    cycles = []
    for i, entry in enumerate(result['timeline']):
        wait = result.get('wait_state', {}).get(str(i), {})
        departure = max(entry['predicted_departure'], wait.get('modeled_departure_s', entry['predicted_departure']))
        arrival = min(entry['predicted_arrival'], entry['predicted_departure']-stop_lead)
        if str(i) in result.get('cycle_arrival_overrides', {}):
            arrival = min(arrival, result['cycle_arrival_overrides'][str(i)])
        limited = False
        if i and arrival <= cycles[i-1]['modeled_departure_s']:
            arrival = entry['predicted_arrival']
            limited = True
        approach = min(arrival, max(cycles[i-1]['modeled_departure_s'] if i else arrival, entry['predicted_departure']-approach_lead))
        limited = limited or approach > entry['predicted_departure']-approach_lead or str(i) in result.get('cycle_arrival_overrides', {})
        cycles.append(dict(stop_occurrence_index=i, stop_id=entry['stop_id'],
            modeled_arrival_s=arrival, modeled_departure_s=departure, approach_started_s=approach,
            release_condition=wait.get('release_condition', 'KNOWN_DEPARTURE'),
            departure_basis='MODELED_WAIT' if departure > entry['predicted_departure'] else
                'SOURCE_EVENT_REFERENCE' if entry['predicted_arrival'] == entry['predicted_departure'] else 'SOURCE_DEPARTURE',
            cycle_limited=limited))
    for i, leg in enumerate(result['legs']):
        leg['departure_s'] = cycles[i]['modeled_departure_s']
        leg['arrival_s'] = cycles[i+1]['modeled_arrival_s']
        if leg['arrival_s'] <= leg['departure_s']:
            leg['hidden_reason'] = 'NO_POSITIVE_MODELED_WINDOW'
    result['station_cycles'] = cycles
    return result


def station_cycle_metadata(plan, index, now_s, sampled_at_ms):
    if not plan.get('station_cycles'):
        return {}
    cycle = plan['station_cycles'][index]
    at = lambda value: sampled_at_ms+(value-now_s)*1000
    conditional = cycle['release_condition'] == 'RELEVANT_SOURCE_UPDATE'
    return dict(stop_occurrence_index=index, stop_id=cycle['stop_id'],
        modeled_arrival_at_ms=at(cycle['modeled_arrival_s']),
        modeled_departure_at_ms=at(cycle['modeled_departure_s']),
        approach_started_at_ms=at(cycle['approach_started_s']),
        countdown_event='WAITING_FOR_SOURCE_UPDATE' if conditional else 'DEPARTURE',
        countdown_target_at_ms=None if conditional else at(cycle['modeled_departure_s']),
        release_condition=cycle['release_condition'], departure_basis=cycle['departure_basis'],
        incoming_leg_available=index == 0 or plan['legs'][index-1]['hidden_reason'] is None,
        outgoing_leg_available=index == len(plan['legs']) or plan['legs'][index]['hidden_reason'] is None,
        cycle_limited=cycle['cycle_limited'])


def build_visual_plan(*, identity, timeline, stop_progress, profiles, share_profiles=False):
    """One profile per consecutive stop occurrence, None for unknown geometry.

    identity must bind region/network/version/day/trip/pattern/geometry; caller
    validates provenance, freshness and closures before supplying profiles.
    No database access, inferred routing or fabricated missing-leg connection.
    """
    required = {'region_id', 'network_id', 'version_id', 'service_date', 'trip_id', 'pattern_id', 'geometry_fingerprint'}
    if (not isinstance(identity, dict) or set(identity) != required
            or any(not isinstance(v, str) or not v for v in identity.values())):
        raise ValueError('Exact visual journey and geometry identity required')
    if (not isinstance(timeline, list) or len(timeline) < 2 or len(stop_progress) != len(timeline)
            or not isinstance(profiles, list) or len(profiles) != len(timeline)-1):
        raise ValueError('Aligned source occurrences, progress and profiles required')
    previous_departure = None
    previous_sequence = -1
    for e, p in zip(timeline, stop_progress):
        if (not isinstance(e, dict) or not isinstance(e.get('stop_id'), str) or not e['stop_id']
                or type(e.get('stop_sequence')) is not int or e['stop_sequence'] <= previous_sequence
                or not _number(p) or p < 0
                or any(not _number(e.get(k)) for k in ('predicted_arrival', 'predicted_departure'))
                or e['predicted_departure'] < e['predicted_arrival']
                or (previous_departure is not None and e['predicted_arrival'] < previous_departure)
                or e.get('prediction_basis') == 'PERIX_MOTION_PLAN'
                or e.get('timing_order_adjusted')):
            raise ValueError('Invalid or model-adjusted source timeline')
        previous_departure, previous_sequence = e['predicted_departure'], e['stop_sequence']
    if any(b <= a for a, b in zip(stop_progress, stop_progress[1:])):
        raise ValueError('Strictly increasing geometry progress required')
    legs = []
    for i, profile in enumerate(profiles):
        a, b = timeline[i], timeline[i+1]
        start, end = stop_progress[i:i+2]
        reason = None
        if any(e.get('relationship') in ('SKIPPED', 'NO_DATA') for e in (a, b)):
            reason = 'SOURCE_OCCURRENCE_UNAVAILABLE'
        elif b['predicted_arrival'] <= a['predicted_departure']:
            reason = 'NO_POSITIVE_SOURCE_WINDOW'
        elif not _profile_valid(profile, start, end):
            reason = 'GEOMETRY_OR_PROFILE_UNAVAILABLE'
        legs.append({'from_index': i, 'to_index': i+1, 'start_m': start, 'end_m': end,
                     'departure_s': a['predicted_departure'], 'arrival_s': b['predicted_arrival'],
                      'profile': (profile if share_profiles else deepcopy(profile)) if reason is None else None,
                     'hidden_reason': reason, 'profile_start_s': 0.0})
    signature = hashlib.sha256(json.dumps([identity, timeline, legs], sort_keys=True,
                                         allow_nan=False, separators=(',', ':')).encode()).hexdigest()[:24]
    return {'identity': dict(identity), 'revision': 'visual:'+signature,
            'timeline': deepcopy(timeline), 'stop_progress': list(stop_progress), 'legs': legs,
            'position_assurance': 'TIME_NORMALIZED_VISUAL_ESTIMATE',
            'physical_speed_assurance': False}


def _sample_leg(leg, now_s):
    if leg['hidden_reason']:
        return None
    duration = leg['arrival_s']-leg['departure_s']
    fraction = min(1.0, max(0.0, (now_s-leg['departure_s'])/duration))
    profile = leg['profile']
    virtual_time = leg['profile_start_s'] + fraction*(profile['duration_s']-leg['profile_start_s'])
    if now_s >= leg['arrival_s']:
        return leg['end_m']
    if now_s <= leg['departure_s']:
        return leg['start_m']
    return min(leg['end_m'], max(leg['start_m'], sample_trajectory(profile, virtual_time)['progress_m']))


def sample_visual_plan(plan, now_s):
    """ETA and progress use one source clock. Never publish physical speed/GPS."""
    if not _number(now_s):
        raise ValueError('Finite service clock required')
    timeline = plan['timeline']
    cycles = plan.get('station_cycles')
    if now_s < (cycles[0]['modeled_arrival_s'] if cycles else timeline[0]['predicted_arrival']) or now_s > timeline[-1]['predicted_departure']:
        return None
    for i, entry in enumerate(timeline):
        wait = plan.get('wait_state', {}).get(str(i))
        departure = max(entry['predicted_departure'], (wait or {}).get('modeled_departure_s', entry['predicted_departure']))
        conditional = wait and wait['release_condition'] == 'RELEVANT_SOURCE_UPDATE'
        arrival = cycles[i]['modeled_arrival_s'] if cycles else entry['predicted_arrival']
        stopped = (now_s < departure or (i == len(timeline)-1 and now_s == departure)) if cycles else now_s <= departure
        if arrival <= now_s and (stopped or conditional):
            # Unknown neighboring geometry must not claim a known platform snap.
            relevant = [leg for leg in plan['legs'] if leg['to_index'] == i or leg['from_index'] == i]
            visible = bool(relevant) and all(leg['hidden_reason'] is None for leg in relevant)
            return _packet(plan, i, max(0,math.ceil(entry['predicted_arrival']-now_s)) if cycles else 0, plan['stop_progress'][i] if visible else None,
                           'VISUAL_STOP_ESTIMATE' if visible else 'GEOMETRY_UNKNOWN', now_s)
        if i+1 < len(timeline) and (departure <= now_s if cycles else departure < now_s) and now_s < (cycles[i+1]['modeled_arrival_s'] if cycles else timeline[i+1]['predicted_arrival']):
            leg = plan['legs'][i]
            return _packet(plan, i+1, max(0,math.ceil(timeline[i+1]['predicted_arrival']-now_s)) if cycles else math.ceil(leg['arrival_s']-now_s), _sample_leg(leg, now_s),
                           'VISUAL_MOVING' if leg['hidden_reason'] is None else leg['hidden_reason'], now_s)
    return None


def _packet(plan, index, eta, progress, state, now_s):
    wait = deepcopy(plan.get('wait_state', {}).get(str(index))) if state == 'VISUAL_STOP_ESTIMATE' else None
    if wait:
        until = now_s if wait['release_condition'] == 'RELEVANT_SOURCE_UPDATE' else min(now_s, wait['modeled_departure_s'])
        wait['waited_s'] = max(0, until-wait['wait_started_s'])
    return {'progress_m': progress, 'marker_visible': progress is not None,
            'next_timeline_index': index, 'next_stop_id': plan['timeline'][index]['stop_id'],
            'next_stop_eta_seconds': eta, 'state': state, 'revision': plan['revision'],
            'position_assurance': plan['position_assurance'], 'physical_speed_assurance': False,
            'observed_arrival': False, 'prediction_basis': 'SOURCE_TIMELINE',
             'speed_kmh': None, 'wait_state': wait}


def visual_preview(plan, sample, *, now_s, sampled_at_ms, journey_id, horizon_s=8):
    """Schema 2: exact phases through authorized directed stop occurrences."""
    if not sample or not sample['marker_visible']:
        return None
    horizon_s = min(45, max(0, float(horizon_s)))
    phase_limit = 128 if horizon_s > 8 else 32
    index = sample['next_timeline_index']
    entry = plan['timeline'][index]
    phases = []
    end = min(now_s+horizon_s, plan['timeline'][-1]['predicted_departure'])
    if not plan.get('visual_rule_version'):
        # Direct legacy callers have not opted into occurrence-aware semantics.
        boundary = (entry['predicted_departure'] if sample['state'] == 'VISUAL_STOP_ESTIMATE'
                    else plan['legs'][index-1]['arrival_s'])
        end = min(end, boundary)

    def append(phase, occurrence, start_m, stop_m, arrival_s):
        phase.update(stop_occurrence_index=occurrence, start_progress_m=start_m, stop_progress_m=stop_m,
                     effective_arrival_at_ms=sampled_at_ms+(plan['timeline'][occurrence]['predicted_arrival']-now_s)*1000)
        if plan.get('station_cycles'):
            phase['station_cycle'] = station_cycle_metadata(plan, occurrence, now_s, sampled_at_ms)
        prior = phases[-1] if phases else None
        if (abs(phase['t0']-(prior['t1'] if prior else 0)) > 1e-5
                or (prior and abs(prior['p1']-phase['p0']) > 0.1)):
            return False
        if (prior and prior['stop_occurrence_index'] == occurrence and prior['state'] == phase['state']
                and abs(prior['a']-phase['a']) < 1e-8
                and abs(prior['t1']-phase['t0']) < 1e-6
                and abs(prior['p1']-phase['p0']) < 1e-5
                and abs(prior['v0']+prior['a']*(prior['t1']-prior['t0'])-phase['v0']) < 1e-6):
            prior['t1'], prior['p1'] = phase['t1'], phase['p1']
            prior['relative_motion_level1'] = phase['relative_motion_level1']
            return True
        if len(phases) >= phase_limit:
            return False
        phases.append(phase)
        return True

    for i, current in enumerate(plan['timeline']):
        wait = plan.get('wait_state', {}).get(str(i), {})
        departure = max(current['predicted_departure'], wait.get('modeled_departure_s', current['predicted_departure']))
        conditional = wait.get('release_condition') == 'RELEVANT_SOURCE_UPDATE'
        stop_end = end if conditional else min(end, departure)
        start = max(now_s, plan['station_cycles'][i]['modeled_arrival_s'] if plan.get('station_cycles') else current['predicted_arrival'])
        if stop_end > start:
            relevant = [l for l in plan['legs'] if l['from_index'] == i or l['to_index'] == i]
            if not relevant or any(l['hidden_reason'] for l in relevant):
                break
            p = plan['stop_progress'][i]
            if not append(dict(t0=start-now_s, t1=stop_end-now_s, p0=p, p1=p, v0=0, a=0,
                               relative_motion_level0=0, relative_motion_level1=0, state='VISUAL_STOP_ESTIMATE'),
                          i, p, p, current['predicted_arrival']):
                break
        if conditional or departure >= end or i >= len(plan['legs']):
            break
        leg = plan['legs'][i]
        if leg['arrival_s'] <= now_s:
            continue
        if leg['hidden_reason'] or leg['profile_start_s'] >= leg['profile']['duration_s']:
            break
        scale = (leg['arrival_s']-leg['departure_s'])/(leg['profile']['duration_s']-leg['profile_start_s'])
        for segment in leg['profile']['segments']:
            t0 = leg['departure_s']+(segment['t0']-leg['profile_start_s'])*scale
            t1 = leg['departure_s']+(segment['t1']-leg['profile_start_s'])*scale
            if t0 >= end:
                break
            start, stop = max(now_s, t0, leg['departure_s']), min(end, t1, leg['arrival_s'])
            if stop <= start:
                continue
            acceleration = (segment['v1']-segment['v0'])/(segment['t1']-segment['t0'])/scale**2
            v0 = segment['v0']/scale
            dt = start-t0
            p0 = segment['p0']+v0*dt+0.5*acceleration*dt**2
            velocity = v0+acceleration*dt
            duration = stop-start
            phase = dict(t0=start-now_s, t1=stop-now_s, p0=p0,
                p1=p0+velocity*duration+0.5*acceleration*duration**2, v0=velocity,
                a=acceleration, state='VISUAL_MOVING',
                relative_motion_level0=velocity*scale,
                relative_motion_level1=(velocity+acceleration*duration)*scale)
            if not append(phase, i+1, leg['start_m'], leg['end_m'], leg['arrival_s']):
                break
        if len(phases) >= phase_limit or (phases and phases[-1]['t1'] >= horizon_s):
            break
    if not phases or abs(phases[0]['p0']-sample['progress_m']) > 0.1:
        return None
    actual_end = now_s+phases[-1]['t1']
    coverage_end_reason = ('SOURCE_TRIP_END' if abs(actual_end-plan['timeline'][-1]['predicted_departure']) < 1e-5
        else 'AUTHORIZED_HORIZON' if abs(actual_end-(now_s+horizon_s)) < 1e-5
        else 'PHASE_LIMIT' if len(phases) >= phase_limit else 'GEOMETRY_OR_SOURCE_BOUNDARY')
    return dict(schema=2, semantics='TIME_NORMALIZED_VISUAL_ESTIMATE', physical_speed_assurance=False,
        coverage_end_reason=coverage_end_reason,
        revision=plan['revision'], journey_id=journey_id, pattern_id=plan['identity']['pattern_id'],
        approach_geometry_fingerprint=plan['identity']['geometry_fingerprint'], sampled_at_ms=sampled_at_ms,
        valid_until_ms=sampled_at_ms+phases[-1]['t1']*1000, stop_occurrence_index=index,
        stop_progress_m=plan['stop_progress'][index],
        effective_arrival_at_ms=sampled_at_ms+(entry['predicted_arrival']-now_s)*1000, phases=phases,
        visual_rule_version=plan.get('visual_rule_version'), visual_parameters=plan.get('visual_parameters'),
        stop_progress_by_occurrence_m=list(plan['stop_progress']),
        station_window=[station_cycle_metadata(plan, i, now_s, sampled_at_ms) for i in range(
            max(0,index-1) if sample['state'] == 'VISUAL_MOVING' else index,
            min(len(plan['timeline']), (max(0,index-1) if sample['state'] == 'VISUAL_MOVING' else index)+3))]
            if plan.get('station_cycles') else None)


def bound_visual_preview(preview, horizon_s=8, *, occurrence_aware=False):
    """Client opt-in changes the publication horizon, never source clocks.

    Old clients retain their original 8 s / 32 phase contract. The longer
    exact schema-2 curve is bounded by each authorized occurrence, not extrapolated.
    """
    if not preview or preview.get('schema') != 2:
        return preview
    horizon = 45 if horizon_s == 45 else 8
    limit = 128 if horizon == 45 else 32
    phases = []
    legacy_state = (preview.get('phases') or [{}])[0].get('state')
    for original in preview.get('phases') or []:
        if original['t0'] >= horizon or len(phases) >= limit:
            break
        if (not occurrence_aware and preview.get('stop_occurrence_index') is not None
                and original.get('stop_occurrence_index', preview['stop_occurrence_index'])
                != preview['stop_occurrence_index']):
            break  # Cached/legacy clients retain their original single-stop contract.
        if not occurrence_aware and original.get('state') != legacy_state:
            break  # Legacy moving windows end at arrival; dwell is a separate publication.
        phase = dict(original)
        if phase['t1'] > horizon:
            fraction = (horizon-phase['t0'])/(phase['t1']-phase['t0'])
            if 'relative_motion_level0' in phase:
                phase['relative_motion_level1'] = phase['relative_motion_level0']+fraction*(
                    phase['relative_motion_level1']-phase['relative_motion_level0'])
            phase['t1'] = horizon
            dt = phase['t1']-phase['t0']
            phase['p1'] = phase['p0']+phase['v0']*dt+0.5*phase['a']*dt*dt
        phases.append(phase)
    if not phases:
        return None
    return {**preview, 'phases': phases,
            'coverage_end_reason': preview.get('coverage_end_reason') if phases[-1]['t1'] == preview['phases'][-1]['t1'] else 'CLIENT_HORIZON',
            'valid_until_ms': preview['sampled_at_ms']+phases[-1]['t1']*1000}


def rebase_visual_leg(plan, *, index, now_s, displayed_progress_m, expected_identity):
    """Keep the displayed point on an updated SAME leg, fit its remaining tail.

    Updated arrival must be in the future. If already due, hide/re-sync rather
    than promise both exact arrival and jump-free motion. Caller handles that
    explicit None result; no source clock is rewritten.
    """
    if (plan['identity'] != expected_identity or type(index) is not int or not 0 <= index < len(plan['legs'])
            or not _number(now_s) or not _number(displayed_progress_m)):
        return None
    leg = plan['legs'][index]
    if (leg['hidden_reason'] or not leg['departure_s'] <= now_s < leg['arrival_s']
            or not leg['start_m'] <= displayed_progress_m <= leg['end_m']):
        return None
    updated = copy_visual_plan(plan)
    target = updated['legs'][index]
    target['profile_start_s'] = trajectory_time_at_progress(target['profile'], displayed_progress_m)
    target['start_m'] = displayed_progress_m
    target['departure_s'] = now_s
    updated['revision'] = 'visual:'+hashlib.sha256(json.dumps(
        [plan['revision'], index, now_s, displayed_progress_m], allow_nan=False).encode()).hexdigest()[:24]
    return updated
