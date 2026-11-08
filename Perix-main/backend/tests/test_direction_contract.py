from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from mobility.direction_contract import (build_direction_contract, verify_direction_contract,
    direction_key, DirectionContractError)


def fixture():
    points=[[52,11],[52.001,11],[52.001,11.001]]
    pattern=dict(pattern_id='p',route_number='9',mode='tram',direction='C',stop_ids=['A','B','C'],points=[],shape_id=None)
    platforms=[dict(platform_id=s,latitude=p[0],longitude=p[1]) for s,p in zip(pattern['stop_ids'],points)]
    segments=[dict(a_idx=i,b_idx=i+1,start_node_id=i+1,end_node_id=i+2,
        edge_ids=[f'100:{i+1}:{i+2}'],points=points[i:i+2],ok=True) for i in range(2)]
    scope=dict(region_id='r',network_id='n',version_id='v',pattern_id='p')
    return dict(scope=scope,pattern=pattern,points=points,segments=segments,platforms=platforms)


def test_generation_owns_each_occurrence_and_directed_leg_in_source_order():
    args=fixture();before=deepcopy(args);contract=build_direction_contract(**args)
    assert args==before
    assert contract['ordered_stop_ids']==['A','B','C']
    assert contract['origin_stop_id']=='A' and contract['terminal_stop_id']=='C'
    assert [(x['from_stop_id'],x['to_stop_id']) for x in contract['legs']]==[('A','B'),('B','C')]
    assert contract['stop_progress_m'][0]==0
    assert contract['stop_progress_m'][0]<contract['stop_progress_m'][1]<contract['stop_progress_m'][2]
    assert verify_direction_contract(contract,scope=args['scope'],pattern=args['pattern'],points=args['points'])
    opposite={**args['pattern'],'stop_ids':['C','B','A']}
    assert direction_key(opposite)!=contract['direction_key']
    assert not verify_direction_contract(contract,scope=args['scope'],pattern=opposite,points=args['points'])


@pytest.mark.parametrize('bad', ['reversed-points','reversed-edge','disconnected','duplicate','skipped-index',
                               'whole-line-reversed','wrong-platform','incomplete','unready'])
def test_same_point_set_cannot_certify_an_opposite_or_ambiguous_route(bad):
    args=fixture()
    if bad=='reversed-points':args['segments'][0]['points'].reverse()
    elif bad=='reversed-edge':args['segments'][0]['edge_ids']=['100:2:1']
    elif bad=='disconnected':args['segments'][1]['start_node_id']=99
    elif bad=='duplicate':args['segments'][1]=deepcopy(args['segments'][0])
    elif bad=='skipped-index':args['segments'][0]['b_idx']=2
    elif bad=='whole-line-reversed':args['points'].reverse()
    elif bad=='wrong-platform':args['platforms'][0]['platform_id']='C'
    elif bad=='incomplete':args['segments'].pop()
    elif bad=='unready':args['segments'][0]['ok']=False
    with pytest.raises(DirectionContractError):build_direction_contract(**args)


def test_repeated_stop_is_an_occurrence_not_an_endpoint_direction_guess():
    args=fixture();args['pattern']['stop_ids']=['A','B','A'];args['platforms'][2]=deepcopy(args['platforms'][0])
    args['points'][2]=list(args['points'][0]);args['segments'][1].update(points=args['points'][1:],
        end_node_id=1,edge_ids=['100:2:1'])
    contract=build_direction_contract(**args)
    assert contract['origin_stop_id']==contract['terminal_stop_id']=='A'
    assert contract['legs'][0]['from_index']==0 and contract['legs'][1]['to_index']==2
    assert contract['stop_progress_m'][2]>contract['stop_progress_m'][1]>0


def test_shape_identifier_does_not_merge_opposite_source_stop_orders():
    from mobility.domain import _pattern_key
    trip=dict(shape_id='shared',headsign='same text',stop_ids=['A','B','C'])
    reverse={**trip,'stop_ids':['C','B','A']}
    assert _pattern_key(trip)!=_pattern_key(reverse)
    assert _pattern_key({**trip,'shape_id':None})=='same text:A>B>C'


