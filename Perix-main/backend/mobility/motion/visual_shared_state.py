"""Atomic cross-worker visual anchors; never stores a GPS position or profile.

MongoDB's unique _id and compare-and-swap revision choose one optical anchor
for a dated journey/geometry. Workers keep profile templates locally, but must
read the same accepted source clocks and anchor before publishing a sample.
"""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import hashlib
import json

from pymongo.errors import DuplicateKeyError
from mobility.motion.visual_progress import rebase_visual_leg, sample_visual_plan, copy_visual_plan, apply_station_cycles, station_cycle_timing


def _digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def _profile_signature(plan):
    if plan.get('template_signature'):
        return plan['template_signature']
    return _digest([dict(profile=l['profile'], hidden_reason=l['hidden_reason'],
                         start_m=l['start_m'], end_m=l['end_m']) for l in plan['legs']])


def _apply(plan, state):
    if (plan['identity'] != state['identity'] or plan.get('generation_id') != state.get('generation_id')
            or _profile_signature(plan) != state['profile_signature']):
        return None
    result = copy_visual_plan(plan)
    windows = state['source_windows']
    if len(windows) != len(result['timeline']):
        return None
    for entry, window in zip(result['timeline'], windows):
        if [entry['stop_id'], entry['stop_sequence']] != window[:2]:
            return None
        entry['predicted_arrival'], entry['predicted_departure'] = window[2:]
    for i, leg in enumerate(result['legs']):
        leg['departure_s'] = windows[i][3]
        leg['arrival_s'] = windows[i+1][2]
        reason = state['hidden_reasons'][i]
        if reason is None and leg['profile'] is None:
            return None
        leg['hidden_reason'] = reason
    result['wait_state'] = deepcopy(state.get('wait_state', {}))
    for occurrence, wait in result['wait_state'].items():
        index = int(occurrence)
        if index < len(result['legs']):
            result['legs'][index]['departure_s'] = wait['modeled_departure_s']
    result['cycle_arrival_overrides'] = dict(state.get('cycle_arrival_overrides', {}))
    result = apply_station_cycles(result)
    override = state.get('curve_override')
    if override:
        leg = result['legs'][override['index']]
        if override.get('profile_parameters'):
            from mobility.motion.visual_curve_context import remaining_profile
            leg['profile'], _ = remaining_profile(result, override['index'], override['profile_parameters'])
            leg['profile_parameters'] = deepcopy(override['profile_parameters'])
        for field in ('start_m', 'departure_s', 'profile_start_s'):
            leg[field] = override[field]
    result['revision'] = state['visual_revision']
    return result


