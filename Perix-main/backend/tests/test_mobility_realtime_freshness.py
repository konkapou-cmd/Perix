from mobility.realtime_freshness import is_recent_feed_generation

def test_fresh_protobuf_header_and_older_feed():
    now=1800000000
    assert is_recent_feed_generation(now-20,now)
    assert is_recent_feed_generation(now-180,now)
    assert not is_recent_feed_generation(now-181,now)

def test_download_age_is_not_feed_age():
    now=1800000000
    assert not is_recent_feed_generation(now-900,now)
    assert is_recent_feed_generation(None,now)  # legacy fallback still checked via updated_at

def test_future_and_invalid_headers_are_not_trusted():
    now=1800000000
    assert not is_recent_feed_generation(now+600,now)
    assert not is_recent_feed_generation('not-time',now)
