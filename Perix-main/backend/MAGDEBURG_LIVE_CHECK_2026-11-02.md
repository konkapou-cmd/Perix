# Magdeburg public live check — 2 November 2026 evening

## Outcome: mixed; no release or licensing sign-off

Read-only public browser and HTTP checks at approximately **19:55–20:03 UTC / 20:55–21:03 Europe/Berlin** show functioning estimated publications, but not universal agreement, continuous detailed physics, or independently verified vehicle locations. No production deployment, configuration/database mutation, restart, subscription or account login was performed. Public GET endpoints can populate the application's own caches; this check did not disable that normal server behavior.

### Current deployment, not the local candidate

`https://app.perix.eu/api/mobility/v2/networks` returned dated network `net_9d97f995b79a` for `2026-11-02`, without `source_manifest`. `/map` returned 186 lines, physical stops and diversion warnings, without the local `source_manifests` extension. These facts do not identify the running code revision. No conclusion is made that the ten local marker-suppression entries or new attribution changes are deployed.

Browser inspection of `https://app.perix.eu/app` showed the map and directory rendering. The captured viewport was zoomed into central Magdeburg and contained **no visible vehicle marker**; it cannot certify marker animation. The inspected document had Google attribution, but no OSM/GTFS credit link was found. That is an observation of this page/sample, not proof about every screen. Screenshot: `C:\Users\PC\AppData\Local\Temp\opencode-browser-rMGtC9\0\screenshot.png`.

### Publication readiness changes within the observation

- An initial separate fleet sample contained 54 virtual records: 44 `PENDING` with `GENERATION_MISMATCH`, 5 `READY`, 5 with no publication status.
- The bounded four-sample run subsequently contained 56 virtual records each time. Sample 1: 40 `READY`, 15 `PENDING` with `GENERATION_MISMATCH`, 1 unspecified. Samples 2–4: 53 `READY`, 3 unspecified, no reported generation-mismatch fallback.
- This transient improvement is compatible with cache/build readiness changing, but the cause was **not established**. It does not prove a persistent defect or a persistent cure. Records without publication status include turnaround anchors and must not be counted as detailed moving physics.
- These samples included 11–16 `DWELL` states, and 29–41 preview payloads. Some detailed publications had `STATION_REFORECAST_HOLD` and `station_forecast_pending=true`: modeled station holding is not observed arrival or an observed red signal.

### Positions versus PERIX geometry

Projection of sampled coordinates onto same-version/date/pattern map lines found 55, 53, 53 and 53 matching positions; their maximum perpendicular distance rounded to **0.000 m** using a local planar projection. This is expected internal alignment with **PERIX's own line**, not physical accuracy or an independent operator route check. No ready record in these samples had ETA zero while reported distance to its next stop exceeded 5 m. Neither check proves that the real vehicle was at a stop.

Across 168 same-vehicle consecutive sample pairs, plan revisions changed in 161. One same-next-stop pair, bus **54 / trip 773785**, moved backwards about **27.25 m in path progress** (27.22 m spatial displacement) as ETA changed 0→7 s and feed/revision changed. The first publication was pending and the later publication ready, so this is not proof of a backwards animation shown to passengers; it is a discontinuity in published position data that needs investigation. Changes of revision, source timing, sample clock and readiness must be distinguished before attributing a displacement to physical speed. No claim is made that every pin moved smoothly or respected a continuously measured speed across revisions.

### Fleet ETA versus stop board

The first three board probes were intentionally selected very near modeled arrival (ETAs 1, 2 and 7 s). None retained a matching row by the time the sequential board responses arrived 3.3–12.4 s later. They are **inconclusive**, not mismatches or passes.

A second bounded comparison selected ETAs over 45 s and read three boards concurrently with explicit platform filters:

| Trip / line | Stop | Fleet ETA | Board ETA | Same plan revision |
|---|---|---:|---:|---|
| 1455563 / 58 | Turmpark | 54 s | 53 s | yes |
| 1429613 / 3 | AOK | 54 s | 53 s | yes |
| 1258810 / 53 | Hängelsbreite | 114 s | 113 s | yes |

Exact trip-instance and platform identity matched in all three. Board responses arrived about 4.2 s after the fleet response; using response receipt as the clock yields an apparent target-time difference of about 3.2 s. Response time is not the engine's sampling clock, so this is **not exact-second agreement**. It is encouraging same-model consistency for three selected trips, not an all-stop or all-fleet guarantee.

### External web comparison: INSA AOK departures

