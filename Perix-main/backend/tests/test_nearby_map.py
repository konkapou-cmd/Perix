import pytest
from unittest.mock import AsyncMock

from routes import mobility as mobility_routes
from mobility import v2


@pytest.fixture(autouse=True)
def clear_nearby_cache():
    v2._NEARBY_CONTEXT_CACHE.clear()
    v2._NEARBY_CONTEXT_INFLIGHT.clear()
    yield
    v2._NEARBY_CONTEXT_CACHE.clear()
    v2._NEARBY_CONTEXT_INFLIGHT.clear()


def _stop(stop_id, platform_id, latitude, longitude, routes):
    return {
        "stop_id": stop_id,
        "stop_ids": [platform_id],
        "name": stop_id,
        "latitude": 51.0,
        "longitude": 12.0,
        "modes": sorted({route["mode"] for route in routes}),
        "routes": routes,
        "platforms": [{
            "platform_id": platform_id,
            "latitude": latitude,
            "longitude": longitude,
            "routes": [route["route_number"] for route in routes],
            "modes": sorted({route["mode"] for route in routes}),
        }],
    }


def test_nearest_stops_rank_real_platforms_and_bound_the_response():
    rows=[
        _stop("parent-centroid-far", "near-platform", 52.1401, 11.6301,
              [{"mode":"bus","route_number":"10"}]),
        _stop("parent-centroid-near", "far-platform", 52.1408, 11.63,
              [{"mode":"tram","route_number":"1"}]),
        _stop("second", "second-platform", 52.141, 11.63,
              [{"mode":"tram","route_number":"2"}]),
        _stop("third", "third-platform", 52.142, 11.63,
              [{"mode":"bus","route_number":"3"}]),
        _stop("outside", "outside-platform", 52.2, 11.63,
              [{"mode":"bus","route_number":"4"}]),
    ]
    before=repr(rows)
    result=v2._nearest_boarding_places(rows,52.14,11.63,limit=3,radius_m=3000)
    assert [row["stop_id"] for row in result]==[
        "parent-centroid-far","parent-centroid-near","second"]
    assert result[0]["nearest_platform_id"]=="near-platform"
    assert result[0]["nearby_distance_m"] < 20
    assert all(row["stop_id"]!="outside" for row in result)
    close_only=v2._nearest_boarding_places(rows,52.14,11.63,limit=1,radius_m=150)
    assert [row["stop_id"] for row in close_only]==["parent-centroid-far"]
    assert close_only[0]["nearby_distance_m"]<=150
    assert repr(rows)==before


def test_zoomed_viewport_returns_only_the_visible_stations_in_three_two_one_order():
    rows=[_stop(f"s{i}",f"p{i}",52.14+i*0.001,11.63,
                [{"mode":"tram","route_number":str(i)}]) for i in range(3)]
    assert len(v2._nearest_boarding_places(rows,52.14,11.63,limit=3,radius_m=3000,
        bounds=v2.NearbyMapBounds(min_lat=52.139,max_lat=52.143,min_lng=11.62,max_lng=11.64)))==3
    assert len(v2._nearest_boarding_places(rows,52.14,11.63,limit=3,radius_m=3000,
        bounds=v2.NearbyMapBounds(min_lat=52.139,max_lat=52.1415,min_lng=11.62,max_lng=11.64)))==2
    assert len(v2._nearest_boarding_places(rows,52.14,11.63,limit=3,radius_m=3000,
        bounds=v2.NearbyMapBounds(min_lat=52.139,max_lat=52.1405,min_lng=11.62,max_lng=11.64)))==1


