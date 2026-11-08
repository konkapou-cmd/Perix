"""Opt-in visual adapter. Source clocks are read-only; anchors use shared state."""
from collections import OrderedDict
from copy import deepcopy
import hashlib
import json
import os
import time
from pymongo.errors import PyMongoError

from mobility.approach import path_fingerprint
from mobility.motion.visual_progress import build_visual_plan, sample_visual_plan, visual_preview, station_cycle_metadata

_PLANS = OrderedDict()
_TEMPLATES = OrderedDict()
MAX_PLANS = 128
MAX_SEGMENTS = 1000000


def enabled():
    return os.getenv('MOBILITY_VISUAL_PROGRESS_ENABLED', 'false').lower() == 'true'


def clear_visual_cache():
    _PLANS.clear()
    _TEMPLATES.clear()
    from mobility.motion import visual_windows
    visual_windows.clear()


async def visual_position(*, trip_id, mode, version_id, timeline, path, now_s, now_epoch, region,
                          source_order=(0, 0), state_collection=None, rule_version=None):
    """Source timeline is authoritative; missing authority hides the pin only.

    Templates are local; source revision/curve anchors are atomic shared state.
    Clients never interpolate different geometry/journey identities.
    """
    from mobility.generations import get_pattern_generation, generation_matches_path
    from mobility.motion.bus import build_bus_leg
    from mobility.motion.tram import build_tram_leg
    from mobility.motion.config import motion_config_for, visual_scale_parameters, STATION_CYCLE_STOP_LEAD_S, STATION_CYCLE_APPROACH_LEAD_S
    from mobility.motion.engine import _infra_matches_path, _spatial_slowdown_priors
    identity = dict(region_id=region.region_id, network_id=region.network_id, version_id=str(version_id or ''),
        service_date=str(path.get('service_date') or ''), trip_id=trip_id,
        pattern_id=str(path.get('pattern_id') or ''), geometry_fingerprint=path_fingerprint(path['points']))
    from mobility.direction_contract import verify_direction_contract
    direction = path.get('direction_contract')
    if (not verify_direction_contract(direction,scope=identity,
            pattern=dict(mode=mode,route_number=path.get('route_number'),
                         stop_ids=[e.get('stop_id') for e in timeline]),points=path['points'],
            geometry_fingerprint=identity['geometry_fingerprint'])
            or path.get('stop_progress') != direction.get('stop_progress_m')):
        return None  # The marker cannot choose its own direction or stop projection.
    config = motion_config_for(mode, region)
    # Bootstrap scheduling is operational, not a curve input. Preserve accepted
    # v9 anchors/profile signatures when only the initial work budget changes.
    config = {**config, 'visual': {k:v for k,v in config['visual'].items()
                                  if k != 'initial_preparation_budget_s'}}
    if rule_version is not None:
        if rule_version not in ('station-relative-v1', 'station-cycle-v2'):
            return None
        config['visual']['visual_rule_version'] = rule_version
    if config['visual']['visual_rule_version'] == 'station-cycle-v2':
        # A ten-second cached plan must not masquerade as the parked-at-0:30
        # policy. Legacy/default station-relative-v1 signatures stay unchanged.
        config['visual'].update(station_stop_lead_s=STATION_CYCLE_STOP_LEAD_S,
                                station_approach_lead_s=STATION_CYCLE_APPROACH_LEAD_S)
    key = hashlib.sha256(json.dumps([identity, mode, config, timeline, path.get('derived_generation'),direction['fingerprint']],
        sort_keys=True, default=str).encode()).hexdigest()
    now = time.monotonic()
    for k, item in list(_PLANS.items()):
        if now-item['created'] > 300:
            _PLANS.pop(k, None)
    cached = _PLANS.get(key)
    # Check current atomic authority even when the optical plan is cached.
    header = {'_id':0,'ready':1,'generation_id':1,'mode':1,'geometry.source':1,
              'geometry.geometry_fingerprint':1,'infrastructure.total_m':1,
              'pattern_fingerprint':1,'direction_contract.fingerprint':1}
    try:
        bundle = await get_pattern_generation(identity['pattern_id'], version_id,
            region_id=region.region_id, network_id=region.network_id,
            **({'projection':header} if cached else {}))
        # Older bundles without a geometry fingerprint cannot use the compact
        # authority proof; retain the full original validation for those.
        if cached and bundle and (not bundle.get('geometry',{}).get('geometry_fingerprint')
                or not cached.get('authority_fingerprint')) and 'points' not in bundle.get('geometry',{}):
            bundle = await get_pattern_generation(identity['pattern_id'], version_id,
                region_id=region.region_id, network_id=region.network_id)
    except PyMongoError:
        return None
    if (bundle and bundle.get('ready') is True and bundle.get('generation_id')
            and path.get('derived_generation') and not generation_matches_path(bundle, path)
            and path.get('geometry_source') != 'PERIX_MANUAL'):
        # A hidden visual journey must recover on its next ordinary poll,
        # without requiring a /map request to refresh a stale worker cache.
        from mobility.geometry_cache import invalidate_generation
        invalidate_generation(identity['pattern_id'], str(version_id), str(path['derived_generation']))
    geometry = (bundle or {}).get('geometry') or {}
    bound_direction = (bundle or {}).get('direction_contract')
    direction_matches = ((bound_direction or {}).get('fingerprint') == direction['fingerprint']
        if bound_direction is not None else (bundle or {}).get('pattern_fingerprint') == path.get('pattern_fingerprint')
            and bool(path.get('pattern_fingerprint')))
    if bundle and not direction_matches:
        from mobility.geometry_cache import invalidate_generation
        invalidate_generation(identity['pattern_id'],str(version_id),str(path.get('derived_generation') or ''))
    geometry_matches = (geometry.get('points') == path.get('points') if 'points' in geometry else
        bool(cached and geometry.get('geometry_fingerprint')
             and geometry.get('geometry_fingerprint') == cached.get('authority_fingerprint')
             and geometry.get('source') == cached.get('authority_source')))
    authoritative = bool(bundle and bundle.get('ready') is True and generation_matches_path(bundle, path)
        and bundle.get('mode', mode) == mode
        and geometry_matches
        and direction_matches
        and _infra_matches_path(bundle.get('infrastructure') or {}, path, config)
        and path.get('geometry_source') != 'PERIX_MANUAL')
    if not authoritative:
        return None  # Caller retains source board clocks, never old physical projection.
    if state_collection is None:
        from database import db
        state_collection = db.mobility_visual_progress_state
    if cached:
        plan = cached['plan']
        cached['created'] = now  # Expire idle entries, not a healthy live fleet every five minutes.
        _PLANS.move_to_end(key)
    else:
        progress = path['stop_progress']
        infra = bundle['infrastructure']
        # No invented signal phase or observed queue. Static traffic and mapped
        # approach slowing shape the curve, never the source arrival/departure.
        config = {**config, 'road_signal_enabled': False, 'rail_signal_enabled': False}
        traffic_context = []
        if mode == 'bus':
            from mobility.motion.visual_context import shared_traffic_context
            try:
                traffic_context = await shared_traffic_context(identity=identity,
                    generation_id=str(path['derived_generation'])+':direction:'+direction['fingerprint'], timeline=timeline, progress=progress,
                    edges=infra.get('edges') or [], region=region, collection=state_collection)
            except (PyMongoError, KeyError, TypeError, ValueError):
                return None
        # An explicit, uncalibrated topology prior, independent of received
        # lateness. It creates positive-speed approaches, not red-light stops.
        strength = min(1.0, max(0.0, float(config.get('visual_spatial_slowdown_strength', 0.35))))
        from mobility.motion.visual_curve_context import bounded_infrastructure, topology_neighbors, relative_profile
        # With phase holds disabled, baseline trajectory shape is independent
        # of trip clocks. Reuse it for the same atomic geometry/config/static
        # traffic inputs across trips and source revisions, not just polls.
        template_key = hashlib.sha256(json.dumps([region.region_id,region.network_id,str(version_id),
            identity['pattern_id'],path['derived_generation'],identity['geometry_fingerprint'],
            direction['fingerprint'],mode,config,progress,[c['by_edge'] for c in traffic_context]],sort_keys=True).encode()).hexdigest()
        template = _TEMPLATES.get(template_key)
        if template:
            profiles, infra, neighbors = template['profiles'], template['infra'], template['neighbors']
            physical_profiles = template['physical_profiles']
            _TEMPLATES.move_to_end(template_key)
        else:
            profiles = []
            physical_profiles = []
            neighbors = topology_neighbors(infra)
            for i, (start, end) in enumerate(zip(progress, progress[1:])):
                traffic = traffic_context[i]['by_edge'] if traffic_context else {}
                bounded = bounded_infrastructure(infra, start, end)
                priors = _spatial_slowdown_priors(bounded, mode, start, end, traffic, config,
                    topology_neighbors=neighbors)
                kwargs = dict(edges=bounded.get('edges') or [], signals=[], start_m=start, end_m=end,
                    departure_service_s=0, config=config, slowdowns=priors, slowdown_strength=strength)
                physical_profile = (build_tram_leg(**kwargs) if mode == 'tram'
                                    else build_bus_leg(**kwargs, traffic_by_edge=traffic))
                physical_profiles.append(physical_profile)
                profiles.append(relative_profile(physical_profile, config['visual']))
            template_size = sum(len(p.get('segments') or []) for p in profiles)
            if template_size <= 500000:
                _TEMPLATES[template_key] = dict(profiles=profiles,physical_profiles=physical_profiles,infra=infra,neighbors=neighbors,
                    created=now,size=template_size)
                while len(_TEMPLATES)>64 or sum(t['size'] for t in _TEMPLATES.values())>500000:
                    _TEMPLATES.popitem(last=False)
        try:
            plan = build_visual_plan(identity=identity, timeline=timeline, stop_progress=progress,
                profiles=profiles, share_profiles=True)
        except ValueError:
            return None
        # A directed-leg certificate is also a shared-state namespace boundary:
        # old nearest-platform optical anchors must never be reused as legs.
        plan['generation_id'] = str(path['derived_generation'])+':direction:'+direction['fingerprint']
        plan['visual_rule_version'] = config['visual']['visual_rule_version']
        plan['visual_parameters'] = visual_scale_parameters(config['visual'])
        plan['context_recipe'] = dict(mode=mode, config=config, infrastructure=infra,
            physical_profiles=physical_profiles,
            traffic_by_leg=[c['by_edge'] for c in traffic_context] if traffic_context else [{} for _ in profiles])
        plan['visual_context'] = dict(schema=1, modeled_not_observed=True,
            spatial_strength=strength, traffic_provider='STATIC_PROFILE_V1' if traffic_context else None,
            traffic_edge_counts=[len(c['by_edge']) for c in traffic_context],
            traffic_profile_versions=sorted({v for c in traffic_context for v in c['profile_versions']}),
            traffic_models=sorted({str(v.get('model')) for c in traffic_context for v in c['by_edge'].values()
                                   if v.get('model')}),
            traffic_calibrated=bool(traffic_context and any(c['by_edge'] for c in traffic_context)) and
                all(v.get('calibrated') is True for c in traffic_context for v in c['by_edge'].values()),
            density_model=False, dwell_basis='SOURCE_ARRIVAL_DEPARTURE')
        # Source NO_DATA/zero-window states may change without changing the
        # underlying template. Bind template identity independently of clocks.
        plan['template_signature'] = hashlib.sha256(json.dumps(
            [mode, config, profiles, plan['visual_context'], plan['context_recipe']],
            sort_keys=True, allow_nan=False).encode()).hexdigest()
        # Derived read-only acceleration index, not an additional curve input.
        plan['context_recipe']['_topology_neighbors'] = neighbors
        size = sum(len(p.get('segments') or []) for p in profiles)
        if size <= MAX_SEGMENTS:
            _PLANS[key] = dict(plan=plan, created=now, size=size,
                authority_fingerprint=geometry.get('geometry_fingerprint'),authority_source=geometry.get('source'))
            while len(_PLANS) > MAX_PLANS or sum(p['size'] for p in _PLANS.values()) > MAX_SEGMENTS:
                _PLANS.popitem(last=False)
    from mobility.motion.visual_shared_state import resolve_shared_visual_plan
    try:
        plan = await resolve_shared_visual_plan(plan, state_collection, source_order=source_order, now_s=now_s)
    except (PyMongoError, KeyError, TypeError, ValueError):
        return None  # No local-only alternative if shared authority is unavailable.
    if plan is None:
        return None
    sample = sample_visual_plan(plan, now_s)
    if not sample:
        return None
    journey_id = f'{region.network_id}:{version_id}:{identity["service_date"]}:{trip_id}'
    preview = visual_preview(plan, sample, now_s=now_s, sampled_at_ms=now_epoch*1000,
        journey_id=journey_id, horizon_s=45)
    context = deepcopy(plan['visual_context'])
    context['visual_rule_version'] = plan['visual_rule_version']
    context['wait_state'] = deepcopy(sample.get('wait_state'))
    context['dwell_basis'] = 'SOURCE_WINDOWS_WITH_MODELED_WAIT'
    if sample['state'] == 'VISUAL_MOVING':
        parameters = plan['legs'][sample['next_timeline_index']-1].get('profile_parameters')
        if parameters:
            context['optical_delay_allocation'] = 'UPCOMING_MAPPED_APPROACHES'
            context['active_spatial_strength'] = parameters['strength']
    return {**sample, 'timeline': deepcopy(plan['timeline']), 'preview': preview,
            'station_cycles': [station_cycle_metadata(plan, i, now_s, now_epoch*1000)
                               for i in range(len(plan['timeline']))] if plan.get('station_cycles') else [],
            'geometry_fingerprint': identity['geometry_fingerprint'], 'visual_context': context,
            'direction_contract':dict(fingerprint=direction['fingerprint'],direction_key=direction['direction_key'],
                authority='LINE_GENERATION',origin_stop_id=direction['origin_stop_id'],
                terminal_stop_id=direction['terminal_stop_id'],stop_count=len(direction['ordered_stop_ids']),
                occurrence_index=sample['next_timeline_index'])}
