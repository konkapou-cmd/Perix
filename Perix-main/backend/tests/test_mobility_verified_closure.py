import pytest
from mobility.verified_closure import verify_graph_ids

WAY={'id':10, 'nodes':[1,2,3], 'points':[[52.,11.], [52.,11.001], [52.,11.002]]}
LOCATION=[[52.,11.001], [52.,11.002]]


def test_actual_local_graph_way_and_edge_are_verifiable():
    verify_graph_ids(ways=[WAY], blocked_way_ids={10}, blocked_edge_ids={'10:2:3'}, geometry=LOCATION)
    verify_graph_ids(ways=[WAY], blocked_way_ids=set(), blocked_edge_ids={'10:3:2'}, geometry=LOCATION)


def test_reject_absent_way_nonadjacent_nodes_and_wrong_location():
    with pytest.raises(ValueError, match='absent'):
        verify_graph_ids(ways=[WAY], blocked_way_ids={99}, blocked_edge_ids=set(), geometry=LOCATION)
    with pytest.raises(ValueError, match='consecutive'):
        verify_graph_ids(ways=[WAY], blocked_way_ids=set(), blocked_edge_ids={'10:1:3'}, geometry=LOCATION)
    with pytest.raises(ValueError, match='not near'):
        verify_graph_ids(ways=[WAY], blocked_way_ids=set(), blocked_edge_ids={'10:1:2'}, geometry=[[53.,12.],[53.,12.001]])
