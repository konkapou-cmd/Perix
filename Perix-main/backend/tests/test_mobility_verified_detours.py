"""Verified closure selection and stop-pair routing regression tests."""
from mobility.restrictions import restriction_edges_for_pattern, restriction_signature
from mobility.roads import _route_stops_segments_sync


def _closure(**kw):
    base = {
        "verified": True,
        "blocked_modes": ["tram"],
        "route_numbers": ["9"],
        "direction": "both",
        "blocked_edge_ids": ["10:1:2"],
    }
    return {**base, **kw}


def _select(restrictions, *, mode="tram", route_number="9", direction="Reform"):
    return restriction_edges_for_pattern(
        restrictions, mode=mode, route_number=route_number, direction=direction
    )


def test_unverified_text_alert_never_blocks_graph():
    assert _select([_closure(verified=False)]) == (set(), set())
    assert _select([{"effect": "DETOUR", "description_text": "Umleitung"}]) == (set(), set())


def test_closure_is_mode_and_pattern_specific():
    closure = _closure()
    assert _select([closure]) == (set(), {"10:1:2"})
    assert _select([closure], mode="bus") == (set(), set())
    assert _select([closure], route_number="4") == (set(), set())
    one_direction = _closure(direction="Reform")
    assert _select([one_direction], direction="Neustädter See") == (set(), set())


def test_signature_changes_when_closure_starts_or_expires():
    active = _closure()
    empty = restriction_signature([], mode="tram", route_number="9", direction="Reform")
    applied = restriction_signature([active], mode="tram", route_number="9", direction="Reform")
    assert empty == ""
    assert applied and applied != empty
    assert restriction_signature([active], mode="bus", route_number="9", direction="Reform") == ""
    assert _select([_closure(valid_until="2001-01-01T00:00:00+00:00")]) == (set(), set())


def test_a_verified_closed_edge_forces_alternate_route():
    # A straight rail 1--2--3 and a side track 1--4--3.
    # The direct line is shorter; banning 10:1:2 must use the alternative.
    ways = [
        {"id": 10, "nodes": [1, 2, 3], "points": [[52.0, 11.0], [52.0, 11.001], [52.0, 11.002]], "tags": {}},
        {"id": 20, "nodes": [1, 4, 3], "points": [[52.0, 11.0], [52.001, 11.001], [52.0, 11.002]], "tags": {}},
    ]
    stops = [(52.0, 11.0), (52.0, 11.002)]
    normal = _route_stops_segments_sync(stops, ways, mode="tram")
    diverted = _route_stops_segments_sync(stops, ways, mode="tram", blocked_eids={"10:1:2"})
    assert normal["segments"][0]["edge_ids"] == ["10:1:2", "10:2:3"]
    assert diverted["full"]
    assert diverted["segments"][0]["edge_ids"] == ["20:1:4", "20:4:3"]
