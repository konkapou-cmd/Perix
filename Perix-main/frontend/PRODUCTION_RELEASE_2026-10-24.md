# Production promotion — 2026-10-24

## Live release

- Latest production: **`92095c5c-033d-45b8-b358-3bd2fd4abcac`** — frontend-only
  smaller Bus/Tram markers and overview count/selection; final addendum below.
- Immediate safe rollback: `0adc9837-d717-4694-a10d-686b052ad4d3` (the previous
  source-journey coverage release). Earlier rollback identities are historical.
- The original combined release record follows; its validation remains the
  baseline, not a claim that all physical vehicles are covered.

## Original combined release

- URL: **https://app.perix.eu**
- Production deployment: `a7360ffb-4c82-4f16-bacc-bd7861111c5e` (`SUCCESS`, active).
- Railway project: `99643a3b-bf65-467a-8f2f-50640f519b2b`.
- Target: production / backend `94882f6a-8179-43bc-bdf5-73eb1de4a059` only.
- Validated staging source: `12d03485-566c-4aec-8834-0c5f51a4e278`.
- Previous production / rollback: `45be2af4-74eb-4c37-af0f-274c7b495be1`.

The first upload timed out before a build was associated with failed deployment
`f08b914b-b32d-4403-a6cb-88da0e0f40d8`; the previous production stayed active.
The retry of the same frozen package succeeded. No database migration, account
mutation, environment-variable change or island-service deployment was performed.

## Included functionality

- Shared effective virtual-vehicle motion clocks, arrivals and selected-trip
  details; provider clocks remain separate and real GPS is not manufactured.
- Exact serving-platform distance/selection and dated directional identity.
- Lime vehicle-to-boarding-stop approach layer, clipped ahead of the marker.
- Home bus/tram markers alongside other content, with exact vehicle selection
  and first focus in Locator Mobility.
- Inline business directions using the same passenger planner.
- Shared explicit live/manual origin, address suggestions, compact Set Your Area,
  one blue live or orange manual origin pin, and manual-origin directions.
- Public read-only place suggestions with input bounds/cache; reverse/private
  endpoints retain authentication. Paid Google Routes remains disabled.

## Artifact identity and rollback

The production frontend was rebuilt from the isolated validated source, with
the production API/app/map origins and the exact already-published production
Maps config fields. The native/API and browser Maps keys were identified
separately from their serialized production config fields; no new keys were
created, exposed in diagnostics, or substituted from staging.

The backend package is byte-identical to staging except `webdist.dat`, which
contains the production-targeted frontend. Upload used **264 explicit manifest
files**, never the dirty checkout, dependency junction or Python test caches.

- Entry: `entry-a33073d94e07d0868b61f43e388b281c.js`.
- Served entry SHA-256:
  `eb4f434800fc8e7dc209218c3d5f68cb9a060c1fcb4e0d84a4eb2c5107adfb7c`.
- Frontend archive SHA-256:
  `814231036fb2aff9a1f283e68e87060299399012b2105f2d77676c49d09414dd`.
- Production runtime: **261/261 backend file hashes matched**; motion and
  handover enabled, paid Routes disabled.
- Apex/www HTTPS roots retain 308 redirects to `https://app.perix.eu/`.

The previous production package was hash-verified and frozen separately as
`rollback-context`, with its exact redeployment command in `rollback.json`.
Do not use the dirty working tree for rollback. No rollback was necessary.

## Validation

- Isolated production candidate: **57 frontend tests passed**.
- Packaged backend: **84 passed, 1 explicitly skipped** (old safe capture not
  packaged in the application image).
- The five existing isolated `CityAdViewer.tsx` type diagnostics remain a known
  baseline caveat; this is not a globally typecheck-clean source claim.
- Live source/archive/served entry hashes were verified, not inferred from
  deployment status alone. No staging API origin remains in the entry bundle.
- Desktop and mobile production browser checks passed anonymous real address
  suggestions/selection, manual-to-live switching with simulated GPS, returning
  to manual selection, and reload with permission granted without restarting
  GPS. The genuine production planner accepted the selected manual origin.
  No runtime exceptions or attempted staging API/paid Routes calls were observed
  in the final passing location-mode runs.
