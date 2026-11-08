# PERIX web production release — 2026-11-03

**Latest cumulative release (2026-11-05):** v12 with frontend direct-entry
translation follow-up, deployment `6d89548a-ee6f-406c-811d-f22d51309e8e`, SUCCESS/live.
185/185actual runtime files matched and zero settings changed. Includes completed
site/nearby/countdown/queue/vehicle-details/PWA/Google mini-preview and30s station
policy, excluding mixed physical-backend WIP/provider trials. See
`PERIX_WEB_RELEASE_2026-11-05.md` for exact source/runtime hashes,206frontend tests,
297offline backend /1skip,22byte-matched supervised tests and public checks.
The v10 release below is historical, not the latest serving version.

**Previous forward follow-up:** v10 (2026-11-04), deployment
`9f0bb5e4-aeaf-448b-8036-67bf66b722b8`, was SUCCESS and retained until v12. See
`MAGDEBURG_VISUAL_CONTINUITY_2026-11-03.md` for pan/zoom continuity, continuous
turning, dated station service/naming, shared station waiting, versioned
multi-occurrence coverage and the separate server-clock bridge correction. The reported
Am Fuchsberg inverse-travel incident remains explicitly unverified; it is not
claimed solved by successful animation tests. Earlier attempts below are
historical, not the current deployed candidate.

## v10 — stable network, readiness measurement and initial-arrival priority

- Previous v9 remained serving during preparation. User explicitly approved the
  complete implementation, tests and online promotion. No precautionary rollback.
- Final source SHA-256:
  `59792a4ed52b07a2f6ead8ec613da4360d8e87afb710f75dc2cf36010073daa4`.
  Runtime SHA-256:
  `aff78bc67ad8d154fb8f41f527275bece4f90f543eaff5743c1d564ef8d69521`.
- Entry `entry-71c25610ed2f1b3db7fe28510a70ae20.js`, SHA-256
  `3f4b05b2ac3f909bf3b5dbe001480e22a1002d1dd2a147fa9cff337c123e21d3`.
- Final immutable package extends v9 by reviewed file/function overlays. Mixed
  physical-continuation WIP is excluded; bus.py/tram.py/common.py and the physical
  estimate/publication tails retain their production bytes.
- Exact frozen-source checks: **233 backend passed / 1 skipped**, **104 frontend
  passed**, TypeScript and production web export passed. **21 supervised real
  four-worker Mongo/HTTP tests passed** (117.85 s); five release-operation guards
  passed. Dependency package/lock/vendor hashes match v9's verified clean install;
  it was reused, not relabeled as another npm ci. Fresh production npm audit:
  **0 vulnerabilities** (not a blanket security certification).
- An operational initial budget was deliberately excluded from optical profile
  signatures. A cross-configuration cold-cache regression verifies that accepted
  v9 shared anchors remain usable rather than hiding every existing journey.
- Fresh read-only transit capture: today's `net_499c8533a74b`, 171 ready
  generations. Exact BSON restore/export matched all 171 locally. One first
  full/full replay crossed realtime freshness during its captured-only run
  (83 then 3 estimates); it is not presented as a warm-performance benchmark or
  fresh-source continuity proof. A separate naturally stale-first restore then
  tested the bootstrap flow: **23 READY in 4.000 s**, followed by **80 READY in
  5.828 s** on the normal poll. No provider clocks were mocked or rewritten.
- Deployment reached SUCCESS; **185/185 actual runtime files matched**, one
  Uvicorn process, matching initial environment. Zero flags changed and unrelated
  setting hashes remained unchanged through final live verification.
- Public checks: both pages/new-entry hash, networks, versioned fleet curves,
  source notice, matching map/stops service and same-trip arrival row passed.
  Three normal fleet reads showed **83/83 READY**, 6.938 / 3.515 / 3.891 s;
  48/47/45 multi-occurrence publications. Initial cold map read was **23.078 s**:
  do not claim a fast-map SLO from successful readiness checks.
