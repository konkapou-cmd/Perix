const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const THREE = require('three');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(file), {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React,
  }}).outputText, {exports, require: n => dependencies[n], console, ...globals});
  return exports;
}
const flight = load('lib/city/flightSimulation.ts');
const modelApi = load('components/game/flightModel.js', {three: THREE});
const chase = load('lib/city/flightChaseCamera.ts',{'./flightSimulation':flight});
const controlsApi = load('lib/city/flightControls.ts');
const origin = {latitude:52.13, longitude:11.63};
const run = (state, input, seconds) => {
  for (let i=0; i<seconds*60; i++) state=flight.stepFlight(state,input,1/60);
  return state;
};
test('flight copies its origin and automatically flies forward without input', () => {
  const state = flight.createFlightState(origin), before=JSON.stringify(state);
  const next=run(state,{climb:0,turn:0},10);
  assert.equal(JSON.stringify(state),before); assert.equal(origin.latitude,52.13);
  assert.ok(next.latitude>state.latitude); assert.equal(next.longitude,state.longitude);
  assert.equal(next.altitude,state.altitude);
  assert.ok(Math.abs(next.distanceM-flight.FLIGHT_RULES.cruiseMps*10)<1e-7);
});
test('right/left controls smoothly bank and turn in the expected directions', () => {
  const state=flight.createFlightState(origin);
  const right=run(state,{climb:0,turn:1},2),left=run(state,{climb:0,turn:-1},2);
  assert.ok(right.longitude>state.longitude && right.bank<0);
  assert.ok(left.longitude<state.longitude && left.bank>0);
  assert.ok(Math.abs(right.bank)<=flight.FLIGHT_RULES.maxBank);
  const released=run(right,{climb:0,turn:0},3);
  assert.ok(Math.abs(released.bank)<0.001);
});
test('climb/descend change altitude and pitch with a safe floor and ceiling', () => {
  const state=flight.createFlightState(origin);
  const up=run(state,{climb:1,turn:0},3),down=run(state,{climb:-1,turn:0},0.25);
  assert.ok(up.altitude>state.altitude && up.pitch>0);
  assert.ok(down.altitude<state.altitude && down.pitch<0);
  assert.equal(run(state,{climb:1,turn:0},180).altitude,flight.FLIGHT_RULES.maxAltitude);
  assert.equal(run(state,{climb:-1,turn:0},100).altitude,flight.FLIGHT_RULES.minAltitude);
  const level=run(up,{climb:0,turn:0},3);
  assert.ok(Math.abs(level.verticalSpeed)<0.001);
});
test('nose pitch is commanded directly and height follows it, never a camera dive or speed-derived trim',()=>{
  const start=flight.createFlightState(origin);
  assert.equal(start.pitch,0);assert.equal(chase.flightChasePose(0,0).pitch,0);
  const up=run(start,{climb:1,turn:0},1),down=run(start,{climb:-1,turn:0},1);
  assert.ok(up.pitch>0&&up.altitude>start.altitude&&up.verticalSpeed>0);
  assert.ok(down.pitch<0&&down.altitude<start.altitude&&down.verticalSpeed<0);
  const fast=run({...start,speedMps:140,targetSpeedMps:140},{climb:1,turn:0},1);
  assert.ok(Math.abs(up.pitch-fast.pitch)<1e-10,'pitch control remains the same at different travel settings');
  const level=run(up,{climb:0,turn:0},3);
  assert.ok(Math.abs(level.pitch)<1e-4);
});
test('nose up produces eased jet-like lift without increasing forward tempo or changing descent',()=>{
  const start=flight.createFlightState(origin);
  const first=flight.stepFlight(start,{climb:1,turn:0},1/60);
  const up=run(start,{climb:1,turn:0},3),level=run(start,{climb:0,turn:0},3);
  assert.ok(first.verticalSpeed>0&&first.verticalSpeed<5,'lift starts progressively, not a 45m/s jump');
  assert.ok(up.verticalSpeed>44&&up.verticalSpeed<=flight.FLIGHT_RULES.jetClimbMps);
  assert.ok(up.altitude-start.altitude>120&&up.altitude-start.altitude<140,'about 124m gained in three seconds at city tempo');
  assert.equal(up.speedMps,start.speedMps);assert.equal(up.targetSpeedMps,start.targetSpeedMps);
  assert.equal(up.distanceM,level.distanceM,'jet lift does not boost forward travel');
  const partial=run(start,{climb:0.3,turn:0},3);
  assert.ok(partial.verticalSpeed>10&&partial.verticalSpeed<up.verticalSpeed/2,'partial stick input provides gentler lift');
  const released=run(up,{climb:0,turn:0},3);
  assert.ok(released.verticalSpeed<0.001&&released.altitude>up.altitude,'release smoothly settles the climb');
  const beyondCity=run(start,{climb:1,turn:0},15);
  assert.ok(beyondCity.altitude>600,'600m is now a transition to high-altitude travel, not a ceiling');
  const down=run({...start,altitude:300},{climb:-1,turn:0},3);
  assert.ok(Math.abs(down.verticalSpeed-Math.sin(down.pitch)*down.speedMps)<1e-10,'existing descent rate is unchanged');
  const gap=flight.stepFlight({...start,pitch:flight.FLIGHT_RULES.maxPitch},{climb:1,turn:0},100);
  assert.ok(gap.altitude-start.altitude<=flight.FLIGHT_RULES.jetClimbMps*flight.FLIGHT_RULES.maxFrameSeconds+1e-10,'background gaps cannot teleport upwards');
  const highView=flight.flightCamera(up,18),lowView=flight.flightCamera(start,18);
  assert.ok(highView.tilt<lowView.tilt&&highView.zoom<lowView.zoom,'map tilt and zoom follow gained altitude');
});
test('low city start and click speed changes accelerate smoothly within game bounds', () => {
  const state=flight.createFlightState(origin);
  assert.equal(state.altitude,25);
  const faster=flight.changeFlightSpeed(state,flight.FLIGHT_RULES.speedClickMps);
  assert.equal(faster.speedMps,state.speedMps,'click changes the target, not position or immediate speed');
  assert.ok(faster.targetSpeedMps>state.speedMps);
  const advanced=run(faster,{climb:0,turn:0},2);
  assert.ok(advanced.speedMps>state.speedMps && advanced.speedMps<=faster.targetSpeedMps);
  const slower=run(flight.changeFlightSpeed(advanced,-10),{climb:0,turn:0},2);
  assert.ok(slower.speedMps<advanced.speedMps);
  assert.equal(flight.changeFlightSpeed(state,10000).targetSpeedMps,flight.FLIGHT_RULES.maxSpeedMps);
  assert.equal(flight.changeFlightSpeed(state,-10000).targetSpeedMps,flight.FLIGHT_RULES.minSpeedMps);
  assert.equal(flight.flightTravelLevel(flight.FLIGHT_RULES.maxSpeedMps),10);
  assert.equal(flight.flightTravelLevel(flight.FLIGHT_RULES.minSpeedMps),1);
});
test('top speed covers ground quickly without teleporting or overshooting the target',()=>{
  const start=flight.changeFlightSpeed(flight.createFlightState(origin),10000);
  const state=run(start,{climb:0,turn:0},8);
  assert.ok(state.speedMps>139 && state.speedMps<=140);
  assert.ok(state.distanceM>1000,'fast flight covers about a kilometre in eight seconds');
  const braking=run(flight.changeFlightSpeed(state,-10000),{climb:0,turn:0},8);
  assert.ok(braking.speedMps>=flight.FLIGHT_RULES.minSpeedMps && braking.speedMps<9);
});
test('travel boost enables inter-city journeys without speed-linked camera pullback',()=>{
  const start=flight.changeFlightSpeed(flight.createFlightState(origin),10000);
  const travelled=run(start,{climb:0,turn:0},60);
  assert.ok(travelled.distanceM>90000 && travelled.distanceM<101000,'around 100 km of game travel per minute at high tempo');
  const calm=flight.createFlightState(origin);
  assert.equal(flight.flightTravelSpeed(calm.speedMps),calm.speedMps,'low city start stays calm');
  assert.equal(flight.flightCamera(travelled,17).zoom,flight.flightCamera(calm,17).zoom);
  let state=calm;
  state=run(state,{climb:0,turn:0,throttle:1},2);
  assert.ok(state.targetSpeedMps>calm.targetSpeedMps);
  const target=state.targetSpeedMps;
  state=run(state,{climb:0,turn:0,throttle:0},1);
  assert.equal(state.targetSpeedMps,target,'releasing the speed stick holds the selected tempo');
  state=run(state,{climb:0,turn:0,throttle:-1},5);
  assert.equal(state.targetSpeedMps,flight.FLIGHT_RULES.minSpeedMps);
});
test('above 4000m the available tempo extends from 10 to 25 over 60 active seconds, without automatic acceleration',()=>{
  const start=flight.createFlightState(origin);
  const city=run({...start,altitude:3999},{climb:0,turn:0},65);
  assert.equal(city.highTempoSeconds,0);assert.equal(flight.flightTravelLevel(flight.flightSpeedLimit(city)),10);
  const high={...start,altitude:4000};
  assert.equal(flight.flightTravelLevel(flight.flightSpeedLimit(high)),10);
  const half=run(high,{climb:0,turn:0},30);
  assert.ok(Math.abs(flight.flightTravelLevel(flight.flightSpeedLimit(half))-17.5)<1e-8);
  const unlocked=run(half,{climb:0,turn:0},31);
  assert.equal(unlocked.highTempoSeconds,60);
  assert.equal(flight.flightTravelLevel(flight.flightSpeedLimit(unlocked)),25);
  assert.equal(unlocked.speedMps,start.speedMps);assert.equal(unlocked.targetSpeedMps,start.targetSpeedMps,'unlocking never accelerates by itself');
  const selected=flight.changeFlightSpeed(unlocked,10000);
  assert.equal(selected.targetSpeedMps,flight.FLIGHT_RULES.highMaxSpeedMps);
  const fast=run(selected,{climb:0,turn:0},8);
  assert.ok(flight.flightTravelLevel(fast.speedMps)>24.99&&flight.flightTravelLevel(fast.speedMps)<=25);
  assert.equal(fast.altitude,4000);assert.equal(fast.pitch,0);
  const travel=flight.flightTravelSpeed(fast.speedMps);
  assert.ok(travel>149000&&travel<=flight.FLIGHT_RULES.countryTravelMps,'tempo 25 eases toward country-scale travel');
  const throttled=run({...unlocked,targetSpeedMps:140,speedMps:140},{climb:0,turn:0,throttle:1},15);
  assert.equal(throttled.targetSpeedMps,360,'mobile throttle can also select tempo 25');
  const below=flight.stepFlight({...fast,altitude:4000.001,pitch:-flight.FLIGHT_RULES.maxPitch},{climb:-1,turn:0},1/60);
  assert.ok(below.altitude<4000);assert.equal(below.highTempoSeconds,0);
  assert.equal(below.targetSpeedMps,140,'below threshold the selected target returns to the city limit');
  assert.ok(below.speedMps>140,'actual speed eases down rather than jumping');
  const slowed=run({...below,pitch:0},{climb:0,turn:0},8);
  assert.ok(slowed.speedMps<140.01);
  assert.equal(flight.stepFlight(high,{climb:0,turn:0},0),high,'paused/no-time draws cannot unlock extra tempo');
  assert.equal(flight.stepFlight(high,{climb:0,turn:0},500).highTempoSeconds,0.05,'hidden-tab time gaps cannot instantly unlock 25');
});
test('tempo 25 covers about 450km in three seconds with progressive high levels and unchanged city tempo',()=>{
  const ten=flight.FLIGHT_RULES.maxSpeedMps,twentyFive=flight.FLIGHT_RULES.highMaxSpeedMps;
  assert.equal(flight.flightTravelLevel(ten),10);assert.equal(flight.flightTravelLevel(twentyFive),25);
  assert.equal(flight.flightTravelSpeed(twentyFive),150000);
  const middle=flight.flightTravelSpeed((ten+twentyFive)/2);
  assert.ok(middle>flight.flightTravelSpeed(ten)&&middle<150000/2,'intermediate high levels are gentler than a linear jump');
  assert.equal(flight.flightTravelSpeed(twentyFive+1000),150000);
  for(const speed of [8,18,28,80,140]) {
    const normal=Math.max(0,Math.min(1,(speed-18)/(140-18)));
    assert.equal(flight.flightTravelSpeed(speed),speed*(1+11*normal),'tempo 1–10 stays unchanged');
  }
  assert.ok(Math.abs(flight.flightTravelSpeed(ten+1e-6)-flight.flightTravelSpeed(ten))<0.0001,'no speed jump at tempo 10');
  const base={...flight.createFlightState(origin),altitude:4000,highTempoSeconds:60};
  const slow=run({...base,speedMps:ten,targetSpeedMps:ten},{climb:0,turn:0},3);
  const fast=run({...base,speedMps:twentyFive,targetSpeedMps:twentyFive},{climb:0,turn:0},3);
  assert.ok(Math.abs(fast.distanceM-450000)<1e-6,'real simulated map travel covers 450km in 3 seconds, not just a faster HUD number');
  assert.ok(fast.latitude>slow.latitude+3,'actual map position advances across a country-sized distance');
  const gap=flight.stepFlight({...base,speedMps:twentyFive,targetSpeedMps:twentyFive},{climb:0,turn:0},100);
  assert.equal(gap.distanceM,7500,'a long tab gap still advances at most one capped simulation frame');
  assert.equal(fast.altitude,slow.altitude);assert.equal(fast.pitch,slow.pitch);
  assert.equal(flight.flightCamera(fast,18).zoom,flight.flightCamera(slow,18).zoom);
  assert.equal(flight.flightCamera(fast,18).tilt,flight.flightCamera(slow,18).tilt);
});

