/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

function mapPage(clock = { now: Date.now() }, zoom = 15) {
  const messages = [];
  function Marker(options) {
    Object.assign(this, options);
    this.listeners = {};
    this.addListener = (name, callback) => { this.listeners[name] = callback; };
    this.setMap = value => { this.map = value; };
    this.setPosition = value => { this.position = value; };
    this.setIcon = value => { this.icon = value; };
    this.setOpacity = () => {};
    this.setOptions = options => Object.assign(this, options);
    this.getPosition = () => this.position;
  }
  const element = () => ({ style: {}, children: [], listeners: {},
    appendChild(child) { this.children.push(child); },
    addEventListener(name, callback) { this.listeners[name] = callback; },
    setAttribute(name, value) { this[name] = value; },
  });
  const page = vm.createContext({
    window: { parent: { postMessage: message => messages.push(message) },
      location: { origin: 'https://test.invalid' }, addEventListener() {} },
    document: { getElementById: element, createElement: element },
    requestAnimationFrame: () => 1,
    Date: class extends Date { static now() { return clock.now; } },
    google: { maps: {
      Marker, Polyline: Marker, Size: function () {}, Point: function () {},
      SymbolPath: { CIRCLE: 0 },
      Map: function () { this.addListener = () => {}; this.getZoom = () => zoom; },
      InfoWindow: function () { this.setContent = value => { this.content = value; };
        this.open = value => { this.options = value; this.closed = false; }; this.close = () => { this.closed = true; }; },
    } },
  });
  vm.runInContext(read('public/google-mobility-map.html').match(/<script>([\s\S]*?)<\/script>/)[1], page);
  page.initMap();
  messages.length = 0;
  return { page, messages };
}

