from copy import deepcopy

from mobility.motion.visual_windows import clear, scheduled_windows


def test_scheduled_cache_is_content_bound_not_just_trip_or_version_id():
    clear()
    network = {'version_id':'v','service_date':'2026-11-03','routes':[{'trips':[{'trip_id':'t','end':10}]}]}
    calls = []
    def build(route,trip):
        calls.append(trip['end'])
        return {'end':trip['end']}
    first = scheduled_windows(network,build)
    assert scheduled_windows(deepcopy(network),build) is first
    assert calls == [10]
    network['routes'][0]['trips'][0]['end'] = 20
    assert scheduled_windows(network,build)[0][0]['end'] == 20
    assert calls == [10,20]


def test_realtime_and_cancellation_bypass_scheduled_cache_without_mutating_it(monkeypatch):
    from routes import mobility as routes
    monkeypatch.setenv('MOBILITY_VISUAL_PROGRESS_ENABLED','true')
    clear()
    route = dict(route_number='T',mode='bus',stops=[dict(stop_id='A',lat=52,lng=11),dict(stop_id='B',lat=52.001,lng=11)],
        trips=[dict(trip_id='t',start='10:00',end='10:02',stop_ids=['A','B'],stop_sequences=[1,2],
            stop_times_sequence=[dict(stop_id='A',stop_sequence=1,arrival_time='10:00',departure_time='10:00'),
                                 dict(stop_id='B',stop_sequence=2,arrival_time='10:02',departure_time='10:02')],
            stop_times={'A':'10:00','B':'10:02'})])
    network = dict(version_id='v',service_date='2026-11-03',routes=[route])
    cache = scheduled_windows(network,routes._trip_window)[0]
    before = deepcopy(cache)
    for delay in (60,120):
        rt = {'stop_predictions_by_sequence':{'2':{'stop_id':'B','arrival_delay_seconds':delay,'departure_delay_seconds':delay}}}
        runs = routes._chain_trips(route,{'t':rt},scheduled_windows=cache)
        assert runs[0]['trips'][0]['source_end'] == before[0]['end']+delay
        assert cache == before
    assert routes._chain_trips(route,{'t':{'trip_schedule_relationship':'CANCELED'}},scheduled_windows=cache) == []
