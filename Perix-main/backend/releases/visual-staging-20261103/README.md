# Exact visual staging package — 3 November 2026

## Outcome and boundary

The exact candidate was installed and verified on **staging only**:

- App: https://backend-staging-staging-7ada.up.railway.app/app
- Locator: https://backend-staging-staging-7ada.up.railway.app/locator?tab=mobility
- Project `99643a3b-bf65-467a-8f2f-50640f519b2b`, environment
  `8dea60e3-332a-4fec-9394-7c682eb69b9a`, service
  `509e0b41-9c7a-41e1-9e95-3124c958fff9`.
- Initial candidate deployment `bb66bde1-a932-4150-95a1-3d09331315cb`.
- Controlled complete redeployment/restart of the **same bytes**:
  `2c4a3dc0-6a5f-4c96-9856-19810774491b` (`SUCCESS`).
- Both runtime checks matched **181/181 backend/artifact files**, including
  the frontend archive. Actual runtime Python: **3.11.18**.

This verifies a packaged implementation and controlled synthetic hosted
scenarios. It is **not production approval, live all-line coverage, physical
accuracy, a native-device approval or a complete licensing/security sign-off**.

Production deployment remained `b701b1f8-c50c-4fef-a97d-0fc5f710c58d` in the
read-only boundary check. No production settings, data, files or deployment were
changed. No commit/push was made. Existing unrelated working-tree edits remain.

## Exact source and runtime identity

Artifact root:

