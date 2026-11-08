// Prepared only: synthetic clocks, publications and injected API transport.
// No browser, provider, production URL or real network request is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies = {}) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, Date, setTimeout, clearTimeout,
    require: name => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    } });
  return exports;
}

const publication = load('lib/city/transitPublication.ts');

function packet() {
  const phase = (t0, t1, p0, p1, v0, a, index, start, stop, arrival, state, r0, r1) => ({
    t0, t1, p0, p1, v0, a, stop_occurrence_index: index, start_progress_m: start,
    stop_progress_m: stop, effective_arrival_at_ms: arrival, state,
    relative_motion_level0: r0, relative_motion_level1: r1,
  });
  return {
    schema: 2, semantics: 'TIME_NORMALIZED_VISUAL_ESTIMATE', physical_speed_assurance: false,
    visual_rule_version: 'station-relative-v1',
    visual_parameters: { handover_min_ramp_s: 2, relative_motion_rate_per_s: 1,
      initial_coverage_s: 40, rolling_coverage_s: 15 },
    stop_progress_by_occurrence_m: [0, 100, 200],
    journey_id: 'dated-trip', pattern_id: 'line-owned-pattern', revision: 'visual:one',
    approach_geometry_fingerprint: 'directed-geometry',
    sampled_at_ms: 100000, valid_until_ms: 145000,
    stop_occurrence_index: 1, stop_progress_m: 100, effective_arrival_at_ms: 110000,
    server_received_at_ms: 99000, server_sent_at_ms: 100000,
    client_request_at_ms: 90000, client_received_at_ms: 105000,
    client_received_monotonic_ms: 1000, client_server_clock_at_receive_ms: 105000,
    client_clock_uncertainty_ms: 25, client_clock_calibrated_monotonic_ms: 1000,
    phases: [
      phase(0, 10, 50, 100, 10, -1, 1, 0, 100, 110000, 'VISUAL_MOVING', 6, 0),
      phase(10, 15, 100, 100, 0, 0, 1, 100, 100, 110000, 'VISUAL_STOP_ESTIMATE', 0, 0),
      phase(15, 25, 100, 150, 0, 1, 2, 100, 200, 135000, 'VISUAL_MOVING', 0, 6),
      phase(25, 35, 150, 200, 10, -1, 2, 100, 200, 135000, 'VISUAL_MOVING', 6, 0),
      phase(35, 45, 200, 200, 0, 0, 2, 200, 200, 135000, 'VISUAL_STOP_ESTIMATE', 0, 0),
    ],
  };
}

function identity() {
  return { estimated: true, mode: 'tram', journeyId: 'dated-trip', patternId: 'line-owned-pattern',
    planRevision: 'visual:one', geometryFingerprint: 'directed-geometry',
    progressM: 50, pathLengthM: 200, nextTimelineIndex: 1,
    distanceToNextStopM: 50, nextStopEtaSeconds: 10 };
}

test('one sample age advances position, occurrence and displayed ETA exactly once', () => {
  const p = packet();
  const before = JSON.stringify(p);
  const active = publication.authorizePreview(p, identity(), 999999, 1000);
  assert.ok(active);
  const received = publication.sampleAuthorizedPreview(active, 1000);
  assert.equal(received.progressM, 87.5);
  assert.equal(received.displayEtaSeconds, 5);
  assert.equal(received.stopOccurrenceIndex, 1);
  const rendered = publication.sampleAuthorizedPreview(active, 16000);
  assert.equal(rendered.progressM, 112.5);
  assert.equal(rendered.displayEtaSeconds, 15);
  assert.equal(rendered.stopOccurrenceIndex, 2);
  assert.equal(rendered.state, 'VISUAL_MOVING');
  const atStation = publication.sampleAuthorizedPreview(active, 31000);
  assert.equal(atStation.progressM, 200);
  assert.equal(atStation.velocityMps, 0);
  assert.equal(atStation.displayEtaSeconds, 0);
  assert.equal(atStation.state, 'VISUAL_STOP_ESTIMATE');
  assert.equal(publication.sampleAuthorizedPreview(active, 41000).expired, true);
  assert.equal(JSON.stringify(p), before);
});

