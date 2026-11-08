# TypeScript correction and follow-up checks — 3 November 2026

**Later dependency follow-up:** `MAGDEBURG_DEPENDENCY_AUDIT_2026-11-03.md`
records the authorized SDK-54-compatible remediation of the 59 npm records,
clean all-scope audit **0**, six explicitly maintained private layers, 72
frontend tests, web/native JS exports and a new staging-only deployment. The
59-record section below is historical; latency/native/real-data and production
gates are not automatically cleared by a zero registry audit.

## Decision

**TypeScript is now green on the clean, frozen candidate. Production remains
on hold for the findings below.** No production deployment/configuration/data
mutation was made. This follow-up did not redeploy staging: its rebuilt runtime
is byte-for-byte identical to the already verified hosted runtime.

## Minimal correction, preserved appearance

`frontend/components/stories/CityAdViewer.tsx` had one invalid-to-native-types
`position: fixed` declaration. That invalid `StyleSheet.create` entry also
caused four Image style overload errors through widened style inference.

The fix imports `ViewStyle` as a type and asserts the supported
react-native-web CSS extension **only inside the web branch**. Web still uses
`fixed`; iOS/Android still use `absolute`. Media sizes, viewport edges, layout,
playback, navigation and native styles are unchanged. No `any`, `ts-ignore`,
`ts-nocheck`, dependency change or broad stylesheet cast was added.

`frontend/tests/city-ad-viewer-styles.test.cjs` adds four executable style
regressions for web/iOS/Android and the narrow type boundary. These tests
execute the transpiled stylesheet with platform mocks; they are not native
device rendering tests. Full clean `tsc --noEmit` independently checks the
actual types across the application.

## Exact package identity

Root:

