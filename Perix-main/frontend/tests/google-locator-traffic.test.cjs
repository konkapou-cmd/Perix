const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.dirname(require.resolve("../package.json"));
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
function load(file, mocks) {
  const exports = {};
  const code = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require(name) {
      assert.ok(name in mocks, `Unexpected import: ${name}`);
      return mocks[name];
    },
    process: { env: {} },
    ...mocks.globals,
  });
  return exports;
}

test("mobility API defaults to unchanged URLs and preserves IDs in both contexts", async () => {
  const calls = [];
  const api = load("lib/api/mobility.ts", {
    "./core": {
      apiRequest: async (...args) => {
        calls.push(args);
        if (args[0].includes("/arrivals")) return [{ vehicle_id: "vehicle:/42", route_number: "42", eta_seconds: 90 }];
        if (args[0].includes("/trip")) return { vehicle_id: "vehicle:/42", stops: [] };
        return [{ vehicle_id: "vehicle:/42", mode: "bus", trip_id: "trip:/7", pattern_id: "pattern:/9", route: { number: "42" } }];
      },
    },
  });
  for (const context of [undefined, "baseline"]) {
    const vehicles = await api.getLiveVehicles("token", context);
    assert.equal(vehicles[0].vehicle_id, "vehicle:/42");
    assert.equal(vehicles[0].trip_id, "trip:/7");
    assert.equal(vehicles[0].pattern_id, "pattern:/9");
    assert.deepEqual(calls.at(-1), ["/mobility/v2/vehicles", "GET", "token"]);
    const arrivals = await api.getBusesServing(null, "stop:/1", 52, 11, context);
    assert.equal(arrivals[0].vehicle_id, "vehicle:/42");
    assert.deepEqual(calls.at(-1), ["/mobility/v2/stops/stop%3A%2F1/arrivals", "GET", undefined]);
    const trip = await api.getVehicleTrip("token", "vehicle:/42", context);
    assert.equal(trip.vehicle_id, "vehicle:/42");
    assert.deepEqual(calls.at(-1), ["/mobility/vehicles/vehicle%3A%2F42/trip", "GET", "token"]);
  }
  // Assert the backend contract as literal full URLs, not a derived suffix.
  const vehicles = await api.getLiveVehicles("token", "google_locator");
  assert.equal(vehicles[0].vehicle_id, "vehicle:/42");
  assert.equal(vehicles[0].trip_id, "trip:/7");
  assert.equal(vehicles[0].pattern_id, "pattern:/9");
  assert.deepEqual(calls.at(-1), ["/mobility/v2/vehicles?traffic_context=google_locator", "GET", "token"]);
  const arrivals = await api.getBusesServing(null, "stop:/1", 52, 11, "google_locator");
  assert.equal(arrivals[0].vehicle_id, "vehicle:/42");
  assert.deepEqual(calls.at(-1), ["/mobility/v2/stops/stop%3A%2F1/arrivals?traffic_context=google_locator", "GET", undefined]);
  const trip = await api.getVehicleTrip("token", "vehicle:/42", "google_locator");
  assert.equal(trip.vehicle_id, "vehicle:/42");
  assert.deepEqual(calls.at(-1), ["/mobility/vehicles/vehicle%3A%2F42/trip?traffic_context=google_locator", "GET", "token"]);
});

test("iframe readiness is source/origin checked and resets on reload/unmount, not listener rebind", () => {
  const slots = [];
  const pending = [];
  let cursor = 0;
  const listeners = new Set();
  const messages = [];
  const frame = { contentWindow: { postMessage: (...args) => messages.push(args) } };
  const window = {
    location: { origin: "https://test.invalid" },
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  };
  const react = {
    useRef(value) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: value };
      return slots[index];
    },
    useState(value) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = value;
      return [slots[index], (next) => { slots[index] = next; }];
    },
    useEffect(fn, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) {
        pending.push(() => {
          previous?.cleanup?.();
          slots[index] = { deps, cleanup: fn() };
        });
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const Map = load("components/GoogleMobilityMap.tsx", {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react-native": { View: "View", StyleSheet: { create: (value) => value } },
    "expo-constants": { default: {} },
    "../hooks/useMapSelection": { useMapSelection: () => ({ available: false, position: null, mode: "unset", revision: 0 }) },
    "./shared/MapLocationControl": { default: "MapLocationControl" },
    "../lib/vehicleBridge": load("lib/vehicleBridge.ts", {}),
    globals: { window },
  }).default;
  const ready = [];
  const render = (props = {}) => {
    cursor = 0;
    const tree = Map({ onReadyChange: (value) => ready.push(value), ...props });
    const iframe = tree.props.children.find(child => child.type === "iframe");
    iframe.props.ref.current = frame;
    while (pending.length) pending.shift()();
    return iframe;
  };
  const send = (type, overrides = {}) => {
    for (const fn of listeners) fn({ source: frame.contentWindow, origin: window.location.origin, data: { source: "perix-google-map", type, session: "session-1" }, ...overrides });
  };
  let iframe = render();
  assert.deepEqual(ready, [false]);
  send("ready", { origin: "https://attacker.invalid" });
  send("ready", { source: {} });
  assert.deepEqual(ready, [false]);
  send("ready");
  assert.deepEqual(ready, [false, true]);
  iframe = render({ showTrafficLayer: true, onMarkerPress: () => {} });
  assert.deepEqual(ready, [false, true]);
  assert.equal(messages.at(-1)[0].payload.showTrafficLayer, true);
  assert.equal(messages.at(-1)[1], window.location.origin);
  send("notReady");
  assert.equal(ready.at(-1), false);
  send("ready");
  iframe.props.onLoad();
  assert.equal(ready.at(-1), true);
  assert.equal(messages.at(-1)[0].type, "requestReady");
  send("ready");
  render({ showTrafficLayer: false });
  assert.equal(messages.at(-1)[0].payload.showTrafficLayer, false);
  for (const slot of slots) slot?.cleanup?.();
  assert.equal(ready.at(-1), false);
  assert.equal(listeners.size, 0);
});

