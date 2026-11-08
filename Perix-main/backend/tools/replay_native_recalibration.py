"""Read-only file replay of real GTFS-RT with exact frozen transit identities.

No HTTP, secret access, live database queries, production flags or deployment.
Unmatched trip/day/sequence records are counted, never rebound by proximity.
"""
from __future__ import annotations
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from zoneinfo import ZoneInfo
import argparse
import asyncio
import hashlib
import json
import math
import statistics
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mobility.motion import engine
from mobility.motion.common import sample_trajectory
from mobility.motion.native_recalibration import NativeShadowSession
from mobility.motion.native_realtime import normalize_timeline, trip_update_record


def percentile(values, p):
    if not values: return None
    ordered = sorted(values); pos = (len(ordered)-1)*p
    low, high = math.floor(pos), math.ceil(pos)
    return ordered[low]+(ordered[high]-ordered[low])*(pos-low)


async def compare_updates(updates, *, region):
    """All three alternatives share C's previous state at each update boundary.

    C alone is committed to the private replay session. A/B do not reinitialize
    at the previous stop or change the physical parameters for comparison.
    """
    old_region = engine.get_active_region
    engine.get_active_region = lambda: region  # Private replay process only.
    session = NativeShadowSession(enabled_override=True)
    rows, counts, timings, timing_events = [], Counter(), {m: [] for m in ('A', 'B', 'C')}, []
    try:
        for item in updates:
            prior = session.checkpoint()
            before = time.perf_counter()
            result = await session.update(**item)
            timings['C'].append((time.perf_counter()-before)*1000)
            timing_event = {'source_epoch': item['source_epoch'], 'reason': result['reason'],
                'rebuilt': result.get('rebuilt', False), 'C_ms': timings['C'][-1]}
            timing_events.append(timing_event)
            counts[result['reason']] += 1
            if not result.get('rebuilt') or not result.get('plan'):
                continue
            current = result['plan']
            handover, history = None, None
            prior_sample = None
            previous = prior.get('plan') if prior else None
            if previous:
                ps = engine._sample_trip_plan(previous, item['now_service_s'], prior['timeline'], item['path']['stop_progress'])
                prior_sample = ps
                if ps['motion_state'] in ('AT_STOP', 'DWELL'):
                    history = int(ps['next_timeline_index'])
                else:
                    leg = next(s for s in previous['segments'] if s['kind'] == 'MOVE' and s['t0'] <= item['now_service_s'] < s['t1'])
                    exact = sample_trajectory(leg['trajectory'], item['now_service_s']-leg['t0'], leg.get('time_scale', 1.))
                    handover = {**ps, **exact, 'service_s': item['now_service_s']}
            plans = {'C': current}
            for model in ('A', 'B'):
                before = time.perf_counter()
                plans[model] = await engine._build_trip_plan(trip_id=item['trip_id'], mode='bus',
                    version_id=item['bundle']['version_id'], timeline=deepcopy(item['timeline']),
                    path=item['path'], now_local=datetime.fromtimestamp(item['now_epoch'], timezone.utc),
                    now_service_s=item['now_service_s'], frozen_bundle=item['bundle'], provider_free=True,
                    previous_plan=previous, handover=handover, history_index=history,
                    allocation_research=model == 'B')
                timings[model].append((time.perf_counter()-before)*1000)
                timing_event[model+'_ms'] = timings[model][-1]
            for offset in (0., 30.):
                samples = {}
                for model, plan in plans.items():
                    sampled = engine._sample_trip_plan(plan, item['now_service_s']+offset,
                        item['timeline'], item['path']['stop_progress'])
                    idx = sampled['next_timeline_index']
                    leg = next((s for s in plan['segments'] if s['kind'] == 'MOVE'
                        and s['t0'] <= item['now_service_s']+offset < s['t1']), {})
                    samples[model] = {'progress_m': sampled['progress_m'], 'speed_kmh': sampled['speed_kmh'],
                        'next_stop': item['timeline'][idx]['stop_id'],
                        'gtfs_eta_service_s': item['timeline'][idx]['predicted_arrival'],
                        'gtfs_prediction_basis': item['timeline'][idx].get('prediction_basis'),
                        'distance_to_stop_m': max(0., item['path']['stop_progress'][idx]-sampled['progress_m']),
                        'fit': sampled.get('fit'), 'target_error_s': leg.get('native_recalibration', {}).get('target_error_s',
                            sampled.get('arrival_target_error_s', 0.)),
                        'plan_max_arrival_target_error_s': plan.get('max_arrival_target_error_s'),
                        'selected_scenario': leg.get('native_recalibration', {}).get('selected'),
                        'inferred_slowdown_s': leg.get('native_recalibration', {}).get('inferred_slowdown_s'),
                        'observed_vehicle_state': False}
                rows.append({'trip': item['trip_id'], 'service_date': item['service_date'],
                    'source_epoch': item['source_epoch'], 'calculation_service_s': item['now_service_s'],
                    'sample_offset_s': offset, 'sample_semantics': 'MODELED_NOT_OBSERVED_POSITION',
                    'models': samples,
                    'position_delta_c_minus_b_m': samples['C']['progress_m']-samples['B']['progress_m'],
                    'speed_delta_c_minus_b_kmh': samples['C']['speed_kmh']-samples['B']['speed_kmh'],
                    'native_boundary_position_jump_m': samples['C']['progress_m']-prior_sample['progress_m']
                        if prior_sample and offset == 0 else None,
                    'native_boundary_speed_jump_kmh': samples['C']['speed_kmh']-prior_sample['speed_kmh']
                        if prior_sample and offset == 0 else None,
                    'previous_next_gtfs_eta_service_s': prior['timeline'][int(result['sample']['next_timeline_index'])]['predicted_arrival']
                        if prior and result.get('sample') else None,
                    'next_target_revision_s': item['timeline'][int(result['sample']['next_timeline_index'])]['predicted_arrival']
                        - prior['timeline'][int(result['sample']['next_timeline_index'])]['predicted_arrival']
                        if prior and result.get('sample') else None,
                    'native_reasons': [s['native_recalibration'] for s in current['segments']
                        if 'native_recalibration' in s]})
    finally:
        engine.get_active_region = old_region
    return {'rows': rows, 'update_decisions': dict(counts), 'timing_scope': 'LOCAL_COMPARISON_WALL_MS_NOT_PUBLIC_API_LATENCY',
        'timing_samples_ms': timings,
        'timing_events': timing_events,
        'timings_ms': {m: {'n': len(t), 'p50': statistics.median(t) if t else None,
            'p95': percentile(t, .95)} for m, t in timings.items()}}


