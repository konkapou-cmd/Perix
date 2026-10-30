"""Bounded, default-off recovery of a dated GTFS candidate after graph repair.

Own control metadata only. Uses existing preparation/activation callbacks and
their unchanged readiness gate. No HTTP, routing, geometry creation or new poller.
"""
from datetime import date, datetime, timedelta, timezone
import asyncio
import os
import re
import uuid
from zoneinfo import ZoneInfo
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

MAX_GRAPH_ATTEMPTS = 3
MAX_DAY_ATTEMPTS = 12
COOLDOWN_SECONDS = 300
PREPARATION_TIMEOUT_SECONDS = 600
ACTIVATION_TIMEOUT_SECONDS = 20
LEASE_SECONDS = 900  # Longer than the bounded preparation + activation window.


def enabled():
    return os.getenv('MOBILITY_DAILY_RECOVERY_ENABLED', 'false').lower() == 'true'


def civil_date(now, timezone_name):
    if now.tzinfo is None: raise ValueError('Aware clock required')
    return now.astimezone(ZoneInfo(timezone_name)).date().isoformat()


def next_midnight_seconds(now, timezone_name):
    local = now.astimezone(ZoneInfo(timezone_name))
    tomorrow = local.date()+timedelta(days=1)
    boundary = datetime.combine(tomorrow, datetime.min.time(), tzinfo=ZoneInfo(timezone_name))
    return max(0., boundary.timestamp()-now.timestamp())


