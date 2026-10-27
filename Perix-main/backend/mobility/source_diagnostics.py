"""Bounded worker-local virtual-timing evidence; no GPS/account data or writes."""
from collections import deque, Counter
import json
import time

MAX_EVENTS = 2048
MAX_BYTES = 4 * 1024 * 1024
TTL_SECONDS = 15 * 60
_events = deque()
_bytes = 0
_dropped = 0


def _prune(now):
    global _bytes, _dropped
    while _events and (now - _events[0][0] > TTL_SECONDS or len(_events) > MAX_EVENTS or _bytes > MAX_BYTES):
        _, size, _ = _events.popleft()
        _bytes -= size
        _dropped += 1


def record_source_event(event):
    global _bytes, _dropped
    # Serialize an immutable compact snapshot. Never retain arbitrary objects,
    # provider credentials, physical vehicles or user/passenger coordinates.
    allowed = {k: event[k] for k in (
        'kind', 'region_id', 'network_id', 'version_id', 'service_date', 'trip_id',
        'pattern_id', 'source_signature', 'reason', 'old_progress_m', 'new_progress_m',
        'anchor_index', 'timeline', 'model_timeline', 'timing_basis', 'model_epoch',
    ) if k in event}
    allowed['recorded_epoch'] = int(time.time())
    try:
        payload = json.dumps(allowed, separators=(',', ':'), ensure_ascii=False, allow_nan=False)
    except (TypeError, ValueError):
        _dropped += 1
        return  # Optional diagnostics must never break fleet computation.
    size = len(payload.encode('utf-8'))
    if size > MAX_BYTES:
        _dropped += 1
        return
    now = time.monotonic()
    _events.append((now, size, payload)); _bytes += size
    _prune(now)


def source_events(*, region_id, network_id, version_id=None, service_date=None, trip_id=None, limit=50):
    _prune(time.monotonic())
    matches = []
    counts = Counter()
    for _, _, payload in _events:
        event = json.loads(payload)
        if event.get('region_id') != region_id or event.get('network_id') != network_id:
            continue
        if version_id is not None and event.get('version_id') != version_id:
            continue
        if service_date is not None and event.get('service_date') != service_date:
            continue
        if trip_id is not None and event.get('trip_id') != trip_id:
            continue
        counts[event.get('kind')] += 1
        matches.append(event)
    return {'events': matches[-max(1, min(100, int(limit))):], 'counts': dict(counts),
            'retained_events': len(matches), 'dropped_events': _dropped,
            'oldest_epoch': matches[0]['recorded_epoch'] if matches else None,
            'retention': 'WORKER_MEMORY_BOUNDED', 'ttl_seconds': TTL_SECONDS,
            'max_events': MAX_EVENTS, 'max_bytes': MAX_BYTES}


def clear_source_events():
    global _bytes, _dropped
    _events.clear(); _bytes = _dropped = 0