test('upgraded supplied GLB is self-contained with original logos, child/dog rig and five clips', () => {
  const bytes=fs.readFileSync(path.join(__dirname,'../assets/game/perix-airplane-characters-animated.glb'));
  assert.equal(bytes.length,1161364);
  assert.equal(require('node:crypto').createHash('sha256').update(bytes).digest('hex'),'04856c8caf44e99f7f0d34761a8d04b7ba3a900408a678416a4109d2d54d5ae7');
  assert.equal(bytes.toString('ascii',0,4),'glTF');
  const json=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
  assert.equal(json.images.length,4);
  assert.ok(json.images.every(image=>image.bufferView!=null && !image.uri));
  assert.ok(json.buffers.every(buffer=>!buffer.uri));
  assert.ok(json.materials.some(material=>material.name==='PERIX_WING_logo_blue_wood'));
  assert.ok(json.nodes.some(node=>node.name.startsWith('propeller_blade_')));
  assert.deepEqual(json.animations.map(a=>a.name).sort(),['Perix_Climb','Perix_Dive','Perix_Idle','Perix_TurnLeft','Perix_TurnRight']);
  for(const name of ['Perix_Kid_HeadLeanZ','Perix_Kid_HeadLookY','Perix_Dog_HeadLeanZ','Perix_Dog_HeadLookY'])assert.ok(json.nodes.some(n=>n.name===name));
});

