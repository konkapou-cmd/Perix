"""Controlled departures use the existing solver, without inventing source clocks."""
from datetime import timedelta
from unittest.mock import AsyncMock

import pytest

from mobility.motion import engine
from test_effective_eta_physics import physical
from test_station_reforecast_gate import EPOCH, at, station


async def setup_continuation(case, mode='bus'):
    case.kwargs['mode'] = mode
    case.kwargs['timeline'][1].update(provider_predicted_departure_s=1040,
        departure_timing_basis='DIRECT_STOP_UPDATE')
    case.kwargs['timeline'][2].update(predicted_arrival=1250, predicted_departure=1260,
        provider_predicted_arrival_s=1250, timing_basis='DIRECT_STOP_UPDATE')
    case.kwargs.update(source_update_epoch=None, source_feed_epoch=int(EPOCH.timestamp()+1010),
                       source_receipt_expiry_epoch=EPOCH.timestamp()+1430,
                       source_continuation_validated=True)
    first = await at(case, 1010, initial_sync=True)
    departure = first['effective_timeline'][1]['predicted_departure']
    return first, departure


@pytest.mark.asyncio
@pytest.mark.parametrize('mode', ['bus', 'tram'])
async def test_unchanged_forecast_depends_on_valid_feed_and_departs_from_rest(station, mode):
    first, departure = await setup_continuation(station, mode)
    arrival = first['effective_timeline'][1]['predicted_arrival']
    waiting = await at(station, arrival + 1)
    assert waiting['station_forecast_pending'] and waiting['progress_m'] == 1000
    released = await at(station, departure + 1)
    assert released['progress_m'] == 1000
    assert released['continuation_state'] == 'ESTIMATED'
    assert station.kwargs['source_update_epoch'] is None
    assert released['effective_timeline'][1]['source_predicted_departure'] == 1040
    moving = await at(station, departure + 3)
    assert 1000 < moving['progress_m'] < 3000
    assert 0 < moving['speed_kmh'] <= 50.01
    assert moving['continuation_state'] == 'ESTIMATED'


@pytest.mark.asyncio
@pytest.mark.parametrize('fault', ['missing_feed', 'stale_feed', 'future_feed', 'unvalidated', 'ambiguous', 'no_data', 'scheduled'])
async def test_unsafe_source_never_releases_the_station(station, fault):
    _, departure = await setup_continuation(station)
    if fault == 'missing_feed': station.kwargs['source_feed_epoch'] = None
    if fault == 'stale_feed': station.kwargs['source_feed_epoch'] = int(EPOCH.timestamp())
    if fault == 'future_feed': station.kwargs['source_feed_epoch'] = int(EPOCH.timestamp()+departure+100)
    if fault == 'unvalidated': station.kwargs['source_continuation_validated'] = False
    if fault == 'ambiguous': station.kwargs['timeline'][1]['ambiguous_stop_update'] = True
    if fault == 'no_data': station.kwargs['timeline'][2]['relationship'] = 'NO_DATA'
    if fault == 'scheduled':
        station.kwargs['timeline'][1].pop('departure_timing_basis')
        station.kwargs['timeline'][2].pop('timing_basis')
    # This feeds a gate with the same unsafe evidence, rather than counting a
    # changed key as a newly observed forecast.
    await at(station, 1012, initial_sync=True)
    result = await at(station, max(departure+1, 1200) if fault == 'stale_feed' else departure+1)
    assert result['progress_m'] == 1000
    assert result['station_forecast_pending']


