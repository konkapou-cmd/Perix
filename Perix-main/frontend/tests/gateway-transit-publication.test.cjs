const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, dependencies = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, setTimeout, clearTimeout, Date, URLSearchParams, require: name => dependencies[name] });
  return exports;
}

const { startFleetPolling } = load("lib/city/fleetPoller.ts");
const { applyGatewayTransitUpdate, authorizePreview, sampleAuthorizedPreview } = load("lib/city/transitPublication.ts");
const flush = () => new Promise(resolve => setImmediate(resolve));

test("one fleet request at a time; failed reads keep the last published fleet", async () => {
  let resolveFirst, calls = 0, timer, time = 0;
  const values = [];
  const stop = startFleetPolling({
    load: () => { calls++; return calls === 1 ? new Promise(resolve => { resolveFirst = resolve; }) : Promise.reject(Error("offline")); },
    publish: value => values.push(value), now: () => time,
    schedule: (callback, delay) => { timer = { callback, delay }; return timer; },
    cancel: () => { timer = null; },
  });
  assert.equal(calls, 1);
  assert.equal(timer, undefined);
  time = 20000; resolveFirst(["vehicle"]); await flush();
  assert.equal(timer.delay, 2000);
  timer.callback(); await flush();
  assert.equal(calls, 2);
  assert.deepEqual(values, [["vehicle"]]);
  assert.equal(timer.delay, 15000);
  stop();
  assert.equal(timer, null);
});

test("the gateway eight-second cadence leaves a two-second floor after slow reads", async () => {
  let time=0, timer;
  const stop=startFleetPolling({ load: async () => { time=3000; return []; }, publish: () => {},
    intervalMs: 8000, now: () => time,
    schedule: (callback, delay) => { timer={ callback, delay }; return timer; }, cancel: () => {} });
  await flush();
  assert.equal(timer.delay, 5000);
  stop();
});

test("a late fleet response after unmount never updates the page", async () => {
  let resolve;
  const values = [];
  const stop = startFleetPolling({ load: () => new Promise(r => { resolve = r; }), publish: v => values.push(v) });
  stop(); resolve(["late"]); await flush();
  assert.deepEqual(values, []);
});

test("Locator publishes every slow response without overlapping or sequence starvation", async () => {
  let time=0, timer, resolve, calls=0, outstanding=0, maximum=0;
  const values=[];
  const stop=startFleetPolling({ intervalMs:4000, now:()=>time,
    load:()=>{ calls++; outstanding++; maximum=Math.max(maximum,outstanding);
      return new Promise(done=>{ resolve=value=>{ outstanding--; done(value); }; }); },
    publish:value=>values.push(value),
    schedule:(callback,delay)=>{ timer={callback,delay}; return timer; },
    cancel:()=>{ timer=undefined; },
  });
  for (const [index,duration] of [9000,14000,7000].entries()) {
    time+=duration;
    assert.equal(calls,index+1);
    resolve([index]); await flush();
    assert.deepEqual(values.at(-1),[index]);
    assert.equal(timer.delay,2000);
    // A duplicated/already queued callback must not create parallel work.
    if (index<2) { time+=timer.delay; const next=timer.callback; next(); next(); }
  }
  assert.equal(maximum,1);
  assert.equal(values.length,3);
  const queued=timer.callback;
  stop(); queued(); await flush();
  assert.equal(calls,3);
});

