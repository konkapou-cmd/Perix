from copy import deepcopy

from mobility.motion.visual_progress import copy_visual_plan, rebase_visual_leg, sample_visual_plan
from test_visual_progress import plan


def test_copy_on_write_keeps_clock_and_leg_changes_local_without_copying_static_recipe():
    original = plan(60)
    before = deepcopy(original)
    class ReadOnlyRecipe(dict):
        def __deepcopy__(self, memo):
            raise AssertionError('The full static infrastructure must not be copied per poll')
    original['context_recipe'] = ReadOnlyRecipe(infrastructure='static')
    result = copy_visual_plan(original)
    assert result['context_recipe'] is original['context_recipe']
    assert result['legs'][0]['profile'] is original['legs'][0]['profile']
    result['timeline'][0]['predicted_departure'] = 999
    result['legs'][0]['departure_s'] = 999
    assert original['timeline'] == before['timeline']
    assert original['legs'] == before['legs']


def test_rebase_preserves_original_clock_records_and_read_only_profile():
    original = plan(60)
    before = deepcopy(original)
    sample = sample_visual_plan(original, 120)
    updated = rebase_visual_leg(original, index=0, now_s=120,
        displayed_progress_m=sample['progress_m'], expected_identity=original['identity'])
    assert original == before
    assert updated['legs'][0]['profile'] is original['legs'][0]['profile']
    assert sample_visual_plan(updated, 120)['progress_m'] == sample['progress_m']


def test_leg_bounding_preserves_full_route_priors_and_trajectory():
    from types import SimpleNamespace
    from mobility.motion import engine
    from mobility.motion.bus import build_bus_leg
    from mobility.motion.tram import build_tram_leg
    from mobility.motion.config import motion_config_for
    from mobility.motion.visual_curve_context import bounded_infrastructure, topology_neighbors
    points = [[52+(i//2)*.001, 11+(i%2)*.001] for i in range(101)]
    edges = [dict(edge_id=str(i),from_m=i*100,to_m=(i+1)*100,from_node=i,to_node=i+1,
        from_point=points[i],to_point=points[i+1],way={'highway':'secondary','maxspeed_kmh':50}) for i in range(100)]
    edges[80]['from_node'] = 1  # Global branch outside the leg must not be lost.
    infra = dict(edges=edges,signals=[dict(progress_m=250,kinds=['ROAD_SIGNAL','RAIL_SIGNAL'],
        usable_for_motion=True,match_method='NODE_EXACT',signal_id='s')])
    neighbors = topology_neighbors(infra)
    for mode in ('bus','tram'):
        config = {**motion_config_for(mode,SimpleNamespace(motion={})),
            'road_signal_enabled':False,'rail_signal_enabled':False}
        for start,end in ((0,500),(50,450),(90,900),(500,1500)):
            bounded = bounded_infrastructure(infra,start,end)
            full = engine._spatial_slowdown_priors(infra,mode,start,end,{},config)
            short = engine._spatial_slowdown_priors(bounded,mode,start,end,{},config,topology_neighbors=neighbors)
            assert full == short
            kwargs = dict(signals=[],start_m=start,end_m=end,departure_service_s=0,config=config,
                slowdowns=full,slowdown_strength=.35)
            builder = build_bus_leg if mode=='bus' else build_tram_leg
            if mode=='bus':kwargs['traffic_by_edge'] = {}
            assert builder(edges=infra['edges'],**kwargs) == builder(edges=bounded['edges'],**kwargs)
