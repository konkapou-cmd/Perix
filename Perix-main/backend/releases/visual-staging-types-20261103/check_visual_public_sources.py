"""Bounded public GET/HEAD source check. Never imports/activates online data.

National realtime is decoded transiently; only aggregate matched TripUpdate
counts are retained. The static comparison uses an explicitly supplied dated
archive, not a claim that those are today's latest provider archive bytes.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sys
import time
from urllib.parse import urlsplit
import zipfile

import httpx


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--release', type=Path, required=True)
    p.add_argument('--archive', type=Path, required=True)
    args = p.parse_args()
    os.environ['MONGO_URL'] = 'mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=50'
    os.environ['DB_NAME'] = 'offline_public_source_check'
    sys.path.insert(0, str(args.release/'source/backend'))
    from mobility.realtime_trip_identity import build_trip_index, match_trip_update
    from google.transit import gtfs_realtime_pb2
    from audit_gtfs_network import audit_archive
    from visual_staging_ops import variables
    static_url = variables().get('MOBILITY_STATIC_GTFS_URL', '')
    parsed = urlsplit(static_url)
    assert parsed.scheme == 'https' and parsed.hostname == 'download.gtfs.de' and not parsed.username and not parsed.query
    with httpx.Client(timeout=60, follow_redirects=True, trust_env=False) as client:
        def get(url, maximum):
            data = bytearray()
            with client.stream('GET', url) as r:
                r.raise_for_status()
                for chunk in r.iter_bytes():
                    data.extend(chunk)
                    if len(data) > maximum:
                        raise ValueError('Public response exceeds explicit bound')
            return bytes(data)
        metadata = json.loads(get('https://app.perix.eu/api/mobility/v2/networks', 1000000))
        network = json.loads(get('https://app.perix.eu/api/mobility/network', 20000000))
        match = next(n for n in metadata if n['version_id'] == network['version_id'])
        network['service_date'] = match['service_date']
        index = build_trip_index(network)
        assert index
        # National (not Magdeburg-only) feed. Bound decoded bytes explicitly;
        # the initial 20 MB investigation limit was too small for this source.
        raw = get('https://realtime.gtfs.de/realtime-free.pb', 128*1024*1024)
        received_epoch = time.time()
        feed = gtfs_realtime_pb2.FeedMessage()
        feed.ParseFromString(raw)
        feed_timestamp = int(feed.header.timestamp) if feed.header.HasField('timestamp') else None
        reasons = Counter()
        timing = trip_clocks = 0
        for entity in feed.entity:
            if not entity.HasField('trip_update'):
                continue
            update = entity.trip_update
            if update.trip.trip_id not in index:
                continue
            trip = update.trip
            descriptor = dict(trip_id=trip.trip_id, route_id=trip.route_id, start_date=trip.start_date,
                start_time=trip.start_time, schedule_relationship=gtfs_realtime_pb2.TripDescriptor.ScheduleRelationship.Name(trip.schedule_relationship),
                direction_id=next((int(v) for f,v in trip.ListFields() if f.name == 'direction_id'), None))
            stops = [dict(stop_id=s.stop_id, stop_sequence=int(s.stop_sequence) if s.HasField('stop_sequence') else None) for s in update.stop_time_update]
            _, reason = match_trip_update(descriptor, stops, index, feed_timestamp=feed_timestamp,
                timezone_name='Europe/Berlin', service_day_start_hour=4, activated_at=None)
            reasons[reason] += 1
            if reason == 'MATCHED':
                trip_clocks += int(update.HasField('timestamp'))
                timing += int(any(s.HasField('arrival') or s.HasField('departure') for s in update.stop_time_update))
        head = client.head(static_url)
        head.raise_for_status()
        headers = {k: head.headers.get(k) for k in ('last-modified', 'etag', 'content-length')}
    with zipfile.ZipFile(args.archive) as z:
        static = audit_archive(network, z)
    archive_hash = hashlib.sha256()
    with args.archive.open('rb') as f:
        for chunk in iter(lambda: f.read(1024*1024), b''):
            archive_hash.update(chunk)
    report = dict(at_utc=datetime.now(timezone.utc).isoformat(), version=network['version_id'],
        service_date=network['service_date'], indexed_trips=len(index),
        realtime=dict(feed_timestamp=feed_timestamp,
            received_at_utc=datetime.fromtimestamp(received_epoch, timezone.utc).isoformat(),
            feed_age_at_receipt_seconds=received_epoch-feed_timestamp if feed_timestamp else None,
            feed_age_at_report_seconds=time.time()-feed_timestamp if feed_timestamp else None,
            raw_sha256=hashlib.sha256(raw).hexdigest(), matching_reasons=dict(reasons),
            matched_updates_with_stop_timing=timing, matched_updates_with_trip_timestamp=trip_clocks),
        configured_static_head=headers, archived_static_sha256=archive_hash.hexdigest(), static_comparison=static,
        limits=['Read-only public source sample; no source ingestion, activation or dataset writes.',
                'Cached dated static archive compared to current public network, not a fresh static download.',
                'Network activation timestamp/archive identity not exposed; pre-activation safety not checked.',
                'Feed header freshness and timing-field presence do not prove fresh trip forecasts, all-day coverage, physical accuracy or licence compliance.'])
    (args.release/'public-network-sample.json').write_text(json.dumps(network), encoding='utf-8')
    with (args.release/'public-source-check.json').open('x', encoding='utf-8') as f:
        json.dump(report, f, indent=2)
    print(json.dumps({k:v for k,v in report.items() if k != 'static_comparison'}))
    print(json.dumps(dict(static_counts=static.get('counts'), static_scope=static.get('scope'))))


if __name__ == '__main__':
    main()