- Map's initial 344 certified records include **171 current + 173 previous-day
  background geometries**, not 344 active current-day lines. Rendering deduplicates
  identical geometry only; dated metadata remains available for vehicle authority.
- The normal GTFS import—not a manual synthetic import—populated the complete
  existing provider inventory. Latest read-only check: **297 physical places /
  751 unique platforms**. Hasselbachplatz has **9** available platforms, including
  bus platform `399723` without today's service. No arrival/vehicle was fabricated
  for that dormant platform. Earlier 291/685 and 8-platform figures describe the
  old day-only inventory before this normal hydration.
- Browser /app: initial fleet/map starts both 1637 ms, one initial map read;
  marker application 19115.7 ms and following visible frame 19175 ms. The applied
  sample was only **1961.845 ms old**, with **43038.155 ms** of coverage left.
  This directly distinguishes total page wait from sample age; no extra 19 s
  position offset was applied. At Hasselbachplatz all original eight platform
  nodes/coordinates rendered; selecting `104971` fetched its exact platform
  arrivals and displayed source HH:mm plus age-adjusted minutes in the inline
  panel. Motion: 18/25 sampled SVG images moved, 41 intervals without a new fleet
  receipt over 120 frames / 1.988 s; no captured console errors.
- Browser Locator: initial fleet/map starts both 1309 ms, one initial map read;
  first following-frame metric **21907.6 ms**, applied sample age **3829.185 ms**,
  remaining coverage **41170.815 ms**. Motion: 79/87 sampled images moved, 67
  intervals without a new fleet receipt over 69 frames / 6.037 s. An ordinary
  zoom-out revealed all **nine** Hasselbachplatz platform nodes, including the
  newly retained dormant boarding location; no captured console errors.
- Review-created tabs were closed and temporary observers removed; unrelated
  user/review tabs were not modified. No production Mongo restart/move/restore,
  paid-provider activation, native/OTA release or manual source-data alteration.

Browser figures are individual cached-asset observations, not phone cold-start
averages, exact GPU paint times, measured vehicle/GPS accuracy, FPS guarantees or
800 ms p95/high-concurrency capacity proof. The first work budget is best-effort
and does not forcibly interrupt a single expensive fit. First-frame instrumentation
and the 15 s reserve never authorize extrapolation or extend a real trip end.

Private evidence:
`C:\Users\PC\AppData\Local\Temp\opencode\perix-web-production-20261104-v10-final`.

## v9 deployed and retained live

- Previous serving v6 was retained throughout preparation; no precautionary
  rollback or production database restart/restore accompanied this release.
- Source: `7cec167d27a88ad82155c44e67e99b4f77cf9789a46ded72216d478e034402a8`.
- Runtime: `aaafb8d521985e00c1e3da414edbaec2a6726e78a2813c63871795bd7fd2529c`.
- Entry: `entry-bd92222a58877e500b8e77e5c6324639.js`, SHA-256
  `320f11704d22e42a7e9b63921ac2bf6bbf2e5af80f620cef2e4e79fcb1c056e5`.
- Exact frozen-source validation: **221 backend passed / 1 skipped**, **93
  frontend passed**, **21 supervised real four-worker Mongo/HTTP tests passed**;
  five offline release-operation guard tests passed. TypeScript, fresh `npm ci`
  and production web export passed; fresh npm audit reported **0 vulnerabilities**.
- Captured-transit local restore/export verified all 173 captured generations:
  47 visible schedule-only estimates, 22.016 s cold / 2.109 s next read. This is
  not a hosted performance or fresh realtime accuracy claim.
- **185/185 actual runtime files matched**, Python 3.11.18, one Uvicorn process,
  matching initial environment. Configuration guard changed **zero flags**;
  unrelated variable hashes remained unchanged through final verification.
- Public checks returned 200 for both web pages, exact new JS, networks, three
  versioned fleet reads, map, stops, sources and a matching arrival-board row.
  Fleets had **45/44/43 estimates, all READY**; durations **2.688/3.547/2.187 s**.
  **28/28/27** publications covered multiple stop occurrences. Most windows
  covered 45 s; remaining source-authorized trip-end windows were not extended.
