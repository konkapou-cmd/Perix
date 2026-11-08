const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(file){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),
 {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,Date,setTimeout,clearTimeout});return exports;}
const publication=load('lib/city/transitPublication.ts'),clock=load('lib/city/serverClock.ts');
function cycle(index,arrival,departure,approach){return {stop_occurrence_index:index,stop_id:String(index),
 modeled_arrival_at_ms:arrival,modeled_departure_at_ms:departure,approach_started_at_ms:approach,
 countdown_event:'DEPARTURE',countdown_target_at_ms:departure,release_condition:'KNOWN_DEPARTURE',
 departure_basis:'SOURCE_EVENT_REFERENCE',cycle_limited:index===0,incoming_leg_available:true,outgoing_leg_available:true};}
function packet(){const a=cycle(0,0,30000,0),b=cycle(1,100000,130000,80000),c=cycle(2,200000,230000,180000);
 const p={schema:2,semantics:'TIME_NORMALIZED_VISUAL_ESTIMATE',physical_speed_assurance:false,visual_rule_version:'station-cycle-v2',
   visual_parameters:{handover_min_ramp_s:2,relative_motion_rate_per_s:1,initial_coverage_s:40,rolling_coverage_s:15,station_stop_lead_s:30,station_approach_lead_s:50},
  journey_id:'dated',pattern_id:'p',revision:'r',approach_geometry_fingerprint:'g',sampled_at_ms:100000,valid_until_ms:145000,
  server_received_at_ms:99999,server_sent_at_ms:100000,client_request_at_ms:99999,client_received_at_ms:100000,
  client_received_monotonic_ms:1000,client_server_clock_at_receive_ms:100000,client_clock_uncertainty_ms:0,client_clock_calibrated_monotonic_ms:1000,
  stop_occurrence_index:1,stop_progress_m:100,stop_progress_by_occurrence_m:[0,100,200,300],effective_arrival_at_ms:130000,
  station_window:[a,b,c],phases:[
    {t0:0,t1:30,p0:100,p1:100,v0:0,a:0,state:'VISUAL_STOP_ESTIMATE',stop_occurrence_index:1,start_progress_m:100,stop_progress_m:100,effective_arrival_at_ms:130000,relative_motion_level0:0,relative_motion_level1:0,station_cycle:b},
   {t0:30,t1:45,p0:100,p1:122.5,v0:0,a:.2,state:'VISUAL_MOVING',stop_occurrence_index:2,start_progress_m:100,stop_progress_m:200,effective_arrival_at_ms:230000,relative_motion_level0:0,relative_motion_level1:6,station_cycle:c}]};
  return {p,id:{estimated:true,mode:'tram',journeyId:'dated',patternId:'p',planRevision:'r',geometryFingerprint:'g',progressM:100,pathLengthM:300,nextTimelineIndex:1,distanceToNextStopM:0,nextStopEtaSeconds:30}};}

test('one prepared clock is already parked at 0:30, waits through 0:10 and departs gradually at 0:00',()=>{
 const {p,id}=packet(),before=JSON.stringify(p),active=publication.authorizePreview(p,id,100000,1000);assert.ok(active);
  const parked=publication.sampleAuthorizedPreview(active,1000);
  assert.equal(parked.stationCycleState,'DWELL');assert.equal(parked.countdownSeconds,30);
  assert.equal(parked.progressM,100);assert.equal(parked.velocityMps,0);
  for(const time of [1000,11000,21000,30999]){
    const sample=publication.sampleAuthorizedPreview(active,time);
    assert.equal(sample.progressM,100);assert.equal(sample.velocityMps,0);assert.equal(sample.stationCycleState,'DWELL');
  }
 const stop=publication.sampleAuthorizedPreview(active,21000);
 assert.equal(stop.stationCycleState,'DWELL');assert.equal(stop.countdownSeconds,10);assert.equal(stop.progressM,100);assert.equal(stop.velocityMps,0);
 const depart=publication.sampleAuthorizedPreview(active,31000);
 assert.equal(depart.stopOccurrenceIndex,2);assert.equal(depart.progressM,100);assert.equal(depart.countdownSeconds,100);
 assert.equal(clock.formatCountdown(depart.countdownSeconds),'1:40');
 assert.ok(publication.sampleAuthorizedPreview(active,32000).progressM>100);
  assert.equal(JSON.stringify(p),before);
});