test('aircraft loader retains original textures, brightens fill, and groups the propeller',async()=>{
  const root=new THREE.Group(),texture=new THREE.Texture();
  const material=new THREE.MeshStandardMaterial({map:texture});
  const wing=new THREE.Mesh(new THREE.BoxGeometry(8,0.1,1),material);wing.name='original_logo_wing';root.add(wing);
  for(const x of [-0.89,0.89]){
    const tail=new THREE.Mesh(new THREE.BoxGeometry(1.46,0.12,1.06),material);
    tail.name=`horizontal_tail_upper_${x}`;tail.position.set(x,0.44,2.7);root.add(tail);
  }
  const blade=new THREE.Mesh(new THREE.BoxGeometry(1,1,0.1),material);blade.name='propeller_blade_0_203';blade.position.set(1,0.02,-3.65);root.add(blade);
  const api=load('components/game/perixAircraft.js',{three:THREE,
    'expo-asset':{Asset:{fromModule:()=>({uri:'/test-assets/plane.glb'})}},
    '../../assets/game/perix-airplane-characters-animated.glb':7,
    'three/addons/utils/BufferGeometryUtils.js':require('three/addons/utils/BufferGeometryUtils.js'),
    'three/addons/math/ConvexHull.js':require('three/addons/math/ConvexHull.js'),
    'three/addons/loaders/GLTFLoader.js':{GLTFLoader:class{
    async loadAsync(url){assert.equal(url,'/test-assets/plane.glb');return {scene:root};}
  }}});
  const aircraft=await api.loadPerixAircraft();
  assert.equal(material.map,texture);assert.equal(material.emissiveMap,texture);
  assert.ok(material.emissive.r>0);assert.equal(blade.parent,aircraft.propeller);
  assert.ok(aircraft.wingspan>8);
  assert.ok(aircraft.tailAnchor.distanceTo(new THREE.Vector3(0,0.44,2.7))<1e-6,'tail alignment comes from real horizontal-tail geometry before batching');
  assert.ok(aircraft.framingPoints.length>0&&aircraft.framingPoints.length<=4*8*3,'compact convex frame envelope');
  modelApi.disposeFlightScene(aircraft.plane,null);
});
test('supplied head animations respond to steering without moving or rotating the flight root',()=>{
  const root=new THREE.Group(),head=new THREE.Group();head.name='Perix_Kid_HeadLookY';root.add(head);
  const clips=[['Perix_Idle',0],['Perix_TurnRight',2],['Perix_TurnLeft',-2],['Perix_Climb',.2],['Perix_Dive',-.2]].map(([name,yaw])=>
    new THREE.AnimationClip(name,1,[new THREE.QuaternionKeyframeTrack(head.name+'.quaternion',[0,1],[0,0,0,1,...new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw).toArray()])]));
  const api=load('components/game/perixAircraft.js',{three:THREE,'expo-asset':{Asset:{fromModule:()=>({uri:'/fixture.glb'})}},'../../assets/game/perix-airplane-characters-animated.glb':7});
  const animation=api.createAircraftAnimation(root,clips);
  for(let i=0;i<8;i++)animation.update(.05,1,0);assert.ok(head.rotation.y>.5);
  for(let i=0;i<8;i++)animation.update(.05,-1,0);assert.ok(head.rotation.y<-.5);
  for(let i=0;i<100;i++)animation.update(.05,-1,0);
  const held=head.quaternion.clone();
  for(let i=0;i<100;i++)animation.update(.05,-1,0);
  assert.ok(held.toArray().every((v,i)=>Math.abs(v-head.quaternion.toArray()[i])<1e-10),'held turn must not restart/twitch every animation cycle');
  for(let i=0;i<100;i++)animation.update(.05,0,0);
  assert.ok(Math.abs(head.rotation.y)<1e-6,'release returns to the neutral head pose');
  assert.equal(root.position.length(),0);assert.equal(root.rotation.x,0);assert.equal(root.rotation.y,0);assert.equal(root.rotation.z,0);
  animation.dispose();
});
test('batching preserves the animated head subtree instead of baking it into the static aircraft',async()=>{
  const root=new THREE.Group(),head=new THREE.Group();head.name='Perix_Kid_HeadLookY';head.position.set(1,1,0);root.add(head);
  const material=new THREE.MeshStandardMaterial();
  for(const x of [0,.5]){const mesh=new THREE.Mesh(new THREE.BoxGeometry(.4,.5,.4),material);mesh.position.x=x;head.add(mesh);}
  const body=new THREE.Mesh(new THREE.BoxGeometry(8,1,3),material);root.add(body);
  const clip=new THREE.AnimationClip('Perix_TurnRight',1,[new THREE.QuaternionKeyframeTrack(head.name+'.quaternion',[0,1],[0,0,0,1,...new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),1.5).toArray()])]);
  const api=load('components/game/perixAircraft.js',{three:THREE,'expo-asset':{Asset:{fromModule:()=>({uri:'/fixture.glb'})}},'../../assets/game/perix-airplane-characters-animated.glb':7,
    'three/addons/loaders/GLTFLoader.js':{GLTFLoader:class{async loadAsync(){return {scene:root,animations:[clip]};}}},
    'three/addons/utils/BufferGeometryUtils.js':require('three/addons/utils/BufferGeometryUtils.js'),
    'three/addons/math/ConvexHull.js':require('three/addons/math/ConvexHull.js')});
  const aircraft=await api.loadPerixAircraft();assert.equal(root.getObjectByName(head.name),head);
  assert.ok(head.children.some(o=>o.name==='PERIX_animated_batch'));assert.ok(!aircraft.plane.children.some(o=>o===head));
  for(let i=0;i<8;i++)aircraft.animation.update(.05,1,0);assert.ok(head.rotation.y>.2);
  aircraft.animation.dispose();modelApi.disposeFlightScene(aircraft.plane,null);
});
test('bad input, suspended frames and coordinate boundaries cannot teleport the aircraft', () => {
  const state=flight.createFlightState(origin);
  assert.equal(flight.stepFlight(state,{climb:0,turn:0},NaN),state);
  const step=flight.stepFlight(state,{climb:NaN,turn:Infinity},1000);
  assert.ok(step.distanceM<=flight.FLIGHT_RULES.cruiseMps*0.05+1e-8);
  assert.ok(Object.values(step).every(Number.isFinite));
  assert.throws(()=>flight.createFlightState({latitude:NaN,longitude:10}));
  const near=flight.createFlightState({latitude:0,longitude:179.99999}); near.heading=Math.PI/2;
  assert.ok(run(near,{climb:0,turn:0},2).longitude<0);
});
test('flight camera follows above-ground altitude without changing simulation state or /app zoom', () => {
  const state=flight.createFlightState(origin),before=JSON.stringify(state);
  const camera=flight.flightCamera(state,17.1);
  assert.equal(JSON.stringify(state),before);
  assert.ok(camera.center.lat>state.latitude);
  assert.equal(camera.tilt,67); assert.equal(camera.zoom,18);
  const high=flight.flightCamera({...state,altitude:600},17.1);
  assert.ok(high.zoom<camera.zoom,'camera pulls back gently as altitude rises');
});
test('level low city start stays parallel to ground through W/S tempo changes without visual ascent',()=>{
  const start=flight.createFlightState(origin);
  assert.equal(start.altitude,25);
  assert.equal(start.pitch,0);assert.equal(start.bank,0);assert.equal(start.verticalSpeed,0);
  const camera=flight.flightCamera(start,17);
  assert.equal(camera.zoom,18,'flight has its own close city framing');
  for(const key of ['KeyW','KeyS']) {
    const axis=controlsApi.flightHeldKeys(new Set([key]));
    const changed=flight.changeFlightSpeed(start,controlsApi.flightSpeedKey(key)*flight.FLIGHT_RULES.speedClickMps);
    const next=run(changed,axis,10),view=flight.flightCamera(next,17);
    assert.equal(next.pitch,0);assert.equal(next.bank,0);assert.equal(next.verticalSpeed,0);
    assert.equal(next.altitude,start.altitude);
    assert.equal(view.zoom,camera.zoom);assert.equal(view.tilt,camera.tilt);
    assert.ok(next.latitude>start.latitude,'both tempo settings still travel forward');
    assert.equal(chase.flightChasePose(next.pitch,next.bank).pitch,0);
  }
});
test('procedural airplane has wings and propeller and releases all mesh resources', () => {
  const {plane,propeller}=modelApi.createFlightModel();
  let meshes=0,disposed=0;
  plane.traverse(o=>{if(o.isMesh){meshes++;o.geometry.addEventListener('dispose',()=>disposed++);}});
  assert.ok(meshes>=10); assert.equal(propeller.parent,plane);
  const box=new THREE.Box3().setFromObject(plane),size=box.getSize(new THREE.Vector3());
  assert.ok(size.x>size.z,'wingspan extends past the fuselage');
  const scene=new THREE.Scene();scene.add(plane);
  modelApi.disposeFlightScene(scene,null);
  assert.ok(disposed>0);assert.equal(scene.children.length,0);
});