@pytest.mark.asyncio
async def test_loss_of_feed_freezes_at_authorized_point_and_reload_cannot_bypass(station):
    _, departure = await setup_continuation(station)
    await at(station, departure+1)
    moving = await at(station, departure+4)
    station.kwargs['source_continuation_validated'] = False
    frozen = await at(station, departure+5)
    again = await at(station, departure+20, initial_sync=True)
    assert frozen['progress_m'] >= moving['progress_m']
    assert frozen['continuation_state'] == 'EXPIRED' and frozen['motion_preview'] is None
    assert frozen['speed_kmh'] == 0 and frozen['motion_state'] == 'HOLD'
    assert again['progress_m'] == pytest.approx(frozen['progress_m'])
    assert again['continuation_state'] == 'EXPIRED'
    # A later clock/feed refresh cannot promote the held point to a station
    # that the expired trajectory would otherwise have crossed.
    station.kwargs.update(source_continuation_validated=True,
        source_feed_epoch=int(EPOCH.timestamp()+1300))
    much_later = await at(station, 1300, initial_sync=True)
    assert much_later['progress_m'] == pytest.approx(frozen['progress_m'])
    assert much_later['continuation_state'] == 'EXPIRED'


@pytest.mark.asyncio
async def test_new_source_clock_after_expiry_restarts_from_the_held_point(station):
    _, departure = await setup_continuation(station)
    await at(station, departure+1)
    await at(station, departure+4)
    station.kwargs['source_continuation_validated'] = False
    frozen = await at(station, departure+5)
    station.kwargs.update(source_continuation_validated=True,
        source_feed_epoch=int(EPOCH.timestamp()+departure+20),
        source_update_epoch=EPOCH.timestamp()+departure+20)
    resumed = await at(station, departure+20)
    assert resumed['progress_m'] == pytest.approx(frozen['progress_m'], abs=0.1)
    assert resumed['speed_kmh'] == 0
    assert resumed.get('continuation_state') is None
    assert (await at(station, departure+22))['progress_m'] > frozen['progress_m']


@pytest.mark.asyncio
async def test_idle_client_cannot_reinitialize_an_expired_continuation(station):
    _, departure = await setup_continuation(station)
    await at(station, departure+1)
    await at(station, departure+4)
    station.clock.mono += 200
    station.kwargs['source_continuation_validated'] = False
    frozen = await at(station, departure+205, initial_sync=True)
    again = await at(station, departure+210, initial_sync=True)
    assert frozen['continuation_state'] == 'EXPIRED'
    assert again['progress_m'] == pytest.approx(frozen['progress_m'])
    assert again['speed_kmh'] == 0


@pytest.mark.asyncio
async def test_send_time_preview_cannot_cross_the_feed_deadline(station):
    _, departure = await setup_continuation(station)
    # A nearly expired feed authorizes only a short window.
    station.kwargs['source_feed_epoch'] = int(EPOCH.timestamp()+departure+1-178)
    released = await at(station, departure+1)
    assert released['continuation_state'] == 'ESTIMATED'
    sample = engine.sample_cached_publication(trip_id='T', version_id='v', pattern_id='p',
        service_date='2026-10-27', revision=released['motion_plan_revision'],
        estimate_revision=released['estimate_revision'], now_local=EPOCH+timedelta(seconds=departure+10),
        minimum_progress_m=released['progress_m'])
    assert sample['continuation_state'] == 'EXPIRED'
    assert sample['speed_kmh'] == 0 and sample['motion_preview'] is None


@pytest.mark.asyncio
async def test_continuation_respects_a_stricter_configured_feed_age(station, monkeypatch):
    monkeypatch.setenv('MOBILITY_REALTIME_FEED_FRESH_SECONDS','60')
    _, departure = await setup_continuation(station)
    released = await at(station, departure+1)
    assert released['continuation_state'] == 'ESTIMATED'
    sample = engine.sample_cached_publication(trip_id='T', version_id='v', pattern_id='p',
        service_date='2026-10-27', revision=released['motion_plan_revision'],
        estimate_revision=released['estimate_revision'], now_local=EPOCH+timedelta(seconds=1071),
        minimum_progress_m=released['progress_m'])
    assert sample['continuation_state'] == 'EXPIRED'
    assert sample['speed_kmh'] == 0 and sample['motion_preview'] is None