- Live map: **173/173 certified lines, 291 physical stops, 685 unique platforms**;
  `/map` and `/stops` dated service matched, with no duplicate physical/platform
  IDs. Arrival source clocks and non-GPS/false-assurance/null-speed semantics
  remained explicit. No registered GPS vehicle was present in these samples.
- Browser `/app`: verified new entry, fleet/map starts 2607/2608 ms and one
  initial map read; three marker images moved over 120 frames, including 23
  movement intervals without a new fleet receipt. No captured console errors.
- Browser Locator: verified new entry, fleet/map starts 1709/1710 ms and one
  initial map read. In its visible map, 37 images moved during the bounded
  15-frame / 6.286 s sample, including 13 intervals without a new fleet receipt.
  Recent request capture showed no overlaps, no failed mobility reads or console
  errors, and a 2035 ms minimum response-to-next-start gap. Background/uninitialized
  DOM samples were not counted as motion evidence or first-visible timing.
- Review-created tabs were closed and temporary DOM observers disconnected.
  Existing unrelated user/review tabs were not closed or modified.
- Final identity check: v9 remained SUCCESS/live; all unrelated settings hashes
  still matched. No native/OTA release, paid-provider activation, manual source
  data mutation, Mongo restart/move or synthetic production import occurred.

The large production OSM export was not downloaded again; its unchanged
implementation and exact captured-data export were checked locally. Individual
browser/HTTP observations are not phone cold-start averages, frame-rate promises
or 800 ms p95/high-concurrency capacity proof. Private release/runtime/public/
browser evidence is under
`C:\Users\PC\AppData\Local\Temp\opencode\perix-web-production-20261103-v9`.

## Scope and immutable candidate

The user approved publishing the **webapp**, not an APK/IPA, native binary or
OTA release. Canonical origin: <https://app.perix.eu>. No native publication,
paid provider activation, MongoDB restart/move or synthetic production import
is authorized by this release.

- Frozen source v3: `82440cf12a8206ad9a42a70bec642bb4d628038ed3cf32f3f961a64f85a1e9db`.
- Runtime: `27b5ef5c014684cdcc013c61dca0001f16801311335de4512b104bb01f134591`.
- Frontend: `entry-8430ba402b953bfdb2d830db83e1f2e5.js`, SHA-256
  `542e34fe4f2f663e1abaf06b89de419687bf68ee64704d38f65289f7431591bc`.
- v2 changes only cache idle expiry/template reuse and associated lifetime
  tests versus frozen v1. The frontend source hashes are identical; its
  production-origin build was reused only after exact hash comparison.
- v3 changes only the exact Railway healthcheck host/path HTTPS redirect
  exception and tests. Browser HTTPS enforcement is retained. It forwards to
  the actual JSON handler, including errors, rather than fabricating readiness.
- The browser map key was recovered only from the verified, publicly served
  previous production JS, not from a server-side provider key.
- Non-task production bytes were preserved, including EOL-only differences
  and the extra `backend/tools/build_osm_source.py`.

## Functional evidence

- Final v3 offline backend selection: **292 passed, 1 skipped**, including
  seven tests of exact healthcheck exception, failure propagation and retained
  HTTPS redirects for other hosts/paths.
- Final v2 actual V2/four-worker isolated HTTP suite: **19 passed**, 117.51 s;
  disposable MongoDB 7.0.45, verified PID/loopback/path/hash, restart persistence.
  This v2 evidence is reused for unchanged motion logic; not mislabeled as a
  fresh v3 four-worker run.
- Frontend: **73 tests passed**, TypeScript passed; production web export passed.
- Security parent: full/production npm audit and independent canonical-name
  probe found **0 advisories**. This is not a blanket security certification.
  Expo 54 and private compatibility adapters/backport remain maintenance work.
