"""Continuous optical scale on existing profiles; no DB/provider access."""
from copy import deepcopy

import pytest

from mobility.motion.config import visual_scale_parameters
from mobility.motion.visual_curve_context import relative_profile
from mobility.motion.visual_progress import build_visual_plan, sample_visual_plan, visual_preview
from test_visual_progress import IDENTITY
from test_visual_runtime import runtime


def road_profile():
    # Existing piecewise-acceleration format: different road-zone envelopes.
    speeds = [0, 10, 25/3, 5, 25/3, 2.5, 25/6, 35/6, 10, 0]
    segments, elapsed = [], 0.0
    for i, (a, b) in enumerate(zip(speeds, speeds[1:])):
        duration = 100/(a+b)
        segments.append(dict(t0=elapsed, t1=elapsed+duration, p0=i*50, p1=(i+1)*50,
                             v0=a, v1=b, state='MOVING'))
        elapsed += duration
    return dict(start_m=0, end_m=len(segments)*50, segments=segments, duration_s=elapsed)


def test_half_marks_are_publication_metadata_not_rounding_or_profile_inputs():
    visual = dict(relative_motion_levels=[1, 2, 3, 4, 5, 6], relative_motion_rate_per_s=1)
    before = deepcopy(visual)
    scale = visual_scale_parameters(visual)
    assert scale['relative_motion_continuous'] is True
    assert scale['relative_motion_fractional_step'] == 0.5
    assert scale['relative_motion_level_marks'] == [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6]
    assert visual == before
    assert relative_profile(road_profile(), visual) == relative_profile(road_profile(), scale)


def test_existing_road_curve_contains_continuous_5_to_3_and_3_to_5_without_changing_provider_windows():
    physical = road_profile()
    original = deepcopy(physical)
    relative = relative_profile(physical, dict(relative_motion_rate_per_s=1))
    assert physical == original
    for pair in ((5, 3), (3, 5)):
        segment = next(s for s in relative['segments']
                       if s['v0'] == pytest.approx(pair[0]) and s['v1'] == pytest.approx(pair[1]))
        levels = [segment['v0']+(segment['v1']-segment['v0'])*t/4 for t in range(5)]
        assert levels == pytest.approx([5, 4.5, 4, 3.5, 3] if pair[0] == 5 else [3, 3.5, 4, 4.5, 5])
    assert any(s['v0'] == pytest.approx(1.5) or s['v1'] == pytest.approx(1.5) for s in relative['segments'])
    assert any(s['v0'] == pytest.approx(2.5) or s['v1'] == pytest.approx(2.5) for s in relative['segments'])
    timeline = [dict(stop_id='A', stop_sequence=1, predicted_arrival=100, predicted_departure=110),
                dict(stop_id='B', stop_sequence=2, predicted_arrival=710, predicted_departure=720)]
    before = deepcopy(timeline)
    plan = build_visual_plan(identity=IDENTITY, timeline=timeline, stop_progress=[0, relative['end_m']], profiles=[relative])
    assert sample_visual_plan(plan, 710)['progress_m'] == relative['end_m']
    assert timeline == before == plan['timeline']


def test_preview_preserves_fractional_endpoints_and_the_same_phase_equation():
    relative = relative_profile(road_profile(), dict(relative_motion_rate_per_s=1))
    timeline = [dict(stop_id='A', stop_sequence=1, predicted_arrival=100, predicted_departure=110),
                dict(stop_id='B', stop_sequence=2, predicted_arrival=710, predicted_departure=720)]
    plan = build_visual_plan(identity=IDENTITY, timeline=timeline, stop_progress=[0, relative['end_m']], profiles=[relative])
    plan['visual_rule_version'] = 'station-relative-v1'
    segment = next(s for s in relative['segments'] if s['v0'] == pytest.approx(5) and s['v1'] == pytest.approx(3))
    virtual = segment['t0']+(segment['t1']-segment['t0'])*.25
    now = 110+virtual/relative['duration_s']*600
    preview = visual_preview(plan, sample_visual_plan(plan, now), now_s=now,
                             sampled_at_ms=100000, journey_id='synthetic', horizon_s=45)
    assert preview['phases'][0]['relative_motion_level0'] == pytest.approx(4.5)
    for p in preview['phases']:
        dt = p['t1']-p['t0']
        assert p['p1'] == pytest.approx(p['p0']+p['v0']*dt+p['a']*dt*dt/2)
        assert 0 <= p['relative_motion_level0'] <= 6.001
        assert 0 <= p['relative_motion_level1'] <= 6.001


@pytest.mark.asyncio
async def test_fractional_annotations_keep_existing_v10_shared_anchors(runtime, monkeypatch):
    from mobility.motion import config, visual_runtime
    kwargs, _, _ = runtime
    visual_runtime.clear_visual_cache()
    original = config.visual_scale_parameters
    monkeypatch.setattr(config, 'visual_scale_parameters', lambda visual: dict(visual))
    before = await visual_runtime.visual_position(**kwargs)
    visual_runtime.clear_visual_cache()
    monkeypatch.setattr(config, 'visual_scale_parameters', original)
    after = await visual_runtime.visual_position(**kwargs)
    assert after is not None and after['revision'] == before['revision']
    assert after['progress_m'] == before['progress_m']
    assert after['preview']['visual_parameters']['relative_motion_fractional_step'] == .5
    visual_runtime.clear_visual_cache()