function flightHost(actualTilt,initialState,props={}) {
  const effects=[],events=new Map(),statuses=[],overlays=[];
  const sampledControls=[],cameraRequests=[],renderedTilts=[],mapOptions=[],mapListeners=new Map();
  let mapView={};
  let maps=0,draws=0,disposed=0,time=0,rendererOptions;
  const refs=[];
  const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),
    useState:value=>[value,v=>statuses.push(v)],useEffect:fn=>effects.push(fn),
    useRef:value=>{const ref={current:value===null?{}:value};refs.push(ref);return ref;}};
  const google={maps:{Map:class {constructor(div,options){maps++;mapView={...options};}moveCamera(view){cameraRequests.push(view);Object.assign(mapView,view);}getTilt(){return actualTilt??mapView.tilt;}getZoom(){return mapView.zoom;}getHeading(){return mapView.heading;}getCenter(){return {toJSON:()=>mapView.center};}setOptions(value){mapOptions.push(value);}addListener(name,fn){mapListeners.set(name,fn);return {remove:()=>mapListeners.delete(name)};}},
    WebGLOverlayView:class {constructor(){overlays.push(this);}setMap(map){if(map)this.onAdd();else this.onRemove?.();}requestRedraw(){}},
    event:{clearInstanceListeners(){}}}};
  class Renderer {constructor(options){rendererOptions=options;}setClearColor(){}setPixelRatio(){}setSize(){}render(scene,camera){draws++;renderedTilts.push(Math.acos(camera.position.y/camera.position.length())*180/Math.PI);}resetState(){}dispose(){disposed++;}}
  const window={google,addEventListener:(n,fn)=>events.set(n,fn),removeEventListener:n=>events.delete(n)};
  const document={hidden:false,addEventListener:(n,fn)=>events.set(n,fn),removeEventListener:n=>events.delete(n)};
  const Game=load('components/game/CityFlightGame.jsx',{
    'react-i18next':require('./flightTranslations.cjs').module('en'),
    react:{...react,default:react},three:{...THREE,WebGLRenderer:Renderer},
    '../../lib/city/flightSimulation':{...flight,createFlightState:point=>({...flight.createFlightState(point),...initialState}),stepFlight:(state,input,dt)=>{sampledControls.push({...input});return flight.stepFlight(state,input,dt);}},'./flightModel':modelApi,
    '../../lib/city/flightChaseCamera':chase,'../../lib/city/flightControls':controlsApi,
    './perixAircraft':{loadPerixAircraft:async()=>({...modelApi.createFlightModel(),wingspan:10.6})},
    './FlightJoystick':{default:'FlightJoystick'},
    './FlightCalibrationPanel':{default:'FlightCalibrationPanel'},
    '../../lib/city/flightCalibration':load('lib/city/flightCalibration.ts'),
    'expo-asset':{Asset:{fromModule:()=>({uri:'/fixture.webp'})}},
    '../../lib/city/landmarks':{ALL_LANDMARKS:[],landmarkAppearance:()=>({size:42}),landmarkImageSource:()=>1},
    '../../lib/city/flightLandmarks':{...load('lib/city/flightLandmarks.ts'),createFlightBuildings:async()=>({update(){},dispose(){}})},
  },{window,document,performance:{now:()=>time}}).default;
  const tree=Game({apiKey:'test',mapId:'test',startPoint:{...origin},initialZoom:17,...props});
  const draw=()=>{time+=16;overlays[0].onDraw({transformer:{fromLatLngAltitude:()=>new THREE.Matrix4().elements}});};
  return {effects,events,statuses,refs,overlays,tree,draw,sampledControls,cameraRequests,renderedTilts,mapOptions,mapListeners,mapView:()=>mapView,counts:()=>({maps,draws,disposed}),options:()=>rendererOptions};
}
test('static survey freezes simulation, allows camera changes and restores the flight camera paused without a teleport',async()=>{
  const host=flightHost(),cleanup=host.effects[0]();for(let i=0;i<8;i++)await Promise.resolve();
  host.overlays[0].onContextRestored();host.draw();host.draw();
  const runtime=host.refs.find(r=>typeof r.current?.enter==='function').current;
  const steps=host.sampledControls.length,before=JSON.stringify(host.mapView().center);
  const view=runtime.enter();assert.equal(view.zoom,18);
  assert.equal(host.mapOptions.at(-1).gestureHandling,'greedy');
  runtime.change({...view,zoom:15.5,heading:135,tilt:30,altitude:4000});
  assert.equal(host.mapView().zoom,15.5);assert.equal(host.mapView().heading,135);
  runtime.visit('mykonos');assert.equal(host.mapView().center.lat,37.447378);assert.equal(host.mapView().center.lng,25.3268954);
  runtime.visit('syros');assert.equal(host.mapView().center.lat,37.4451052);assert.equal(host.mapView().center.lng,24.9427797);
  for(let i=0;i<20;i++)host.draw();assert.equal(host.sampledControls.length,steps);
  let prevented=false;host.events.get('keydown')({code:'KeyW',preventDefault(){prevented=true;}});
  assert.equal(prevented,false,'flight controls do not intercept survey keys');
  host.mapView().center={lat:53,lng:12};host.mapListeners.get('idle')();
  runtime.exit();assert.equal(JSON.stringify(host.mapView().center),before);
  assert.equal(host.mapOptions.at(-1).gestureHandling,'none');host.draw();
  assert.equal(host.sampledControls.length,steps,'exit remains paused until explicit resume');
  cleanup();assert.equal(host.mapListeners.size,0);
  assert.ok(!host.refs.some(r=>typeof r.current?.enter==='function'),'survey API released on teardown');
});
test('late map load after exit cannot start a background flight',async()=>{
  const host=flightHost(),cleanup=host.effects[0]();cleanup();await Promise.resolve();await Promise.resolve();
  assert.equal(host.counts().maps,0);assert.equal(host.events.size,0);
});
test('flight separates landscape and explicit fullscreen actions with visible manual rotation guidance',()=>{
  let landscape=0,fullscreen=0,dismissed=0;
  const host=flightHost(undefined,undefined,{showDeveloperTools:true,onLandscape:()=>landscape++,onFullscreen:()=>fullscreen++,orientationNotice:'Γύρισε το κινητό οριζόντια',onDismissOrientationNotice:()=>dismissed++});
  const flatten=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(flatten):[n,...flatten(n.props?.children)];
  const all=flatten(host.tree);
  all.find(n=>n.props['aria-label']==='Landscape view').props.onClick();assert.equal(landscape,1);
  assert.equal(fullscreen,0);all.find(n=>n.props['aria-label']==='Enter flight fullscreen').props.onClick();assert.equal(fullscreen,1);assert.equal(landscape,1);
  assert.ok(all.find(n=>n.props['data-testid']==='flight-orientation-notice'));
  all.find(n=>n.props['aria-label']==='Dismiss landscape guidance').props.onClick();assert.equal(dismissed,1);
  assert.equal(all.find(n=>n.props['aria-label']==='Landscape fullscreen'),undefined);
});
test('pitch-following aircraft camera keeps all supplied wings framed at the lower dock',()=>{
   const bytes=fs.readFileSync(path.join(__dirname,'../assets/game/perix-airplane-characters-animated.glb'));
  const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
  const points=[];
  for(const mesh of gltf.meshes)for(const primitive of mesh.primitives){
    const accessor=gltf.accessors[primitive.attributes.POSITION];
    for(const x of [accessor.min[0],accessor.max[0]])for(const y of [accessor.min[1],accessor.max[1]])for(const z of [accessor.min[2],accessor.max[2]])points.push(new THREE.Vector3(x,y,z));
  }
  for(const [width,height] of [[844,390],[568,320],[1920,1080],[2560,720],[1024,768]]){
    for(const pitch of [-1,0,1])for(const bank of [-flight.FLIGHT_RULES.maxBank,0,flight.FLIGHT_RULES.maxBank]){
      const pose=chase.flightChasePose(pitch,bank);
      const view=chase.flightDockedView(width,height,8.9632,pose,points.flatMap(p=>p.toArray()));
      const camera=new THREE.PerspectiveCamera(view.fov,view.aspect,view.near,view.far);
      camera.position.set(view.position.x,view.position.y,view.position.z);
      camera.lookAt(view.target.x,view.target.y,view.target.z);
      camera.setViewOffset(width,height,0,view.verticalOffsetY,width,height);camera.updateMatrixWorld(true);
      const eye=camera.position.clone().sub(new THREE.Vector3(view.target.x,view.target.y,view.target.z));
      assert.ok(Math.abs(Math.acos(eye.y/eye.length())*180/Math.PI-flight.flightCameraTilt(pose.pitch))<1e-8,'same pitch-following tilt as the map');
      assert.ok(camera.position.y>0,'camera remains above the ground');
      assert.ok(camera.getWorldDirection(new THREE.Vector3()).y<0,'camera always looks DOWN');
      const model=new THREE.Group();model.rotation.set(pose.pitch,pose.yaw,pose.bank,'YXZ');model.updateMatrixWorld(true);
      for(const point of points){
        const projected=point.clone().applyMatrix4(model.matrixWorld).project(camera);
        assert.ok(Math.abs(projected.x)<0.98 && Math.abs(projected.y)<0.98,`model clipped at ${width}x${height}, pitch ${pitch}, bank ${bank}: ${projected.toArray()}`);
      }
      const neutral=chase.flightChasePose(0,0);
      const tail=new THREE.Vector3().copy(chase.FLIGHT_TAIL_ANCHOR).applyAxisAngle(new THREE.Vector3(1,0,0),neutral.pitch).project(camera);
      const anchor=chase.flightTailLeverPosition(tail,width,height);
      assert.ok(Math.abs(anchor.top-view.dock.top)<1e-7,'neutral tail stays at the old bottom lever position');
    }
  }
});
test('nose down increases map tilt to its maximum; nose up reduces it without changing tempo',()=>{
  const start=flight.createFlightState(origin),neutral=flight.flightCamera(start,18);
  const up=run(start,{climb:1,turn:0},1),down=run(start,{climb:-1,turn:0},1);
  assert.ok(up.pitch>0&&up.altitude>start.altitude,'nose up still climbs');
  assert.ok(down.pitch<0&&down.altitude<start.altitude,'nose down still descends');
  assert.ok(flight.flightCamera(up,18).tilt<neutral.tilt);
  assert.equal(flight.flightCamera(down,18).tilt,flight.FLIGHT_MAX_TILT);
  assert.equal(flight.flightCameraTilt(-Math.PI),flight.FLIGHT_MAX_TILT,'holding nose down never exceeds maximum map tilt');
  const first=flight.stepFlight(start,{climb:1,turn:0},1/60);
  assert.ok(neutral.tilt-flight.flightCamera(first,18).tilt>0&&neutral.tilt-flight.flightCamera(first,18).tilt<1,'camera follows smoothed pitch, not a sudden key step');
  const released=run(up,{climb:0,turn:0},4);
  assert.ok(Math.abs(flight.flightCamera(released,18).tilt-flight.flightCameraTilt(0,released.altitude))<1e-4,'release returns to the neutral view for the current altitude');
  assert.equal(flight.flightCamera({...up,speedMps:140,targetSpeedMps:140},18).tilt,flight.flightCamera(up,18).tilt);
  assert.equal(flight.flightCameraTilt(NaN),67);
  const clamped=flight.flightCamera(down,18,60),reference=flight.flightCamera({...down,pitch:(67-60)*Math.PI/180},18);
  assert.equal(clamped.center.lat,reference.center.lat,'ground look-ahead uses accepted tilt when Google clamps');
  assert.equal(clamped.tilt,flight.flightCamera(down,18).tilt,'continue requesting the pitch-following angle');
});
test('rising altitude progressively flattens the map and returns to oblique view on descent',()=>{
  const start=flight.createFlightState(origin);
  for(const pitch of [-flight.FLIGHT_RULES.maxPitch,0,flight.FLIGHT_RULES.maxPitch]) {
    let previous=Infinity;
    for(let altitude=25;altitude<=600;altitude+=5) {
      const state={...start,pitch,altitude},view=flight.flightCamera(state,18);
      assert.ok(view.tilt<=previous&&view.tilt>=0,'higher altitude never increases tilt at the same pitch');
      previous=view.tilt;
    }
    const high=flight.flightCamera({...start,pitch,altitude:600},18);
    assert.equal(high.tilt,0,'city overview is directly overhead even while holding nose down');
    assert.equal(high.center.lat,start.latitude);assert.equal(high.center.lng,start.longitude);
  }
  assert.ok(flight.flightCamera({...start,altitude:300},18).tilt<40);
  assert.equal(flight.flightCameraTilt(0,25),67,'descending restores the original low-city view');
  assert.equal(flight.flightCameraTilt(0,NaN),67);
  assert.equal(flight.flightCameraTilt(0,10000),0);
  assert.equal(flight.flightCameraTilt(0,-100),67);
});
test('high-altitude travel reaches a multi-country overview without changing the city start or forward tempo',()=>{
  const start=flight.createFlightState(origin);
  const high=run(start,{climb:1,turn:0},70);
  assert.ok(high.altitude>500000&&high.altitude<flight.FLIGHT_RULES.maxAltitude,'country-scale heights are reachable in about a minute');
  assert.equal(high.speedMps,start.speedMps);assert.equal(high.targetSpeedMps,start.targetSpeedMps);
  const ceiling=run(high,{climb:1,turn:0},30);
  assert.equal(ceiling.altitude,1000000);assert.equal(ceiling.verticalSpeed,0);
  let previous=Infinity;
  for(const altitude of [600,1000,10000,100000,500000,1000000]) {
    const view=flight.flightCamera({...start,altitude},18);
    assert.equal(view.tilt,0);assert.ok(view.zoom<previous,'map keeps pulling back beyond the old zoom floor');
    previous=view.zoom;
  }
  const view=flight.flightCamera(ceiling,18);
  assert.ok(view.zoom>=3&&view.zoom<5.1,'zoom near 5 shows a broad international region, not only one city');
  const down=run({...ceiling,pitch:0},{climb:-1,turn:0},90);
  assert.ok(down.altitude<1000,'high-altitude descent also returns to city scale in a reasonable time');
  const released=run({...high,pitch:0,verticalSpeed:0},{climb:0,turn:0},5);
  assert.equal(released.altitude,high.altitude,'level flight holds the selected overview height');
  const suspended=flight.stepFlight({...high,pitch:flight.FLIGHT_RULES.maxPitch},{climb:1,turn:0},500);
  assert.ok(suspended.altitude-high.altitude<=flight.FLIGHT_RULES.maxVerticalTravelMps*flight.FLIGHT_RULES.maxFrameSeconds+1e-8);
  const lowBefore=flight.stepFlight({...start,pitch:flight.FLIGHT_RULES.maxPitch,altitude:600},{climb:1,turn:0},1/60);
  const lowAfter=flight.stepFlight({...start,pitch:flight.FLIGHT_RULES.maxPitch,altitude:600.001},{climb:1,turn:0},1/60);
  assert.ok(Math.abs(lowAfter.verticalSpeed-lowBefore.verticalSpeed)<0.001,'no vertical speed jump at the city/high-altitude boundary');
});
test('country-scale aircraft is moderately smaller, keeps both wings and stays at the same lower tail dock',()=>{
  assert.equal(chase.flightAircraftViewScale(25),0.8);assert.equal(chase.flightAircraftViewScale(600),0.8);
  assert.equal(chase.flightAircraftViewScale(NaN),0.8);
  assert.ok(Math.abs(chase.flightAircraftViewScale(1000000)-0.6)<1e-10);
  const points=[];
  for(const x of [-4.5,4.5])for(const y of [-0.5,1.8])for(const z of [-3.7,3.8])points.push(x,y,z);
  for(const [width,height] of [[844,390],[1920,1080],[568,320]]) {
    let previousSpan=Infinity;
    for(const altitude of [600,10000,100000,1000000]) {
      const pose=chase.flightChasePose(0,0);
      const view=chase.flightDockedView(width,height,9,pose,points,chase.FLIGHT_TAIL_ANCHOR,0,altitude);
      const camera=new THREE.PerspectiveCamera(view.fov,view.aspect,view.near,view.far);
      camera.position.copy(view.position);camera.up.copy(view.up);
      camera.lookAt(view.target.x,view.target.y,view.target.z);
      camera.setViewOffset(width,height,0,view.verticalOffsetY,width,height);camera.updateMatrixWorld(true);
      const left=new THREE.Vector3(-4.5,0,0).project(camera),right=new THREE.Vector3(4.5,0,0).project(camera);
      const span=right.x-left.x;
      assert.ok(span<previousSpan,'more altitude makes the aircraft progressively smaller');previousSpan=span;
      const tail=new THREE.Vector3().copy(chase.FLIGHT_TAIL_ANCHOR).project(camera);
      assert.ok(Math.abs(chase.flightTailLeverPosition(tail,width,height).top-view.dock.top)<1e-7);
      for(let i=0;i<points.length;i+=3) {
        const p=new THREE.Vector3(points[i],points[i+1],points[i+2]).project(camera);
        assert.ok(Math.abs(p.x)<0.98&&Math.abs(p.y)<0.98,'both wings and tail remain framed');
      }
    }
  }
});
test('overhead aircraft framing remains stable at zero tilt without a lookAt axis singularity',()=>{
  const points=[];
  for(const x of [-4.5,4.5])for(const y of [-0.5,1.8])for(const z of [-3.7,3.8])points.push(x,y,z);
  for(const [width,height] of [[844,390],[1920,1080],[568,320]])for(const tilt of [0,0.001,15,35,67.5]) {
    const pose=chase.flightChasePose(0,0);
    const view=chase.flightDockedView(width,height,9,pose,points,chase.FLIGHT_TAIL_ANCHOR,tilt);
    const camera=new THREE.PerspectiveCamera(view.fov,view.aspect,view.near,view.far);
    camera.position.copy(view.position);camera.up.copy(view.up);
    camera.lookAt(view.target.x,view.target.y,view.target.z);
    camera.setViewOffset(width,height,0,view.verticalOffsetY,width,height);camera.updateMatrixWorld(true);
    const tail=new THREE.Vector3().copy(chase.FLIGHT_TAIL_ANCHOR).project(camera);
    assert.ok(Math.abs(chase.flightTailLeverPosition(tail,width,height).top-view.dock.top)<1e-7);
    for(let i=0;i<points.length;i+=3) {
      const p=new THREE.Vector3(points[i],points[i+1],points[i+2]).project(camera);
      assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<0.98&&Math.abs(p.y)<0.98);
    }
    if(tilt===0)assert.ok(camera.getWorldDirection(new THREE.Vector3()).distanceTo(new THREE.Vector3(0,-1,0))<1e-10);
  }
});
test('Nase down requests maximum tilt and foreground matches a lower angle accepted by Google',async()=>{
  const host=flightHost(60),cleanup=host.effects[0]();
  for(let i=0;i<8;i++)await Promise.resolve();
  host.overlays[0].onContextRestored({});host.draw();
  host.events.get('keydown')({code:'ArrowUp',target:{},preventDefault(){}});
  for(let i=0;i<40;i++)host.draw();
  assert.equal(host.cameraRequests.at(-1).tilt,flight.FLIGHT_MAX_TILT);
  assert.equal(host.sampledControls.at(-1).climb,-1,'camera inversion never reverses the actual nose control');
  assert.ok(Math.abs(host.renderedTilts.at(-1)-60)<1e-8,'aircraft camera uses accepted map tilt, not requested tilt');
  cleanup();
});
test('keyboard uses W/S for tempo, Up for nose down and Down for nose up instead of the numeric pad',()=>{
  assert.equal(controlsApi.flightSpeedKey('KeyW'),1);assert.equal(controlsApi.flightSpeedKey('KeyS'),-1);
  assert.equal(controlsApi.flightSpeedKey('Numpad8'),0);
  assert.ok(controlsApi.isFlightKey('ArrowUp')&&controlsApi.isFlightKey('ArrowDown'));
  for(const key of ['Numpad8','Numpad2','Digit8','Digit2'])assert.equal(controlsApi.isFlightKey(key),false);
  assert.equal(controlsApi.flightHeldKeys(new Set(['ArrowDown'])).climb,1);
  assert.equal(controlsApi.flightHeldKeys(new Set(['ArrowUp'])).climb,-1);
  assert.equal(controlsApi.flightHeldKeys(new Set(['ArrowDown','ArrowUp'])).climb,0);
  assert.equal(controlsApi.flightHeldKeys(new Set(['KeyW','KeyS'])).climb,0,'tempo never commands pitch');
});
test('neutral aircraft is level and visibly viewed from above, rather than nose-down or under the tail',()=>{
  const view=chase.flightChaseView(844,390),span=8.9632;
  assert.ok(view.position.z<span*1.4,'closer to the viewer than the previous chase view');
  const camera=new THREE.PerspectiveCamera(view.fov,view.aspect,view.near,view.far);
  camera.position.set(view.position.x,view.position.y,view.position.z);
  camera.lookAt(view.target.x,view.target.y,view.target.z);camera.updateMatrixWorld(true);
  const center=new THREE.Vector3(0,0,0).project(camera);
  const screenFraction=(1-center.y)/2;
  assert.ok(Math.abs(screenFraction-0.5)<1e-10,'undocked optical axis targets the level fuselage');
  const level=chase.flightChasePose(0,0);
  assert.equal(level.pitch,0,'no artificial nose trim');
  const project=(point,pitch)=>point.clone().applyAxisAngle(new THREE.Vector3(1,0,0),pitch).project(camera);
  assert.ok(project(new THREE.Vector3(0,0,-3.65),0).y>project(new THREE.Vector3(0,0,2.7),0).y,'level nose recedes toward the top of the map; it is not aimed at the viewer/ground');
  const state=flight.createFlightState(origin),before=JSON.stringify(state);
  chase.flightChasePose(state.pitch,state.bank);
  assert.equal(JSON.stringify(state),before,'visual trim never changes altitude or the motion model');
});
test('lever track centers on the projected tail line on resize, not every input frame',async()=>{
  const host=flightHost();
  const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
  const all=nodes(host.tree),canvas=all.find(n=>n.type==='canvas');
  const lever=all.find(n=>n.props['data-testid']==='flight-altitude-lever');
  const dimensions={clientWidth:844,clientHeight:390};canvas.props.ref.current=dimensions;
  const properties=new Map();let writes=0;
  lever.props.ref.current={style:{setProperty:(name,value)=>{properties.set(name,value);writes++;}}};
  assert.equal(lever.props.style.transform,'translate(-50%,-50%)');
  assert.equal(lever.props.style.gridTemplateRows,'16px auto 16px','symmetric labels put range center exactly at panel center');
  const cleanup=host.effects[0]();for(let i=0;i<8;i++)await Promise.resolve();
  host.overlays[0].onContextRestored({});host.draw();
  const verify=()=>{
      const expected=chase.flightLowerDock(dimensions.clientWidth,dimensions.clientHeight);
      assert.ok(Math.abs(parseFloat(properties.get('--perix-tail-x'))-expected.left)<1e-8);
      assert.ok(Math.abs(parseFloat(properties.get('--perix-tail-y'))-expected.top)<1e-8);
      assert.ok(Math.abs(parseFloat(properties.get('--perix-lever-height'))-expected.leverHeight)<1e-8);
  };
  verify();const initialWrites=writes;
  host.events.get('keydown')({code:'ArrowDown',target:{},preventDefault(){}});
  host.events.get('keydown')({code:'KeyD',target:{},preventDefault(){}});
  for(let i=0;i<30;i++)host.draw();
  assert.equal(writes,initialWrites,'control never chases the pointer while climbing or banking');
  dimensions.clientWidth=568;dimensions.clientHeight=320;host.draw();verify();
  assert.ok(writes>initialWrites,'responsive layout realigns to the same tail reference');
  assert.equal(chase.flightTailLeverPosition({x:NaN,y:0},844,390),null);
  cleanup();
});
test('W/S changes tempo while inverted Up/Down arrows control nose pitch even with the lever focused',async()=>{
  const host=flightHost(),cleanup=host.effects[0]();
  for(let i=0;i<8;i++)await Promise.resolve();
  host.overlays[0].onContextRestored({});
  const event=(code,key=code,repeat=false)=>({code,key,repeat,target:{tagName:'INPUT',type:'range'},preventDefault(){}});
  host.events.get('keydown')(event('KeyW','w'));
  host.events.get('keydown')(event('KeyW','w',true));
  for(let i=0;i<12;i++)host.draw();
  const telemetry=()=>host.statuses.filter(value=>value&&typeof value==='object'&&'targetTempo'in value).at(-1);
  assert.equal(telemetry().targetTempo,flight.flightTravelLevel(flight.FLIGHT_RULES.cruiseMps+flight.FLIGHT_RULES.speedClickMps).toFixed(1));
  host.events.get('keyup')(event('KeyW','w'));
  host.events.get('keydown')(event('KeyS','s'));
  for(let i=0;i<12;i++)host.draw();
  assert.equal(telemetry().targetTempo,flight.flightTravelLevel(flight.FLIGHT_RULES.cruiseMps).toFixed(1));
  host.events.get('keydown')(event('ArrowDown','ArrowDown'));
  host.draw();assert.equal(host.sampledControls.at(-1).climb,1);
  host.events.get('keyup')(event('ArrowDown','ArrowDown'));
  host.events.get('keydown')(event('ArrowUp','ArrowUp'));
  host.draw();assert.equal(host.sampledControls.at(-1).climb,-1);
  host.events.get('keyup')(event('ArrowUp','ArrowUp'));
  host.draw();assert.equal(host.sampledControls.at(-1).climb,0);
  cleanup();assert.equal(host.events.size,0);
});
test('flight telemetry exposes the changing high-altitude tempo limit instead of hard-coding ten',async()=>{
  for(const [seconds,expected] of [[0,10],[30,17.5],[60,25]]) {
    const host=flightHost(0,{altitude:4000,highTempoSeconds:seconds}),cleanup=host.effects[0]();
    for(let i=0;i<8;i++)await Promise.resolve();
    host.overlays[0].onContextRestored({});for(let i=0;i<12;i++)host.draw();
    const hud=host.statuses.filter(value=>value&&typeof value==='object'&&'tempoMax'in value).at(-1);
    assert.equal(hud.tempoMax,expected);cleanup();
  }
});
test('flight renders, pauses on blur, and cannot draw or handle keys after teardown',async()=>{
  const host=flightHost(),cleanup=host.effects[0]();await Promise.resolve();await Promise.resolve();
  assert.equal(host.counts().maps,1);
  host.overlays[0].onContextRestored({gl:{canvas:{},getContextAttributes:()=>({})}});
  assert.equal(host.options().alpha,true);
  assert.equal(host.options().context,undefined,'aircraft does not share the map draw passes');
  host.draw();host.draw();assert.equal(host.counts().draws,2);
  host.events.get('blur')();assert.ok(host.statuses.includes(true));
  cleanup();assert.equal(host.events.size,0);assert.ok(host.counts().disposed>0);
  host.draw();assert.equal(host.counts().draws,2,'stopped overlay cannot render again');
});
test('aircraft owns a transparent foreground canvas and labels have explicit fitting styles',()=>{
  const host=flightHost();
  const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
  const all=nodes(host.tree);
  const canvas=all.find(n=>n.type==='canvas');
  const map=all.find(n=>n.type==='div'&&n.props.ref);
  assert.ok(canvas.props.style.zIndex>map.props.style.zIndex);
  assert.equal(canvas.props.style.pointerEvents,'none');
  assert.match(canvas.props.style.filter,/saturate\(1\.35\).*contrast\(1\.15\).*brightness\(\.9\)/);
  assert.equal(map.props.style.filter,undefined,'richer/darker grading belongs only to the aircraft, not the map');
  const labels=all.filter(n=>n.type==='small');
  assert.equal(labels.length,0,'public controls show symbols, not captions');
  const developerLabels=nodes(flightHost(undefined,undefined,{showDeveloperTools:true}).tree).filter(n=>n.type==='small');
  assert.equal(developerLabels.length,4);
  for(const label of developerLabels){assert.ok(label.props.style.fontSize);assert.equal(label.props.style.maxWidth,'100%');}
  for(const button of all.filter(n=>n.props.className==='perix-flight-control')){
    assert.equal(button.props.style.boxSizing,'border-box');
    assert.equal(button.props.style.overflow,'hidden');
  }
  const accelerate=all.find(n=>n.props['aria-label']==='Accelerate');
  const decelerate=all.find(n=>n.props['aria-label']==='Decelerate');
  assert.equal(accelerate.props.children[0].props.children[0],'+');
  assert.equal(decelerate.props.children[0].props.children[0],'−');
  assert.equal(accelerate.props['aria-keyshortcuts'],'W');
  assert.equal(decelerate.props['aria-keyshortcuts'],'S');
});
test('developer altitude/tempo remain available only in the opt-in non-interactive footer',()=>{
  const host=flightHost(undefined,undefined,{showDeveloperTools:true});
  const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
  const all=nodes(host.tree);
  const footer=all.find(n=>n.type==='div'&&n.props.style?.bottom&&nodes(n).some(e=>e.props?.['data-testid']==='flight-status'));
  assert.ok(footer);assert.equal(footer.props.style.position,'absolute');
  assert.equal(footer.props.style.pointerEvents,'none','footer cannot intercept joystick gestures');
  assert.ok(nodes(footer).some(n=>n.props?.role==='status'));
  const children=footer.props.children;assert.equal(children[0].props['data-testid'],'flight-telemetry');assert.equal(children[1].props['data-testid'],'flight-status');
});
test('public flight has no telemetry, helper copy or joystick captions',()=>{
  const host=flightHost(),nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)],all=nodes(host.tree);
  assert.equal(all.some(n=>n.props['data-testid']==='flight-telemetry'||n.props['data-testid']==='flight-status'),false);
  const visible=all.filter(n=>['span','small','strong','p','label'].includes(n.type)).flatMap(n=>n.props.children).filter(value=>typeof value==='string').join(' ');
  assert.doesNotMatch(visible,/[A-Za-zΑ-Ωα-ω]/);
  const sticks=all.filter(n=>n.type==='FlightJoystick');assert.equal(sticks.length,2);assert.ok(sticks.every(n=>n.props.showLabels===false));
});
test('mobile WASD and inverted arrow sticks combine independently like their keyboard counterparts',async()=>{
  const host=flightHost(undefined,undefined,{showDeveloperTools:true});
  const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
  const sticks=nodes(host.tree).filter(n=>n.type==='FlightJoystick');assert.equal(sticks.length,2);
  const left=sticks.find(n=>n.props.id==='flight-speed-stick'),right=sticks.find(n=>n.props.id==='flight-steering-stick');
  assert.equal(left.props.vertical,undefined);assert.equal(right.props.vertical,undefined);
  assert.deepEqual({...left.props.directions},{up:'W',down:'S',left:'A',right:'D'});
  const cleanup=host.effects[0]();for(let i=0;i<8;i++)await Promise.resolve();
  host.overlays[0].onContextRestored({});
  left.props.onChange({x:0.3,y:0.8});right.props.onChange({x:0.5,y:0.6});host.draw();
  assert.deepEqual(host.sampledControls.at(-1),{throttle:0.8,turn:0.8,climb:-0.6});
  left.props.onChange({x:0,y:0});host.draw();
  assert.deepEqual(host.sampledControls.at(-1),{throttle:0,turn:0.5,climb:-0.6},'lifting left thumb does not clear the right stick');
  left.props.onChange({x:-0.5,y:0.8});host.draw();
  assert.deepEqual(host.sampledControls.at(-1),{throttle:0.8,turn:0,climb:-0.6},'opposing stick turns cancel rather than overwriting each other');
  right.props.onChange({x:0,y:0});host.draw();
  assert.deepEqual(host.sampledControls.at(-1),{throttle:0.8,turn:-0.5,climb:0},'lifting right thumb preserves WASD throttle and turn');
  left.props.onChange({x:0,y:0});right.props.onChange({x:0,y:-1});host.draw();
  assert.equal(host.sampledControls.at(-1).climb,1,'dragging the arrow stick down is ArrowDown / nose up');
  left.props.onChange({x:0.8,y:0.2});right.props.onChange({x:0.8,y:0});host.draw();
  assert.equal(host.sampledControls.at(-1).turn,1,'combined turning stays bounded');
  host.events.get('blur')();
  const resume=nodes(host.tree).find(n=>n.type==='button'&&n.props['aria-label']==='Pause flight');
  resume.props.onClick();host.draw();
  assert.deepEqual(host.sampledControls.at(-1),{throttle:0,turn:0,climb:0},'blur and resume clear both sticks without held inputs');
  cleanup();
});
