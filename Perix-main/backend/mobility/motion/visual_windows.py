"""Bounded cache of scheduled windows, never of realtime predictions/positions."""
from collections import OrderedDict
import hashlib
import json

_WINDOWS = OrderedDict()


def clear():
    _WINDOWS.clear()


def scheduled_windows(network, build_window):
    # Hash actual static content as well as dated/version identity, so even an
    # in-place schedule edit cannot reuse old windows. Geometry/source clocks
    # remain separately validated by the normal estimator and shared state.
    signature = hashlib.sha256(json.dumps([network.get('version_id'),network.get('service_date'),
        network.get('routes') or []],sort_keys=True,default=str).encode()).hexdigest()
    key = (signature, id(build_window))
    if key in _WINDOWS:
        _WINDOWS.move_to_end(key)
        return _WINDOWS[key]
    result = [[build_window(route,trip) for trip in route.get('trips',[])] for route in network.get('routes',[])]
    _WINDOWS[key] = result
    while len(_WINDOWS)>2:
        _WINDOWS.popitem(last=False)
    return result
