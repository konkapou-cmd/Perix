# Native realtime recalibration — implementation and real GTFS-RT shadow replay

## Outcome and boundaries

Implemented a provider-free rolling bus recalibration extension over the existing
motion engine. Removed the active TomTom implementation and its integration,
tools, configuration and dedicated tests, following the user's final instruction
to remove it (which superseded the earlier instruction to retain its adapter).
Historical release reports/patches remain intact; they are not active modules.

**44 new units passed; 415 relevant regression tests passed**, no skips, one
existing python-multipart deprecation warning. No deployment, commit/push,
production configuration change, passenger change, traffic-provider request,
Google WIP change or tram-model change. The user's reported 403 has not been
attributed to a particular endpoint here; the four GTFS-RT captures below were
HTTP 200. No attempt was made to retry or bypass a provider 403.

This is a local, explicitly invoked shadow mechanism, NOT a production-ready
replacement for passenger motion. `MOBILITY_NATIVE_RECALIBRATION_ENABLED` defaults
false. The replay uses an explicit private session override, not production flag
activation. No live worker, polling loop or public position contract was added.

## Inspection: existing versus added

Already present:

- Canonical directed OSM paths and atomic network generations.
- Separate GTFS arrival/departure targets, stop relationships and delay handling.
- Existing forward acceleration / backward braking spatial envelope, turn caps,
  bus/tram builders, `_fit_leg`, carried physical lateness, effective timelines.
- Handover and history copying when an earlier plan is available; stable trip
  identities and geometry/network separation; no need to create another engine.

Confirmed gap: `_fit_leg` fits long targets with a global time multiplier. Even
after a handover fixes position, this can divide the initial speed by that
multiplier. Rebuilding a moving remainder can therefore change speed instantly.
The existing time-allocation experiment reports possible scenarios but, without
distinguishing observations, deliberately selects the previous baseline.

Added:

1. `native_recalibration.fit_remaining_leg`: reuses the bus builder's road/turn
   constraints and the existing `build_speed_trajectory`. Fits spatial cruise
   caps with a braking-distance transition from the carried initial speed;
   **time_scale remains 1**. There is no new integrator or traffic adapter.
2. Bounded geometry-weighted and known, directed signal-location alternatives.
   Holds are limited by existing configuration and are explicitly hypothetical.
   Ranking prefers target-compatible motion with fewer stops/speed manoeuvres;
   agreement with ETA is not evidence of a real red phase or congestion.
3. `PERIX Inferred Slowdown = max(0, remaining target - physical reference)`.
   Its cause is UNKNOWN, not measured traffic. No delay is added onto GTFS-RT.
4. `NativeShadowSession`: owns only its private plan, source watermark and exact
   trip/date/start-time/generation/path identity. It evaluates the old curve at
   NOW, preserves completed segments, and replans from the exact unrounded speed.
   Changed completed predictions alone and identical forecasts do not refit.
5. Source timestamp, receipt/future/freshness, conflicting same-timestamp,
   out-of-order, NO_DATA, cancel/delete, stop-sequence and topology guards.
   Missing state causes an explicit cold start, not a continuity claim.
6. Pure checkpoint export/restore for callers that have state across restart;
   no automatic persistence was enabled. A new forecast after an unavailable
   state interval >90s requires reseeding instead of manufacturing continuity.
7. `native_realtime`: occurrence-safe private replay normalization. Preserves
   TripUpdate timestamp (or explicit FeedHeader fallback), stop_sequence,
   separate arrival/departure and epoch-over-delay precedence. Sparse prediction
   propagation, NO_DATA reset, skipped/canceled semantics and extended hours are
   exercised without rewriting the passenger GTFS worker.

Only the **active remaining leg** receives the new nonlinear distribution fit.
All later stops are still evaluated in sequence by the existing trip fitter,
which carries physical misses and dwell forward. This bounds native computation
and avoids prematurely refitting every future leg. An unchanged current target
retains its exact previous tail when later forecasts change. A future leg is
never clipped from its old wall-clock position when its departure shifts.

The current production worker stores receipt time and stop-id dictionaries; it
does not yet provide this complete occurrence/source-clock boundary to a live
native session. This phase deliberately did not wire an unsafe receipt-only
substitute into passenger processing. That integration is a remaining rollout
task, not something silently claimed complete.

## REAL GTFS-RT observations and canonical scope

Four bounded public requests to the application's existing GTFS-RT source,
`https://realtime.gtfs.de/realtime-free.pb`, all HTTP 200:

| UTC receipt | Feed header epoch | Entities | Exact bus trip matches in today's candidate |
|---|---:|---:|---:|
| 09:01:10 | 1793005255 | 99,249 | 171 |
| 09:02:21 | 1793005315 | 99,755 | 173 |
| 09:03:34 | 1793005375 | 99,876 | 173 |
| 09:04:43 | 1793005465 | 99,977 | 174 |

Raw public GTFS-RT files and frozen canonical inputs stay in the approved local
temporary evaluation directory, not in the source/release patch. Their hashes
and acquisition metadata are recorded. No Traffic API data was used or retained.