@pytest.mark.asyncio
async def test_nearby_stops_arrive_before_only_their_active_route_lines(monkeypatch):
    network={"version_id":"v1","service_date":"2026-11-06","region_id":"r","network_id":"n",
        "qa_synthetic":True}
    patterns=[
        {"pattern_id":"near-10","route_number":"10","mode":"bus","stop_ids":["near-p","x"]},
        {"pattern_id":"other-direction-10","route_number":"10","mode":"bus","stop_ids":["elsewhere-p","y"]},
        {"pattern_id":"near-1","route_number":"1","mode":"tram","stop_ids":["near-p","z"]},
    ]
    domain={"network":network,"patterns":patterns,"stops":[
        {"stop_id":"near","platforms":[{"platform_id":"near-p","latitude":52.14,"longitude":11.63},
                                                {"platform_id":"x","latitude":52.15,"longitude":11.63}]},
        {"stop_id":"elsewhere","platforms":[{"platform_id":"elsewhere-p","latitude":52.2,"longitude":11.63},
                                                     {"platform_id":"y","latitude":52.21,"longitude":11.63}]},
        {"stop_id":"tram-near","platforms":[{"platform_id":"z","latitude":52.14,"longitude":11.64}]},
    ]}
    nearby=[_stop("near","near-p",52.14001,11.63001,[{"mode":"bus","route_number":"10"}])]
    monkeypatch.setattr(v2,"_physical_map_domains",AsyncMock(return_value=[(network,domain)]))
    monkeypatch.setattr(v2,"_dated_service_domains",AsyncMock(return_value=[(network,{"patterns":patterns})]))
    monkeypatch.setattr(v2,"_stable_stops_with_service",lambda physical,service:nearby)
    monkeypatch.setattr(v2,"_build_map_dated",AsyncMock(return_value={
        "lines":[
            {"pattern_id":"near-10","route_number":"10","mode":"bus","valid":True,"points":[[1,2],[2,3]]},
            {"pattern_id":"other-direction-10","route_number":"10","mode":"bus","valid":True,"points":[[1,2],[2,3]]},
            {"pattern_id":"near-1","route_number":"1","mode":"tram","valid":True,"points":[[1,2],[2,3]]},
        ],"diversion_warnings":[]}))
    from mobility import graph, detour_guard
    monkeypatch.setattr(graph,"get_overlays",AsyncMock(return_value=[]))
    monkeypatch.setattr(detour_guard,"detour_states_for_domain",AsyncMock(return_value={}))
    monkeypatch.setattr(mobility_routes,"_network_service_date",lambda n:n["service_date"])

    request=v2.NearbyMapRequest(latitude=52.14,longitude=11.63,
        bounds=v2.NearbyMapBounds(min_lat=52.13,max_lat=52.15,min_lng=11.62,max_lng=11.64))
    assert request.limit==1 and request.radius_m==150
    stops_result=await v2.v2_nearby_stops(request)
    assert [stop["stop_id"] for stop in stops_result["stops"]]==["near"]
    assert v2._physical_map_domains.await_count==1
    lines_result=await v2.v2_nearby_map(request)
    assert [line["pattern_id"] for line in lines_result["lines"]]==["near-10"]
    assert lines_result["lines"][0]["source"]=="QA_SYNTHETIC", "test geometry must never be attributed to OpenStreetMap"
    assert v2._physical_map_domains.await_count==1,'the second stage reuses the short-lived nearby domain snapshot'
    scoped=v2._build_map_dated.await_args.args[0]
    assert [pattern["pattern_id"] for pattern in scoped["patterns"]]==["near-10"]
    assert {platform["platform_id"] for stop in scoped["stops"] for platform in stop["platforms"]}=={"near-p","x"}

    predecessor_request=v2.NearbyMapRequest(latitude=52.14,longitude=11.63,
        bounds=v2.NearbyMapBounds(min_lat=52.13,max_lat=52.15,min_lng=11.62,max_lng=11.64),
        position_pattern_ids=["other-direction-10","near-1"])
    predecessor_lines=await v2.v2_nearby_map(predecessor_request)
    assert {line["pattern_id"] for line in predecessor_lines["lines"]}=={"near-10","other-direction-10","near-1"}
    expanded=v2._build_map_dated.await_args.args[0]
    assert {pattern["pattern_id"] for pattern in expanded["patterns"]}=={"near-10","other-direction-10","near-1"}, "retained trip patterns need not serve the origin route"


def test_five_nearby_places_are_supported_without_widening_the_radius():
    bounds=v2.NearbyMapBounds(min_lat=52.139,max_lat=52.142,min_lng=11.629,max_lng=11.631)
    request=v2.NearbyMapRequest(latitude=52.14,longitude=11.63,bounds=bounds,limit=5)
    rows=[_stop(f"s{i}",f"p{i}",52.14+i*0.0001,11.63,
                [{"mode":"tram","route_number":str(i)}]) for i in range(6)]
    result=v2._nearest_boarding_places(rows,request.latitude,request.longitude,
        limit=request.limit,radius_m=request.radius_m,bounds=request.bounds)
    assert len(result)==5
    assert [stop["stop_id"] for stop in result]==[f"s{i}" for i in range(5)]
    assert request.radius_m==150


def test_selected_station_can_request_itself_plus_five_neighbours():
    bounds=v2.NearbyMapBounds(min_lat=52.13,max_lat=52.15,min_lng=11.62,max_lng=11.64)
    request=v2.NearbyMapRequest(latitude=52.14,longitude=11.63,bounds=bounds,limit=6,radius_m=3000)
    assert request.limit==6
    with pytest.raises(ValueError):
        v2.NearbyMapRequest(latitude=52.14,longitude=11.63,bounds=bounds,limit=7)


def test_nearby_map_requires_a_small_viewport():
    narrow=v2.NearbyMapBounds(min_lat=52.13,max_lat=52.15,min_lng=11.62,max_lng=11.65)
    wide=v2.NearbyMapBounds(min_lat=52.0,max_lat=52.2,min_lng=11.4,max_lng=11.8)
    assert v2._nearby_bounds_are_compact(narrow)
    assert not v2._nearby_bounds_are_compact(wide)


