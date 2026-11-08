"""Isolated schedule-only motion replay over already audited OSM candidates.

No live feed, traffic, signal phases, database access or production activation.
Results are modeled estimates, not vehicle GPS or route verification.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import math
import os
import sys
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from zoneinfo import ZoneInfo

# Never inherit a production DB or enable optional runtime sources in this tool.
os.environ['MONGO_URL'] = 'mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=50'
os.environ['DB_NAME'] = 'offline_candidate_motion_replay'
os.environ['MOBILITY_SPATIAL_SLOWDOWN_ENABLED'] = 'false'
os.environ['MOBILITY_SIGNAL_SEMANTICS_ENABLED'] = 'false'
os.environ['MOBILITY_GOOGLE_TRAFFIC_ENABLED'] = 'false'
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mobility import generations
from mobility.domain import _pattern_id, _pattern_key
from mobility.infrastructure import _build_edge_chain, _way_attributes
from mobility.motion import engine
from mobility.motion.config import motion_config_for
from mobility.realtime_trip_identity import _service_date, _time_seconds
from mobility.stop_occurrences import stop_occurrence_times
from tools.audit_offline_rebuild import edge_assessment, index_ways
from tools.audit_transit_geometry import runtime_stop_projection
from tools.rebuild_transit_offline import parse_osm


REGION = SimpleNamespace(region_id='offline', network_id='offline', timezone='Europe/Berlin',
                         motion={}, service_day_start_hour=4)


def build_timeline(network, line, trip_id):
    if network.get('version_id') != line.get('network_version_id') or _service_date(network) != line.get('service_date'):
        raise ValueError('dated network identity mismatch')
    found = []
    for route in network.get('routes') or []:
        if route.get('mode') != line['mode']:
            continue
        for trip in route.get('trips') or []:
            if str(trip.get('trip_id') or '') == trip_id and _pattern_id(str(route.get('route_number') or ''), _pattern_key(trip)) == line['pattern_id']:
                found.append(trip)
    if len(found) != 1:
        raise ValueError('missing or ambiguous dated trip identity')
    trip = found[0]
    if [str(x) for x in trip.get('stop_ids') or []] != [str(s['stop_id']) for s in line['stops']]:
        raise ValueError('trip stop occurrence mismatch')
    visits = stop_occurrence_times(trip)
    if visits is None:
        raise ValueError('static stop occurrences unavailable')
    timeline, previous_departure = [], None
    for visit in visits:
        arrival, departure = _time_seconds(visit['arrival_time']), _time_seconds(visit['departure_time'])
        if arrival is None or departure is None or departure < arrival or (previous_departure is not None and arrival < previous_departure):
            raise ValueError('invalid static timeline')
        timeline.append({'stop_id': str(visit['stop_id']), 'stop_sequence': visit['stop_sequence'],
                         'scheduled': arrival, 'scheduled_arrival': arrival, 'scheduled_departure': departure,
                         'predicted_arrival': arrival, 'predicted_departure': departure,
                         'relationship': 'SCHEDULED', 'timing_basis': 'SCHEDULE',
                         'departure_timing_basis': 'SCHEDULE', 'provider_predicted_arrival_s': None,
                         'provider_predicted_departure_s': None})
        previous_departure = departure
    return timeline


def build_offline_infra(candidate, line, sources):
    audit = edge_assessment(candidate, line, index_ways(sources))
    if audit['issues']:
        raise ValueError('candidate edge audit failed')
    chain = _build_edge_chain(candidate['segments'])
    if not chain or len(chain['edges']) != len(candidate['points']) - 1:
        raise ValueError('invalid infrastructure edge chain')
    ways = index_ways(sources)[candidate['mode']]
    for i, edge in enumerate(chain['edges']):
        if edge['from_point'] != candidate['points'][i] or edge['to_point'] != candidate['points'][i+1]:
            raise ValueError('infrastructure differs from candidate geometry')
        edge['way'] = _way_attributes(ways[edge['way_id']], candidate['mode'], edge['from_node'], edge['to_node'])
    projection = runtime_stop_projection(candidate['points'], line['stops'])
    if projection is None or len(projection['positions']) != len(line['stops']) or any(
            b - a < 1 for a, b in zip(projection['positions'], projection['positions'][1:])):
        raise ValueError('ambiguous or non-increasing runtime stop projection')
    return {'total_m': chain['total_m'], 'edges': chain['edges'], 'signals': []}, projection['positions'], audit


async def run_model(candidate, line, sources, timeline, trip_id):
    infrastructure, progress, audit = build_offline_infra(candidate, line, sources)
    path = {'pattern_id': line['pattern_id'], 'total_m': infrastructure['total_m'],
            'points': candidate['points'], 'stop_progress': progress, 'service_date': line['service_date']}
    db_stub = SimpleNamespace(mobility_pattern_infrastructure=SimpleNamespace(find_one=AsyncMock(return_value=infrastructure)))
    def no_signals(mode, region):
        return {**motion_config_for(mode, region), 'road_signal_enabled': False, 'rail_signal_enabled': False}
    failure = {}
    day = datetime.fromisoformat(line['service_date']).replace(hour=12, tzinfo=ZoneInfo('Europe/Berlin'))
    with patch.object(engine, 'db', db_stub), patch.object(engine, 'get_active_region', return_value=REGION), \
            patch.object(engine, 'motion_config_for', side_effect=no_signals), \
            patch.object(engine, 'traffic_snapshot_for_edges', new=AsyncMock(return_value={'by_edge': {}, 'provider': None, 'profile_versions': []})), \
            patch.object(generations, 'atomic_generations_enabled', return_value=False):
        plan = await engine._build_trip_plan(trip_id=trip_id, mode=line['mode'], version_id=line['network_version_id'],
            timeline=timeline, path=path, now_local=day, failure=failure, modeled_station_dwell_s=0.0)
    if not plan:
        return {'status': 'MODEL_UNAVAILABLE', 'failure': failure, 'edge_audit': audit}
    if plan.get('traffic_edge_count') or plan.get('signal_stop_count'):
        raise ValueError('unexpected traffic or signal modelling')
    moves = [x for x in plan['segments'] if x.get('kind') == 'MOVE']
    if len(moves) != len(timeline) - 1:
        raise ValueError('incomplete modeled trip')
    samples, errors, maximum_speed = 0, [], 0.0
    speed_cap = float(motion_config_for(line['mode'], REGION)['max_speed_kmh'])
    for move in moves:
        start, end = int(move['from_timeline_index']), int(move['next_timeline_index'])
        if end != start + 1 or move['t1'] <= move['t0']:
            raise ValueError('invalid move interval')
        prior_progress = -math.inf
        for fraction in (0.001, 0.25, 0.5, 0.75, 0.999):
            now = move['t0'] + (move['t1'] - move['t0']) * fraction
            sample = engine._sample_trip_plan(plan, now, timeline, progress)
            p, speed = float(sample['progress_m']), float(sample['speed_kmh'])
            maximum_speed = max(maximum_speed, speed)
            if (not math.isfinite(p) or not math.isfinite(speed) or speed < 0 or
                    speed > speed_cap + 0.02 or p < progress[start] - 0.01 or
                    p > progress[end] + 0.01 or p < prior_progress - 0.01):
                errors.append({'leg': start, 'fraction': fraction, 'code': 'UNSAFE_SAMPLE'})
            prior_progress = p
            samples += 1
    effective = plan.get('effective_timeline') or []
    if len(effective) != len(timeline):
        raise ValueError('effective timeline size mismatch')
    deviations = [float(x['predicted_arrival']) - float(source['predicted_arrival']) for x, source in zip(effective, timeline)]
    limiting_legs = sorted(moves, key=lambda x: float(x.get('incremental_physics_limited_s') or 0), reverse=True)[:3]
    return {'status': 'MODELED_REPLAY_ONLY', 'sample_count': samples, 'sample_errors': errors,
            'edge_count': len(infrastructure['edges']), 'edge_audit': audit,
            'total_m': round(infrastructure['total_m'], 1), 'stop_count': len(progress),
            'sampled_max_speed_kmh': round(maximum_speed, 2), 'model_speed_cap_kmh': speed_cap,
            'final_arrival_deviation_s': round(deviations[-1], 1),
            'max_arrival_deviation_s': round(max(deviations), 1),
            'min_arrival_deviation_s': round(min(deviations), 1),
            'largest_arrival_deviations': [{'stop_id': line['stops'][i]['stop_id'],
                'stop_name': line['stops'][i].get('name'), 'deviation_s': round(deviations[i], 1)}
                for i in sorted(range(len(deviations)), key=lambda index: deviations[index], reverse=True)[:3]],
            'largest_incremental_lateness_legs': [{
                'from_stop': line['stops'][int(leg['from_timeline_index'])].get('name'),
                'to_stop': line['stops'][int(leg['next_timeline_index'])].get('name'),
                'requested_duration_s': leg.get('requested_duration_s'),
                'natural_duration_s': leg.get('natural_duration_s'),
                'fastest_duration_s': leg.get('fastest_duration_s'),
                'incremental_physics_limited_s': leg.get('incremental_physics_limited_s'),
            } for leg in limiting_legs],
            'modeled_dwell_s': 0.0, 'signal_inputs': 'DISABLED_NOT_OBSERVED',
            'traffic_inputs': 'NONE_NOT_OBSERVED', 'position_source': 'MODELED_NOT_GPS'}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('network', 'map', 'osm', 'baseline', 'experiment', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--trip-id', required=True)
    args = parser.parse_args(argv)
    if args.output.exists(): raise FileExistsError('Refusing to overwrite report')
    net, mp, osm, base, exp = (p.read_bytes() for p in (args.network, args.map, args.osm, args.baseline, args.experiment))
    network, map_data, source_data, baseline, experiment = map(json.loads, (net, mp, osm, base, exp))
    sha = lambda data: hashlib.sha256(data).hexdigest()
    if any(baseline['provenance'][k] != sha(v) for k, v in [('network_sha256', net), ('map_sha256', mp), ('osm_sha256', osm)]):
        raise ValueError('baseline source hash mismatch')
    if experiment.get('input_candidates_sha256') != sha(base) or experiment.get('scope') != baseline.get('scope'):
        raise ValueError('experimental candidate provenance mismatch')
    proposed = experiment['candidate']
    scope = baseline['scope']
    lines = [x for x in map_data['lines'] if x.get('pattern_id') == proposed['pattern_id'] and x.get('mode') == proposed['mode']
             and x.get('network_version_id') == scope['network_version_id'] and x.get('service_date') == scope['service_date']]
    priors = [x for x in baseline['patterns'] if x.get('pattern_id') == proposed['pattern_id'] and x.get('mode') == proposed['mode']]
    if len(lines) != 1 or len(priors) != 1:
        raise ValueError('ambiguous candidate identity')
    line = lines[0]
    timeline = build_timeline(network, line, args.trip_id)
    source = parse_osm(source_data, scope['declared_osm_bbox'])
    old = asyncio.run(run_model(priors[0], line, source, timeline, args.trip_id))
    new = asyncio.run(run_model(proposed, line, source, timeline, args.trip_id))
    result = {'scope': scope, 'pattern_id': line['pattern_id'], 'mode': line['mode'], 'trip_id': args.trip_id,
              'baseline_candidate': old, 'experimental_candidate': new,
              'input_baseline_sha256': sha(base), 'input_experiment_sha256': sha(exp),
              'limits': ['Schedule clocks used as modeled targets, not source forecasts or GPS.',
                         'No independent operator geometry, closures, realtime traffic, signals or passenger dwell evidence.',
                         'Simulator uses default local parameters and stubbed offline infrastructure, not an installed generation.',
                         'Sampling and model feasibility do not establish physical route accuracy or deployment readiness.']}
    with args.output.open('x', encoding='utf-8', newline='\n') as f:
        json.dump(result, f, ensure_ascii=False, indent=2, allow_nan=False); f.write('\n')
    print(json.dumps({'report': str(args.output), 'pattern_id': line['pattern_id'], 'trip_id': args.trip_id,
                      'baseline_candidate': old, 'experimental_candidate': new}, ensure_ascii=True))


if __name__ == '__main__': main()
