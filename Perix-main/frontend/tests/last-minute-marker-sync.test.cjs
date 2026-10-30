const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(process.env.PERIX_SYNC_MAP_HTML || path.join(root, 'public/google-mobility-map.html'), 'utf8');
const replay = JSON.parse(fs.readFileSync(process.env.PERIX_SYNC_REPLAY || path.join(root,
  '../backend/releases/last-minute-marker-sync-20261027/backend-replay.json'), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));

// Execute the actual map script. SDK/DOM boundaries are stubs: no Google load.
function page() {
  const clock = { now: 0 };
  function Marker(options) {
    Object.assign(this, options);
    this.setPosition = p => { this.position = p; };
    this.getPosition = () => this.position;
    this.setMap = m => { this.map = m; };
    this.setIcon = () => {};
    this.setOpacity = () => {};
    this.addListener = () => {};
    this.setOptions = options => Object.assign(this, options);
  }
  const element = () => ({ style: {}, children: [], appendChild(c) { this.children.push(c); },
    addEventListener() {}, setAttribute() {} });
  const context = vm.createContext({
    window: { parent: { postMessage() {} }, location: { origin: 'https://offline.invalid' }, addEventListener() {} },
    document: { getElementById: element, createElement: element },
    Date: class extends Date { static now() { return clock.now; } },
    requestAnimationFrame: () => 1,
    google: { maps: { Marker, Polyline: Marker, Size: function () {}, Point: function () {},
      SymbolPath: { CIRCLE: 0 }, Map: function () { this.addListener = () => {}; this.getZoom = () => 18; },
      InfoWindow: function () { this.setContent = () => {}; this.open = () => {}; this.close = () => {}; } } },
  });
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  context.initMap();
  return { context, clock, draw(packets, mutate = v => v) {
    clock.now = packets[0].server_epoch_ms;
    context.drawVehicles(packets.map(p => mutate(clone(p.marker))));
  } };
}

function assertAtBackend(p, frame) {
  for (const packet of frame) {
    const rec = p.context.VEHICLES[packet.marker.id];
    const actual = p.context.progressOfPoint(rec.path, rec.cum, rec.marker.position.lat, rec.marker.position.lng);
    assert.ok(Math.abs(actual - packet.marker.progressM) < 1e-5,
      `render lag: ${packet.marker.progressM - actual}m for ${packet.trip_instance_id} / ${packet.motion_plan_revision}`);
  }
}

test('45 seconds legitimately rounds to one minute through the existing ETA adapter', async () => {
  const packet = replay.scenarios.eta45[0][0];
  assert.equal(packet.effective_eta_seconds, 45);
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'lib/api/mobility.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: () => ({ apiRequest: async () => [{ eta_seconds: 45, source: 'PERIX_ESTIMATE' }] }) });
  assert.equal((await exports.getBusesServing(null, 'Museum'))[0].eta_minutes, 1);
  assert.ok(packet.remaining_distance_m > 0);
  assert.equal(packet.observed_gps_arrival, false);
});

for (const type of ['bus', 'tram']) test(`${type}: same trip, same plan revision and server timestamp has no extra poll of render delay`, () => {
  const p = page(), frames = replay.scenarios.eta45;
  assert.equal(frames[0][0].motion_plan_revision, frames[1][0].motion_plan_revision);
  p.draw(frames[0], v => ({ ...v, type }));p.draw(frames[1], v => ({ ...v, type }));
  assertAtBackend(p, frames[1]);
});

test('30-second earlier source revision uses the newest backend position, not a delayed tween', () => {
  const p = page(), frames = replay.scenarios.earlier30;
  assert.equal(frames[0][0].raw_gtfs_rt_arrival_s - frames[1][0].raw_gtfs_rt_arrival_s, 30);
  assert.equal(frames[0][0].trip_instance_id, frames[1][0].trip_instance_id);
  assert.notEqual(frames[0][0].motion_plan_revision, frames[1][0].motion_plan_revision);
  p.draw(frames[0]);p.draw(frames[1]);
  assertAtBackend(p, frames[1]);
});

