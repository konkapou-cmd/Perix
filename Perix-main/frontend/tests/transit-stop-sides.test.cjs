const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../lib/city/visualGeometry.ts'), 'utf8');
const geometry = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
} }).outputText, { exports: geometry, require: () => ({}) });

// One side of a same-name station: bus + tram platforms ~5 m apart.
function sideStop(side, dLng, tag) {
  const lng = 11.6276 + dLng;
  const id = (mode) => `${side || 'unknown'}-${mode}-${tag}`;
  return {
    stop_id: 'hasselbach', physical_stop_id: `physical:hasselbach-${tag}`, name: 'Hasselbachplatz',
    latitude: 52.1205, longitude: lng, modes: ['bus', 'tram'], side,
    routes: [{ route_number: '1', mode: 'tram' }, { route_number: '2', mode: 'bus' }],
    platforms: [
      { platform_id: id('tram'), latitude: 52.1205, longitude: lng,
        modes: ['tram'], routes: ['1'], platform_code: 'A', side },
      { platform_id: id('bus'), latitude: 52.12053, longitude: lng + 0.00002,
        modes: ['bus'], routes: ['2'], platform_code: 'B', side },
    ],
  };
}

test('opposite known sides stay two separate pins, each combining bus+tram', () => {
  const groups = geometry.groupTransitStopIcons(
    geometry.transitStopPins([sideStop('left', 0, 'L'), sideStop('right', 0.0006, 'R')]));
  assert.equal(groups.length, 2);
  const left = groups.find(g => g.side === 'left'), right = groups.find(g => g.side === 'right');
  assert.ok(left && right);
  for (const group of [left, right]) {
    assert.equal(group.platform_ids.length, 2);
    assert.ok(group.modes.includes('bus') && group.modes.includes('tram'));
  }
  // Pins sit on their own platforms, not averaged into the middle of the street.
  assert.ok(Math.abs(left.latitude - 52.1205) < 0.0002);
  assert.ok(Math.abs(right.longitude - (11.6276 + 0.0006)) < 0.0002);
});

test('opposite sides stay separate even when they share one physical stop id', () => {
  const a = sideStop('left', 0, 'L'), b = sideStop('right', 0.0006, 'R');
  b.physical_stop_id = a.physical_stop_id;
  const groups = geometry.groupTransitStopIcons(geometry.transitStopPins([a, b]));
  assert.equal(groups.length, 2);
});

test('same side still merges bus+tram into one pin', () => {
  const groups = geometry.groupTransitStopIcons(
    geometry.transitStopPins([sideStop('left', 0, 'L'), sideStop('left', 0.0001, 'L2')]));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].platform_ids.length, 4);
  assert.equal(groups[0].side, 'left');
});

test('unknown opposite locations stay separate rather than merging into the road', () => {
  const groups = geometry.groupTransitStopIcons(
    geometry.transitStopPins([sideStop(null, 0, 'L'), sideStop(null, 0.0006, 'R')]));
  assert.equal(groups.length, 2);
  assert.ok(groups.every(group=>group.platform_ids.length===2));
});

test('an unknown remote side cannot attach to a known side', () => {
  const groups = geometry.groupTransitStopIcons(
    geometry.transitStopPins([sideStop('left', 0, 'L'), sideStop(undefined, 0.0006, 'R')]));
  assert.equal(groups.length, 2);
});

test('same name far apart stays two pins regardless of side', () => {
  const far = sideStop('left', 0.005, 'far');
  const groups = geometry.groupTransitStopIcons(
    geometry.transitStopPins([sideStop('left', 0, 'L'), far]));
  assert.equal(groups.length, 2);
});

test('input enumeration does not move boarding anchors or change group identities',()=>{
  const pins=geometry.transitStopPins([sideStop('left',0,'L'),sideStop('right',0.0006,'R')]);
  const normalize=items=>Array.from(geometry.groupTransitStopIcons(items),g=>({
    ids:Array.from(g.platform_ids).sort(),latitude:g.latitude,longitude:g.longitude,
  }));
  assert.deepEqual(normalize(pins),normalize([...pins].reverse()));
});

test('stop icon orientation comes from served geometry and is stable for reversed line copies',()=>{
  const stop={latitude:52.12,longitude:11.63,routes:[{route_number:'9',mode:'tram'}]};
  const line={routeNumber:'9',points:[{latitude:52.12,longitude:11.629},{latitude:52.12,longitude:11.631}]};
  assert.equal(geometry.stopGeometryBearing(stop,[line]),90);
  assert.equal(geometry.stopGeometryBearing(stop,[{...line,points:[...line.points].reverse()}]),90);
  assert.equal(geometry.stopGeometryBearing(stop,[{...line,routeNumber:'other'}]),0);
});
