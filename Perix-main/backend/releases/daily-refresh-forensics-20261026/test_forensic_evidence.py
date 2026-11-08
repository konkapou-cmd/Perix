"""Assertions on frozen real audit evidence and captured pure deployed helpers.

No network, database access, preparation, activation or runtime edits.
"""
from pathlib import Path
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from collections import Counter
import ast
import json
import typing
import zipfile

import pytest

HERE = Path(__file__).parent


def evidence(name):
    return json.loads((HERE/name).read_bytes())


def deployed(name):
    with zipfile.ZipFile(HERE/'deployed-source-readonly.zip') as z:
        return z.read(name).decode('utf-8-sig')


def pure(name, function_names):
    tree = ast.parse(deployed(name))
    definitions = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in function_names]
    ns = {**vars(typing), 'date': date, 'datetime': datetime, 'timedelta': timedelta, 'ZoneInfo': ZoneInfo}
    exec(compile(ast.Module(body=definitions, type_ignores=[]), name, 'exec'), ns)
    return ns


def test_daily_refresh_was_enabled_and_not_waiting_for_manual_import():
    c = evidence('production-readonly.json')['safe_config']
    assert c['auto_activate'] is True and c['static_url_present'] is True
    assert c['static_interval_hours'] == 6. and c['static_schema_v'] == '12'


def test_midnight_download_and_two_blocked_activation_cycles_are_in_logs():
    rows = evidence('worker-logs-redacted.json')['selected_rows']
    first = next(r for r in rows if r['timestamp'].startswith('2026-10-25T23:00:00'))
    assert 'downloading feed' in first['message']
    assert datetime.fromisoformat(first['timestamp'].replace('Z', '+00:00')).astimezone(ZoneInfo('Europe/Berlin')).date() == date(2026, 10, 26)
    assert sum('candidate NOT activated' in r['message'] for r in rows) == 2
    assert sum('feed hash intentionally left unsynced' in r['message'] for r in rows) == 2


def test_today_timetable_was_parsed_not_reused_as_yesterdays_calendar():
    versions = evidence('production-readonly.json')['versions']
    for n in versions[:2]:
        assert n['service_date'] == '2026-10-26' and n['active'] is False
        assert n['route_trip_counts']['bus']['trips'] == 1805
        assert n['route_trip_counts']['tram']['trips'] == 1971
    active = next(n for n in versions if n['active'])
    assert active['service_date'] == '2026-10-25'
    assert active['route_trip_counts']['bus']['trips'] == 1153


def test_eight_bus_patterns_block_an_otherwise_ready_tram_layer():
    n = evidence('production-readonly.json')['versions'][0]
    g = n['generation_report']
    assert (g['expected'], g['ready'], len(g['blocking_missing'])) == (159, 151, 8)
    assert {p['mode'] for p in n['failed_patterns']} == {'bus'}
    assert Counter(p['route_number'] for p in n['failed_patterns']) == {'56': 4, '57': 2, '59': 2}
    assert sum(b.get('ready') is True and b['mode'] == 'tram' for b in n['bundles']) == 66


def test_deployed_readiness_guard_explains_the_block_without_bypassing_it():
    fn = pure('mobility/generations.py', {'readiness_state'})['readiness_state']
    assert fn(expected=159, ready=151, source_expected=113, source_ready=113,
              blocking_missing=['one-actual-missing-pattern']) == 'BLOCKED_CHANGED_PATTERNS'
    assert fn(expected=159, ready=159, source_expected=113, source_ready=113,
              blocking_missing=[]) == 'READY'


def test_all_stored_geometry_failures_reproduce_with_actual_deployed_functions():
    r = evidence('geometry-forensic.json')
    assert r['all_recorded_failures_reproduced'] is True
    assert len(r['pattern_failures']) == 8
    assert Counter(x['stored_failure']['reason'] for x in r['pattern_failures']) == {
        'GEOMETRY_VALIDATION_FAILED': 5, 'GEOMETRY_INCOMPLETE': 3}


def test_wider_local_bbox_does_not_make_any_of_the_eight_patterns_ready():
    for row in evidence('geometry-forensic.json')['pattern_failures']:
        wide = row['cases'][1]
        assert wide['bbox_margin'] == .02
        assert wide['missing_pairs'] or wide['validation']['valid'] is False


def test_far_snap_and_graph_disconnection_are_not_small_numeric_tolerances():
    rows = evidence('geometry-forensic.json')['pattern_failures']
    assert max(s['nearest_node_distance_m'] for r in rows for s in r['cases'][0]['snaps']) > 3500
    pairs = [p for r in rows for p in r['cases'][0]['missing_pairs']]
    assert any(not p['same_weak_component'] for p in pairs)
    assert any(p['same_weak_component'] for p in pairs)


def test_native_handover_already_advances_the_old_plan_to_now():
    t = evidence('native-event-forensic-precise.json')['trace'][-1]
    assert t['state_age_s'] == 69
    assert t['saved_progress_m'] == pytest.approx(2328.210493088606)
    assert t['old_plan_now_progress_m'] == pytest.approx(2851.3136456223506)
    assert t['advance_since_previous_state_m'] == pytest.approx(523.1031525337444)
    assert t['actual_handover']['progress_m'] == t['old_plan_now_progress_m']


