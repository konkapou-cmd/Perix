from mobility.rebuild_queue import RebuildRequestQueue


def test_targeted_requests_coalesce():
    q = RebuildRequestQueue()
    q.request({"a", "b"}, reason="RESTRICTION")
    q.request({"b", "c"}, reason="MANUAL")
    r = q.drain()
    assert not r.all_patterns
    assert r.pattern_ids == {"a", "b", "c"}
    assert r.reasons == ["MANUAL", "RESTRICTION"]
    assert not q.pending()


def test_full_request_supersedes_targeted_requests():
    q = RebuildRequestQueue()
    q.request({"a"}, reason="RESTRICTION")
    q.request(None, reason="OSM_SNAPSHOT")
    q.request({"b"}, reason="LATER_TARGET")
    r = q.drain()
    assert r.all_patterns
    assert r.pattern_ids is None
    assert set(r.reasons) == {"RESTRICTION", "OSM_SNAPSHOT", "LATER_TARGET"}
