"""Read-only raw SIRI/GTFS/INSA trial. No positions or production ingestion.

Source frame labels are preserved; GTFS dates are proven by absolute aimed times.
Legacy minute-only GTFS matches are candidates, NOT second-precision acceptance.
"""
from collections import Counter
from datetime import datetime, timezone, timedelta
import argparse
import hashlib
import json
import math
import re
from pathlib import Path
import sys
import time
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mobility.service_clock import service_seconds
from mobility.realtime_trip_identity import _time_seconds
from mobility.realtime_freshness import is_recent_feed_generation, is_recent_trip_update

NS = '{http://www.siri.org.uk/siri}'
MAX_BYTES = 8 * 1024 * 1024
SOURCE_URL = 'https://stc.traines.eu/mirror/german-delfi-siri/sachsen-anhalt/latest-sachsen-anhalt.siri.xml'


def epoch(value):
    if not isinstance(value, str):
        return None
    try:
        d = datetime.fromisoformat(value.replace('Z','+00:00'))
        return d.timestamp() if d.tzinfo is not None else None
    except (ValueError, OverflowError):
        return None


def text(element, name):
    return element.findtext(NS+name) if element is not None else None


def parse_siri(raw):
    if len(raw) > MAX_BYTES:
        raise ValueError('SIRI research capture exceeds 8 MiB')
    decoded = raw.decode('utf-8-sig')
    if '<!DOCTYPE' in decoded or '<!ENTITY' in decoded:
        raise ValueError('DTD/entities are not permitted')
    root = ET.fromstring(decoded)
    delivery = root.find(NS+'ServiceDelivery')
    if root.tag != NS+'Siri' or delivery is None or text(delivery,'Status') == 'false':
        raise ValueError('Not a successful SIRI ServiceDelivery')
    response = text(delivery,'ResponseTimestamp')
    records = []
    for frame in root.iter(NS+'EstimatedJourneyVersionFrame'):
        generation = text(frame,'RecordedAtTime') or response
        for j in frame.iter(NS+'EstimatedVehicleJourney'):
            if text(j,'OperatorRef') != 'MVB':
                continue
            framed = j.find(NS+'FramedVehicleJourneyRef')
            calls = []
            for c in j.iter():
                if c.tag not in (NS+'RecordedCall',NS+'EstimatedCall'):
                    continue
                calls.append({'source_stop_ref':text(c,'StopPointRef'), 'visit_number':text(c,'VisitNumber'),
                    'source_call_kind':c.tag.split('}')[-1],
                    'aimed_arrival':text(c,'AimedArrivalTime'), 'aimed_departure':text(c,'AimedDepartureTime'),
                    'expected_arrival':text(c,'ExpectedArrivalTime'), 'expected_departure':text(c,'ExpectedDepartureTime'),
                    'cancelled':text(c,'Cancellation') == 'true',
                    'inaccurate':text(c,'PredictionInaccurate') == 'true'})
            records.append({'source_journey_ref':text(j,'VehicleJourneyRef'),
                'source_dated_journey_ref':text(framed,'DatedVehicleJourneyRef'),
                'source_frame_ref':text(framed,'DataFrameRef'), 'line':text(j,'PublishedLineName'),
                'direction':text(j,'DirectionName'), 'operator':'MVB',
                'line_ref':text(j,'LineRef'),
                'service_mode':'bus' if '_x124_Bus_x124_' in (text(j,'LineRef') or '') else
                    'tram' if '_x124_Strab_x124_' in (text(j,'LineRef') or '') else None,
                'generation_timestamp':generation, 'trip_timestamp':text(j,'RecordedAtTime'),
                'complete':text(j,'IsCompleteStopSequence') == 'true', 'monitored':text(j,'Monitored') == 'true',
                'cancelled':text(j,'Cancellation') == 'true', 'extra':text(j,'ExtraJourney') == 'true',
                'inaccurate':text(j,'PredictionInaccurate') == 'true', 'calls':calls})
    return {'response_timestamp':response,'producer':text(delivery,'ProducerRef'),'journeys':records}