- Exact BSON restore of captured real transit model passed. v2 full-fleet
  samples: **22.890 s cold / 2.860 s next call**, 85 estimates (29 bus, 56 tram).
  Captured RT was stale: results explicitly reported `SCHEDULE_ONLY`.
- Actual source notice/allowlisted OSM export matched **173 generations** in
  the restored dataset. No users, GPS/driver/session/business data were copied.

Pins remain `TIME_NORMALIZED_VISUAL_ESTIMATE`, not observed GPS; physical speed
assurance and observed arrival are false, speed is null. Arrival/departure
clocks remain source-owned. ETA zero completes the visual estimate only.
Unknown/incompatible authority hides the pin; shared Mongo CAS authority has
no worker-local fallback. Static topology/traffic shape curves, not a diagnosis
of red lights/congestion; density and rush-hour dwell are not claimed.

## Production settings and recovery boundary

Before activation, both `MOBILITY_VISUAL_PROGRESS_ENABLED` and
`MOBILITY_VISUAL_PREWARM_ON_STARTUP` were absent. Activation captures those
before-values and hashes all unrelated settings before setting only these two
flags to true with deployment triggering disabled. Existing importers,
auto-activation, Mongo endpoint/name and paid-provider settings are preserved.
Prewarm runs before ASGI startup completes. Readiness is the actual
`/api/mobility/v2/networks` JSON endpoint, timeout 300 s, not the SPA fallback.

Previous live deployment: `b701b1f8-c50c-4fef-a97d-0fc5f710c58d`.
Private old-code ZIP: 175 files, SHA-256
`0d41d2011530c4ca60ba4be235695ad492c7fc4c8e3312fd0746382ac8a61b57`.
Private transit-model ZIP SHA-256:
`947612371fe64da665811cd0f52c7e031aad3c3ae9ae6d84afec41fc919c68de`.
These are private local artifacts, excluded from source/public runtime uploads.
The transit snapshot is **not** a transactional whole-DB/full-volume backup.

`tools/visual_production_release.py` guards target identity, immutable runtime
bytes, before-values and unrelated-setting hashes for configuration, upload,
runtime verification and rollback. Rollback first restores flag behavior with
skip-deploy, then uploads captured previous bytes. Railway variable deletion
has no skip-deploy option, so absent-key cleanup is deferred until the old
runtime is verified live; null before-values are not silently forgotten.

Production has existing root directory `/Perix-main`; the upload wrapper
preserves that setting and contains the exact runtime under that directory.
It also exposes the same `railway.json` at archive root for Railway's config
discovery. Wrapper hashes are separately recorded.

## Rollout attempts and remaining limitations

- `ff19b77b-fb27-4a47-8708-ad99cc93f682`: upload timeout, FAILED, no associated
  build. No new runtime activation.
- `09ca9185-2e7c-4be2-8ef7-70f6efbc93ae`: failed before runtime because the
  initial upload lacked production's existing `/Perix-main` directory.
  Corrected upload layout without changing candidate bytes or service settings.
- `bf36fc6f-58a9-418e-8729-fcbf6053c5b5`: built and prewarmed 81 estimates,
  but did not take public traffic: internal HTTP healthcheck received HTTPS
  redirect 308 and Railway correctly retained the previous deployment. Its
  ordinary production workers ran during the healthcheck window (including
  unchanged GTFS reuse and normal realtime ingestion). No Mongo restart or
  destructive data operation occurred. v3 exempts only GET/HEAD to the public
  networks route for documented host `healthcheck.railway.app`.
- `8974e8c1-c87a-4fd9-84ea-a14c2db25d0a`: v3 reached SUCCESS, prewarmed 90
  estimates and passed JSON healthcheck. **184/184 actual backend runtime files
  matched**, one Uvicorn process, initial environment matched and all unrelated
  setting hashes remained unchanged.