async def resolve_shared_visual_plan(plan, collection, *, source_order, now_s):
    """Return the accepted same-source plan, or None on stale/conflicting data.

    source_order is (trip-update epoch or 0, feed-generation epoch or 0).
    It orders already-normalized packets; a newer header is NOT evidence that
    a trip forecast is new. Equal ordering with different clocks is ambiguous
    and fails closed. Schedule-only packets use (0, 0).
    """
    if (not isinstance(source_order, (tuple, list)) or len(source_order) != 2
            or any(type(v) is not int or v < 0 for v in source_order)):
        return None
    # A replaced atomic generation is a new geometry authority even when its
    # points are unchanged (edge caps/infrastructure may have changed). Never
    # borrow old-generation rebase state or lock the new template out forever.
    scope = [plan['identity'], plan.get('generation_id'), plan.get('visual_rule_version')]
    if plan.get('visual_rule_version') == 'station-cycle-v2':
        scope.append(station_cycle_timing(plan))
    key = 'visual:'+_digest(scope)
    profiles = _profile_signature(plan)
    order = list(source_order)
    for _ in range(8):
        old = await collection.find_one({'_id': key})
        if old:
            if old['profile_signature'] != profiles:
                return None  # Code/config/profile drift is not a new source forecast.
            if old['base_revision'] == plan['revision']:
                # Even unchanged clocks advance their ordering watermark. This
                # prevents a late old request from undoing a later acceptance.
                if tuple(order) > tuple(old['source_order']):
                    result = await collection.update_one({'_id': key, 'revision': old['revision']},
                        {'$set': {'source_order': order}, '$inc': {'revision': 1}})
                    if not result.matched_count:
                        continue
                return _apply(plan, old)
            if tuple(order) <= tuple(old['source_order']):
                return None
        revised = plan
        override = None
        wait_state = deepcopy(old.get('wait_state', {})) if old else {}
        windows = [[e['stop_id'], e['stop_sequence'], e['predicted_arrival'], e['predicted_departure']]
                   for e in plan['timeline']]
        # One wait per scoped occurrence, keyed by forecasts rather than headers.
        for occurrence, wait in list(wait_state.items()):
            i = int(occurrence)
            relevant = _digest(windows[max(0, i-1):i+3])
            if (wait['release_condition'] == 'RELEVANT_SOURCE_UPDATE'
                    and relevant != wait['relevant_source_revision']):
                del wait_state[occurrence]
                if (windows[i][2] <= now_s and i+1 < len(windows) and now_s < windows[i+1][2]
                        and plan['timeline'][i].get('release_condition') != 'RELEVANT_SOURCE_UPDATE'):
                    # The accepted source update releases NOW, never retroactively
                    # starts the outgoing leg and jumps from a station anchor.
                    wait_state[occurrence] = dict(stop_occurrence_index=i, release_condition='KNOWN_DEPARTURE',
                        modeled_departure_s=max(now_s, windows[i][3]), wait_started_s=wait['wait_started_s'],
                        relevant_source_revision=relevant)
            elif (wait['release_condition'] == 'KNOWN_DEPARTURE'
                    and relevant != wait['relevant_source_revision']
                    and now_s <= wait['modeled_departure_s']):
                travel = wait.get('reference_travel_s')
                if travel and i+1 < len(windows):
                    wait['modeled_departure_s'] = max(windows[i][3], windows[i+1][2]-travel)
                else:
                    wait['modeled_departure_s'] = windows[i][3]
                if windows[i][2] <= now_s:
                    wait['modeled_departure_s'] = max(now_s, wait['modeled_departure_s'])
                wait['relevant_source_revision'] = relevant
        for i, entry in enumerate(plan['timeline']):
            # Only an explicit release condition can request conditional waiting.
            # Feed age/expected next-packet time is never evidence of a stop.
            condition = entry.get('release_condition', 'KNOWN_DEPARTURE')
            if condition not in ('KNOWN_DEPARTURE', 'RELEVANT_SOURCE_UPDATE'):
                return None
            if (str(i) not in wait_state and now_s <= entry['predicted_departure']
                    and (entry['predicted_departure'] > entry['predicted_arrival']
                         or condition == 'RELEVANT_SOURCE_UPDATE')):
                wait_state[str(i)] = dict(stop_occurrence_index=i, release_condition=condition,
                    modeled_departure_s=entry['predicted_departure'], wait_started_s=entry['predicted_arrival'],
                    relevant_source_revision=_digest(windows[max(0, i-1):i+3]))
        if old:
            for i, leg in enumerate(plan['legs']):
                before_window = old['source_windows']
                arrival_unchanged = windows[i][2] == before_window[i][2]
                later_next_arrival = windows[i+1][2] > before_window[i+1][2]
                previous_departure = max(before_window[i][3],
                    old.get('wait_state', {}).get(str(i), {}).get('modeled_departure_s', before_window[i][3]))
                # A→B is unchanged: absorb C-only lateness at B, never on A→B.
                # Once this leg has departed, preserve its anchor/road continuation.
                if arrival_unchanged and later_next_arrival and now_s <= previous_departure:
                    travel = before_window[i+1][2]-previous_departure
                    departure = max(windows[i][3], windows[i+1][2]-travel)
                    if travel > 0 and departure < windows[i+1][2]:
                        previous_wait = wait_state.get(str(i), {})
                        wait_state[str(i)] = dict(stop_occurrence_index=i,
                            release_condition=previous_wait.get('release_condition', 'KNOWN_DEPARTURE'), modeled_departure_s=departure,
                            reference_travel_s=travel,
                            wait_started_s=previous_wait.get('wait_started_s', windows[i][2]),
                            relevant_source_revision=_digest(windows[max(0, i-1):i+3]))
        else:
            # First publication can already contain C-only lateness. Use the
            # provider's dated schedule as the reference, not a physical ETA.
            for i, leg in enumerate(plan['legs']):
                a, b = plan['timeline'][i:i+2]
                if (leg['hidden_reason'] or now_s > a['predicted_departure']
                        or not isinstance(a.get('scheduled_departure'), (int, float))
                        or not isinstance(b.get('scheduled_arrival'), (int, float))):
                    continue
                travel = b['scheduled_arrival']-a['scheduled_departure']
                departure = max(a['predicted_departure'], b['predicted_arrival']-travel)
                if travel > 0 and a['predicted_departure'] < departure < b['predicted_arrival']:
                    wait_state[str(i)] = dict(stop_occurrence_index=i,
                        release_condition=wait_state.get(str(i), {}).get('release_condition', 'KNOWN_DEPARTURE'),
                        modeled_departure_s=departure, reference_travel_s=travel,
                        wait_started_s=a['predicted_arrival'],
                        relevant_source_revision=_digest(windows[max(0, i-1):i+3]))
        # Keep source_windows immutable. Modeled waiting changes only leg clocks.
        working = copy_visual_plan(plan)
        working['wait_state'] = wait_state
        working['cycle_arrival_overrides'] = dict(old.get('cycle_arrival_overrides', {})) if old else {}
        for occurrence, wait in wait_state.items():
            i = int(occurrence)
            until = now_s if wait['release_condition'] == 'RELEVANT_SOURCE_UPDATE' else min(now_s, wait['modeled_departure_s'])
            wait['waited_s'] = max(0, until-wait['wait_started_s'])
            if i < len(working['legs']):
                if wait['modeled_departure_s'] >= working['legs'][i]['arrival_s']:
                    return None  # A conflicting forecast cannot authorize a leg.
                working['legs'][i]['departure_s'] = wait['modeled_departure_s']
        working = apply_station_cycles(working)
        revised = working
        if old:
            previous = _apply(plan, old)
            before = sample_visual_plan(previous, now_s) if previous else None
            after = sample_visual_plan(working, now_s)
            if (working.get('station_cycles') and before and after and before['marker_visible'] and after['marker_visible']
                    and before['next_timeline_index'] == after['next_timeline_index']):
                occurrence = before['next_timeline_index']
                if before['state'] == 'VISUAL_STOP_ESTIMATE' and after['state'] == 'VISUAL_MOVING':
                    working['cycle_arrival_overrides'][str(occurrence)] = previous['station_cycles'][occurrence]['modeled_arrival_s']
                    working = apply_station_cycles(working)
                    revised = working
                    after = sample_visual_plan(working, now_s)
                elif (before['state'] == 'VISUAL_MOVING' and after['state'] == 'VISUAL_STOP_ESTIMATE'
                      and after['progress_m']-before['progress_m'] > .1):
                    return None  # An already due revised arrival cannot justify teleporting to the platform.
            if (before and after and before['marker_visible'] and after['marker_visible']
                    and before['next_timeline_index'] == after['next_timeline_index']
                    and after['state'] == 'VISUAL_MOVING'):
                i = after['next_timeline_index']-1
                candidate = rebase_visual_leg(working, index=i, now_s=now_s,
                    displayed_progress_m=before['progress_m'], expected_identity=plan['identity'])
                if candidate:
                    revised = candidate
                    leg = revised['legs'][i]
                    from mobility.motion.visual_curve_context import allocate_visual_delay, remaining_profile
                    curve_plan = working if working.get('station_cycles') else plan
                    parameters = allocate_visual_delay(curve_plan, previous, index=i, now_s=now_s,
                        progress_m=before['progress_m'])
                    if parameters:
                        leg['profile'], _ = remaining_profile(plan, i, parameters)
                        leg['profile_start_s'] = 0.0
                        # Same source clocks and anchor, but a different optical
                        # curve. The winning CAS parameters reproduce it exactly.
                        revised['revision'] = 'visual:'+_digest([candidate['revision'], parameters])[:24]
                    elif previous['legs'][i].get('profile_parameters'):
                        # Metadata-only/earlier forecasts do not erase the
                        # accepted shape. Re-time its remaining tail instead.
                        from mobility.motion.common import trajectory_time_at_progress
                        parameters = deepcopy(previous['legs'][i]['profile_parameters'])
                        leg['profile'] = deepcopy(previous['legs'][i]['profile'])
                        leg['profile_start_s'] = trajectory_time_at_progress(leg['profile'], before['progress_m'])
                        revised['revision'] = 'visual:'+_digest([candidate['revision'], parameters])[:24]
                    override = {k: leg[k] for k in ('start_m', 'departure_s', 'profile_start_s')}
                    override['index'] = i
                    if parameters:
                        override['profile_parameters'] = parameters
        state = dict(_id=key, identity=dict(plan['identity']), base_revision=plan['revision'],
            generation_id=plan.get('generation_id'),
            visual_rule_version=plan.get('visual_rule_version'), wait_state=wait_state,
            cycle_arrival_overrides=working.get('cycle_arrival_overrides', {}),
            profile_signature=profiles, source_order=order, revision=(old['revision']+1 if old else 1),
            source_windows=[[e['stop_id'], e['stop_sequence'], e['predicted_arrival'], e['predicted_departure']]
                            for e in plan['timeline']], curve_override=override,
            hidden_reasons=[l['hidden_reason'] for l in plan['legs']],
            visual_revision='visual:'+_digest([revised['revision'], wait_state]
                + ([working.get('cycle_arrival_overrides', {}), station_cycle_timing(working)] if working.get('station_cycles') else []))[:24],
            expires_at=datetime.now(timezone.utc)+timedelta(hours=48))
        if not old:
            try:
                await collection.insert_one(state)
                return _apply(plan, state)
            except DuplicateKeyError:
                continue
        result = await collection.replace_one({'_id': key, 'revision': old['revision']}, state)
        if result.matched_count:
            return _apply(plan, state)
    return None  # Bounded contention never returns a worker-local alternative.
