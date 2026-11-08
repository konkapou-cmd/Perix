# Time-normalized visual progress — local prototype

**Latest recovery update:** `MAGDEBURG_VISUAL_RECOVERY_2026-11-02.md` records automatic recovery after a replaced atomic generation, a generation-scoped shared optical anchor and exact-map matching in both clients. **276 four-worker HTTP responses**, **217 targeted backend tests / 1 skipped**, **53 frontend tests** and TypeScript passed. Initial stale samples remain hidden until compatible data are reloaded. No deployment or online activation occurred.

## Agreed semantics

The marker is a **visual progress indicator constrained by arrival/departure estimates**, not GPS, observed passage or a physical-speed guarantee. Geometry supplies the displayed path. Existing bus/tram trajectories supply acceleration/braking/turn-shaped progress. The visual clock is normalized to the source interval, including intervals shorter than the physical template. The actual physical solver and its limits remain unchanged. No model-only delay may silently be relabelled as a provider delay.

The source timeline can contain interpolated/propagated estimates, not just directly reported stop forecasts. Agreement with those targets is internal consistency, not proof of actual arrival. Freshness, cancellation, trip/date identity and closure guards still apply before publication. A zero countdown means completion of the visual estimate, never observed arrival.

## Implemented offline core

`mobility/motion/visual_progress.py`:

- Pure plan construction, explicit region/network/version/day/trip/pattern/geometry identity, source clocks copied without mutation.
- One existing trajectory template per adjacent stop occurrence. Profiles must be connected, finite, monotone and consistent with their piecewise acceleration equation. Missing/invalid geometry/profile hides the marker but retains the source countdown. No fabricated shortcut or implied traversal of a gap.
- Time normalization samples the existing physical trajectory at virtual elapsed time; the existing `sample_trajectory` no-compression rule is **not modified**. Output has `TIME_NORMALIZED_VISUAL_ESTIMATE`, `physical_speed_assurance=false`, `observed_arrival=false`, and no physical `speed_kmh`.
- Arrival and departure are distinct; only source dwell is represented. Repeated stop IDs remain distinct occurrences. Zero/inverted intervals are not repaired by fabricating time or geometry.
- Same-identity/same-leg revision helper retains displayed progress and fits the remainder to an updated **future** deadline, without rewinding or changing clocks. A changed geometry/journey or already-due target refuses that rebase. No algorithm can simultaneously guarantee a future smooth traversal and immediate arrival at a deadline already in the past; that case needs an explicit hidden/re-sync presentation state rather than a false promise.
- No shared runtime cache, new provider fetch, fleet integration, boarding logic change, or UI label change in this step.

## Tests and captured-dataset replay

**71 selected tests passed**, covering visual normalization, unchanged bus/tram physics, effective ETA, modeled lateness and neighboring source timing (one existing dependency warning). The source curve tests include 1, 10, 60 and 180 second windows, revisions toward earlier/later arrivals, unknown segments, repeated visits, identity mismatches and invalid clocks/profiles. One initial assertion incorrectly expected no sample during the final source dwell; it was corrected to expect the visual stop estimate until departure.

The CLI `tools/replay_visual_progress.py` reads explicitly supplied offline files only, checks captured event and dated pattern identity, static stop occurrences and archive hashes, and refuses report overwrite. It uses existing audited offline candidate infrastructure with **50 km/h global template cap**, existing lower edge caps and turns, no traffic/signals or added dwell. An initial replay stopped because the older captured network document lacks `region_id`; the CLI now requires explicit region/network IDs matching the recorded event. No report was accepted from that failed attempt.

Successful report: `C:\Users\PC\AppData\Local\Temp\opencode\perix-visual-progress-aok-20261102-v1.json`.

- Trip `938920`, pattern `10:59263da9d1`, dated `2026-11-02`, 33 stop occurrences / **32 adjacent legs**.
- **32/32** sampled arrival endpoints have exact target progress and zero ETA. Source clocks are unchanged. Twenty-one samples per leg were inspected for monotone visual progress.
- At AOK the target is **21:17:08**, not the previous physical plan's **21:17:36**. This follows the agreed visual semantics; it is not a new provider forecast or a measurement that the tram arrived then.
- This run has 32 complete local candidate profiles, so no profile-missing leg was hidden. That does **not** clear historical direction/access/platform review flags, or approve any candidate for production. The old hard-coded schedule-only policy and a future partial-geometry contract have not been replaced by this offline replay.

