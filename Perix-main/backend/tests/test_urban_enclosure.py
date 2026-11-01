"""R3 enclosure: math, cap effect, and unknown-means-unknown (no fabrication)."""
from types import SimpleNamespace

import pytest

from mobility.infrastructure import (
    _enclosure,
    build_building_grid,
    building_ring_area_m2,
    way_enclosure,
)
from mobility.motion import bus as bus_module
from mobility.motion import tram as tram_module
from mobility.motion.common import enclosure_factor
from mobility.motion.config import motion_config_for


def cfg(mode):
    return motion_config_for(mode, SimpleNamespace(motion={}))


def square(center, half_deg, ref_lat=52.13):
    la, lo = center
    return [[la - half_deg, lo - half_deg], [la - half_deg, lo + half_deg],
            [la + half_deg, lo + half_deg], [la + half_deg, lo - half_deg]]


def test_ring_area_reasonable_house():
    ring = square((52.13, 11.63), 0.00005)  # ~11.1m x ~6.8m
    assert 60 < building_ring_area_m2(ring) < 90
    assert building_ring_area_m2([[0, 0], [1, 1]]) == 0.0


def test_enclosure_dense_block_vs_open_road():
    dense = [{'ring': square((52.1300 + (i % 5) * 0.0004, 11.6300 + (i // 5) * 0.0004), 0.00008),
              'area_m2': 500.0, 'centroid': [52.1300 + (i % 5) * 0.0004, 11.6300 + (i // 5) * 0.0004]}
             for i in range(25)]
    grid = build_building_grid(dense)
    grid['coverage'] = [[52.0, 11.0, 53.0, 12.0]]
    line = [[52.1300, 11.6290], [52.1300, 11.6330]]
    enc_dense = way_enclosure(line, grid)
    single = build_building_grid([dense[12]])
    single['coverage'] = [[52.0, 11.0, 53.0, 12.0]]
    enc_single = way_enclosure(line, single)
    assert enc_dense is not None and enc_dense > 5 * (enc_single or 0.0)
    open_road = way_enclosure([[52.5, 11.0], [52.5, 11.01]], grid)
    assert open_road == 0.0


def test_outside_coverage_is_unknown_not_open():
    grid = build_building_grid([{'ring': square((52.13, 11.63), 0.0001),
                                 'area_m2': 500.0, 'centroid': [52.13, 11.63]}])
    grid['coverage'] = [[52.12, 11.62, 52.14, 11.64]]
    assert way_enclosure([[53.0, 12.0], [53.01, 12.01]], grid) is None


def test_enclosure_validation():
    assert _enclosure(0.4) == 0.4
    assert _enclosure(None) is None
    assert _enclosure(True) is None
    assert _enclosure(1.5) is None
    assert _enclosure('dense') is None


def test_cap_multiplier_bus_tram_split():
    bus_c, tram_c = cfg('bus'), cfg('tram')
    edge = {'way': {'urban_enclosure': 1.0}}
    assert enclosure_factor(edge, bus_c) == pytest.approx(0.85)
    assert enclosure_factor(edge, tram_c) == pytest.approx(0.90)
    assert enclosure_factor({'way': {}}, bus_c) == 1.0
    assert enclosure_factor({'way': {'urban_enclosure': 9}}, bus_c) == 1.0


def leg_args(way_extra):
    edges = [{'edge_id': 'e', 'from_m': 0.0, 'to_m': 1000.0,
              'way': {'highway': 'primary', 'maxspeed_kmh': 50, **way_extra}}]
    return dict(edges=edges, signals=[], start_m=0.0, end_m=1000.0,
                departure_service_s=0.0, recovery_ratio=0.0, initial_speed_kmh=0.0)


def test_dense_canyon_reduces_duration_but_never_invents_hold():
    bus_c = dict(cfg('bus'), road_signal_enabled=False)
    plain = bus_module.build_bus_leg(traffic_by_edge={}, config=bus_c, **leg_args({}))
    canyon = bus_module.build_bus_leg(traffic_by_edge={}, config=bus_c,
                                      **leg_args({'urban_enclosure': 1.0}))
    assert canyon['duration_s'] > plain['duration_s']
    assert all(s['state'] == 'MOVING' for s in canyon['segments'])
    assert max(s['v1'] for s in canyon['segments']) * 3.6 <= 50 * 0.85 + 0.01
    tram_c = dict(cfg('tram'), rail_signal_enabled=False)
    plain_t = tram_module.build_tram_leg(config=tram_c, **leg_args({}))
    canyon_t = tram_module.build_tram_leg(config=tram_c, **leg_args({'urban_enclosure': 1.0}))
    assert canyon_t['duration_s'] > plain_t['duration_s']