@pytest.mark.asyncio
async def test_builder_never_promotes_a_reversed_leg_even_if_proximity_validator_accepts(monkeypatch):
    from mobility import generations, roads, graph, infrastructure
    args=fixture();collection=SimpleNamespace(replace_one=AsyncMock(),update_one=AsyncMock())
    monkeypatch.setattr(generations,'db',SimpleNamespace(mobility_pattern_generations=collection))
    monkeypatch.setattr(generations,'get_active_region',lambda:SimpleNamespace(region_id='r',network_id='n'))
    monkeypatch.setattr(graph,'validate_geometry',lambda *a:dict(valid=True))
    routed=dict(full=args['points'],segments=args['segments'],missing_pairs=[])
    route=AsyncMock(return_value=routed);monkeypatch.setattr(roads,'compute_pattern_segments',route)
    monkeypatch.setattr(infrastructure,'derive_pattern_infrastructure',AsyncMock(return_value={'total_m':200,'edges':[]}))
    monkeypatch.setattr(generations,'_mirror_generation_to_legacy',AsyncMock(return_value=None))
    domain={'stops':[{'platforms':args['platforms']}]}
    args['segments'][0]['points'].reverse()
    failed=await generations.build_pattern_generation(network=args['scope'],domain=domain,pattern=args['pattern'],reason='TEST',osm_snapshot_v=1,active_restrictions=[])
    assert failed['reason']=='DIRECTED_ROUTE_VALIDATION_FAILED'
    collection.replace_one.assert_not_awaited()
    args['segments'][0]['points'].reverse()
    ready=await generations.build_pattern_generation(network=args['scope'],domain=domain,pattern=args['pattern'],reason='TEST',osm_snapshot_v=1,active_restrictions=[])
    assert ready['ok']
    assert ready['bundle']['schema_v']==2
    assert ready['bundle']['direction_contract']['ordered_stop_ids']==['A','B','C']
    assert ready['bundle']['segments'][0]['from_stop_id']=='A'
    collection.replace_one.assert_awaited_once()


def test_direction_sensitive_domain_cache_invalidates_in_place_stop_order_changes():
    from mobility.domain import build_domain
    route=dict(route_number='9',mode='tram',stops=[dict(stop_id='A',lat=52,lng=11),
        dict(stop_id='B',lat=52.001,lng=11)],trips=[dict(trip_id='t',shape_id='shared',headsign='B',stop_ids=['A','B'])])
    network=dict(region_id='r',network_id='n',version_id='direction-cache-test',service_date='2026-11-03',routes=[route])
    first=build_domain(network,'n')
    route['trips'][0]['stop_ids'].reverse()
    second=build_domain(network,'n')
    assert second is not first
    assert second['patterns'][0]['stop_ids']==['B','A']