- Low-rate public checks all returned 200: frontend entry hash/origin matched,
  173/173 map lines valid, source notice and OSM export available. The export
  included 359 current journey-window generations (82,847,595 JSON bytes).
  Three fleet observations were 7.235 / 3.078 / 9.078 s, 88–90 estimates,
  70–85 READY and 3–18 PENDING publications. All had explicit
  `TRIP_CLOCK_UNKNOWN` (feed-level data does not establish a per-trip timestamp),
  not a fabricated fresh trip clock. No registered GPS vehicle was present;
  live GPS separation is not claimed as an observed production test.
- Follow-up actual same-trip board check matched trip instance, source target
  **13:59**, and visual revision between fleet/board, with observed arrival
  false. Trip details returned successfully.
- Both ordinary browser pages rendered the new entry and visible source
  notices, with only production mobility API origin and no captured console
  errors. **That was not sufficient to accept the release.**
- Browser Locator showed only two marker syncs at ~120 s while fleet requests
  repeatedly took >4 s (many reached the 15 s client timeout). Its code starts
  a request every 4 s but accepts a response only if its sequence remains the
  newest. This can starve UI updates permanently when latency exceeds the poll
  interval. No sampled marker parent changed position over 40 animation frames;
  this is supporting evidence, not proof every vehicle should always move.
- The release was **rejected after browser validation** and rollback completed.
  Review-created production tabs were navigated away to stop their polling.
  Rollback deployment **`ac058a99-a62a-43f8-9e5b-369ac88843eb`**, SUCCESS.
  **175/175 captured production runtime files matched**, one Uvicorn process,
  matching initial environment and no unrelated setting-hash changes.
- Public rollback checks passed: `/app`, `/locator?tab=mobility`, actual old JS,
  networks JSON and fleet JSON all returned 200. Old entry SHA-256 matched
  `1e64dd9bfd57ea46ca2015e4011633025d2e992194528a464cfc48b9bb7611c5`.
  The original estimate behavior was restored (95 estimates in the low-rate
  check, 13.578 s). This is not a claim that the old version meets the new
  performance target or has the remediated dependency package.
- Both activation flags are now explicitly **false**, restoring their original
  absent/default-disabled behavior. They were originally absent, not literally
  set to false: exact unset-key cleanup remains deferred to avoid Railway's
  automatic variable-deletion redeploys. The before-values remain captured.
  No Mongo restart, database restore, source clock rewrite or synthetic import
  was performed. Shared visual state created during the attempted release is
  not deleted; it retains its existing 48-hour TTL.

## Release blocker, not waived by API smoke

Do not announce the new transit animation or dependency package as successfully
published. First fix overlapping-poll starvation (single-flight/serialized
polling with explicit stale-response handling) and establish actual hosted
latency/fresh-preview behavior for ordinary web usage. Repeat real browser
movement checks before a new rollout. Do not mask this with extrapolation,
longer invented source clocks, stale preview extension or GPS/arrival claims.

The proposed **800 ms p95** fleet target and high-concurrency capacity are
**not established**. There is no 150-client production load test. Cold generation
must be protected by prewarm. Low-rate public checks are smoke observations,
not an SLO/capacity waiver. Production MongoDB is 8.0.34 versus local 7.0.45.
Full app/volume backup retention and recovery are unproved; no database move,
mount, restart or destructive restore is part of this web release.

Evidence directories (private, outside Git/runtime):

- `C:\Users\PC\AppData\Local\Temp\opencode\perix-web-production-20261103-v1`
- `C:\Users\PC\AppData\Local\Temp\opencode\perix-web-production-20261103-v2`
- `C:\Users\PC\AppData\Local\Temp\opencode\perix-web-production-20261103-v3`

## Forward correction v4 (user-approved live maintenance)

After the verified rollback, the user explicitly requested fixing the issue
and keeping the correction live rather than repeating precautionary rollbacks.
The serving version remains available while v4 is prepared. No further
precautionary rollback is part of the v4 workflow; emergency recovery remains
available for a serious availability/data-safety incident.

Frozen v4 source:
`9ef4a9da88bdcd39d0093969a94d677d9d916c26a9be8665136e8e7831f8c173`.
Its delta from v3 is limited to:

