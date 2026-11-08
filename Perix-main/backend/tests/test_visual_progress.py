"""Visual progress is source-clock normalized, never observed arrival/speed."""
from copy import deepcopy

import pytest

from mobility.motion.bus import build_bus_leg
from mobility.motion.tram import build_tram_leg
from mobility.motion.common import sample_trajectory
from mobility.motion.visual_progress import build_visual_plan, sample_visual_plan, rebase_visual_leg
from test_mobility_motion_bus_tram import _edges, BUS_CONFIG, TRAM_CONFIG


IDENTITY = dict(region_id='r', network_id='n', version_id='v', service_date='2026-11-02',
                trip_id='t', pattern_id='p', geometry_fingerprint='geometry-a')


def timeline(duration=60):
    return [{'stop_id': 'A', 'stop_sequence': 1, 'predicted_arrival': 100, 'predicted_departure': 110,
             'timing_basis': 'DIRECT_STOP_UPDATE'},
            {'stop_id': 'B', 'stop_sequence': 2, 'predicted_arrival': 110+duration,
             'predicted_departure': 120+duration, 'timing_basis': 'DIRECT_STOP_UPDATE'}]


def profile(mode='tram'):
    if mode == 'tram':
        return build_tram_leg(edges=_edges(), signals=[], start_m=0, end_m=500,
                              departure_service_s=110, config=TRAM_CONFIG)
    return build_bus_leg(edges=_edges(), signals=[], traffic_by_edge={}, start_m=0, end_m=500,
                         departure_service_s=110, config=BUS_CONFIG)


def plan(duration=60, mode='tram'):
    return build_visual_plan(identity=IDENTITY, timeline=timeline(duration), stop_progress=[0, 500],
                             profiles=[profile(mode)])


@pytest.mark.parametrize('mode', ['tram', 'bus'])
@pytest.mark.parametrize('duration', [1, 10, 60, 180])
def test_source_deadline_always_matches_visual_endpoint_without_changing_physics(mode, duration):
    p = profile(mode)
    source = timeline(duration)
    original = deepcopy((p, source))
    v = build_visual_plan(identity=IDENTITY, timeline=source, stop_progress=[0, 500], profiles=[p])
    samples = [sample_visual_plan(v, 110+duration*i/100) for i in range(101)]
    assert samples[0]['progress_m'] == 0
    assert samples[-1]['progress_m'] == 500
    assert samples[-1]['next_stop_eta_seconds'] == 0
    assert all(a['progress_m'] <= b['progress_m'] for a, b in zip(samples, samples[1:]))
    assert all(s['speed_kmh'] is None and s['observed_arrival'] is False for s in samples)
    assert v['timeline'] == source
    assert (p, source) == original
    if duration < p['duration_s']:
        # Existing physical sampler remains uncompressed and is not changed
        # to force its legal trajectory to reach the visual source deadline.
        assert sample_trajectory(p, duration)['progress_m'] < 500


def test_curve_keeps_existing_turn_acceleration_and_braking_shape():
    p = profile()
    v = plan(10)
    assert sample_visual_plan(v, 115)['progress_m'] == pytest.approx(
        sample_trajectory(p, p['duration_s']/2)['progress_m'])
    assert sample_visual_plan(v, 100)['state'] == 'VISUAL_STOP_ESTIMATE'
    assert sample_visual_plan(v, 121)['state'] == 'VISUAL_STOP_ESTIMATE'
    assert sample_visual_plan(v, 131) is None


@pytest.mark.parametrize('duration', [60, 240, 35])
def test_revised_arrival_rebases_remaining_curve_without_rewinding_or_changing_source(duration):
    old = plan(60)
    displayed = sample_visual_plan(old, 130)['progress_m']
    updated = plan(duration)
    before = deepcopy(updated)
    rebased = rebase_visual_leg(updated, index=0, now_s=130, displayed_progress_m=displayed,
                                expected_identity=IDENTITY)
    assert rebased is not None
    assert sample_visual_plan(rebased, 130)['progress_m'] == pytest.approx(displayed)
    deadline = 110+duration
    samples = [sample_visual_plan(rebased, 130+(deadline-130)*i/100) for i in range(101)]
    assert all(a['progress_m'] <= b['progress_m'] for a, b in zip(samples, samples[1:]))
    assert samples[-1]['progress_m'] == 500 and samples[-1]['next_stop_eta_seconds'] == 0
    assert rebased['timeline'] == updated['timeline']
    assert updated == before
    assert rebased['revision'] != updated['revision']


