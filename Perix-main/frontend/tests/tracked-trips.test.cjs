const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const modules={};
function load(name){
  if(modules[name])return modules[name];const out=modules[name]={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/city',name+'.ts'),'utf8'),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
    {exports:out,performance:{now:()=>1000},Date,require:dep=>load(dep.replace('./',''))});return out;
}
const api=load('trackedTrips');
const row=(id,platform='a',eta=60)=>({vehicle_id:id,trip_id:id,trip_instance_id:'dated:'+id,pattern_id:'p',
  network_version_id:'v',service_date:'2026-11-09',mode:'tram',route_number:'9',platform_id:platform,eta_seconds:eta,vehicle_link_basis:'EXACT_TRIP'});
const vehicle=r=>({...r,latitude:52.1,longitude:11.6,estimated:true,motion_plan_revision:'rev',progress_m:20,
  next_stop_id:'next',next_timeline_index:1,next_stop_eta_seconds:60,distance_to_next_stop_m:80,
  motion:{model:'TIME_NORMALIZED_VISUAL_ESTIMATE',publication_status:'READY',geometry_fingerprint:'g',
    preview:{schema:2,journey_id:r.trip_instance_id,pattern_id:'p',revision:'rev',stop_occurrence_index:1,
      stop_progress_by_occurrence_m:[0,100,200],sampled_at_ms:1000,effective_arrival_at_ms:61000}}});
const lines=[{pattern_id:'p',network_version_id:'v',service_date:'2026-11-09',mode:'tram',valid:true,
  approach_geometry_fingerprint:'g',points:[{latitude:52.1,longitude:11.6},{latitude:52.2,longitude:11.6}]}];
test('all five boarding groups contribute first arrivals, then their second arrivals',()=>{
  const groups=Array.from({length:5},(_,i)=>({platform_ids:['p'+i]}));
  const rows=groups.flatMap((g,i)=>[row('second'+i,'p'+i,360),row('first'+i,'p'+i,60)]);
  const waves=api.nearbyArrivalWaves(rows,groups);
  assert.deepEqual(Array.from(waves.first,r=>r.vehicle_id),groups.map((_,i)=>'first'+i));
  assert.deepEqual(Array.from(waves.second,r=>r.vehicle_id),groups.map((_,i)=>'second'+i));
});
test('same-side platform union deduplicates one trip while opposite sides stay separate',()=>{
  const waves=api.nearbyArrivalWaves([row('one','bus',60),row('one','tram',60),row('two','tram',120),row('opposite','opp',80)],
    [{platform_ids:['bus','tram']},{platform_ids:['opp']}]);
  assert.deepEqual(Array.from(waves.first,r=>r.vehicle_id),['one','opposite']);
  assert.deepEqual(Array.from(waves.second,r=>r.vehicle_id),['two']);
});
test('a departed card enrolls its successor without deleting the previous dated trip or next-stop clock',()=>{
  const a=row('a'),b=row('b');let state=api.advanceTrackedTrips(api.emptyTrackedTrips(),[a],[vehicle(a)],lines);
  const next={...vehicle(a),next_stop_id:'later',next_stop_eta_seconds:120};
  state=api.advanceTrackedTrips(state,[b],[next,vehicle(b)],lines);
  assert.equal(Object.keys(state.rows).length,2);
  assert.equal(api.trackedVehicles(state,[next,vehicle(b)],lines).find(v=>v.vehicle_id==='a').next_stop_eta_seconds,120);
  state=api.advanceTrackedTrips(state,[],[],lines);
  assert.equal(Object.keys(state.rows).length,2,'missing network packets do not terminate trips');
});
test('wrong dates, patterns, trips and missing geometry cannot enroll or switch tracked identity',()=>{
  const r=row('a');for(const patch of [{service_date:'old'},{trip_instance_id:'different'},{pattern_id:'other'}]){
    assert.equal(Object.keys(api.advanceTrackedTrips(api.emptyTrackedTrips(),[r],[{...vehicle(r),...patch}],lines).rows).length,0);
  }
  assert.equal(Object.keys(api.advanceTrackedTrips(api.emptyTrackedTrips(),[r],[vehicle(r)],[]).rows).length,0);
});
test('only arrival at the final occurrence terminates; 30-second early parking and intermediate dwell do not',()=>{
  const r=row('a'),v=vehicle(r);let state=api.advanceTrackedTrips(api.emptyTrackedTrips(),[r],[v],lines);
  const terminal={...v,next_timeline_index:2,progress_m:200,distance_to_next_stop_m:0,next_stop_eta_seconds:0,
    motion:{...v.motion,preview:{...v.motion.preview,stop_occurrence_index:2,stop_progress_m:200,sampled_at_ms:61000,
      semantics:'TIME_NORMALIZED_VISUAL_ESTIMATE',physical_speed_assurance:false,approach_geometry_fingerprint:'g',
      valid_until_ms:106000,server_received_at_ms:61000,server_sent_at_ms:61000,
      client_request_at_ms:61000,client_received_at_ms:61000,client_received_monotonic_ms:1000,
      phases:[{t0:0,t1:45,p0:200,p1:200,v0:0,a:0,state:'VISUAL_STOP_ESTIMATE'}]}}};
  assert.equal(api.tripAtTerminus({...terminal,motion:{...terminal.motion,preview:{...terminal.motion.preview,sampled_at_ms:31000}}},lines),false);
  assert.equal(api.tripAtTerminus({...terminal,next_timeline_index:1},lines),false);
  assert.equal(api.tripAtTerminus({...terminal,motion:{...terminal.motion,preview:{...terminal.motion.preview,phases:[]}}},lines),false);
  state=api.advanceTrackedTrips(state,[],[terminal],lines);assert.equal(Object.keys(state.rows).length,0);
  assert.equal(Object.keys(state.completed).length,1);
  assert.equal(Object.keys(api.advanceTrackedTrips(state,[r],[v],lines).rows).length,0,'a stale arrival card cannot resurrect the completed trip');
});
test('a verified predecessor reaching its terminus does not delete the upcoming target trip',()=>{
  const r={...row('a'),vehicle_link_basis:'VERIFIED_BLOCK_PREDECESSOR',position_trip_id:'before',position_trip_instance_id:'dated:before',
    position_pattern_id:'p',position_mode:'tram',position_route_number:'9'};
  const v={...vehicle(r),trip_id:'before',trip_instance_id:'dated:before'};
  const state=api.advanceTrackedTrips(api.emptyTrackedTrips(),[r],[v],lines);
  assert.equal(Object.keys(state.rows).length,1);
  const target=vehicle({...r,vehicle_link_basis:'EXACT_TRIP'});
  assert.equal(api.trackedVehicles(state,[target],lines)[0].trip_instance_id,r.trip_instance_id);
});