test("both web map screens use the same serialized polling lifecycle", () => {
  const locator=fs.readFileSync(path.join(__dirname,'..','components/locator/LegacyLocatorScreen.tsx'),'utf8');
  const effect=locator.slice(locator.indexOf('// Live mobility vehicles'),locator.indexOf('// Active transit network'));
  assert.match(effect,/return startFleetPolling\(/);
  assert.match(effect,/getLiveVehicles\(sessionToken, initialFleetSync.current, true\)/);
  assert.match(effect,/publication_status === 'READY'/);
  assert.match(effect,/initialFleetSync.current = false/);
  assert.doesNotMatch(effect,/latestSeq|setInterval/);
  const gateway=fs.readFileSync(path.join(__dirname,'..','components/city/CityGatewayScreen.tsx'),'utf8');
  assert.match(gateway,/return startFleetPolling\(/);
});

test("pending keeps the last point only for the same journey; ready applies immediately", () => {
  const positions = [];
  const record = { journeyId: "journey-a", animStart: 1, progNow: 42, marker: { setPosition: p => positions.push(p) } };
  assert.equal(applyGatewayTransitUpdate(record, { journeyId: "journey-a", publicationStatus: "PENDING", latitude: 52, longitude: 11 }), "held");
  assert.equal(record.animStart, null);
  assert.equal(record.progNow, 42);
  assert.equal(positions.length, 0);
  assert.equal(applyGatewayTransitUpdate(record, { journeyId: "journey-a", publicationStatus: "READY", latitude: 52.1, longitude: 11.1, progressM: 50 }), "updated");
  assert.equal(record.progNow, 50);
  assert.equal(positions[0].lat, 52.1);
  assert.equal(positions[0].lng, 11.1);
});

test("a pending new journey cannot inherit an old journey position", () => {
  const positions = [], visibility = [];
  const record = { journeyId: "old", progNow: 900, animStart: 1,
    marker: { setPosition: p => positions.push(p), setVisible: v => visibility.push(v) } };
  assert.equal(applyGatewayTransitUpdate(record, { journeyId: "new", publicationStatus: "PENDING", latitude: 52, longitude: 11 }), "hidden");
  assert.equal(record.journeyId, "new");
  assert.equal(record.progNow, null);
  assert.equal(positions.length, 0);
  assert.deepEqual(visibility, [false]);
  assert.equal(applyGatewayTransitUpdate(record, { journeyId: "new", publicationStatus: "PENDING", latitude: 52, longitude: 11 }), "held");
  assert.equal(positions.length, 0);
  assert.equal(applyGatewayTransitUpdate(record, { journeyId: "new", publicationStatus: "READY", latitude: 52.1, longitude: 11.1, progressM: 42 }), "updated");
  assert.equal(positions.length, 1);
  assert.equal(record.progNow, 42);
  assert.deepEqual(visibility, [false, true]);
});

test("a newly created /app marker waits for readiness before Google marker creation", () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'components/BusinessMap.web.tsx'), 'utf8');
  const guard = 'if (authoritativeTransit && rep.estimated && rep.publicationStatus === "PENDING") return;';
  assert.ok(source.includes(guard));
  assert.ok(source.indexOf(guard) < source.indexOf('const marker = new google.maps.Marker({'));
});

test("the actual API adapter requests initial sync only when explicitly selected and carries pending status", async () => {
  const paths = [];
  const api = load("lib/api/mobility.ts", { "./core": { API_BASE: "/api", apiRequest: async url => {
    paths.push(url);
    return [{ vehicle_id: "bus", mode: "bus", estimated: true, trip_instance_id: "dated-trip",
      route: { number: "5" }, position: { latitude: 52, longitude: 11 }, next_stop_eta_seconds: 31,
      next_stop_predicted_arrival: "12:45", next_stop_eta_source: "PERIX_ESTIMATE",
      motion: { publication_status: "PENDING" } }];
  } } });
  const rows = await api.getLiveVehicles(null, true);
  await api.getLiveVehicles(null);
  assert.equal(paths[0], "/mobility/v2/vehicles?initial_sync=true");
  assert.equal(paths[1], "/mobility/v2/vehicles");
  assert.equal(rows[0].trip_instance_id, "dated-trip");
  assert.equal(rows[0].motion.publication_status, "PENDING");
  assert.equal(rows[0].next_stop_eta_seconds, 31);
  assert.equal(rows[0].next_stop_predicted_arrival, "12:45");
  assert.equal(rows[0].next_stop_eta_source, "PERIX_ESTIMATE");
});

