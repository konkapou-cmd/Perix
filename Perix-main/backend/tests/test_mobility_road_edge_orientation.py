from mobility.roads import _astar


def test_astar_edge_ids_follow_travel_order():
    # Way 10 has OSM node order [1, 2, 3]. The route traverses it BACKWARD
    # (3 -> 2 -> 1). Edge ids arrive from the adjacency in OSM order and
    # must be reoriented to traversal direction, otherwise follows_osm_way
    # and every direction-sensitive attribute derived from it flips.
    adj = {
        3: [(2, 100.0, "10:2:3")],
        2: [(3, 100.0, "10:2:3"), (1, 100.0, "10:1:2")],
        1: [(2, 100.0, "10:1:2")],
    }
    nodes = {
        1: (52.0000, 11.0000),
        2: (52.0000, 11.0010),
        3: (52.0000, 11.0020),
    }
    path, edges = _astar(adj, nodes, 3, 1)
    assert path == [3, 2, 1]
    assert edges == ["10:3:2", "10:2:1"]


def test_astar_edge_ids_forward_order_unchanged():
    adj = {
        1: [(2, 100.0, "10:1:2")],
        2: [(1, 100.0, "10:1:2"), (3, 100.0, "10:2:3")],
        3: [(2, 100.0, "10:2:3")],
    }
    nodes = {
        1: (52.0000, 11.0000),
        2: (52.0000, 11.0010),
        3: (52.0000, 11.0020),
    }
    path, edges = _astar(adj, nodes, 1, 3)
    assert path == [1, 2, 3]
    assert edges == ["10:1:2", "10:2:3"]