@pytest.mark.asyncio
async def test_nearby_endpoint_rejects_wide_view_without_building_any_domain(monkeypatch):
    async def forbidden():
        pytest.fail("wide view must not trigger catalogue or geometry reads")
    monkeypatch.setattr(v2,"_physical_map_domains",forbidden)
    request=v2.NearbyMapRequest(latitude=52.14,longitude=11.63,
        bounds=v2.NearbyMapBounds(min_lat=52.0,max_lat=52.2,min_lng=11.4,max_lng=11.8))
    stops=await v2.v2_nearby_stops(request)
    lines=await v2.v2_nearby_map(request)
    assert stops["zoom_required"] is True and stops["stops"]==[]
    assert lines["zoom_required"] is True and lines["lines"]==[]


@pytest.mark.asyncio
async def test_nearby_vehicles_only_returns_requested_route_vehicles_independent_of_map_bounds(monkeypatch):
    network={"version_id":"v1","service_date":"2026-11-06"}
    scoped={"patterns":[
        {"pattern_id":"bus-near","route_number":"10","mode":"bus"},
        {"pattern_id":"tram-near","route_number":"1","mode":"tram"},
    ]}
    context={"zoom_required":False,"stops":[{"stop_id":"near"}],
        "domains":[(network,scoped,{"bus-near","tram-near"})]}
    def vehicle(vehicle_id,pattern_id,route_number,mode,latitude,*,version="v1",service_date="2026-11-06"):
        return {"vehicle_id":vehicle_id,"pattern_id":pattern_id,"trip_id":f"trip-{vehicle_id}",
            "trip_instance_id":f"instance-{vehicle_id}","network_version_id":version,"service_date":service_date,
            "route":{"number":route_number},"mode":mode,"position":{"latitude":latitude,"longitude":11.63}}
    all_rows=[vehicle("bus-near","bus-near","10","bus",52.14),
        vehicle("tram-near","tram-near","1","tram",52.141),
        vehicle("other-route","far","20","bus",52.14),
        vehicle("outside","bus-near","10","bus",52.30),
        vehicle("previous-block","older-bus-pattern","10","bus",52.31),
        vehicle("other-version","bus-near","10","bus",52.14,version="old"),
        vehicle("other-date","bus-near","10","bus",52.14,service_date="2026-11-05")]
    monkeypatch.setattr(v2,"_get_nearby_context",AsyncMock(return_value=context))
    monkeypatch.setattr(v2,"v2_vehicles",AsyncMock(return_value=all_rows))
    request=v2.NearbyVehiclesRequest(latitude=52.14,longitude=11.63,
        bounds=v2.NearbyMapBounds(min_lat=52.13,max_lat=52.15,min_lng=11.62,max_lng=11.64),
        initial_sync=True,vehicle_ids=["bus-near","tram-near","outside","previous-block"])
    result=await v2.v2_nearby_vehicles(request)
    assert [row["vehicle_id"] for row in result]==["bus-near","tram-near","outside","previous-block"]
    assert v2.v2_vehicles.await_args.args[1:] == (True,45,"station-cycle-v2")


@pytest.mark.asyncio
async def test_nearby_vehicles_does_not_read_fleet_until_departure_ids_are_known(monkeypatch):
    context={"zoom_required":False,"stops":[{"stop_id":"near"}],"domains":[]}
    vehicles=AsyncMock()
    monkeypatch.setattr(v2,"_get_nearby_context",AsyncMock(return_value=context))
    monkeypatch.setattr(v2,"v2_vehicles",vehicles)
    request=v2.NearbyVehiclesRequest(latitude=52.14,longitude=11.63,
        bounds=v2.NearbyMapBounds(min_lat=52.139,max_lat=52.141,min_lng=11.629,max_lng=11.631))
    assert await v2.v2_nearby_vehicles(request)==[]
    vehicles.assert_not_awaited()


@pytest.mark.asyncio
async def test_arrival_api_slices_two_row_pages_after_stable_dated_sort(monkeypatch):
    from mobility import arrivals
    rows=[{"trip_id":f"trip-{i}"} for i in range(6)]
    unified=AsyncMock(return_value=rows)
    monkeypatch.setattr(arrivals,"unified_arrivals",unified)
    result=await v2.v2_stop_arrivals("physical:station",platform_id="platform-A",
        visual_rule_version="station-cycle-v2",limit=2,offset=4)
    assert result==rows[4:6]
    assert unified.await_args.args==("physical:station",)
    assert unified.await_args.kwargs["limit"]==6
    assert unified.await_args.kwargs["platform_id"]=="platform-A"
    assert unified.await_args.kwargs["visual_rule_version"]=="station-cycle-v2"