test("an expired modeled continuation keeps an unknown ETA, not a fabricated zero", async () => {
  const api = load("lib/api/mobility.ts", { "./core": { API_BASE: "/api", apiRequest: async () => [{
    vehicle_id: "bus", mode: "bus", estimated: true, position: { latitude: 52, longitude: 11 },
    next_stop_eta_seconds: null, next_stop_predicted_arrival: null, next_stop_eta_source: "UNKNOWN",
    motion: { continuation_state: "EXPIRED", preview: null },
  }] } });
  const [row] = await api.getLiveVehicles(null, false, true);
  assert.equal(row.motion.continuation_state, "EXPIRED");
  assert.equal(row.next_stop_eta_seconds, null);
  assert.equal(row.next_stop_predicted_arrival, null);
  assert.equal(row.next_stop_eta_source, "UNKNOWN");
  const gateway = fs.readFileSync(path.join(__dirname, "../components/city/CityGatewayScreen.tsx"), "utf8");
  assert.match(gateway, /Εκτίμηση PERIX σε αναμονή/);
  assert.match(gateway, /όχι μετρημένο GPS ή νέα πρόβλεψη/);
});

test("the /app map alone opts into authoritative transit handling", () => {
  const gateway = fs.readFileSync(path.join(__dirname, "../components/city/CityGatewayScreen.tsx"), "utf8");
  const map = fs.readFileSync(path.join(__dirname, "../components/BusinessMap.web.tsx"), "utf8");
  assert.match(gateway, /<BusinessMap[^>]*\bauthoritativeTransit\b/);
  assert.match(map, /authoritativeTransit = false/);
  assert.match(map, /authoritativeTransit && rep\.estimated/);
  assert.match(map, /applyGatewayTransitUpdate\(rec, rep\)/);
});

const identity = { estimated: true, mode: "tram", journeyId: "network:version:date:trip", patternId: "p",
  planRevision: "revision", progressM: 100, pathLengthM: 1000, geometryFingerprint: "geometry-hash",
  nextTimelineIndex: 2, distanceToNextStopM: 200, nextStopEtaSeconds: 30 };
const window = { schema: 1, revision: "revision", journey_id: identity.journeyId, pattern_id: "p",
  approach_geometry_fingerprint: "geometry-hash", sampled_at_ms: 10000, valid_until_ms: 18000,
  stop_occurrence_index: 2, stop_progress_m: 300, effective_arrival_at_ms: 40000,
  server_received_at_ms: 9900, server_sent_at_ms: 10000, client_request_at_ms: 9900, client_received_at_ms: 10000,
  phases: [{ t0: 0, t1: 8, p0: 100, p1: 140, v0: 5, a: 0, state: "MOVING" }] };

test("authorized preview uses the backend equation and holds at its bounded end", () => {
  const active = authorizePreview(window, identity, 10000, 50);
  assert.ok(active);
  const atThree = sampleAuthorizedPreview(active, 3050);
  assert.equal(atThree.progressM, 115);
  assert.equal(atThree.expired, false);
  const atTwenty = sampleAuthorizedPreview(active, 20050);
  assert.equal(atTwenty.progressM, 140);
  assert.equal(atTwenty.expired, true);
  assert.equal(sampleAuthorizedPreview(active, 49), null);
});

test("visual schema 2 is explicit and reaches its source stop clock, never physical speed evidence", () => {
  const optical = { ...window, schema: 2, semantics: "TIME_NORMALIZED_VISUAL_ESTIMATE",
    physical_speed_assurance: false, effective_arrival_at_ms: 18000,
    phases: [{ t0: 0, t1: 8, p0: 100, p1: 300, v0: 25, a: 0 }] };
  const active = authorizePreview(optical, { ...identity, nextStopEtaSeconds: 8 }, 10000, 50);
  assert.ok(active);
  assert.equal(sampleAuthorizedPreview(active, 8050).progressM, 300);
  assert.equal(sampleAuthorizedPreview(active, 8050).expired, true);
  for (const change of [{ semantics: undefined }, { physical_speed_assurance: true }, { schema: 3 }]) {
    assert.equal(authorizePreview({ ...optical, ...change }, { ...identity, nextStopEtaSeconds: 8 }, 10000, 50), null);
  }
});

