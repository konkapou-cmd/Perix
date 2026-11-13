const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(file){const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:out});return out;}
const {projectedRoutePath}=load('lib/city/routeArtwork.ts'),{MAP_LAYERS}=load('lib/city/mapPresentation.ts');
test('foreground routes project the original directed curve without moving, reversing or inventing points',()=>{
  const points=[{latitude:52.1,longitude:11.6},{latitude:52.2,longitude:11.61},{latitude:52.15,longitude:11.7}];
  const before=JSON.stringify(points),seen=[];
  const d=projectedRoutePath(points,point=>{seen.push(point);return {x:point.longitude*10,y:point.latitude*10};});
  assert.equal(d,'M116.00,521.00 L116.10,522.00 L117.00,521.50');
  assert.deepEqual(seen,points);assert.equal(JSON.stringify(points),before);
});
test('a missing or invalid projection cannot bridge a gap in the source route',()=>{
  const points=[{latitude:52,longitude:11},{latitude:52.1,longitude:11.1},{latitude:52.2,longitude:11.2}];
  assert.equal(projectedRoutePath(points,p=>p===points[1]?null:{x:1,y:2}),'');
  assert.equal(projectedRoutePath(points,()=>({x:NaN,y:2})),'');
  assert.equal(projectedRoutePath([{latitude:NaN,longitude:11},points[1]],()=>({x:1,y:2})),'');
  assert.equal(projectedRoutePath([points[0]],()=>({x:1,y:2})),'');
});
test('real route strokes are above artwork and below stops/vehicles, not just reordered inside a Google canvas',()=>{
  assert.ok(MAP_LAYERS.landmark<MAP_LAYERS.route);assert.ok(MAP_LAYERS.route<MAP_LAYERS.journey);
  assert.ok(MAP_LAYERS.journey<MAP_LAYERS.stop);assert.ok(MAP_LAYERS.stop<MAP_LAYERS.vehicle);
  const web=fs.readFileSync(path.join(__dirname,'../components/BusinessMap.web.tsx'),'utf8');
  const native=fs.readFileSync(path.join(__dirname,'../components/BusinessMap.native.tsx'),'utf8');
  assert.match(web,/class RouteForeground extends google\.maps\.OverlayView/);
  assert.match(web,/container\.dataset\.routeForeground='true'/);
  assert.match(web,/zIndex:String\(MAP_LAYERS\.route\)/);
  assert.match(web,/row\.path\.setAttribute\('d',projectedRoutePath\(row\.points/);
  assert.match(web,/container\.style\.display=.*LANDMARK_STREET_DETAIL_ZOOM/);
  assert.match(native,/zIndex=\{MAP_LAYERS\.route\}/);assert.match(native,/zIndex=\{MAP_LAYERS\.journey\}/);
});
