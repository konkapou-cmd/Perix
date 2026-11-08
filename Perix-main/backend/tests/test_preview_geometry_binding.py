"""Publication identifies the exact geometry used by a preview, not just its line."""
from datetime import timedelta
import pytest
from test_motion_preview import plan, EPOCH
from mobility.approach import path_fingerprint
from mobility.motion import engine


def test_preview_exports_existing_canonical_geometry_fingerprint(plan):
    build, path, timeline = plan
    path = {**path, 'points': [[52.0, 11.0], [52.001, 11.0], [52.002, 11.001]]}
    current = build()
    sample = engine._sample_trip_plan(current, 15, timeline, path['stop_progress'])
    preview = engine._motion_preview(current, 15, EPOCH + timedelta(seconds=15), path,
                                     'revision', 'journey', sample['progress_m'])
    assert preview['approach_geometry_fingerprint'] == path_fingerprint(path['points'])
    assert preview['revision'] == 'revision' and preview['journey_id'] == 'journey'


def test_missing_geometry_never_claims_an_identity(plan):
    build, path, timeline = plan
    current = build()
    sample = engine._sample_trip_plan(current, 15, timeline, path['stop_progress'])
    preview = engine._motion_preview(current, 15, EPOCH + timedelta(seconds=15), path,
                                     'revision', 'journey', sample['progress_m'])
    assert preview['approach_geometry_fingerprint'] is None


def test_invalid_geometry_fails_closed_without_breaking_position_publication(plan):
    build, path, timeline = plan
    path = {**path, 'points': [[52.0], [52.001, 11.0]]}
    current = build()
    sample = engine._sample_trip_plan(current, 15, timeline, path['stop_progress'])
    preview = engine._motion_preview(current, 15, EPOCH + timedelta(seconds=15), path,
                                     'revision', 'journey', sample['progress_m'])
    assert preview['approach_geometry_fingerprint'] is None