def distance(geo, stop):
    values = (geo.get('lat'),geo.get('lon'),stop.get('lat'),stop.get('lng'))
    if any(type(v) not in (int,float) or not math.isfinite(v) for v in values):
        return math.inf
    lat,lon,a,b = values; radians = math.pi/180
    if not (-90 <= lat <= 90 and -90 <= a <= 90 and -180 <= lon <= 180 and -180 <= b <= 180):
        return math.inf
    h = math.sin((a-lat)*radians/2)**2+math.cos(lat*radians)*math.cos(a*radians)*math.sin((b-lon)*radians/2)**2
    return 6371000*2*math.asin(min(1,math.sqrt(h)))


def platform_candidates(network, catalogue):
    stops = {str(s['stop_id']):s for r in network['routes'] for s in r.get('stops',[])}
    candidates = {}
    for row in catalogue.get('data',[]):
        sid = (row.get('payload') or {}).get('stop_id'); geo = row.get('geo')
        if not sid or not isinstance(geo,dict) or row.get('city_slug') != 'magdeburg':
            continue
        # Keep ALL candidates. Overlap is resolved only by the complete dated
        # route/timetable signature, never by picking the nearest platform.
        candidates.setdefault(sid,set()).update(k for k,s in stops.items() if distance(geo,s) <= 3)
    return candidates


def clock_reasons(j, now):
    errors = []
    generation,trip = epoch(j['generation_timestamp']),epoch(j['trip_timestamp'])
    if generation is None or not is_recent_feed_generation(int(generation),int(now),180):
        errors.append('DOCUMENT_CLOCK_UNAVAILABLE_OR_STALE')
    if trip is None or not is_recent_trip_update(int(trip),int(now),180):
        errors.append('TRIP_CLOCK_UNAVAILABLE_OR_STALE')
    if trip is not None and generation is not None and trip > generation+120:
        errors.append('TRIP_CLOCK_AFTER_DOCUMENT_BOUND')
    if not j['monitored']: errors.append('UNMONITORED')
    if j['cancelled']: errors.append('CANCELLED')
    if j['extra']: errors.append('EXTRA_JOURNEY')
    if j['inaccurate']: errors.append('INACCURATE_PREDICTION')
    return errors