test('each phase must remain on its actual consecutive stop occurrence', () => {
  for (const mutate of [
    p => { p.phases[2].stop_occurrence_index = 0; },
    p => { p.phases[2].stop_occurrence_index = 3; },
    p => { p.phases[2].stop_progress_m = 100; },
    p => { p.phases[2].start_progress_m = 0; },
    p => { p.phases[1].p0 = 99; },
    p => { p.phases[1].v0 = 1; },
    p => { p.phases[3].effective_arrival_at_ms = 134000; },
    p => { p.stop_progress_by_occurrence_m = [0, 200, 100]; },
    p => { p.phases[2].relative_motion_level1 = 7; },
    p => { p.visual_rule_version = 'unknown'; },
  ]) {
    const p = packet(); mutate(p);
    assert.equal(publication.authorizePreview(p, identity(), 105000, 1000), null);
  }
});

test('an exact departure boundary advances from its station occurrence without inventing a dwell', () => {
  const p = packet();
  p.stop_occurrence_index = 0;
  p.stop_progress_m = 0;
  p.effective_arrival_at_ms = 90000;
  p.valid_until_ms = 120000;
  p.client_server_clock_at_receive_ms = 100000;
  p.phases = p.phases.slice(2, 4).map(phase => ({ ...phase,
    t0: phase.t0-15, t1: phase.t1-15, p0: phase.p0-100, p1: phase.p1-100,
    stop_occurrence_index: 1, start_progress_m: 0, stop_progress_m: 100,
    effective_arrival_at_ms: 120000,
  }));
  const id = { ...identity(), progressM: 0, nextTimelineIndex: 0,
    distanceToNextStopM: 0, nextStopEtaSeconds: 0 };
  const active = publication.authorizePreview(p, id, 100000, 1000);
  assert.ok(active);
  const atDeparture = publication.sampleAuthorizedPreview(active, 1000);
  assert.equal(atDeparture.progressM, 0);
  assert.equal(atDeparture.stopOccurrenceIndex, 1);
  assert.equal(atDeparture.state, 'VISUAL_MOVING');
  assert.equal(atDeparture.displayEtaSeconds, 20);
  assert.ok(publication.sampleAuthorizedPreview(active, 2000).progressM > 0);
});

test('repeated camera renders retain one pin record and never restart or rewind its trajectory', () => {
  const p = packet(), record = { animStart: null };
  assert.equal(publication.acceptVisualPublication(record, p, identity(), 'READY', 105000, 1000), 'updated');
  const active = record.authorizedPreview;
  for (let mono = 2000; mono <= 39000; mono += 1000) {
    const current = publication.sampleAuthorizedPreview(active, mono);
    record.progNow = current.progressM;
    assert.equal(publication.acceptVisualPublication(record, p, identity(), 'READY', 999999, mono), 'unchanged');
    assert.equal(record.authorizedPreview, active);
    assert.equal(record.progNow, current.progressM);
  }
  assert.equal(active.preview.valid_until_ms, 145000);
});

test('an opposite journey cannot inherit this marker authority just because its coordinates are nearby', () => {
  const p = packet(), record = { animStart: null };
  publication.acceptVisualPublication(record, p, identity(), 'READY', 105000, 1000);
  const other = { ...identity(), journeyId: 'opposite-dated-trip', patternId: 'opposite-pattern' };
  assert.equal(publication.acceptVisualPublication(record, null, other, 'PENDING', 106000, 2000), 'hidden');
  assert.equal(record.authorizedPreview, null);
  assert.equal(record.progNow, null);
});