Opened the official public interface through `https://www.insa.de/fahrplanauskunft/insa-fahrplanauskunft` → `https://reiseauskunft.insa.de/auskunft-iframe/`, selected **Abfahrten / Magdeburg, AOK**, and read the board at **20:02:07 UTC**. Only necessary cookies were accepted. No shapes or geometry were extracted or imported. The board stated data version `30/10/2026`.

Selected displayed departure entries and a subsequent PERIX board read (same stop, matched by line/direction/scheduled time, not common trip IDs). INSA board screenshot: `C:\Users\PC\AppData\Local\Temp\opencode-browser-KIN9V0\0\screenshot.png`.

| Departure / direction | INSA displayed offset | PERIX departure delay field |
|---|---:|---:|
| 21:01 / 3 → Betriebshof Nord | +2 min | +116 s |
| 21:04 / 10 → Sudenburg | −1 min | −58 s |
| 21:04 / 1 → Kannenstieg | +1 min | 0 s |
| 21:16 / 10 → Barleber See | 0 min | +102 s |

The first two are compatible at minute-level precision; the latter two differ. The readings are **not simultaneous**, arrival and departure fields must not be conflated, exact seconds are not exposed by the INSA board, and provider update/revision differences were not controlled. INSA is another presentation, not guaranteed independent upstream evidence. These observations establish neither which forecast is correct nor actual vehicle locations. They do refute any claim that all displayed forecasts were proved identical. Do not label the INSA offsets as observed delays or GPS.

### GTFS.de source snapshot

A single direct read of `https://realtime.gtfs.de/realtime-free.pb` found 56 trip updates matching the currently sampled virtual fleet, **zero trip-specific timestamps** for those matches, and **zero VehiclePosition entities** in the feed. Header timestamp: `1793649625`; captured response SHA-256: `691e5c41272a24f6e69d4cc05ad51956c135c5aa1c9e956ff43095f72ec7f55a`. No raw feed was retained. A newer header alone cannot prove that a trip forecast changed. This same configured upstream source is not an independent position reference.

## Review evidence and corrections

- Raw-byte **SHA-256**, not `git hash-object`, was used to compare the 21 tracked working-tree files in `perix-staging-package-hunks-20261102.json`: **21/21 match** the recorded hashes. Git blob IDs use Git object framing and generally a different hash scheme; the previous advice to compare them directly was incorrect.
- These hashes cover whole working-tree files, **not** a clean selective package, untracked dependencies, frontend build output, deployed runtime or an approved source revision. No clean release artifact has been proven. The keyword-derived OURS/WIP classification is not authoritative attribution and cannot approve excluding required motion/preview dependencies.
- Previous documentation misidentified the tram 6 model's `requested_duration_s=1` as the source schedule. The source interval is 60 s; the engine computes the remaining available window after carried modeled lateness, clamped to 1 s. Do not infer a timetable error, rounding policy or operator behavior from that diagnostic alone. Candidate path lengths remain unverified route hypotheses.
- The earlier 667-pass run was not a clean full-suite pass: it also had 8 failures and 26 setup errors. A previous indiscriminate full-suite attempt issued a login POST to an old configured preview host and got 404; it was **not** entirely offline. Do not repeat broad integration tests until endpoints and fixtures are explicitly isolated. Environment failures alone are not evidence that all other behavior is correct or failures pre-existed these changes.
- Open licences can permit commercial use without asking an operator or obtaining a lawyer's signature. Actual source terms, attribution, modification notices and applicable database/share-alike obligations still need to be satisfied. This technical live check is neither legal advice nor legal approval; it does not automatically disable realtime or grant approval to deploy.

## Local evidence

