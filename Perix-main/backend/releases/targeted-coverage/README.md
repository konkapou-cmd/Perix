# Targeted source-journey coverage and operator timetable conflict

## Reported field observations — 2026-10-24

- Hasselbachplatz around midday: discrepancies despite apparently correct times.
- Tram 6 in Stadtfeld: physically passed but not visible in the app.
- Nearby buses: visible in the app but not observed physically (not missing map
  markers; do not reverse the user's report).
- Latest precise example: tram 9 from Am Fuchsberg crossed a physical tram 13
  at **Am Fuchsberg / Leipziger Straße**; 9 matched, 13 was absent at that point.

These observations are external ground-truth reports, not disproved by API-to-
renderer parity. No measured fleet GPS was available to this investigation.

## Confirmed evidence

1. Production read at `16:03:37Z` / `18:03:37 Europe/Berlin`: source-active
   tram 6 trip `956987` toward Diesdorf was missing while virtual run
   `...:6:1290954` remained on predecessor `844818` toward Hauptbahnhof.
   The predecessor source window ended 224s before the observation. This
   establishes a cache/run-arbitration mechanism, not identity with the user's
   midday tram.
2. Source trips had no `block_id`. The old code nevertheless inferred physical
   runs from nearby termini within 15 minutes; realtime changes regrouped those
   trips and changed virtual IDs. A staged first correction also exposed two
   overlapping source-active bus 48 trips (`1058788`, `108756`) mapped to one
   inferred run. Merely preferring the newer trip is insufficient.
3. The MVB's updated official notice states that tram **13**, night buses **N3
   and N5** divert between Südring and Halberstädter Straße / Leipziger Straße
   via **Wiener Straße**, serving **Hertzstraße, Raiffeisenstraße, Am Fuchsberg**;
   **Jordanstraße is omitted**. Duration is undetermined. Since **17 October**
   this short-notice diversion is **not reflected in timetables**, with an
   approximately five-minute longer journey. Source:
   <https://www.mvbnet.de/brueckensperrung-in-der-halberstaedter-strasse-linien-13-n3-und-n5-fahren-veraendert/>
4. Published PERIX route-13 sequences still contain Jordanstraße. At
   `16:08:23Z` route 13 was represented elsewhere by schedule-only estimates,
   including `483698` near Hasselbachplatz and `854680` toward Südring. The
   fresh GTFS-RT inspection at `16:09:52Z` / `16:10:19Z` matched lines 6 and 9
   but **no active route-13 updates**. No route-13-like unmatched update with
   four shared route-13 platform IDs was found. This is a sample, not a claim
   that MVB never provides line-13 realtime data.

## Implemented candidate

- Do not infer shared physical vehicles from terminus proximity. Without a
  provider block, each actual dated source trip is its own **virtual journey**,
  using the existing `_estimated_vehicle_id` function and the actual source
  trip ID. These are not newly registered physical/GPS vehicles. Source-proven
  same-block continuity is retained and conflicting/incomplete blocks do not
  merge. Stable schedule topology precedes realtime/retention application.
- Keep source windows separate from cached model-retention windows. Source-
  active journeys cannot be masked by an unrelated previous model window.
- Preserve cancellation/deletion, operator overrides, feed freshness, dated
  version isolation, canonical paths and existing motion/ETA machinery.
- Do not produce speculative parked vehicles in inferred long layovers. The
  existing 60s trip-edge grace and active geometry-pending anchors remain.
- Add `trip_selection_basis` / `run_identity_basis` diagnostics. Source-based
  virtual IDs are stable within a dated trip, **not an invented physical-vehicle
  identity across trips**. Existing links to an expired inferred run may expire;
  do not silently redirect them to another vehicle.
- Add a source-backed advisory for only obsolete affected stop sequences. It
  states that positions/times may be inaccurate and links to MVB. It does not
  block/reroute tracks, move markers, alter imported trip times, manufacture GPS,
  add five minutes to every stop, or fabricate exact intermediate stop ETAs.
  The notice clears automatically when the imported sequence is corrected and
  becomes review-required after the recorded review-through date (not a claimed
  operator closure end date).

## Intentionally unresolved

**The route-13 detour geometry and stop timetable have not been corrected by
this candidate.** The operator text establishes the discrepancy but does not
alone provide a dated, validated OSM edge chain and exact replacement-platform
times. A subsequent correction must use the existing importer/stop overrides,
canonical rail/road generation and motion engine, preserving original provider
clocks separately from derived estimates. Do not draw an invented 13 at the
reported crossing or count a warning as a repaired route.

Source-active schedule/model positions are still estimates. The physically
absent buses reported by the user cannot all be certified or eliminated without
their exact journeys/reference evidence. No blanket suppression of buses or
schedule-only journeys is applied.

## Validation and packaging

- **96 backend offline tests passed**. Two existing Mongo/editor integration
  tests were deliberately deselected; the first broad attempt had fixture setup
  errors under pytest 9, not passing integration results. The offline process
  used `mongodb://127.0.0.1:1`, never production DB credentials.
- **77 isolated frontend tests passed**; workspace TypeScript passed. The
  previously recorded five isolated CityAdViewer baseline errors are not fixed.
- Staging/prod use isolated source and manifest-allowlisted packages over live
  baseline `6af7f55d-f6bf-4f04-9ba6-fed9d9dcd4ba`. Unrelated local backend,
  BusinessMap and other WIP are preserved, not deployed wholesale.
- No database migration, source trip mutation, settings change, paid Google
  Routes call or island deployment is part of this repair.

Evidence roots (no credentials):

`C:\Users\PC\AppData\Local\Temp\opencode\perix-targeted-coverage`:
source/RT captures, and `perix-continuity-audit/production-coverage-20261024-160338.json`.

`C:\Users\PC\AppData\Local\Temp\opencode\perix-targeted-coverage-release`:
isolated source, runtime baseline/rollback package, build logs and manifests,
staging and production browser results. Final release identity and validations
are appended after promotion.

## Live release

- Production **`0adc9837-d717-4694-a10d-686b052ad4d3`**, active `SUCCESS` at
  <https://app.perix.eu>.
- Final staging: `d3e38222-c0d2-4932-8860-2ba571b37279`.
- Runtime: **264/264 backend hashes matched**, paid Routes disabled. **267
  manifest files**, six changed members (two existing backend modules, one
  service-notice module, its data file, regression tests, frontend archive).
- Production served entry `entry-72103b86a28ad8cc5995a49f548ce166.js`, SHA-256
  `4aedf351adb8fe6735de26d8db322edc21217b6f731d96d9ae11a1e286e587fd`.
  Served HTML, entry bytes and map HTML verified; no staging API origin.
- Source-linked warning renders once for the affected lines. Genuine source
  tram-13 selection returned the exact dated trip `1632138`; **56 API / 56
  rendered**, no exceptions or unintended staging requests in production.
- First post-release production source-window check at `16:48:08Z`: 56 fleet
  entries (24 bus / 32 tram), 51 active source windows, **zero safe missing
  journeys**. Source coverage is not actual physical-fleet verification.
- Immediate rollback: `6af7f55d-f6bf-4f04-9ba6-fed9d9dcd4ba`, with its original
  264-file package verified/frozen. The explicit wrapper-root redeploy command
  is in `preflight.json`. No rollback has been required.

Final staging mobile browser sample ending `16:45:13Z`: 120s, DPR 3 and 4× CPU,
**14/14 complete deliveries**, one network fetch, no missing markers/paths,
projection shifts, cancelled transport or exceptions; no camera-driven line
redraw. Zero same-ID journey transitions is expected for source-trip virtual
identities; newly active trips have distinct actual-source IDs.

An earlier final-candidate stress sample ending `16:39:13Z` recorded one
incomplete delivery (route-6 source trip `1482070`) and initial geometry load.
At that sample, the renderer exactly matched the received bridge IDs, while
the older HTTP fleet included one additional ID; the request took **15.140s**,
at the client's 15s abort/retry boundary. This suggests transport cancellation,
but that run did not record the abort signal and does **not** prove the cause.
Its raw result remains retained at
`perix-continuity-audit/browser-mobile-2026-10-24T16-37-00-940Z`.
The follow-up added passive fetch-abort instrumentation and passed without
application changes; `browser-mobile-2026-10-24T16-42-55-615Z`. No claim of
faster API latency or a four-second end-to-end SLA is made.

## Reproducing the source delta without overwriting WIP

`runtime-delta.patch` contains only the reviewed backend/frontend source delta,
not `webdist.dat`. Apply only to a separate copy of the verified baseline, not
to the current dirty backend checkout. The Windows baseline contains CRLF, so
the successful dry-run command was:

```powershell
git apply --check --ignore-space-change '<release-folder>/runtime-delta.patch'
```

An unqualified `git apply --check` failed on CRLF context; the whitespace-
tolerant check passed. Deployment used the exact separately hash-verified
artifact, not a patch applied to unknown WIP. Rebuild frontend separately with
the intended API/app/map origin and exact published Maps configuration fields;
do not reuse a staged frontend archive in production.

Shared WIP remains uncommitted/unpushed. The report of physically absent buses
and the route-13 diversion remain subject to the explicit limitations above.

Final production mobile sample ending `16:51:09Z`: 180s / DPR 3 / 4× CPU,
**19 API-to-marker membership samples**, one network-map read, zero missing
markers/paths, >10m projection shifts or runtime exceptions, and no additional
line draw on camera gestures. One slow request reached HTTP headers at 14.649s
and its fetch signal was subsequently aborted at the client's timeout; retry/
last-known data retained complete marker membership. Do **not** call this 19
independently applied, timely position updates or a latency SLA. Evidence:
`browser-mobile-2026-10-24T16-47-54-614Z`, with passive abort telemetry.

Post-session production source-window check at `16:52:14Z`: 55 fleet entries,
52 active source windows, **zero safe missing journeys** or predecessor holds.
This is the second bounded post-promotion check, not physical-tram certification.
All confirmed source-coverage code changes and the honest diversion warning are
live. **Not all reported physical-accuracy issues are resolved**: route 13's
actual diversion geometry/timetable and the specific physically absent buses
remain open. No data was fabricated to make those claims pass.