def match_snapshot(snapshot, networks, catalogue, now):
    if type(now) not in (int,float) or not math.isfinite(now):raise ValueError('Finite trial clock required')
    maps = {n['version_id']:platform_candidates(n,catalogue) for n in networks}
    source_keys = Counter((j['source_frame_ref'],j['source_dated_journey_ref']) for j in snapshot['journeys'])
    outcomes = []
    for j in snapshot['journeys']:
        matches = []; errors = clock_reasons(j,now)
        if not j['source_frame_ref'] or not j['source_dated_journey_ref']:
            errors.append('SOURCE_FRAMED_IDENTITY_MISSING')
        if source_keys[(j['source_frame_ref'],j['source_dated_journey_ref'])] != 1:
            errors.append('DUPLICATE_SOURCE_JOURNEY')
        if j['service_mode'] is None:errors.append('SOURCE_MODE_UNVERIFIED')
        if not j['complete']: errors.append('PARTIAL_STOP_SEQUENCE')
        visits = [(c['source_stop_ref'],c['visit_number']) for c in j['calls']]
        if len(set(visits)) != len(visits):errors.append('DUPLICATE_SOURCE_VISIT')
        if j['complete'] and len(set(visits)) == len(visits):
            for n in networks:
                if n.get('region_id') != 'magdeburg' or n.get('network_id') != 'de-magdeburg-mvb':
                    continue
                candidates = [maps[n['version_id']].get(c['source_stop_ref'],set()) for c in j['calls']]
                for route in n['routes']:
                    if route['route_number'] != j['line']:continue
                    if j['service_mode'] is not None and route.get('mode') != j['service_mode']:continue
                    for t in route['trips']:
                        ids = t.get('stop_ids') or []; times = t.get('stop_times_sequence') or []
                        if not ids or len(ids) != len(j['calls']) or len(times) != len(ids):continue
                        if not all(s in options for s,options in zip(ids,candidates)):continue
                        ok = True; exact = t.get('source_time_seconds_preserved') is True; anchors = 0
                        for call,clock in zip(j['calls'],times):
                            for source,key in (('aimed_arrival','arrival_time'),('aimed_departure','departure_time')):
                                value = call[source]
                                if value is None:continue
                                timestamp = epoch(value); scheduled = _time_seconds(clock.get(key))
                                if timestamp is None or scheduled is None:ok=False;break
                                d = datetime.fromtimestamp(timestamp,timezone.utc)
                                coordinate = service_seconds(d,n['service_date'],n.get('timezone','Europe/Berlin'))
                                if coordinate//60 != scheduled//60:ok=False;break
                                exact = exact and coordinate == scheduled and d.microsecond == 0
                                exact = exact and len(str(clock.get(key)).split(':')) == 3
                                anchors += 1
                            if not ok:break
                        if ok and anchors >= 2:
                            matches.append({'target_trip_id':t['trip_id'], 'gtfs_service_date':n['service_date'],
                                'network_version_id':n['version_id'], 'precision':'SECONDS' if exact else 'LEGACY_MINUTES',
                                'planned_anchors':anchors,'target_stop_ids':ids,'target_stop_sequences':t.get('stop_sequences',[])})
        match = matches[0] if len(matches) == 1 else None
        if len(matches) != 1:errors.append('AMBIGUOUS_SIGNATURE' if matches else 'NO_FULL_DATED_SIGNATURE_MATCH')
        if match:
            selected=next(n for n in networks if n['version_id']==match['network_version_id']
                          and n['service_date']==match['gtfs_service_date'])
            activation=epoch(selected.get('activated_at'))
            generation=epoch(j['generation_timestamp'])
            if activation is None:
                errors.append('GTFS_ACTIVATION_UNAVAILABLE')
            if activation is not None and generation is not None and generation < activation:
                errors.append('PRE_ACTIVATION_SOURCE_DOCUMENT')
            if selected.get('generation_state') not in ('ACTIVE_READY','READY'):
                errors.append('GTFS_NETWORK_NOT_READY')
        if match and match['precision'] != 'SECONDS':errors.append('LEGACY_GTFS_SECONDS_UNVERIFIED')
        # Minute candidates remain useful for API comparison, explicitly NOT
        # eligible to publish production timing/positions.
        reference_eligible = match is not None and not [e for e in errors if e != 'LEGACY_GTFS_SECONDS_UNVERIFIED']
        outcomes.append({**j,'match':match,'signature_candidate_count':len(matches),
            'eligible_for_reference_comparison':reference_eligible,
            'eligible_for_marker_trial':match is not None and not errors,
            'rejection_reasons':sorted(set(errors))})
    return {'schema':'perix-siri-readonly-trial-v1','now_epoch':now,'producer':snapshot['producer'],
        'networks':[{'version_id':n['version_id'],'service_date':n['service_date']} for n in networks],
        'counts':{'mvb_records':len(outcomes),'unique_signature_candidates':sum(o['match'] is not None for o in outcomes),
            'fresh_unique_reference_candidates':sum(o['eligible_for_reference_comparison'] for o in outcomes),
            'marker_trial_eligible':sum(o['eligible_for_marker_trial'] for o in outcomes)},
        'rejection_counts':dict(Counter(e for o in outcomes for e in o['rejection_reasons'])),
        'journeys':outcomes,'production_ingestion_authorized':False}


