"""Synthetic and snapshot-ID regression cases. No internet, DB or GPS needed."""
from datetime import datetime, timezone
from mobility.alert_scope import build_alert_scope, scope_alert, selector_local, visible_scoped_alert
from mobility.eta_position import position_eta_consistency
from mobility.display_labels import display_alias


def net():
    return {'version_id': 'net_test', 'routes': [
        {'route_number': '9', 'gtfs_route_ids': ['MVB-R9'], 'gtfs_agency_ids': ['MVB'],
         'stops': [{'stop_id': 'MVB-S1'}, {'stop_id': 'MVB-S2'}],
         'trips': [{'trip_id':'908667', 'gtfs_route_id': 'MVB-R9'}]},
    ]}


def test_genuine_local_alert_allowed():
    scope=build_alert_scope(net())
    result=scope_alert([{'route_id':'MVB-R9', 'agency_id':'MVB'}, {'stop_id':'MVB-S1','agency_id':'MVB'}],scope)
    assert result['accepted'] is True and len(result['entities'])==2


def test_wrong_city_alert_rejected_even_when_record_claims_magdeburg():
    scope=build_alert_scope(net())
    assert not scope_alert([{'route_id':'MUNICH-R62'}],scope)['accepted']
    assert not selector_local({'route_type':3},scope)
    assert not selector_local({'stop_id':'MVB-S1'},scope)  # ambiguous national ID
    assert not selector_local({'route_id':'MVB-R9','agency_id':'MUNICH'},scope)
    assert not scope_alert([],scope)['accepted']


def test_nationwide_megafeed_not_claimed_for_mvb():
    scope=build_alert_scope(net())
    selectors=[{'trip_id':str(200000+i)} for i in range(250)] + [{'trip_id':'908667'}]
    result=scope_alert(selectors,scope)
    assert not result['accepted'] and result['reason']=='MIXED_OR_NATIONWIDE'


def test_mixed_small_coverage_not_claimed():
    scope=build_alert_scope(net())
    assert not scope_alert([{'trip_id':'908667'},{'trip_id':'unknown'}],scope)['accepted']


def test_alert_version_and_scoped_flag_required():
    now=1800000000
    d={'updated_at':datetime.fromtimestamp(now,timezone.utc).isoformat(),
       'network_version_id':'net_test','scope_verified':True,'active_periods':[]}
    assert visible_scoped_alert(d,'net_test',now)
    assert not visible_scoped_alert({**d,'scope_verified':False},'net_test',now)
    assert not visible_scoped_alert(d,'new_net',now)
    assert not visible_scoped_alert({**d,'updated_at':'2020-01-01T00:00:00Z'},'net_test',now)


def test_snapshot_impossible_85_seconds_5km_tram():
    res=position_eta_consistency('tram',85,5357)
    assert res['status']=='INCONSISTENT' and res['required_kmh']>200


def test_snapshot_high_speed_384_seconds_8km_tram():
    res=position_eta_consistency('tram',384,8822)
    assert res['status']=='INCONSISTENT' and res['required_kmh']>80


def test_normal_position_eta_not_overruled():
    assert position_eta_consistency('tram',300,500)['status']=='PLAUSIBLE_LOWER_BOUND_ONLY'
    assert position_eta_consistency('tram',300,None)['status']=='UNKNOWN'
    assert position_eta_consistency('tram',0,500)['status']=='INCONSISTENT'
    assert position_eta_consistency('taxi',100,1000)['status']=='UNKNOWN'


def test_temporary_aliases_disabled_without_operator_manifest(monkeypatch):
    monkeypatch.delenv('MOBILITY_DISPLAY_ALIASES_FILE', raising=False)
    assert display_alias('9:p', '9', 'tram', ['a', 'b'],
                         '2026-10-18', 'any-region', 'any-network') is None


def test_unreviewed_manifest_cannot_change_public_labels(monkeypatch, tmp_path):
    import json
    from pathlib import Path
    ref=json.loads((Path(__file__).parent/'MVB_TEMPORARY_DISPLAY_LABELS_UNREVIEWED.json').read_text())
    path=tmp_path/'ref.json';path.write_text(json.dumps(ref))
    monkeypatch.setenv('MOBILITY_DISPLAY_ALIASES_FILE',str(path))
    assert display_alias('9:764d809e4d','9','tram',['a']*22,'2026-10-18',
                         'magdeburg','de-magdeburg-mvb') is None


def test_approved_generic_manifest_requires_full_identity(monkeypatch, tmp_path):
    import hashlib,json
    payload={'region_id':'another-city','network_id':'another-network',
             'operator_approved':True,'approved_by':'contract-reviewed-operator',
             'valid_from':'2026-10-17','valid_until':'2026-10-21',
             'patterns':{'route1:pattern1':{'label':'1X','route_number':'1',
                         'mode':'bus','stop_count':3,
                         'stop_ids_sha24':hashlib.sha256(b'a|b|c').hexdigest()[:24]}}}
    path=tmp_path/'ref.json';path.write_text(json.dumps(payload))
    monkeypatch.setenv('MOBILITY_DISPLAY_ALIASES_FILE',str(path))
    args=['route1:pattern1','1','bus',['a','b','c'],'2026-10-18','another-city','another-network']
    assert display_alias(*args)['display_route_number']=='1X'
    assert display_alias(*[args[0],args[1],args[2],['c','b','a'],*args[4:]]) is None
    assert display_alias(*[args[0],args[1],args[2],args[3],'2026-10-22',*args[5:]]) is None
    assert display_alias(*[args[0],args[1],args[2],args[3],args[4],'magdeburg',args[6]]) is None
    payload['operator_approved']=False
    path.write_text(json.dumps(payload))
    assert display_alias(*args) is None


def test_mvb_unreviewed_reference_lists_eight_directional_patterns():
    import json
    from pathlib import Path
    data=json.loads((Path(__file__).parent/'MVB_TEMPORARY_DISPLAY_LABELS_UNREVIEWED.json').read_text())
    assert data['operator_approved'] is False
    assert len(data['patterns']) == 8
    assert {p['label'] for p in data['patterns'].values()} == {'1N','1S','9N','9S'}
