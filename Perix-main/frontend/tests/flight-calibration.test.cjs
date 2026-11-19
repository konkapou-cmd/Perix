const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(file,dependencies={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React}}).outputText,{exports,require:name=>{if(name==='react-i18next')return require('./flightTranslations.cjs').module('en');if(!(name in dependencies))throw Error(name);return dependencies[name];}});return exports;}
const api=load('lib/city/flightCalibration.ts'),landmarks=load('lib/city/flightLandmarks.ts');
test('survey camera bounds and virtual aircraft are presentation-only copies',()=>{
  const view=api.flightCalibrationView({zoom:50,heading:-90,tilt:120,altitude:-10});
  assert.equal(view.zoom,23);assert.equal(view.heading,270);assert.equal(view.tilt,85);assert.equal(view.altitude,0);
  const aircraft={latitude:52,longitude:11,altitude:25,speedMps:18},before=JSON.stringify(aircraft);
  const virtual=api.flightCalibrationAircraft(aircraft,{lat:53,lng:12},4000);
  assert.equal(virtual.latitude,53);assert.equal(virtual.altitude,4000);assert.equal(virtual.speedMps,18);
  assert.equal(JSON.stringify(aircraft),before);
  const bad=api.flightCalibrationAircraft(aircraft,{lat:NaN,lng:12},NaN);
  assert.equal(bad.latitude,52);assert.equal(bad.altitude,25);
  const fallback=api.flightCalibrationView({zoom:NaN,heading:Infinity,tilt:NaN,altitude:NaN});
  assert.equal(fallback.zoom,18);assert.equal(fallback.heading,0);
});
test('survey permits large artwork and optional exact pixel evaluation with distance falloff disabled',()=>{
  const point={latitude:52,longitude:11},plane={...point,altitude:3000};
  const settings={...landmarks.DEFAULT_FLIGHT_BUILDINGS,maxWidth:4096,scale:1,distanceFalloff:0};
  const style=landmarks.flightBuildingStyle(point,plane,1800,settings);
  assert.equal(style.width,1800);
  assert.ok(landmarks.flightBuildingStyle(point,plane,1800,{...settings,distanceFalloff:1}).width<1800);
  assert.equal(landmarks.flightBuildingStyle(point,plane,1000,{...settings,scale:10}).width,4096);
  const huge=landmarks.withFlightBuildingZoomPoint(settings,17,3000);
  assert.equal(landmarks.flightBuildingBaseWidth(17,huge.zoomPoints),3000);
});
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
test('survey panel updates camera, zoom pixels and uncapped 1:1 preview without editing /app or flight state',()=>{
  const changes=[],views=[];const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:v=>[v,()=>{}]};
  const Panel=load('components/game/FlightCalibrationPanel.jsx',{react:{...react,default:react},'../../lib/city/flightLandmarks':landmarks,'../../lib/city/flightCalibration':api}).default;
  const settings={...landmarks.DEFAULT_FLIGHT_BUILDINGS},before=JSON.stringify(settings);
  const tree=Panel({view:{zoom:18,heading:0,tilt:60,altitude:25},actual:{zoom:18,tilt:60,nearestWidth:120,nearestDistance:25},settings,onSettings:v=>changes.push(v),onView:v=>views.push(v)});
  const all=nodes(tree),zoom=all.find(n=>n.props.label==='Camera zoom value');
  zoom.props.onValue(16.5);assert.equal(views[0].zoom,16.5);
  const width=all.find(n=>n.props.label==='Base width px value');
  width.props.onValue(2400);
  assert.equal(landmarks.flightBuildingBaseWidth(18,changes.at(-1).zoomPoints),2400);
  assert.ok(changes.at(-1).zoomPoints.length>=landmarks.DEFAULT_FLIGHT_BUILDING_ZOOMS.length,'editing keeps other curve points');
  const exact=all.find(n=>n.type==='button'&&String(n.props.children).startsWith('1:1'));
  exact.props.onClick();assert.equal(changes.at(-1).maxWidth,4096);assert.equal(changes.at(-1).distanceFalloff,0);
  assert.equal(JSON.stringify(settings),before);
  assert.equal(all.find(n=>n.type==='aside').props.style.touchAction,'pan-y');
});
test('numeric calibration fields allow incomplete typing and only clamp on commit',()=>{
  const values=[];const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:v=>[v,()=>{}],useEffect:()=>{}};
  const NumberInput=load('components/game/FlightCalibrationPanel.jsx',{react:{...react,default:react},'../../lib/city/flightLandmarks':landmarks,'../../lib/city/flightCalibration':api}).CalibrationNumberInput;
  const input=NumberInput({label:'Zoom',value:18,min:3,max:23,onValue:v=>values.push(v)});
  input.props.onChange({target:{value:'1'}});assert.equal(values.length,0,'first digit must not snap back to 3');
  input.props.onChange({target:{value:'15'}});assert.equal(values.at(-1),15);
  input.props.onChange({target:{value:''}});assert.equal(values.length,1);
  input.props.onBlur({currentTarget:{value:'99'}});assert.equal(values.at(-1),23);
});
test('island survey destinations select separate game profiles without moving original coordinates',()=>{
  const initial=JSON.stringify(api.FLIGHT_CALIBRATION_REGIONS);
  assert.equal(api.flightCalibrationRegion({lat:37.447378,lng:25.3268954}),'mykonos');
  assert.equal(api.flightCalibrationRegion({lat:37.4451052,lng:24.9427797}),'syros');
  assert.equal(api.flightCalibrationRegion({lat:52.1372132,lng:11.6384846}),'default');
  assert.equal(api.flightCalibrationRegion(undefined),'default');
  assert.equal(api.FLIGHT_CALIBRATION_REGIONS.length,3);assert.equal(JSON.stringify(api.FLIGHT_CALIBRATION_REGIONS),initial);
});
test('regional panel switches view destinations and labels each exported calibration with its region',()=>{
  const regions=[];const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:()=>[true,()=>{}]};
  const Panel=load('components/game/FlightCalibrationPanel.jsx',{react:{...react,default:react},'../../lib/city/flightLandmarks':landmarks,'../../lib/city/flightCalibration':api}).default;
  const all=nodes(Panel({view:{zoom:18,heading:0,tilt:60,altitude:25},actual:{zoom:18,tilt:60,nearestWidth:150,nearestDistance:25},
    settings:{...landmarks.DEFAULT_FLIGHT_BUILDINGS},region:'syros',onRegion:r=>regions.push(r)}));
  const select=all.find(n=>n.props['aria-label']==='Game calibration region');assert.equal(select.props.value,'syros');
  select.props.onChange({target:{value:'mykonos'}});assert.deepEqual(regions,['mykonos']);
  const output=JSON.parse(all.find(n=>n.type==='textarea').props.value);
  assert.equal(output.region,'syros');assert.equal(output.zoomPoints.find(p=>p[0]===18)[1],70);
  assert.equal(output.maxDistanceM,11750);
});
