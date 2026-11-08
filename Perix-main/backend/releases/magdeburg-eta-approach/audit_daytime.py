"""Read-only schedule replay against an isolated deployment's real geometry/DB.

Run with the candidate backend on PYTHONPATH and its STAGING environment.
Does not start workers, update source data, or simulate a real daytime GPS feed.
"""
import asyncio
import json
import math
from datetime import datetime
from zoneinfo import ZoneInfo

from routes import mobility as routes
from mobility.motion import engine
from mobility.domain import _pattern_id, _pattern_key


async def main():
    network = await routes._get_active_network()
    chosen, seen, counts = [], set(), {'bus': 0, 'tram': 0}
    for route in network.get('routes', []):
        mode = route.get('mode', 'bus')
        if mode not in counts or counts[mode] >= 3:
            continue
        for trip in route.get('trips', []):
            timeline = routes._predicted_stop_timeline(route, trip, None)
            if len(timeline) < 3 or not 8*3600 <= timeline[0]['predicted_departure'] <= 18*3600:
                continue
            pattern = _pattern_id(str(route.get('route_number')), _pattern_key(trip))
            if pattern in seen:
                continue
            seen.add(pattern)
            chosen.append((route, trip, timeline))
            counts[mode] += 1
            if counts[mode] >= 3:
                break
    results = []
    for route, trip, timeline in chosen:
        mode, failure = route.get('mode', 'bus'), {}
        path = await routes._trip_path_geometry(route, trip, timeline, network=network)
        if not path or path.get('geometry_source') == 'GTFS_POSITION_FALLBACK':
            results.append({'trip': trip['trip_id'], 'failure': 'NO_CANONICAL_PATH'})
            continue
        plan = await engine._build_trip_plan(
            trip_id=str(trip['trip_id']), mode=mode, version_id=str(network['version_id']),
            timeline=timeline, path=path, failure=failure,
            now_local=datetime.fromisoformat(routes._network_service_date(network)+'T12:00:00').replace(tzinfo=ZoneInfo('Europe/Berlin')),
            now_service_s=timeline[0]['predicted_departure'])
        if not plan:
            results.append({'trip': trip['trip_id'], 'failure': failure})
            continue
        effective, progress = plan['effective_timeline'], path['stop_progress']
        checks, bad, max_speed, max_offset = 0, [], 0, 0
        for index, entry in enumerate(effective):
            if entry.get('relationship') == 'SKIPPED':
                continue
            position, _ = routes._point_heading_at_progress(path, progress[index])
            stop = entry['stop']
            offset = routes._haversine_km(position['lat'], position['lng'], stop['lat'], stop['lng'])*1000
            max_offset = max(max_offset, offset)
            for now in sorted({entry['predicted_arrival']-1, entry['predicted_arrival'], entry['predicted_departure']}):
                sample = engine._sample_trip_plan(plan, now, timeline, progress)
                if sample.get('next_timeline_index') == index and entry['predicted_arrival'] <= now <= entry['predicted_departure']:
                    checks += 1
                    if abs(sample['progress_m']-progress[index]) > 0.5:
                        bad.append({'kind': 'ZERO_NOT_AT_STOP', 'index': index,
                                    'offset_m': sample['progress_m']-progress[index]})
        previous = None
        for now in range(math.floor(plan['start_s']), math.ceil(plan['end_s'])+1, 2):
            sample = engine._sample_trip_plan(plan, now, timeline, progress)
            current, speed = sample['progress_m'], sample['speed_kmh']
            max_speed = max(max_speed, speed)
            if previous and (current < previous[1]-0.5 or (current-previous[1])/(now-previous[0])*3.6 > 110):
                bad.append({'kind': 'NONPHYSICAL_STEP', 'time': now})
            previous = (now, current)
        results.append({'trip': trip['trip_id'], 'route': route.get('route_number'),
                        'direction': trip.get('headsign'), 'mode': mode, 'pattern': path.get('pattern_id'),
                        'stops': len(timeline), 'distance_m': round(path['total_m']),
                        'model_duration_s': round(plan['end_s']-plan['start_s']),
                        'max_speed_kmh': max_speed, 'max_platform_projection_offset_m': round(max_offset, 2),
                        'zero_occurrence_checks': checks, 'failures': bad})
    result = {'kind': 'Read-only schedule replay on real dated canonical geometry/infrastructure; not observed daytime fleet',
              'version': network.get('version_id'), 'date': routes._network_service_date(network), 'results': results}
    print(json.dumps(result, indent=2))
    if counts != {'bus': 3, 'tram': 3} or any(r.get('failure') or r.get('failures') for r in results):
        raise SystemExit(1)


if __name__ == '__main__':
    asyncio.run(main())