async def analyze(canonical, feed_dir, max_trips=6):
    from google.transit import gtfs_realtime_pb2
    from mobility.domain import build_domain
    network = canonical['network']
    r = SimpleNamespace(**canonical['region'])
    domain = build_domain(network, r.network_id, [])
    templates = {str(t['trip_id']): t for t in domain['trip_templates'] if t.get('mode') == 'bus'}
    bus_trips = {str(t['trip_id']): (route, t) for route in network['routes'] if route.get('mode') == 'bus'
                 for t in route.get('trips', [])}
    bundles = {b['pattern_id']: b for b in canonical['bundles'] if b.get('ready') and b.get('mode') == 'bus'}
    local_stops = {str(s['stop_id']) for route in network['routes'] for s in route['stops']}
    manifest = json.loads((feed_dir/'manifest.json').read_bytes())
    observations, decisions, examples, captures, cases = [], Counter(), [], [], {}
    previous = {}
    for capture in manifest:
        if capture.get('http_status') != 200:
            decisions['FEED_HTTP_NOT_200'] += 1; continue
        raw = (feed_dir/f"feed-{capture['index']}.pb").read_bytes()
        if hashlib.sha256(raw).hexdigest() != capture['sha256']:
            raise ValueError('FEED_HASH_MISMATCH')
        feed = gtfs_realtime_pb2.FeedMessage(); feed.ParseFromString(raw)
        received = datetime.fromisoformat(capture['received_at'])
        local = received.astimezone(ZoneInfo(r.timezone))
        day = datetime.fromisoformat(network['service_date']).date()
        now_s = (local.date()-day).days*86400+local.hour*3600+local.minute*60+local.second
        matches, overlap, changes = 0, 0, 0
        for entity in feed.entity:
            if not entity.HasField('trip_update'): continue
            u = trip_update_record(entity.trip_update, feed.header.timestamp)
            tid = u['trip_id']
            if any(s['stop_id'] in local_stops for s in u['stops']):
                overlap += 1
                for s in u['stops']:
                    if s['stop_id'] not in local_stops: continue
                    event = s.get('arrival') or s.get('departure') or {}
                    key = (tid, u['start_date'], u['start_time'], s.get('stop_sequence'), s['stop_id'])
                    current = event.get('time')
                    old = previous.get(key)
                    if current is not None and old is not None and current != old:
                        changes += 1
                        if len(examples) < 30:
                            examples.append({'trip': tid, 'start_date': u['start_date'],
                                'stop_id': s['stop_id'], 'stop_sequence': s.get('stop_sequence'),
                                'previous_predicted_epoch': old, 'new_predicted_epoch': current,
                                'eta_revision_s': current-old, 'bound_to_canonical_bus': tid in bus_trips,
                                'mode': 'UNVERIFIED' if tid not in bus_trips else 'bus'})
                    if current is not None: previous[key] = current
            if tid not in bus_trips:
                decisions['TRIP_NOT_IN_FROZEN_BUS_NETWORK'] += 1; continue
            matches += 1
            if u.get('start_date') and u['start_date'] != str(network['service_date']).replace('-', ''):
                decisions['SERVICE_DATE_MISMATCH'] += 1; continue
            template = templates[tid]; bundle = bundles.get(template['pattern_id'])
            if not bundle:
                decisions['NO_READY_CANONICAL_BUNDLE'] += 1; continue
            route, trip = bus_trips[tid]
            try:
                timeline = normalize_timeline(trip, u, service_date=network['service_date'], timezone=r.timezone)
            except ValueError as exc:
                decisions[str(exc)] += 1; continue
            if not timeline or not timeline[0]['predicted_arrival'] <= now_s < timeline[-1]['predicted_departure']:
                decisions['NOT_ACTIVE_AT_CAPTURE'] += 1; continue
            if (tid, u['start_time']) not in cases and len(cases) >= max_trips:
                decisions['REPLAY_TRIP_LIMIT_NOT_A_VALIDITY_REJECTION'] += 1; continue
            # Use the existing path builder with an explicitly frozen local
            # network and canonical cache. This CLI process has no passenger state.
            from routes import mobility as routes
            from mobility import geometry_cache
            old_network = routes._get_active_network
            async def frozen_network(): return network
            routes._get_active_network = frozen_network
            geometry_cache.set_cached(bundle['pattern_id'], bundle['geometry']['points'],
                version_id=network['version_id'], generation_id=bundle['generation_id'],
                source=bundle['geometry']['source'], osm_snapshot_v=bundle['osm_snapshot_v'],
                geometry_fingerprint=bundle['geometry'].get('geometry_fingerprint'))
            stops = {str(s['stop_id']): s for s in route['stops']}
            for e in timeline: e['stop'] = stops[e['stop_id']]
            try:
                path = await routes._trip_path_geometry(route, trip, timeline)
            finally:
                routes._get_active_network = old_network
            if not path:
                decisions['NO_CANONICAL_PATH'] += 1; continue
            cases.setdefault((tid, u['start_time']), []).append(dict(trip_id=tid,
                service_date=network['service_date'], start_time=u['start_time'], timeline=timeline,
                path=path, bundle=bundle, source_epoch=u['source_epoch'], received_epoch=received.timestamp(),
                now_epoch=received.timestamp(), now_service_s=now_s, trip_relationship=u['trip_relationship']))
        captures.append({**capture, 'exact_bus_trip_matches': matches, 'local_stop_overlap_updates': overlap,
            'changed_local_stop_predicted_epochs': changes})
    comparisons = []
    for (tid, _start_time), updates in cases.items():
        comparison = await compare_updates(updates, region=r)
        comparison.update(route_number=bus_trips[tid][0]['route_number'], direction=bus_trips[tid][1]['headsign'])
        comparisons.append(comparison)
    return {'type': 'REAL_GTFS_RT_NATIVE_SHADOW_REPLAY', 'canonical_service_date': network['service_date'],
        'network_version': network['version_id'], 'frozen_bus_trips': len(bus_trips),
        'network_active': network.get('active'), 'network_generation_state': network.get('generation_state'),
        'replay_max_trips': max_trips,
        'ready_bus_bundles': len(bundles), 'captures': captures, 'rejections': dict(decisions),
        'real_eta_revision_examples_unbound_if_marked': examples, 'comparisons': comparisons,
        'comparison_rows': sum(len(c['rows']) for c in comparisons),
        'actual_vehicle_accuracy': None, 'accuracy_status': 'NO_INDEPENDENT_VEHICLE_OBSERVATIONS',
        'external_traffic_requests': 0, 'production_modified': False,
        'limitation': 'Never rebind different trip IDs/dates by similar stops or route proximity.'}


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--canonical-json', type=Path, required=True)
    p.add_argument('--feed-dir', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--max-trips', type=int, default=6)
    args = p.parse_args()
    if args.output.exists(): raise ValueError('Refusing to overwrite evidence')
    if not 1 <= args.max_trips <= 20: raise ValueError('Replay requires a bounded 1..20 trips')
    report = asyncio.run(analyze(json.loads(args.canonical_json.read_bytes()), args.feed_dir, args.max_trips))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k not in ('comparisons', 'real_eta_revision_examples_unbound_if_marked')}, indent=2))
