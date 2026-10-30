/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(resolve => setImmediate(resolve));

function mount(file, name, mocks, globals = {}) {
  const slots = [], effects = [];
  let cursor = 0, dirty = false, args = [], value;
  const react = {
    createContext: () => ({ Provider: 'Provider' }), useContext: () => null,
    useState(initial) { const i=cursor++; if (!(i in slots)) slots[i]=typeof initial==='function'?initial():initial;
      return [slots[i], next => { const v=typeof next==='function'?next(slots[i]):next; if(!Object.is(v,slots[i])) {slots[i]=v;dirty=true;} }]; },
    useRef(initial) { const i=cursor++; if(!(i in slots)) slots[i]={current:initial};return slots[i]; },
    useEffect(fn,deps) { const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j]))) effects.push(()=>{
      old?.cleanup?.();slots[i]={deps,cleanup:fn()};}); },
    useCallback(fn,deps) { const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))slots[i]={deps,value:fn};return slots[i].value; },
  };
  react.default=react;
  const jsx=(type,props)=>({type,props});
  const exports={};
  vm.runInNewContext(ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,
    target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,
  {exports,require:n=>({react,'react/jsx-runtime':{jsx,jsxs:jsx},...mocks})[n],...globals});
  const h={render(...next) { if(next.length)args=next;let turns=0;do {dirty=false;cursor=0;value=exports[name](...args);
    while(effects.length)effects.shift()();assert.ok(++turns<30,'stable hooks');}while(dirty);return value;},
    async settle() {for(let i=0;i<4;i++){await flush();h.render();}return value;},
    unmount(){slots.forEach(s=>s?.cleanup?.());},get value(){return value;} };
  return h;
}

function provider({ storage = new Map(), granted = false, token = null } = {}) {
  let position={latitude:52.13,longitude:11.64,accuracy:5}, get=async()=>position, watch, stopped=0, fixes=0, permissionChecks=0;
  const asyncStorage={getItem:async k=>storage.get(k)||null,setItem:async(k,v)=>storage.set(k,v)};
  const h=mount('context/LocationContext.tsx','LocationProvider',{
    '@react-native-async-storage/async-storage':{default:asyncStorage},
    'react-native':{Platform:{OS:'web'},AppState:{}},
    './AuthContext':{useAuth:()=>({sessionToken:token})},
    '../lib/locationPermission':{
      getCurrentPositionWithPermission:async()=>{fixes++;return get();},
      isGeolocationGranted:async()=>{permissionChecks++;return granted;},
      isReliablePosition:a=>typeof a==='number'&&a<=800,
      watchPrecisePosition:fn=>{watch=fn;return()=>{stopped++;};},
    },
  },{window:{localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},addEventListener(){},removeEventListener(){}},
    document:{visibilityState:'visible',addEventListener(){},removeEventListener(){}},
    setInterval:()=>1,clearInterval(){},console});
  h.render({children:null});
  return {h,storage,get state(){return h.value.props.value;},get fixes(){return fixes;},get permissionChecks(){return permissionChecks;},
    get stopped(){return stopped;},setGet(fn){get=fn;},emit(p){watch?.(p);},setPosition(p){position=p;}};
}

test('manual address is the visible origin even with a dormant GPS fix; watch cannot override it',async()=>{
  const p=provider();await p.h.settle();
  await p.state.useLiveLocation();await p.h.settle();
  assert.equal(p.state.locationMode,'live');assert.equal(p.state.mapPosition.latitude,52.13);
  p.state.setManualLocation(48.85,2.35,'Selected address, Paris');p.h.render();
  assert.equal(p.state.locationMode,'manual');assert.equal(p.state.mapPosition.latitude,48.85);
  assert.equal(p.state.livePosition.latitude,52.13,'raw GPS remains separate, not relabelled');
  assert.ok(p.stopped>0);
  p.emit({latitude:60,longitude:10,accuracy:3});p.h.render();
  assert.equal(p.state.mapPosition.name,'Selected address, Paris');assert.equal(p.state.mapPosition.latitude,48.85);
  p.h.unmount();
});

test('an in-flight GPS request loses to a newer typed selection',async()=>{
  const p=provider();await p.h.settle();let resolve;
  p.setGet(()=>new Promise(r=>{resolve=r;}));
  const gps=p.state.useLiveLocation();
  p.state.setManualLocation(0,0,'Zero meridian');p.h.render();
  resolve({latitude:52,longitude:11,accuracy:5});assert.equal(await gps,null);await p.h.settle();
  assert.deepEqual(copy(p.state.mapPosition),{latitude:0,longitude:0,name:'Zero meridian',isLiveLocation:false});
  assert.equal(p.state.loading,false);p.h.unmount();
});