@pytest.mark.asyncio
async def test_generation_reuse_rebinds_scope_but_never_opposite_stop_order(monkeypatch):
    from mobility import generations
    args=fixture();contract=build_direction_contract(**args)
    source={**args['scope'],'ready':True,'mode':'tram','route_number':'9','generation_id':'old',
        'pattern_fingerprint':generations.pattern_fingerprint(args['pattern']),'osm_snapshot_v':1,
        'geometry':{'points':args['points'],'geometry_fingerprint':generations.geometry_fingerprint(args['points'])},
        'segments':args['segments'],'infrastructure':{},'direction_contract':contract}
    before=deepcopy(source);collection=SimpleNamespace(replace_one=AsyncMock())
    monkeypatch.setattr(generations,'db',SimpleNamespace(mobility_pattern_generations=collection))
    monkeypatch.setattr(generations,'get_active_region',lambda:SimpleNamespace(region_id='r',network_id='n'))
    monkeypatch.setattr(generations,'_mirror_generation_to_legacy',AsyncMock(return_value=None))
    target={**args['scope'],'version_id':'next'};domain={'stops':[{'platforms':args['platforms']}]}
    result=await generations.copy_generation_to_version(source,target_network=target,target_pattern=args['pattern'],target_domain=domain)
    assert result['ok'] and source==before
    assert result['bundle']['direction_contract']['scope']['version_id']=='next'
    assert result['bundle']['generation_id']!='old'
    assert all(s['direction_fingerprint']==result['bundle']['direction_contract']['fingerprint'] for s in result['bundle']['segments'])
    collection.replace_one.reset_mock()
    opposite={**args['pattern'],'stop_ids':['C','B','A']}
    rejected=await generations.copy_generation_to_version(source,target_network=target,target_pattern=opposite,target_domain=domain)
    assert rejected['ok'] is False
    collection.replace_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_existing_generation_certification_is_metadata_only_and_compare_and_swap(monkeypatch):
    from mobility import generations
    args=fixture();source={**args['scope'],'ready':True,'mode':'tram','route_number':'9','generation_id':'old',
        'pattern_fingerprint':generations.pattern_fingerprint(args['pattern']),'built_at':'original',
        'geometry':{'points':args['points'],'geometry_fingerprint':'fp'},'segments':args['segments']}
    before=deepcopy(source)
    collection=SimpleNamespace(update_one=AsyncMock(return_value=SimpleNamespace(matched_count=1)))
    monkeypatch.setattr(generations,'db',SimpleNamespace(mobility_pattern_generations=collection))
    assert await generations.certify_existing_generation(source,args['pattern'],args['platforms'])
    query,update=collection.update_one.call_args.args
    assert query['generation_id']=='old' and query['built_at']=='original' and query['direction_contract'] is None
    assert set(update['$set'])=={'direction_contract','direction_certified_at'}
    assert source==before
    collection.update_one.return_value=SimpleNamespace(matched_count=0)
    assert await generations.certify_existing_generation(source,args['pattern'],args['platforms']) is False
    collection.update_one.reset_mock()
    source['direction_contract']={'fingerprint':'untrusted'}
    with pytest.raises(DirectionContractError):
        await generations.certify_existing_generation(source,args['pattern'],args['platforms'])
    collection.update_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_marker_consumes_generation_leg_boundaries_even_at_repeated_coordinates(monkeypatch):
    from routes import mobility as routes
    from mobility import domain, generations, geometry_cache
    region=routes.get_active_region();points=[[52,11],[52.001,11],[52,11],[52,11.001]]
    stops=[dict(stop_id='A',lat=52,lng=11),dict(stop_id='B',lat=52.001,lng=11),dict(stop_id='C',lat=52,lng=11.001)]
    trip=dict(trip_id='loop',headsign='C',shape_id='shared',stop_ids=['A','B','A','C'],
        stop_sequences=[0,1,2,3],
        stop_times_sequence=[dict(stop_id=s,stop_sequence=i,arrival_time=f'12:0{i}',departure_time=f'12:0{i}')
            for i,s in enumerate(['A','B','A','C'])])
    route=dict(route_number='9',mode='tram',stops=stops,trips=[trip],shapes={'shared':points})
    pid=domain._pattern_id('9',domain._pattern_key(trip))
    network=dict(region_id=region.region_id,network_id=region.network_id,version_id='directed-loop',service_date='2026-11-03')
    source=domain.pattern_source_for_trip(route,trip)
    nodes=[1,2,1,3]
    segments=[dict(a_idx=i,b_idx=i+1,start_node_id=nodes[i],end_node_id=nodes[i+1],
        edge_ids=[f'100:{nodes[i]}:{nodes[i+1]}'],points=points[i:i+2]) for i in range(3)]
    bundle={**network,'pattern_id':pid,'ready':True,'generation_id':'g','mode':'tram','route_number':'9',
        'pattern_fingerprint':generations.pattern_fingerprint(source),'segments':segments,
        'geometry':{'points':points,'source':'OSM_RAIL'}}
    get=AsyncMock(return_value=bundle)
    monkeypatch.setattr(generations,'atomic_generations_enabled',lambda:True)
    monkeypatch.setattr(generations,'get_pattern_generation',get)
    geometry_cache.clear();routes._TRIP_PATH_CACHE.clear()
    try:
        timeline=routes._predicted_stop_timeline(route,trip,None)
        path=await routes._trip_path_geometry(route,trip,timeline,network)
        assert path and path['direction_contract']['ordered_stop_ids']==['A','B','A','C']
        assert path['stop_progress'][2]>path['stop_progress'][1]>path['stop_progress'][0]
        assert path['stop_progress']==path['direction_contract']['stop_progress_m']
        assert await routes._trip_path_geometry(route,{**trip,'trip_id':'other'},timeline,network) is path
        assert get.await_count==1
        # Even if the DB mock hands out the same point set for an opposite trip,
        # the scope/order proof fails; no marker-side reverse or fallback.
        opposite={**trip,'stop_ids':list(reversed(trip['stop_ids'])),'shape_id':'shared'}
        reversed_timeline=list(reversed(timeline))
        assert await routes._trip_path_geometry(route,opposite,reversed_timeline,network) is None
    finally:
        geometry_cache.clear();routes._TRIP_PATH_CACHE.clear()
