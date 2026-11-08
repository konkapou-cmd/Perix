const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../lib/city/transitPublication.ts'),'utf8');
const exportsObject={};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
  {exports:exportsObject});
const {acceptVisualPublication,authorizePreview,sampleAuthorizedPreview}=exportsObject;

function packet({sampled=10000,progress=0,velocity=5,revision='r1',arrival=70000,mono=1000,geometry='g'}={}) {
  const horizon=Math.min(45,(arrival-sampled)/1000);
  const preview={schema:2,semantics:'TIME_NORMALIZED_VISUAL_ESTIMATE',physical_speed_assurance:false,
    journey_id:'dated-trip',pattern_id:'p',revision,approach_geometry_fingerprint:geometry,
    sampled_at_ms:sampled,valid_until_ms:sampled+horizon*1000,effective_arrival_at_ms:arrival,
    server_received_at_ms:sampled-100,server_sent_at_ms:sampled,
    client_request_at_ms:sampled-100,client_received_at_ms:sampled,client_received_monotonic_ms:mono,
    stop_occurrence_index:1,stop_progress_m:1000,
    phases:[{t0:0,t1:horizon,p0:progress,p1:progress+velocity*horizon,v0:velocity,a:0}]};
  const identity={estimated:true,mode:'bus',journeyId:'dated-trip',patternId:'p',planRevision:revision,
    geometryFingerprint:geometry,progressM:progress,pathLengthM:2000,nextTimelineIndex:1,
    distanceToNextStopM:1000-progress,nextStopEtaSeconds:Math.ceil((arrival-sampled)/1000)};
  return {preview,identity};
}
function accept(record,p,wall,mono,status='READY') {
  return acceptVisualPublication(record,p.preview,p.identity,status,wall,mono);
}

test('pan, zoom and repeated React renders preserve the original curve and monotonic clock',()=>{
  const p=packet(),record={animStart:null};
  assert.equal(accept(record,p,10000,1000),'updated');
  const active=record.authorizedPreview;
  record.progNow=sampleAuthorizedPreview(active,6000).progressM;
  for (let n=0;n<40;n++) {
    assert.equal(accept(record,p,15000+n*100,6000+n*100),'unchanged');
    assert.equal(record.authorizedPreview,active);
  }
  assert.equal(sampleAuthorizedPreview(active,11000).progressM,50);
  assert.equal(active.preview.valid_until_ms,55000);
});

test('a map that finishes loading late uses the receive-time bridge, not a new wall clock',()=>{
  const p=packet();
  const active=authorizePreview(p.preview,p.identity,19000,10000);
  assert.ok(active);
  assert.equal(sampleAuthorizedPreview(active,10000).progressM,45);
  // A local wall-clock adjustment does not move the captured source clock.
  assert.equal(authorizePreview(p.preview,p.identity,999999,10000).serverMs,19000);
  assert.equal(authorizePreview(p.preview,p.identity,56000,47000),null);
});

for (const velocity of [0.3,2,7]) test(`new source deadline joins continuously with positive speed (${velocity})`,()=>{
  const old=packet(),record={animStart:null};
  accept(record,old,10000,1000);
  record.progNow=sampleAuthorizedPreview(record.authorizedPreview,6000).progressM;
  const p=packet({sampled:15000,progress:20,velocity,revision:'r2',arrival:200000,mono:6000});
  assert.equal(accept(record,p,15000,6000),'updated');
  const active=record.authorizedPreview;
  const first=sampleAuthorizedPreview(active,6000);
  assert.equal(first.progressM,25);
  assert.equal(first.velocityMps,5);
  let last=first.progressM;
  const end=active.handover.duration;
  for (let t=.01;t<end;t+=.01) {
    const sample=sampleAuthorizedPreview(active,6000+t*1000);
    assert.ok(sample.progressM>=last-1e-8);
    assert.ok(sample.velocityMps>0);
    last=sample.progressM;
  }
  const joined=sampleAuthorizedPreview(active,6000+end*1000);
  const baseline=sampleAuthorizedPreview({...active,handover:undefined},6000+end*1000);
  assert.ok(Math.abs(joined.progressM-baseline.progressM)<1e-8);
  assert.ok(Math.abs(joined.velocityMps-baseline.velocityMps)<1e-8);
  const before=sampleAuthorizedPreview(active,6000+end*1000-.001);
  assert.ok(Math.abs(before.progressM-joined.progressM)<.001);
  assert.equal(p.preview.effective_arrival_at_ms,200000);
  assert.equal(active.preview.valid_until_ms,60000);
});

test('pending, invalid or older packets never cancel an already authorized same-leg curve',()=>{
  const p=packet(),record={animStart:null};accept(record,p,10000,1000);
  const active=record.authorizedPreview;
  assert.equal(accept(record,p,13000,4000,'PENDING'),'held');
  assert.equal(record.authorizedPreview,active);
  const invalid=packet({sampled:15000,mono:6000});invalid.preview.phases[0].a=NaN;
  assert.equal(accept(record,invalid,15000,6000),'held');
  assert.equal(record.authorizedPreview,active);
  assert.equal(sampleAuthorizedPreview(active,11000).progressM,50);
  assert.equal(sampleAuthorizedPreview(active,47000).expired,true);
});