test("map page attaches traffic only on opt-in and keeps secure bridge checks", () => {
  const html = read("public/google-mobility-map.html");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const listeners = {};
  const messages = [];
  const layers = [];
  const parent = { postMessage: (message, origin) => messages.push({ message, origin }) };
  const window = {
    parent,
    location: { origin: "https://test.invalid" },
    addEventListener: (type, fn) => { listeners[type] = fn; },
  };
  const context = vm.createContext({
    window,
    document: { getElementById: () => ({}) },
    google: { maps: {
      Map: function () { this.addListener = () => {}; },
      TrafficLayer: function () {
        this.map = null;
        this.setMap = (map) => { this.map = map; };
        this.getMap = () => this.map;
        layers.push(this);
      },
    } },
  });
  vm.runInContext(script, context);
  const send = (type, payload, overrides = {}) => listeners.message({
    origin: window.location.origin, source: parent,
    data: { source: "perix-google-map", type, payload }, ...overrides,
  });
  send("requestReady");
  assert.equal(messages.length, 0);
  context.initMap();
  assert.equal(messages.at(-1).message.type, "ready");
  assert.equal(messages.at(-1).origin, window.location.origin);
  for (const name of ["drawLines", "drawVehicles", "drawStops", "drawPlanLines", "drawUser", "drawPin"]) context[name] = () => {};
  send("update", {});
  assert.equal(layers.length, 0);
  send("update", { showTrafficLayer: true }, { source: {} });
  send("update", { showTrafficLayer: true }, { origin: "https://attacker.invalid" });
  assert.equal(layers.length, 0);
  send("update", { showTrafficLayer: true });
  assert.equal(layers.length, 1);
  assert.equal(layers[0].map, context.MAP);
  send("update", { showTrafficLayer: true });
  assert.equal(layers.length, 1);
  send("update", { vehicles: [] });
  assert.equal(layers[0].map, context.MAP, "vehicle-only updates retain the traffic layer");
  send("update", { showTrafficLayer: false });
  assert.equal(layers[0].map, null);
  send("update", { showTrafficLayer: true });
  listeners.pagehide();
  assert.equal(layers[0].map, null);
  assert.equal(messages.at(-1).message.type, "notReady");
});

test("Locator gates Google context and retains existing polling cancellation and cadence", () => {
  const source = read("app/(tabs)/locator.tsx");
  assert.match(source, /Platform\.OS === "web" && activeTab === "mobility" && googleMapReady &&\s*\(mobilityMode === "all" \|\| mobilityMode === "bus"\) &&\s*process\.env\.EXPO_PUBLIC_PERIX_GOOGLE_LOCATOR_TRAFFIC === "true"\s*\? "google_locator"\s*: "baseline"/);
  assert.match(source, /getLiveVehicles\(sessionToken, trafficContext\)/);
  assert.match(source, /getVehicleTrip\(sessionToken, selectedVehicle, trafficContext\)/);
  assert.match(source, /contextLocation\?\.longitude \?\? null,\s*trafficContext/);
  assert.match(source, /if \(cancelled \|\| request !== sequence\) return;\s*setTripProgress/);
  assert.match(source, /if \(cancelled \|\| request !== sequence\) return/);
  assert.match(source, /let delay = 4000/);
  assert.match(source, /delay = Math\.min\(delay \* 2, 30000\)/);
  assert.match(source, /setInterval\(load, 15000\)/);
  assert.match(source, /setInterval\(load, 5000\)/);
  assert.match(source, /\[activeTab, sessionToken, trafficContext, screenFocused, vehicleLink, foreground.visible, foreground.epoch\]/);
  assert.match(source, /\[activeTab, selectedVehicle, selectedJourneyKey, sessionToken, trafficContext, waitingForLinkedVehicle,\s*screenFocused, foreground.visible, foreground.epoch\]/);
  assert.match(source, /contextLocation\?\.longitude,\s*trafficContext, screenFocused, foreground.visible, foreground.epoch\]/);
});

