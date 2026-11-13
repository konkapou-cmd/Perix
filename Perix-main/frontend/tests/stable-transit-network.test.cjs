const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/city/visualGeometry.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsObject });
const { transitStopPins, groupTransitStopIcons, distinctGeometryLines } = exportsObject;

function station() {
  return { stop_id: 'physical:hasselbach', name: 'Hasselbachplatz', latitude: 52.120407, longitude: 11.627903,
    modes: ['bus', 'tram'], routes: [{ route_number: '59', mode: 'bus' }, { route_number: '9', mode: 'tram' }],
    platforms: [
      { platform_id: 'bus', latitude: 52.120407, longitude: 11.627903, routes: ['59'], modes: ['bus'] },
      { platform_id: 'left', latitude: 52.120968, longitude: 11.627465, routes: ['9'], modes: ['tram'] },
      { platform_id: 'right', latitude: 52.121270, longitude: 11.627505, routes: ['9'], modes: ['tram'] },
      { platform_id: 'close-but-distinct', latitude: 52.121280, longitude: 11.627505, routes: [], modes: ['bus'] },
    ] };
}

test('every real platform survives regardless of service or 25m proximity', () => {
  const stop = station(), before = JSON.stringify(stop);
  const pins = transitStopPins([stop]);
  assert.equal(pins.length, 4);
  assert.equal(new Set(pins.map(p => p.platform_id)).size, 4);
  assert.ok(pins.every(p => p.physical_stop_id === stop.stop_id));
  assert.equal(JSON.stringify(stop), before);
  assert.equal(pins.find(p => p.platform_id === 'close-but-distinct').routes.length, 0);
  assert.deepEqual(Array.from(pins.find(p => p.platform_id === 'left').modes), ['tram']);
  assert.deepEqual(Array.from(pins.find(p => p.platform_id === 'bus').modes), ['bus']);
});

test('physical first anchor does not decide which platform is inside the viewport', () => {
  const pins = transitStopPins([station()]).filter(p => p.latitude >= 52.1209);
  assert.equal(pins.length, 3);
  assert.ok(pins.some(p => p.platform_id === 'left'));
  assert.ok(pins.some(p => p.platform_id === 'right'));
});

test('legacy platform metadata infers bus and tram from its own routes, not the whole place', () => {
  const source = station();
  source.platforms.forEach(p => { delete p.modes; });
  const pins = transitStopPins([source]);
  assert.deepEqual(Array.from(pins.find(p => p.platform_id === 'bus').modes), ['bus']);
  assert.deepEqual(Array.from(pins.find(p => p.platform_id === 'left').modes), ['tram']);
});

test('already expanded platforms and manual unplatformed places are not duplicated', () => {
  const once = transitStopPins([station()]);
  assert.equal(transitStopPins(once).length, once.length);
  const manual = { ...station(), platforms: [] };
  assert.equal(transitStopPins([manual]).length, 1);
});

test('same-side nearby bus and tram platforms share a fixed icon while retaining identities and codes',()=>{
  const stop=station();
  stop.platforms.forEach(platform=>platform.side='left');
  stop.platforms[0].platform_code='A';
  stop.platforms[1].platform_code='B';
  stop.platforms[2].platform_code='C';
  const pins=transitStopPins([stop]);
  const grouped=groupTransitStopIcons(pins);
  assert.equal(pins.length,4,'operational platform pins remain ungrouped');
  assert.equal(grouped.length,1,'the same named station draws one icon');
  assert.deepEqual(Array.from(grouped[0].modes).sort(),['bus','tram']);
  assert.deepEqual(Array.from(grouped[0].platform_ids).sort(),['bus','close-but-distinct','left','right']);
  assert.deepEqual(Array.from(grouped[0].platform_codes).sort(),['A','B','C']);
  assert.equal(grouped[0].platform_id,undefined,'a multi-platform stop does not invent a selected platform');
  assert.deepEqual(Array.from(grouped[0].platforms,p=>p.platform_id).sort(),['bus','close-but-distinct','left','right']);
  assert.equal(grouped[0].latitude,pins.find(p=>p.platform_id==='bus').latitude,'anchor stays on a real boarding coordinate');
});

