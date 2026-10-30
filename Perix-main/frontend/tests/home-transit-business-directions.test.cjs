/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const clone = value => JSON.parse(JSON.stringify(value));
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require: name => mocks[name], ...globals });
  return exports;
}
function expression(file, name, globals) {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let value;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) value = node.initializer.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(value, name);
  const code = ts.transpileModule('const action = ' + value, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext('(function(){' + code + ';return action;})()', globals);
}
function hooks(file, name, mocks, globals = {}) {
  const slots = [], pending = [];
  let cursor = 0, dirty = false, lastArgs = [];
  const react = {
    useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = value;
      return [slots[i], next => { const v = typeof next === 'function' ? next(slots[i]) : next;
        if (v !== slots[i]) { slots[i] = v; dirty = true; } }]; },
    useRef(value) { const i = cursor++; if (!(i in slots)) slots[i] = { current: value }; return slots[i]; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i];
      if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) pending.push(() => {
        old?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
    useMemo(fn, deps) { const i = cursor++, old = slots[i];
      if (!old || deps.some((v,j) => !Object.is(v, old.deps[j]))) slots[i] = { deps, value: fn() };
      return slots[i].value; },
  };
  const api = load(file, { react, ...mocks }, globals);
  return { render(...args) { lastArgs = args.length ? args : lastArgs;
    let value, turns = 0;
    do { dirty = false; cursor = 0; value = api[name](...lastArgs);
      while (pending.length) pending.shift()(); assert.ok(++turns < 20); } while (dirty);
    return value; }, unmount() { slots.forEach(s => s?.cleanup?.()); } };
}