## Initial prototype boundaries (superseded by integration below)

This is the first isolated implementation and dataset replay, **not** a completed replacement of passenger behavior. Before activation:

1. Make fleet and board publication select the same immutable source/revision, without inheriting physical-plan effective clocks. Keep provider forecasts, propagated targets and visual progress separately labelled.
2. Bind bounded visual previews and rebase state to exact geometry/journey/source identity and freshness; do not send compressed curves through the old physical-speed contract unchanged.
3. Enforce hidden intervals through the complete fleet/API/client lifecycle, including marker removal, preview cancellation and reappearance, without fabricating a connector or losing board arrivals.
4. Test send-time sampling, earlier/later source revisions, missing trip timestamp, cancellations, expiry, midnight, multi-worker behavior and web/mobile rendering. No claim is made that the progress rebase helper alone guarantees smooth velocity/acceleration across revisions.
5. Build/review an exact package, complete source notices and isolated staging checks, and obtain separate production approval.

No production/staging deployment, source time rewrite, speed-cap change, commit or push was performed.

## Passenger API and both maps: opt-in local integration

The follow-up implementation now connects the core to the existing passenger pipeline. It remains **off by default and undeployed**: `MOBILITY_VISUAL_PROGRESS_ENABLED=true` is required in an isolated test/staging environment. No hosted environment setting was changed.

- `mobility/motion/visual_runtime.py` selects only a ready atomic bundle matching the path generation and exact geometry points; total length is checked too. Missing/mismatched/manual authority hides the pin instead of falling back to an old physical estimate. In visual mode an absent projection is no longer resurrected by parking a speculative marker at a stop. Boards retain their source arrival rows.
- The existing bus/tram builders create the curve templates (global template cap at most 50 km/h, lower edge caps and turns retained). Traffic/signal phases are not invented. Their legal physical sampler/configuration is untouched. Template caches are bounded to 32 plans / 50,000 trajectory segments and source/config/geometry keyed.
- API `motion.model=TIME_NORMALIZED_VISUAL_ESTIMATE`, `quality=VISUAL_NOT_PHYSICAL`, `speed_kmh=null`, `physical_speed_assurance=false`, `observed_arrival=false`. Source timing basis and absent trip timestamp remain explicit. Source arrival/departure fields are not replaced with the old physical plan's clocks.
- Boards and trip details consume the same source timeline snapshot as a matching visual vehicle. Boards can expose its visual revision without claiming a physics-derived forecast; physical distance/speed consistency is explicitly `NOT_APPLICABLE_VISUAL_PROGRESS`. Physical cached trip extensions do not select visual run windows.
- Bounded **schema 2** previews carry explicit optical semantics and source-clock/geometry/occurrence/revision identity. Exact same-acceleration phases are merged without altering their equation where possible; at most 32 phases and 8 seconds are sent, never across the current source stop/departure boundary. If the bound truncates a complex profile, the client holds at the authorized endpoint rather than extrapolating. The existing physical schema 1 stays supported unchanged.
- `/app` and `/locator` both pass visual identity, revision, exact dated map geometry, countdown and preview to the shared map. Locator's legacy physical markers keep their old path; visual markers opt into authoritative sampling individually. Both screens capture request/receipt clocks for visual packets. No Home design changes were made.
- Web uses the bounded preview equations rather than legacy extrapolation for visual markers. Native `VisualTransitMarker.native.tsx` uses the same authorization and sampling functions, cancels animation on update/unmount and never extrapolates an expired preview. Native rendering/device performance has not been interactively verified.

## Shared optical anchors and multi-process proof

Per-worker history was removed as the authority for source-revision rebases. `mobility/motion/visual_shared_state.py` uses `mobility_visual_progress_state` with a unique hashed journey/geometry `_id` and an atomic revision compare-and-swap. It stores compact source windows and a rebase anchor, **not GPS or full trajectory profiles**. A TTL index on `expires_at` is included in application index setup; state expires after 48 hours. All local tests used their own disposable database and new collections.

