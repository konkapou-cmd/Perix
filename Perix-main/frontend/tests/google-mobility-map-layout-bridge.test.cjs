const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const clone = (value) => JSON.parse(JSON.stringify(value));

function mount() {
  const slots = [], pending = [], messages = [], ready = [];
  const listeners = new Set();
  let cursor = 0;
  const frame = { contentWindow: { postMessage: (message, origin) => messages.push({ message: clone(message), origin }) } };
  const window = {
    location: { origin: "https://test.invalid" },
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  };
  const react = {
    useRef(value) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: value };
      return slots[i];
    },
    useState(value) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = value;
      return [slots[i], (next) => { slots[i] = next; }];
    },
    useEffect(fn, deps) {
      const i = cursor++, previous = slots[i];
      if (!previous || deps.some((dep, j) => !Object.is(dep, previous.deps[j]))) {
        pending.push(() => {
          previous?.cleanup?.();
          slots[i] = { deps, cleanup: fn() };
        });
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const mocks = {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react-native": { View: "View", StyleSheet: { create: (styles) => styles } },
    "expo-constants": { default: {} },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read("components/GoogleMobilityMap.tsx"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: (name) => mocks[name], window, process: { env: {} } });
  return {
    messages, ready, frame,
    render(props = {}) {
      cursor = 0;
      const tree = exports.default({ onReadyChange: (value) => ready.push(value), ...props });
      tree.props.children.props.ref.current = frame;
      while (pending.length) pending.shift()();
      return tree;
    },
    send(type, session = "one", overrides = {}) {
      for (const fn of listeners) fn({ source: frame.contentWindow, origin: window.location.origin,
        data: { source: "perix-google-map", type, session }, ...overrides });
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

function page() {
  let now = 10000;
  const listeners = {};
  const parent = { postMessage() {} };
  function Marker(options) {
    Object.assign(this, options);
    this.setPosition = (pos) => { this.position = pos; };
    this.setMap = (map) => { this.map = map; };
    this.setIcon = () => {};
    this.setOpacity = () => {};
    this.addListener = () => {};
  }
  const context = vm.createContext({
    window: { parent, location: { origin: "https://test.invalid" }, addEventListener: (type, fn) => { listeners[type] = fn; } },
    document: { getElementById: () => ({}) },
    Date: { now: () => now },
    requestAnimationFrame: () => 1,
    google: { maps: {
      Marker, Size: function () {}, Point: function () {},
      Map: function () { this.addListener = () => {}; this.getZoom = () => 15; },
    } },
  });
  vm.runInContext(read("public/google-mobility-map.html").match(/<script>([\s\S]*?)<\/script>/)[1], context);
  return { context, advance: (ms) => { now += ms; } };
}

const points = [{ latitude: 52, longitude: 11 }, { latitude: 52.001, longitude: 11.001 }, { latitude: 52.002, longitude: 11.002 }];
const vehicle = { id: "bus:1", latitude: 52, longitude: 11, path: points, progressM: 10 };

test("web map keeps explicit height without flex collapse and matches BusinessMap margins", () => {
  const map = mount();
  const tree = map.render();
  const style = Object.assign({}, ...tree.props.style);
  assert.equal(style.height, 300);
  assert.equal(style.flex, undefined);
  assert.equal(style.flexShrink, 0);
  assert.equal(style.marginHorizontal, 16);
  assert.match(read("components/BusinessMap.web.tsx"), /wrap: \{ marginHorizontal: 16,/);
  assert.equal(Object.assign({}, ...map.render({ height: 420 }).props.style).height, 420);
  assert.equal(tree.props.children.props.style.height, "100%");
});

test("vehicle polls send neither static geometry nor unchanged paths; controls are independent", () => {
  const map = mount();
  const props = {
    transitLines: Array.from({ length: 157 }, (_, i) => ({ patternId: String(i), points: Array.from({ length: 510 }, (_, j) => ({ latitude: 52 + j / 100000, longitude: 11 })) })),
    transitStops: [{ stop_id: "one", name: "One", latitude: 52, longitude: 11 }],
    vehicles: [vehicle],
  };
  map.render(props);
  assert.equal(map.messages.length, 0);
  map.send("ready");
  map.render(props);
  assert.equal(map.messages.length, 3);
  assert.equal(map.messages[0].message.payload.lines.length, 157);
  assert.equal(map.messages[1].message.payload.vehicles[0].path.length, 3);
  map.messages.length = 0;
  const next = { ...props, vehicles: [{ ...clone(vehicle), progressM: 30 }] };
  map.render(next);
  assert.equal(map.messages.length, 1);
  assert.deepEqual(Object.keys(map.messages[0].message.payload), ["vehicles"]);
  assert.equal("path" in map.messages[0].message.payload.vehicles[0], false);
  map.messages.length = 0;
  map.render({ ...next, showTrafficLayer: true });
  assert.equal(map.messages.length, 1);
  assert.equal(map.messages[0].message.payload.showTrafficLayer, true);
  assert.equal("lines" in map.messages[0].message.payload, false);
  assert.equal("vehicles" in map.messages[0].message.payload, false);
  const changed = clone(vehicle);
  changed.path[1].latitude += 1e-10;
  map.render({ ...props, vehicles: [changed] });
  assert.ok(map.messages.at(-2).message.payload.vehicles[0].path, "interior coordinate changes must send geometry");
  map.render({ ...props, vehicles: [{ ...vehicle, path: undefined }] });
  assert.equal(map.messages.at(-1).message.payload.vehicles[0].path, null);
  map.render({ ...props, vehicles: [] });
  assert.deepEqual(map.messages.at(-1).message.payload.vehicles, []);
  map.render(props);
  assert.ok(map.messages.at(-1).message.payload.vehicles[0].path, "reappearing vehicles need their path again");
});

test("same-document load does not reset readiness or resend data, new sessions do", () => {
  const map = mount(), props = { vehicles: [vehicle] };
  let tree = map.render(props);
  map.send("ready", "one", { source: {} });
  map.send("ready", "one", { origin: "https://attacker.invalid" });
  map.render(props);
  assert.equal(map.messages.length, 0);
  tree.props.children.props.onLoad();
  assert.equal(map.messages.at(-1).message.type, "requestReady");
  map.send("ready");
  tree = map.render(props);
  map.messages.length = 0;
  tree.props.children.props.onLoad();
  assert.equal(map.ready.at(-1), true);
  map.send("ready");
  map.render(props);
  assert.equal(map.messages.length, 1);
  map.send("notReady");
  map.render(props);
  assert.equal(map.ready.at(-1), false);
  map.send("ready", "two");
  map.render(props);
  assert.equal(map.messages.length, 4);
  assert.ok(map.messages.at(-2).message.payload.vehicles[0].path);
  // A changed document session also resends without an intervening notReady render.
  map.send("ready", "three");
  map.render(props);
  assert.ok(map.messages.at(-2).message.payload.vehicles[0].path);
  map.unmount();
  assert.equal(map.ready.at(-1), false);
});

test("partial updates preserve omitted layers, clear explicit arrays, and merge before init", () => {
  const { context } = page();
  const calls = {};
  for (const [field, draw] of Object.entries({ lines: "drawLines", vehicles: "drawVehicles", stops: "drawStops", planLines: "drawPlanLines", userLocation: "drawUser", pin: "drawPin" })) {
    calls[field] = [];
    context[draw] = (value) => calls[field].push(clone(value));
  }
  context.applyUpdate({ lines: ["line"], stops: ["stop"], vehicles: ["old"] });
  context.applyUpdate({ vehicles: ["latest"], pin: { latitude: 52, longitude: 11 } });
  context.applyUpdate({ stops: [] });
  context.initMap();
  assert.equal(context.PENDING, null);
  assert.deepEqual(calls.lines, [["line"]]);
  assert.deepEqual(calls.vehicles, [["latest"]]);
  assert.deepEqual(calls.stops, [[]]);
  assert.equal(calls.pin.length, 1);
  context.applyUpdate({ vehicles: [] });
  assert.deepEqual(calls.vehicles.at(-1), []);
  assert.equal(calls.lines.length, 1);
  assert.equal(calls.pin.length, 1);
  assert.equal(calls.planLines.length, 0);
  context.applyUpdate({ lines: [], stops: [], planLines: [], userLocation: null, pin: null });
  assert.deepEqual(calls.lines.at(-1), []);
  assert.deepEqual(calls.planLines, [[]]);
  assert.deepEqual(calls.userLocation, [null]);
  assert.equal(calls.pin.at(-1), null);
});

test("cloned vehicle paths reuse cumulative geometry and preserve progress continuity", () => {
  const { context, advance } = page();
  context.initMap();
  context.drawVehicles([clone(vehicle)]);
  const rec = context.VEHICLES[vehicle.id], originalPath = rec.path, cum = rec.cum;
  advance(4000);
  context.drawVehicles([{ ...clone(vehicle), progressM: 30 }]);
  assert.equal(rec.path, originalPath);
  assert.equal(rec.cum, cum);
  assert.equal(rec.progFrom, 10);
  assert.equal(rec.progTo, 30);
  advance(2000);
  context.loopTick();
  assert.equal(rec.progNow, 20);
  const { path: _path, ...withoutPath } = vehicle;
  context.drawVehicles([{ ...withoutPath, progressM: 40 }]);
  assert.equal(rec.path, originalPath);
  assert.equal(rec.cum, cum);
  assert.equal(rec.progFrom, 20);
  assert.equal(rec.progTo, 40);
  const changed = clone(vehicle);
  changed.path[1].longitude += 1e-10;
  advance(4000);
  context.drawVehicles([{ ...changed, progressM: 50 }]);
  assert.notEqual(rec.path, originalPath);
  assert.notEqual(rec.cum, cum);
  assert.equal(rec.progFrom, 50);
  context.drawVehicles([{ ...withoutPath, path: [] }]);
  assert.equal(rec.path, null);
  assert.equal(rec.cum, null);
  context.drawVehicles([]);
  assert.equal(context.VEHICLES[vehicle.id], undefined);
  assert.equal(rec.marker.map, null);
});