test('the 30-second declared policy refuses a ten-second dwell while historical ten-second packets remain valid',()=>{
  const {p,id}=packet(),b=p.station_window[1];b.modeled_arrival_at_ms=120000;b.approach_started_at_ms=100000;
  id.progressM=87.5;id.distanceToNextStopM=12.5;
  p.phases.splice(0,1,
    {t0:0,t1:20,p0:87.5,p1:100,v0:1.25,a:-.0625,state:'VISUAL_MOVING',stop_occurrence_index:1,
      start_progress_m:0,stop_progress_m:100,effective_arrival_at_ms:130000,relative_motion_level0:3,relative_motion_level1:0,station_cycle:b},
    {t0:20,t1:30,p0:100,p1:100,v0:0,a:0,state:'VISUAL_STOP_ESTIMATE',stop_occurrence_index:1,
      start_progress_m:100,stop_progress_m:100,effective_arrival_at_ms:130000,relative_motion_level0:0,relative_motion_level1:0,station_cycle:b});
  assert.equal(publication.authorizePreview(p,id,100000,1000),null);
  p.visual_parameters.station_stop_lead_s=10;
  assert.ok(publication.authorizePreview(p,id,100000,1000));
  delete p.visual_parameters.station_stop_lead_s;
  assert.ok(publication.authorizePreview(p,id,100000,1000));
});

test('a late callback or background tab consumes elapsed time instead of decrementing one tick',()=>{
 const row={countdown_event:'DEPARTURE',display_countdown_seconds:62,client_received_monotonic_ms:1000};
 assert.equal(clock.formatCountdown(clock.remainingCountdownSeconds(row,1000)),'1:02');
 assert.equal(clock.formatCountdown(clock.remainingCountdownSeconds(row,4000)),'0:59');
 assert.equal(clock.formatCountdown(clock.remainingCountdownSeconds(row,32000)),'0:31');
 assert.equal(clock.formatCountdown(clock.remainingCountdownSeconds(row,63000)),'0:00');
 assert.equal(clock.formatCountdown(clock.remainingCountdownSeconds({...row,countdown_event:'WAITING_FOR_SOURCE_UPDATE'},63000)),'—');
});

test('inconsistent cycle clocks, incomplete occurrence windows and timer-based conditional release fail closed',()=>{
 for(const mutate of [
  p=>{p.station_window=p.station_window.slice(0,2);},
  p=>{p.station_window[2].stop_occurrence_index=3;},
  p=>{p.phases[0].station_cycle.modeled_arrival_at_ms=119000;},
  p=>{p.phases[0].station_cycle.countdown_target_at_ms=129000;},
  p=>{p.phases[0].station_cycle.release_condition='RELEVANT_SOURCE_UPDATE';},
 ]){const {p,id}=packet();mutate(p);assert.equal(publication.authorizePreview(p,id,100000,1000),null);}
});

test('refreshing the same absolute departure target does not restart its countdown',()=>{
 const first={vehicle_id:'v',countdown_event:'DEPARTURE',countdown_target_at_ms:130000,
  display_countdown_seconds:30,client_received_monotonic_ms:1000};
 const next={...first,display_countdown_seconds:20,client_received_monotonic_ms:11000};
 assert.equal(clock.remainingCountdownSeconds(first,21000),10);
 assert.equal(clock.remainingCountdownSeconds(next,21000),10);
 assert.equal(clock.departureRefreshKey(first,21000),null);
 assert.equal(clock.departureRefreshKey(next,31000),'v|130000');
 assert.equal(clock.departureRefreshKey({...next,countdown_event:'WAITING_FOR_SOURCE_UPDATE',
  countdown_target_at_ms:null},31000),null);
 assert.equal(clock.departureRefreshKey({...next,countdown_target_at_ms:null},31000),null);
 assert.equal(clock.departureRefreshKey({...next,countdown_event:'ARRIVAL'},31000),null);
  assert.equal(clock.departureRefreshKey(next,42000),'v|130000');
});

