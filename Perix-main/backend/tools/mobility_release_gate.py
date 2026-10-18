#!/usr/bin/env python3
"""Evidence-driven Perix Mobility V6 pre-release diagnostic (read only).

Inputs are manually exported snapshots from an authorized staging environment.
Never fetches Google Maps, mutates the database, publishes routes, or deploys.
"""
from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

# Executed as `python tools/mobility_release_gate.py` from the backend root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mobility.release_gate import release_gate


def load_json(path: Path):
    with path.open(encoding='utf-8') as handle:
        return json.load(handle)


def decode_gtfs_rt_pb(path: Path, captured_at: str) -> dict:
    try:
        from google.transit import gtfs_realtime_pb2
    except ImportError as exc:
        raise RuntimeError('Install backend requirements (gtfs-realtime-bindings) to read .pb feeds') from exc
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.ParseFromString(path.read_bytes())
    relationship = {0: 'SCHEDULED', 1: 'ADDED', 2: 'UNSCHEDULED',
                    3: 'CANCELED', 5: 'REPLACEMENT', 6: 'DUPLICATED', 7: 'DELETED'}
    updates = []
    for entity in feed.entity:
        if not entity.HasField('trip_update'):
            continue
        tu = entity.trip_update
        descriptor = {
            'trip_id': str(tu.trip.trip_id),
            'route_id': str(tu.trip.route_id),
            'start_date': str(tu.trip.start_date),
            'start_time': str(tu.trip.start_time),
            'schedule_relationship': relationship.get(int(tu.trip.schedule_relationship), 'UNKNOWN'),
        }
        if any(field.name == 'direction_id' for field, _ in tu.trip.ListFields()):
            descriptor['direction_id'] = int(tu.trip.direction_id)
        stop_updates = []
        for stu in tu.stop_time_update:
            stop_updates.append({
                'stop_id': str(stu.stop_id),
                'stop_sequence': int(stu.stop_sequence) if stu.HasField('stop_sequence') else None,
                'schedule_relationship': int(stu.schedule_relationship),
            })
        updates.append({'descriptor': descriptor, 'stop_updates': stop_updates})
    return {
        'feed_timestamp': int(feed.header.timestamp) if feed.header.HasField('timestamp') else None,
        'captured_at': captured_at,
        'trip_updates': updates,
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--network', type=Path, required=True, help='JSON export of one day-specific active network')
    ap.add_argument('--contract', type=Path, help='operator-reviewed schedule reference manifest')
    ap.add_argument('--official-reference', type=Path, help='dated official stop-order transcription, independently operator-reviewed')
    ap.add_argument('--map', dest='map_json', type=Path, help='JSON export from /mobility/v2/map')
    ap.add_argument('--detours', type=Path, help='JSON export from /mobility/v2/diagnostic/detours')
    feed = ap.add_mutually_exclusive_group()
    feed.add_argument('--rt-json', type=Path, help='normalized TripUpdate replay JSON')
    feed.add_argument('--rt-pb', type=Path, help='raw GTFS-Realtime protobuf .pb feed')
    ap.add_argument('--rt-captured-at', help='UTC/offset timestamp recorded WHEN RT protobuf was downloaded')
    ap.add_argument('--observations', type=Path, help='CSV with verified independent stop events')
    ap.add_argument('--min-observations', type=int, default=30)
    ap.add_argument('--max-mae-sec', type=float, default=120)
    ap.add_argument('--max-stop-distance-m', type=float, default=100)
    ap.add_argument('--max-rt-age-sec', type=int, default=120)
    ap.add_argument('--min-eligible-rt', type=int, default=1)
    ap.add_argument('--min-rt-acceptance-pct', type=float, default=80)
    ap.add_argument('--output', type=Path, help='write machine-readable JSON report')
    args = ap.parse_args(argv)
    if args.rt_pb and not args.rt_captured_at:
        ap.error('--rt-pb needs --rt-captured-at (time of the captured feed, not current time)')
    if args.min_observations < 1 or args.max_mae_sec <= 0 or args.max_stop_distance_m <= 0 or args.max_rt_age_sec <= 0 or not 0 <= args.min_rt_acceptance_pct <= 100:
        ap.error('positive acceptance thresholds required')
    network = load_json(args.network)
    rt = (load_json(args.rt_json) if args.rt_json else
          decode_gtfs_rt_pb(args.rt_pb, args.rt_captured_at) if args.rt_pb else None)
    observations = None
    if args.observations:
        with args.observations.open(encoding='utf-8-sig', newline='') as handle:
            observations = list(csv.DictReader(handle))
    result = release_gate(
        network,
        realtime=rt,
        map_payload=load_json(args.map_json) if args.map_json else None,
        contract=load_json(args.contract) if args.contract else None,
        official_reference=load_json(args.official_reference) if args.official_reference else None,
        require_official_reference=True,
        detours=load_json(args.detours) if args.detours else None,
        observations=observations,
        min_observations=args.min_observations,
        max_mae_seconds=args.max_mae_sec,
        max_stop_distance_m=args.max_stop_distance_m,
        max_feed_age_s=args.max_rt_age_sec,
        min_eligible_updates=args.min_eligible_rt,
        min_acceptance_pct=args.min_rt_acceptance_pct,
    )
    body = json.dumps(result, ensure_ascii=False, indent=2)
    print(body)
    if args.output:
        args.output.write_text(body + '\n', encoding='utf-8')
    return {'TECHNICAL_PASS': 0, 'BLOCKED': 2, 'INSUFFICIENT_EVIDENCE': 3}[result['status']]


if __name__ == '__main__':
    sys.exit(main())