`C:\Users\PC\AppData\Local\Temp\opencode\perix-visual-staging-20261103-v2-types\`

- Parent is the previously frozen v1 source, **not a fresh dirty-tree copy**.
- Only two incremental source files: the viewer and its new test.
- **716 source files**, **56 total changed/new files** against Git baseline
  `082be7d5c2851c74c5420eaa4d4be2f3d8434d4b`.
- Source tree SHA-256:
  `31cf3cff34a85d10ea40a47829526e4afb453670606fda42987ca176c649bc61`.
- All 716 files were reproduced exactly from baseline + reviewed patch with
  `git -c core.autocrlf=false apply`.
- Patch SHA-256:
  `dd8df818107f7c16d564e66a3cd258aec60aa34cabe6f648b5e1b885f117f515`.
- Runtime tree SHA-256 remains
  `4f660504354455154b3e18ed48923bbed008faafc0b22a64a27dc228d912b54a`.
- Runtime ZIP SHA-256 remains
  `87864c0768e98fdbd14544a083e040498112c13e23c85d5f1aa7190d69fe9677`.
- The clean web export still produces
  `entry-275a6aadeef911ca187352f57c0e1173.js`, SHA-256
  `1986f572f96214178d924214a6aa29780ee21cdc74d3e1daf9e248428b070da5`.

The type-only syntax is erased by compilation. A fresh install/build, not an
old copied dist folder, reproduced the same frontend archive and all runtime
hashes. The hosted staging runtime was reverified at **181/181 matching files**
on deployment `2c4a3dc0-6a5f-4c96-9856-19810774491b`, Python 3.11.18, one actual
Uvicorn process. Thus no unnecessary redeployment or flag change was made.
The previous physical-continuation WIP exclusions and production boundary
remain unchanged.

## Automated checks

| Check on the frozen candidate | Outcome |
|---|---|
| Fresh `npm ci` from unchanged lock | Passed; deprecation warnings retained |
| Full `npm run typecheck` / `tsc --noEmit` | **Passed, zero errors** |
| Selected frontend tests | **57 passed** |
| Selected offline backend tests | **275 passed, 1 skipped** |
| Disposable Mongo + four-worker actual V2 HTTP selection | **19 passed in 181.81 s** |
| Frontend authorizer against those captured HTTP packets | **103 previews accepted, 12 endpoint checks** |
| Clean staging web export | Passed |
| Baseline+patch byte-exact replay | **716/716 source hashes** |

The backend tests use the exact candidate source. The isolated suite has an
explicit 360 s supervisor limit, PID/path/hash-verified local MongoDB 7.0.45,
synthetic fixtures and no production connection. Hosted MongoDB below is a
different server/version; these scopes must not be conflated.

## Actual hosted QA BSON backup/restore check

`tools/check_visual_staging_restore.py` verified the dedicated staging DB and
disabled workers, checked that it contains no users/non-QA network versions,
then serialized these **actual hosted QA documents and index definitions** to
an on-disk ZIP of BSON streams:

| Collection | Documents |
|---|---:|
| `bus_network_versions` | 2 |
| `mobility_pattern_generations` | 4 |
| `mobility_trip_realtime_journeys` | 4 |
| `mobility_visual_progress_state` | 9 |

All **19 documents** were restored by reading the saved archive into a new,
previously empty database on staging MongoDB **8.0.34**. BSON hashes, counts and
indexes matched for all four collections. Source hashes were unchanged. No
database was dropped or overwritten; the application was not switched to the
restore namespace. Both the restored namespace and a local archive are retained.

Archive SHA-256:
`67560898e1a131c86d24e081b3ebff8db2875c299df2b6671dc5e9ab6d3bfec7`.

**Limit:** this is a real hosted **QA mobility** snapshot/restore, not a backup
of real users, full application data, production or physical storage. It does
not establish automatic backup retention, in-place restore, volume recovery,
database-process restart or production rollback safety.

## Bounded hosted read smoke: latency gates NOT passed

`tools/check_visual_staging_reads.py` ran five virtual anonymous readers, four
fleet reads each at an 8-second cadence, plus one map and board read per reader:
**30 requests**, all HTTP 200, no deployment change during the experiment.
QA trips were canceled; fleet publications were empty. This tiny-data test is
not a representative active-fleet or 50/150-client capacity test.

| Endpoint | Samples | p50 | p95 / p99 | Proposed p95 gate |
|---|---:|---:|---:|---|
| Fleet | 20 | 0.296 s | **8.000 s** | <0.800 s: **FAIL** |
| Map | 5 | 2.032 s | **3.453 s** | <2.000 s: **FAIL** |
| Board | 5 | 0.125 s | 0.141 s | No separate gate proposed |

No higher-load step was attempted. Cgroup memory was about 136 MB before/after,
with no observed deployment restart. Mean container CPU was about 0.0145 cores
over the measured interval; metrics include SSH diagnostic activity. These are
not MongoDB primary CPU or fine-grained request profiles.

Additional bounded diagnostics, **not replacements for the failed test**:

- Five concurrent loopback reads per endpoint inside the actual container:
  map **58–74 ms**, fleet **37–39 ms**, all HTTP 200.
- Three independent external curl checks: ping about **1.898 s**, map about
  **3.087 s**, fleet about **0.285 s**. The map curl took about **2.409 s** to
  complete connection/TLS negotiation before first-byte time at 3.085 s.

These observations support investigating public transport/connection/cold-path
variation; they do **not** prove that the backend can never stall or identify a
single root cause. External p95 gates remain failed, not reclassified as passed
because a later loopback request was faster.

## Current public source comparison, read-only

The tool made bounded public GET/HEAD requests, with no ingestion/activation or
source writes. Current public network:
`net_31f88b117124`, service date **2026-11-03**.

- **2,813/2,813 trips** matched the supplied archived GTFS's active service,
  route identity and stop occurrence sequences for 3 November.
- **62,861/62,861 exact second arrival/departure pairs** matched.
- An actual national realtime snapshot had **418 matched local trip identities**;
  394 had a stop arrival/departure timing field, **zero** had a trip-specific
  update timestamp. Only aggregate TripUpdate results and a raw-input hash
  were retained, not vehicle GPS records or the full realtime payload.
- Configured static source HEAD reported `Last-Modified: 31 Oct 2026` and
  `Content-Length: 270664755`. This is metadata, not a fresh archive download
  or a version-bound import identity proof.
- Static archive was the explicit cached input SHA-256
  `5695daa64d69a3a187aad9f7a8616988b56d6f05977281773abb1d839fa3efcb`.
  Its presence on disk since 2 November does not prevent checking its calendar
  for 3 November, but it is not silently relabeled as a new download.

**Freshness correction:** the first successful tool run calculated header age
after the lengthy offline static scan (about 230 s). Receipt time was not
recorded, so that value is retained as **age at report time**, and age at receipt
is explicitly unknown. The raw report is preserved. The tool was corrected to
capture receipt time immediately on future runs; no missing time was invented.
The initial 20 MB investigation bound was too small for the national feed;
that attempt was aborted and the successful retry had a 128 MiB decoded bound.

Matching identities and static clocks do not establish fresh per-trip forecasts,
GPS, all-day coverage, activation ordering or full legal compliance. In
particular a newer feed header must not be labeled as a new trip forecast.
Live ingestion remains disabled on staging. No Mobilithek subscription, new
operator permission or paid traffic provider was requested/activated.

## npm audit findings: separate security gate

The unchanged lockfile (`fdd6a11a103c6ce0b2a07f3e24c177eb051bdfe57edab8c8565ca300ef1bae88`)
was inspected with `npm audit --omit=dev --json`. It reports **59 affected
package records: 3 critical, 19 high, 35 moderate, 2 low**. These are audit
findings, including dependency propagation, not 59 demonstrated exploits.

The three critical dependency paths include:

- `@react-native-firebase/app → firebase → @firebase/firestore →
  @grpc/proto-loader → protobufjs@7.5.4`.
- `@react-native-firebase/app → firebase → @firebase/database →
  faye-websocket → websocket-driver@0.7.4`.
- `react-native → react-devtools-core → shell-quote@1.8.3`.

Runtime reachability in the shipped static web bundle/native app has not been
fully established. The hosted Python service has no deployed node_modules;
that fact alone does not clear client/build-time exposures. No automatic
`audit fix --force`, Expo major upgrade/downgrade or lockfile rewrite was run.
Remediation needs a separate reviewed compatibility-tested dependency delta.
This TypeScript-only package did not introduce or repair these findings.

## Remaining release boundary

TypeScript is cleared. Controlled hosted QA backup/restore is now evidenced,
within the restricted scope above. **Production is still not approved**:

1. Triage/remediate dependency findings and assess actual shipped exposure.
2. Diagnose/retest public-path latency with representative workload/locations;
   do not increase load while current gates fail. Hosted multi-worker behavior,
   active-fleet capacity and DB-primary metrics remain unvalidated.
3. Controlled real ingestion, version-bound notices/licensing, operational
   geometry/closures and failure/recovery checks remain distinct from a
   one-snapshot public comparison and synthetic QA tests.
4. Production/full-app storage backup retention and tested recovery, native
   devices/accessibility and final visual/product review remain open.
5. Separate explicit production authorization is required. The runtime has
   staging origins baked in and must not be promoted unchanged to production.

Detailed evidence/manifests are in the artifact root above; exported release
evidence is under `backend/releases/visual-staging-types-20261103/`.
