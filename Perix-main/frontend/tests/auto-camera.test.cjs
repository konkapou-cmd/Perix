const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const api={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/city/mapLayout.ts'),'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:api});
const pin={latitude:52.12,longitude:11.63};
const points=distance=>[pin,{latitude:pin.latitude+distance,longitude:pin.longitude},
  {latitude:pin.latitude,longitude:pin.longitude+distance}];
test('initial camera contains origin and two vehicles; convergence only zooms in',()=>{
  const far=api.autoCameraTarget(points(.02),1000,400);
  const first=api.advanceAutoCamera(null,1,far);
  assert.ok(first.target.zoom<18);
  const world=p=>({x:(p.longitude+180)/360,y:.5-Math.log((1+Math.sin(p.latitude*Math.PI/180))/(1-Math.sin(p.latitude*Math.PI/180)))/(4*Math.PI)});
  const center=world(first.target),scale=256*2**first.target.zoom;
  for(const point of points(.02)){
    const p=world(point);
    assert.ok(Math.abs(p.x-center.x)*scale<=500-48+.01);
    assert.ok(Math.abs(p.y-center.y)*scale<=200-48+.01);
  }
  const near=api.autoCameraTarget(points(.005),1000,400);
  const next=api.advanceAutoCamera(first.state,1,near);
  assert.ok(next.target.zoom>first.target.zoom);
  const diverging=api.advanceAutoCamera(next.state,1,far);
  assert.equal(diverging.target,null);assert.equal(diverging.state.zoom,next.target.zoom);
});
test('gesture cancellation survives later polls, including a gesture before vehicles loaded',()=>{
  const waiting=api.advanceAutoCamera(null,7,null).state;
  waiting.cancelled=true;
  const poll=api.advanceAutoCamera(waiting,7,api.autoCameraTarget(points(.02),1000,400));
  assert.equal(poll.target,null);assert.equal(poll.state.cancelled,true);
  const newStop=api.advanceAutoCamera(poll.state,8,api.autoCameraTarget(points(.02),1000,400));
  assert.ok(newStop.target);assert.equal(newStop.state.cancelled,false);
});
test('same position does not refit and maximum close zoom stays bounded',()=>{
  const close=api.autoCameraTarget(points(0),375,260);
  assert.equal(close.zoom,18);
  const first=api.advanceAutoCamera(null,1,close);
  assert.equal(api.advanceAutoCamera(first.state,1,close).target,null);
});
test('invalid coordinates, insufficient points and small containers cannot steer camera',()=>{
  assert.equal(api.autoCameraTarget([pin],1000,400),null);
  assert.ok(api.autoCameraTarget([pin,pin],1000,400),'origin plus a single verified arrival can fit');
  assert.equal(api.autoCameraTarget(points(.02),90,400),null);
  assert.equal(api.autoCameraTarget([pin,pin,{latitude:NaN,longitude:11}],1000,400),null);
});