test('public map-and-stop snapshot is shared in flight and across tab tokens, reused briefly, and force-retryable', async () => {
  const calls = [];
  const api = load('lib/api/mobility.ts', {
    './core': { API_BASE: 'synthetic-only', apiRequest: (url, method, token) => new Promise((resolve, reject) => {
      calls.push({ url, method, token, resolve, reject });
    }) },
    '../city/serverClock': {},
  });
  const first = api.getV2Map('a');
  assert.equal(api.getV2Map('a'), first);
  const second = api.getV2Map('b');
  assert.equal(first, second);assert.equal(calls.length,1);
  const value={lines:[],stops:[{stop_id:'shared'}]};calls[0].resolve(value);assert.equal(await first,value);
  assert.equal(await api.getV2Map(null),value);assert.equal((await api.getTransitStops('c'))[0].stop_id,'shared');assert.equal(calls.length,1);
  const refresh=api.getV2Map('b',{force:true});assert.equal(calls.length,2);calls[1].reject(Error('synthetic offline'));
  await assert.rejects(refresh,/synthetic offline/);
  const retry=api.getV2Map('b',{force:true});assert.equal(calls.length,3);calls[2].resolve(value);await retry;
});

test('standalone stop-catalogue reads stay single-flight and independent from the full route-map cache', async () => {
  const calls=[];
  const api=load('lib/api/mobility.ts',{'./core':{API_BASE:'staged',apiRequest:(url,method,token)=>new Promise((resolve,reject)=>calls.push({url,method,token,resolve,reject}))},
    '../city/serverClock':{}});
  const first=api.getTransitStops(null),same=api.getTransitStops('different-public-token');
  assert.equal(first,same);assert.equal(calls.length,1);assert.equal(calls[0].url,'/mobility/v2/stops');
  const stops=[{stop_id:'nearby-1'},{stop_id:'nearby-2'},{stop_id:'nearby-3'}];calls[0].resolve(stops);
  assert.equal(await first,stops);assert.equal(await api.getTransitStops(null),stops);assert.equal(calls.length,1);
  const map=api.getV2Map(null);assert.equal(calls.length,2);assert.equal(calls[1].url,'/mobility/v2/map');
  calls[1].resolve({lines:[],stops});await map;
});

test('nearby map request includes a compact viewport and shares only its location-specific result',async()=>{
  const calls=[];
  const api=load('lib/api/mobility.ts',{'./core':{API_BASE:'nearby-test',apiRequest:(url,method,token,body,timeout)=>new Promise((resolve,reject)=>
    calls.push({url,method,token,body,timeout,resolve,reject}))},'../city/serverClock':{}});
  const origin={latitude:52.14,longitude:11.63};
  const bounds={minLat:52.13,maxLat:52.15,minLng:11.62,maxLng:11.64};
  const stops=api.getNearbyStops(null,origin,bounds,{limit:1,radiusM:150});assert.equal(api.getNearbyStops('another-token',origin,bounds,{limit:1,radiusM:150}),stops);
  assert.equal(calls.length,1);assert.equal(calls[0].url,'/mobility/v2/nearby-stops');assert.equal(calls[0].method,'POST');
  assert.equal(JSON.stringify(calls[0].body),JSON.stringify({latitude:52.14,longitude:11.63,
    bounds:{min_lat:52.13,max_lat:52.15,min_lng:11.62,max_lng:11.64},limit:1,radius_m:150}));
  const stopPayload={stops:[{stop_id:'near'}]};calls[0].resolve(stopPayload);assert.equal(await stops,stopPayload);
   const first=api.getNearbyMap(null,origin,bounds,{limit:1,radiusM:150});assert.equal(api.getNearbyMap('another-token',origin,bounds,{limit:1,radiusM:150}),first);
  assert.equal(calls.length,2);assert.equal(calls[1].url,'/mobility/v2/nearby-map');assert.equal(calls[1].method,'POST');
  const payload={lines:[{route_number:'10'}]};calls[1].resolve(payload);assert.equal(await first,payload);
   assert.equal(await api.getNearbyMap(null,origin,bounds,{limit:3}),payload);assert.equal(calls.length,2);
   const otherBounds={...bounds,maxLng:11.65};const other=api.getNearbyMap(null,origin,otherBounds,{limit:1,radiusM:150});
   assert.equal(calls.length,3);calls[2].resolve({lines:[]});await other;
   const predecessor=api.getNearbyMap(null,origin,bounds,{limit:1,radiusM:150,positionPatternIds:['previous-pattern']});
   assert.equal(calls.length,4);assert.deepEqual(JSON.parse(JSON.stringify(calls[3].body)).position_pattern_ids,['previous-pattern']);
   calls[3].resolve({lines:[]});await predecessor;
});

