from copy import deepcopy
import json

from mobility.public_sources import public_generation


def test_osm_export_is_allowlisted_and_excludes_all_private_or_forecast_fields():
    row = dict(ready=True, pattern_id='p', mode='bus', generation_id='g', osm_snapshot_v=1,
        token='private', geometry={'source':'OSM_ROADS','points':[[52,11],[52.1,11.1]],'private':'no'},
        infrastructure={'edges':[dict(edge_id='1:2:3',from_m=0,to_m=100,from_point=[52,11],to_point=[52.1,11.1],
            secret='no',way={'highway':'secondary','maxspeed_kmh':50,'api_key':'no'})],
            'signals':[dict(signal_id='s',progress_m=50,kinds=['ROAD_SIGNAL'],private='no')]},
        forecast={'arrival':10}, user_id='private')
    before = deepcopy(row)
    data = public_generation(row)
    serialized = json.dumps(data)
    assert row == before
    assert not any(word in serialized for word in ('private','api_key','secret','forecast','user_id','token'))
    assert data['infrastructure']['edges'][0]['way']['maxspeed_kmh'] == 50


def test_unknown_manual_synthetic_and_unready_generations_are_not_offered_as_osm():
    for source in ('QA_SYNTHETIC','PERIX_MANUAL','GTFS_POSITION_FALLBACK',None):
        assert public_generation({'ready':True,'geometry':{'source':source}}) is None
    assert public_generation({'ready':False,'geometry':{'source':'OSM_RAIL'}}) is None
