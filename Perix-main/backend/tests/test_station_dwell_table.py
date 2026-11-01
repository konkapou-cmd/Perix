"""Station dwell table: mode x peak/standard/quiet (user-specified values)."""
from types import SimpleNamespace

from mobility.motion.config import motion_config_for
from mobility.motion.engine import _dwell_period, station_dwell_for


def cfg(mode):
    return motion_config_for(mode, SimpleNamespace(motion={}))


def test_dwell_period_peak_standard_quiet():
    c = cfg('bus')
    assert _dwell_period(7 * 3600, 0, c) == 'peak'
    assert _dwell_period(16 * 3600, 2, c) == 'peak'
    assert _dwell_period(12 * 3600, 0, c) == 'standard'
    assert _dwell_period(12 * 3600, 5, c) == 'standard'  # weekend: no peak
    assert _dwell_period(7 * 3600, 6, c) == 'standard'  # sunday morning: no peak
    assert _dwell_period(22 * 3600, 0, c) == 'quiet'
    assert _dwell_period(4 * 3600, 3, c) == 'quiet'  # wraps midnight


def test_user_specified_table_values():
    assert station_dwell_for('tram', 8 * 3600, 1, cfg('tram')) == 30.0
    assert station_dwell_for('tram', 12 * 3600, 1, cfg('tram')) == 15.0
    assert station_dwell_for('tram', 23 * 3600, 1, cfg('tram')) == 10.0
    assert station_dwell_for('bus', 8 * 3600, 1, cfg('bus')) == 20.0
    assert station_dwell_for('bus', 12 * 3600, 1, cfg('bus')) == 12.0
    assert station_dwell_for('bus', 23 * 3600, 1, cfg('bus')) == 8.0


def test_region_override_and_unconfigured_fallback():
    override = motion_config_for('bus', SimpleNamespace(
        motion={'bus': {'station_dwell_s': {'peak': 25.0, 'standard': 10.0, 'quiet': 5.0}}}))
    assert station_dwell_for('bus', 8 * 3600, 1, override) == 25.0
    assert station_dwell_for('bus', 8 * 3600, 1, {}) == 10.0
