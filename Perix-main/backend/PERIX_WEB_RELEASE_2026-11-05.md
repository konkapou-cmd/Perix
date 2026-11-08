# PERIX cumulative web release — 2026-11-05

## v14 — origin-first App loading

- Live deployment: `794ce06f-6e3d-4ba9-8fb5-b33c874ba876`, Railway **SUCCESS**.
- Source SHA `a3bdc1e49d09319ecae42273779ce13fb7c5d057654531d6127f27dc62616d35`;
  runtime SHA `4541f01ee9a89ca28e5265f22a71e300443678e663e82aa08c9f1d6c2e1d86c3`.
- Entry `entry-e5aa204f6a204ef2d6da788ca9d24d0b.js`, SHA
  `9da376f4706d4d9362a7d9e2f726f676c9bd3b68ef2318d7e7076659dc8b70ad`.
- Frozen v13 base source `1d793a22d213abba73790d13d862d36b8bcfc32d5896b8e758adf7a744aa882a`;
  798 source files and only 14 explicit frontend/translation/test overlays.
  Backend bytes, lock/package files, `.npmrc` and vendored dependencies are
  identical to v13. Runtime differs from v13 only at `backend/webdist.dat`.
- `/app` now shows an origin gate before mounting the map or starting catalogue,
  stop, vehicle or route-map reads. The user must explicitly request live location
  or select a coordinate-bearing address suggestion; typed text alone is not used
  as an origin. After confirmation, `/mobility/v2/stops` is requested first; up to
  three nearest physical stops/boarding platforms and their current departure
  cards render before full route geometry, fleet and directory reads start.
- The rendered route layer, transit stop pins and bus/tram markers are limited to
  modes/routes serving those nearest stops. A green vehicle-to-stop approach
  segment uses only a READY visual publication, matching dated pattern and exact
  geometry identity, forward progress and the server-reported next stop. It fails
  closed when those data do not agree; it does not draw an invented straight line.
  Vehicle marker animation continues to use the existing bounded preview.
- Map/timetable details use the compact disclosure from the prior UI update; OSM
  contributor credit remains visible on the map. The destination field remains
  available after the origin is set.
- **Important speed limit:** the current `/mobility/v2/stops` API still sends the
  full stop catalogue, and `/mobility/v2/map` still computes the full route map;
  route filtering here is client-side presentation. A fresh single browser
  observation of `/stops` after address selection was 8.078s. This is not a
  controlled benchmark or p95. The earlier v13 single `/map` observation was
  24.766s. True server-side nearest-three/route-only loading requires a new bounded
  endpoint/precomputed spatial index and separate cold/warm latency testing.
- Validation: **223/223 frontend tests**, TypeScript, production-origin web export.
  Deployed entry origin and hash verified. Production verification matched
  **185/185 runtime files**, one Uvicorn process, initial DB environment unchanged;
  no production flags were changed. Browser check on the live `/app` confirmed the
  location gate, no map, and zero Mobility API requests before location selection.
- Public sequential GET check passed: `/app`, `/locator`, the exact JS entry/hash,
  networks, three fleet samples, full map, stops, source notice and one arrivals
  endpoint all returned HTTP 200. Fleet samples had 90/90 READY, 89/90 READY
  (one PENDING), then 89/89 READY. Map: 342 certified lines, 297 physical
  stops and 751 platforms; dated map/stops matched. One matching-board row was
  **not** found in this sample. Timings: entry 12.422s, vehicles 5.844/9.250/
  12.047s, map 40.079s, stops 4.422s, arrivals 11.594s. These are sequential
  observations, not a capacity test or latency SLO; no high-concurrency test ran.
- No backend runtime/API change, commit/push, native/OTA build, provider activation,
  database maintenance, or location request was performed as part of deployment.

Private v14 evidence:
`C:\Users\PC\AppData\Local\Temp\opencode\perix-web-production-20261106-v14-origin-first`.

## v13 — focused navigation/data-ui follow-up

- Live deployment: `3e0b13f4-17e0-40be-b727-4e76338dca0e`, Railway **SUCCESS**.
- Source `1d793a22d213abba73790d13d862d36b8bcfc32d5896b8e758adf7a744aa882a`;
  runtime `8409639678ba748b31c3d2f7eb1e2581b98e503cf5d3c06e811952e2d444f3b9`.
