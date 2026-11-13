const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
function load(file,deps={},globals={}){
  const exports={};vm.runInNewContext(ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
    {exports,require:n=>deps[n],console,Date,Map,Set,...globals});return exports;
}
const nearby=load('lib/city/nearbyTransit.ts',{'./visualGeometry':{}});
const scope=load('lib/city/sceneScope.ts',{'./nearbyTransit':nearby});
test('10km scene scope ignores camera zoom and ordinary GPS updates but resets on explicit origin changes',()=>{
  const a=scope.updateSceneScope(null,{latitude:52.14,longitude:11.63,kind:'live'});
  const b=scope.updateSceneScope(a,{latitude:52.1405,longitude:11.6305,kind:'live'});
  assert.equal(a,b);assert.equal(b.center.latitude,52.14);
  assert.notEqual(scope.updateSceneScope(b,{latitude:52.1405,longitude:11.6305,kind:'live'},1),b);
  assert.ok(scope.withinSceneRadius({latitude:52.18,longitude:11.63},a));
  assert.equal(scope.withinSceneRadius({latitude:52.34,longitude:11.63},a),false);
  const manual=scope.updateSceneScope(a,{latitude:37.4467,longitude:25.3289,kind:'manual'});
  assert.notEqual(manual.key,a.key);assert.equal(scope.APP_SCENE_RADIUS_M,10000);
  assert.equal(scope.updateSceneScope(manual,{latitude:37.4467,longitude:25.3289,kind:'manual'}),manual);
});
test('web/native keep landmark identities mounted through camera changes; only visible painting changes',()=>{
  const web=read('components/BusinessMap.web.tsx'),native=read('components/BusinessMap.native.tsx');
  const effect=web.slice(web.indexOf('// Individual diorama buildings'),web.indexOf('// Fly to location'));
  assert.doesNotMatch(effect,/landmarkIntersectsBounds\(l,/);
  assert.doesNotMatch(effect,/mapReady, stopViewportRevision/);
  assert.match(effect,/img\.loading = "lazy"/);
  assert.match(effect,/\[landmarks,mapReady,mapError\]/);
  assert.doesNotMatch(native,/visibleLandmarks\.filter\(group=>landmarkDepth/);
  assert.match(native,/opacity=\{visible \? 1 : 0\}/);
});

function hookHost(){
  const slots=[],effects=[],timers=new Map();let index=0,tid=0,output,now=0;
  const react={
    useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];},
    useRef(initial){const i=index++;return slots[i]||=( {current:initial});},
    useEffect(fn,deps){const i=index++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()};});},
    useCallback(fn){return fn;},
  };
  const calls=[];
  const hook=load('hooks/city/useCityDiscovery.ts',{react,'../../lib/city/gateway':{fetchGatewayPage:async(filter,bounds,q,cursors)=>{
    calls.push({filter,bounds,cursors});const more=!!cursors.public_service;
    return{items:[{id:filter.publicCategory+(more?'2':'1'),type:'public_service'}],cursors:{public_service:more?null:'next'},partial:false};
  }}},{Date:class extends Date{static now(){return now;}},setTimeout:fn=>{timers.set(++tid,fn);return tid;},clearTimeout:id=>timers.delete(id)}).useCityDiscovery;
  const bounds=scope.updateSceneScope(null,{latitude:52.14,longitude:11.63,kind:'manual'}).bounds;
  return{calls,render(category='a',enabled=true){index=0;output=hook({kinds:[],publicOnly:true,publicCategory:category},bounds,'',false,enabled);effects.splice(0).forEach(f=>f());return output;},
    advance(ms){now+=ms;},async run(){const work=[...timers.values()];timers.clear();work.forEach(f=>f());await new Promise(r=>setImmediate(r));},get:()=>output};
}
test('directory snapshots retain pagination and reuse cached categories without TTL-triggered reloads',async()=>{
  const h=hookHost();h.render('a',false);await h.run();assert.equal(h.calls.length,0);
  h.render();await h.run();h.render();assert.equal(h.calls.length,1);
  await h.get().more();h.render();assert.equal(h.get().items.length,2);
  h.render('b');await h.run();h.render('b');assert.equal(h.calls.length,3);
  h.advance(3600_000);
  const restored=h.render('a');assert.equal(restored.items.length,2);await h.run();h.render('a');
  assert.equal(h.calls.length,3,'returning to a loaded category must not request it again');
  h.get().retry();h.render('a');await h.run();h.render('a');assert.equal(h.calls.length,4,'explicit refresh still requests a fresh snapshot');
});
