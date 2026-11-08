const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const exportsObject={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/city/transitPublication.ts'),'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:exportsObject,Date,setTimeout,clearTimeout});
const {acceptVisualPublication,sampleAuthorizedPreview}=exportsObject;

function packet(sampled,mono,progress,velocity,level,revision){
  const preview={schema:2,semantics:'TIME_NORMALIZED_VISUAL_ESTIMATE',physical_speed_assurance:false,
    visual_rule_version:'station-relative-v1',coverage_end_reason:'AUTHORIZED_HORIZON',
    visual_parameters:{handover_min_ramp_s:2,relative_motion_rate_per_s:1,initial_coverage_s:40,rolling_coverage_s:15,
      relative_motion_continuous:true,relative_motion_fractional_step:.5,relative_motion_level_marks:[1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6]},
    journey_id:'dated',pattern_id:'p',revision,approach_geometry_fingerprint:'g',sampled_at_ms:sampled,valid_until_ms:sampled+45000,
    server_received_at_ms:sampled-1,server_sent_at_ms:sampled,client_request_at_ms:sampled-1,client_received_at_ms:sampled,
    client_received_monotonic_ms:mono,client_server_clock_at_receive_ms:sampled,client_clock_uncertainty_ms:0,client_clock_calibrated_monotonic_ms:mono,
    stop_occurrence_index:1,stop_progress_m:1000,stop_progress_by_occurrence_m:[0,1000],effective_arrival_at_ms:sampled+200000,
    phases:[{t0:0,t1:45,p0:progress,p1:progress+velocity*45,v0:velocity,a:0,state:'VISUAL_MOVING',
      stop_occurrence_index:1,start_progress_m:0,stop_progress_m:1000,effective_arrival_at_ms:sampled+200000,
      relative_motion_level0:level,relative_motion_level1:level}]};
  const identity={estimated:true,mode:'bus',journeyId:'dated',patternId:'p',planRevision:revision,geometryFingerprint:'g',
    progressM:progress,pathLengthM:1000,nextTimelineIndex:1,distanceToNextStopM:1000-progress,nextStopEtaSeconds:200};
  return {preview,identity};
}

for(const target of [{velocity:6,level:3},{velocity:6,level:2}])test(`handover preserves initial level 5, including retimed units, toward ${target.level}`,()=>{
  const old=packet(100000,1000,100,10,5,'old'),record={animStart:null};
  assert.equal(acceptVisualPublication(record,old.preview,old.identity,'READY',100000,1000),'updated');
  const next=packet(101000,2000,110,target.velocity,target.level,'new');const before=JSON.stringify(next.preview);
  assert.equal(acceptVisualPublication(record,next.preview,next.identity,'READY',101000,2000),'updated');
  const active=record.authorizedPreview,first=sampleAuthorizedPreview(active,2000);
  assert.equal(first.progressM,110);assert.equal(first.velocityMps,10);assert.ok(Math.abs(first.relativeMotionLevel-5)<1e-9);
  assert.ok(active.handover);const duration=active.handover.duration;
  let prior=first,previousTime=0;const observed=[];
  for(let t=.005;t<duration;t+=.005){const p=sampleAuthorizedPreview(active,2000+t*1000);
    assert.ok(p.progressM>=prior.progressM-1e-8);assert.ok(p.velocityMps>0);
    assert.ok(p.relativeMotionLevel>0&&p.relativeMotionLevel<=6.00001);
    assert.ok(Math.abs(p.relativeMotionLevel-prior.relativeMotionLevel)/(t-previousTime)<=1.00001);
    observed.push(p.relativeMotionLevel);prior=p;previousTime=t;}
  assert.ok(observed.some(v=>Math.abs(v-4.5)<.01));assert.ok(observed.some(v=>Math.abs(v-3.5)<.01));
  const joined=sampleAuthorizedPreview(active,2000+duration*1000),exact=sampleAuthorizedPreview({...active,handover:undefined},2000+duration*1000);
  assert.ok(Math.abs(joined.progressM-exact.progressM)<1e-8);assert.ok(Math.abs(joined.velocityMps-exact.velocityMps)<1e-8);
  assert.ok(Math.abs(joined.relativeMotionLevel-target.level)<1e-8);
  assert.equal(JSON.stringify(next.preview),before);
});

test('ordinary phase interpolation keeps half and finer levels rather than rounding to marks',()=>{
  const p=packet(100000,1000,100,5,5,'r');p.preview.phases[0]={...p.preview.phases[0],t1:10,p1:140,a:-.2,
    relative_motion_level0:5,relative_motion_level1:3};p.preview.valid_until_ms=110000;p.preview.coverage_end_reason='GEOMETRY_OR_SOURCE_BOUNDARY';
  const record={animStart:null};assert.equal(acceptVisualPublication(record,p.preview,p.identity,'READY',100000,1000),'updated');
  assert.equal(sampleAuthorizedPreview(record.authorizedPreview,3500).relativeMotionLevel,4.5);
  assert.equal(sampleAuthorizedPreview(record.authorizedPreview,8500).relativeMotionLevel,3.5);
  assert.ok(Math.abs(sampleAuthorizedPreview(record.authorizedPreview,4100).relativeMotionLevel-4.38)<1e-10);
});

for(const targetUnit of [2,3])test(`3 to 5 accelerates continuously, with target unit ${targetUnit}`,()=>{
  const old=packet(100000,1000,100,6,3,'old'),record={animStart:null};
  assert.equal(acceptVisualPublication(record,old.preview,old.identity,'READY',100000,1000),'updated');
  const next=packet(101000,2000,106,5*targetUnit,5,'new');
  assert.equal(acceptVisualPublication(record,next.preview,next.identity,'READY',101000,2000),'updated');
  const active=record.authorizedPreview,first=sampleAuthorizedPreview(active,2000);
  assert.equal(first.progressM,106);assert.equal(first.velocityMps,6);assert.ok(Math.abs(first.relativeMotionLevel-3)<1e-9);
  assert.ok(active.handover);let prior=first,previousTime=0;const observed=[];
  for(let t=.005;t<active.handover.duration;t+=.005){const p=sampleAuthorizedPreview(active,2000+t*1000);
    assert.ok(p.progressM>=prior.progressM-1e-8);assert.ok(p.velocityMps>0);
    assert.ok(p.relativeMotionLevel>0&&p.relativeMotionLevel<=6.00001);
    assert.ok(Math.abs(p.relativeMotionLevel-prior.relativeMotionLevel)/(t-previousTime)<=1.00001);
    observed.push(p.relativeMotionLevel);prior=p;previousTime=t;}
  assert.ok(observed.some(v=>Math.abs(v-3.5)<.01));assert.ok(observed.some(v=>Math.abs(v-4.5)<.01));
  const joined=sampleAuthorizedPreview(active,2000+active.handover.duration*1000);
  assert.ok(Math.abs(joined.relativeMotionLevel-5)<1e-9);
  assert.ok(Math.abs(joined.velocityMps-5*targetUnit)<1e-9);
});
