/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

function mapPage() {
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
  }
  const element = () => ({ style: {}, children: [], listeners: {},
    appendChild(child) { this.children.push(child); },
    addEventListener(name, callback) { this.listeners[name] = callback; },
  });
  const page = vm.createContext({
    window: { parent: { postMessage: message => messages.push(message) },
      location: { origin: 'https://test.invalid' }, addEventListener() {} },
    document: { getElementById: element, createElement: element },
    requestAnimationFrame: () => 1,
    google: { maps: {
      Marker, Polyline: Marker, Size: function () {}, Point: function () {},
      SymbolPath: { CIRCLE: 0 },
      Map: function () { this.addListener = () => {}; this.getZoom = () => 15; },
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
  rendered.marker.listeners.click({});
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'stopPress');
  assert.equal(messages[0].stop_id, 'physical:one');
});

test('vehicle and stop selections open just the requested panel and clear old results', () => {
  const state = { selectedVehicle: 'old', tripProgress: { stale: true }, selectedStop: null, servingBuses: [1] };
  const globals = {};
  for (const key of ['SelectedVehicle', 'TripProgress', 'SelectedStop', 'BusQuery', 'BusSuggestions',
    'ServingBuses', 'ArrivalsLoading', 'ArrivalsLoadFailed', 'TripLoading', 'TripLoadFailed']) {
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