- Entry `entry-5dedb2c6746ffe7d25971bfe9d0a24d3.js`, SHA
  `e1ac692f58bac4a9400b31707bfb23042f65da5618d3c9dfe15b4522538e6b9b`.
- Source798files, incrementally extends verified live v12 source
  `1ae30649aa7a64181b8c3f55fd2bfe930db64920541a5efe8895755f6c7e671b`.
  Backend source337files byte-identical to v12; package/lock/vendor dependencies
  unchanged. Runtime changed **only `backend/webdist.dat`** from v12.
- Web-only diff: transparent App/Members/Explore buttons (active sky-blue text,
  inactive navy), overlay Locator category sidebar (underlying map retains full
  bounds), no auto nearby-stop/departure rows under Home/Locator maps, collapsed
  in-area Nearby panel at App root only; selecting a stop shows its actual full
  place/platform programme in the below-map slot, closable back to collapsed list.
  Search and selected cards place Go below the map; map-point marker is the
  original PERIX compass artwork. Public Services is the first/selected-blue App
  category and the root result source is limited to current verified public
  services; other existing category tiles remain selectable. App cards/background
  and Login background are white, App category/results surfaces are flat, event
  accent is orange-red. Home and Locator selectors no longer show the automatic
  below-map stop lists. Existing App search/planner, transit physics/ETA, moving
  map pins and providers were not replaced.
- App/Locator read the same public `/mobility/v2/map` snapshot: shared in-flight
  request plus four-minute in-memory cache, force-refresh for missing geometry,
  no storage persistence. `/stops` derives from that same map payload. This avoids
  duplicate catalogue GET/build work on tab changes; normal five-minute map safety
  refresh remains. No backend changes.
- Public-service source caveat: current verified backend taxonomy/docs cover civic
  service records; it does **not** establish coverage or category identifiers for
  public parks, plazas or outdoor sports. App does not invent those records or
  claim they are already present. A licensed/verified spatial POI source and
  backend taxonomy/import work are still needed to populate that scope.

### Verification and remaining limits

- **220/220 frontend tests**, TypeScript and exact production-origin Expo web build.
- Exact backend SHA equality reuses the previous **22 supervised disposable
  Mongo/four-worker HTTP** tests and **297 selected offline backend /1 skipped**
  validation; these are exact unchanged backend bytes, not claimed as fresh reruns.
- Fresh production npm audit remains applicable by unchanged dependency lock from
  v12 (0 known advisories); no packages added.
- Upload status SUCCESS; identity-guarded verification **185/185 backend runtime
  files matched**, one Uvicorn process, initial DB environment matched, no settings
  changed. Recovery archive is the code runtime, not a database/volume backup.
- Sequential low-rate public `/app`/`/locator`, JS hash, networks, cycles/map/stops
  and matching-board check is running/pending; do not claim pass until reported.
- Browser/mobile emulation is not a physical phone/native build. No full signed-in
  Home test, app background positioning, high-concurrency/cold-start SLO or 800ms
  p95 evidence. The previously observed fleet read timeout remains a known latency
  risk; this release does not claim to fix it.
- No commit, push, native/OTA build, paid-provider/API activation, GPS/navigation
  engine, production DB restart/restore, manual import or source-clock rewrite.

Private release evidence:
`C:\Users\PC\AppData\Local\Temp\opencode\perix-web-production-20261105-v13-release-final`.

User explicitly authorized deployment of completed work so far. Scope is the
existing web site at https://app.perix.eu, not native/OTA builds, provider
activation, git commit/push or production database maintenance.

## Deployment identity

Frontend-only direct-entry translation follow-up is now the retained live
deployment `6d89548a-ee6f-406c-811d-f22d51309e8e`, **SUCCESS**. Its source is
`1ae30649aa7a64181b8c3f55fd2bfe930db64920541a5efe8895755f6c7e671b`, runtime
`066b7c9dbdd24f853b398c38014a46b3bbd6873ffad938149aceb247bac09a99`, entry
`entry-76aa09aca44e636afa6ce8e56630646d.js` (SHA
`47a7e7dd4f533a79f83a95b950dc1814811636f18dd071f001b13b2adcb51fb2`).
Only webdist differs from the verified deployed runtime below. Exact follow-up
source passed206frontend tests, TypeScript and production export; backend/source
dependency bytes remain identical. Actual185/185 runtime files matched, one
Uvicorn process, matching initial environment and zero settings changes.