test("both screens wire visual identity and native uses the same bounded preview equations", () => {
  const locator = fs.readFileSync(path.join(__dirname, '../components/locator/LegacyLocatorScreen.tsx'), 'utf8');
  const gateway = fs.readFileSync(path.join(__dirname, '../components/city/CityGatewayScreen.tsx'), 'utf8');
  const native = fs.readFileSync(path.join(__dirname, '../components/VisualTransitMarker.native.tsx'), 'utf8');
  for (const s of [locator, gateway]) {
    assert.match(s, /visualEstimate: v\.motion\?\.model === "TIME_NORMALIZED_VISUAL_ESTIMATE"/);
    assert.match(s, /journeyId: v\.trip_instance_id/);
    assert.match(s, /geometryFingerprint:/);
  }
  assert.match(locator, /getLiveVehicles\(sessionToken, initialFleetSync.current, true\)/);
  assert.match(native, /authorizePreview/);
  assert.match(native, /sampleAuthorizedPreview/);
  assert.match(native, /cancelAnimationFrame/);
});

test("both screens refresh map geometry when recovered optical geometry identity changes", () => {
  const locator = fs.readFileSync(path.join(__dirname, '../components/locator/LegacyLocatorScreen.tsx'), 'utf8');
  const gateway = fs.readFileSync(path.join(__dirname, '../components/city/CityGatewayScreen.tsx'), 'utf8');
  assert.match(locator, /missingVisualGeometryKeys\(liveVehicles, transitMapLines\)/);
  assert.match(gateway, /missingVisualGeometryKeys\(liveVehicles, transitLines\)/);
  assert.match(locator, /\[activeTab, sessionToken, geometryRefresh\]/);
  assert.match(gateway, /\[geometryRefresh,hasConfirmedOrigin,nearbyOriginRequestKey,nearbyFleetScopeKey,nearbyLinesLoaded,\s*nearbyQueryBounds,nearbyPositionPatternKey\]/);
  for (const screen of [locator, gateway]) {
    assert.match(screen, /geometryAttempts\.current\.has\(key\)/);
    assert.match(screen, /setGeometryRefresh\(value => value\+1\)/);
  }
  assert.match(locator, /visualGeometryReady\(v, transitMapLines\)/);
  assert.match(gateway, /visualGeometryReady\(v, transitLines\)/);
  assert.match(gateway, /vehicleForDeparture\(row,liveVehicles,transitLines\)/);
  assert.match(gateway, /nearbyBoardVehicleIds\.has\(vehicle\.vehicle_id\)/);
});

test("a recovered marker waits for matching geometry instead of borrowing the previous route", () => {
  const { visualGeometryReady } = load('lib/city/visualGeometry.ts');
  const vehicle = { estimated: true, mode: 'tram', pattern_id: 'p', network_version_id: 'v',
    service_date: '2026-11-02', motion: { model: 'TIME_NORMALIZED_VISUAL_ESTIMATE', geometry_fingerprint: 'new' } };
  const line = { valid: true, mode: 'tram', pattern_id: 'p', network_version_id: 'v',
    service_date: '2026-11-02', approach_geometry_fingerprint: 'new',
    points: [{ latitude: 52, longitude: 11 }, { latitude: 52.001, longitude: 11 }] };
  assert.equal(visualGeometryReady(vehicle, []), false);
  assert.equal(visualGeometryReady(vehicle, [{ ...line, approach_geometry_fingerprint: 'old' }]), false);
  assert.equal(visualGeometryReady(vehicle, [line]), true);
  for (const change of [{ service_date: '2026-11-03' }, { network_version_id: 'other' },
    { pattern_id: 'other' }, { mode: 'bus' }, { valid: false }, { points: [] }]) {
    assert.equal(visualGeometryReady(vehicle, [{ ...line, ...change }]), false);
  }
  assert.equal(visualGeometryReady({ ...vehicle, motion: null }, []), true);
});

