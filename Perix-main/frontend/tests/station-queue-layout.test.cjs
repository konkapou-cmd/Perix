const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const exportsObject={};
vm.runInNewContext(ts.transpileModule(read('lib/city/stationQueue.ts'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:exportsObject});
const {stationQueueOffsets,smoothQueueOffset}=exportsObject;
const tram=(id,time,extra={})=>({id,mode:'tram',estimated:true,state:'VISUAL_STOP_ESTIMATE',stopId:'platform-A',
  latitude:52.14,longitude:11.63,heading:0,departureAtMs:time,arrivalAtMs:time-10000,sizePx:60,...extra});

test('two and three waiting trams form a deterministic spaced queue in their own departure order',()=>{
  const values=[tram('third',180000),tram('first',60000),tram('second',120000)],before=JSON.stringify(values);
  const offsets=stationQueueOffsets(values);
  assert.equal(offsets.get('first').rank,0); assert.equal(offsets.get('second').rank,1); assert.equal(offsets.get('third').rank,2);
  assert.equal(offsets.get('first').y,0); assert.equal(offsets.get('second').y,68); assert.equal(offsets.get('third').y,136);
  assert.equal(JSON.stringify(values),before);
  assert.equal(stationQueueOffsets([...values].reverse()).get('second').y,68);
});
test('platform identity, direction, mode and GPS are not conflated into a tram queue',()=>{
  for(const extra of [{stopId:'platform-B'},{heading:180},{mode:'bus'},{estimated:false},
    {state:'VISUAL_MOVING'},{latitude:52.15},{heading:NaN},{stopId:undefined}]){
    assert.equal(stationQueueOffsets([tram('first',60000),tram('other',120000,extra)]).size,0);
  }
});
test('equal clocks stay equal; a tie only orders icon layout, never invents a one-minute headway',()=>{
  const values=[tram('b',60000),tram('a',60000)],offsets=stationQueueOffsets(values);
  assert.equal(offsets.get('a').rank,0); assert.equal(offsets.get('b').rank,1);
  assert.equal(values[0].departureAtMs,values[1].departureAtMs);
});
test('queue orientation follows screen rotation while geographic anchors remain untouched',()=>{
  const values=[tram('first',60000),tram('second',120000)];
  const north=stationQueueOffsets(values),turned=stationQueueOffsets(values,90);
  assert.equal(north.get('second').y,68); assert.ok(Math.abs(turned.get('second').y)<1e-8);
  assert.equal(turned.get('second').x,68); assert.equal(values[1].latitude,52.14);
});
test('a departing leader leaves the queue and follower symbols pull forward smoothly',()=>{
  const values=[tram('first',60000),tram('second',120000),tram('third',180000)];
  const before=stationQueueOffsets(values),after=stationQueueOffsets([{...values[0],state:'VISUAL_MOVING'},...values.slice(1)]);
  assert.equal(after.get('second').rank,0); assert.equal(after.get('third').rank,1);
  const step=smoothQueueOffset(before.get('second'),after.get('second'),100);
  assert.ok(step.y<68 && step.y>0);
  let current=step;for(let i=0;i<10;i++)current=smoothQueueOffset(current,after.get('second'),100);
  assert.equal(current.y,0); assert.equal(values[1].departureAtMs,120000);
});
test('unknown departure times are not synthesized; earlier known releases stay at the front',()=>{
  const values=[tram('unknown',null),tram('known',120000)];
  const offsets=stationQueueOffsets(values);
  assert.equal(offsets.get('known').rank,0); assert.equal(values[0].departureAtMs,null);
});
test('web applies only an SVG anchor offset, not displaced coordinates or rewritten source progress',()=>{
  const web=read('components/BusinessMap.web.tsx');
  assert.match(web,/anchor: new google\.maps\.Point\(w\/2-\(rec\.queueOffset/);
  assert.match(web,/stationQueueOffsets\(queueCandidates/);
  assert.match(web,/rec\.marker\.setPosition\(\{lat:point\.lat,lng:point\.lng\}\)/);
  const layout=web.slice(web.indexOf('const queueOffsets = stationQueueOffsets'),web.indexOf('if (active) {'));
  assert.doesNotMatch(layout,/setPosition|progNow\s*=|countdown_seconds\s*=|authorizedPreview\s*=/);
  for(const file of ['components/city/CityInlineDetails.tsx','components/locator/LegacyLocatorScreen.tsx'])assert.match(read(file),/countdownPresentation/);
  assert.match(read('components/BusinessMap.native.tsx'),/useNativeStationQueue\(mapMarkers/);
  const native=read('components/VisualTransitMarker.native.tsx');
  assert.match(native,/anchor=\{\{x:0\.5,y:0\.5\}\}/);
  assert.match(native,/translateX:x/);
  assert.match(native,/!sample \|\| sample\.expired/);
});
