"""GTFS-RT ServiceAlert lifecycle tests, no DB or network required."""
from datetime import datetime, timezone
from mobility.alert_lifecycle import alert_is_current

NOW=1800000000

def alert(**kwargs):
    return {**{"updated_at": datetime.fromtimestamp(NOW,timezone.utc).isoformat()}, **kwargs}

def test_alert_with_no_period_uses_freshness_not_permanent_lifetime():
    assert alert_is_current(alert(active_periods=[]), NOW)
    assert not alert_is_current(alert(updated_at="2020-01-01T00:00:00+00:00"), NOW)
    assert not alert_is_current({},NOW)

def test_alert_respects_start_and_end_and_open_bounds():
    assert alert_is_current(alert(active_periods=[{"start":NOW-100,"end":NOW+100}]), NOW)
    assert not alert_is_current(alert(active_periods=[{"start":NOW+1}]), NOW)
    assert not alert_is_current(alert(active_periods=[{"end":NOW-1}]), NOW)
    assert alert_is_current(alert(active_periods=[{}, {"start":NOW+99}]), NOW)

def test_multiple_intervals_and_epoch_strings_are_supported():
    a=alert(active_periods=[{"start":str(NOW-500),"end":str(NOW-100)},
                            {"start":str(NOW-5),"end":str(NOW+3)}])
    assert alert_is_current(a,NOW)

def test_untrusted_future_updated_at_is_rejected():
    future=datetime.fromtimestamp(NOW+1000,timezone.utc).isoformat()
    assert not alert_is_current(alert(updated_at=future),NOW)
