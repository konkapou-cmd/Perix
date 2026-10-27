from mobility.infrastructure import (
    _build_edge_chain,
    _signal_instances,
    _way_attributes,
)


def _segment():
    return {
        "segment_id": "p:0:1",
        "a_idx": 0,
        "b_idx": 1,
        "start_node_id": 10,
        "end_node_id": 12,
        "points": [
            [52.100000, 11.600000],
            [52.100000, 11.601000],
            [52.100000, 11.602000],
        ],
        "edge_ids": ["100:10:11", "100:11:12"],
    }


def test_build_edge_chain_preserves_osm_edge_order_and_progress():
    chain = _build_edge_chain([_segment()])
    assert chain is not None
    assert [e["edge_id"] for e in chain["edges"]] == ["100:10:11", "100:11:12"]
    assert chain["edges"][0]["from_m"] == 0.0
    assert chain["edges"][0]["to_m"] > 0
    assert chain["edges"][1]["from_m"] == chain["edges"][0]["to_m"]
    assert chain["total_m"] > chain["edges"][0]["to_m"]


def test_exact_signal_node_is_motion_usable():
    chain = _build_edge_chain([_segment()])
    signals = [
        {
            "signal_id": 11,
            "latitude": 52.100000,
            "longitude": 11.601000,
            "kinds": ["ROAD_SIGNAL"],
            "tags": {"highway": "traffic_signals"},
        }
    ]
    matched = _signal_instances(chain, signals, "bus")
    assert len(matched) == 1
    assert matched[0]["match_method"] == "NODE_EXACT"
    assert matched[0]["usable_for_motion"] is True
    assert matched[0]["confidence"] == 1.0


def test_spatial_signal_is_diagnostic_only():
    chain = _build_edge_chain([_segment()])
    signals = [
        {
            "signal_id": 999,
            "latitude": 52.100020,
            "longitude": 11.601000,
            "kinds": ["ROAD_SIGNAL"],
            "tags": {"highway": "traffic_signals"},
        }
    ]
    matched = _signal_instances(chain, signals, "bus")
    assert matched
    assert matched[0]["match_method"] == "SPATIAL_NEAR_PATH"
    assert matched[0]["usable_for_motion"] is False
    assert 0 < matched[0]["confidence"] < 1


def test_bus_way_attributes_use_directional_lanes():
    way = {
        "id": 100,
        "name": "Example Straße",
        "nodes": [10, 11, 12],
        "tags": {
            "highway": "primary",
            "maxspeed": "50",
            "lanes": "3",
            "lanes:forward": "2",
            "lanes:backward": "1",
        },
    }
    forward = _way_attributes(way, "bus", 10, 11)
    backward = _way_attributes(way, "bus", 11, 10)
    assert forward["directional_lanes"] == 2
    assert backward["directional_lanes"] == 1
    assert forward["maxspeed_kmh"] == 50.0