test('one-minute countdown reaches zero with no new packet, then retires without holding the next tram',()=>{
  const rows=[60,120,180].map((seconds,index)=>({vehicle_id:String(index),countdown_event:'DEPARTURE',
    countdown_target_at_ms:100000+seconds*1000,display_countdown_seconds:seconds,client_received_monotonic_ms:1000}));
  assert.equal(clock.countdownPresentation(rows[0],32000).visible,true);
  assert.equal(clock.countdownPresentation(rows[0],32000).stale,true);
  assert.deepEqual(rows.map(row=>clock.remainingCountdownSeconds(row,61000)),[0,60,120]);
  assert.equal(clock.formatCountdown(clock.countdownPresentation(rows[0],61000).seconds),'0:00');
  assert.equal(clock.countdownPresentation(rows[0],61000).visible,true);
  assert.equal(clock.countdownPresentation(rows[0],67000).visible,false);
  assert.equal(clock.countdownPresentation(rows[1],67000).visible,true);
  assert.deepEqual(rows.map(row=>clock.remainingCountdownSeconds(row,121000)),[0,0,60]);
  assert.equal(clock.departureRefreshKey(rows[0],61000),'0|160000');
});

test('unknown conditional waits or old rounded minute values never get a fabricated zero target',()=>{
  const waiting={countdown_event:'WAITING_FOR_SOURCE_UPDATE',countdown_target_at_ms:null,
    display_countdown_seconds:null,client_received_monotonic_ms:1000};
  assert.equal(clock.countdownPresentation(waiting,21000).seconds,null);
  assert.equal(clock.countdownPresentation(waiting,61000).completed,false);
  assert.equal(clock.countdownPresentation({...waiting,countdown_event:'ARRIVAL',eta_minutes:1},61000).visible,false);
});

test('the same absolute target cannot restart its zero grace on another response or an uninitialized UI tick',()=>{
  const first={countdown_event:'DEPARTURE',countdown_target_at_ms:160000,display_countdown_seconds:60,
    client_received_monotonic_ms:1000,countdown_deadline_monotonic_ms:61000};
  assert.equal(clock.remainingCountdownSeconds(first,0),60);
  const reread={...first,display_countdown_seconds:0,client_received_monotonic_ms:68000};
  assert.equal(clock.countdownPresentation(reread,68000).visible,false);
  assert.equal(clock.countdownPresentation({...reread,countdown_target_at_ms:220000,
    countdown_deadline_monotonic_ms:121000},68000).visible,true);
  assert.equal(clock.remainingCountdownSeconds({...reread,countdown_deadline_monotonic_ms:121000},68000),53);
});

test('arrivals adapter preserves the signed monotonic deadline when an unchanged source target is reread after zero',async()=>{
  let now=1000;
  const out={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'..','lib/api/mobility.ts'),'utf8'),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
    exports:out,Date,performance:{now:()=>now},require:name=>name==='./core'?{apiRequest:async url=>url.includes('/clock')
      ? {server_received_at_ms:100000,server_sent_at_ms:100000}
      : [{vehicle_id:'tram',trip_id:'trip-a',trip_instance_id:'network-v:2026-11-06:trip-a',
        network_version_id:'network-v',service_date:'2026-11-06',pattern_id:'pattern-a',platform_id:'platform-a',
        platform_code:'A',position_latitude:52.14,position_longitude:11.63,vehicle_link_basis:'VERIFIED_BLOCK_PREDECESSOR',
        position_trip_id:'trip-prev',position_trip_instance_id:'network-v:2026-11-06:trip-prev',
        position_pattern_id:'pattern-prev',position_route_number:'1',position_mode:'tram',route_number:'1',countdown_event:'DEPARTURE',
        countdown_target_at_ms:160000,eta_seconds:60}]}:
      {captureServerClock:()=>({}),sampleServerClock:(_,monotonicMs)=>({serverMs:99000+monotonicMs})},
  });
  const [first]=await out.getBusesServing(null,'stop');
  assert.deepEqual([first.trip_id,first.trip_instance_id,first.network_version_id,first.service_date,first.pattern_id,
    first.platform_id,first.platform_code,first.latitude,first.longitude],
  ['trip-a','network-v:2026-11-06:trip-a','network-v','2026-11-06','pattern-a','platform-a','A',52.14,11.63]);
  assert.deepEqual([first.vehicle_link_basis,first.position_trip_id,first.position_trip_instance_id,first.position_pattern_id,
    first.position_route_number,first.position_mode],
  ['VERIFIED_BLOCK_PREDECESSOR','trip-prev','network-v:2026-11-06:trip-prev','pattern-prev','1','tram']);
  assert.equal(first.countdown_deadline_monotonic_ms,61000);
  now=68000;
  const [again]=await out.getBusesServing(null,'stop');
  assert.equal(again.countdown_deadline_monotonic_ms,61000);
  assert.equal(again.display_countdown_seconds,0);
  assert.equal(clock.countdownPresentation(again,68000).visible,false);
});
