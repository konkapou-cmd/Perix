"""Differential cap lookup: identical rules, independent of geometry grid."""
import random

import pytest
from mobility.motion.common import _cap_at, _caps_at_positions


@pytest.mark.parametrize('seed',range(12))
def test_sweep_matches_original_point_rule_exactly_for_overlaps_and_gaps(seed):
    rng=random.Random(seed)
    spans=[{'from_m':a,'to_m':a+rng.uniform(.0001,300),
            'speed_cap_kmh':rng.choice([0,.2,1,2,12,25,50,65])}
           for a in (rng.uniform(-20,2000) for _ in range(120))]
    points=[rng.uniform(-50,2400) for _ in range(300)]
    for s in spans:
        for boundary in (s['from_m'],s['to_m']):
            points.extend([boundary-.001001,boundary-.001,boundary,boundary+.001,boundary+.001001])
    positions=sorted(points)
    assert _caps_at_positions(positions,spans)==[_cap_at(p,spans) for p in positions]


@pytest.mark.parametrize('spans',[
    [],
    [{'from_m':0,'to_m':5,'speed_cap_kmh':25}],
    [{'from_m':0,'to_m':5,'speed_cap_kmh':25}, {'from_m':20,'to_m':25,'speed_cap_kmh':2}],
    [{'from_m':0,'to_m':0,'speed_cap_kmh':1}, {'from_m':0,'to_m':10,'speed_cap_kmh':50}],
])
def test_empty_gaps_degenerate_and_inclusive_boundaries_are_unchanged(spans):
    points=[-.002,-.001,0,.001,4.999,5,5.001,5.002,10,19.999,20,25,25.001,30]
    assert _caps_at_positions(points,spans)==[_cap_at(p,spans) for p in points]