def test_paired_now_anchor_replay_does_not_reduce_the_target_conflict():
    p = evidence('native-event-forensic-precise.json')['paired_replay']
    assert p['anchor_progress_difference_m'] == p['anchor_speed_difference_kmh'] == 0.
    assert p['independent_now_target_error_s'] == p['as_implemented_target_error_s']
    assert p['as_implemented_target_error_s'] == pytest.approx(122.56450193645207)
    assert p['stale_anchor_counterfactual_not_actual']['target_error_s'] > 160


def test_subsecond_receipt_precision_is_small_and_does_not_explain_122_seconds():
    s = evidence('native-event-forensic-precise.json')['paired_replay']['receipt_subsecond_check']
    assert s['fractional_second'] == pytest.approx(.165823)
    assert s['anchor_progress_delta_m'] == pytest.approx(1.257138174843476)
    assert abs(s['target_error_delta_s']) < .1


def test_arithmetic_is_same_stop_same_time_and_has_no_signal_hold():
    p = evidence('native-event-forensic-precise.json')['paired_replay']
    assert p['next_stop_id'] == '71585' and p['stop_sequence'] == 5
    assert p['old_eta_service_s']-p['new_eta_service_s'] == 186
    assert p['old_target_remaining_at_common_now_s'] == 143
    assert p['new_target_remaining_s'] == -43
    assert p['physical_reference_remaining_s']-p['new_target_remaining_s'] == p['as_implemented_target_error_s']
    assert p['previous_margin_at_same_now_s'] == pytest.approx(63.435498063547925)
    assert p['signal_hold_s'] == 0
    assert sum(e['physical_time_s'] for e in p['road_time_breakdown']) == pytest.approx(p['physical_reference_remaining_s'])


def test_old_propagated_target_became_a_new_explicit_past_stop_anchor():
    d = evidence('native-event-forensic-precise.json')
    previous = d['raw_trip_491847'][2]; current = d['raw_trip_491847'][3]
    assert not any(s['stop_id'] == '71585' for s in previous['stops'])
    stop = next(s for s in current['stops'] if s['stop_id'] == '71585')
    assert stop['arrival']['time'] == stop['departure']['time'] == 1793005440
    assert stop['arrival']['delay'] == -60
    assert current['feed_epoch']-stop['arrival']['time'] == 25


def test_sparse_target_revisions_match_the_two_changed_propagation_origins():
    rows = evidence('native-event-forensic-precise.json')['propagation']
    assert [r['target_revision_s'] for r in rows] == [68, 62]
    for r in rows:
        assert all(e['assert_propagation'] for e in r['entries'])
        old, new = [e['origin'] for e in r['entries']]
        assert old['stop_sequence'] != new['stop_sequence']
        assert (new['predicted_departure']-new['scheduled_departure'])-(old['predicted_departure']-old['scheduled_departure']) == r['target_revision_s']


def test_feed_header_freshness_is_not_claimed_as_vehicle_observation_freshness():
    d = evidence('native-event-forensic-precise.json')
    assert all(r['source_clock_basis'] == 'FEED_HEADER' for r in d['raw_trip_491847'])
    assert max(t['source_age_s'] for t in d['trace']) < 90
    assert d['native_freshness_default_s'] == 180
    assert d['independent_vehicle_truth'] is None


@pytest.mark.parametrize('day,seconds', [((2026, 10, 25), 90000), ((2026, 3, 29), 82800)])
def test_deployed_midnight_wait_handles_dst_elapsed_time(day, seconds):
    fn = pure('mobility/schedule_revision.py', {'seconds_until_next_service_day'})['seconds_until_next_service_day']
    now = datetime(*day, tzinfo=ZoneInfo('Europe/Berlin'))
    assert fn(now, 0) == seconds


def test_civil_schedule_date_is_not_the_0400_display_grouping_date():
    clock = pure('mobility/service_clock.py', {'_static_service_date', 'service_seconds'})
    display = pure('mobility/schedule_revision.py', {'service_day_for'})['service_day_for']
    now = datetime(2026, 10, 26, 0, 1, tzinfo=ZoneInfo('Europe/Berlin'))
    assert clock['_static_service_date'](now, 'Europe/Berlin') == '2026-10-26'
    assert display(now, 4).isoformat() == '2026-10-25'
    event = datetime.fromtimestamp(1793005483, ZoneInfo('Europe/Berlin'))
    assert clock['service_seconds'](event, '2026-10-26', 'Europe/Berlin') == 36283


def test_no_source_or_production_mutation_was_made_for_this_audit():
    b = evidence('source-boundary-verification.json')
    assert b['runtime_source_edits_this_audit'] == b['production_mutations_this_audit'] == 0
    assert b['native_report_unchanged'] is True


def test_native_case_uses_a_retained_validated_generation_not_an_activation_blocker():
    c = evidence('case-geometry-context.json')
    assert c['pattern_is_one_of_eight_activation_blockers'] is False
    assert c['geometry_validation']['valid'] is True
    assert c['geometry_validation']['max_platform_distance_m'] == 27.7
    assert c['case_graph_version'] != c['candidate_current_graph_version']
    assert c['latest_active_refresh_failure_for_same_pattern']['reason'] == 'GEOMETRY_INCOMPLETE'
