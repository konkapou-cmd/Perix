from copy import deepcopy

from mobility.arrivals import _verified_block_predecessor_vehicle
from routes import mobility as routes


def fixture():
    route={"route_number":"7","mode":"bus","stops":[
        {"stop_id":"A","name":"A","lat":52.0,"lng":11.0},
        {"stop_id":"B","name":"B","lat":52.001,"lng":11.0},
        {"stop_id":"C","name":"C","lat":52.002,"lng":11.0},
    ],"trips":[
        {"trip_id":"previous","block_id":"block-verified","headsign":"B","stop_ids":["A","B"],
         "stop_times":{"A":"15:30","B":"15:40"}},
        {"trip_id":"departure","block_id":"block-verified","headsign":"C","stop_ids":["B","C"],
         "stop_times":{"B":"15:45","C":"15:55"}},
    ]}
    network={"version_id":"network-v3","service_date":"2026-11-06","region_id":"r","network_id":"n"}
    templates={"previous":{"trip_id":"previous","pattern_id":"p-previous"},
        "departure":{"trip_id":"departure","pattern_id":"p-departure"}}
    run=routes._chain_trips(route)
    vehicle={"vehicle_id":routes._estimated_vehicle_id(network,"7","previous"),
        "trip_id":"previous","network_version_id":"network-v3","service_date":"2026-11-06",
        "route_number":"7","mode":"bus","pattern_id":"p-previous","estimated":True,
        "run_identity_basis":"GTFS_BLOCK","latitude":52.0005,"longitude":11.0}
    return route,network,templates,run,vehicle


def test_links_one_immediate_predecessor_only_when_the_estimator_verified_the_same_gtfs_block():
    route,network,templates,runs,vehicle=fixture()
    before=deepcopy(route)
    linked=_verified_block_predecessor_vehicle(network,route,route["trips"][1],templates,runs,[vehicle])
    assert linked is vehicle
    assert route==before


def test_no_block_no_estimator_run_identity_or_ambiguous_position_can_link():
    route,network,templates,runs,vehicle=fixture()
    no_block=deepcopy(route["trips"][1]);no_block.pop("block_id")
    assert _verified_block_predecessor_vehicle(network,route,no_block,templates,runs,[vehicle]) is None
    assert _verified_block_predecessor_vehicle(network,route,route["trips"][1],templates,runs,
        [{**vehicle,"run_identity_basis":"DATED_SOURCE_TRIP"}]) is None
    assert _verified_block_predecessor_vehicle(network,route,route["trips"][1],templates,runs,
        [vehicle,{**vehicle}]) is None


def test_only_the_adjacent_trip_and_shared_terminus_are_eligible():
    route,network,templates,runs,vehicle=fixture()
    extended=deepcopy(route)
    second=deepcopy(extended["trips"][1])
    extended["trips"][1]={"trip_id":"middle","block_id":"block-verified","headsign":"B",
        "stop_ids":["B","A"],"stop_times":{"B":"15:45","A":"15:55"}}
    extended["trips"].append({"trip_id":"departure","block_id":"block-verified","headsign":"C",
        "stop_ids":["B","C"],"stop_times":{"B":"16:00","C":"16:10"}})
    extended_templates={**templates,"middle":{"trip_id":"middle","pattern_id":"p-middle"}}
    extended_runs=routes._chain_trips(extended)
    assert _verified_block_predecessor_vehicle(network,extended,extended["trips"][2],extended_templates,
        extended_runs,[vehicle]) is None

    far_terminus=deepcopy(route)
    far_terminus["stops"].append({"stop_id":"D","name":"D","lat":52.01,"lng":11.0})
    far_terminus["trips"][1]["stop_ids"]=["D","C"]
    far_terminus["trips"][1]["stop_times"]={"D":"15:45","C":"15:55"}
    far_runs=routes._chain_trips(far_terminus)
    assert _verified_block_predecessor_vehicle(network,far_terminus,far_terminus["trips"][1],templates,
        far_runs,[vehicle]) is None