- Real home vehicle-marker click opened the exact live bus 48 vehicle/trip in
  Locator, with a current map focus and upcoming stops. Forty actual home fleet
  markers were present in that captured window; simulated passenger location
  and a browser-only identity fixture were used, without server account writes.
- Live ETA audit: **41 vehicles**, **128 lines**, **12 platform boards**,
  **240 arrival rows**, **7 same-plan/same-occurrence clock comparisons** and
  **no sampled consistency failures**. No zero-ETA row occurred in that window;
  do not claim field verification of zero arrival. First post-deploy map read
  took 18.516s; a subsequent warm read took 2.516s. These are observations, not
  a latency SLA.

Browser location-mode validation uses genuine public place/planner reads and
simulated passenger GPS, with all API writes blocked or analytics fulfilled
locally as a no-op. Production's sampled public-business searches in Magdeburg
and Berlin returned no venue: protected real-account business UI E2E was not
repeated against production, and no production venue was invented. The staged
business UI coverage and live public planner checks are retained separately.
No measured fleet GPS or physical Android/iOS certification is claimed.

## Retained evidence

`C:\Users\PC\AppData\Local\Temp\opencode\perix-live-area-promotion-v2`:

- `preflight.json`, `source-delta-from-live.json`, `production-manifest.json`.
- `production-runtime-verification.json`, `served-artifact-verification.json`.
- `rollback.json`, `rollback-context/` (verified old production source/assets).
- `upload-context/` (frozen new production package).
- `live-eta-audit/`, `home-smoke-result.json`, `browser-desktop/`, `browser-mobile/`.
- Isolated source, build log and production frontend export.

Shared WIP was preserved. Earlier staged backend deltas remain reproducible in
`backend/releases/magdeburg-eta-approach` and `backend/releases/area-selection`.

## Mobility continuity production addendum

- Active `SUCCESS`: `6af7f55d-f6bf-4f04-9ba6-fed9d9dcd4ba`.
- Validated staging: `b5685f8a-a04f-4cd4-9e9c-6556f76476f9`.
- Frontend-only promotion, **264 explicit package files**. The only changed
  package member versus the previous production is `Perix-main/backend/webdist.dat`.
  No backend source, environment, database or island-service changes.
- Static cache/retry and dated canonical joins, independent vehicles-first
  web/native bridge updates, foreground recovery/status, selected-trip refresh,
  exact-ID coincident-vehicle menu, stop metadata/layer/listener fixes and
  one-time initial zoom handling. Existing Home markers, exact Locator focus,
  business directions, shared manual/live origin and ETA/provider separation
  are retained by the isolated source and regression tests.
- **73 isolated frontend tests passed**. Workspace TypeScript passes; isolated
  source retains five existing `CityAdViewer.tsx` diagnostics, not new Mobility
  errors. Native behavior has automated bridge coverage, not physical app QA.
- Production runtime **261/261 hashes matched**; paid Routes disabled.
- Actual served entry: `entry-c7c3809eb6c5ebabdcae922bb2034bfb.js`.
- Entry SHA-256:
  `85c468dbed239b2e42a4e09dd47f5d7c2968c0d4e88dc82e74036e9eacd3b0af`.
- Served map HTML SHA-256:
  `b462d80e3c6867568375da618c1c258f3a2e32c05914b505154e93328629d0ab`.
- Served HTML references that exact entry; entry bytes match the manifest;
  staging API origin is absent. Production Maps config fields were reused
  separately, without changing or printing keys.
- Previous active runtime was hash-verified before promotion; its 264-file
  package and manifest are frozen in the new release's `rollback-context/`.
  `rollback.json` records the wrapper-root redeployment command with explicit
  project/production environment/service. No rollback has been required.
- Read-only production source-window checks at `13:12:21Z` and `13:13:56Z`
  found zero safe missing journeys (57 and 52 active windows, respectively).
  A separate staged held-trip discrepancy remains documented in
  `MOBILITY_CONTINUITY_AUDIT_2026-10-24.md`; it was not copied into production
  or claimed repaired by this frontend release.

