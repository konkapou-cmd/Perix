/* Explicit offline artifact verifier, NOT part of the default test glob.
 * Uses actual HTTP response packets from the supervised synthetic fixture.
 * Client timing is simulated; this is not browser/rendering/latency evidence.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');

const input = process.argv[2];
assert.ok(input, 'Explicit HTTP capture path required');
const capture = JSON.parse(fs.readFileSync(input, 'utf8'));
assert.equal(capture.synthetic_only, true);
assert.ok(capture.map_geometry?.fingerprint);
const code = fs.readFileSync(path.join(__dirname, '../lib/city/transitPublication.ts'), 'utf8');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { exports: exportsObject, require: () => { throw Error('Unexpected runtime dependency'); } });
const { authorizePreview, sampleAuthorizedPreview } = exportsObject;
let packets = 0, endpoints = 0, stationCycles = 0, parkedThirtySamples = 0;
for (const phase of capture.phases) {
  for (const response of phase.responses) {
    if (response.path.split('?')[0] !== '/api/mobility/v2/vehicles') continue;
    for (const vehicle of response.data) {
      const source = vehicle.motion?.preview;
      assert.ok(source, 'Expected ready optical preview');
      // The legacy endpoint assertions below cover its original 8-second window.
      if (response.path.includes('?') && source.visual_rule_version !== 'station-cycle-v2') continue;
      // Simulated clock bridge with 200 ms round-trip network time. The HTTP
      // fixture freezes source time, so real client wall time is not evidence.
      const preview = { ...source, client_request_at_ms: source.server_received_at_ms-100,
        client_received_at_ms: source.server_sent_at_ms+100 };
      const active = authorizePreview(preview, { estimated: vehicle.estimated, mode: vehicle.mode,
        journeyId: vehicle.trip_instance_id, patternId: vehicle.pattern_id,
        planRevision: vehicle.motion_plan_revision, progressM: vehicle.progress_m,
        pathLengthM: capture.map_geometry.length_m, geometryFingerprint: capture.map_geometry.fingerprint,
        nextTimelineIndex: vehicle.next_timeline_index, distanceToNextStopM: vehicle.distance_to_next_stop_m,
        nextStopEtaSeconds: vehicle.next_stop_eta_seconds }, preview.client_received_at_ms, 1000);
      assert.ok(active, `Client rejected ${phase.label} HTTP packet`);
      if (source.visual_rule_version === 'station-cycle-v2') {
        assert.ok(source.station_window.length > 0);
        const boards = phase.responses.filter(r => r.path.includes('/arrivals?'));
        const cycle = source.station_window.find(c => c.stop_occurrence_index === vehicle.next_timeline_index);
        for (const board of boards) {
          assert.equal(board.data[0].countdown_target_at_ms,cycle.countdown_target_at_ms);
          assert.equal(board.data[0].motion_plan_revision,vehicle.motion_plan_revision);
        }
        const end = source.valid_until_ms-active.serverMs;
        let previous = vehicle.progress_m;
        for (let elapsed=0;elapsed<end;elapsed+=100) {
          const sample=sampleAuthorizedPreview(active,1000+elapsed);
          assert.ok(sample && sample.progressM>=previous-1e-6);
          const current=source.phases.find(p => elapsed+(active.serverMs-source.sampled_at_ms)<p.t1*1000)?.station_cycle;
           if (current) assert.equal(sample.countdownSeconds,current.countdown_target_at_ms == null ? null
             : Math.max(0,(current.countdown_target_at_ms-active.serverMs-elapsed)/1000));
          if (source.visual_parameters?.station_stop_lead_s === 30 && current && !current.cycle_limited
              && sample.countdownSeconds != null && sample.countdownSeconds > 0 && sample.countdownSeconds <= 30) {
            assert.equal(sample.state,'VISUAL_STOP_ESTIMATE');assert.equal(sample.velocityMps,0);
            const occurrence=source.stop_progress_by_occurrence_m[current.stop_occurrence_index];
            assert.ok(Math.abs(sample.progressM-occurrence)<0.001);
            parkedThirtySamples++;
          }
          previous=sample.progressM;
        }
        assert.equal(sampleAuthorizedPreview(active,1000+end).expired,true);
        stationCycles++;packets++;continue;
      }
      let previous = vehicle.progress_m;
      for (let ms = 1000; ms <= 11000; ms += 100) {
        const sample = sampleAuthorizedPreview(active, ms);
        assert.ok(sample && sample.progressM >= previous-1e-6);
        assert.ok(sample.progressM <= preview.stop_progress_m+0.001);
        previous = sample.progressM;
      }
      const last = sampleAuthorizedPreview(active, 11000);
      assert.equal(last.expired, true);
      if (phase.label === 'approach-target') {
        assert.equal(vehicle.next_stop_eta_seconds, 3);
        assert.ok(Math.abs(last.progressM-preview.stop_progress_m) < 0.001);
        endpoints++;
      }
      packets++;
    }
  }
}
assert.ok(packets > 0 && endpoints > 0 && stationCycles > 0);
console.log(JSON.stringify({ packets_authorized: packets, approach_endpoints_verified: endpoints,
  station_cycle_packets_verified: stationCycles,
  parked_thirty_samples_verified: parkedThirtySamples,
  limits: ['Actual synthetic HTTP packets, simulated client clock bridge.',
    'No browser/native rendering, real network latency, hosted load or physical position proof.'] }));
