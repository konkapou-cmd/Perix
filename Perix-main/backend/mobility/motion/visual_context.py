"""Frozen static traffic inputs for an optical journey, not live congestion.

The first atomic insert wins across workers. Source revisions never relocate
traffic or change the template: they only change its time normalization.
"""
from datetime import datetime, timedelta, timezone
import hashlib
import json
from zoneinfo import ZoneInfo

from pymongo.errors import DuplicateKeyError
from mobility.motion.traffic import traffic_snapshot_for_edges

SCHEMA = 1
MAX_CONTEXT_BYTES = 2_000_000


async def shared_traffic_context(*, identity, generation_id, timeline, progress, edges, region, collection):
    binding = [SCHEMA, identity, generation_id]
    digest = hashlib.sha256(json.dumps(binding, sort_keys=True).encode()).hexdigest()
    key = 'visual-context:' + digest
    stored = await collection.find_one({'_id': key})
    if stored is None:
        midnight = datetime.fromisoformat(identity['service_date']).replace(tzinfo=ZoneInfo(region.timezone))
        legs = []
        for i, (start, end) in enumerate(zip(progress, progress[1:])):
            # Prefer the schedule; if absent freeze the first accepted source
            # departure. Never use wall-clock NOW or the receipt of a delay.
            entry = timeline[i]
            departure = entry.get('scheduled_departure', entry['predicted_departure'])
            when = midnight + timedelta(seconds=float(departure))
            selected = [e for e in edges if e['to_m'] > start and e['from_m'] < end]
            snapshot = await traffic_snapshot_for_edges(selected, when,
                region_id=region.region_id, network_id=region.network_id)
            legs.append(dict(lookup_at=when.isoformat(), **snapshot))
        candidate = dict(_id=key, binding=binding, legs=legs,
            expires_at=datetime.now(timezone.utc)+timedelta(hours=48))
        if len(json.dumps(legs, allow_nan=False).encode()) > MAX_CONTEXT_BYTES:
            raise ValueError('Visual static context exceeds bounded storage')
        try:
            await collection.insert_one(candidate)
            stored = candidate
        except DuplicateKeyError:
            stored = await collection.find_one({'_id': key})
    if (not stored or stored.get('binding') != binding
            or len(stored.get('legs', [])) != len(progress)-1):
        raise ValueError('Incompatible shared visual context')
    return stored['legs']
