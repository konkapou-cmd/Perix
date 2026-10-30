# Mobility load / long-session continuity audit

## Scope and status

Baseline read-only investigation of live deployment
`a7360ffb-4c82-4f16-bacc-bd7861111c5e` at `https://app.perix.eu`.
No application code, database, environment or deployment was changed during the
baseline audit. The subsequent frontend correction is documented below.
No vehicle IDs/positions were invented, no real GPS was altered, and
paid Routes / API mutations were blocked in the test browser.

Question: can map movement, load ordering or an open session lose later
bus/tram journeys? The observed physical-vehicle case was **not reproduced**;
the checks below distinguish transport data coverage from renderer membership.

## Live desktop continuous session

Window: `2026-10-24T05:09:47Z` through approximately `05:15:56Z`.

- Six minutes, **59 successful fleet responses**, **one network-map HTTP fetch**.
- Pan twice and zoom to 16 then 14; no network-map HTTP reload on those gestures.
- **No API vehicle omitted by the bridge/renderer** in the sampled responses.
- No canonical reprojection shift above 10m and no browser runtime exceptions.
- Fleet grew from 44 to 49; 51 distinct virtual vehicle IDs appeared overall.
- **16 current-journey transitions**, including **9 tram** and 7 bus transitions,
  were delivered and rendered. Tram transitions included lines 1, 4, 5, 6, 9, 13.
- Fleet HTTP latency: min 0.940s, median 1.858s, max 4.581s.
- Actual interval between updates: median **5.865s**, max **8.714s**. The poll
  intentionally waits four seconds *after* completion; it is not a 4s end-to-end
  interval. The map request took 1.464s in this already-warm window.
- Two extra local line draw calls occurred around zoom changes, even though
  line geometry had not changed. Stop draw calls were also zoom-dependent.

## Mobile browser stress sample

Three minutes at 390×844, device pixel ratio 3, touch/mobile emulation and
**4× CPU throttling** (not a physical-device certification):

- **27 successful fleet responses**, one map HTTP fetch.
- No incomplete bridge delivery, missing API marker, >10m canonical projection
  shift or runtime exception.
- Six current-journey transitions were observed (three tram / three bus).
- The same pan/zoom experiment produced two unnecessary local line redraws.

The instrumentation counted marker records and compared actual API IDs and
journey identities. This does **not** prove every physical tram has a correct
provider journey or that every overlapping icon is visually distinguishable.

## Backend coverage versus dated source windows

The probe queried the actual HTTP worker (including its warm motion cache),
not a new Python process's empty motion cache, and compared it to current
dated schedule/realtime windows, cancellation overrides and detour safety gates.
Immediate ±15s handover edges were excluded from missing-trip assertions.

- `05:09:55Z`: 44 vehicles (20 bus / 24 tram), 38 source-active trip windows,
  **0 unexplained safe missing journeys**.
- `05:16:20Z`: 50 vehicles (23 bus / 27 tram), 37 source-active trip windows,
  **0 unexplained safe missing journeys**.
- No sampled next journey was hidden by a prior cached effective trip window.
- Current network: `net_9a2c2928a241`, date `2026-10-24`; previous-day scope
  remained separate and emitted no active vehicles in these probes.

The source-window test is internal model consistency, not measured GPS or
independent proof of the real fleet frequency.

## Confirmed visual overlap

At `05:22:31Z`, three genuine API entries occupied the same model point
`52.13077, 11.62880`, all `TURNAROUND_ANCHOR`:

- Bus 51 toward Biederitz, Weidenring — trip `819321`.
- Tram 13 toward Sudenburg (Kroatenweg) — trip `695882`.
- Tram 4 toward Klinikum Olvenstedt — trip `553628`.

All three entries exist in data and as separate marker records, but their
same-point icons can cover one another. This is a real way to *visually* hide
a vehicle without a failed load. It is **not yet proof** that this explains
the user's particular two later trams. Do not move geographic coordinates to
separate them; any remedy should be a count/selection UI using exact identities.

## Source findings and repair priorities

1. **Separate static line and stop bridge effects.** Web currently sends both
   when only the stop subset changes on zoom/selection. Avoid serializing all
   route points again. Stable stop visibility buckets should prevent unchanged
   subsets getting new array identities.
2. **Fix static snapshot recovery/freshness.** Locator loads `/v2/map` once for
   the active tab/session, silently catches initial failure, and does not refresh
   it during a long unchanged session. A first load failure can leave lines/stops
   absent; later network/date/generation changes can leave an old snapshot.
   Refresh by data revision/scope, not by viewport movement, with bounded retry
   and stable references for unchanged data.
