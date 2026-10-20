"""Verified closure selection and stop-pair routing regression tests."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

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


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "edge", ["9" * 100000, "9" * 21 + ":1:2", "1:2:3:4", "1:x:3"],
    ids=["oversized", "oversized-component", "extra-component", "non-numeric"],
)
async def test_editor_rejects_invalid_edge_ids(edge, monkeypatch):
    from fastapi import HTTPException
    from routes import mobility as mobility_routes
    from mobility import editor

    monkeypatch.setattr(mobility_routes, "_require_operator", AsyncMock(return_value={}))
    with pytest.raises(HTTPException) as exc:
        await editor.v2_create_restriction({
            "geometry": [[52, 11], [52, 12]], "blocked_edge_ids": [edge],
        }, SimpleNamespace(user_id="synthetic", is_admin=False))
    assert exc.value.status_code == 400
    assert exc.value.detail == "invalid blocked_edge_ids"


@pytest.mark.asyncio
@pytest.mark.parametrize("edge", ["10:1:2", "-10:-1:-2"])
async def test_editor_rebuild_errors_do_not_expose_internal_details(edge, test_db, monkeypatch):
    from routes import mobility as mobility_routes
    from mobility import editor, restrictions

    monkeypatch.setattr(editor, "db", test_db)
    monkeypatch.setattr(mobility_routes, "_require_operator", AsyncMock(return_value={}))
    monkeypatch.setattr(
        restrictions, "invalidate_geometries",
        AsyncMock(side_effect=RuntimeError("internal connection detail")),
    )
    user = SimpleNamespace(user_id="synthetic", is_admin=False)
    created = await editor.v2_create_restriction({
        "geometry": [[52, 11], [52, 12]], "blocked_edge_ids": [edge],
    }, user)
    assert created["blocked_edge_ids"] == [edge]
    assert created["rebuild_queued"] is False
    assert created["rebuild_error"] == "Geometry rebuild failed"
    deleted = await editor.v2_delete_restriction(created["restriction_id"], user)
    assert deleted == {
        "ok": True, "rebuild_queued": False, "rebuild_error": "Geometry rebuild failed",
    }