Final low-rate public checks passed: /app, /locator, exact entry SHA, networks,
three station-cycle fleets, map/stops/source notice and same-trip arrival board.
Fleet samples58/58/58 estimates allREADY,5.500/2.860/5.610s; map6.047s;
342certified dated geometry records (not342active services),297physical places,
751unique platforms, matching dated map/stop service. Declared policy30s parked/
50s approach checked; provider clocks and non-GPS semantics unchanged.
First final-page/entry observations were9.953/8.078/20.766s; these are individual
uncached/network observations, NOT acceptable cold-start/SLO guarantees.
Final direct-Locator/Google browser audit **passed**:9real preview cases across
320/375/430px, walking/transit/driving, real Google content and HTTP200, white
borderless frame, APP/Members palette, no horizontal overflow, no preview request
before Go and unchanged main map after close. Direct Locator header correctly
shows `Magdeburg, Γερμανία` without raw `ui.country`. That direct-entry screenshot
was taken after map-container initialization, not after all tiles/fleet completed;
do not treat its initial grey map/empty fleet as full live Locator rendering proof.
Loaded Google route screenshots are the walking/transit/driving files.
Evidence: `live-google-preview-1793902382393` in final label-release directory.
Published manifest and all4PWA icons also matched the exact release hashes.
Final identity/settings/source recheck confirms6d89548a SUCCESS/live, unchanged
source and all unrelated settings preserved. No rollback or duplicate upload.

The following identity describes the initial cumulative deployment:

- New deployment: `e4201cf4-d4ed-4a3f-98c7-1232cd93e341`, Railway **SUCCESS**.
- Previous live: `9f0bb5e4-aeaf-448b-8036-67bf66b722b8` (v10).
- Project/environment/service identity verified by existing release guard.
- Source: `820b30854d744581554f5dac3de212e71ad411f9ba94641a423e55196df7ab7c`.
- Runtime: `61e500b9566a67043398f76a849b91ac4a038ea071dce6ae10390069c86c14fe`.
- Entry: `entry-33a6a7e726c0610c0ed276de066a6a7d.js`.
- Entry SHA: `b58cd69d0245cae63458ee07b16be37fa453b8ac71001d5eab4b030c9f586d82`.
- All185 actual backend/webdist runtime files matched; Python3.11.18, one
  Uvicorn app process and matching initial environment. Zero flags changed;
  all unrelated production setting hashes preserved.

## Included completed features

- Same-row centered APP/Members header, original localized Perix artwork,
  bounded long user/area labels and common white layout/16px gutters.
- Shared map-base selection, explicit manual/live origin separation,
  existing destination search and PERIX planner/route overlay.
- Compact nearby stop cards and expandable departures, countdown-through-read-
  failure/zero retirement, stationary tram symbol queues and vehicle details.
- Approved `station-cycle-v2`: parked by known departure minus30s, approach
  lead50s, gradual departure at known zero. Provider source times unchanged;
  unknown conditional releases are not timer-unlocked. Legacy v1 retained.
- Updated PWA install banner/help/original-wordmark icons.
- Google Maps Embed directions preview, opened only by localized Go/Πήγαινε:
  Walking/Transit/Driving, explicit origin/destination, white borderless
  exterior and APP/Members pill palette, external Google Maps link.

Google preview is not live navigation and does not provide route/ETA JSON to
PERIX. It calculates its own route and can differ from PERIX transit directions.
No Valhalla/OSRM/MapLibre or SIRI/InfraNode runtime was activated.

## Immutable assembly and validation

Final795-file source extends frozen v11 by explicit frontend/runtime/test
overlays and reviewed backend function substitutions. The v10 physical
estimator tail, physical publication-refresh function and bus/tram/common/
engine files remain unchanged. Full mixed backend WIP was NOT promoted.
Frozen v11 remains766files with unchanged SHA
`de1cbbb2bace398e32b69cf13440cd057b232de2c4ae64f94ec367972936b301`.

