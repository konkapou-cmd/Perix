# Magdeburg Deployed Source Delta

This bundle retains the exact manifest-verified backend source deployed as
`3b8ef7d6-7c7c-4763-b7f1-b133c53dc5e0` in `staging/backend-staging`.
The patch base is the original actual deployment
`bb95324b-2504-4356-b1d6-8ef9f4f0ac1e`, NOT this repository's older local HEAD.
Do not apply it to the shared worktree or overwrite user WIP. This update performs
no deployment, network operation, migration, activation, staging or commit.
The parent handles the reviewed commit separately.

## Exact Scope

`manifest.json` records original archive identity, every changed before/after
SHA-256, final deployment/image identity, and reconstructed file hashes. Every
entry in frozen `latency-approved-manifest.json` was checked against the deployment
package extraction, not the mutable candidate directory. The delta is computed
from the complete final file map against the original baseline manifest, not
only the final manifest's incremental source/test lists.
All 252 packaged backend source/test/config hashes were verified remotely in the
retained deployment evidence; this update verifies the frozen extraction locally.
The frozen source-manifest digest is
`5766dbe5bfe985eb9765ff1220d99b3839e4131eaf608ddfc43c09be307a89d6`.

The full closure includes occurrence-aligned loop timing/schema 12, performance,
snapshot completeness/offline-source safety, civil-date selection, dated
consumers/storage/geometry, the pure `mobility/service_clock.py` helper, and all
changed/new packaged tests and their fixtures. The actual carryover fixture
retains all 21 actual 24+ clock trips for EACH of October 22 and 23, with hashed
identifiers. The existing 17-trip line-54 occurrence fixture remains included.
Neither is a nationwide feed or proof of simultaneous operating vehicles.
The approved latency delta adds missing-epoch fast return, scoped bounded domain
cache, shared in-flight reads, static map singleflight/defensive-copy caching and
threaded geometry checks, plus `tests/test_mobility_latency.py`. Readiness,
generation/snapshot/override/detour invalidation and fresh dated RT checks remain;
finished passenger positions are not cached. `service_clock.py` is retained from
the exact deployed manifest, not copied from a later candidate.

Candidate-only `test_mobility_osm_offline_source.py` is NOT deployed and is NOT in
this patch. No whole-backend copy, binaries, large OSM bundle, auth/email WIP,
fonts/build changes, island/Syrr changes, real service/provider URLs, credentials
or environment values are included. The deployed civil-day test's inert
`example.invalid/test.zip` placeholder is retained byte-exactly, as authorized.
Strict matcher `mobility/realtime_trip_identity.py` remains exactly
`6f46e98dd7092a77b495a500881e1e8ec6920a2788d550ba1dbb02e5e769fe97`.

## Proven Deployment Facts

PASS for the bounded staging acceptance below, not production promotion or a
claim of complete real-world positioning accuracy. The following are historical
observations from `LATENCY_DEPLOYMENT_RESULT.md`, `latency-deployed-verification.json`
and the frozen approved manifest, not new remote
checks or promises of ongoing realtime freshness:

- Deployment SUCCESS; deployed source hashes verified. Active October 23 network
  `net_fa5ce635d48b` was automatically activated at
  `2026-10-23T01:51:25.532577+00:00`, READY 157/157, reused 157, rebuilt 0,
  no blocking missing patterns. Audit blockers/warnings were both zero; schema 12.
- At `2026-10-23T02:21:47.550281+00:00`, active October 23 network
  `net_fa5ce635d48b` was ACTIVE_READY 157/157. There were 157 dated RT rows,
  152 with feed timestamps within 180 seconds, 42 vehicles and 37 realtime
  estimates. These are counts at that check, not static freshness promises.
- At the earlier civil-day 03:53 Berlin check both networks were selected independently:
  10 current-date journey windows overlapped, zero previous-date windows did.
  Selecting two dates does not fabricate carryover buses. Provider preflight
  matched 66 October 23 descriptors and rejected the same 66 against October 22.
- The cached GTFS SHA-256
  `df1f77d9103dc84bbb8daad92505a3e8ca82050a64cd023218ca478599c81ce2`
  was independently parsed for both dates: 3776 trips and exactly 21 trips with
  24+ occurrence clocks per date. Full actual clocks are in the packaged fixture.
- Latest candidate tests: 269 passed. Exact frozen deployed package: 254 passed,
  1 skipped. The skip is the older 37-descriptor replay whose unrelated capture
  was deliberately not packaged. Additional candidate-only offline tests explain
  the other count difference. These suites were NOT rerun for this bundle.
- All ten public HTTPS checks returned 200 within the unchanged 15-second timeout.
  Warm map took 1.3127s and vehicles 0.9338s. First verification map/vehicles took
  2.3125s/3.4027s; other clients had already requested them, so these are NOT
  proven cold HTTP measurements. Concurrent two-map/two-vehicle batch: 2.6221s.
  These observations are not a latency SLA.
  No production, variable changes, forced readiness or manual sync stamping.

## Frontend Evidence

Documentation only, no frontend or public-key assets are included in this backend
patch. Frontend deployment `53d102c6-37a9-4d81-8e65-9e0772d58604` succeeded;
the retained deployed smoke at `2026-10-23T02:22:17.291Z` passed desktop and mobile,
with 20 stop-panel rows each, zero errors and all completed measured requests below 15s.
Maximum browser request times were 8.203s desktop and 3.315s mobile. Runtime
warnings still existed; zero errors does not mean zero warnings.
One desktop poll had started without completion timing at capture end and is
not counted as a completed latency sample.