for (const [name, mutate] of Object.entries({
  identity: p => { p.journey_id = "other"; },
  pattern: p => { p.pattern_id = "other"; },
  revision: p => { p.revision = "other"; },
  geometry: p => { p.approach_geometry_fingerprint = "other"; },
  stopIndex: p => { p.stop_occurrence_index = 3; },
  stopProgress: p => { p.stop_progress_m = 301; },
  arrivalClock: p => { p.effective_arrival_at_ms += 60000; },
  missingGeometry: p => { delete p.approach_geometry_fingerprint; },
  expired: p => { p.valid_until_ms = p.sampled_at_ms; },
  excessiveNetwork: p => { p.client_received_at_ms += 600; },
  gap: p => { p.phases[0].t0 = 1; },
  impossiblePhase: p => { p.phases[0].p1 = 300; },
  beyondLine: p => { p.phases[0].p1 = 1500; },
  invalidNumber: p => { p.phases[0].v0 = NaN; },
})) test(`${name}: unsafe preview is refused`, () => {
  const p = structuredClone(window); mutate(p);
  assert.equal(authorizePreview(p, identity, 10000, 50), null);
});

test("GPS/taxis and unvalidated geometry cannot use modeled transit previews", () => {
  assert.equal(authorizePreview(window, { ...identity, estimated: false }, 10000, 50), null);
  assert.equal(authorizePreview(window, { ...identity, mode: "taxi" }, 10000, 50), null);
  assert.equal(authorizePreview(window, { ...identity, geometryFingerprint: null }, 10000, 50), null);
});

test("the /app directory uses the existing fleet instead of another mobility read", () => {
  const gateway = fs.readFileSync(path.join(__dirname, "../components/city/CityGatewayScreen.tsx"), "utf8");
  assert.match(gateway, /useCityDiscovery\(query, discoveryBounds\.current, "", false,hasConfirmedOrigin && !!sceneScope && paintedSceneKey===sceneScope\.key, scopeCities\)/);
  assert.match(gateway, /discoveryItems = useMemo\(\(\) => \[\.\.\.discovery\.items, \.\.\.mobilityItems\]/);
  const hook = fs.readFileSync(path.join(__dirname, "../lib/city/gateway.ts"), "utf8");
  assert.match(hook, /includeMobility && \(root \|\| filter\.mobilityOnly\)/);
});

test("city directory does not call either mobility endpoint when /app shares its live snapshot", async () => {
  let fleetReads = 0, stopReads = 0, directoryReads = 0;
  const gateway = load("lib/city/gateway.ts", {
    "../api/core": { apiRequest: async () => { directoryReads++; return { items: [], next_cursor: null }; } },
    "../api/events": {}, "../marketplace/marketplaceTaxonomy": {}, "../config/serviceModules": {}, "../fieldRegistry": {},
    "./publicServices": { getPublicServices: async () => ({ items: [], next_cursor: null }) },
    "../api/mobility": { getLiveVehicles: async () => { fleetReads++; return []; }, getTransitStops: async () => { stopReads++; return []; } },
  });
  const bounds = { minLat: 52, maxLat: 53, minLng: 11, maxLng: 12 };
  await gateway.fetchGatewayPage(gateway.ALL_QUERY, bounds, "", {}, false);
  await gateway.fetchGatewayPage({ kinds: [], mobilityOnly: true }, bounds, "", {}, false);
  assert.equal(directoryReads, 9);
  assert.equal(fleetReads, 0);
  assert.equal(stopReads, 0);
});