- Exact final source:205 frontend tests passed; TypeScript passed.
- Exact final source:297 offline backend tests passed /1 skipped.
-22 supervised disposable Mongo7.0.45/four-worker HTTP tests passed. This
  evidence was reused for final only after comparing ALL337 backend source
  hashes with the tested first candidate. Native frontend-only correction
  does not change backend bytes; reuse is explicitly labeled, not a fresh run.
- Final frontend accepted113 actual synthetic HTTP packets, including12
  station-cycle packets,12 legacy endpoints and3000 stationary last30s samples.
  Client clock bridge is simulated, not live GPS/hosted timing evidence.
- Exact production-origin web export passed with dotenv disabled. Browser key
  was resolved only from existing public production configuration/verified
  public entry; local and production browser keys were confirmed equal without
  logging either value. No server/provider secret was used as a fallback.
- Dependencies reused by exact package/lock/npmrc/vendor identity comparison,
  not claimed as fresh npm ci. Fresh production npm audit:0 known vulnerabilities.
- Tests, release-control files, diagnostic artifacts and .env/secrets excluded
  from uploaded runtime. All source hashes unchanged after tests/build/package.

First preparation attempt is preserved separately: its source omitted the
updated VisualTransitMarker.native.tsx required by the queued native map
counterpart. Final candidate includes that EXISTING WIP file; no application
logic was altered to weaken the failing TypeScript/test checks. The initial
offline runner also overblocked Windows asyncio's internal socketpair; final
runner allows ONLY that same-thread internal pair, not arbitrary network/DB
connections. Initial attempt was never deployed.

## Recovery and remaining verification

Actual previous runtime captured read-only before upload:184files, archive SHA
`281dfb44545b35f5496123ef0cfe0db959785e327a49874a1856fe4b9e3c5d62`.
This is a code rollback artifact, NOT a full database/volume backup. No Mongo
restart, restore, drop, manual source import or provider clock rewrite occurred.
Existing application workers retain their normal ingestion behavior.

Live Google preview/browser audit passed all9 cases on the initial deployment:
walking/transit/driving at320/375/430px, real Google frames/HTTP200, white/borderless
exterior, APP/Members colour equality, no horizontal overflow and unchanged main
map after close. Zero Embed requests before Go. Evidence is under
`live-google-preview-1793901324886` in the initial v12-final evidence directory.

Initial station-cycle public check failed: first fleet15.344s followed by a90s
ReadTimeout while parallel diagnostic browser polling was active. The actual
Locator browser also observed12.145s then its normal15s timeout. Server logs had
Starlette `No response returned` after disconnects; this is NOT a proven root
cause or a fixed performance claim. Owned diagnostic polling tabs were stopped.
One serial read then passed in4.797s with66READY previews. A full sequential
retry passed:66/66/68 estimates allREADY, fleet5.421/3.234/6.640s, map5.968s,
297physical stops/751unique platforms and same-trip board row found. All previews
declared30s stop/50s approach; known nonlimited dwell>=30s, source clocks preserved.
The timeout remains recorded. Warm low-rate success is NOT cold-start/concurrency
or800ms p95 proof. No timeout widening, clock extrapolation or backend fix was
used to make the repeated check pass; underlying latency risk remains.

Direct Locator entry revealed raw `ui.country`: city namespace was installed
only when Gateway/other city components loaded. Existing header now imports the
existing namespace installer directly; one regression added. This is the ONLY
runtime-code change in the follow-up, not a transit-performance correction.
The CLI upload returned a timeout but Railway had already accepted it and was
BUILDING; serving runtime was still the healthy initial deployment. No duplicate
upload/retry was submitted. Identity-checked monitor follows the accepted job.

Physical phone/installed Google Maps handoff, private authenticated full Home,
Am Fuchsberg geographic approach and high-concurrency/800ms p95 remain unproved.

Evidence root (private, outside upload/Git):
`C:\Users\PC\AppData\Local\Temp\opencode\perix-web-production-20261105-v12-final`.
Frontend-only follow-up evidence:
`C:\Users\PC\AppData\Local\Temp\opencode\perix-web-production-20261105-v12-label-final`.
Runtime manifest, assembly-review, supervised-backend-reuse, offline-backend-
tests, build-result, dependency audit, settings-before, deployment history and
production-runtime-verification identify the exact candidate and outcome.
Final status is recorded in the follow-up's `final-production-status.json`.
