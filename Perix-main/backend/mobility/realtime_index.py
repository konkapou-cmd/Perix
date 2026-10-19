"""Shared storage-key contract for a SINGLE current GTFS-RT document per trip.

The existing Mongo unique index is (region_id, network_id, trip_id).
When the active service day or network version switches, the same trip_id
MUST update the existing row instead of upserting a parallel version row.
Readers remain version + service-date scoped; stale rows are not returned.

If a future migration to multi-version realtime history is desired, both the
unique index and write/read contract must be migrated together, explicitly.
"""


def realtime_upsert_filter(doc: dict) -> dict[str, str]:
    """Build an UpdateOne filter compatible with the deployment's unique index.

    Never insert a version/date condition here: those fields belong in $set
    and in READ selectors, and may legitimately change at rollover.
    """
    required = ('region_id', 'network_id', 'trip_id', 'network_version_id', 'service_date')
    missing = [key for key in required if not str(doc.get(key) or '').strip()]
    if missing:
        raise ValueError('Incomplete versioned realtime document: ' + ', '.join(missing))
    return {key: str(doc[key]) for key in ('region_id', 'network_id', 'trip_id')}