function locatorCallback(name, globals) {
  const source = ts.createSourceFile('locator.tsx', read('app/(tabs)/locator.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) {
      callback = node.initializer.arguments[0].getText(source);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(callback, `Missing actual Locator callback ${name}`);
  const code = ts.transpileModule(`const action = ${callback};`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return vm.runInNewContext('(function(){' + code + '\nreturn action;})()', globals);
}

const points = [{ latitude: 52, longitude: 11 }, { latitude: 52.01, longitude: 11.01 }];

test('network and journey lines never register clicks or change selection', () => {
  const { page, messages } = mapPage();
  page.drawLines([{ pattern_id: 'one', route_number: '3', points }]);
  page.drawPlanLines([{ pattern_id: 'one', segment_id: 'ride', points }]);
  for (const line of [...Object.values(page.LINES), ...Object.values(page.PLAN)]) {
    assert.equal(line.clickable, false);
    assert.equal(Object.keys(line.listeners).length, 0);
  }
  assert.equal(messages.length, 0);
  assert.ok(!read('components/GoogleMobilityMap.tsx').includes('lineClick'));
  assert.ok(!read('components/GoogleMobilityMap.native.tsx').includes('lineClick'));
  assert.ok(!read('app/(tabs)/locator.tsx').includes('onTransitLineClick='));
});

test('bus and tram show upright source route badges and select the exact vehicle', () => {
  const { page, messages } = mapPage();
  for (const [type, label] of [['bus', 'N8'], ['tram', '3']]) {
    page.drawVehicles([{ id: type + ':instance', type, label, latitude: 52, longitude: 11, progressM: 0, path: points }]);
    const marker = page.VEHICLES[type + ':instance'].marker;
    const svg = decodeURIComponent(marker.icon.url.split(',')[1]);
    assert.ok(svg.includes('data-perix-route-badge="true"'));
    assert.ok(svg.includes(`>${label}</text>`));
    assert.ok(svg.indexOf('data-perix-route-badge') > svg.indexOf('</g></g>'), 'badge is outside the vehicle rotation');
    marker.listeners.click();
    assert.equal(messages.at(-1).type, 'markerPress');
    assert.equal(messages.at(-1).id, type + ':instance');
  }
  assert.equal(page.routeBadge('', 64, '#000'), '');
  assert.ok(!page.busSvg('<img>', 90).includes('<img>'));
});

test('the actually rendered classic stop marker opens arrivals, not only its unused DOM container', () => {
  const { page, messages } = mapPage();
  const stop = { stop_id: 'physical:one', name: 'Domplatz', modes: ['bus'], routes: [] };
  const rendered = page.buildStopPin(stop, 52, 11, true, undefined, null, 'one');
  assert.equal(rendered.marker.clickable, true);
  assert.equal(rendered.marker.zIndex, 5, 'stop markers cannot cover the vehicle layer');
  rendered.marker.listeners.click({});
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'stopPress');
  assert.equal(messages[0].stop_id, 'physical:one');
});

test('vehicle and stop selections open just the requested panel and clear old results', () => {
  const state = { selectedVehicle: 'old', tripProgress: { stale: true }, selectedStop: null, servingBuses: [1] };
  const globals = {};
  for (const key of ['SelectedVehicle', 'TripProgress', 'SelectedStop', 'BusQuery', 'BusSuggestions',
    'ServingBuses', 'ArrivalsLoading', 'ArrivalsLoadFailed', 'TripLoading', 'TripLoadFailed', 'LinkedVehicleUnavailable']) {
    const field = key[0].toLowerCase() + key.slice(1);
    globals['set' + key] = value => { state[field] = typeof value === 'function' ? value(state[field]) : value; };
  }
  const stop = locatorCallback('selectArrivalStop', globals);
  const vehicle = locatorCallback('selectTransitVehicle', globals);
  stop({ stop_id: 'physical:one', name: 'One' });
  assert.equal(state.selectedVehicle, null);
  assert.equal(state.tripProgress, null);
  assert.equal(state.selectedStop.stop_id, 'physical:one');
  assert.equal(state.arrivalsLoading, true);
  vehicle('bus:one');
  assert.equal(state.selectedStop, null);
  assert.equal(state.servingBuses.length, 0);
  assert.equal(state.selectedVehicle, 'bus:one');
  assert.equal(state.tripLoading, true);
  vehicle('bus:one');
  assert.equal(state.selectedVehicle, null);
});

test('next-stop list uses a unique current-trip motion anchor without inventing corrected times', () => {
  const stops = [
    { stop_id: 'A', passed: true, predicted: '00:40' },
    { stop_id: 'B', passed: true, predicted: '00:41' },
    { stop_id: 'C', passed: false, predicted: '00:42' },
    { stop_id: 'D', passed: false, skipped: true, predicted: '00:43' },
  ];
  const details = { vehicle_id: 'one', trip_id: 'dated-trip', stops };
  const globals = { tripProgress: details, selectedVehicle: 'one',
    liveVehicles: [{ vehicle_id: 'one', trip_id: 'dated-trip', next_stop_id: 'B' }] };
  const before = JSON.stringify(details);
  const result = locatorCallback('upcomingTripStops', globals)();
  assert.deepEqual(Array.from(result, stop => stop.stop_id), ['B', 'C']);
  assert.equal(result[0].predicted, '00:41');
  assert.equal(result[0].passed, true, 'elapsed source time stays observable for the warning');
  assert.equal(JSON.stringify(details), before);
  globals.liveVehicles[0].trip_id = 'another-trip';
  assert.equal(locatorCallback('upcomingTripStops', globals)().length, 0);
});

test('repeated or unavailable motion stop IDs do not guess a loop occurrence', () => {
  const globals = { selectedVehicle: 'one',
    liveVehicles: [{ vehicle_id: 'one', trip_id: 'trip', next_stop_id: 'A' }],
    tripProgress: { vehicle_id: 'one', trip_id: 'trip', stops: [
      { stop_id: 'A', passed: true }, { stop_id: 'B', passed: false }, { stop_id: 'A', passed: false },
      { stop_id: 'skip', passed: false, schedule_relationship: 'SKIPPED' },
    ] },
  };
  const result = locatorCallback('upcomingTripStops', globals)();
  assert.deepEqual(Array.from(result, stop => stop.stop_id), ['B', 'A']);
});

test('nearby same-name opposite platforms keep separate click identities', () => {
  const { page, messages } = mapPage(undefined, 17);
  page.drawStops([{ stop_id: 'physical:dom', name: 'Domplatz', latitude: 52, longitude: 11,
    modes: ['tram'], routes: [], platforms: [
      { platform_id: 'east', latitude: 52, longitude: 11, directions: ['East'] },
      { platform_id: 'west', latitude: 52.00001, longitude: 11, directions: ['West'] },
    ] }]);
  assert.equal(Object.keys(page.STOPS).length, 2, 'even within the old 12m cluster radius');
  Object.values(page.STOPS).forEach(stop => stop.marker.listeners.click({}));
  assert.deepEqual(messages.map(m => m.platform_id).sort(), ['east', 'west']);
});

test('lime approach is clipped at rendered progress every frame and leaves no trail', () => {
  const clock = { now: 100000 };
  const { page } = mapPage(clock);
  const path = [{ latitude: 52, longitude: 11 }, { latitude: 52.001, longitude: 11 },
    { latitude: 52.001, longitude: 11.001 }];
  const vehicle = { id: 'v', journeyId: 'dated:T', latitude: 52, longitude: 11, path, progressM: 10 };
  page.drawVehicles([vehicle]);
  const rec = page.VEHICLES.v;
  const target = { vehicleId: 'v', journeyId: 'dated:T', platformId: 'east',
    boardProgressM: 150, pathKey: rec.pathKey };
  page.drawApproaches([target]);
  const overlay = page.APPROACH;
  assert.equal(overlay.strokeColor, '#A3E635');
  assert.equal(overlay.clickable, false);
  clock.now += 5000;
  page.drawVehicles([{ ...vehicle, progressM: 90 }]);
  clock.now += 2500;
  page.loopTick();
  assert.equal(page.APPROACH, overlay, 'update one polyline, not a trail of lines');
  assert.equal(rec.progNow, 50);
  assert.deepEqual(JSON.parse(JSON.stringify(overlay.path[0])), JSON.parse(JSON.stringify(
    page.pointAtProgress(rec.path, rec.cum, 50))));
  assert.ok(overlay.path[0].lat > path[0].latitude);
  clock.now += 2500;
  page.loopTick();
  assert.equal(rec.progNow, 90);
  assert.ok(overlay.path[0].lat > page.pointAtProgress(rec.path, rec.cum, 50).lat);
  page.drawVehicles([{ ...vehicle, progressM: 151, speed: 0 }]);
  assert.equal(page.APPROACH, null);
  assert.equal(overlay.map, null);
});

test('approach clears on trip, geometry, selection, fleet loss and stale samples', () => {
  for (const reason of ['trip', 'geometry', 'selection', 'missing', 'stale']) {
    const clock = { now: 100000 };
    const { page } = mapPage(clock);
    const v = { id: 'v', journeyId: 'dated:T', latitude: 52, longitude: 11, path: points, progressM: 10 };
    page.drawVehicles([v]);
    const target = { vehicleId: 'v', journeyId: 'dated:T', platformId: 'east',
      boardProgressM: 100, pathKey: page.VEHICLES.v.pathKey };
    page.drawApproaches([target]);
    const overlay = page.APPROACH;
    if (reason === 'trip') page.drawVehicles([{ ...v, journeyId: 'tomorrow:T' }]);
    if (reason === 'geometry') page.drawVehicles([{ ...v, path: [points[0], { latitude: 52.02, longitude: 11 }] }]);
    if (reason === 'selection') page.drawApproaches([]);
    if (reason === 'missing') page.drawVehicles([]);
    if (reason === 'stale') { clock.now += 30001; page.updateApproach(); }
    assert.equal(page.APPROACH, null, reason);
    assert.equal(overlay.map, null, reason);
  }
});

test('coincident stationary vehicles remain at source coordinates and each exact ID is selectable', () => {
  const { page, messages } = mapPage();
  const fleet = ['51', '13', '4'].map((label, i) => ({ id: 'real-source-'+i, journeyId: 'dated:'+i,
    type: i ? 'tram' : 'bus', label, direction: 'Direction '+i, estimated: true,
    latitude: 52.13077, longitude: 11.6288, positionState: 'TURNAROUND_ANCHOR' }));
  page.drawVehicles(fleet);
  assert.equal(Object.keys(page.VEHICLES).length, 3);
  const stack = Object.values(page.VEHICLE_STACKS)[0];
  assert.equal(stack.members.length, 3);
  for (const v of Object.values(page.VEHICLES)) assert.deepEqual(JSON.parse(JSON.stringify(v.marker.position)), { lat:52.13077,lng:11.6288 });
  stack.marker.listeners.click();
  const buttons = page.STACK_INFO.content.children.slice(1);
  assert.equal(buttons.length, 3);
  buttons.forEach(button => button.listeners.click({ stopPropagation() {} }));
  assert.deepEqual(messages.map(m => m.id).sort(), fleet.map(v => v.id).sort());
  assert.ok(messages.every(m => m.type === 'markerPress'));
  assert.ok(buttons[1].textContent.includes('Direction'));
});

test('stack badge and old popup clear when a vehicle departs or the dated membership changes', () => {
  const { page } = mapPage();
  const first = { id:'one',journeyId:'today:one',type:'tram',label:'4',latitude:52,longitude:11,positionState:'STOP_ANCHOR' };
  const second = { ...first,id:'two',journeyId:'today:two' };
  page.drawVehicles([first,second]);
  const stack = Object.values(page.VEHICLE_STACKS)[0];stack.marker.listeners.click();
  page.drawVehicles([first,{ ...second,journeyId:'tomorrow:two' }]);
  assert.equal(page.STACK_INFO.closed,true);
  stack.marker.listeners.click();
  page.drawVehicles([first,{ ...second,positionState:'ON_PATTERN',motionState:'MOVING',speed:20 }]);
  assert.equal(Object.keys(page.VEHICLE_STACKS).length,0);
  assert.equal(stack.marker.map,null);assert.equal(page.STACK_INFO.closed,true);
});

test('a stale canonical generation never pulls an estimated vehicle away from the supplied position', () => {
  const { page } = mapPage();
  page.drawVehicles([{ id:'model',journeyId:'today:T',type:'tram',estimated:true,latitude:53,longitude:12,
    path:points,progressM:10,positionState:'ON_PATTERN',speed:20 }]);
  assert.equal(page.VEHICLES.model.path,null);
  assert.deepEqual(JSON.parse(JSON.stringify(page.VEHICLES.model.marker.position)),{lat:53,lng:12});
  assert.equal(page.VEHICLES.model.animStart,null);
  page.drawVehicles([{id:'nearby-stale',journeyId:'today:next',type:'tram',estimated:true,latitude:52.0002,longitude:11,
    path:points,progressM:0,motionState:'DWELL',speed:0,positionState:'ON_PATTERN'}]);
  assert.equal(page.VEHICLES['nearby-stale'].path,null,'even a 22m stale stop projection cannot replace the supplied zero-ETA position');
  assert.equal(page.VEHICLES['nearby-stale'].marker.position.lat,52.0002);
});

test('fresh stop names/platform metadata replace old pins without duplicating or keeping old click closures', () => {
  const { page, messages } = mapPage(undefined,17);
  const stop={stop_id:'physical:A',name:'Old name',latitude:52,longitude:11,modes:['tram'],routes:[],
    platforms:[{platform_id:'A',latitude:52,longitude:11,directions:['East']}]};
  page.drawStops([stop]);const old=Object.values(page.STOPS)[0].marker;
  page.drawStops([{...stop,name:'New name'}]);
  assert.equal(Object.keys(page.STOPS).length,1);assert.equal(old.map,null);
  Object.values(page.STOPS)[0].marker.listeners.click({});
  assert.equal(messages.at(-1).name,'New name');assert.equal(messages.at(-1).platform_id,'A');
});