def test_unknown_middle_leg_stays_hidden_and_source_clock_remains_available():
    source = timeline(60)
    source.append({'stop_id': 'A', 'stop_sequence': 3, 'predicted_arrival': 240,
                   'predicted_departure': 250, 'timing_basis': 'DIRECT_STOP_UPDATE'})
    v = build_visual_plan(identity=IDENTITY, timeline=source, stop_progress=[0, 500, 1000],
                          profiles=[None, None])
    s = sample_visual_plan(v, 130)
    assert s['marker_visible'] is False and s['progress_m'] is None
    assert s['next_stop_eta_seconds'] == 40 and s['next_timeline_index'] == 1
    assert v['timeline'] == source


def test_repeated_stop_ids_are_separate_occurrences_and_known_leg_reappears_after_gap():
    source = timeline(60)
    source.append({'stop_id': 'A', 'stop_sequence': 3, 'predicted_arrival': 240,
                   'predicted_departure': 250})
    p = profile()
    shifted = deepcopy(p)
    shifted['start_m'] = 500
    shifted['end_m'] = 1000
    for s in shifted['segments']:
        s['p0'] += 500
        s['p1'] += 500
    v = build_visual_plan(identity=IDENTITY, timeline=source, stop_progress=[0, 500, 1000],
                          profiles=[None, shifted])
    assert sample_visual_plan(v, 130)['marker_visible'] is False
    assert sample_visual_plan(v, 200)['marker_visible'] is True
    at_end = sample_visual_plan(v, 240)
    assert at_end['next_stop_id'] == 'A' and at_end['next_timeline_index'] == 2
    assert at_end['progress_m'] == 1000


@pytest.mark.parametrize('bad', ['generation', 'date', 'trip', 'past-deadline', 'out-of-range'])
def test_rebase_does_not_inherit_other_journey_or_past_deadline(bad):
    v = plan()
    identity = dict(IDENTITY)
    now, progress = 130, 100
    if bad == 'generation': identity['geometry_fingerprint'] = 'other'
    if bad == 'date': identity['service_date'] = '2026-11-03'
    if bad == 'trip': identity['trip_id'] = 'other'
    if bad == 'past-deadline': now = 171
    if bad == 'out-of-range': progress = 501
    assert rebase_visual_leg(v, index=0, now_s=now, displayed_progress_m=progress,
                             expected_identity=identity) is None


@pytest.mark.parametrize('bad', ['nonfinite', 'model-clock', 'inversion', 'adjusted', 'sequence'])
def test_invalid_or_model_adjusted_source_clocks_are_rejected(bad):
    t = timeline()
    if bad == 'nonfinite': t[1]['predicted_arrival'] = float('nan')
    if bad == 'model-clock': t[1]['prediction_basis'] = 'PERIX_MOTION_PLAN'
    if bad == 'inversion': t[1]['predicted_arrival'] = 109
    if bad == 'adjusted': t[1]['timing_order_adjusted'] = True
    if bad == 'sequence': t[1]['stop_sequence'] = 1
    with pytest.raises(ValueError):
        build_visual_plan(identity=IDENTITY, timeline=t, stop_progress=[0, 500], profiles=[profile()])


@pytest.mark.parametrize('bad', ['gap', 'reverse', 'bad-equation', 'missing', 'zero-window'])
def test_bad_or_missing_profile_never_creates_a_shortcut(bad):
    p, t = profile(), timeline()
    if bad == 'gap': p['segments'][1]['t0'] += 1
    if bad == 'reverse': p['segments'][1]['p1'] = -1
    if bad == 'bad-equation': p['segments'][1]['v0'] += 100
    if bad == 'missing': p = None
    if bad == 'zero-window': t[1]['predicted_arrival'] = 110
    v = build_visual_plan(identity=IDENTITY, timeline=t, stop_progress=[0, 500], profiles=[p])
    assert v['legs'][0]['profile'] is None
    assert v['legs'][0]['hidden_reason'] is not None
