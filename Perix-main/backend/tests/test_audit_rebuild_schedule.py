"""Static timing triage is not a physical or realtime solver."""
from tools.audit_rebuild_schedule import pair_check


def test_optimistic_speed_check_with_explicit_tolerance():
    segment = {'points': [[52, 11], [52.001, 11]]}
    result = pair_check(segment, '12:00', '12:00', 60, tolerance_s=0)
    assert result['flagged'] is True
    assert result['optimistic_minimum_s'] > 0
    assert pair_check(segment, '12:00', '12:00', 60, tolerance_s=60)['flagged'] is False


def test_extended_gtfs_service_hour_and_invalid_clock_fail_closed():
    segment = {'points': [[52, 11], [52.001, 11]]}
    assert pair_check(segment, '24:05', '24:06', 65)['scheduled_s'] == 60
    assert pair_check(segment, '24:06', '24:05', 65) is None
    assert pair_check(segment, 'wrong', '24:06', 65) is None
    assert pair_check(segment, '24:05', '24:06', 0) is None