Under `C:\Users\PC\AppData\Local\Temp\opencode\`:

- `perix-live-read-check-20261102-evening-v1.json`: bounded samples, map/stops and first board probes; only virtual fleet records retained.
- `perix-live-board-comparison-20261102-evening-v1.json`: three platform-specific board comparisons.
- `perix-live-position-source-comparison-20261102-evening-v1.json`: own-line alignment and aggregate source-feed observations.
- `perix-live-aok-board-20261102-evening-v1.json`: PERIX AOK board sample.

New local tool: `tools/live_mobility_read_check.py` (explicit fixed public origin, bounded GETs, refuses report overwrite, no real GPS/driver records retained). This is an observation tool, not a capacity test or automatic gate-unlocker.

An offline selection covering the helper's distance calculation, preview geometry identity and neighboring source timing passed **29 tests** with one dependency warning. Those unit tests do not verify the hosted deployment's behavior or the tool's full end-to-end safety properties.

## Next technical priorities

1. Reproduce readiness transitions and the bus 54 position correction in an isolated exact-runtime replay; retain geometry, source-clock and plan identities without changing live state.
2. Compare provider stop-specific clocks with propagated/model-adjusted times for the two AOK disagreements. Do not compensate by speeding vehicles up, fabricating stops or silently modifying source forecasts.
3. Test local marker suppression end-to-end, including fleet fallback, preview expiry/removal and board continuity. Returning `None` in one estimator and passing helper tests alone is not proof that the client hides all affected markers or that boards retain an agreed ETA authority.
4. Complete clean-package dependency review, source notices and a controlled staging visual/restart/restore/capacity run before requesting production approval. This sample does not supply those approvals.

## Follow-up investigation and local changes (not deployed)

### Reproducible stale-generation cache failure

An offline regression reproduced a concrete failure mechanism: `_trip_path_geometry` can reuse a generation-bound cached path indefinitely, while `_build_trip_plan` fetches a newer atomic generation from the database. The strict equality guard correctly rejects the mix, but previously left the old geometry entry intact. An ordinary next request could therefore reuse it again until some other operation refreshed the cache. This is a demonstrated local mechanism, **not proof of the exact cause** of the earlier online readiness transitions. The live deployment's code and cache contents were not copied or changed.

Local fix: when a **ready** newer bundle differs, the engine still fails the current build with `GENERATION_MISMATCH`, but conditionally evicts only the exact pattern/version/stale-generation geometry entry. A mutation lock prevents deleting a concurrently replaced newer entry. Projection-cache revision changes so the next ordinary path read reloads its generation. There is no internal retry loop, database write, path mutation, automatic activation, cap change or borrowing of new infrastructure into an old path. Manual overlays, a newer cache entry and unready bundles remain untouched. Existing strict mismatch checks are retained. New tests first failed (2 failures / 3 passes), then passed with the implementation.

### Pending-to-ready marker transition

The bus 54 observation compared an initial `PENDING / GENERATION_MISMATCH` fallback at progress 3331.2 m (ETA 0) with a later ready detailed result at 3303.95 m (ETA 7 s). The different authorities explain why these coordinates are not samples of one continuous physical plan. It still must not be masked as physical backwards motion or repaired by speeding the model up.

Local `/app` web fix: new pending estimated journeys do not create a Google marker yet; an existing marker receiving a **different** pending journey is hidden and its progress cleared, instead of inheriting the previous journey's point. The first ready packet shows the authoritative position directly, without interpolating a missing interval. An existing same-journey pending update retains the last point as before and clears preview animation at the map integration layer. This does not add a global progress clamp across different revisions or modify source forecasts, GPS/taxi behavior, Locator behavior, or the native implementation. No visual claim is made that the fix already runs online.

### New AOK source-clock comparison at 20:11:56 UTC

Captured another bounded public GTFS.de snapshot and PERIX AOK board concurrently. Selected trip-update stop fields were retained for only the four investigated virtual trip IDs. This is a **new** source snapshot, not reconstruction of the earlier INSA reading.

- Tram 10 / trip `938920`: the source had no direct AOK stop update, but upstream stop `374503` and final stop `186647` both carried 68 s at their relevant departure/arrival anchors. Replaying the **current local** canonical timing pipeline with the dated static trip yielded AOK departure +68 s, `BETWEEN_STOP_UPDATES`, no direct provider AOK clock. The concurrently read online board reported +96 s, a model-derived departure. That 28 s gap needs exact runtime/source/model-clock alignment to attribute conclusively; do not claim it is an observed real delay or caused solely by physics.
- Tram 1 / trip `94132`: the new source-clock replay yielded AOK +71 s, not the earlier PERIX 0 s. This is evidence of changing source inputs, not proof that the earlier INSA comparison was simultaneous or erroneous.
- Tram 3 / trip `1429613`: the new source contained a direct AOK departure +175 s. Tram 10 / trip `885195` now propagated +11 s. These later values must not be substituted into the earlier +116 s / −58 s comparison.
- None of the four captured trip updates carried a trip-specific timestamp. Do not promote the feed-generation timestamp into a new trip forecast or a physical observation.

Evidence under the approved Temp directory: `perix-live-aok-source-anchors-20261102-evening-v1.json` and `perix-aok-source-clock-replay-20261102-evening-v1.json`. The latter pins the input report SHA-256 (`7f7e5aa74fc71fe4bbec70072598b7a089c2778a8b71fc2e1a2ca402e1fb2c59`) and dated static network SHA-256 (`985578c1af0b92339c3b2d26c26edb23cc31504389b6c331ae0cc78a9a5ab9f8`). It uses the existing source normalizer and timeline functions with a non-listening database URL, without physics fitting, importing or provider calls.

### Validation and remaining boundaries

- **188 selected backend tests passed**, including the five new recovery tests plus preview/publication/neighbor-clock/source-reconciliation regressions; one existing dependency warning.
- **49 frontend tests passed** and `npm run typecheck` passed. Helper and source-integration tests do not replace a local/staging browser check of marker creation/removal.
- These changes invalidate previously recorded working-tree hashes for modified files. The old hunk-classification report and whole-file hash list do not approve a clean release artifact; regenerate an exact selected-package manifest only after dependency review. No commit, push, deployment, hosted configuration change or production write was performed.
- The earlier ten hard-coded schedule-only entries are still a local policy prototype, not a complete version-scoped partial-geometry publication contract. They require separate end-to-end review, including estimator fallbacks, stop-board authority and previews crossing a hidden interval.

## AOK clock-flow resolution from a retained online event

A bounded GET of `/api/mobility/v2/diagnostic/source-timing` for exact trip `938920`, version `net_9d97f995b79a`, date `2026-11-02` recovered **one** `SOURCE_PLAN_REFRESH` event recorded at **20:11:51 UTC**. It contains paired source and model timelines for all 33 stop occurrences. The raw report is `perix-aok-source-events-20261102-evening-v1.json`; capture SHA-256 `807e2cb887536a0c0963f0176bf116e7e9576bcb13bd372782f2ad15ebc35f3c`. This is worker-local bounded diagnostic evidence, not an external physical observation. The retained event does not include full trajectory, atomic geometry identity or previous plan, so it cannot completely reproduce the original solver state.

The paired event directly explains the **68→96 s** discrepancy in the concurrent board sample, without claiming the earlier INSA comparison had identical input clocks:

| Stop | Source clock | Model clock | Model excess over source |
|---|---|---|---:|
| Hasselbachplatz | 21:06:08 | 21:06:08 | 0 s |
| Domplatz | 21:07:08 | 21:07:17 | 9 s |
| Leiterstraße | 21:08:08 | 21:09:18 | 70 s |
| Goldschmiedebrücke | 21:09:08 | 21:10:37 | 89 s |
| Alter Markt | 21:12:08 | 21:14:28 | 140 s |
| Am Katharinenturm | 21:13:08 | 21:15:11 | 123 s |
| Opernhaus | 21:14:08 | 21:15:48 | 100 s |
| Universität | 21:16:08 | 21:16:54 | 46 s |
| AOK | 21:17:08 | 21:17:36 | 28 s |
| S-Bahnhof Neustadt | 21:18:08 | 21:18:16 | 8 s |
| Mittagstraße | 21:20:08 | 21:20:08 | 0 s |

At AOK, captured source and model arrival equal their respective departures: **zero dwell was added there** in this event. The previous model departure at Universität is 46 s later than the source. Its modeled Universität→AOK leg takes 42 s, versus the source's 60 s: **46 + 42 − 60 = 28 s**. Thus 18 s of the carried excess is recovered on that leg. This confirms coherent arithmetic of the published model, **not** that the excess or the route is physically accurate. The peak is accumulated earlier, especially Leiterstraße and Alter Markt, rather than a new 28 s delay invented at AOK.

`tools/audit_source_model_clock_flow.py` now audits paired diagnostic clocks offline with exact occurrence alignment, integer clocks, ordering and nonnegative dwell checks; it refuses overwrites, scopes events to the requested trip/version/day and does not treat absent timelines as a pass. The report `perix-aok-clock-flow-audit-20261102-evening-v1.json` accounts for the complete event. Eight new tests check carried/recovered excess, separate arrival/departure/dwell and malformed inputs; **50 selected tests passed**, with one dependency warning, together with effective-ETA, lateness, neighbor-clock and generation-recovery checks.

### Existing-solver sensitivity: last leg fits even with a 50 km/h global cap

A separate offline solver replay used the captured event's source target clocks with the region-wide **candidate** OSM reconstruction and existing edge/turn/acceleration/braking rules. Two scenarios (default tram global cap 65 km/h and experimental 50 km/h) both reached AOK at source target **21:17:08**, with natural Universität→AOK leg duration **41.942 s** and `NATURAL_STRETCH` to the 60 s target. No posted limits were raised; traffic/signals were absent and added dwell was zero. This demonstrates that the last leg is not inherently unable to fit the target under those local inputs.

Report: `perix-aok-physics-sensitivity-20261102-evening-v1.json`. The offline candidate is **not the original deployed atomic generation**; previous plan/history and runtime inputs were not retained. Therefore the replay's absence of AOK excess is a sensitivity result, not a reproduced online cure. Exact geometric/physical cause of the upstream online excess remains unresolved. Do not remove 28 s from online ETAs or adjust caps solely to force agreement.