test('a short stop between polls does not leave a departing virtual bus rendered before the stop', () => {
  const p = page(), frames = replay.scenarios.rapid_stop;
  assert.ok(frames[0][0].marker.progressM < 400);
  assert.ok(frames[1][0].marker.progressM > 400);
  p.draw(frames[0]);p.draw(frames[1]);
  assertAtBackend(p, frames[1]);
});

test('stop anchor and required two-second source dwell are preserved without extrapolation', () => {
  const p = page(), frames = replay.scenarios.anchor;
  p.draw(frames[0]);
  const rec = p.context.VEHICLES[frames[0][0].marker.id];
  assert.ok(rec.progNow < 400);
  p.clock.now += 999;p.context.loopTick();
  assert.ok(rec.progNow < 400, 'cannot invent an arrival between authoritative packets');
  p.draw(frames[1]);assertAtBackend(p, frames[1]);
  assert.equal(rec.progNow, 400);
  assert.equal(frames[1][0].effective_eta_seconds, 0);
  p.draw(frames[2]);assert.equal(rec.progNow, 400);
  assert.equal(frames[2][0].marker.motionState, 'DWELL');
  p.draw(frames[3]);assert.equal(rec.progNow, 400);
  p.draw(frames[4]);assertAtBackend(p, frames[4]);
  assert.ok(rec.progNow > 400);
});

test('two N5 and one N4 keep exact journey identities and independent rendered positions', () => {
  const p = page(), frames = replay.scenarios.identities;
  assert.deepEqual(frames[1].map(x => x.marker.label), ['N5', 'N5', 'N4']);
  assert.equal(new Set(frames[1].map(x => x.trip_instance_id)).size, 3);
  p.draw(frames[0]);p.draw(frames[1]);
  assert.equal(Object.keys(p.context.VEHICLES).length, 3);
  assertAtBackend(p, frames[1]);
});

for (const variant of [{ name: 'real GPS', estimated: false, type: 'bus' },
  { name: 'estimated taxi', estimated: true, type: 'taxi' }]) test(`${variant.name} interpolation remains unchanged`, () => {
  const p = page(), frames = replay.scenarios.eta45;
  const gps = v => ({ ...v, estimated: variant.estimated, type: variant.type });
  p.draw(frames[0], gps);p.draw(frames[1], gps);
  const rec = p.context.VEHICLES[frames[1][0].marker.id];
  assert.equal(rec.animDuration, 4000);
  assert.equal(rec.progFrom, frames[0][0].marker.progressM);
  assert.equal(rec.progTo, frames[1][0].marker.progressM);
  p.clock.now += 2000;p.context.loopTick();
  assert.ok(Math.abs(rec.progNow - (rec.progFrom + rec.progTo) / 2) < 1e-5);
});

test('unmarked backward jitter still uses the existing no-backtracking guard', () => {
  const p = page(), frames = replay.scenarios.eta45;
  p.draw(frames[0]);
  const rec = p.context.VEHICLES[frames[0][0].marker.id], start = rec.progNow;
  p.clock.now += 4000;
  const v = clone(frames[0][0].marker), point = p.context.pointAtProgress(rec.path, rec.cum, start - 1);
  p.context.drawVehicles([{ ...v, progressM: start - 1, latitude: point.lat, longitude: point.lng }]);
  p.clock.now += 4000;p.context.loopTick();
  assert.ok(rec.progNow >= start);
});

test('missing canonical progress does not activate the new estimated-sample branch', () => {
  const p = page(), frames = replay.scenarios.eta45;
  p.draw(frames[0], v => ({ ...v, progressM: null }));
  p.draw(frames[1], v => ({ ...v, progressM: null }));
  const rec = p.context.VEHICLES[frames[0][0].marker.id];
  assert.notEqual(rec.animStart, null);
});

test('model-only source timestamps never become observed GPS/boarding evidence', () => {
  for (const frames of Object.values(replay.scenarios)) for (const frame of frames) for (const p of frame) {
    assert.equal(p.position_assurance, 'MODEL_ESTIMATE');
    assert.equal(p.observed_gps_arrival, false);
    assert.equal(p.marker.estimated, true);
    if (p.marker.motionState === 'DWELL') assert.equal(p.remaining_distance_m, 0);
  }
});
