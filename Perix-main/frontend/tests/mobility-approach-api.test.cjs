/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => mocks[name], URLSearchParams, Date });
  return exports;
}
test('API sends the selected platform and preserves unknown ETA and provider evidence', async () => {
  let url;
  const api = load('lib/api/mobility.ts', { './core': { apiRequest: async requested => {
    url = requested;
    return [null, 0, 1, 60, 61].map(eta_seconds => ({ vehicle_id: 'v', route_number: '3', eta_seconds,
      eta_source: 'PERIX_ESTIMATE', source_predicted_arrival: '12:01', source_eta_source: 'REALTIME',
      motion_plan_revision: 'rev', platform_id: 'opposite/west', realtime_feed_timestamp: 123 }));
  } } });
  const arrivals = await api.getBusesServing(null, 'physical:dom', null, null, 'baseline', 'opposite/west');
  assert.equal(new URLSearchParams(url.split('?')[1]).get('platform_id'), 'opposite/west');
  assert.deepEqual(Array.from(arrivals, a => a.eta_minutes), [null, 0, 1, 1, 2]);
  assert.equal(arrivals[0].source_predicted_arrival, '12:01');
  assert.equal(arrivals[0].motion_plan_revision, 'rev');
  assert.equal(arrivals[0].realtime_feed_timestamp, 123);
});
test('approach matching requires exact dated directional trip and future platform occurrence', () => {
  const { boardingApproaches } = load('lib/mobilityApproach.ts');
  const leg = { type: 'ride', mode: 'tram', trip_instance_id: 'net:v:today:T', pattern_id: 'east',
    board_stop_id: 'platform-east', board_timeline_index: 2, board_progress_m: 100,
    board_geometry_fingerprint: 'canonical-hash' };
  const vehicle = { vehicle_id: 'actual', mode: 'tram', trip_instance_id: leg.trip_instance_id,
    pattern_id: 'east', progress_m: 20, next_timeline_index: 1,
    latitude: 52, longitude: 11, position_state: 'ON_PATTERN' };
  const lines = [{ pattern_id: 'east', approach_geometry_fingerprint: 'canonical-hash',
    points: [{ latitude: 52, longitude: 11 }, { latitude: 53, longitude: 11 }] }];
  const match = (v = vehicle, l = leg) => boardingApproaches({ legs: [l] }, [v], lines);
  assert.equal(match()[0].vehicleId, 'actual');
  for (const patch of [{ trip_instance_id: 'net:v:yesterday:T' }, { pattern_id: 'west' },
    { next_timeline_index: 3 }, { next_timeline_index: null }, { progress_m: 101 },
    { position_state: 'LIVE_RAW' }]) assert.equal(match({ ...vehicle, ...patch }).length, 0);
  assert.equal(match(vehicle, { ...leg, trip_instance_id: undefined }).length, 0);
  assert.equal(match(vehicle, { ...leg, board_geometry_fingerprint: 'old-geometry' }).length, 0);
  assert.equal(boardingApproaches({ legs: [leg] }, [vehicle, { ...vehicle, vehicle_id: 'ambiguous' }], lines).length, 0);
});