test("Locator eligibility is baseline unless every web Mobility condition is met", () => {
  const source = read("app/(tabs)/locator.tsx");
  const expression = source.match(/const trafficContext: TrafficContext =([\s\S]*?);/)[1];
  for (const platform of ["web", "ios", "android"]) {
    for (const activeTab of ["mobility", "businesses"]) {
      for (const googleMapReady of [false, true]) {
        for (const mobilityMode of ["all", "bus", "tram", "taxi"]) {
          for (const flag of [undefined, "false", "true", "TRUE"]) {
            const actual = vm.runInNewContext(expression, {
              Platform: { OS: platform }, activeTab, googleMapReady, mobilityMode,
              process: { env: { EXPO_PUBLIC_PERIX_GOOGLE_LOCATOR_TRAFFIC: flag } },
            });
            const eligible = platform === "web" && activeTab === "mobility" && googleMapReady &&
              ["all", "bus"].includes(mobilityMode) && flag === "true";
            assert.equal(actual, eligible ? "google_locator" : "baseline");
          }
        }
      }
    }
  }
});

test("actual polling effects reject out-of-order and cancelled-context results", async () => {
  const source = read("app/(tabs)/locator.tsx");
  for (const config of [
    { start: "// Live mobility vehicles", end: "// Active transit network", api: "getLiveVehicles", setter: "setLiveVehicles", interval: 4000 },
    { start: "// Selected vehicle: upcoming", end: "// Bus destination search", api: "getVehicleTrip", setter: "setTripProgress", interval: 15000 },
    { start: "// Refresh the serving-bus list", end: "// Transit \"any area\"", api: "getBusesServing", setter: "setServingBuses", interval: 5000 },
  ]) {
    const code = source.slice(source.indexOf(config.start), source.indexOf(config.end));
    const requests = [];
    const results = [];
    let cleanup;
    let tick;
    let scheduledDelay;
    let cleared = false;
    const sandbox = {
      activeTab: "mobility", mobilityMode: "all", sessionToken: "token", trafficContext: "google_locator",
      selectedVehicle: "vehicle:/42", selectedStop: { stop_id: "stop:/1" }, contextLocation: null,
      waitingForLinkedVehicle: false, setFleetLoaded() {},
      screenFocused: true, vehicleLink: null, fleetRequestRef: { current: null },
      foreground: { visible: true, epoch: 0 }, setFleetLastSuccess() {}, setFleetRefreshFailed() {},
      selectedJourneyKey: "dated-current-trip",
      useEffect(fn, deps) {
        assert.ok(deps.includes("google_locator"));
        cleanup = fn();
      },
      [config.api]: (...args) => {
        assert.equal(config.api === "getBusesServing" ? args[4] : args.at(-1), "google_locator");
        return new Promise((resolve, reject) => requests.push({ resolve, reject }));
      },
      [config.setter]: (result) => results.push(result),
      setTripLoadFailed() {}, setTripLoading() {},
      setArrivalsLoadFailed() {}, setArrivalsLoading() {},
      setInterval(fn, delay) { tick = fn; scheduledDelay = delay; return 1; },
      setTimeout(fn, delay) { tick = fn; scheduledDelay = delay; return 1; },
      clearInterval() { cleared = true; },
      clearTimeout() { cleared = true; },
    };
    vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, sandbox);
    const flush = async () => { await new Promise((resolve) => setImmediate(resolve)); };
    if (config.api === "getLiveVehicles") {
      requests[0].resolve([{ vehicle_id: "first" }]);
      await flush();
      assert.equal(results.length, 1);
      assert.equal(scheduledDelay, config.interval);
      tick();
      cleanup();
      requests[1].resolve([{ vehicle_id: "old-context" }]);
      await flush();
      assert.equal(results.length, 1);
    } else {
      assert.equal(scheduledDelay, config.interval);
      tick();
      assert.equal(requests.length, 1);
      requests[0].resolve(config.api === "getBusesServing" ? [{ vehicle_id: "new", mode: "bus" }] : { vehicle_id: "new" });
      await flush();
      assert.equal(results.length, 1);
      tick();
      cleanup();
      requests[1].resolve(config.api === "getBusesServing" ? [{ vehicle_id: "old-context", mode: "bus" }] : { vehicle_id: "old-context" });
      await flush();
      assert.equal(results.length, 1);
    }
    assert.equal(cleared, true);
  }
});