Candidate bundle SHA-256:
`5185bd96bc8d3b45add0690eeed86c16ca2c222f0e25a0cb6d53096f27410bb5`.
Served deployed bundle SHA-256:
`47a4a917a110746052c281964df7672e08f2b01d59fa05ced6e3600506cbf502`.
These are distinct observations, not an assertion of candidate/deployed byte
identity. Sources: frontend `candidate-result.json`, `deployment-result.json`,
`deployed-artifact.json` and `deployed-smoke-result.json` in the isolated
`magdeburg-frontend-stop-polling` evidence directory. Candidate build passed and
nine tests passed; five pre-existing `CityAdViewer.tsx` type diagnostics were
documented on clean HEAD, so no clean whole-project typecheck is claimed.
Vehicles are virtual schedule/realtime estimates, not observed GPS positions.
Production is unpromoted. No claim is made that all real-world accuracy is ready.

## Dated Policy

Civil date, not a global 04:00 shift, selects the current GTFS calendar. Raw low
hours remain low and 24+ clocks remain 24+. Each dated network uses its explicit
local timetable coordinate; backward raw clocks fail closed. The worker reparses
the selected date even when the feed hash is unchanged, wakes at civil midnight,
and rejects activation if preparation crosses midnight. Existing audit/readiness,
geometry and freshness gates remain in place.

Passenger fleet, arrivals, serving-stop, progress, planner and dated map geometry
evaluate selected activated current/previous-date networks independently and
combine computed outputs, never raw daily trip dictionaries. Version/date scopes
keep duplicate daily identities separate. Only currently overlapping windows
appear. RT descriptors select independently audited activated dated networks;
unknown or ambiguous missing dates fail before the unchanged strict matcher.

## Storage And Rollback

The concrete legacy unique index `(region_id, network_id, trip_id)` prevents two
daily instances of the same external trip ID from coexisting. New writes use
`mobility_trip_realtime_journeys` with uniqueness over
`region_id/network_id/network_version_id/service_date/trip_id`, retaining the
existing monotonic pipeline and duplicate-key retry. The legacy
`mobility_trip_realtime` collection and its index are preserved, not dropped or
rewritten. Reads query both stores by exact version/date; even a stale dated row
supersedes its rollback row so old state cannot be revived.

A disposable staging Mongo probe verified same-ID/two-date uniqueness, duplicate
rejection and sequential monotonic updates; concurrent duplicate-upsert racing
was not separately stress-tested. Startup created the real dated collection/index.
No live same-ID RT pair across both dates was observed at the final check.

Immediate latency rollback reference: `be852108-f0b9-4adc-8917-04d096b31fc8`.
Earlier pre-civil rollback: `073a855f-8232-4eb4-8265-c364c0ca7930`; retained prior October 22
network `net_be4b821290e7` was independently READY 157/157. A code rollback alone
does not migrate dated rows back into legacy storage, restore the active network,
or provide the old code with civil-date/overlap behavior. Preserving legacy data
is not a claim of seamless data or policy rollback. No rollback is performed here.

Remaining limits: cross-date transfers are not searched; static catalogs remain
active-network catalogs; midnight preparation is not an upcoming-day scheduler.
Repeated DST fall-back times share a wall-clock coordinate; fold-aware absolute
disambiguation and GTFS noon-minus-12h semantics are not introduced. Undated
manual imports do not acquire an invented GTFS date. Cold builds, contention and
busier fleets remain latency risks despite passing the measured staging checks.

## OSM Provenance

The existing offline import used Geofabrik Sachsen-Anhalt dated October 16, 2026,
`2026-10-16T20:21:21Z`, NOT today's data. The manifest retains source, polygon,
extractor and bundle hashes, full bbox coverage and counts without URLs or bulk
data. The existing extractor was reused read-only, not added to this backend.
Imported graph `1792715242` has 29961 roads, 865 rails and 2816 signals; four
previously missing tram ways were verified. Default refresh remains Overpass
unless an operator explicitly supplies audited offline sources. Offline-source
metadata alone is not an independent proof of PBF completeness.

## Isolated Replay

Use Python 3.12 and Git. Supply the original archive matching the manifest and a
NEW directory outside every shared worktree. From this release directory:

```powershell
python replay.py --baseline "C:\Users\PC\AppData\Local\Temp\opencode\magdeburg-occurrence-release\deployed-baseline.zip" --destination "C:\Users\PC\AppData\Local\Temp\opencode\magdeburg-latency-release-replay-new"
```

The helper refuses an existing destination, verifies archive/patch/before hashes,
runs `git apply --check`, applies without force/reject/three-way options, then
checks all reconstructed file hashes and the unchanged matcher. Unchanged support
archive files (scripts/fonts/tools) are not duplicated or needed for focused replay.
Replay disables Git CRLF conversion only for its invocations and suppresses
whitespace warnings without fixing bytes or changing persistent Git settings.
`.gitattributes` preserves patch bytes across checkout.

Generation is deterministic: sort the full final backend file map, select hashes
differing from baseline (plus additions), and use Python `difflib.diff_bytes` with
`unified_diff`, three context lines, `a/<path>` and `b/<path>`, `/dev/null` for new
files, no timestamps, original source line endings and standard missing-final-
newline markers. The manifest's source-manifest hash pins the exact final input.
`freeze.py --evidence <isolated-backend-root> --frontend-evidence <isolated-frontend-root>`
regenerates only this release folder from the frozen extraction and local records;
add `--check` to verify byte-identical regeneration without writing artifacts.

Only deterministic regeneration, local patch checking and byte-exact isolated
replay were run for this update. No new application tests or remote operations.