- Locator reuses `startFleetPolling`, the same serialized helper as `/app`,
  replacing overlapping 4-second requests and newest-started sequence gating.
- The helper ignores stopped/already-running callbacks, including callbacks
  already queued when the tab/session effect is cleaned up.
- Tests simulate successive 9 / 14 / 7-second responses, duplicate callbacks,
  lifecycle cleanup and source integration in both screens.

No source/arrival clock, preview validity, GPS semantics, backend motion logic
or extrapolation limit is relaxed. Backend bytes are identical to frozen v3;
its backend test evidence is reused, not relabeled as a new backend run.
Validation: clean `npm ci` passed, **75 frontend tests passed**, TypeScript
passed and the fresh full npm audit returned **0 advisories**. Four offline
release-guard tests also passed. Production-origin web export passed.

- v4 runtime: `874824d5296da67be8d7e1d85925dff6dc5ff52b0a586ff6e2ec84f0cffa76f8`.
- Entry: `entry-a58a5612d56e019d1e3303e554a43503.js`.
- Entry SHA-256: `9ac19fcb2881c4d6d1a09fabe232db314bfd15653067be5456e2a48b287be717`.
- Packaged backend code bytes (not only source) also exactly match v3, apart
  from the new frontend ZIP. Public data-export behavior is unchanged; the
  large OSM export need not be downloaded again to test the polling correction.
- Current serving code/settings were rechecked before activation; no new
  whole-database snapshot, destructive restore or geometry rebuild was requested.

### v4 deployed and retained live

- Deployment **`20ab40a6-e780-4924-9f5e-c4008b08c440`**, SUCCESS, retained live.
  Startup prewarm completed with 85 estimates and actual JSON healthcheck 200.
  No precautionary rollback was performed for this forward correction.
- **184/184 runtime files matched**, Python 3.11.18, one actual Uvicorn process,
  initial environment matched and unrelated setting hashes remained unchanged.
- `/app`, `/locator?tab=mobility`, actual new JS hash, networks, fleet, map,
  source notice, arrivals and trip details passed low-rate public checks.
  Map remained **173/173 valid lines**. The unchanged large OSM export was
  intentionally not downloaded again; v3 export evidence is reused explicitly.
- Fleet observations: **6.500 / 3.015 / 2.625 s**, 86 estimates (28 bus,
  58 tram), 84–86 READY and 0–2 PENDING publications. A matching board row
  retained source-clock equality and its target since the fleet read. No
  registered GPS was present; source status remained `TRIP_CLOCK_UNKNOWN`.
- Locator browser: correct v4 entry, notice visible, no captured console
  errors. **21 completed fleet reads** by ~132 s, all observed status 200,
  no overlap and minimum response-to-next-start gap **2007.2 ms**. Responses
  included **9.469 / 7.782 / 8.878 s**, without starving state publication.
  Marker syncs advanced to 22, then 29 rather than sticking at two.
- Locator motion observation: **36/136 sampled SVG marker images** changed
  screen position over 2 s / 120 animation frames, with no requested map pan.
- `/app` browser: correct v4 entry, production mobility API origin only,
  visible notice, no captured console errors. Six completed reads by ~59 s,
  including a **10.070 s** response, and advancing marker syncs. Over fifty
  200 ms intervals, **28 marker images** moved; **34 motion intervals occurred
  without a new marker publication**, demonstrating animation between polls
  rather than only response-to-response jumps. No map pan was requested.

The fix prevents sequence starvation; it does **not** make a slow response fast
or extend authorization after a preview expires. Intermittent waits under
latency remain possible. The 800 ms p95 target/high-concurrency capacity and
full-database backup/restore remain unproved. No source clock changes, GPS or
observed-arrival claims, paid provider activation, native/OTA release, Mongo
restart/move or destructive data restoration accompanied v4.

Browser/public/runtime evidence is recorded privately under
`C:\Users\PC\AppData\Local\Temp\opencode\perix-web-production-20261103-v4`.