def compare_insa(trial, boards, now):
    comparisons = []
    for j in trial['journeys']:
        if not j['eligible_for_reference_comparison']:continue
        for i,call in enumerate(j['calls']):
            if call['cancelled'] or call['inaccurate']:continue
            aimed,expected = epoch(call['aimed_departure']),epoch(call['expected_departure'])
            if aimed is None or expected is None or expected < now-90:continue
            refs = [r for b in boards if 0 <= now-b['captured_epoch'] <= 30 for r in b['rows']
                if r['source_stop_ref'] == call['source_stop_ref'] and r['line'] == j['line']
                and abs(r['aimed_departure_epoch']-aimed) <= 1]
            if not refs:continue
            forecasts = {r.get('expected_departure_epoch') for r in refs}
            directions = {(r.get('direction') or '').strip().casefold() for r in refs}
            # A through-service and its short leg can appear twice. Compare a
            # unanimous time value ONLY; never choose one reference journey ID.
            predicted = next(iter(forecasts)) if len(forecasts) == 1 and None not in forecasts else None
            delta = expected-predicted if predicted is not None else None
            direction = next(iter(directions)) if len(directions) == 1 else ''
            source_direction = (j['direction'] or '').strip().casefold()
            destination_parent = ':'.join((j['calls'][-1]['source_stop_ref'] or '').split(':')[:3])
            destination_verified = bool(direction and destination_parent and any(
                ':'.join(value.split(':')[:3]) == destination_parent for r in refs for value in r.get('destination_stop_refs',[])))
            direction_verified = bool(direction and source_direction and
                (direction == source_direction or direction.startswith(source_direction+' (') or
                 source_direction.startswith(direction+' (')))
            direction_verified = direction_verified or destination_verified
            comparisons.append({'line':j['line'],'source_journey_ref':j['source_journey_ref'],
                'source_frame_ref':j['source_frame_ref'],'gtfs_service_date':j['match']['gtfs_service_date'],
                'target_trip_id':j['match']['target_trip_id'],'source_stop_ref':call['source_stop_ref'],
                'target_stop_id':j['match']['target_stop_ids'][i], 'source_call_index':i,
                'gtfs_match_precision':j['match']['precision'],'aimed_departure_epoch':aimed,
                'siri_expected_departure_epoch':expected,'insa_expected_departure_epoch':predicted,
                'difference_seconds':delta,'exact_seconds_equal':delta == 0 if delta is not None else None,
                'within_60_seconds':abs(delta) <= 60 if delta is not None else None,
                'reference_entry_count':len(refs),'reference_journey_ids':[r.get('source_jid') for r in refs],
                'reference_forecasts':list(forecasts),
                'direction_verified':direction_verified,
                'status':('COMPARED' if len(refs) == 1 else 'TIME_CONSENSUS_REFERENCE_ID_AMBIGUOUS')
                    if delta is not None and direction_verified else
                    'DIRECTION_UNVERIFIED' if delta is not None else 'AMBIGUOUS_OR_NO_INSA_REALTIME',
                'source_direction':j['direction'],'insa_directions':[r.get('direction') for r in refs]})
    time_compared = ('COMPARED','TIME_CONSENSUS_REFERENCE_ID_AMBIGUOUS')
    return {'comparisons':comparisons,'counts':{'rows':len(comparisons),
        'compared':sum(r['status']=='COMPARED' for r in comparisons),
        'unanimous_time_groups_with_multiple_ids':sum(r['status']=='TIME_CONSENSUS_REFERENCE_ID_AMBIGUOUS' for r in comparisons),
        'time_values_compared':sum(r['status'] in time_compared for r in comparisons),
        'within_60_seconds':sum(r['within_60_seconds'] is True and r['status'] in time_compared for r in comparisons)},
        'limits':['60 seconds is a reporting threshold, NOT a clock/freshness gate change.',
            'Legacy-minute candidates are not production timing acceptance.']}


def hafas_epoch(date, value, offset):
    """Reference clock only: preserve provider date, 24+ hours and explicit zone."""
    if (not isinstance(date,str) or not re.fullmatch('[0-9]{8}',date) or
            not isinstance(value,str) or not re.fullmatch('[0-9]{6}',value) or
            type(offset) is not int or not -840 <= offset <= 840):return None
    h,m,s=int(value[:2]),int(value[2:4]),int(value[4:])
    if h>47 or m>59 or s>59:return None
    try:
        day=datetime.strptime(date,'%Y%m%d').replace(tzinfo=timezone(timedelta(minutes=offset)))
        return (day+timedelta(hours=h,minutes=m,seconds=s)).timestamp()
    except ValueError:return None


