/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const test = require('node:test');
const read = name => fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const clone = value => JSON.parse(JSON.stringify(value));
function load(file,mocks={},globals={}) {
  const exports={};vm.runInNewContext(ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,
    target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:name=>mocks[name],...globals});return exports;
}
function harness(file,name,mocks,globals={},onTree=()=>{}) {
  const slots=[],pending=[];let cursor=0,dirty=false,args=[];
  const react={
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;
      return[slots[i],next=>{const value=typeof next==='function'?next(slots[i]):next;if(!Object.is(value,slots[i])){slots[i]=value;dirty=true;}}];},
    useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
    useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))pending.push(()=>{
      old?.cleanup?.();slots[i]={deps,cleanup:fn()};});},
    useMemo(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))slots[i]={deps,value:fn()};return slots[i].value;},
  };
  react.useCallback=(fn,deps)=>react.useMemo(()=>fn,deps);
  const jsx=(type,props)=>({type,props});
  const module=load(file,{react,'react/jsx-runtime':{jsx,jsxs:jsx},...mocks},globals);
  return{render(...next){if(next.length)args=next;let value,turns=0;do{dirty=false;cursor=0;value=module[name](...args);onTree(value);
    while(pending.length)pending.shift()();assert.ok(++turns<30);}while(dirty);return value;},
    unmount(){slots.forEach(s=>s?.cleanup?.());}};
}

const points=[{latitude:52,longitude:11},{latitude:52.01,longitude:11}];
const line=(version='v1',date='today')=>({pattern_id:'east',network_version_id:version,service_date:date,valid:true,points});
const map=(version='v1',date='today')=>({lines:[line(version,date)],stops:[{stop_id:'physical:A',name:'A',latitude:52,longitude:11}]});
const vehicle=(version='v1',date='today')=>({vehicle_id:'source:T',mode:'tram',pattern_id:'east',network_version_id:version,service_date:date});

test('static network coalesces requests and retains the exact snapshot/path references on unchanged refresh',async()=>{
  let resolve,calls=0,now=100000;
  const api={getV2Map:()=>{calls++;return new Promise(r=>{resolve=r;});}};
  const cache=load('lib/mobilityNetwork.ts',{'./api/mobility':api},{Date:{now:()=>now}});
  const first=cache.loadMobilityNetwork(null,[]),second=cache.loadMobilityNetwork(null,[]);
  assert.equal(first,second);assert.equal(calls,1);
  resolve(map());const snapshot=await first;
  assert.equal(await cache.loadMobilityNetwork(null,[]),snapshot);assert.equal(calls,1);
  now+=cache.NETWORK_REFRESH_MS+1;
  const refreshed=cache.loadMobilityNetwork(null,[]);resolve(clone(map()));
  assert.equal(await refreshed,snapshot);assert.equal(calls,2);
  assert.equal(cache.cachedMobilityNetwork().lines[0].points,snapshot.lines[0].points);
});

test('new dated scope recovers with a bounded refresh; old/same-route/ambiguous geometry never matches',async()=>{
  let now=100000,calls=0;
  const cache=load('lib/mobilityNetwork.ts',{'./api/mobility':{getV2Map:async()=>{calls++;return calls===1?map():map('v2','tomorrow');}}},
    {Date:{now:()=>now}});
  const old=await cache.loadMobilityNetwork(null,[]);
  assert.equal(cache.canonicalVehicleLine(old.lines,vehicle('v2','tomorrow')),undefined);
  assert.equal(cache.canonicalVehicleLine([{...line(),pattern_id:'west'}],vehicle()),undefined);
  assert.equal(cache.canonicalVehicleLine([line(),line()],vehicle()),undefined);
  const scope=cache.networkScope(vehicle('v2','tomorrow'));
  assert.equal(await cache.loadMobilityNetwork(null,[scope]),old);assert.equal(calls,1);
  now+=30001;const next=await cache.loadMobilityNetwork(null,[scope]);
  assert.equal(calls,2);assert.ok(cache.canonicalVehicleLine(next.lines,vehicle('v2','tomorrow')));
});

test('stop density changes only at visibility buckets, not every zoom or viewport update',()=>{
  const cache=load('lib/mobilityNetwork.ts',{'./api/mobility':{}});
  assert.equal(cache.stopVisibilityBucket(14),cache.stopVisibilityBucket(15));
  assert.equal(cache.stopVisibilityBucket(16),cache.stopVisibilityBucket(19));
  assert.equal(cache.stopVisibilityBucket(12),'selected');
  assert.equal(cache.stopVisibilityBucket(15.3),'all');
});

test('failed or malformed static responses do not replace a valid network with empty layers',async()=>{
  let calls=0;
  const cache=load('lib/mobilityNetwork.ts',{'./api/mobility':{getV2Map:async()=>{
    calls++;if(calls===1)return map();if(calls===2)throw new Error('offline');return {lines:null,stops:null};
  }}});
  const good=await cache.loadMobilityNetwork(null,[]);
  await assert.rejects(cache.loadMobilityNetwork(null,[],true),/offline/);
  assert.equal(cache.cachedMobilityNetwork(),good);
  await assert.rejects(cache.loadMobilityNetwork(null,[],true),/Invalid/);
  assert.equal(cache.cachedMobilityNetwork(),good);
});