@pytest.mark.asyncio
async def test_publication_cannot_cross_the_receipt_freshness_deadline(station):
    _, departure = await setup_continuation(station)
    station.kwargs['source_receipt_expiry_epoch']=EPOCH.timestamp()+departure+3
    released=await at(station, departure+1)
    sample=engine.sample_cached_publication(trip_id='T', version_id='v', pattern_id='p',
        service_date='2026-10-27', revision=released['motion_plan_revision'],
        estimate_revision=released['estimate_revision'], now_local=EPOCH+timedelta(seconds=departure+4),
        minimum_progress_m=released['progress_m'])
    assert sample['continuation_state']=='EXPIRED'
    assert sample['motion_preview'] is None


@pytest.mark.asyncio
async def test_valid_new_feed_renews_a_lease_without_claiming_a_new_trip_clock(station):
    _, departure = await setup_continuation(station)
    await at(station, departure+1)
    before = await at(station, departure+4)
    station.kwargs['source_feed_epoch'] = int(EPOCH.timestamp()+departure+5)
    after = await at(station, departure+5)
    assert after['progress_m'] >= before['progress_m']
    assert after['continuation_state'] == 'ESTIMATED'
    assert station.kwargs['source_update_epoch'] is None
    assert after['effective_timeline'][2]['source_predicted_arrival'] == 1250


@pytest.mark.asyncio
@pytest.mark.parametrize('fault', ['ambiguous', 'no_data', 'stop_identity'])
async def test_mid_leg_ambiguous_or_different_stop_evidence_cannot_extend_lease(station, fault):
    _, departure = await setup_continuation(station)
    await at(station, departure+1)
    await at(station, departure+3)
    if fault == 'ambiguous': station.kwargs['timeline'][1]['ambiguous_stop_update']=True
    if fault == 'no_data': station.kwargs['timeline'][2]['relationship']='NO_DATA'
    if fault == 'stop_identity': station.kwargs['timeline'][2]['stop_id']='other'
    station.kwargs['source_feed_epoch']=int(EPOCH.timestamp()+departure+4)
    held=await at(station, departure+4)
    assert held['continuation_state']=='EXPIRED' and held['speed_kmh']==0
    assert held['motion_preview'] is None


@pytest.mark.asyncio
async def test_new_relevant_forecast_replans_from_the_current_modeled_position(station):
    _, departure = await setup_continuation(station)
    await at(station, departure+1)
    before = await at(station, departure+4)
    station.kwargs['timeline'][2]['predicted_arrival'] = 1320
    station.kwargs['timeline'][2]['provider_predicted_arrival_s'] = 1320
    station.kwargs['timeline'][2]['predicted_departure'] = 1330
    after = await at(station, departure+5)
    assert after['progress_m'] >= before['progress_m'] - 0.1
    assert after['progress_m'] - before['progress_m'] < 20
    assert after['effective_timeline'][2]['source_predicted_arrival'] == 1320
    assert after.get('continuation_state') is None
    assert not any(v.get('plan',{}).get('estimated_continuation') for v in engine._PLAN_CACHE.values())


@pytest.mark.asyncio
async def test_changed_geometry_does_not_fall_back_to_an_unbound_position(station):
    _, departure = await setup_continuation(station)
    await at(station, departure+1)
    station.kwargs['path'] = {**station.kwargs['path'], 'geometry_fingerprint': 'different'}
    result = await at(station, departure+2)
    assert result['motion_available'] is False
    assert result['fallback_details']['suppress_position'] is True