class DailyRecovery:
    def __init__(self, collection, *, region_id, network_id, timezone_name,
                 clock=None, enabled_override=None):
        self.collection = collection
        self.key = f'{region_id}:{network_id}'
        self.scope = {'region_id': region_id, 'network_id': network_id}
        self.timezone = timezone_name
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.on = enabled() if enabled_override is None else bool(enabled_override)
        self.explicit_override = enabled_override is not None

    def allowed(self):
        return self.on and (self.explicit_override or enabled())

    async def status(self):
        if not self.allowed(): return {'state': 'DISABLED'}
        return await self.collection.find_one({'_id': self.key}) or {'state': 'EMPTY'}

    async def candidate_for(self, service_date, source_sha256):
        if not self.allowed(): return None
        row = await self.status()
        if row.get('service_date') == service_date and row.get('source_sha256') == source_sha256:
            return row.get('candidate_id')
        return None

    async def register(self, *, service_date, source_sha256, candidate_id):
        if not self.allowed(): return {'state': 'DISABLED'}
        if (date.fromisoformat(service_date).isoformat() != service_date or not candidate_id
                or not re.fullmatch('[0-9a-f]{64}', source_sha256)):
            raise ValueError('Explicit dated candidate and source digest required')
        now = self.clock()
        if civil_date(now, self.timezone) != service_date: return {'state': 'WRONG_SERVICE_DATE'}
        try:
            await self.collection.update_one({'_id': self.key}, {'$setOnInsert': {
                **self.scope, 'fence': 0, 'lease_until': 0., 'day_attempts': 0}}, upsert=True)
        except DuplicateKeyError:
            pass  # Another instance initialized the same unique region control.
        row = await self.collection.find_one({'_id': self.key})
        if (row.get('state') == 'ACTIVATION_OUTCOME_UNKNOWN' and
                (row.get('service_date'), row.get('source_sha256')) != (service_date, source_sha256)):
            return {'state': 'ACTIVATION_OUTCOME_UNKNOWN', 'alarm': row.get('alarm')}
        if row.get('lease_until', 0) > now.timestamp(): return {'state': 'BUSY'}
        if row.get('service_date') == service_date and row.get('source_sha256') == source_sha256:
            return row  # Reuse the first candidate; never create repeated versions as recovery.
        return await self.collection.find_one_and_update(
            {'_id': self.key, 'fence': row['fence'], 'lease_until': row['lease_until']},
            {'$set': {**self.scope, 'service_date': service_date, 'source_sha256': source_sha256,
                'candidate_id': str(candidate_id), 'state': 'PENDING', 'lease_until': 0.,
                'day_attempts': row.get('day_attempts', 0) if row.get('service_date') == service_date else 0,
                'graph_attempts': 0, 'last_graph_v': None, 'last_attempt_at': 0., 'alarm': None},
            '$inc': {'fence': 1}}, return_document=ReturnDocument.AFTER) or {'state': 'BUSY'}

    async def confirm_active(self, candidate_id, service_date):
        """Called only after the worker reads back the scoped, ready active row.

        This clears an ambiguous result; it never promotes a network itself.
        Fence increment prevents an older completion from restoring a stale alarm.
        """
        if not self.allowed(): return {'state': 'DISABLED'}
        row = await self.status()
        if (row.get('candidate_id') != candidate_id or row.get('service_date') != service_date
                or civil_date(self.clock(), self.timezone) != service_date):
            return {'state': 'ACTIVE_CONFIRMATION_MISMATCH'}
        return await self.collection.find_one_and_update(
            {'_id': self.key, 'fence': row['fence'], 'candidate_id': candidate_id, 'service_date': service_date},
            {'$set': {'state': 'ACTIVATED', 'alarm': None, 'lease_until': 0.,
                      'finished_at': self.clock().isoformat()}, '$inc': {'fence': 1}},
            return_document=ReturnDocument.AFTER) or {'state': 'LEASE_LOST'}

    async def attempt(self, *, graph_v, source_version_id, prepare, activate=None):
        if not self.allowed(): return {'state': 'DISABLED'}
        if type(graph_v) is not int or graph_v <= 0: return {'state': 'NO_PINNED_GRAPH'}
        row = await self.status(); now = self.clock(); stamp = now.timestamp()
        if not row.get('candidate_id'): return {'state': 'EMPTY'}
        if row['service_date'] != civil_date(now, self.timezone): return {'state': 'WRONG_SERVICE_DATE'}
        if activate is not None and next_midnight_seconds(now, self.timezone) <= PREPARATION_TIMEOUT_SECONDS+30:
            return {'state': 'DAY_BOUNDARY_NEAR'}
        if row.get('state') in ('ACTIVATED', 'ACTIVATION_OUTCOME_UNKNOWN'):
            return row
        if row.get('lease_until', 0) > stamp: return {'state': 'BUSY'}
        same_graph = row.get('last_graph_v') == graph_v
        if row.get('day_attempts', 0) >= MAX_DAY_ATTEMPTS: return {'state': 'DAY_ATTEMPT_CAP'}
        if same_graph and row.get('graph_attempts', 0) >= MAX_GRAPH_ATTEMPTS:
            return {'state': 'WAIT_FOR_NEW_GRAPH'}
        if same_graph and stamp-row.get('last_attempt_at', 0) < COOLDOWN_SECONDS:
            return {'state': 'COOLDOWN'}
        owner = uuid.uuid4().hex
        claimed = await self.collection.find_one_and_update(
            {'_id': self.key, 'fence': row['fence'], 'lease_until': row['lease_until'],
             'candidate_id': row['candidate_id'], 'service_date': row['service_date']},
            {'$inc': {'fence': 1, 'day_attempts': 1}, '$set': {
                'lease_owner': owner, 'lease_until': stamp+LEASE_SECONDS,
                'last_graph_v': graph_v, 'graph_attempts': row.get('graph_attempts', 0)+1 if same_graph else 1,
                'last_attempt_at': stamp, 'state': 'PREPARING'}},
            return_document=ReturnDocument.AFTER)
        if claimed is None: return {'state': 'BUSY'}
        identity = {'_id': self.key, 'fence': claimed['fence'], 'lease_owner': owner}

        async def owned():
            current = await self.collection.find_one(identity)
            return bool(current and current['lease_until'] > self.clock().timestamp()+30
                        and current['candidate_id'] == claimed['candidate_id'])

        async def finish(state, *, alarm=None, keep_lease=False):
            result = await self.collection.find_one_and_update(identity,
                {'$set': {'state': state, 'alarm': alarm, 'finished_at': self.clock().isoformat(),
                          'lease_until': claimed['lease_until'] if keep_lease else 0.}},
                return_document=ReturnDocument.AFTER)
            return result or {'state': 'LEASE_LOST'}

        try:
            report = await asyncio.wait_for(prepare(claimed['candidate_id'], source_version_id=source_version_id),
                                            timeout=PREPARATION_TIMEOUT_SECONDS)
        except Exception as exc:
            return await finish('PREPARATION_FAILED', alarm={'code': 'DAILY_PREPARATION_FAILED',
                'exception_type': type(exc).__name__})
        if not self.allowed():
            return await finish('PAUSED', alarm={'code': 'RECOVERY_DISABLED_BEFORE_ACTIVATION'})
        if not await owned(): return {'state': 'LEASE_LOST'}
        if (report.get('state') != 'READY' or report.get('blocking_missing')
                or report.get('version_id') != claimed['candidate_id']):
            return await finish('BLOCKED', alarm={'code': 'DAILY_NETWORK_NOT_READY',
                'service_date': claimed['service_date'], 'candidate_id': claimed['candidate_id'],
                'generation_state': report.get('state'), 'missing_patterns': (report.get('blocking_missing') or [])[:256],
                'ready': report.get('ready'), 'expected': report.get('expected')})
        if civil_date(self.clock(), self.timezone) != claimed['service_date']:
            return await finish('DAY_ROLLED_OVER', alarm={'code': 'STALE_DAY_NOT_ACTIVATED'})
        if activate is None: return await finish('READY_NOT_ACTIVATED')
        if next_midnight_seconds(self.clock(), self.timezone) <= 30:
            return await finish('DAY_BOUNDARY_NEAR', alarm={'code': 'STALE_DAY_NOT_ACTIVATED'})
        try:
            result = await asyncio.wait_for(activate(claimed['candidate_id'], require_ready=True, force=False),
                                            timeout=ACTIVATION_TIMEOUT_SECONDS)
        except Exception as exc:
            # Activation may have crossed an await before an exception. Do not
            # automatically retry ambiguous mutations or release ownership early.
            return await finish('ACTIVATION_OUTCOME_UNKNOWN', keep_lease=True,
                alarm={'code': 'ACTIVATION_RECONCILIATION_REQUIRED', 'exception_type': type(exc).__name__})
        if result.get('active') != claimed['candidate_id']:
            return await finish('ACTIVATION_OUTCOME_UNKNOWN', keep_lease=True,
                alarm={'code': 'ACTIVATION_RECONCILIATION_REQUIRED'})
        return await finish('ACTIVATED')
