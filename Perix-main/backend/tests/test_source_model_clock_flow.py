"""A model's excess can be carried from upstream, not newly added at a stop."""
from copy import deepcopy

import pytest

from tools.audit_source_model_clock_flow import audit_event


def event():
    return {'timeline': [
        ['university', 14, 76500, 76500, 76568, 76568, 'BETWEEN_STOP_UPDATES', 'anchor', 68],
        ['aok', 15, 76560, 76560, 76628, 76628, 'BETWEEN_STOP_UPDATES', 'anchor', 68],
        ['next', 16, 76620, 76620, 76688, 76688, 'BETWEEN_STOP_UPDATES', 'anchor', 68]],
        'model_timeline': [['university', 14, 76614, 76614], ['aok', 15, 76656, 76656],
                           ['next', 16, 76696, 76696]]}


def test_aok_excess_is_carried_then_recovered_without_added_dwell():
    e = event()
    original = deepcopy(e)
    rows = audit_event(e)['rows']
    aok = rows[1]
    assert aok['source_departure_delay_s'] == 68
    assert aok['model_departure_delay_s'] == 96
    assert aok['carried_model_minus_source_s'] == 46
    assert aok['source_leg_s'] == 60 and aok['model_leg_s'] == 42
    assert aok['recovered_model_excess_s'] == 18
    assert aok['arrival_model_minus_source_s'] == aok['departure_model_minus_source_s'] == 28
    assert aok['model_dwell_s'] == aok['source_dwell_s'] == 0
    assert rows[2]['arrival_model_minus_source_s'] == 8
    assert e == original


def test_departure_delay_does_not_masquerade_as_arrival_delay():
    e = event()
    e['model_timeline'][1][3] += 10
    aok = audit_event(e)['rows'][1]
    assert aok['arrival_model_minus_source_s'] == 28
    assert aok['departure_model_minus_source_s'] == 38
    assert aok['model_dwell_s'] == 10


@pytest.mark.parametrize('bad', ['identity', 'length', 'clock', 'backwards', 'order', 'missing'])
def test_invalid_paired_diagnostics_fail_closed(bad):
    e = event()
    if bad == 'identity': e['model_timeline'][1][0] = 'other-platform'
    if bad == 'length': e['model_timeline'].pop()
    if bad == 'clock': e['timeline'][1][4] = float('nan')
    if bad == 'backwards': e['model_timeline'][1][3] = 0
    if bad == 'order': e['timeline'][1][1] = e['model_timeline'][1][1] = 14
    if bad == 'missing': e.pop('timeline')
    with pytest.raises(ValueError):
        audit_event(e)