3. **Use dated canonical joins in Locator.** Its path lookup currently uses
   pattern ID alone, unlike Home's date/version-aware join. Long-session scope
   changes must not put a vehicle on an older version's path. A missing path
   must still leave the vehicle at its supplied coordinates.
4. **Native bridge has additional static churn.** Its one injection effect
   includes lines/stops and vehicle data together, so native vehicle updates
   resend full static geometry. This is established by source inspection; the
   physical native app was not exercised here.
5. **Foreground/error recovery should be explicit.** Locator's fleet poll is
   navigation-focus-aware but has no dedicated visibility/AppState wake-up and
   retains the last fleet silently through errors. API GETs can retry three
   15s attempts, with up to 10s online wait per attempt, then poll backoff up to
   30s. This can visibly freeze data during connection/resume problems. Show
   freshness/failure status and request a fresh snapshot on resume; never invent
   forward positions or new vehicles to mask an outage.
6. **Handle icon coincidence without changing positions.** The actual overlap
   above needs an accessible count/selection treatment rather than silently
   covering lower markers.

Some stop markers are deliberately hidden below zoom thresholds (major stops
at 13.2–15.3, all stops above 15.3); this is not partial network download.
The nearby vehicle *list* is capped, but map vehicles are not capped to that list.

## Follow-up needed for the reported physical observation

Obtain one example with route number, stop/platform, direction, approximate
local time, map versus arrival-list view, and whether the app was backgrounded
or the screen locked. Then compare that exact dated trip/provider evidence to
what the app returned. With no measured vehicle GPS, do not dismiss the real
observation merely because API-to-render continuity passed.

## Evidence

`C:\Users\PC\AppData\Local\Temp\opencode\perix-continuity-audit`:

- `browser-2026-10-24T05-09-47-963Z/summary.json`, `samples.json`.
- `browser-mobile-2026-10-24T05-19-21-778Z/summary.json`, `samples.json`.
- `production-coverage-20261024-050958.json`.
- `production-coverage-20261024-051623.json`.
- `coincident-positions.json`.

Audit helpers are retained beside that folder as
`perix-continuity-browser.cjs` and `perix-continuity-probe.py`.

## Implemented correction and staging validation

Frontend-only candidate, staging deployment
`b5685f8a-a04f-4cd4-9e9c-6556f76476f9`:

- Static network cache is shared between Home/Locator, coalesces reads, refreshes
  after five minutes, retries missing dated scopes at bounded 30s intervals,
  and retries initial failures exponentially. Unchanged line/stop references
  survive refresh; invalid/failed responses retain the last valid snapshot.
- Vehicle geometry joins require exact pattern, network version and service
  date. Missing/stale geometry leaves vehicles at supplied positions; estimated
  reprojection disagreements over 10m cannot pull vehicles onto an old path.
- Web/native bridge effects send vehicles first and independently of lines,
  stops, approach, plan and controls. Stable path references avoid per-poll
  serialization. Native bridge behavior has automated, not physical-device,
  coverage.
- Locator pauses fleet/arrival/detail polls while hidden, immediately refreshes
  on foreground return, shows failures/data age, and refreshes selected detail
  when the dated journey changes.
- Coincident stationary source IDs get a count/menu, without offset positions.
  Stop metadata/listeners and marker layer order were corrected. An initial
  null zoom is consumed once, so later parent echoes cannot undo a gesture.
- Isolated candidate: **73 frontend tests passed**. Workspace TypeScript passed;
  the isolated baseline still has five known `CityAdViewer.tsx` diagnostics.
- All **261 staged runtime file hashes matched** the candidate; paid Routes
  remained disabled. Only `backend/webdist.dat` differs from production.

Staging resilience at `13:04:44Z`: recovery after three browser-injected map
failures (four map attempts); pan/zoom caused **zero line redraws/reloads**;
foreground fleet request began in **11ms**; fleet failure was visible, retained
67 markers and recovered automatically. Actual coincident bus 54/57 source IDs
were individually selectable; **67 API / 67 rendered**, zero runtime exceptions.

The 180s mobile stress sample ending `13:08:18Z` had 20 fleet responses and one
map fetch. Its first 5s delivery deadline expired before iframe readiness
(0 vehicle/line/stop messages, 0 markers); the next sample had all 67 markers.
All 19 subsequent deliveries passed, with no missing paths, >10m projection
shifts or runtime exceptions. There were 18 journey transitions (five tram),
zero post-initial line redraws and four zoom-dependent stop draws. The original
startup failure is retained, not relabeled as a passing sample. A follow-up
probe separately records readiness and startup delivery time.

