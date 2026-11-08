"""Offline smoke tests for the bounded live observation helper."""
import pytest

from tools.live_mobility_read_check import BASE, distance


def test_origin_is_fixed_to_public_mobility_read_api():
    assert BASE == 'https://app.perix.eu/api/mobility/v2/'


def test_distance_is_symmetric_and_does_not_claim_route_distance():
    a, b = (52.1, 11.6), (52.101, 11.6)
    assert distance(a, a) == 0
    assert distance(a, b) == pytest.approx(distance(b, a))
    assert 111 < distance(a, b) < 112
