"""Provider-free rolling bus recalibration, strictly isolated shadow state.

Uses the existing bus builder, spatial speed-envelope solver, plan orchestration
and handover mathematics. Feed deadlines are constraints, never vehicle truth.
No network, provider cache, passenger state or persistence side effects here.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import date, datetime, timezone
import hashlib
import json
import math
import os

from mobility.motion.bus import build_bus_leg
from mobility.motion.common import build_speed_trajectory, remaining_trajectory, sample_trajectory
from mobility.motion.time_allocation import eligible_signals


def enabled():
    return os.getenv('MOBILITY_NATIVE_RECALIBRATION_ENABLED', 'false').lower() == 'true'


def _signature(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, allow_nan=False,
        separators=(',', ':')).encode()).hexdigest()


def _finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def construction_checks(trajectory, config, initial_speed_kmh):
    """Analytic phase checks; no claim of observed speed or legal certification."""
    faults = []
    previous = None
    for s in trajectory.get('segments', []):
        if not all(_finite(s.get(k)) for k in ('p0', 'p1', 'v0', 'v1', 't0', 't1')):
            faults.append('NONFINITE_PHASE'); continue
        ds, dt = s['p1']-s['p0'], s['t1']-s['t0']
        if ds < -1e-7 or dt <= 0 or min(s['v0'], s['v1']) < 0:
            faults.append('BACKWARD_OR_INVALID_PHASE')
        if max(s['v0'], s['v1'])*3.6 > config['max_speed_kmh']+1e-6:
            faults.append('VEHICLE_SPEED_CAP')
        if s['v1']**2 > s['v0']**2+2*config['acceleration_mps2']*ds+1e-6:
            faults.append('ACCELERATION')
        if s['v0']**2 > s['v1']**2+2*config['braking_mps2']*ds+1e-6:
            faults.append('BRAKING')
        if abs(ds-(s['v0']+s['v1'])*dt/2) > 1e-5:
            faults.append('KINEMATIC_DISTANCE')
        if previous and any(abs(s[a]-previous[b]) > 1e-6 for a, b in
                            (('p0', 'p1'), ('v0', 'v1'), ('t0', 't1'))):
            faults.append('PHASE_DISCONTINUITY')
        previous = s
    phases = trajectory.get('segments') or []
    if not phases:
        faults.append('EMPTY_TRAJECTORY')
    elif abs(phases[0]['v0']*3.6-initial_speed_kmh) > 1e-6:
        faults.append('INITIAL_SPEED_DISCONTINUITY')
    return {'physics_violations': len(faults), 'reasons': sorted(set(faults)),
            'backward_phases': sum(s['p1'] < s['p0'] for s in phases)}


def fit_remaining_leg(*, infra, start_m, end_m, initial_speed_kmh, target_s,
                      departure_service_s, config, previous_leg=None, retain_previous=False):
    """Fit a remaining leg by spatial caps, never global time stretching.

    A braking-distance transition from v0 protects the NOW boundary when cruise
    caps decrease. Existing forward/backward passes retain turn/road caps and
    stop feasibility. A signal is an unobserved alternative, not a real phase.
    """
    if not all(_finite(v) for v in (start_m, end_m, initial_speed_kmh, target_s)):
        raise ValueError('NONFINITE_RECALIBRATION_INPUT')
    if end_m <= start_m or initial_speed_kmh < 0:
        raise ValueError('INVALID_REMAINING_STATE')
    if any(not _finite(config.get(k)) or config[k] <= 0 for k in
           ('acceleration_mps2', 'braking_mps2', 'trajectory_step_m', 'max_speed_kmh')):
        raise ValueError('INVALID_NATIVE_PHYSICS_CONFIG')
    edges = [e for e in infra.get('edges', []) if e['to_m'] > start_m and e['from_m'] < end_m]
    if (not edges or edges[0]['from_m'] > start_m+0.01 or edges[-1]['to_m'] < end_m-0.01
            or any(abs(a['to_m']-b['from_m']) > .01 or
                (a.get('to_node') is not None and b.get('from_node') is not None
                 and a['to_node'] != b['from_node']) for a, b in zip(edges, edges[1:]))):
        raise ValueError('CANONICAL_CHAIN_GAP')
    events = eligible_signals(infra, 'bus', start_m, end_m,
                              float(config.get('allocation_stop_buffer_m', 20.)))
    seed = build_bus_leg(edges=edges, signals=[], traffic_by_edge={}, start_m=start_m,
        end_m=end_m, departure_service_s=departure_service_s, config=config,
        initial_speed_kmh=initial_speed_kmh, recovery_ratio=1., scenario={'refine_turns': True})
    candidates = []
    builds = 0

    def build(factor, event=None, hold=0., localized=False):
        nonlocal builds
        builds += 1
        spans = []
        turn_edges = {str(t[k]) for t in seed.get('turn_events', [])
                      for k in ('from_edge_id', 'to_edge_id')}
        for span in seed.get('speed_constraints', []):
            left = span['from_m']
            while left < span['to_m']-1e-8:
                weight = 1. if not localized or span['edge_id'] in turn_edges else .25
                cruise = max(.5, span['speed_cap_kmh']*(1.-weight*(1.-factor)))
                transition = math.sqrt(max(0., (initial_speed_kmh/3.6)**2
                    - 2*config['braking_mps2']*(left-start_m)))*3.6
                right = (span['to_m'] if transition <= cruise else
                         min(span['to_m'], left+max(1., float(config['trajectory_step_m']))))
                spans.append({**span, 'from_m': left, 'to_m': right,
                    'speed_cap_kmh': min(span['speed_cap_kmh'], max(cruise, transition))})
                left = right
        stops = [] if event is None else [{'progress_m': event['progress_m'], 'hold_s': hold,
            'state': 'HYPOTHETICAL_SIGNAL_HOLD', 'id': event['signal_instance_id']}]
        return {**build_speed_trajectory(start_m=start_m, end_m=end_m, spans=spans,
            point_speed_caps=seed.get('turn_events', []), mandatory_stops=stops,
            acceleration_mps2=config['acceleration_mps2'], braking_mps2=config['braking_mps2'],
            step_m=config['trajectory_step_m'], initial_speed_mps=initial_speed_kmh/3.6),
            'model': 'BUS_NATIVE_RECALIBRATION_V1', 'traffic_edge_count': 0,
            'signal_stop_count': len(stops), 'speed_constraints': spans,
            'turn_events': seed.get('turn_events', [])}

    reference = build(1.)
    reference_s = reference['duration_s']
    # Baseline fitting may previously have generated an initial speed that is
    # incompatible with the new geometry/caps. Never fix it by silently clipping.
    if retain_previous or construction_checks(reference, config, initial_speed_kmh)['physics_violations']:
        if previous_leg is None:
            raise ValueError('NO_CONTINUOUS_PHYSICAL_TAIL')
        retained = remaining_trajectory(previous_leg['trajectory'],
            departure_service_s-previous_leg['t0'], previous_leg.get('time_scale', 1.))
        if (abs(retained['start_m']-start_m) > 1e-6 or
                construction_checks(retained, config, initial_speed_kmh)['physics_violations']):
            raise ValueError('RETAINED_TAIL_NOT_CONTINUOUS')
        chosen = retained
        reason = 'UNCHANGED_CURRENT_TARGET_RETAINED' if retain_previous else 'RETAINED_PREVIOUS_PHYSICAL_TAIL'
    else:
        def fit(name, event=None, localized=False):
            natural = build(1., event=event, localized=localized)
            best, factor, hold = natural, 1., 0.
            if target_s > natural['duration_s']:
                hold = min(max(0., config['road_signal_max_hold_s']), target_s-natural['duration_s']) if event else 0.
                low, high = .025, 1.
                slow = build(low, event, hold, localized)
                if slow['duration_s'] >= target_s:
                    for _ in range(16):
                        factor = (low+high)/2
                        trial = build(factor, event, hold, localized)
                        if abs(trial['duration_s']-target_s) < abs(best['duration_s']-target_s):
                            best = trial
                        if trial['duration_s'] > target_s: low = factor
                        else: high = factor
                elif abs(slow['duration_s']-target_s) < abs(best['duration_s']-target_s):
                    best = slow
            checks = construction_checks(best, config, initial_speed_kmh)
            if not checks['physics_violations']:
                extra_stops = int(event is not None)
                changes = [1 if s['v1'] > s['v0']+1e-8 else -1 for s in best['segments']
                           if abs(s['v1']-s['v0']) > 1e-8]
                candidates.append({'name': name, 'trajectory': best, 'target_error_s': best['duration_s']-target_s,
                    'hypothetical_signal_id': event['signal_instance_id'] if event else None,
                    'hold_s': hold, 'extra_stops': extra_stops,
                    'acceleration_switches': sum(a != b for a, b in zip(changes, changes[1:])),
                    'total_speed_variation_kmh': sum(abs(s['v1']-s['v0'])*3.6 for s in best['segments'])})

        fit('SMOOTH_INFERRED_SLOWDOWN')
        if seed.get('turn_events'):
            fit('TURN_WEIGHTED_HYPOTHESIS', localized=True)
        # Bounded alternatives, never infer real signal phases from ETA fit.
        for event in events[:2]: fit('POSSIBLE_SIGNAL_HOLD', event)
        if not candidates:
            raise ValueError('NO_CONTINUOUS_PHYSICAL_TAIL')
        chosen_entry = min(candidates, key=lambda c: (abs(c['target_error_s']) > .1,
            c['extra_stops'], c['acceleration_switches'], c['total_speed_variation_kmh'],
            abs(c['target_error_s']), c['name']))
        chosen = chosen_entry['trajectory']
        reason = chosen_entry['name']
    checks = construction_checks(chosen, config, initial_speed_kmh)
    samples = [max(0., target_s)*r for r in (.25, .5, .75)]
    envelope = [[min(sample_trajectory(c['trajectory'], t)['progress_m'] for c in candidates),
                 max(sample_trajectory(c['trajectory'], t)['progress_m'] for c in candidates)]
                for t in samples] if candidates else []
    error = chosen['duration_s']-target_s
    return {'trajectory': chosen, 'time_scale': 1., 'physics_limited_s': max(0., error),
        'fit': 'NATIVE_PHYSICS_LIMITED' if error > .1 else 'NATIVE_RECALIBRATED',
        'natural_duration_s': reference_s, 'fastest_duration_s': reference_s, 'recovery_ratio': 1.,
        'native_recalibration': {'shadow_only': True, 'selected': reason, 'target_error_s': error,
            'reference_remaining_s': reference_s, 'target_remaining_s': target_s,
            'inferred_slowdown_s': max(0., target_s-reference_s),
            'inferred_cause': 'UNKNOWN_NOT_OBSERVED_TRAFFIC', 'initial_speed_kmh': initial_speed_kmh,
            'remaining_distance_m': end_m-start_m, 'rebuilds': builds, **checks,
            'selection_basis': 'TARGET_FEASIBILITY_THEN_FEWEST_STOPS_AND_SPEED_MANOEUVRES',
            'candidates': [{k: v for k, v in c.items() if k != 'trajectory'} for c in candidates],
            'position_envelope_samples_m': envelope,
            'uncertainty': 'EVALUATED_SCENARIOS_NOT_CONFIDENCE_INTERVAL',
            'observed_vehicle_position': False}}


class NativeShadowSession:
    """One explicit trip instance; no passenger cache or refresh-triggered fit.

    Checkpoints are caller-owned JSON values, not automatic persistence. Source
    timestamps, freshness and ordered occurrence topology gate replacement.
    """
    def __init__(self, *, enabled_override=None, max_age_s=180., max_state_gap_s=90.):
        self.enabled = enabled() if enabled_override is None else bool(enabled_override)
        self.max_age_s, self.max_state_gap_s = max_age_s, max_state_gap_s
        self.state = None

    def checkpoint(self):
        return deepcopy(self.state)

    def restore(self, checkpoint):
        value = deepcopy(checkpoint)
        if value is not None:
            _signature(value)  # Reject non-JSON/nonfinite checkpoints.
            if (value.get('schema_v') != 1 or not isinstance(value.get('identity'), list)
                    or not isinstance(value.get('timeline'), list)
                    or not _finite(value.get('source_epoch')) or not _finite(value.get('last_service_s'))
                    or not isinstance(value.get('signature'), str)
                    or (value.get('plan') is not None and
                        (not isinstance(value['plan'], dict) or not isinstance(value.get('path'), dict)))):
                raise ValueError('INVALID_NATIVE_CHECKPOINT')
        self.state = value

    async def update(self, *, trip_id, service_date, timeline, path, bundle, source_epoch,
                     received_epoch, now_epoch, now_service_s, trip_relationship='SCHEDULED', start_time=''):
        from mobility.motion import engine
        if not self.enabled:
            return {'accepted': False, 'reason': 'NATIVE_SHADOW_DISABLED'}
        if not all(_finite(v) for v in (source_epoch, received_epoch, now_epoch, now_service_s)):
            return {'accepted': False, 'reason': 'MISSING_SOURCE_CLOCK'}
        if source_epoch > received_epoch+5 or received_epoch > now_epoch+5 or now_epoch-source_epoch > self.max_age_s:
            return self._result('STALE_OR_FUTURE_SOURCE', now_service_s)
        identity = [str(bundle.get(k) or '') for k in ('region_id', 'network_id', 'version_id', 'pattern_id', 'generation_id')]
        try:
            date.fromisoformat(service_date)
        except (TypeError, ValueError):
            return {'accepted': False, 'reason': 'INVALID_SERVICE_DATE'}
        identity += [str(trip_id), str(service_date), str(start_time)]
        try:
            identity.append(_signature([path.get('total_m'), path.get('stop_progress'),
                                        path.get('geometry_fingerprint')]))
        except (TypeError, ValueError):
            return self._result('INVALID_CANONICAL_PROGRESS', now_service_s)
        old = self.state
        if old is not None and old['identity'][:-1] == identity[:-1] and old['identity'][-1] != identity[-1]:
            return self._result('CANONICAL_PATH_CHANGED_WITHIN_GENERATION', now_service_s)
        same = old is not None and old['identity'] == identity
        if same and (now_service_s < old['last_service_s'] or source_epoch < old['source_epoch']):
            return self._result('OUT_OF_ORDER', now_service_s)
        if str(trip_relationship).upper() in ('CANCELED', 'DELETED'):
            if same and source_epoch == old['source_epoch'] and old.get('signature') != 'CANCELED':
                return self._result('CONFLICTING_SAME_TIMESTAMP', now_service_s)
            self.state = {'schema_v': 1, 'identity': identity, 'source_epoch': source_epoch,
                'last_service_s': now_service_s, 'plan': None, 'timeline': [], 'signature': 'CANCELED'}
            return {'accepted': True, 'reason': 'CANCELED', 'sample': None}
        if str(trip_relationship).upper() != 'SCHEDULED':
            return self._result('UNSUPPORTED_TRIP_RELATIONSHIP', now_service_s)
        if not timeline or len(timeline) != len(path.get('stop_progress', [])):
            return self._result('INVALID_STOP_TOPOLOGY', now_service_s)
        progress = path.get('stop_progress', [])
        if any(not _finite(p) for p in progress) or any(b < a for a, b in zip(progress, progress[1:])):
            return self._result('INVALID_CANONICAL_PROGRESS', now_service_s)
        sequences = [e.get('stop_sequence') for e in timeline]
        if any(type(s) is not int for s in sequences) or sequences != sorted(set(sequences)):
            return self._result('AMBIGUOUS_STOP_SEQUENCE', now_service_s)
        if any(not _finite(e.get(k)) for e in timeline for k in ('predicted_arrival', 'predicted_departure')):
            return self._result('INVALID_PREDICTION', now_service_s)
        if any(e['predicted_departure'] < e['predicted_arrival'] for e in timeline):
            return self._result('CONTRADICTORY_ARRIVAL_DEPARTURE', now_service_s)
        signature = _signature([[e.get(k) for k in ('stop_id', 'stop_sequence', 'predicted_arrival',
            'predicted_departure', 'relationship', 'prediction_basis')] for e in timeline])
        if same and source_epoch == old['source_epoch'] and signature != old['signature']:
            return self._result('CONFLICTING_SAME_TIMESTAMP', now_service_s)
        if same and old.get('plan') and signature == old['signature']:
            old['source_epoch'] = source_epoch
            old['last_service_s'] = now_service_s
            return self._result('UNCHANGED_PREDICTION_NO_REBUILD', now_service_s, accepted=True)
        previous_plan, handover, history_index = None, None, None
        reason = 'COLD_START_NO_PREVIOUS_STATE' if old is None else 'IDENTITY_RESET_NO_CONTINUITY_CLAIM'
        if same and old.get('plan'):
            if now_service_s-old['last_service_s'] > self.max_state_gap_s:
                return self._result('STATE_GAP_REQUIRES_RESEED', now_service_s)
            if [(e['stop_id'], e['stop_sequence']) for e in timeline] != [(e['stop_id'], e['stop_sequence']) for e in old['timeline']]:
                return self._result('CHANGED_STOP_TOPOLOGY', now_service_s)
            sample = engine._sample_trip_plan(old['plan'], now_service_s, old['timeline'], path['stop_progress'])
            next_index = int(sample['next_timeline_index'])
            relevant_start = next_index
            if sample['motion_state'] in ('DWELL', 'AT_STOP'):
                next_index += 1
            next_entry = next((e for e in timeline[next_index:] if e.get('relationship') != 'SKIPPED'), {})
            relevant = lambda rows: [[e.get(k) for k in ('stop_id', 'stop_sequence', 'predicted_arrival',
                'predicted_departure', 'relationship', 'prediction_basis')] for e in rows[relevant_start:]]
            if relevant(timeline) == relevant(old['timeline']):
                old.update(source_epoch=source_epoch, last_service_s=now_service_s,
                           signature=signature, timeline=deepcopy(timeline))
                return self._result('COMPLETED_TARGETS_ONLY_NO_REBUILD', now_service_s, accepted=True)
            if next_entry.get('relationship') == 'NO_DATA' or next_entry.get('prediction_basis') == 'SCHEDULE':
                return self._result('NO_RELIABLE_NEXT_PREDICTION', now_service_s)
            previous_plan = old['plan']
            if sample['motion_state'] in ('DWELL', 'AT_STOP'):
                history_index = int(sample['next_timeline_index'])
            else:
                # Use unrounded curve speed, not rounded public sample speed.
                leg = next(s for s in previous_plan['segments'] if s['kind'] == 'MOVE' and s['t0'] <= now_service_s < s['t1'])
                exact = sample_trajectory(leg['trajectory'], now_service_s-leg['t0'], leg.get('time_scale', 1.))
                handover = {**sample, **exact, 'service_s': now_service_s}
            reason = 'RECALIBRATED_FROM_PREVIOUS_CURVE'
        failure = {}
        plan = await engine._build_trip_plan(trip_id=trip_id, mode='bus', version_id=bundle['version_id'],
            timeline=deepcopy(timeline), path=deepcopy(path), now_local=datetime.fromtimestamp(now_epoch, timezone.utc),
            now_service_s=now_service_s, handover=handover, previous_plan=previous_plan,
            history_index=history_index, frozen_bundle=bundle, provider_free=True,
            native_recalibration=previous_plan is not None, failure=failure)
        if plan is None:
            return self._result(failure.get('reason', 'BUILD_FAILED'), now_service_s)
        self.state = {'schema_v': 1, 'identity': identity, 'source_epoch': source_epoch,
            'last_service_s': now_service_s, 'signature': signature, 'timeline': deepcopy(timeline),
            'plan': plan, 'path': deepcopy(path)}
        return self._result(reason, now_service_s, accepted=True, rebuilt=True)

    def _result(self, reason, now_service_s, accepted=False, rebuilt=False):
        from mobility.motion.engine import _sample_trip_plan
        state = self.state
        if state:
            now_service_s = max(now_service_s, state['last_service_s'])
        sample = _sample_trip_plan(state['plan'], now_service_s, state['timeline'], state['path']['stop_progress']) if state and state.get('plan') else None
        return {'accepted': accepted, 'reason': reason, 'rebuilt': rebuilt, 'shadow_only': True,
            'sample': sample, 'plan': deepcopy(state.get('plan')) if state else None}