Evidence: `perix-mobility-continuity-release/stage-resilience/result.json` and
`perix-continuity-audit/browser-mobile-2026-10-24T13-04-49-995Z/summary.json`.
CPU-throttled browser timing is not a physical-device benchmark or latency SLA.

Follow-up mobile sample ending `13:11:45Z`: 120s, **15/15 complete deliveries**,
one network fetch, no missing markers/paths, projection shifts or exceptions;
11 journey transitions (five tram), zero post-initial line redraws. Evidence:
`browser-mobile-2026-10-24T13-09-33-862Z`.

Additional source coverage probes:

- Staging `13:12:01Z`: 70 vehicles (29 bus / 41 tram), 50 active source windows.
  **One source-window discrepancy**: tram 1 trip `440717` toward Kannenstieg was
  absent while its same-run vehicle remained on trip `1332839` toward
  Pfeiffersche Stiftungen, whose source window ended 165s earlier. This may
  reflect a held effective motion plan rather than renderer loss; it is not
  certified as an erroneous hold or the user's physical observation. It remains
  separately recorded in `staging-coverage-20261024-131203.json`.
- Production before promotion `13:12:21Z`: 72 vehicles (30 bus / 42 tram),
  57 active source windows, **zero safe missing source-active journeys** and
  zero held-by-prior-trip discrepancies. Production network version differs
  from staging; the frontend package does not copy staging data/configuration.
  Evidence: `production-coverage-20261024-131223.json`.

Neither snapshot guarantees all physical departures. Do not treat the staged
source discrepancy as repaired by this frontend release or invent another
vehicle to compensate for it.

## Production promotion and resilience

Active production `6af7f55d-f6bf-4f04-9ba6-fed9d9dcd4ba` is a frontend-only
promotion over `a7360ffb-4c82-4f16-bacc-bd7861111c5e`. All 261 runtime hashes
and the actual served entry/map HTML match the frozen package; paid Routes
remain disabled. The previous package was independently hash-verified/frozen
for rollback. See `PRODUCTION_RELEASE_2026-10-24.md` for artifact identities.

Post-promotion source check at `13:13:56Z`: 70 vehicles (30 bus / 40 tram),
52 active source windows, zero safe missing journeys or prior-trip holds.

Production resilience run ending `13:15:44Z`:

- Three injected map failures recovered on attempt four.
- Pan/zoom produced zero line redraws and no extra map HTTP fetch.
- Foreground refresh request started in 14ms.
- Fleet failure was visible, retained 70 markers, and recovered automatically.
- **70 API / 70 rendered**, zero runtime exceptions.
- Real coincident tram 4/5 entries appeared in the selection popup. A separate
  follow-up clicked **both** exact IDs and each returned its own current trip,
  including the lower, scrollable popup option.

The first production resilience attempt timed out waiting for popup buttons
after the preceding recovery checks. No cause was established from that attempt;
do not silently count it as passed or claim a proven race. The instrumented
rerun and independent two-ID click check passed without application changes.
Evidence: `production-resilience/result.json`, `stack-diagnostic.json` and
`stack-diagnostic.png` in the release directory. The failed shell diagnostic
is retained as `sh_16e0ba24f001fsRzShlblh37Xt`.

Production mobile continuity ending `13:16:46Z` (180s, DPR 3, 4× CPU):

- **24/24 complete fleet deliveries**, one network-map HTTP request, no
  missing API markers, >10m projection shifts or runtime exceptions.
- **12 journey transitions: 10 tram, two bus**, all delivered to the renderer.
- First sample had all 70 markers at supplied coordinates but 55 lacked paths
  while initial static network data was loading. The map response took 6.531s
  to response headers; by the second sampled update every path was available.
  The raw missing-path sample remains in the report. This demonstrates the
  intended vehicles-first behavior, not zero startup geometry latency.
- One line draw occurred when that initial static geometry arrived; **no
  additional line draw on the later pan/zoom gestures**. Initial empty/full
  line messages are not classified as repeated camera-driven geometry loads.
- Evidence: `browser-mobile-2026-10-24T13-13-39-518Z/summary.json` and
  `samples.json`. Compared with baseline mobile, redundant camera-driven line
  redraws fell from two to zero; no claim of faster fleet HTTP or polling SLA.

The confirmed frontend correction and safe deployment are complete. Physical
fleet completeness and the separately recorded staged source-window discrepancy
remain unproven/unresolved; neither is represented as fixed by renderer tests.
