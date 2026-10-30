/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function pageAt(initialZoom = 11) {
  let zoom = initialZoom, now = 10000;
  const messages = [], mapListeners = {};
  function LatLng(lat, lng) { this.lat = () => lat; this.lng = () => lng; }
  function Marker(options) {
    Object.assign(this, options); this.listeners = {}; this.bindings = {};
    this.setPosition = p => { this.position = p; };
    this.getPosition = () => this.bindings.position?.getPosition() || this.position;
    this.setIcon = icon => { this.icon = icon; };
    this.setMap = map => { this.map = map; };
    this.setTitle = title => { this.title = title; };
    this.setOpacity = () => {};
    this.bindTo = (key, marker) => { this.bindings[key] = marker; };
    this.unbindAll = () => { this.bindings = {}; };
    this.addListener = (name, fn) => { this.listeners[name] = fn; };
  }
  const element = () => ({ style: {}, children: [], listeners: {},
    appendChild(e) { this.children.push(e); }, setAttribute(k, v) { this[k] = v; },
    addEventListener(k, fn) { this.listeners[k] = fn; },
  });
  const context = vm.createContext({
    window: { parent: { postMessage: d => messages.push(d) }, location: { origin: 'https://test.invalid' }, addEventListener() {} },
    document: { getElementById: element, createElement: element }, requestAnimationFrame: () => 1,
    Date: class extends Date { static now() { return now; } },
    google: { maps: { Marker, LatLng, Size: function (w, h) { this.width = w; this.height = h; },
      Point: function (x, y) { this.x = x; this.y = y; },
      Map: function () { this.addListener = (n, fn) => { mapListeners[n] = fn; }; this.getZoom = () => zoom;
        this.getProjection = () => ({ fromLatLngToPoint: p => ({ x: p.lng(), y: p.lat() }) }); },
      InfoWindow: function () { this.setContent = c => { this.content = c; }; this.open = () => { this.closed = false; };
        this.close = () => { this.closed = true; }; },
    } },
  });
  const html = fs.readFileSync(path.join(__dirname, '../public/google-mobility-map.html'), 'utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  context.initMap(); messages.length = 0;
  return { page: context, messages, zoom(value) { zoom = value; mapListeners.zoom_changed(); },
    advance(ms) { now += ms; context.loopTick(); } };
}

const sample = (id, x, overrides = {}) => ({ id, journeyId: 'dated:' + id, type: 'bus', label: id,
  latitude: 52, longitude: x, heading: 90, motionState: 'MOVING', speed: 20, estimated: true, ...overrides });

test('overview groups moving screen-overlap without changing source coordinates, marker instances or IDs', () => {
  const h = pageAt();
  const fleet = [sample('a', 11), sample('b', 11.01, { type: 'tram' }), sample('far', 12)];
  h.page.drawVehicles(fleet);
  const markers = Object.fromEntries(Object.entries(h.page.VEHICLES).map(([id, r]) => [id, r.marker]));
  const stacks = Object.values(h.page.VEHICLE_STACKS);
  assert.equal(stacks.length, 1); assert.deepEqual(Array.from(stacks[0].members), ['a', 'b']);
  assert.equal(stacks[0].kind, 'overview');
  for (const v of fleet) assert.deepEqual(JSON.parse(JSON.stringify(markers[v.id].position)), { lat: v.latitude, lng: v.longitude });
  h.page.VEHICLES.b.marker.listeners.click();
  assert.match(h.page.STACK_INFO.content.children[0].textContent, /overlapping vehicles at this zoom/);
  const buttons = h.page.STACK_INFO.content.children.slice(1);
  assert.deepEqual(buttons.map(b => b['data-perix-vehicle-id']), ['a', 'b']);
  buttons.forEach(b => b.listeners.click({ stopPropagation() {} }));
  assert.deepEqual(h.messages.map(m => m.id), ['a', 'b']);
  h.zoom(14);
  assert.equal(Object.keys(h.page.VEHICLE_STACKS).length, 0);
  for (const [id, marker] of Object.entries(markers)) assert.equal(h.page.VEHICLES[id].marker, marker);
  h.page.VEHICLES.b.marker.listeners.click(); assert.equal(h.messages.at(-1).id, 'b');
});

test('group counts are exact and transitive; taxis never enter transit selection groups', () => {
  const h = pageAt();
  h.page.drawVehicles([sample('a', 11), sample('b', 11.015), sample('c', 11.03), sample('taxi', 11, { type: 'taxi' })]);
  const stack = Object.values(h.page.VEHICLE_STACKS)[0];
  assert.deepEqual(Array.from(stack.members), ['a', 'b', 'c']);
  assert.equal(h.page.VEHICLE_STACK_KEYS.taxi, undefined);
  assert.ok(decodeURIComponent(stack.marker.icon.url).includes('>3</text>'));
});

test('overview count hit boxes stay centered on a member and participate in collision grouping', () => {
  const h = pageAt();
  // 40px between pairs: body-only bus hit boxes (38px) would miss the
  // 42px count target and allow another group's badge to steal taps.
  h.page.drawVehicles([sample('a', 11), sample('b', 11.001), sample('c', 11 + 40 / 2048), sample('d', 11 + 41 / 2048)]);
  const groups = Object.values(h.page.VEHICLE_STACKS);
  assert.equal(groups.length, 1); assert.equal(groups[0].members.length, 4);
  assert.equal(groups[0].marker.icon.anchor.x, 13);
  assert.equal(groups[0].marker.icon.anchor.y, 12);
});

test('count badges follow an actual member, never an average/fake position; expired members remove stale choices', () => {
  const h = pageAt(); const first = sample('a', 11), second = sample('b', 11.01);
  h.page.drawVehicles([first, second]); const stack = Object.values(h.page.VEHICLE_STACKS)[0];
  stack.marker.listeners.click();
  h.page.VEHICLES.a.marker.setPosition({ lat: 52, lng: 11.005 });
  assert.deepEqual(JSON.parse(JSON.stringify(stack.marker.getPosition())), { lat: 52, lng: 11.005 });
  h.page.drawVehicles([first]);
  assert.equal(Object.keys(h.page.VEHICLE_STACKS).length, 0);
  assert.equal(stack.marker.map, null); assert.deepEqual(stack.marker.bindings, {});
  assert.equal(h.page.STACK_INFO.closed, true); assert.equal(h.page.VEHICLE_STACK_KEYS.b, undefined);
});

test('a dated journey change closes the old popup even when source ID and group members stay the same', () => {
  const h = pageAt(); const fleet = [sample('a', 11), sample('b', 11.01)];
  h.page.drawVehicles(fleet); Object.values(h.page.VEHICLE_STACKS)[0].marker.listeners.click();
  h.page.drawVehicles([{ ...fleet[0], journeyId: 'tomorrow:a' }, fleet[1]]);
  assert.equal(h.page.STACK_INFO.closed, true);
});

test('scrolling choices survive a moving overview group split, but stale dated buttons cannot select a replacement trip', () => {
  const h = pageAt(); const fleet = [sample('a', 11), sample('b', 11.01)];
  h.page.drawVehicles(fleet); h.page.VEHICLES.b.marker.listeners.click();
  const oldButton = h.page.STACK_INFO.content.children[1];
  h.page.drawVehicles([fleet[0], { ...fleet[1], longitude: 12 }]);
  assert.equal(Object.keys(h.page.VEHICLE_STACKS).length, 0);
  assert.equal(h.page.STACK_INFO.closed, false, 'valid choices must not disappear while scrolling');
  assert.deepEqual(Array.from(h.page.STACK_OPEN_MEMBERS, x => x.id), ['a', 'b']);
  h.page.drawVehicles([{ ...fleet[0], journeyId: 'tomorrow:a' }, { ...fleet[1], longitude: 12 }]);
  assert.equal(h.page.STACK_INFO.closed, true);
  oldButton.listeners.click({ stopPropagation() {} });
  assert.equal(h.messages.length, 0, 'an old dated selection cannot silently target a replacement journey');
});

test('normal/close zooms retain exact stationary coincidence selection but never group nearby moving vehicles', () => {
  const h = pageAt(19);
  h.page.drawVehicles([sample('a', 11), sample('b', 11.000001)]);
  assert.equal(Object.keys(h.page.VEHICLE_STACKS).length, 0);
  h.page.drawVehicles([sample('a', 11, { speed: 0 }), sample('b', 11, { speed: 0 })]);
  assert.equal(Object.values(h.page.VEHICLE_STACKS)[0].kind, 'coincident');
});

test('overview choices use a bounded dismissible sheet instead of an InfoWindow under area controls', () => {
  const h = pageAt();
  const body = { children: [], appendChild(node) { this.children.push(node); node.parentNode = this; },
    removeChild(node) { this.children = this.children.filter(n => n !== node); node.parentNode = null; } };
  h.page.document.body = body;
  h.page.MAP.getDiv = () => ({ clientHeight: 300 });
  h.page.drawVehicles([sample('a', 11), sample('b', 11.01)]);
  h.page.VEHICLES.a.marker.listeners.click();
  const panel = h.page.STACK_PANEL;
  assert.ok(panel); assert.equal(panel.role, 'dialog');
  assert.equal(panel.style.maxHeight, '204px');
  assert.equal(h.page.STACK_CONTENT.style.maxHeight, '184px');
  assert.equal(h.page.STACK_INFO, null);
  assert.ok(panel.style.cssText.includes('bottom:26px'));
  assert.ok(panel.style.cssText.includes('right:64px'));
  panel.children[1].listeners.click();
  assert.equal(h.page.STACK_PANEL, null); assert.equal(body.children.length, 0);
  assert.equal(h.page.STACK_OPEN_MEMBERS.length, 0);
});

test('new vehicles retain the smaller scale through heading-only polls at an unchanged zoom', () => {
  for (const [zoom, bus, tram] of [[11, 22, 28], [14, 28, 36], [17, 33, 43], [19, 39, 50]]) {
    const h = pageAt(zoom);
    for (const [type, width] of [['bus', bus], ['tram', tram]]) {
      const v = sample(type, 11, { type }); h.page.drawVehicles([v]);
      const marker = h.page.VEHICLES[type].marker; assert.equal(marker.icon.scaledSize.width, width);
      h.page.drawVehicles([{ ...v, heading: 180 }]);
      assert.equal(h.page.VEHICLES[type].marker, marker);
      assert.equal(marker.icon.scaledSize.width, width);
    }
  }
});