test('bootstrap GPS cannot overwrite an address selected while startup is resolving',async()=>{
  const p=provider({token:'qa',granted:true});let resolve;
  p.setGet(()=>new Promise(r=>{resolve=r;}));await flush();p.h.render();
  assert.equal(typeof resolve,'function');
  p.state.setManualLocation(52.125,11.631,'Chosen during startup');p.h.render();
  resolve({latitude:40,longitude:20,accuracy:4});await p.h.settle();
  assert.equal(p.state.locationMode,'manual');assert.equal(p.state.mapPosition.name,'Chosen during startup');
  assert.equal(p.state.livePosition,null);p.h.unmount();
});

test('denied GPS leaves the selected address visible instead of clearing it or showing an old fix',async()=>{
  const p=provider();await p.h.settle();p.state.setManualLocation(52,11,'Keep this address');p.h.render();
  p.setGet(async()=>null);assert.equal(await p.state.useLiveLocation(),null);await p.h.settle();
  assert.equal(p.state.locationMode,'manual');assert.equal(p.state.mapPosition.name,'Keep this address');
  assert.equal(p.state.loading,false);assert.ok(p.state.error);p.h.unmount();
});

test('manual preference/name restore without requesting GPS, even when permission is already granted',async()=>{
  const storage=new Map();const first=provider({storage});await first.h.settle();
  first.state.setManualLocation(52.125,11.631,'Domplatz, Magdeburg');first.h.render();first.h.unmount();
  const next=provider({storage,token:'qa',granted:true});await next.h.settle();
  assert.equal(next.state.mapPosition.name,'Domplatz, Magdeburg');assert.equal(next.state.locationMode,'manual');
  assert.equal(next.fixes,0);assert.equal(next.permissionChecks,0);
  next.setPosition({latitude:53,longitude:12,accuracy:4});await next.state.useLiveLocation();await next.h.settle();
  assert.equal(next.state.locationMode,'live');assert.equal(next.state.mapPosition.latitude,53);
  assert.equal(JSON.parse(storage.get('@perix_last_location')).mode,'live');next.h.unmount();
});

test('unset/invalid coordinates never create an arbitrary origin pin',async()=>{
  const p=provider();await p.h.settle();assert.equal(p.state.mapPosition,null);assert.equal(p.fixes,0);
  p.state.setManualLocation(91,0,'invalid');p.h.render();assert.equal(p.state.mapPosition,null);
  p.state.setManualLocation(NaN,2,'invalid');p.h.render();assert.equal(p.state.mapPosition,null);p.h.unmount();
});

function nodes(tree,type) {
  if(!tree||typeof tree!=='object')return[];
  const children=tree.props?.children;
  return [...(tree.type===type?[tree]:[]),...(Array.isArray(children)?children:[children]).flatMap(child=>nodes(child,type))];
}
test('address suggestions work anonymously, retain the full name, and do not request GPS',async()=>{
  const timers=new Map();let timerId=0,resolve;const requests=[],chosen=[];let gps=0;
  const h=mount('components/shared/AreaSelection.tsx','AreaSelectionForm',{
    'react-native':{View:'View',Text:'Text',TextInput:'TextInput',Pressable:'Pressable',ScrollView:'ScrollView',ActivityIndicator:'Spinner',StyleSheet:{create:v=>v}},
    '@expo/vector-icons':{Ionicons:'Icon'},'react-i18next':{useTranslation:()=>({t:(_key,fallback)=>fallback,i18n:{language:'en'}})},
    '../../lib/api/core':{apiRequest:(...args)=>{requests.push(args);return new Promise(r=>{resolve=r;});}},
    '../../lib/designTokens':{COLORS:{},BORDER_RADIUS:{},FONT_SIZES:{},SPACING:{}},
  },{setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
  let tree=h.render({sessionToken:null,onSelectPlace:(...args)=>chosen.push(args),onUseLive:async()=>{gps++;}});
  nodes(tree,'TextInput')[0].props.onChangeText('Domplatz');tree=h.render();
  [...timers.values()].find(t=>t.ms===450).fn();assert.equal(requests.length,1);assert.equal(requests[0][2],undefined);
  resolve({predictions:[{place_id:'good',description:'Domplatz, Magdeburg, Germany',lat:52.124,lng:11.631},
    {place_id:'invalid',description:'Invalid',lat:100,lng:11}]});await flush();tree=h.render();
  const result=nodes(tree,'Pressable').find(n=>nodes(n,'Text').some(t=>t.props.children==='Domplatz, Magdeburg, Germany'));
  assert.ok(result);result.props.onPress();assert.deepEqual(chosen,[[52.124,11.631,'Domplatz, Magdeburg, Germany']]);
  assert.equal(gps,0);h.unmount();
});

test('home no longer offers Go to Map or the explanatory Set Your Area paragraph',()=>{
  const home=read('app/(tabs)/home.tsx');
  assert.ok(home.includes('<AreaSelectionForm'));
  assert.ok(!home.includes('home.goToMap'));assert.ok(!home.includes('home.setLocationDescription'));
  for(const file of ['components/BusinessMap.web.tsx','components/BusinessMap.native.tsx','components/GoogleMobilityMap.tsx','components/GoogleMobilityMap.native.tsx'])
    assert.ok(read(file).includes('<MapLocationControl />'),file);
});