The active production network `net_7f0605d2409e` is dated **2026-10-25** and had
zero exact bus-trip matches to these 2026-10-26 captures. The first replay records
this failure honestly (`real-gtfs-replay.json`), without rebinding nearby stops.

A second read-only lookup found the existing, **inactive** 2026-10-26 candidate
`net_7c4078011f7f`: 1,805 scheduled bus trips and 85 ready bus bundles. Its GLOBAL
generation state is **BLOCKED_CHANGED_PATTERNS**. Only individually ready,
validated bus generations were exported for isolated replay; the candidate was
NOT activated, globally declared ready, repaired or used to change passengers.

The bounded selection evaluated six active trips (53/258003, 71/1209627,
69/820046, 71/678105, 61/304360, 66/491847). This is not a representative fleet
sample or a coverage percentage. Across these cases: 6 initializations, 8 later
plan rebuilds, 6 unchanged updates with no rebuild, 28 modeled comparison rows
(update boundary and +30s), 7 distinct native fits. Repeated historical native
diagnostic records in clipped past segments are not additional solver executions.

Other source records were excluded as follows (record occurrences across four
Germany-wide captures, not unique local buses): 396,565 not in the frozen bus
network; 523 known bus updates outside their active trip window; 75 without a
ready bundle; 73 omitted by the six-trip replay cap (not validity rejections).
There were 35 local-stop absolute prediction revisions; stop overlap by itself
does not verify bus mode or canonical trip identity.

## PERIX A/B/C comparison with real inputs

- A: existing physical fitter without provider observations.
- B: existing physics-aware time allocation without provider observations.
- C: native rolling recalibration, initialized from the same baseline model.

At each accepted update, all three alternatives receive the **same previous C
state**, frozen path/generation, clock, stop sequence, config and feed timeline.
Only C is committed to the private session. A/B are counterfactual alternatives
from that shared state, not separately evolved passenger histories. B correctly
equals A where its existing no-observation policy retains baseline.

The table samples the constructed paths **30 seconds after the update**. These
are numeric model outputs from real feed replay, NOT GPS or observed positions.
At the update boundary itself the native position/speed jumps were both zero.
GTFS ETA is an absolute local Europe/Berlin service clock on 2026-10-26.

| Line / trip | Next stop | GTFS ETA | A progress m | B progress m | C progress m | C−B m |
|---|---|---|---:|---:|---:|---:|
| 71 / 1209627 | Umfassungsstraße | 10:03:31 | 6756.85 | 6756.85 | 6821.46 | **+64.61** |
| 71 / 1209627 | Neustädter Friedhof | 10:06:39 | 7149.51 | 7149.51 | 7189.72 | **+40.21** |
| 71 / 678105 | Reiterweg | 10:04:52 | 7022.10 | 7022.10 | 7034.44 | **+12.34** |
| 66 / 491847 | Langenweddinger Str. | 10:03:06 | 2189.93 | 2189.93 | 2196.77 | **+6.84** |

All four table targets have **RT_PROPAGATED** provenance: they are correctly
normalized sparse GTFS-RT timing constraints, not four independently observed
stop predictions. The +64.61m/+6.84m cases keep an unchanged current tail while
other stop forecasts change; they must NOT be described as a new delay at that
current stop. Three trips have progress differences >0.1m at the +30s samples.

### Real delay increase example

Trip 1209627, line 71 toward S-Bahnhof Neustadt, update receipt 10:03:34: the
normalized next-arrival constraint moved by **+68s**, to 10:06:39. The additional
remaining inferred burden is about **119.77s relative to physical reference**,
not a measured traffic delay and not merely the +68s forecast revision.

At the +30s sample: A/B progress 7149.51m versus C 7189.72m; speed **13.86 versus
12.78 km/h**; remaining distance **584.91 versus 544.70m**. C fits the target to
about 0.0013s numerical residual. It starts at the old curve's state, slows under
the same road/vehicle limits and does not attribute slack to an observed queue.
The exact requested +120s scenario is a synthetic unit edge case; it was not
claimed to have occurred in these four real snapshots.

### Real impossible / sharply reduced ETA example

Trip 491847, line 66 toward Bördepark West, receipt 10:04:43: an **RT_EXPLICIT**
next-stop constraint decreased by **186s** to 10:04:00 (already 43s in the past).
The previous modeled state is at 2851.31m, speed 27.29 km/h, still **1003.72m**
from stop 71585. Both A and C preserve that current position; C reports
`NATIVE_PHYSICS_LIMITED`, about **122.56s target miss**, and inferred slowdown 0.
The vehicle is not teleported to satisfy the impossible feed clock. The maximum
remaining-plan miss in this selected replay is **149.305s**, not zero.

## Physics, uncertainty and accuracy

On distinct native fits: **0 construction physics violations**, **0 backward
phases**. At accepted update boundaries: maximum native position jump **0m**,
maximum speed jump **0 km/h** at reported precision. Checks include analytic
distance/time consistency, vehicle speed bound, acceleration/braking bounds,
phase continuity and the carried initial speed. Underlying spatial solvers keep
road/turn constraints. A time-compatible scenario envelope is not a statistical
confidence interval or a complete set of possible bus locations.