test('App nearby fleet polling uses the compact stop-scoped endpoint and preserves dated vehicle identity',async()=>{
  const calls=[];
  const raw=[{vehicle_id:'est_run',mode:'bus',estimated:true,route:{number:'10',direction:'Center'},
    trip_id:'trip-prev',trip_instance_id:'network-v:2026-11-06:trip-prev',network_version_id:'network-v',
    service_date:'2026-11-06',position:{latitude:52.14,longitude:11.63,source:'SCHEDULE_ESTIMATE'},pattern_id:'pattern-prev'}];
  const api=load('lib/api/mobility.ts',{
    './core':{API_BASE:'nearby-test',apiRequest:(...args)=>{calls.push(args);return Promise.resolve(raw);}},
    '../city/serverClock':{},
  });
  const origin={latitude:52.14,longitude:11.63};
  const bounds={minLat:52.13,maxLat:52.15,minLng:11.62,maxLng:11.64};
  const rows=await api.getNearbyVehicles(null,origin,bounds,true,['est_run']);
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],'/mobility/v2/nearby-vehicles');assert.equal(calls[0][1],'POST');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][3])),{latitude:52.14,longitude:11.63,
    bounds:{min_lat:52.13,max_lat:52.15,min_lng:11.62,max_lng:11.64},limit:1,radius_m:150,
    initial_sync:true,visual_preview_seconds:45,vehicle_ids:['est_run']});
  assert.equal(rows[0].vehicle_id,'est_run');assert.equal(rows[0].trip_id,'trip-prev');
  assert.equal(rows[0].trip_instance_id,'network-v:2026-11-06:trip-prev');
});

test('App can request two dated arrivals at a time with the exact platform',async()=>{
  const calls=[];
  const api=load('lib/api/mobility.ts',{'./core':{API_BASE:'nearby-test',apiRequest:(...args)=>{calls.push(args);return Promise.resolve([]);}},
    '../city/serverClock':{}});
  await api.getBusesServing(null,'physical:station',null,null,'platform-A',{limit:2,offset:4});
  assert.match(calls[0][0],/\/arrivals\?/);
  assert.match(calls[0][0],/visual_rule_version=station-cycle-v2/);
  assert.match(calls[0][0],/platform_id=platform-A/);
  assert.match(calls[0][0],/limit=2&offset=4/);
});

test('ordinary fleet churn does not invalidate already covered dated geometry', () => {
  const api = load('lib/api/mobility.ts', {
    './core': { API_BASE: 'synthetic-only', apiRequest: () => { throw Error('Unexpected API read'); } },
    '../city/serverClock': {},
  });
  const vehicle = { network_version_id: 'v', service_date: '2026-11-03', pattern_id: 'p',
    motion: { model: 'TIME_NORMALIZED_VISUAL_ESTIMATE', geometry_fingerprint: 'g' } };
  const line = { network_version_id: 'v', service_date: '2026-11-03', pattern_id: 'p',
    approach_geometry_fingerprint: 'g' };
  assert.equal(api.missingVisualGeometryKeys([vehicle], [line]).length, 0);
  assert.equal(api.missingVisualGeometryKeys([vehicle, { ...vehicle, vehicle_id: 'second' }], [line]).length, 0);
  assert.equal(api.missingVisualGeometryKeys([{ ...vehicle, service_date: '2026-11-04' }], [line]).length, 1);
  assert.equal(api.missingVisualGeometryKeys([{ ...vehicle, motion: { ...vehicle.motion, geometry_fingerprint: 'new' } }], [line]).length, 1);
});