When clocks change on the same future leg, one winning worker defines the anchor from the previous shared curve at NOW. Other workers use the same anchor and visual revision. An unchanged target can advance the source-order watermark without changing its curve. Older source orders cannot overwrite newer accepted clocks; equal-order conflicting clocks fail closed. Ordering uses normalized trip-update/header epochs only to order accepted packets: a newer feed header still is **not proof** of a new trip-specific forecast. Different template configurations fail closed rather than publish divergent curves. Unavailable shared state hides the marker; it does not authorize a worker-local alternative. Already-due targets or changed leg/geometry do not gain a fabricated smooth connector.

Real MongoDB **7.0.45**, loopback-only, binary-hash/PID/dbpath verified:

- **11 phases × 4 independent Python worker processes**, 10 reads each = **440 samples**. Within every phase, all same-clock/source samples are exactly equal, including float progress, visual revision, countdown and visibility (or all reject stale/conflicting data).
- Initial 60-second window, +180-second delay, earlier future arrival, clearing local caches, fresh interpreter restarts, exact visual endpoint with ETA zero, stale source rejection, same-order conflict rejection and watermark advancement were exercised.
- An additional **4-process mixed-source race / 40 reads** delivered old/new source revisions concurrently. Final shared state selected the newer order; subsequent old requests were rejected, with no reset of the established optical anchor.
- After graceful MongoDB restart, a **new process / 10 reads** recovered exactly the same accepted visual anchor/revision without local memory. This uses the actual visual runtime adapter and MongoDB state, not only a mocked algorithm.
- Total: **49 interpreter launches / 490 samples** for this check, with four workers simultaneous, not 49 simultaneous clients. Report: `C:\Users\PC\AppData\Local\Temp\opencode\perix-mongo-isolated-20261102\visual-multiworker-v3-final\visual-multiworker-report.json`; supervisor `report.json` confirms `synthetic_visual_anchor_survived_database_restart=true`.

The isolated supervisor run passed **17 tests** (one dependency warning). A separate targeted regression selection passed **214 tests, 1 skipped** (one dependency warning). **51 frontend tests** and TypeScript passed. Tests include source ETA preservation across fleet/board/details, hidden pin with continuing board arrival, no stop-anchor resurrection, config drift, shared DB outage, schema-2 equations and both screen/native wiring.

**Limits of the proof:** these are synthetic independent processes invoking the runtime adapter, not deployed Uvicorn processes, a hosted load test, full application failover, browser visual confirmation or a physical-location validation. Correctness is conditional on matching source/order/geometry and a common service clock. Database/network partition, wall-clock skew, worker source disagreement, and different client network latency can yield hidden/held updates; no claim is made of perfect smoothness at every screen/network latency. Review an isolated hosted multi-worker HTTP/board/rendering run, source freshness/cancellation behavior, capacity and release packaging before activation. Existing legal/geometry gates are not automatically cleared.

## Follow-up: real loopback HTTP, four Uvicorn processes

At the user's request the check was extended beyond direct adapter calls. `tests/visual_http_fixture_app.py` mounts the **actual V2 router** on a test-only FastAPI application without importing `server.py` or executing its migrations, schedulers or provider workers. Each process verifies the disposable MongoDB PID/path/loopback binding during startup; outbound non-loopback socket connections are rejected. The fixture injects only a request-scoped synthetic source clock and accepted trip-update reader. Real geometry loading, optical runtime, shared MongoDB state, V2 fleet/map serialization and unified board handlers are exercised. No provider poll, production DB read/write, hosted staging change or deployment is part of this test.

`tests/test_visual_http_isolated.py` starts **four independent Uvicorn processes**, each on its own newly selected `127.0.0.1` TCP port. It targets every process explicitly rather than assuming a load balancer distributed requests. The response headers expose synthetic test PID/source order only. The driver allows **up to 12 concurrent GET requests** and checks that all four worker PIDs actually responded in every phase. This is not a single shared-listener/load-balancer or hosted topology proof.