These tests do not prove where a bus actually was. No independent GPS or
confirmed passage-time labels were acquired. The same GTFS-RT used as a target
was NOT reused as independent accuracy truth. Better deadline consistency and
continuous speed are engineering properties, not demonstrated spatial accuracy.
Future deadlines that cannot be met remain visible as physical misses.

## CPU / latency measurements

Local wall-clock stage times for the **8 real-input recalibration events**:

| Stage | p50 ms | p95 ms |
|---|---:|---:|
| A baseline plan build | 33.95 | 393.38 |
| B existing allocation research | 195.92 | 832.26 |
| C private native session update | 95.43 | 446.79 |

C includes validation and immutable result/state copies; A/B cover their plan
construction. The small sample and differing bookkeeping scopes do NOT support
a general performance advantage claim. Relative to A, the observed stage p50
difference is about +61.48ms and p95 difference +53.41ms, not a fleet capacity or
end-to-end API latency guarantee. Request/network latency was not separately
instrumented during capture. Whole-fleet load and memory validation remain open.

## Regression coverage and removal

New units ran first; then explicit related suites (never the destructive shared
`test_db` fixture), using unreachable localhost Mongo and a dedicated offline DB
name. Coverage includes +120s, recovery/near-stop and impossible targets,
duplicates, source conflicts/staleness/order, retained current tails, future-stop
timing propagation, NO_DATA/skips/cancel, exact occurrences/extended hours,
epoch-over-delay precedence, checkpoint restart, instance/generation/path guards,
no provider reads, no passenger-cache writes and bounded invalid-grid handling.

Native units: **44 passed**. Relevant suite: **415 passed**, no skips. Existing
bus/tram, effective timelines/consumers, handover, calibration, Google WIP,
signal semantics, static profiles and generation regressions are included.
Provider-specific tests were intentionally removed with the retired feature;
this count is not directly comparable to the old 368-test suite. CI was updated
to run native units first and then the explicit suite; no remote CI run claimed.

Added source files:
- `mobility/motion/native_recalibration.py`
- `mobility/motion/native_realtime.py`
- `tools/replay_native_recalibration.py`
- `tests/test_native_recalibration.py`

Modified existing source/workflow:
- `mobility/motion/engine.py` — remove provider gates, add private frozen/shadow paths.
- `mobility/motion/time_allocation.py` — retain native geometry research, remove provider branch.
- `mobility/motion/traffic.py` — remove retired provider cache hook; Google/static paths preserved.
- `mobility/v2.py` — remove private sampling research endpoint/provider status; native shadow status.
- `utils/mobility_workers.py` — remove provider scheduler startup.
- `tests/test_mobility_time_allocation.py` — remove retired provider-only cases.
- `.github/workflows/mobility-physics-research.yml` — native/no-provider unit/regression ordering.

Removed: six `mobility/tomtom_*.py` modules, the sampling policy JSON,
`motion/bus_time_evidence.py`, five provider/adaptive/cache-specific test files,
and four corresponding research/benchmark tools. Exact before/after paths,
hashes and deletions are in `task-manifest.json` and `task-only-delta.patch`.
The public empty `/traffic` compatibility response and vehicle schema remain
unchanged. Old reports remain historical and may reference removed modules.

## Production evidence, readiness and rollback

`production-identity.json` records a read-only check: production still serves
approved deployment **d91ff576-492d-45e8-a388-c2b00d0746c6**, SUCCESS. No deployment
or production-write command was run. The inactive candidate was only read.
Source hashes verify bus/common/tram/config/handover/Google modules and previous
release READMEs unchanged relative to the task-start snapshot. No frontend file
was edited. Railway secrets were not modified, removed, rotated or used here.

Not production-ready: the candidate network remains globally blocked; passenger
source-clock/occurrence integration, safe durable multi-process session ownership,
fleet resource budgets, wider replay and independent accuracy evidence are still
needed. Checkpoints do not create a distributed continuity guarantee by themselves.

Rollback for this LOCAL task:
1. Keep the new flag false; no passenger activation to undo.
2. Check `git apply --reverse --check` against the task-only source delta, then
   reverse it only if the recorded post-hashes still match. If files have since
   changed, merge individual hunks; never reset the dirty checkout wholesale.
3. The approved temporary baseline contains every retired source file and exact
   pre-task WIP. A reverse patch recreates those modules/tests/tools and removes
   the four new files, without touching unrelated Google/tram/frontend work.
4. Keep private evidence reports for audit; no Mongo cleanup, key revocation,
   billing operation or production rollback is required/permitted by this task.

Replay command (run only in the isolated local evaluation process):

```
python tools/replay_native_recalibration.py --canonical-json <frozen-candidate.json> --feed-dir <four-captures> --output <new-report.json>
```

The tool refuses overwrite, verifies feed hashes, caps replay to six trips by
default (maximum explicit 20), validates trip/date/generation/occurrences and
performs no network requests or database writes.