test("slow stop polls do not starve, retry errors, and isolate stop/context changes", async () => {
  const source = read("app/(tabs)/locator.tsx");
  const code = ts.transpileModule(source.slice(source.indexOf("// Refresh the serving-bus list"), source.indexOf('// Transit "any area"')), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const requests = [], results = [];
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  function mount(stopId, context, mode = "all", platformId) {
    let tick, cleanup;
    const sandbox = {
      activeTab: "mobility", mobilityMode: mode, sessionToken: null,
      selectedStop: { stop_id: stopId, platform_id: platformId }, contextLocation: null, trafficContext: context,
      screenFocused: true, foreground: { visible: true, epoch: 0 },
      useEffect(fn) { cleanup = fn(); },
      getBusesServing(...args) {
        return new Promise((resolve, reject) => requests.push({ args, resolve, reject }));
      },
      setServingBuses(value) { results.push(Array.from(value)); },
      setArrivalsLoading() {}, setArrivalsLoadFailed() {},
      setInterval(fn, delay) { assert.equal(delay, 5000); tick = fn; return 1; },
      clearInterval() {},
    };
    vm.runInNewContext(code, sandbox);
    return { tick: () => tick(), cleanup: () => cleanup() };
  }
  const first = mount("physical:one", "baseline");
  // Two elapsed 5s ticks while the original request is still pending.
  first.tick(); first.tick();
  assert.equal(requests.length, 1);
  const bus = { vehicle_id: "bus", mode: "bus" }, tram = { vehicle_id: "tram", mode: "tram" };
  requests[0].resolve([bus, tram]);
  await flush();
  assert.deepEqual(results, [[bus, tram]]);
  first.tick();
  requests[1].reject(new Error("Temporary failure"));
  await flush();
  assert.deepEqual(results, [[bus, tram]], "errors retain the last successful list");
  first.tick();
  assert.equal(requests.length, 3, "error releases the single-flight guard");
  first.cleanup();
  const second = mount("physical:two", "baseline", "bus");
  requests[2].resolve([{ vehicle_id: "stale-stop", mode: "bus" }]);
  await flush();
  assert.equal(results.length, 1);
  requests[3].resolve([bus, tram]);
  await flush();
  assert.deepEqual(results.at(-1), [bus], "Bus mode still filters tram arrivals");
  second.tick();
  second.cleanup();
  const third = mount("physical:two", "google_locator", "tram", "east");
  requests[4].resolve([{ vehicle_id: "stale-context", mode: "bus" }]);
  await flush();
  assert.equal(results.length, 2);
  requests[5].resolve([bus, tram]);
  await flush();
  assert.deepEqual(results.at(-1), [tram]);
  assert.equal(requests[5].args[1], "physical:two");
  assert.equal(requests[5].args[4], "google_locator");
  assert.equal(requests[5].args[5], "east");
  third.tick();
  third.cleanup();
  third.tick();
  assert.equal(requests.length, 7, "cleanup prevents new requests");
  requests[6].resolve([bus]);
  await flush();
  assert.equal(results.length, 3, "unmounted result cannot update state");
});

test("foreground resume starts fresh fleet work immediately and ignores the older hidden request", async () => {
  const source=read('app/(tabs)/locator.tsx');
  const code=ts.transpileModule(source.slice(source.indexOf('// Live mobility vehicles'),source.indexOf('// Active transit network')),
    {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const requests=[],results=[];let cleanup;
  const globals={activeTab:'mobility',screenFocused:true,foreground:{visible:true,epoch:0},vehicleLink:null,
    sessionToken:null,trafficContext:'baseline',fleetRequestRef:{current:null},
    useEffect:fn=>{cleanup=fn();},getLiveVehicles:()=>new Promise(resolve=>requests.push(resolve)),
    setLiveVehicles:value=>results.push(value),setFleetLoaded(){},setFleetLastSuccess(){},setFleetRefreshFailed(){},
    setTimeout:()=>1,clearTimeout(){}};
  vm.runInNewContext(code,globals);assert.equal(requests.length,1);cleanup();
  globals.foreground={visible:false,epoch:0};vm.runInNewContext(code,globals);assert.equal(requests.length,1);
  globals.foreground={visible:true,epoch:1};vm.runInNewContext(code,globals);assert.equal(requests.length,2);
  requests[1]([{vehicle_id:'new-current'}]);await new Promise(resolve=>setImmediate(resolve));
  requests[0]([{vehicle_id:'old-hidden'}]);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(results.length,1);assert.equal(results[0][0].vehicle_id,'new-current');cleanup();
});