test('a changed geometry/journey or explicit hidden authority cannot borrow the old animation',()=>{
  const p=packet(),record={animStart:null};accept(record,p,10000,1000);
  const different=packet({geometry:'different'});different.preview=null;
  assert.equal(accept(record,different,12000,3000),'hidden');
  assert.equal(record.authorizedPreview,null);
  accept(record,p,12000,3000);
  assert.equal(accept(record,p,13000,4000,'HIDDEN'),'hidden');
});

test('45-second visual authorization does not relax physical preview limits or go past the stop',()=>{
  const p=packet();assert.ok(authorizePreview(p.preview,p.identity,10000,1000));
  assert.equal(authorizePreview({...p.preview,schema:1},p.identity,10000,1000),null);
  assert.equal(authorizePreview({...p.preview,valid_until_ms:56000,
    phases:[{...p.preview.phases[0],t1:46,p1:230}]},p.identity,10000,1000),null);
  assert.equal(authorizePreview({...p.preview,stop_progress_m:100},
    {...p.identity,distanceToNextStopM:100},10000,1000),null);
});

test('web renderer handles visual packets before the legacy branch that resets previews',()=>{
  const map=fs.readFileSync(path.join(__dirname,'../components/BusinessMap.web.tsx'),'utf8');
  assert.ok(map.indexOf('if (rep.visualEstimate && rep.estimated) {')<map.indexOf('rec.authorizedPreview = null;',map.indexOf('sortedTransit.forEach')));
  assert.match(map,/acceptVisualPublication\(rec,preview/);
  const api=fs.readFileSync(path.join(__dirname,'../lib/api/mobility.ts'),'utf8');
  assert.match(api,/visual_preview_seconds=45/);
  assert.match(api,/client_received_monotonic_ms: receivedMonotonic/);
});

test('tram and bus headings follow the directed curve through turns, independent of camera',()=>{
  const out={};
  const code=fs.readFileSync(path.join(__dirname,'../lib/city/transitPath.ts'),'utf8');
  vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:out});
  const points=[{latitude:52,longitude:11},{latitude:52.001,longitude:11},{latitude:52.001,longitude:11.001}];
  const cumulative=[0,111,179];
  assert.ok(Math.abs(out.sampleVisualPath(points,cumulative,50).heading)<.1);
  assert.ok(Math.abs(out.sampleVisualPath(points,cumulative,150).heading-90)<.1);
  const corner=out.sampleVisualPath(points,cumulative,111).heading;
  assert.ok(corner>10&&corner<80);
  const reverse=out.sampleVisualPath([...points].reverse(),[0,68,179],150);
  assert.ok(Math.abs(reverse.heading-180)<.1);
  assert.equal(out.sampleVisualPath([],[],0),null);
  const map=fs.readFileSync(path.join(__dirname,'../components/BusinessMap.web.tsx'),'utf8');
  assert.match(map,/sampleVisualPath\(rec.path, rec.cum, sample.progressM\)/);
  assert.match(map,/rec.heading=point.heading/);
});

test('a separately bounded server clock authorizes a queued fleet response without widening network tolerance',()=>{
  const out={};const code=fs.readFileSync(path.join(__dirname,'../lib/city/serverClock.ts'),'utf8');
  vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:out});
  assert.equal(out.captureServerClock({server_received_at_ms:10000,server_sent_at_ms:10001},1000,2000),null);
  const clock=out.captureServerClock({server_received_at_ms:10000,server_sent_at_ms:10001},1000,1101);
  assert.equal(clock.uncertaintyMs,50);
  assert.equal(out.sampleServerClock(clock,2101).serverMs,11051);
  assert.equal(out.sampleServerClock(clock,121102),null);
  const p=packet({mono:5000});
  Object.assign(p.preview,{server_received_at_ms:10000,server_sent_at_ms:11000,
    client_request_at_ms:1000,client_received_at_ms:14000});
  assert.equal(authorizePreview(p.preview,p.identity,14000,5000),null);
  Object.assign(p.preview,{client_server_clock_at_receive_ms:24000,
    client_clock_uncertainty_ms:50,client_clock_calibrated_monotonic_ms:4000});
  const active=authorizePreview(p.preview,p.identity,14000,5000);
  assert.ok(active);
  assert.equal(sampleAuthorizedPreview(active,5000).progressM,70);
  assert.equal(sampleAuthorizedPreview(active,36000).expired,true);
  assert.equal(p.preview.effective_arrival_at_ms,70000);
  for(const changed of [{client_clock_uncertainty_ms:251},{client_clock_uncertainty_ms:NaN},
    {client_clock_calibrated_monotonic_ms:-120000},{client_clock_calibrated_monotonic_ms:6000}]) {
    assert.equal(authorizePreview({...p.preview,...changed},p.identity,14000,5000),null);
  }
});
