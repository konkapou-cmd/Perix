"""Bounded experiments on the existing builders, not another motion engine."""
import math
import os
from copy import deepcopy

from mobility.motion.common import sample_trajectory
from mobility.signal_semantics import build_signal_semantics


def enabled():
    return os.getenv('MOBILITY_TIME_ALLOCATION_ENABLED', 'false').lower() == 'true'


def shadow_only():
    return os.getenv('MOBILITY_TIME_ALLOCATION_SHADOW_ONLY', 'true').lower() != 'false'


def eligible_signals(infra, mode, start_m, end_m, stop_buffer_m=20.0):
    if mode != 'bus':
        return []  # No invented rail phases, including experimental scenarios.
    semantics = build_signal_semantics(infra.get('signals') or [], infra.get('edges') or [], mode=mode)
    # Require explicit direction evidence on exact directed topology. Spatial,
    # untagged and ambiguous heads remain diagnostics, never stop candidates.
    verified = [s for s in semantics['instances'] if s.get('semantic_eligible')
                and s.get('direction_status') in ('MATCH', 'BOTH') and s.get('direction_basis_edge_ids')]
    events = build_signal_semantics(verified, infra.get('edges') or [], mode=mode)['events']
    return [s for s in events if s.get('usable_for_motion')
            and start_m + stop_buffer_m < s['progress_m'] < end_m - stop_buffer_m]


def allocate(baseline, builder, target_s, *, infra, mode, start_m, end_m,
             config, initial_speed_kmh=0.0, shadow_elapsed_s=None):
    """builder(scenario, direct_evidence) rebuilds the entire physical leg.

    Arrival proximity is feasibility, not evidence for red lights. Unobserved
    stop scenarios are retained as alternatives, not selected as factual stops.
    Without observed within-leg constraints the unchanged baseline wins. Native
    rolling recalibration is evaluated separately and never requires a provider.
    """
    target = float(target_s)
    fastest = baseline.get('fastest_duration_s')
    report = {'target_s': target, 'baseline_s': baseline['natural_duration_s'],
              'fastest_s': fastest, 'slack_s': max(0., target - baseline['natural_duration_s']),
              'initial_speed_kmh': initial_speed_kmh, 'candidates': [], 'selected': 'BASELINE',
              'uncertainty': 'UNOBSERVED_WITHIN_LEG', 'fallback_reason': None}
    if baseline.get('fit') in ('EMPTY', 'PHYSICS_LIMITED'):
        report['fallback_reason'] = 'BASELINE_PHYSICS_LIMITED'
        return baseline, report
    no_stop_scenario = {'refine_turns': True}
    no_stop = builder(no_stop_scenario, {})
    if not no_stop.get('segments'):
        report['fallback_reason'] = 'NO_REBUILDABLE_TRAJECTORY'
        return baseline, report
    if fastest is None:
        report['fastest_s'] = no_stop['duration_s']

    def add(name, trajectory, extra=None):
        duration = float(trajectory.get('duration_s') or 0)
        feasible = math.isfinite(duration) and 0 < duration <= target + 1e-6
        first_speed = (trajectory.get('segments') or [{}])[0].get('v0', 0) * 3.6
        scaled_first = first_speed / max(1., target / duration) if duration > 0 else 0
        if abs(scaled_first - initial_speed_kmh) > .05:
            feasible = False
        item = {'name': name, 'duration_s': duration, 'feasible': feasible,
                'reason': 'INITIAL_SPEED_DISCONTINUITY' if abs(scaled_first - initial_speed_kmh) > .05
                    else 'FITS_EXISTING_TARGET' if feasible else 'EXCEEDS_TARGET',
                'hypothetical': True, **(extra or {})}
        item['evidence_tier'] = 1  # Geometry-based hypotheses, not observed causes.
        if feasible:
            item['progress_samples_m'] = [sample_trajectory(trajectory, target * r,
                max(1., target / duration))['progress_m'] for r in (.25, .5, .75)]
        report['candidates'].append(item)
        return feasible

    add('NO_EXTRA_STOP', no_stop)
    turns = no_stop.get('turn_events') or []
    slow_ids = sorted({e for turn in turns for e in (turn.get('from_edge_id'), turn.get('to_edge_id')) if e})
    if slow_ids:
        slowed = builder({'refine_turns': True, 'slow_edge_ids': slow_ids, 'speed_factor': .85}, {})
        add('MODELED_TURN_SLOWDOWN', slowed, {'support': 'GEOMETRY_ONLY_NOT_OBSERVED'})
    events = eligible_signals(infra, mode, start_m, end_m,
                              float(config.get('allocation_stop_buffer_m', 20.0)))
    report['eligible_signal_ids'] = [s['signal_instance_id'] for s in events]
    # At most two events, each evaluated from the same initial state and caps.
    for event in events[:2]:
        identity = event['signal_instance_id']
        stopped = builder({'refine_turns': True, 'hold_event_id': identity, 'hold_s': 0.}, {})
        physical_cost = max(0., stopped['duration_s'] - no_stop['duration_s'])
        remaining = target - stopped['duration_s']
        hold = max(0., min(remaining, float(config['road_signal_max_hold_s'])))
        candidate = builder({'refine_turns': True, 'hold_event_id': identity, 'hold_s': hold}, {})
        add('POSSIBLE_SIGNAL_STOP', candidate, {'signal_id': identity, 'stop_cost_s': physical_cost,
            'hold_s': hold, 'support': 'ELIGIBLE_LOCATION_NOT_PHASE_OBSERVATION'})
    report['fallback_reason'] = 'NO_DISTINGUISHING_EVIDENCE'
    fitted = baseline
    report['turn_events'] = turns
    report['ranked_candidates'] = [c['name'] for c in sorted(report['candidates'],
        key=lambda c: (not c['feasible'], -c['evidence_tier'], c['name']))]
    report['ranking_basis'] = 'FEASIBILITY_THEN_EVIDENCE_NOT_TARGET_PROXIMITY'
    possible = [c['progress_samples_m'] for c in report['candidates'] if c.get('feasible')]
    report['position_envelope_samples_m'] = [
        [min(p[i] for p in possible), max(p[i] for p in possible)] for i in range(3)] if possible else []
    report['allocated_duration_s'] = fitted['trajectory']['duration_s'] * fitted['time_scale']
    # Bounded comparison, including ambiguity, not independent position truth.
    report['position_delta_samples_m'] = [
        sample_trajectory(fitted['trajectory'], target * ratio, fitted['time_scale'])['progress_m']
        - sample_trajectory(baseline['trajectory'], target * ratio, baseline['time_scale'])['progress_m']
        for ratio in (.25, .5, .75)]
    report['eta_delta_s'] = report['allocated_duration_s'] - baseline['trajectory']['duration_s'] * baseline['time_scale']
    return fitted, deepcopy(report)