const routes = load('lib/navigation/mobilityRoutes.ts');
test('Locator focuses only the exact fresh linked journey, once, and rejects an expired dated trip', () => {
  const source = ts.createSourceFile('locator.tsx', read('app/(tabs)/locator.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect'
      && node.arguments[0].getText(source).includes('linkedFocusRef.current = true')) callback = node.arguments[0].getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source); assert.ok(callback);
  const link = { id: 'actual', journeyId: 'today:trip' };
  const state = { focus: null, unavailable: false, selected: 'actual', tokens: 0 };
  const globals = { vehicleLink: link, fleetLoaded: true, fleetRequestRef: { current: null },
    linkedFocusRef: { current: false }, selectedVehicle: 'actual', liveVehicles: [
      { vehicle_id: 'actual', trip_instance_id: 'today:trip', latitude: 52, longitude: 11 },
    ], setLinkedResolved() {}, setTripLoading() {}, setLinkedVehicleUnavailable: v => { state.unavailable = v; },
    setSelectedVehicle: v => { state.selected = v; }, setMobilityLocateFocus: v => { state.focus = v; },
    setMobilityLocateToken: fn => { state.tokens = fn(state.tokens); } };
  const action = vm.runInNewContext('(function(){' + ts.transpileModule('const action=' + callback,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + ';return action;})()', globals);
  action(); assert.equal(state.focus, null, 'cached fleet from an earlier navigation cannot resolve a new link');
  globals.fleetRequestRef.current = link; action();
  assert.deepEqual(clone(state.focus), { latitude: 52, longitude: 11 }); assert.equal(state.tokens, 1);
  action(); assert.equal(state.tokens, 1, 'polls do not keep stealing the camera');
  globals.linkedFocusRef.current = false;
  globals.liveVehicles[0].trip_instance_id = 'yesterday:trip'; action();
  assert.equal(state.unavailable, true); assert.equal(state.selected, null);
});
test('home click opens exact dated vehicle in Mobility; other entity routes remain unchanged', () => {
  const vehicle = { vehicle_id: 'est:actual/one', trip_instance_id: 'net:v:date:trip', mode: 'tram', latitude: 52, longitude: 11 };
  const pushed = [];
  const handle = expression('components/home/MapSection.tsx', 'handleMarkerPress', {
    transit: { vehicles: [vehicle] }, ...routes, router: { push: value => pushed.push(value) },
    allBusinesses: [{ business_id: 'biz' }], hotels: [], events: [], activities: [], rentals: [], services: [], jobs: [], products: [], ownerHomes: [],
  });
  handle(routes.transitMarkerId(vehicle.vehicle_id));
  assert.equal(pushed[0].pathname, '/locator');
  assert.equal(pushed[0].params.vehicle_id, vehicle.vehicle_id);
  assert.equal(pushed[0].params.journey_id, vehicle.trip_instance_id);
  assert.equal(pushed[0].params.tab, 'mobility');
  handle('biz'); assert.equal(pushed[1], '/business/biz');
  const link = routes.readMobilityVehicleLink(pushed[0].params);
  assert.deepEqual(clone(link.coordinates), { latitude: 52, longitude: 11 });
  assert.equal(routes.readMobilityVehicleLink({ ...pushed[0].params, mode: 'taxi' }), null);
  assert.equal(routes.readMobilityVehicleLink({ ...pushed[0].params, vehicle_lat: 'NaN' }).coordinates, null);
  assert.equal(routes.readMobilityVehicleLink({ ...pushed[0].params, vehicle_lat: '' }).coordinates, null);
});

test('home transit is immediately fetched, single-flight, exact-path-only, expires, and cancels on blur', async () => {
  let focused = true, resolve;
  const requests = [], timers = new Map(); let nextTimer = 0;
  const fleet = [{ vehicle_id: 'actual', mode: 'bus', trip_instance_id: 'today:T', latitude: 52, longitude: 11, pattern_id: 'east', progress_m: 10,
    network_version_id: 'v2', service_date: 'today' },
    { vehicle_id: 'taxi', mode: 'taxi', latitude: 52, longitude: 11 }];
  const points = [{ latitude: 52, longitude: 11 }, { latitude: 52.01, longitude: 11 }];
  const h = hooks('hooks/useHomeTransit.ts', 'useHomeTransit', {
    'react-native': { Platform: { OS: 'web' } }, '@react-navigation/native': { useIsFocused: () => focused },
    '../context/AuthContext': { useAuth: () => ({ sessionToken: null }) },
    '../lib/navigation/mobilityRoutes': routes,
    '../lib/mobilityNetwork': load('lib/mobilityNetwork.ts', { './api/mobility': {} }),
    './useMobilityNetwork': { useMobilityNetwork: () => ({ map: { lines: [
      { pattern_id: 'west', route_number: '3', points },
      { pattern_id: 'east', network_version_id: 'v1', service_date: 'yesterday', points },
    ] } }) },
    '../lib/api/mobility': { getLiveVehicles: (...args) => { requests.push(args); return new Promise(r => { resolve = r; }); },
      getV2Map: async () => ({ lines: [{ pattern_id: 'west', route_number: '3', points },
        { pattern_id: 'east', network_version_id: 'v1', service_date: 'yesterday', points }] }) },
  }, { document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    setTimeout: (fn, ms) => { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id) });
  h.render(); assert.equal(requests.length, 1); assert.equal(timers.size, 0);
  resolve(fleet); await flush();
  const result = h.render(); assert.equal(result.markers.length, 1);
  assert.equal(result.markers[0].id, 'transit:actual');
  assert.equal(result.markers[0].path, undefined, 'never attach opposite-direction geometry');
  assert.equal(requests[0].length, 1, 'no google_locator context');
  const expiry = [...timers.values()].find(t => t.ms === 30000); expiry.fn();
  assert.equal(h.render().markers.length, 0);
  [...timers.values()].find(t => t.ms === 4000).fn();
  focused = false; h.render(); resolve(fleet); await flush();
  assert.equal(h.render().markers.length, 0, 'late unfocused response cannot restore vehicles'); h.unmount();
});

test('business journey uses the selected origin, avoids GPS tick polling, and ignores superseded destinations', async () => {
  const requests = [];
  const location = { mapPosition: null, selectionRevision: 0, locationMode: 'unset', livePosition: null, location: { latitude: 1, longitude: 1 },
    useLiveLocation: async () => ({ latitude: 52, longitude: 11 }) };
  const h = hooks('hooks/useDestinationJourney.ts', 'useDestinationJourney', {
    '../context/AuthContext': { useAuth: () => ({ sessionToken: null }) },
    '../context/LocationContext': { useLocation: () => location },
    '../lib/api/mobility': { planJourney: (...args) => new Promise((resolve, reject) => requests.push({ args, resolve, reject })) },
  });
  assert.equal(h.render(53, 12).origin, null); assert.equal(requests.length, 0);
  location.livePosition = { latitude: 52, longitude: 11 };
  location.mapPosition = location.livePosition; location.locationMode = 'live'; location.selectionRevision++;
  h.render(); assert.deepEqual(requests[0].args, [null, 52, 11, 53, 12]);
  location.livePosition = { latitude: 52.0001, longitude: 11.0001 };
  location.mapPosition = location.livePosition;
  h.render(); assert.equal(requests.length, 1, 'GPS ticks do not continually replan');
  h.render(54, 13); assert.equal(requests.length, 2);
  requests[0].resolve({ itineraries: [{ arrival: 'old' }] }); await flush();
  assert.equal(h.render().plan, null);
  requests[1].resolve({ itineraries: [{ arrival: 'new', legs: [] }] }); await flush();
  assert.equal(h.render().plan.arrival, 'new');
  h.unmount();
});

test('permission is requested only by the directions action and unavailable connections stay explicit', async () => {
  let permissionCalls = 0;
  const location = { mapPosition: null, locationMode: 'unset', selectionRevision: 0,
    useLiveLocation: async () => { permissionCalls++; location.mapPosition = { latitude: 52, longitude: 11 };
      location.locationMode = 'live'; location.selectionRevision++; return location.mapPosition; } };
  const h = hooks('hooks/useDestinationJourney.ts', 'useDestinationJourney', {
    '../context/AuthContext': { useAuth: () => ({ sessionToken: null }) },
    '../context/LocationContext': { useLocation: () => location },
    '../lib/api/mobility': { planJourney: async () => ({ itineraries: [] }) },
  });
  const state = h.render(53, 12); assert.equal(permissionCalls, 0);
  await state.refresh(); h.render(); await flush();
  const result = h.render(); assert.equal(permissionCalls, 1); assert.equal(result.plan, null); assert.equal(result.resolved, true);
  h.unmount();
});

test('explicit manual origin overrides dormant GPS, replans on a new choice, and refreshes without GPS', async () => {
  let gps = 0;
  const requests = [];
  const location = { mapPosition: { latitude: 48, longitude: 2, name: 'Chosen address' },
    locationMode: 'manual', selectionRevision: 1, livePosition: { latitude: 52, longitude: 11 },
    useLiveLocation: async () => { gps++; return null; } };
  const h = hooks('hooks/useDestinationJourney.ts', 'useDestinationJourney', {
    '../context/AuthContext': { useAuth: () => ({ sessionToken: null }) },
    '../context/LocationContext': { useLocation: () => location },
    '../lib/api/mobility': { planJourney: (...args) => new Promise(resolve => requests.push({ args, resolve })) },
  });
  let state = h.render(49, 3);
  assert.deepEqual(requests[0].args, [null, 48, 2, 49, 3]);
  await state.refresh(); state = h.render(); assert.equal(gps, 0); assert.equal(requests.length, 2);
  location.mapPosition = { latitude: 50, longitude: 4, name: 'New chosen address' }; location.selectionRevision++;
  state = h.render(); assert.deepEqual(requests.at(-1).args, [null, 50, 4, 49, 3]);
  requests[0].resolve({ itineraries: [{ arrival: 'obsolete' }] }); await flush();
  assert.equal(h.render().plan, null); assert.equal(state.originSource, 'manual');h.unmount();
});

test('shared Locator/business line presentation retains walking, rides, stops and route bounds', () => {
  const { journeyPlanLines, journeyViewport } = load('lib/journeyPresentation.ts');
  const plan = { legs: [{ type: 'walk', points: [[52,11],[52.01,11]] },
    { type: 'ride', mode: 'tram', board: 'A', alight: 'B', points: [[52.01,11],[52.1,11.1]] },
    { type: 'walk', points: [] }] };
  const lines = journeyPlanLines(plan);
  assert.equal(lines.length, 2); assert.equal(lines[0].color, '#59ABE3'); assert.equal(lines[1].color, '#166534');
  assert.equal(journeyPlanLines({ legs: [{ type: 'ride', points: [[52,11], null, [53,12]] }] }).length, 0,
    'missing geometry does not become a straight-line connection');
  const region = journeyViewport(lines.flatMap(l => l.points));
  assert.ok(region.latitudeDelta > 0.1 && region.longitudeDelta > 0.1);
  assert.ok(read('components/profile/BusinessProfilePremium.tsx').includes('\n          directions\n'));
  assert.ok(read('components/BusinessMap.native.tsx').includes('coordinates={line.points}'));
});

test('home vehicle scaling matches Mobility and animation never extrapolates beyond a sample', () => {
  const scale = expression('components/BusinessMap.web.tsx', 'vehicleScale', {});
  const htmlScale = read('public/google-mobility-map.html').match(/function vehicleScale\(zoom\)\s*\{[\s\S]*?\n  \}/)[0];
  const expected = vm.runInNewContext('(' + htmlScale + ')');
  for (const zoom of [5,10,14,16,18,21]) assert.equal(scale(zoom), expected(zoom));
  const rec = { animStart: 1000, animDuration: 4000, progFrom: 0, progTo: 100,
    path: [1,2], cum: [0,100], marker: { setPosition() {} } };
  const tick = expression('components/BusinessMap.web.tsx', 'loopTick', {
    markersRef: { current: [rec] }, lastFrameRef: {}, animRafRef: {}, animRunningRef: {},
    Date: { now: () => 14000 }, pointAtProgress: () => ({ lat:52,lng:11 }), requestAnimationFrame() {},
  });
  tick(); assert.equal(rec.progNow, 100); assert.equal(rec.animStart, null);
});

test('vehicles sharing a business or each other\'s coordinates are never hidden in static clusters', () => {
  const allMarkers = ['business', 'event', 'bus', 'tram'].map((type, i) => ({ id: String(i), type, latitude: 52, longitude: 11 }));
  const groups = expression('components/BusinessMap.web.tsx', 'groupedMarkers', {
    useMemo: fn => fn(), allMarkers, markersVersion: 'test', COLORS: { pinClosed: '#000' },
  });
  assert.equal(groups.length, 3);
  assert.equal(groups.find(g => g.type === 'bus').count, 1);
  assert.equal(groups.find(g => g.type === 'tram').count, 1);
  assert.equal(groups.find(g => g.type === 'business').count, 2);
});