def normalize_hafas_board(capture):
    response=capture['response'];res=next((s.get('res') for s in response.get('svcResL',[])
                                         if s.get('meth')=='StationBoard'),None)
    rows=[];errors=Counter()
    for j in (res or {}).get('jnyL',[]):
        stop=j.get('stbStop') or {};common=res['common']
        try:
            loc=common['locL'][stop['locX']];product=common['prodL'][j['prodX']]
            refs=[g['id'] for g in loc.get('globalIdL',[]) if g.get('type')=='A']
            aimed=hafas_epoch(j.get('date'),stop.get('dTimeS'),stop.get('dTZOffset'))
            if not refs or aimed is None:
                errors['MISSING_GLOBAL_ID_OR_EXPLICIT_EVENT_CLOCK']+=1;continue
            products=j.get('prodL') or []
            dest=common['locL'][products[-1]['tLocX']] if products else {}
            rows.append({'source_stop_ref':refs[0],'line':product.get('nameS') or product.get('number'),
                'direction':j.get('dirTxt'),'destination_stop_refs':[g['id'] for g in dest.get('globalIdL',[]) if g.get('type')=='A'],
                'aimed_departure_epoch':aimed,'expected_departure_epoch':hafas_epoch(j.get('date'),stop.get('dTimeR'),stop.get('dTZOffset')),
                'prognosis_type':stop.get('dProgType'),'source_jid':j.get('jid'),'raw_date':j.get('date')})
        except (KeyError,IndexError,TypeError):errors['INVALID_REFERENCE_SCHEMA']+=1
    return {'station':capture.get('station'),'captured_epoch':capture['captured_epoch'],'rows':rows,
        'raw_journeys':len((res or {}).get('jnyL',[])),'normalization_errors':dict(errors)}


def capture_siri(output):
    import httpx
    with httpx.Client(timeout=30,follow_redirects=False) as client:
        with client.stream('GET',SOURCE_URL) as response:
            response.raise_for_status();chunks=[];total=0
            for chunk in response.iter_bytes():
                total += len(chunk)
                if total > MAX_BYTES:raise ValueError('SIRI capture too large')
                chunks.append(chunk)
            raw = b''.join(chunks)
    parse_siri(raw)  # Validate before storing the bounded research capture.
    with output.open('xb') as stream:stream.write(raw)
    return raw


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--xml',type=Path,required=True);p.add_argument('--capture',action='store_true')
    p.add_argument('--networks',type=Path,required=True);p.add_argument('--catalogue',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True);p.add_argument('--insa',type=Path)
    p.add_argument('--now-epoch',type=float,help='Controlled offline clock only')
    a=p.parse_args()
    raw=capture_siri(a.xml) if a.capture else a.xml.read_bytes()
    now=a.now_epoch if a.now_epoch is not None else time.time()
    result=match_snapshot(parse_siri(raw),json.loads(a.networks.read_text(encoding='utf-8')),
                          json.loads(a.catalogue.read_text(encoding='utf-8')),now)
    result['xml_sha256']=hashlib.sha256(raw).hexdigest();result['controlled_clock']=a.now_epoch is not None
    boards=json.loads(a.insa.read_text(encoding='utf-8')) if a.insa else None
    boards=[normalize_hafas_board(b) if 'response' in b else b for b in boards] if boards is not None else None
    result['reference_boards']=boards
    result['comparison']=compare_insa(result,boards,now) if boards is not None else None
    with a.output.open('x',encoding='utf-8') as stream:json.dump(result,stream,indent=2,allow_nan=False)
    print(json.dumps({'output':str(a.output),**result['counts'],'insa_comparison':result['comparison']['counts'] if result['comparison'] else None}))


if __name__ == '__main__':main()