`C:\Users\PC\AppData\Local\Temp\opencode\perix-visual-staging-20261103-v1\`

| Item | Identity |
|---|---|
| Git baseline | `082be7d5c2851c74c5420eaa4d4be2f3d8434d4b` |
| Source | 715 files, 54 explicitly selected changed/new files |
| Source tree SHA-256 | `dd56ab52a4c6e1550bd73a3ff270bcc08f8f18f57613a84b68ea99b0a52b016d` |
| Runtime tree SHA-256 | `4f660504354455154b3e18ed48923bbed008faafc0b22a64a27dc228d912b54a` |
| Runtime ZIP SHA-256 | `87864c0768e98fdbd14544a083e040498112c13e23c85d5f1aa7190d69fe9677` |
| Reviewed delta SHA-256 | `bb6a619d3c5ab1389040025073040fec3e32db6a071460f31cfbf30ff4396ab1` |
| Frontend entry | `entry-275a6aadeef911ca187352f57c0e1173.js` |
| Entry SHA-256 | `1986f572f96214178d924214a6aa29780ee21cdc74d3e1daf9e248428b070da5` |
| npm lock SHA-256 | `fdd6a11a103c6ce0b2a07f3e24c177eb051bdfe57edab8c8565ca300ef1bae88` |

Tree digests hash the sorted compact JSON path→raw-file-SHA-256 mapping, not a
Git object ID. `source-manifest.json` and `runtime-manifest.json` enumerate the
actual bytes. `runtime.zip` is a deterministic archive of the enumerated
runtime files. The served entry was independently fetched and hashed in the
browser and matched the table above.

The dirty checkout was **not uploaded**. Baseline bytes came from Git objects;
`tools/package_visual_staging.py` supplies a literal overlay allowlist. Mixed
files were deliberately reconstructed:

- Legacy `engine.py` stays at baseline except conditional stale-generation
  invalidation and schema-1 geometry-fingerprint binding. The uncommitted
  estimated-station-continuation/lease/cache-retention work is excluded.
- `routes/mobility.py` retains visual integration, static provenance and the
  reviewed schedule-only guard, but restores the baseline physical estimate
  tail instead of shipping the mixed physical continuation changes.
- `mobility/v2.py` retains source manifests and the visual resampling bypass;
  physical continuation expiry/resampling changes are excluded.
- Shared fleet polling/list reuse, dated geometry matching, schema-2 web/native
  integration and source credits are included as explicit dependencies.
- Requirements and npm lock are unchanged from the baseline. No new dependency
  was added for visual context.

`reviewed-source-delta.patch` was applied to a separately extracted baseline and
reproduced **all 715 source hashes exactly**. On Windows this requires
`git -c core.autocrlf=false apply`; the first replay with ambient autocrlf
converted newlines and correctly failed byte equality. The failed replay is
retained; it is not the approved replay.

Validation tests and GET-only fixture apps exist only in the source/test
package. The runtime excludes all tests/test-control apps, old release trees,
`.env*`, `node_modules`, data captures, old webdist, management/reset scripts and
offline audit tools. Its only added runtime tool is the GTFS notice reader,
which is imported by actual ingestion code. The built frontend replaces the
old archive. Public map configuration is deliberately built for staging;
dotenv inheritance is disabled. Credentials were not copied into the package.

## Isolation and rollback preservation

The stage Mongo endpoint matched the private domain of the separately listed
staging Mongo service. It responded as standalone, not mongos/replica set. A
new, previously empty database, `perix_visual_stage_20261103_v1`, was selected.
The original stage database was not replaced, copied wholesale, dropped or
imported into. Corrected `/proc` checks verified **one actual Uvicorn process**
whose initial Mongo/database/feature environment matched the verification
process. This is stronger than merely reading configured Railway variables,
but is not an introspection of a live Motor client's internal connection.

Effective staging settings:

```text
MOBILITY_WORKERS_ENABLED=false
MOBILITY_VISUAL_PROGRESS_ENABLED=true
MOBILITY_ATOMIC_GENERATIONS_ENABLED=true
MOBILITY_MOTION_PREVIEW_ENABLED=true
MOBILITY_GOOGLE_TRAFFIC_ENABLED=false
MOBILITY_SYNC_AUTO_ACTIVATE=false
```

The original staging deployment/settings and a 168-file runtime capture were
preserved before changing settings. Capture SHA-256:
`521217659058656dcf099de4206f3204c214c2a03e36a1fab8f0801aede371cb`.
They are retained locally; no old database was deleted. This capture is not a
tested restoration of an image/database backup. No importer, automatic network
activation, production restore or paid Google Routes traffic fetch was run.
The ordinary Google Maps JS basemap did load for browser verification; that is
not a claim of zero third-party requests or zero map-page billing.

## Validation on the selected source/package

- **275 selected backend tests passed, 1 skipped**, one existing multipart
  deprecation warning. The selection tests the isolated source, not the dirty
  checkout, and excludes the unshipped physical continuation feature tests.
- **19 supervised disposable-MongoDB tests passed in 174.63 s**, including
  four independent processes, actual V2 loopback HTTP, shared static bus
  context, revised curves, geometry recovery and database-restart persistence.
  The first combined run hit its 180 s timeout after 18 passes and is retained
  as incomplete. The exact same packaged tests passed under an explicit 360 s
  external supervisor limit. No assertion was weakened.
  The timed-out Windows run left four owned fixture child processes; they
  were subsequently stopped with exact PID/creation-time/command/parent guards.
  Unrelated earlier review servers were left untouched. Automatic descendant
  cleanup on supervisor timeout remains a test-harness follow-up, not a
  production motion-engine failure.
- Actual frontend helpers accepted **104 captured previews**, including
  **12 endpoint checks**, with explicitly simulated client timing.
- Fresh **`npm ci`** from the unchanged lock succeeded; **53 frontend tests
  passed**; the web export succeeded. Its module installation was separate from
  the dirty checkout's node_modules.
- **TypeScript is not fully green.** Clean candidate dependencies expose five
  errors in unchanged `components/stories/CityAdViewer.tsx` (four image style
  overloads and web `position: fixed`). A separate Git-baseline source check
  using the same installed dependency tree has those exact five plus the old
  `display_route_number` type error. Candidate adds no new TS error, but this
  comparison does not erase the five existing failures. No unrelated story UI
  was changed to conceal them. npm deprecation warnings are retained; no full
  dependency security audit or upgrade is claimed.

Disposable packaged test evidence:

`...\perix-mongo-isolated-20261102\visual-packaged-20261103-v2\`

## Actual hosted application and browser scenarios

The deployed entry point is the real `server.py`, including actual startup,
index creation and the application routers. No fixture server, alternate
renderer, fake HTTP clock or test control endpoint was deployed.

Only the dedicated QA database was seeded with two clearly named trips:
**QA-BUS** and **QA-TRAM**, headsign **QA SYNTHETIC — NOT OPERATOR SERVICE**.
Dates and progress used the actual service/wall clock on 3 November. Synthetic
normalized source rows were written directly to this test database; this tests
the real source reader, **not an external GTFS-RT fetch/parser/identity match**.

Observed checks:

1. Fleet, map and both stop-arrival endpoints returned HTTP 200; both modes
   published schema-2 estimates, `speed_kmh=null`, no physical-speed assurance
   and `observed_arrival=false`. Bus traffic coverage was explicitly zero.
2. A later source target selected stronger upcoming-approach allocation:
   tram strength **0.7664855957031251**, bus **0.773785400390625** in the
   captured moving samples. Both retained source clocks and estimate labels.
3. Atomic readiness was removed for both patterns: fleet became empty;
   `/app` showed **0 vehicle markers**, while both boards still returned ETA
   **206 s** in the captured read.
4. Readiness returned with a **new generation**. Ordinary polling recovered
   both modes. Actual `/app` and `/locator` DOM/debug state each showed two
   vehicle markers. Locator initially placed the test routes outside its
   viewport; using its real Google zoom-out control brought them into view
   and populated the nearby list. This was not a data-loss error.
5. A target was moved to about 35 real seconds ahead. **23 timed hosted fleet
   samples**, initially ETA **32 s** for both modes, verified both endpoints
   at ETA zero, exact terminal progress and retained **source dwell** afterwards.
   This is visual completion, not measured physical arrival.
6. Both full web screens were opened with the actual served Google Maps JS
   renderer. Clean documents reported no captured console errors. A read-only
   DOM-frame sample on `/app` collected 1,202 frames over about 20 s and showed
   pixel-level marker movement. It is not a perceptual smoothness guarantee.
   Static stop badges use bus/tram glyphs too; they must not be counted as extra
   moving vehicles. The actual QA SVG vehicle-image count was two.
7. The **same runtime** was uploaded again for a complete application restart.
   Runtime hashes matched again. Before/after snapshots retained identical
   hashes/counts for **1 network, 2 generation bundles and 6 shared optical
   documents** across the two different deployments. This is an application
   restart check, not a hosted Mongo restart or backup-restore test.
8. A second explicitly QA-only version was generated for a fresh,
   uninstrumented browser review. The previous QA version was deactivated,
   not deleted. QA cancellation was requested at the end; fixtures/data remain
   as evidence and are not real public transit. No ongoing live feed is running.

Browser-test correction: an early diagnostic wrapper incorrectly called a
numeric `pos.lat` as a function and caused the test tab's error boundary. It
was an injected observation error, not shipped code. That wrapper was discarded
by full navigation; subsequent review used read-only DOM observations and a
fresh uninstrumented tab. The faulty observation is not counted as a pass or
hidden as a production defect.

Relevant artifacts include `staging-sample-*.json`, `staging-approach-report.json`,
`staging-runtime-verification*.json`, `state-snapshot-*.json`, the source/runtime
manifests, replay verification, build log and browser screenshots.

## Remaining production gates

- Five existing clean-install TypeScript errors; full dependency/security review.
- Current licensed real static/RT ingestion, source freshness and coverage;
  real version-bound notice/attribution review and geometry/access/closure
  uncertainties remain. Synthetic QA topology is not operational route proof.
  Its stored source is `QA_SYNTHETIC`; the existing resolver nevertheless emits
  mode-derived OSM source labels in map output, so this fixture does **not**
  validate end-to-end provenance or justify a legal-compliance claim.
- Hosted multi-worker topology, approved capacity workload and metrics,
  importer/activation concurrency and failover. Four-worker local evidence
  must not be relabeled as four hosted workers; hosted runtime had one.
- Actual database storage/backup retention and tested restore/rollback. Code
  capture and successful restart do not prove these.
- Native-device rendering/accessibility and final visual/product review.
- Separate explicit production approval. This staging-only build has its public
  origins baked in; it must **not** be promoted unchanged to production.

The previous keyword/hunk ownership lists and whole-working-file hashes are
superseded by this exact replayable candidate, not retroactively validated.
