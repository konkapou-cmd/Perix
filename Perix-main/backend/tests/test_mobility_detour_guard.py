"""Pure detour safety and operator line-split diagnostic regressions."""
from mobility.detour_guard_core import audit_generation, audit_line_split, undirected_edge_key


def bundle(sig='', edges=('20:1:4', '20:4:3')):
    return {"ready": True, "restriction_fingerprint": sig,
            "segments": [{"edge_ids": list(edges)}]}


def check(sig='hash9', ways=(), edges=('10:1:2',), b=None, atomic=True):
    return audit_generation(expected_signature=sig, blocked_way_ids=set(ways),
                            blocked_edge_ids=set(edges), bundle=b, atomic_enabled=atomic)


def test_current_verified_detour_can_be_rendered():
    assert check(b=bundle('hash9'))['status'] == 'VERIFIED_DETOUR_READY'


def test_unverified_legacy_without_restrictions_unaffected():
    assert check(sig='', edges=(), b=None, atomic=False)['safe'] is True


def test_reject_last_good_geometry_when_verified_closure_activates():
    assert check(b=bundle(''))['status'] == 'REBUILD_FOR_DETOUR'
    assert check(b=None)['status'] == 'GENERATION_PENDING'
    assert check(b=bundle('hash9'), atomic=False)['status'] == 'ATOMIC_GENERATIONS_REQUIRED'


def test_detect_closed_edge_even_in_matching_generation():
    assert check(b=bundle('hash9', ('10:1:2',)))['status'] == 'CLOSED_EDGE_IN_GENERATION'
    assert check(b=bundle('hash9', ('10:2:1',)))['status'] == 'CLOSED_EDGE_IN_GENERATION'
    assert check(ways=(20,), edges=(), b=bundle('hash9'))['status'] == 'CLOSED_EDGE_IN_GENERATION'


def test_no_edge_trace_is_not_proven_safe():
    assert check(b=bundle('hash9', ()))['status'] == 'MISSING_OSM_EDGE_EVIDENCE'
    assert check(b=bundle('hash9', ('unknown',)))['status'] == 'INVALID_OSM_EDGE_EVIDENCE'


def test_rebuild_when_detour_expires_no_old_detour_path():
    assert check(sig='', edges=(), b=bundle('old'))['status'] == 'REBUILD_AFTER_EXPIRY'
    assert check(sig='', edges=(), b=bundle(''))['safe'] is True


def test_edge_identity_is_physical_segment_not_direction():
    assert undirected_edge_key('10:1:2') == undirected_edge_key('10:2:1')
    assert undirected_edge_key('10:bad:2') is None


def test_9n_9s_splits_are_not_invented_by_router():
    result = audit_line_split(active_route_numbers=['9', '9N'], expected_route_numbers=['9N', '9S'])
    assert not result['match'] and result['missing'] == ['9S']
    assert audit_line_split(active_route_numbers=['9S', '9N'], expected_route_numbers=['9N', '9S'])['match']
