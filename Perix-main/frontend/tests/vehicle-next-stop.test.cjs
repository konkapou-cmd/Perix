const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
function load(file,deps={}){const exports={};vm.runInNewContext(ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:name=>deps[name],Date,Intl});return exports;}
const publication=load('lib/city/transitPublication.ts'),geometry=load('lib/city/transitPath.ts');
const {vehicleStopDetails,formatTransitEventTime}=load('lib/city/vehicleDetails.ts',{'./transitPublication':publication,'./transitPath':geometry});
function cycle(index,arrival,departure,approach){return{stop_occurrence_index:index,stop_id:'ABCD'[index],modeled_arrival_at_ms:arrival,modeled_departure_at_ms:departure,
  approach_started_at_ms:approach,countdown_event:'DEPARTURE',countdown_target_at_ms:departure,release_condition:'KNOWN_DEPARTURE',departure_basis:'SOURCE_EVENT_REFERENCE',
  cycle_limited:index===0,incoming_leg_available:true,outgoing_leg_available:true};}
function fixture(){
  const a=cycle(0,0,30000,0),b=cycle(1,100000,130000,80000),c=cycle(2,200000,230000,180000);
  const preview={schema:2,semantics:'TIME_NORMALIZED_VISUAL_ESTIMATE',physical_speed_assurance:false,visual_rule_version:'station-cycle-v2',
    visual_parameters:{handover_min_ramp_s:2,relative_motion_rate_per_s:1,initial_coverage_s:40,rolling_coverage_s:15,station_stop_lead_s:30},
    journey_id:'dated',pattern_id:'p',revision:'r',approach_geometry_fingerprint:'g',sampled_at_ms:100000,valid_until_ms:145000,
    server_received_at_ms:99999,server_sent_at_ms:100000,client_request_at_ms:99999,client_received_at_ms:100000,
    client_received_monotonic_ms:1000,client_server_clock_at_receive_ms:100000,client_clock_uncertainty_ms:0,client_clock_calibrated_monotonic_ms:1000,
    stop_occurrence_index:1,stop_progress_m:100,stop_progress_by_occurrence_m:[0,100,200,300],effective_arrival_at_ms:130000,station_window:[a,b,c],phases:[
      {t0:0,t1:30,p0:100,p1:100,v0:0,a:0,state:'VISUAL_STOP_ESTIMATE',stop_occurrence_index:1,start_progress_m:100,stop_progress_m:100,
        effective_arrival_at_ms:130000,relative_motion_level0:0,relative_motion_level1:0,station_cycle:b},
      {t0:30,t1:45,p0:100,p1:122.5,v0:0,a:.2,state:'VISUAL_MOVING',stop_occurrence_index:2,start_progress_m:100,stop_progress_m:200,
        effective_arrival_at_ms:230000,relative_motion_level0:0,relative_motion_level1:6,station_cycle:c}]};
  const vehicle={vehicle_id:'service-marker',mode:'tram',name:'7',route_number:'7',route_direction:'South',estimated:true,identity_kind:'VIRTUAL_SCHEDULE',
    trip_instance_id:'dated',pattern_id:'p',motion_plan_revision:'r',network_version_id:'v',service_date:'2026-11-05',
    progress_m:100,next_timeline_index:1,distance_to_next_stop_m:0,next_stop_eta_seconds:30,next_stop_id:'B',next_stop_name:'B stop',
    next_stop_predicted_arrival:'PROVIDER_TIME_UNCHANGED',motion:{publication_status:'READY',geometry_fingerprint:'g',preview}};
  const lines=[{valid:true,mode:'tram',pattern_id:'p',network_version_id:'v',service_date:'2026-11-05',approach_geometry_fingerprint:'g',
    points:[{latitude:52,longitude:11},{latitude:52.004,longitude:11}]}];
  const stops='ABCD'.split('').map(id=>({stop_id:`physical:${id}`,stop_ids:[id],name:`${id} stop`,routes:[],modes:['tram']}));
  return{vehicle,lines,stops};
}
test('vehicle details expose the actual current/next stop and parked-at-30 clock without modifying the source',()=>{
  const {vehicle,lines,stops}=fixture(),before=JSON.stringify(vehicle);
  const d=vehicleStopDetails(vehicle,lines,stops,1000,100000);
  assert.equal(d.timingAvailable,true);assert.equal(d.parked,true);assert.equal(d.currentStopName,'B stop');assert.equal(d.nextStopName,'C stop');
  assert.equal(d.parkingAtMs,100000);assert.equal(d.departureAtMs,130000);assert.equal(d.departureAtMs-d.parkingAtMs,30000);
  assert.equal(d.parkingSeconds,0);assert.equal(d.departureSeconds,30);assert.equal(JSON.stringify(vehicle),before);
});
test('next stop and parking/departure clocks roll to the next occurrence at zero without another fleet packet',()=>{
  const {vehicle,lines,stops}=fixture();const d=vehicleStopDetails(vehicle,lines,stops,31000,130000);
  assert.equal(d.parked,false);assert.equal(d.currentStopName,undefined);assert.equal(d.nextStopName,'C stop');
  assert.equal(d.parkingAtMs,200000);assert.equal(d.departureAtMs,230000);assert.equal(d.parkingSeconds,70);assert.equal(d.departureSeconds,100);
  assert.equal(vehicle.next_stop_id,'B');assert.equal(vehicle.next_stop_predicted_arrival,'PROVIDER_TIME_UNCHANGED');
});
test('pending, old ten-second policy, expired or mismatched geometry cannot fabricate a parking/departure clock',()=>{
  for(const change of ['pending','old-policy','geometry','expired','late-admission']){
    const {vehicle,lines,stops}=fixture();let now=1000;
    if(change==='pending')vehicle.motion.publication_status='PENDING';
    if(change==='old-policy')vehicle.motion.preview.visual_parameters.station_stop_lead_s=10;
    if(change==='geometry')lines[0].approach_geometry_fingerprint='other';
    if(change==='expired')now=46000;
    if(change==='late-admission')now=41000;
    const d=vehicleStopDetails(vehicle,lines,stops,now,100000);
    assert.equal(d.timingAvailable,false,change);assert.equal(d.nextStopName,'B stop');assert.equal(d.departureAtMs,undefined);
  }
});
test('conditional waiting remains an unknown departure, not a fabricated release at zero',()=>{
  const {vehicle,lines,stops}=fixture(),p=vehicle.motion.preview,b=p.station_window[1];
  b.release_condition='RELEVANT_SOURCE_UPDATE';b.countdown_event='WAITING_FOR_SOURCE_UPDATE';b.countdown_target_at_ms=null;
  p.phases=[{...p.phases[0],t1:45}];
  const d=vehicleStopDetails(vehicle,lines,stops,31000,130000);
  assert.equal(d.timingAvailable,true);assert.equal(d.waiting,true);assert.equal(d.departureSeconds,null);assert.equal(d.departureAtMs,undefined);
});
test('an already accepted vehicle packet continues through its final reserve without reverting to the old stop',()=>{
  const {vehicle,lines,stops}=fixture(),initial=vehicleStopDetails(vehicle,lines,stops,1000,100000);
  const later=vehicleStopDetails(vehicle,lines,stops,41000,140000,initial.acceptedPreview);
  assert.equal(later.timingAvailable,true);assert.equal(later.nextStopName,'C stop');
  assert.equal(later.departureSeconds,90);
  assert.equal(vehicleStopDetails(vehicle,lines,stops,46000,145000,initial.acceptedPreview).timingAvailable,false);
  vehicle.trip_instance_id='another-journey';
  assert.equal(vehicleStopDetails(vehicle,lines,stops,41000,140000,initial.acceptedPreview).timingAvailable,false);
});
test('physical/GPS or taxi records still expose reported next stops without being relabeled as the optical 30-second plan',()=>{
  const {vehicle,lines,stops}=fixture();vehicle.estimated=false;vehicle.identity_kind='PHYSICAL';vehicle.registered_vehicle_id='registered';
  assert.equal(vehicleStopDetails(vehicle,lines,stops,1000).timingAvailable,false);
  vehicle.next_stop_id=null;assert.equal(vehicleStopDetails(vehicle,lines,stops,1000).nextStopName,'B stop');
  vehicle.mode='taxi';vehicle.next_stop_name=null;
  assert.equal(vehicleStopDetails(vehicle,lines,stops,1000).nextStopName,undefined);
  assert.match(read('components/locator/LegacyLocatorScreen.tsx'),/selectedVehicleMode==='taxi'/);
});
test('event clocks preserve the current network timezone and the parking/departure thirty-second difference',()=>{
  const departure=Date.UTC(2026,10,5,12,0,0),parking=departure-30000;
  assert.equal(formatTransitEventTime(parking,'en-GB'),'12:59:30');assert.equal(formatTransitEventTime(departure,'en-GB'),'13:00:00');
  assert.equal(formatTransitEventTime(null),'—');
});
test('a terminal parked vehicle reports end-of-trip instead of inventing another stop',()=>{
  const {vehicle,lines,stops}=fixture(),p=vehicle.motion.preview,c=p.station_window[2];
  p.station_window=p.station_window.slice(1);p.stop_progress_by_occurrence_m=[0,100,200];p.stop_occurrence_index=2;p.stop_progress_m=200;
  p.sampled_at_ms=200000;p.valid_until_ms=230000;p.effective_arrival_at_ms=230000;
  p.server_received_at_ms=199999;p.server_sent_at_ms=200000;p.client_request_at_ms=199999;p.client_received_at_ms=200000;p.client_server_clock_at_receive_ms=200000;
  p.phases=[{...p.phases[0],p0:200,p1:200,stop_occurrence_index:2,start_progress_m:200,stop_progress_m:200,effective_arrival_at_ms:230000,station_cycle:c}];
  vehicle.progress_m=200;vehicle.next_timeline_index=2;vehicle.next_stop_id='C';vehicle.next_stop_name='C stop';
  const details=vehicleStopDetails(vehicle,lines,stops,1000,200000);
  assert.equal(details.timingAvailable,true);assert.equal(details.terminal,true);assert.equal(details.nextStopName,undefined);
});
test('PWA install icons retain correct platform sizes, use changed wordmark artwork and versioned manifest URLs',()=>{
  const old={'perix-watercolor-192.png':'f300638bdd47df8df591dfbd5e337a91ab92c55a552848397f761d2802ac79a5','perix-watercolor-512.png':'812d33bd9380cf380799d401eb8332da5b1199183d4e818496247e0b815cc7dd',
    'perix-watercolor-512-maskable.png':'02b948164843954c1402876f80a7061a0d20cd5a5ba91d1b3f309a51ed1c146a','perix-watercolor-180.png':'aabaf6fa64f293b21205821b9389b57515d0c12a01af00251932672aa9ad1a62'};
  for(const [name,size]of [['perix-watercolor-192.png',192],['perix-watercolor-512.png',512],['perix-watercolor-512-maskable.png',512],['perix-watercolor-180.png',180]]){
    const png=fs.readFileSync(path.join(__dirname,'..','public/pwa',name));assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);
    assert.notEqual(crypto.createHash('sha256').update(png).digest('hex'),old[name]);
  }
  const manifest=JSON.parse(read('public/manifest.json'));assert.ok(manifest.icons.every(icon=>icon.src.includes('v=20261107-icons')));
  const banner=read('components/InstallBanner.tsx');assert.match(banner,/<PerixLogo size="banner"/);assert.doesNotMatch(banner,/<Text[^>]*>Perix<\/Text>/);
  assert.match(read('public/index.html'),/perix-watercolor-180\.png\?v=20261107-icons/);
});
