"""Precision-sensitive snaps are diagnostics, not platform validation."""
from mobility.roads import _haversine_m, _nearest_node


def test_simonstrasse_capture_rounding_reverses_the_nearest_node():
    # Public captured coordinate evidence; neither node is asserted to be the
    # actual operating platform. The importer currently rounds to six decimals.
    stop = (52.119106, 11.661122)
    raw = {13850850447: (52.1191225, 11.6611532),
           1667156495: (52.1191270, 11.6611451)}
    rounded = {node: tuple(round(x, 6) for x in point) for node, point in raw.items()}
    assert _nearest_node(raw, *stop) == 13850850447
    assert _nearest_node(rounded, *stop) == 1667156495
    assert abs(_haversine_m(*stop, *raw[13850850447])
               - _haversine_m(*stop, *raw[1667156495])) < 0.01