@pytest.mark.asyncio
async def test_continuation_stops_at_next_nonterminal_station(station):
    station.kwargs['path']['total_m'] = 4000
    station.kwargs['path']['stop_progress'].append(4000.0)
    station.find.return_value['total_m'] = 4000
    station.find.return_value['edges'][0]['to_m'] = 4000
    station.kwargs['timeline'].append({'stop_id':'D', 'scheduled':1500,
        'scheduled_arrival':1500, 'scheduled_departure':1510,
        'predicted_arrival':1500, 'predicted_departure':1510,
        'provider_predicted_arrival_s':1500, 'timing_basis':'DIRECT_STOP_UPDATE',
        'relationship':'SCHEDULED'})
    _, departure = await setup_continuation(station)
    await at(station, departure+1)
    plan=max(engine._PLAN_CACHE.values(), key=lambda value:value['cached_at'])['plan']
    arrival=plan['station_reforecast_gate']['arrival_s']
    now=departure+10
    while now < arrival:
        station.kwargs['source_feed_epoch']=int(EPOCH.timestamp()+now)
        await at(station, now)
        now+=10
    station.kwargs['source_feed_epoch']=int(EPOCH.timestamp()+arrival+1)
    stopped=await at(station, arrival+1)
    assert stopped['progress_m'] == pytest.approx(3000)
    assert stopped['station_forecast_pending'] and stopped['speed_kmh'] == 0


@pytest.mark.asyncio
@pytest.mark.parametrize('expired', [False, True])
@pytest.mark.parametrize('bad_field', [None, 'trip_id', 'network_version_id', 'service_date',
                                       'source_match_validated', 'source_timing_status', 'updated_at',
                                       'trip_schedule_relationship'])
async def test_route_only_passes_validated_exact_dated_source_to_solver(monkeypatch, bad_field, expired):
    from routes import mobility as routes
    from mobility import motion
    timeline=[{'stop_id':'A','predicted_arrival':990,'predicted_departure':1000,'relationship':'SCHEDULED'},
              {'stop_id':'B','predicted_arrival':1100,'predicted_departure':1110,'relationship':'SCHEDULED'}]
    path={'pattern_id':'p','stop_progress':[0,1000], 'total_m':1000,
          'points':[[52,11],[52.01,11]]}
    monkeypatch.setattr(routes, 'MOTION_ENGINE_ENABLED', True)
    monkeypatch.setattr(routes, '_predicted_stop_timeline', lambda *args: timeline)
    monkeypatch.setattr(routes, '_trip_path_geometry', AsyncMock(return_value=path))
    monkeypatch.setattr(routes, '_raw_timeline_progress', lambda *args: 0)
    monkeypatch.setattr(routes, '_point_heading_at_progress', lambda *args: ({'lat':52,'lng':11},0))
    receipt='2026-10-27T00:16:50+00:00'
    monkeypatch.setattr(routes, '_iso_is_fresh', lambda value, age: value == receipt)
    state='EXPIRED' if expired else 'ESTIMATED'
    solver=AsyncMock(return_value={'motion_available':True,'progress_m':0,'next_timeline_index':1,
                                  'distance_to_next_stop_m':1000,
                                  'effective_timeline':timeline, 'continuation_state':state})
    monkeypatch.setattr(motion, 'position_for_trip', solver)
    realtime={'trip_id':'T','network_version_id':'v','service_date':'2026-10-27',
              'source_match_validated':True,'feed_timestamp':123,'updated_at':receipt}
    if bad_field: realtime[bad_field]='bad' if bad_field != 'source_match_validated' else False
    if bad_field == 'trip_schedule_relationship': realtime[bad_field]='CANCELED'
    result=await routes._estimate_trip_position({'mode':'bus','stops':[]}, {'trip_id':'T'}, 1010,
        {'T':realtime}, version_id='v', network={'version_id':'v','service_date':'2026-10-27'})
    assert solver.await_args.kwargs['source_continuation_validated'] is (bad_field is None)
    assert solver.await_args.kwargs['source_feed_epoch'] == 123
    assert result['motion']['continuation_state'] == state
    if expired:
        assert result['next_stop_eta_seconds'] is None
        assert result['next_stop_predicted_arrival'] is None
        assert result['next_stop_eta_source'] == 'UNKNOWN'
