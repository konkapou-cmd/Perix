const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies={}) {
  const exports={};
  const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
    {exports,require:name=>dependencies[name]});
  return exports;
}

const {vehicleForDeparture}=load('lib/city/arrivalVehicle.ts',{
  './visualGeometry':{visualGeometryReady:(_vehicle,lines)=>lines.some(line=>line.pattern_id==='pattern')},
});

const row={vehicle_id:'vehicle:trip-1',trip_id:'trip-1',trip_instance_id:'instance-1',network_version_id:'network-v3',
  service_date:'2026-11-06',pattern_id:'pattern',route_number:'10',mode:'bus',platform_id:'platform-north'};
const vehicle={vehicle_id:row.vehicle_id,trip_id:row.trip_id,trip_instance_id:row.trip_instance_id,
  network_version_id:row.network_version_id,service_date:row.service_date,pattern_id:row.pattern_id,
  route_number:row.route_number,mode:row.mode,latitude:52.14,longitude:11.63};

test('departure rows link only to one exact dated trip, vehicle, pattern, mode and located platform row',()=>{
  assert.equal(vehicleForDeparture(row,[vehicle],[]),vehicle);
  for(const key of ['vehicle_id','trip_id','trip_instance_id','network_version_id','service_date','pattern_id','route_number','mode']) {
    const different={...vehicle,[key]:`${vehicle[key]}-other`};
    assert.equal(vehicleForDeparture(row,[different],[]),null,`reject mismatch in ${key}`);
  }
  assert.equal(vehicleForDeparture({...row,platform_id:undefined},[vehicle],[]),null,'a parent-stop name cannot substitute for platform identity');
  assert.equal(vehicleForDeparture(row,[vehicle,{...vehicle}],[]),null,'ambiguous duplicate matches fail closed');
  assert.equal(vehicleForDeparture(row,[{...vehicle,latitude:null}],[]),null,'unlocated trips do not receive a marker link');
});

test('recovered visual vehicle links require its ready exact geometry',()=>{
  const recovered={...vehicle,estimated:true,motion:{model:'TIME_NORMALIZED_VISUAL_ESTIMATE',publication_status:'READY'}};
  assert.equal(vehicleForDeparture(row,[recovered],[]),null);
  assert.equal(vehicleForDeparture(row,[recovered],[{pattern_id:'other'}]),null);
  assert.equal(vehicleForDeparture(row,[recovered],[{pattern_id:'pattern'}]),recovered);
  assert.equal(vehicleForDeparture(row,[{...recovered,motion:{...recovered.motion,publication_status:'PENDING'}}],
    [{pattern_id:'pattern'}]),null);
});

test('a previous-trip vehicle links only when the backend marks its exact dated identity as a verified block predecessor',()=>{
  const linkedRow={...row,vehicle_id:'run:previous',vehicle_link_basis:'VERIFIED_BLOCK_PREDECESSOR',
    position_trip_id:'trip-previous',position_trip_instance_id:'network-v:2026-11-06:trip-previous',
    position_pattern_id:'pattern-previous',position_route_number:'10',position_mode:'bus'};
  const previousVehicle={...vehicle,vehicle_id:linkedRow.vehicle_id,trip_id:linkedRow.position_trip_id,
    trip_instance_id:linkedRow.position_trip_instance_id,pattern_id:linkedRow.position_pattern_id};
  assert.equal(vehicleForDeparture(linkedRow,[previousVehicle],[]),previousVehicle);
  assert.equal(vehicleForDeparture({...linkedRow,vehicle_link_basis:undefined},[previousVehicle],[]),null,
    'a shared vehicle ID without backend-verified block evidence is insufficient');
  assert.equal(vehicleForDeparture({...linkedRow,position_trip_instance_id:'wrong-date'},[previousVehicle],[]),null);
  assert.equal(vehicleForDeparture({...linkedRow,position_route_number:'other-line'},[previousVehicle],[]),null);
});