Evidence root:
`C:\Users\PC\AppData\Local\Temp\opencode\perix-mobility-continuity-release`:
`production-manifest.json`, `production-runtime-verification.json`,
`served-artifact-verification.json`, `rollback.json`, `rollback-manifest.json`,
`production-upload/`, `rollback-context/`, isolated source and build log.
Real-data session results and field-completeness caveats are recorded in the
continuity audit. Shared WIP is preserved; changes are not committed or pushed.

Final production validation:

- Resilience: three failed map loads recovered; zero pan/zoom line redraws;
  foreground request started in 14ms; update error/recovery visible;
  **70 API / 70 rendered**, zero exceptions.
- Actual coincident tram **4 and 5 were each clicked**, with exact matching
  source vehicle IDs returned by their trip endpoints, no coordinate offsets.
- Mobile 180s / DPR 3 / 4× CPU: **24/24 deliveries**, one static fetch, zero
  missing markers or projection shifts, **12 journey transitions (10 tram)**.
  Initial paths were still loading for the first sample, then all were present;
  one initial geometry draw, no later camera-driven line redraws.
- The first resilience popup attempt timed out; its cause was not established.
  The diagnostic rerun and independent two-vehicle selection passed without
  app changes. Initial loading and failed-attempt evidence are retained, not
  hidden by the final passing results.
- Evidence: `production-resilience/result.json`, `stack-diagnostic.json`,
  `stack-diagnostic.png`; continuity report
  `browser-mobile-2026-10-24T13-13-39-518Z/summary.json`.

No physical GPS/fleet-completeness certification or physical Android/iOS QA
is claimed. The reported particular two later trams were not independently
reproduced; the confirmed loading/overlap/continuity corrections are live.

## Targeted field-report follow-up — source journeys and diversion

Active production: `0adc9837-d717-4694-a10d-686b052ad4d3` (`SUCCESS`), validated
staging `d3e38222-c0d2-4932-8860-2ba571b37279`. Frozen rollback is the previous
264-file production package `6af7f55d-f6bf-4f04-9ba6-fed9d9dcd4ba`.

- Separate source-backed virtual journeys unless the provider explicitly gives
  a common block. Terminus proximity no longer invents shared physical identity
  or suppresses an overlapping active source trip. IDs use the existing
  source-derived function and actual dated trip IDs, not invented GPS vehicles.
- Preserve provider predictions, cancellations, skips, exact dates/versions,
  canonical paths and motion engine. Source-inactive inferred layover anchors
  are not shown for long gaps; existing 60s trip-edge grace remains.
- Expose source/run selection basis. Links to expired inferred-run identities
  may expire rather than being redirected to a different vehicle.
- Display one compact source-linked warning for **13, N3, N5** when their
  imported sequence still contains Jordanstraße despite the operator notice.
  The warning is advisory, not an unverified OSM closure/geometry override.
- **The 13 detour geometry/stop timetable remain unresolved.** Official MVB
  confirms Wiener Straße → Hertzstraße / Raiffeisenstraße / Am Fuchsberg,
  Jordanstraße omitted, and short-notice changes absent from timetables since
  17 October. No exact times or measured locations were fabricated from the
  operator's approximately five-minute journey-time increase.
- **96 backend offline / 77 frontend tests passed**. Two existing Mongo/editor
  integration tests were explicitly excluded after pytest-9 fixture setup
  errors; no claim those integration tests passed. Workspace TypeScript and
  focused warning-component lint passed; known isolated baseline type caveat
  is unchanged.
- Production **264/264 runtime backend hashes matched** the 267-file package;
  paid Routes disabled. Only the six manifest-allowlisted package members
  changed. No database or environment changes and no island-service deployment.
- Actual served entry `entry-72103b86a28ad8cc5995a49f548ce166.js`, SHA-256
  `4aedf351adb8fe6735de26d8db322edc21217b6f731d96d9ae11a1e286e587fd`.
  Served HTML and map HTML verified; no staging API origin in production entry.
- Production warning and exact-source tram-13 selection passed: **56 API / 56
  rendered**, no runtime exceptions or cross-environment Mobility requests.
- First post-release source-window check `16:48:08Z`: **51 active windows,
  zero safe missing journeys**; 56 fleet entries (24 bus / 32 tram). This is
  internal source/model consistency, not physical fleet completeness.