test('different stop names remain distinct, and repeated names far apart are not merged',()=>{
  const near={...transitStopPins([station()])[0],platform_code:'A'};
  const sameNameFar={...near,stop_id:'far',physical_stop_id:'far',platform_id:'far-platform',latitude:53,longitude:11};
  const otherName={...near,stop_id:'other',physical_stop_id:'other',name:'Alter Markt',platform_id:'other-platform'};
  const groups=groupTransitStopIcons([near,sameNameFar,otherName]);
  assert.equal(groups.length,3);
  assert.deepEqual(Array.from(groups.map(g=>g.name)).sort(),['Alter Markt','Hasselbachplatz','Hasselbachplatz']);
});

test('drawing deduplication does not erase dated geometry needed to authorize vehicles', () => {
  const current = { mode: 'tram', route_number: '9', pattern_id: 'p', service_date: '2026-11-04',
    network_version_id: 'today', approach_geometry_fingerprint: 'g', points: [] };
  const previous = { ...current, service_date: '2026-11-03', network_version_id: 'yesterday' };
  const lines = [current, previous];
  assert.equal(distinctGeometryLines(lines).length, 1);
  assert.equal(lines.length, 2);
  assert.equal(distinctGeometryLines([current, { ...previous, approach_geometry_fingerprint: 'different' }]).length, 2);
});

test('platform click uses the existing arrivals endpoint with the exact platform filter', async () => {
  const calls = [], out = {};
  const dependencies = {
    './core': { API_BASE: 'synthetic-only', apiRequest: async url => { calls.push(url); return []; } },
    '../city/serverClock': {},
  };
  const source = fs.readFileSync(path.join(__dirname, '../lib/api/mobility.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports: out, require: name => dependencies[name], Date, setTimeout, clearTimeout });
  await out.getBusesServing(null, 'physical:hasselbach', null, null, 'left/B');
  assert.equal(calls[0], '/mobility/v2/stops/physical%3Ahasselbach/arrivals?visual_rule_version=station-cycle-v2&platform_id=left%2FB');
});

test('renderer changes detail rather than dropping minor stops or clustering opposite platforms', () => {
  const map = fs.readFileSync(path.join(__dirname, '../components/BusinessMap.web.tsx'), 'utf8');
  const stops = map.slice(map.indexOf('const transitStopsRef'), map.indexOf('// Fly to location'));
  assert.match(stops, /transitStopPins\(transitStops/);
  assert.match(stops,/groupTransitStopIcons\(visiblePins\)/);
  assert.doesNotMatch(stops, /i % stride|clusters\.find|dMain < 25|zoom < 11/);
  assert.match(stops, /s\.platform_ids\.slice\(\)\.sort\(\)/);
  assert.match(stops, /container\.dataset\.platformId/);
  assert.match(stops,/paintTier/);
  assert.doesNotMatch(stops,/\.textContent\s*=\s*r\.route_number/);
  assert.match(map, /\[transitStops, mapReady, mapHeading, transitLines, pinLocation, location, stopViewportRevision\]/);
  assert.doesNotMatch(stops,/getBounds\(/,'viewport cannot change stop grouping');
  const native=fs.readFileSync(path.join(__dirname,'../components/BusinessMap.native.tsx'),'utf8');
  const nativeStops=native.slice(native.indexOf('{groupedTransitStops.map'),native.indexOf('{groupedMarkers.map'));
  assert.match(nativeStops,/groupedTransitStops\.map/);
  assert.match(nativeStops,/stop\.platform_codes\.join/);
  assert.doesNotMatch(nativeStops,/stop\.routes\.slice|r\.route_number/);
  const locator = fs.readFileSync(path.join(__dirname, '../app/(tabs)/locator.tsx'), 'utf8');
  const selection = locator.slice(locator.indexOf('const transitStops = useMemo'), locator.indexOf('// Journey-plan route'));
  assert.doesNotMatch(selection, /routes\.length >= 2|list = \[\]|mapZoom/);
  const city = fs.readFileSync(path.join(__dirname, '../components/city/CityGatewayScreen.tsx'), 'utf8');
  assert.match(city, /platforms: s\.platforms/);
  assert.match(city, /renderedTransitLines=useMemo\(\(\)=>distinctGeometryLines\(nearbyTransitLines\)/);
  assert.match(city,/transitLines=\{renderedTransitLines\}/);
});