test('stop or warning metadata refresh retains unchanged line references',async()=>{
  let calls=0;
  const cache=load('lib/mobilityNetwork.ts',{'./api/mobility':{getV2Map:async()=>{
    const value=clone(map());calls++;if(calls===2)value.stops[0].name='Renamed stop';
    if(calls===3){value.stops[0].name='Renamed stop';value.diversion_warnings=[{route_number:'4',status:'review'}];}
    return value;
  }}});
  const first=await cache.loadMobilityNetwork(null,[]);
  const second=await cache.loadMobilityNetwork(null,[],true);
  assert.equal(second.lines,first.lines);assert.notEqual(second.stops,first.stops);
  const third=await cache.loadMobilityNetwork(null,[],true);
  assert.equal(third.lines,second.lines);assert.equal(third.stops,second.stops);
});

test('network hook retries first failure, shares cached geometry across views, and cleans timers on blur',async()=>{
  let calls=0,now=100000,timerId=0;const timers=new Map();
  const cache=load('lib/mobilityNetwork.ts',{'./api/mobility':{getV2Map:async()=>{if(++calls===1)throw new Error('temporary');return map();}}},
    {Date:{now:()=>now}});
  const h=harness('hooks/useMobilityNetwork.ts','useMobilityNetwork',{'../lib/mobilityNetwork':cache},
    {setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
  h.render(true,null,[]);await flush();assert.equal(h.render().failed,true);assert.equal(h.render().map,null);
  const [id,retry]=[...timers].find(([,t])=>t.ms===2000);timers.delete(id);now+=2000;retry.fn();await flush();
  assert.ok(h.render().map);assert.equal(h.render().failed,false);assert.equal(calls,2);
  h.render(false,null,[]);assert.equal(timers.size,0);
  h.render(true,null,[]);await flush();h.render();assert.equal(calls,2,'resume reuses unexpired static map');h.unmount();
});

test('foreground hook pauses hidden views and wakes immediately on return, deduplicating focus/visibility',()=>{
  let now=100000;const events=new Map(),document={visibilityState:'visible',
    addEventListener:(n,fn)=>events.set(n,fn),removeEventListener:n=>events.delete(n)};
  const h=harness('hooks/useAppForeground.ts','useAppForeground',{'react-native':{Platform:{OS:'web'}}},
    {document,window:{addEventListener:(n,fn)=>events.set(n,fn),removeEventListener:n=>events.delete(n)},Date:{now:()=>now}});
  let state=h.render();assert.equal(state.visible,true);assert.equal(state.epoch,0);
  document.visibilityState='hidden';events.get('visibilitychange')();assert.equal(h.render().visible,false);
  now+=60000;document.visibilityState='visible';events.get('visibilitychange')();state=h.render();
  assert.equal(state.visible,true);assert.equal(state.epoch,1);
  events.get('focus')();assert.equal(h.render().epoch,1);h.unmount();assert.equal(events.size,0);
});

test('vehicle bridge fingerprints geometry only when references change and resends at exact journey changes',()=>{
  const bridge=load('lib/vehicleBridge.ts');let maps=0;
  const path=clone(points);path.map=function(...args){maps++;return Array.prototype.map.apply(this,args);};
  const v={id:'source:T',journeyId:'today:T',latitude:52,longitude:11,path};let previous=new Map();
  for(let i=0;i<50;i++){const out=bridge.vehicleBridgeUpdates([{...v,progressM:i}],previous);
    assert.equal('path' in out.updates[0],i===0);previous=out.paths;}
  assert.equal(maps,1,'no repeated path JSON serialization per normal poll');
  let out=bridge.vehicleBridgeUpdates([{...v,path:clone(points)}],previous);assert.equal('path' in out.updates[0],false);
  out=bridge.vehicleBridgeUpdates([{...v,journeyId:'tomorrow:T',path:undefined}],out.paths);
  assert.equal(out.updates[0].path,null);assert.equal(out.updates[0].id,'source:T');
});

test('native polls send only vehicles; stops, plan and controls cannot resend full line geometry',()=>{
  const messages=[],frame={injectJavaScript:text=>messages.push(JSON.parse(text.match(/window\.postMessage\(([\s\S]*)\); true;/)[1]))};
  const bridge=load('lib/vehicleBridge.ts');
  const h=harness('components/GoogleMobilityMap.native.tsx','default',{
    'react-native':{View:'View',Text:'Text',StyleSheet:{create:s=>s}},'react-native-webview':{WebView:'WebView'},
    'expo-constants':{default:{expoConfig:{extra:{EXPO_PUBLIC_MOBILITY_MAP_URL:'https://map.test/google-mobility-map.html',EXPO_PUBLIC_MOBILITY_MAP_ORIGINS:'https://map.test'}}}},
    '../hooks/useMapSelection':{useMapSelection:()=>({available:false,position:null,mode:'unset',revision:0})},
    './shared/MapLocationControl':{default:'MapLocationControl'},'../lib/vehicleBridge':bridge,
  },{URL,process:{env:{}}},tree=>{const web=tree.props.children?.find(c=>c.type==='WebView');if(web)web.props.ref.current=frame;});
  const props={transitLines:[{patternId:'east',points}],transitStops:[],vehicles:[{id:'v',journeyId:'today:T',latitude:52,longitude:11,path:points}]};
  let tree=h.render(props);tree.props.children.find(c=>c.type==='WebView').props.onMessage({nativeEvent:{data:JSON.stringify({source:'perix-google-map',type:'ready',session:'one'})}});
  h.render(props);assert.equal(messages.length,6);messages.length=0;
  h.render({...props,vehicles:[{...props.vehicles[0],progressM:20}]});
  assert.equal(messages.length,1);assert.deepEqual(Object.keys(messages[0].payload),['vehicles']);
  assert.equal('path' in messages[0].payload.vehicles[0],false);messages.length=0;
  h.render({...props,vehicles:props.vehicles,transitStops:[{stop_id:'A',name:'A',latitude:52,longitude:11}]});
  assert.ok(messages.every(m=>!('lines' in m.payload)));h.unmount();
});
