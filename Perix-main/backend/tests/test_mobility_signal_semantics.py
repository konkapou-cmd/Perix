from mobility.signal_semantics import (
    motion_signals_for_infrastructure,
    resolve_signal_instance,
)


def _edge(seq, a, b, p0, p1, follows=True, way_id=10):
    return {
        "seq": seq,
        "edge_id": f"{way_id}:{a}:{b}",
        "way_id": way_id,
        "from_node": a,
        "to_node": b,
        "from_m": p0,
        "to_m": p1,
        "way": {"follows_osm_way": follows},
    }


def _signal(signal_id, progress, direction=None, lat=52.0, lng=11.0):
    tags = {"highway": "traffic_signals"}
    if direction is not None:
        tags["traffic_signals:direction"] = direction
    return {
        "signal_instance_id": f"{signal_id}:0",
        "signal_id": signal_id,
        "kinds": ["ROAD_SIGNAL"],
        "progress_m": progress,
        "latitude": lat,
        "longitude": lng,
        "edge_seq": 0,
        "match_method": "NODE_EXACT",
        "usable_for_motion": True,
        "tags": tags,
    }


def test_forward_direction_matches_path_way_direction():
    edges = [
        _edge(0, 1, 2, 0.0, 100.0, follows=True),
        _edge(1, 2, 3, 100.0, 200.0, follows=True),
    ]
    resolved = resolve_signal_instance(
        _signal(2, 100.0, "forward"),
        edges,
        mode="bus",
    )
    assert resolved["direction_status"] == "MATCH"
    assert resolved["semantic_eligible"] is True


def test_backward_direction_is_rejected_on_forward_path():
    edges = [
        _edge(0, 1, 2, 0.0, 100.0, follows=True),
        _edge(1, 2, 3, 100.0, 200.0, follows=True),
    ]
    resolved = resolve_signal_instance(
        _signal(2, 100.0, "backward"),
        edges,
        mode="bus",
    )
    assert resolved["direction_status"] == "MISMATCH"
    assert resolved["semantic_eligible"] is False


def test_mixed_osm_way_direction_is_ambiguous():
    edges = [
        _edge(0, 1, 2, 0.0, 100.0, follows=True, way_id=10),
        _edge(1, 2, 3, 100.0, 200.0, follows=False, way_id=11),
    ]
    resolved = resolve_signal_instance(
        _signal(2, 100.0, "forward"),
        edges,
        mode="bus",
    )
    assert resolved["direction_status"] == "AMBIGUOUS_PATH_DIRECTION"
    assert resolved["semantic_eligible"] is False


def test_untagged_exact_signal_remains_semantically_eligible():
    edges = [
        _edge(0, 1, 2, 0.0, 100.0, follows=True),
        _edge(1, 2, 3, 100.0, 200.0, follows=True),
    ]
    resolved = resolve_signal_instance(_signal(2, 100.0), edges, mode="bus")
    assert resolved["direction_status"] == "UNTAGGED_EXACT"
    assert resolved["semantic_eligible"] is True


def test_feature_flag_selects_semantic_events(monkeypatch):
    infra = {
        "signal_semantics_schema_v": 1,
        "signals": [_signal(1, 50.0)],
        "signal_events": [
            {
                "signal_event_id": "event-1",
                "signal_instance_id": "event-1",
                "signal_id": 1,
                "kinds": ["ROAD_SIGNAL"],
                "progress_m": 50.0,
                "usable_for_motion": True,
            }
        ],
    }
    monkeypatch.setenv("MOBILITY_SIGNAL_SEMANTICS_ENABLED", "true")
    assert motion_signals_for_infrastructure(infra, "bus")[0]["signal_event_id"] == "event-1"

    monkeypatch.setenv("MOBILITY_SIGNAL_SEMANTICS_ENABLED", "false")
    assert motion_signals_for_infrastructure(infra, "bus")[0]["signal_instance_id"] == "1:0"
