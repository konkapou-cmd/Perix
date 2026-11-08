const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(file){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,setTimeout,clearTimeout,Date});return exports;}
const publication=load('lib/city/transitPublication.ts');
function packet(){return {schema:2,semantics:'TIME_NORMALIZED_VISUAL_ESTIMATE',physical_speed_assurance:false,
  visual_rule_version:'station-relative-v1',coverage_end_reason:'AUTHORIZED_HORIZON',
  visual_parameters:{handover_min_ramp_s:2,relative_motion_rate_per_s:1},
  revision:'r',journey_id:'dated',pattern_id:'p',approach_geometry_fingerprint:'g',
  sampled_at_ms:106000,valid_until_ms:151000,server_received_at_ms:106000,server_sent_at_ms:106001,
  client_request_at_ms:100000,client_received_at_ms:108000,client_received_monotonic_ms:8000,
  client_request_started_monotonic_ms:6000,client_navigation_started_monotonic_ms:0,
  client_server_clock_at_receive_ms:108000,client_clock_uncertainty_ms:0,client_clock_calibrated_monotonic_ms:7000,
  stop_occurrence_index:1,stop_progress_m:1000,stop_progress_by_occurrence_m:[0,1000],effective_arrival_at_ms:306000,
  phases:[{t0:0,t1:45,p0:0,p1:225,v0:5,a:0,state:'VISUAL_MOVING',stop_occurrence_index:1,start_progress_m:0,stop_progress_m:1000,effective_arrival_at_ms:306000,relative_motion_level0:5,relative_motion_level1:5}]};}
const identity=()=>({estimated:true,mode:'bus',journeyId:'dated',patternId:'p',planRevision:'r',geometryFingerprint:'g',progressM:0,pathLengthM:1000,nextTimelineIndex:1,distanceToNextStopM:1000,nextStopEtaSeconds:200});

test('14 seconds page-to-apply consumes only the 8 seconds since this sample, once',()=>{
  const p=packet(),before=JSON.stringify(p);
  const active=publication.authorizePreview(p,identity(),114000,14000);
  assert.ok(active);
  const metrics=publication.measureVisualApplication(active,14000,13000);
  assert.equal(metrics.page_to_pin_applied_ms,14000);
  assert.equal(metrics.sample_age_at_apply_ms,8000);
  assert.equal(metrics.coverage_remaining_ms,37000);
  assert.equal(publication.sampleAuthorizedPreview(active,14000).progressM,40);
  assert.equal(JSON.stringify(p),before);
});

test('a late map with only 11 seconds of full-horizon coverage requests serialized refresh',()=>{
  let requests=0;const stop=publication.subscribeVisualRefresh(()=>requests++);
  const p=packet();
  assert.equal(publication.authorizePreview(p,identity(),140000,40000),null);
  assert.equal(requests,1);
  assert.equal(publication.authorizePreview(p,identity(),140001,40001),null);
  assert.equal(requests,1);
  assert.equal(p.valid_until_ms,151000);stop();
});

test('a real terminal departure is not extended or rejected merely to fill a 15-second reserve',()=>{
  const p=packet();p.coverage_end_reason='SOURCE_TRIP_END';p.effective_arrival_at_ms=106000;
  p.phases=[{t0:0,t1:45,p0:1000,p1:1000,v0:0,a:0,state:'VISUAL_STOP_ESTIMATE',stop_occurrence_index:1,start_progress_m:1000,stop_progress_m:1000,effective_arrival_at_ms:106000,relative_motion_level0:0,relative_motion_level1:0}];
  const id={...identity(),progressM:1000,distanceToNextStopM:0,nextStopEtaSeconds:0};
  assert.ok(publication.authorizePreview(p,id,140000,40000));
  assert.equal(p.valid_until_ms,151000);
});

test('refresh during an in-flight poll does not overlap and retains the two-second floor',async()=>{
  const {startFleetPolling}=load('lib/city/fleetPoller.ts');let refresh,resolve,calls=0,timer,time=0,unsubscribed=false;
  const stop=startFleetPolling({intervalMs:8000,load:()=>{calls++;return new Promise(r=>resolve=r);},publish:()=>{},now:()=>time,
    subscribeRefresh:callback=>{refresh=callback;return ()=>{unsubscribed=true;};},schedule:(callback,delay)=>{timer={callback,delay};return timer;},cancel:()=>{timer=undefined;}});
  refresh();refresh();assert.equal(calls,1);time=1000;resolve([]);await new Promise(r=>setImmediate(r));
  assert.equal(timer.delay,2000);time=3000;timer.callback();assert.equal(calls,2);stop();assert.ok(unsubscribed);resolve([]);
});