Detailed findings, limitations and reproducible `runtime-delta.patch` are in
`backend/releases/targeted-coverage/README.md`. Runtime backend WIP in the shared
checkout was not overwritten with the isolated deployment source. Release
manifests and browser evidence are retained there and under
`C:\Users\PC\AppData\Local\Temp\opencode\perix-targeted-coverage-release`.

Final production mobile follow-up: 180s / DPR 3 / 4× CPU, 19 API-marker
membership samples, one network fetch, zero missing markers/paths, projection
shifts or runtime exceptions, zero camera-driven line redraws. One near-15s
fetch was aborted/retried; no end-to-end update latency guarantee is claimed.
Second source-window check at `16:52:14Z`: 52 active windows, zero safe missing
journeys. Actual route-13 diversion geometry and the reported physically absent
buses remain unresolved; source/model/render parity is not field truth.

## Small-marker / overview-selection release

Final active `SUCCESS`: **`92095c5c-033d-45b8-b358-3bd2fd4abcac`**.
Validated staging: `739b99c1-18d3-4591-b888-388820dd8193`.

- User-requested size steps in both BusinessMap and the actual Mobility HTML
  renderer. Bus/Tram CSS px measured at zoom 11: **22/28**, 14: **28/36**,
  17: **33/43**, 19: **39/50**, in a 390×844 / DPR-3 mobile viewport.
- Overview collision groups use genuine payload IDs and centered count targets;
  selection appears in a bounded sheet away from area/location/zoom controls.
  Original vehicle markers, positions, headings, SVG artwork and canonical
  progress targeting remain intact. Exact stationary close-zoom stacks remain.
- Newly created Mobility markers retain their current scale on heading polls.
- **86 isolated frontend tests passed**, workspace TypeScript and focused
  grouping-test lint passed. Known isolated baseline type caveat is unchanged.
- **267 manifest files**, with only `Perix-main/backend/webdist.dat` changed.
  Backend code/configuration, ETA, GTFS, OSM, traffic and Routes are unchanged;
  no database/environment changes. All **264 runtime backend file hashes**
  match the new manifest; paid Routes remain disabled.
- Served entry: `entry-7cf9493e6aa97eadf4a09de78a5ea0dd.js`, SHA-256
  `bdaec258e9fef60a133200996c2b077dde519452dc714443cdda74b99a23c7d4`.
- Served map HTML SHA-256:
  `33c82c91bf617ca8f9ba86d4d04ac85c9b97d45847b546bed3e69f0deae6c32a`.
  Actual served bytes verified, no staging origin in the production entry.
- Final production four-zoom session: **8/8 exact-ID taps**, same marker
  instances and no sampled canonical drift or runtime exception. Separate
  real overview test: **45 source entries**, **38-member non-coincident group**,
  individually selected bus 46 and tram 10; 184px scrollable content bounded
  outside parent controls, anchor error 0m, one map read, no line redraw or
  vehicle recreation on zoom to 14. No API mutations.
- Intermediate frontend releases `2028275d-ba04-458a-b038-711020082c53` and
  `4a74b592-b157-40d8-a418-0f0d9dcc88ec` exposed and refined selection/control
  overlaps; their failed diagnostics and intermediate artifacts are retained.
  They are not claimed as fully passing final versions.

Rollback `0adc9837-d717-4694-a10d-686b052ad4d3` is frozen and hash-verified with
its 267-file wrapper and explicit redeploy command. Unrelated BusinessMap and
backend WIP were excluded, preserved, and not committed/pushed. Details and
source delta: `frontend/releases/small-markers/README.md`; complete local
artifact/evidence: `C:\Users\PC\AppData\Local\Temp\opencode\perix-small-markers-release`.

These are browser-emulation/render checks, not physical-device or real fleet
coverage certification. The earlier route-13 diversion/data limitations remain
unchanged; this visual release does not implement new update/detour monitoring.

Additional final overview stress retry: 90s / DPR 3 / 4× CPU, 12 API-marker
membership samples, one map read, no missing markers/paths, projection shifts,
incomplete deliveries or runtime exceptions, and no camera-driven line redraw.
An earlier startup-readiness timeout is retained as failed with unknown cause;
the successful diagnostic retry did not require application changes. Details
and evidence are in the small-markers release README and final validation JSON.
