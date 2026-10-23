const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function mapPage() {
  let now = 10000;
  function Marker(options) {
    Object.assign(this, options);
    this.setPosition = position => { this.position = position; };
    this.setMap = map => { this.map = map; };
    this.setIcon = this.setOpacity = this.addListener = () => {};
  }
  const page = vm.createContext({
    Date: { now: () => now },
    requestAnimationFrame: () => 1,
    window: { parent: { postMessage() {} }, location: { origin: 'https://test.invalid' }, addEventListener() {} },
    document: { getElementById: () => ({}) },
    google: { maps: {
      Marker, Size: function () {}, Point: function () {},
      Map: function () { this.addListener = () => {}; this.getZoom = () => 15; },
    } },
  });
  const html = fs.readFileSync(path.join(__dirname, '../public/google-mobility-map.html'), 'utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], page);
  page.initMap();
  return { page, advance(ms) { now += ms; page.loopTick(); } };
}
const route = [{ latitude: 52, longitude: 11 }, { latitude: 52.02, longitude: 11 }];
const sample = (progressM, extra = {}) => ({
  id: 'vehicle', journeyId: '2026-10-23:trip', type: 'bus',
  latitude: 52, longitude: 11, path: route, progressM,
  speed: 36, motionState: 'MOVING', positionState: 'ON_PATTERN', ...extra,
});

for (const type of ['bus', 'tram']) {
  test(`${type}: constant progress produces equal steps without extrapolation or backward poll resets`, () => {
    const { page, advance } = mapPage();
    page.drawVehicles([sample(0, { type })]);
    advance(6000);
    page.drawVehicles([sample(60, { type })]);
    const rec = page.VEHICLES.vehicle;
    for (let i = 1; i <= 6; i++) {
      advance(1000);
      assert.equal(rec.progNow, i * 10);
    }
    advance(6000);
    assert.equal(rec.progNow, 60, 'must not run up to 180m before the next poll');
    page.drawVehicles([sample(180, { type })]);
    assert.equal(rec.progFrom, 60);
    advance(1000);
    assert.equal(rec.progNow, 70);
    page.drawVehicles([sample(65, { type })]);
    advance(500);
    assert.equal(rec.progNow, 70, 'small same-journey corrections hold rather than reversing');
  });
}

test('dwell, signal holds and zero speed stop animation and reset the departure anchor', () => {
  for (const state of ['DWELL', 'SIGNAL_HOLD', 'AT_STOP']) {
    const { page, advance } = mapPage();
    page.drawVehicles([sample(0)]);
    advance(4000);
    page.drawVehicles([sample(40)]);
    advance(2000);
    page.drawVehicles([sample(40, { motionState: state, speed: 0 })]);
    const rec = page.VEHICLES.vehicle;
    assert.equal(rec.animStart, null);
    advance(10000);
    assert.equal(rec.progNow, 40);
    page.drawVehicles([sample(40)]);
    advance(4000);
    page.drawVehicles([sample(80)]);
    advance(2000);
    assert.equal(rec.progNow, 60, 'departure starts at the held stop, not stale pre-dwell progress');
  }
});

test('a new dated trip resets progress even when it reuses the same vehicle and path', () => {
  const { page, advance } = mapPage();
  page.drawVehicles([sample(300)]);
  advance(4000);
  page.drawVehicles([sample(340)]);
  advance(2000);
  assert.equal(page.VEHICLES.vehicle.progNow, 320);
  page.drawVehicles([sample(0, { journeyId: '2026-10-24:different-trip' })]);
  assert.equal(page.VEHICLES.vehicle.progNow, 0);
  advance(4000);
  page.drawVehicles([sample(40, { journeyId: '2026-10-24:different-trip' })]);
  advance(2000);
  assert.equal(page.VEHICLES.vehicle.progNow, 20);
});

test('raw GPS without canonical progress is not extrapolated through buildings', () => {
  const { page, advance } = mapPage();
  page.drawVehicles([sample(null, { path: null, positionState: 'LIVE_RAW', latitude: 52.5, longitude: 11.8 })]);
  const rec = page.VEHICLES.vehicle;
  advance(20000);
  assert.equal(rec.marker.position.lat, 52.5);
  assert.equal(rec.marker.position.lng, 11.8);
  assert.equal(rec.animStart, null);
});
