from mobility.signal_semantics import build_signal_semantics


def _edge(seq, a, b, p0, p1):
    return {
        "seq": seq,
        "edge_id": f"10:{a}:{b}",
        "way_id": 10,
        "from_node": a,
        "to_node": b,
        "from_m": p0,
        "to_m": p1,
        "way": {"follows_osm_way": True},
    }


def _signal(signal_id, progress, lat, lng):
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
        "tags": {"highway": "traffic_signals"},
    }


def test_nearby_heads_collapse_to_one_control_event():
    edges = [
        _edge(0, 1, 2, 0.0, 100.0),
        _edge(1, 2, 3, 100.0, 200.0),
        _edge(2, 3, 4, 200.0, 300.0),
    ]
    signals = [
        _signal(2, 100.0, 52.00000, 11.00000),
        _signal(20, 112.0, 52.00005, 11.00005),
        _signal(21, 124.0, 52.00010, 11.00010),
    ]
    result = build_signal_semantics(signals, edges, mode="bus")
    assert len(result["events"]) == 1
    assert result["events"][0]["member_count"] == 3
    assert result["events"][0]["progress_m"] == 100.0


def test_separate_intersections_remain_separate_events():
    edges = [
        _edge(0, 1, 2, 0.0, 100.0),
        _edge(1, 2, 3, 100.0, 200.0),
        _edge(2, 3, 4, 200.0, 300.0),
    ]
    signals = [
        _signal(2, 100.0, 52.0000, 11.0000),
        _signal(3, 200.0, 52.0010, 11.0010),
    ]
    result = build_signal_semantics(signals, edges, mode="bus")
    assert len(result["events"]) == 2


def test_rejected_direction_member_does_not_make_cluster_unusable():
    edges = [
        _edge(0, 1, 2, 0.0, 100.0),
        _edge(1, 2, 3, 100.0, 200.0),
    ]
    first = _signal(2, 100.0, 52.0000, 11.0000)
    second = _signal(30, 110.0, 52.00002, 11.00002)
    second["tags"]["traffic_signals:direction"] = "backward"
    result = build_signal_semantics([first, second], edges, mode="bus")
    event = result["events"][0]
    assert event["usable_for_motion"] is True
    assert event["eligible_member_count"] == 1
    assert event["rejected_member_count"] == 1
