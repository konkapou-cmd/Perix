const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(request,storageApi){
  const out={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/api/mobility.ts'),'utf8'),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
    {exports:out,require:name=>name==='./core'?{API_BASE:'test-only',apiRequest:request}:{},setTimeout,clearTimeout,
      window:storageApi?{localStorage:storageApi}:undefined});
  return out;
}
const origin={latitude:52.12,longitude:11.63};
const bounds={minLat:52.11,maxLat:52.13,minLng:11.62,maxLng:11.64};
test('selected station plus five neighbours retains six-place scope in stops and geometry reads',async()=>{
  const calls=[];const api=load(async(path,method,token,body)=>{calls.push(body);
    return path.endsWith('nearby-stops')?{stops:[]}:{lines:[],source_manifests:[]};});
  await api.getNearbyStops(null,origin,bounds,{limit:6,radiusM:3000});
  await api.getNearbyMap(null,origin,bounds,{limit:6,radiusM:3000});
  assert.equal(calls.length,2);for(const body of calls){assert.equal(body.limit,6);assert.equal(body.radius_m,3000);}
});
test('five-stop scope is not clamped to one and legacy limit validation reuses the existing catalogue/map',async()=>{
  const calls=[];const api=load(async(path,method,token,body)=>{
    calls.push({path,body});if(method==='POST')throw Object.assign(new Error('Input should be less than or equal to 3'),{status:422});
    return path.endsWith('/stops')?[]:{lines:[],source_manifests:[]};
  });
  await api.getNearbyStops(null,origin,bounds,{limit:5});await api.getNearbyMap(null,origin,bounds,{limit:5});
  assert.equal(calls[0].body.limit,5);
  assert.equal(calls[1].path,'/mobility/v2/stops');assert.equal(calls[2].path,'/mobility/v2/map');
});
test('lifetime fleet uses canonical publication and does not truncate the 41st retained vehicle',async()=>{
  let called='';const ids=Array.from({length:41},(_,i)=>'v'+i);
  const api=load(async path=>{called=path;return [...ids.map(vehicle_id=>({vehicle_id,mode:'tram'})),{vehicle_id:'unrelated',mode:'tram'}];});
  const rows=await api.getNearbyVehicles(null,origin,bounds,false,ids,{limit:5,lifetime:true});
  assert.match(called,/\/vehicles\?.*visual_preview_seconds=45/);assert.equal(rows.length,41);
});
test('legacy radius validation negotiates once and reuses the same nearby snapshot',async()=>{
  const calls=[];
  const api=load(async(path,method,token,body)=>{
    calls.push({path,body});
    if(body.radius_m<250)throw Object.assign(new Error('Input should be greater than or equal to 250'),{status:422});
    return path.endsWith('nearby-stops')?{stops:[]}:{lines:[]};
  });
  const first=await api.getNearbyStops(null,origin,bounds,{radiusM:150});
  assert.equal(calls.length,2);assert.equal(calls[0].body.radius_m,150);assert.equal(calls[1].body.radius_m,250);
  assert.equal(await api.getNearbyStops(null,origin,bounds,{radiusM:150}),first);
  await api.getNearbyMap(null,origin,bounds,{radiusM:150});
  assert.equal(calls.length,3);assert.equal(calls[2].body.radius_m,250);
});
test('network errors never trigger radius fallback or fabricate empty results',async()=>{
  let calls=0;const api=load(async()=>{calls++;throw new Error('offline');});
  await assert.rejects(()=>api.getNearbyStops(null,origin,bounds,{radiusM:150}),/offline/);
  assert.equal(calls,1);
});
test('backends without the scoped POST fleet route fall back to GET /vehicles with the same ids',async()=>{
  const calls=[];
  const api=load(async(path,method)=>{
    calls.push({path,method});
    if(path.endsWith('/nearby-vehicles'))throw Object.assign(new Error('Method Not Allowed'),{status:405});
    return [{vehicle_id:'v-7',mode:'tram',route_number:'9'},{vehicle_id:'other',mode:'bus',route_number:'2'}];
  });
  const vehicles=await api.getNearbyVehicles(null,origin,bounds,false,['v-7']);
  assert.equal(calls.length,2);
  assert.equal(calls[0].method,'POST');assert.equal(calls[1].method,'GET');
  assert.match(calls[1].path,/\/vehicles\?/);
  assert.equal(vehicles.length,1);
  assert.equal(vehicles[0].vehicle_id,'v-7');
});
test('the static stops catalogue and per-origin geometry survive page reloads',async()=>{
  const storage=new Map();
  const makeStorage=()=>({getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)});
  const loader=(request,storageApi)=>load(request,storageApi);
  let network=0;
  const fetchStops=async()=>{network++;return [{stop_id:'physical:x',name:'X',stop_ids:['x'],latitude:52.1,longitude:11.6,modes:['tram'],routes:[]}];};
  const first=loader(fetchStops,makeStorage());
  await first.getTransitStops(null);assert.equal(network,1);
  // A fresh module (new page load) with the same localStorage must not refetch.
  const second=loader(fetchStops,makeStorage());
  const cached=await second.getTransitStops(null);assert.equal(network,1);
  assert.equal(cached[0].stop_id,'physical:x');
});
test('nearby geometry cache is keyed per origin and reused after reload',async()=>{
  const storage=new Map();
  const makeStorage=()=>({getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)});
  let lines=0;
  const fetchLines=async()=>{lines++;return {lines:[],source_manifests:[]};};
  const first=load(fetchLines,makeStorage());
  await first.getNearbyMap(null,origin,bounds,{radiusM:250});assert.equal(lines,1);
  const second=load(fetchLines,makeStorage());
  await second.getNearbyMap(null,origin,bounds,{radiusM:250});assert.equal(lines,1);
  await second.getNearbyMap(null,{latitude:52.13,longitude:11.64},bounds,{radiusM:250});
  assert.equal(lines,2,'a different origin is a different cache entry');
});

test('invalid persisted payloads and previous service days cannot become current geometry',async()=>{
  const storage=new Map();
  const store={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
  let reads=0;
  const request=async()=>{reads++;return {lines:[],source_manifests:[]};};
  await load(request,store).getNearbyMap(null,origin,bounds,{radiusM:250});
  const key=[...storage.keys()][0];
  const value=JSON.parse(storage.get(key));value.day='old-service-day';storage.set(key,JSON.stringify(value));
  await load(request,store).getNearbyMap(null,origin,bounds,{radiusM:250});
  assert.equal(reads,2);
  const corrupt=JSON.parse(storage.get(key));corrupt.value={lines:[{points:[{latitude:'wrong',longitude:11}]}]};
  storage.set(key,JSON.stringify(corrupt));
  await load(request,store).getNearbyMap(null,origin,bounds,{radiusM:250});
  assert.equal(reads,3);
});

test('an explicit geometry refresh bypasses both memory and disk caches',async()=>{
  const storage=new Map();const store={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
  let reads=0;const request=async()=>{reads++;return {lines:[],source_manifests:[]};};
  const api=load(request,store);
  await api.getNearbyMap(null,origin,bounds,{radiusM:250});
  await api.getNearbyMap(null,origin,bounds,{radiusM:250,force:true});
  assert.equal(reads,2);
});