Final run: **204 successful HTTP responses over eight phases**:

1. Initial source interval: fleet and board agree at ETA **40 s**, same visual revision/progress/coordinate across workers.
2. Later target (+180 s): fleet and board agree at **220 s** and preserve the shared displayed progress.
3. Earlier future target: agreement at **25 s**, no rebase rewind.
4. One Uvicorn process is stopped/replaced: fresh worker has exactly the same progress/revision/ETA. The replacement PID differs; four workers still serve this phase.
5. Approach at **3 s** remaining: bounded preview ends exactly at the source arrival epoch and stop progress.
6. Source target reached: ETA **0**, exact endpoint and zero remaining distance, still `observed_arrival=false`.
7. Geometry bundle made not-ready **in the disposable fixture database**: fleet is empty, source board still returns ETA **25 s**. No fabricated parked marker.
8. Synthetic source cancellation: both fleet and board omit the canceled trip.

The initial phase additionally reads `/api/mobility/v2/map` **12 times across the four workers**. The returned line is valid, version/day/pattern scoped, point-identical to the synthetic canonical geometry, and fingerprint-identical to the fleet previews. Successful moving/stop fleet packets are explicitly asserted `READY` and must actually contain schema-2 previews; null previews cannot make the test pass accidentally.

The complete supervised run passed **18 tests in 92.45 s**, with one existing dependency warning, on verified loopback MongoDB **7.0.45**. Its original 168-response and later 192-response preliminary captures are retained separately; the final 204-response capture is the one described here.

### Client contract check using actual HTTP packets

`frontend/tests/visual-http-capture-check.cjs` loads the final HTTP report and executes the same TypeScript `authorizePreview` and `sampleAuthorizedPreview` functions used by the maps. **72/72 optical packets were authorized** under an explicitly **simulated 200 ms round-trip client clock bridge**; repeated samples were monotone, stop-bound and held after preview expiry. All **12 near-arrival packets** completed at the exact stop endpoint. This is a cross-language payload/equation check, not an interactive browser/native-device test or evidence of actual network timing. Source/update clocks in the HTTP fixture are controlled and identical across workers.

Final evidence directory:

`C:\Users\PC\AppData\Local\Temp\opencode\perix-mongo-isolated-20261102\visual-http-v3-map\`

- `visual-http-report.json` — SHA-256 `c99e95df985483726d342e798642ad3a93d9a05763fbe0a3013ee25380d3033e`.
- `report.json` — supervisor/version/loopback identity, test summary and database restart proofs.
- `visual-http-worker-*.log` — owned fixture worker logs, including replacement.

Reproduce the loopback HTTP selection by adding `--visual-http` to `tools/run_isolated_mongo_tests.py` with the explicitly hash-verified `mongod` binary and a **new** work directory. All artifacts and the disposable database are preserved. No broad deletion or external service restart occurs. A separate offline regression selection for visual core/runtime/supervisor passed **52 tests** with one dependency warning.

**Still pending:** actual web/native visual inspection, real source-ingestion timing rather than the synthetic accepted-source boundary, isolated hosted deployment identity/capacity/failure recovery, source notices and reviewed release packaging. The new mode remains disabled by default and has not been enabled or deployed online. This HTTP proof closes the tested local transport/worker/board/preview contract scenarios, not every release gate.

## Later browser review and terminal-dwell fix

`MAGDEBURG_VISUAL_BROWSER_REVIEW_2026-11-02.md` now records an actual browser review of a **local synthetic SVG diagram** using the real API and production preview helpers, not the full Google Maps/native screens. Turn-following, 19→49→8 s revisions, a corrected 3→2→1→0 endpoint, hidden marker with retained board ETA and settled cancellation were observed. The review found and fixed final-dwell run selection in visual mode; old physical behavior is retained. Latest regression evidence is **228 four-worker HTTP responses / 18 supervised tests**, **84 client-verified HTTP previews**, **215 targeted tests passed / 1 skipped** and passing TypeScript. Full production-screen rendering and hosted release checks remain pending; nothing was deployed.
