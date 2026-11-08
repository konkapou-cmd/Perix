# Small three-stop consistency addition to the existing motion engine

## Scope and patch size

This is a local, default-off addition on top of the existing WIP. No commit,
deployment, GTFS activation, production write or real Google request was made.
It is **not** a production overlay; do not deploy the dirty checkout.

| Code file (relative to backend) | Added | Removed / rewritten |
|---|---:|---:|
| `mobility/motion/engine.py` | 76 | 0 |
| `mobility/motion/config.py` | 3 | 0 |
| `tests/test_mobility_motion_lookahead.py` | 244 | 0 |

Total runtime addition: **79 lines**. Test addition: 244 lines / 34 cases.
Counts are against the pre-task local snapshot, not against Git HEAD, which
already contained substantial unrelated WIP. Forward and reverse application
checks passed for `task-only.patch` without applying/reverting working files.
Of 503 snapshotted pre-existing source files, **501 are byte-unchanged**;
only the engine and its config changed. Builders, handover, GPS, geometry,
contexts, identities, effective ETA resolver, worker, API and frontend remain
unchanged by this task, as do the earlier wait-only implementation and reports.

## What already existed / what was missing

`_fit_leg()` already fits the immediate target using `recovery_ratio`, removes
recoverable soft delays and reports `physics_limited_s` at the fastest legal
trajectory. Its implementation is **unchanged**. The effective motion/ETA
timeline and current-state handover also already existed; neither is duplicated.

The missing opportunity was a conservative departure floor inherited from a
previous cached plan. `_build_trip_plan()` could retain that old hold even
after a fresh explicit departure prediction and three corroborating arrival
updates brought the targets forward. This addition can shorten **only that
obsolete cached remainder**, not arbitrary source dwell or scheduled holds.

## How the two extra predictions are used

Before finalizing each normal fit, the small `_arrival_recovery_hint()` helper
checks the next three anchors from the existing anchor loop: the immediate
arrival and the two following arrivals. There is no new position calculation,
worker, planner, future-leg solver or state store.

- Compare absolute arrival clocks against the previous plan's **raw** source
  clocks, not countdown ETA or previously projected effective clocks.
- Require matching trip/day/version/generation/geometry/topology scope.
- Require explicit GTFS-RT arrival evidence on all three old and new entries,
  strictly newer source timestamps, and old/new source ages within 90 seconds.
  Receipt time is not substituted for source freshness.
- All three advances must have the same sign, exceed the configured threshold
  (default 3 seconds), and differ by no more than the configured spread
  (default 5 seconds). Out-of-order clocks are rejected. The conservative
  common advance is the **minimum**, not the sum, of the three advances.
- Missing/stale/propagated/inconsistent/jitter-only evidence leaves the
  original numerical behavior intact. Three later targets authorize no early
  release; the existing immediate-target solver handles them as before.
- The next triad changes naturally as the existing loop advances. Fewer than
  three corroborating arrivals gives no extra intervention.

The immediate arrival remains the unchanged target. Additional predictions
cannot raise speed caps, rewrite the current position, infer stop passage,
or apply a downstream time saving a second time.

## Recovery order and bounds

1. Run the existing `_fit_leg()` normally. If it can meet the target, nothing
   further is needed: the lookahead must not invent an additional speed bonus.
2. Only if the normal result is physically limited, the current plan is at a
   station rather than in a moving handover, and a fresh explicit departure
   update is present, consider the inherited cached hold.
3. Bound release by the common three-arrival advance, the remaining target
   miss, and the genuinely optional cached hold. Preserve `_stop_departure()`'s
   source/minimum dwell and scheduled departure, any initial departure floor,
   confirmed-departure markers and NOW (no retroactive departure).
4. Re-run the **same fitter** once with the resulting available duration.
   Accept only if the resulting immediate arrival is no worse; otherwise keep
   the original result. No time compression or physical-cap changes.

The existing sequential planner carries the new departure/arrival into the
same MOVE/DWELL segments and effective timeline. No marker code was changed.
Moving replans retain the existing handover unchanged; when the current fitter
already performs the necessary recovery, this addition deliberately does not
modify that trajectory again. The threshold stabilizes the **extra lookahead
intervention**, not a new global filtering or suppression of immediate ETAs.

Configuration lives in the existing region motion config under `common`:
`arrival_lookahead_enabled=false`, `arrival_lookahead_threshold_s=3.0`,
`arrival_lookahead_spread_s=5.0`. Google Locator and native/allocation research
calls are excluded. The earlier strict wait-only policy retains precedence.
No runtime setting was changed.

## Validation

- Pre-task baseline: **525 relevant tests passed**.
- New targeted cases: **34 passed**.
- Final combined regression: **559 passed**, no skips/deselections; one existing
  `python_multipart` deprecation warning.
- Coverage includes coherent and conflicting revisions, old/new freshness,
  missing source/departure evidence, a single remaining arrival, minimum dwell,
  scheduled/source/confirmed departures, impossible targets, caps and dynamics,
  unchanged moving handover, no backward movement, triad rollover, repeated
  inputs, scope/context isolation, and marker/effective-arrival agreement.

The actual pre-task engine snapshot and the new engine were also compared
against the **same stored synthetic inputs**, independently initialized from
the same old observation. With the feature off, all ten comparison cases were
identical to the actual pre-task engine. Selected results:

| Synthetic case | Source-target miss before | After | Modeled progress gap at that source ETA before → after |
|---|---:|---:|---:|
| Bus, consistent revisions + obsolete hold | 7.498 s | 0 s | 33.735 m → 0 m |
| Tram, consistent revisions + obsolete hold | 10.002 s | 0 s | 50.017 m → 0 m |
| Bus, impossible target | 29.098 s | 14.098 s | 323.762 m → 115.429 m |
| Tram, impossible target | 31.626 s | 16.626 s | 342.791 m → 134.457 m |

The impossible cases remain physically limited. Stale, isolated-update and
mandatory-departure cases are unchanged. Position and speed at the update
boundary are unchanged in every comparison.

**These are synthetic source-target consistency metrics, not measured GPS
position errors or verified real arrival improvements.** Existing Museum
captures do not contain the successive as-of forecasts and historical marker
states needed for an independent no-hindsight accuracy backtest. The feature
therefore remains **disabled** pending such evidence.

This patch also does not change the separately identified unposted service-road
fallback speed near Museum. A physically impossible target remains impossible
under the same caps; the lookahead is not a workaround for an incorrect cap.

## Artifacts / repeat tests

- `task-only.patch`, `patch-verification.json`: exact local task delta and hashes.
- `baseline-regression.xml`, `new-unit-results.xml`, `regression-results.xml`.
- `stored-comparison-inputs.json`, `comparison-results.json`: identical-input A/B
  inputs, hash and results; no live feed/GPS ground truth implied.

From `Perix-main/backend`:

```text
python -m pytest tests/test_mobility_motion_lookahead.py -q
```

The private original source snapshot and the A/B runner are retained in the
approved temporary `perix-three-stop-lookahead-20261027` directory. Existing
source files were never reverted, reset or overwritten from Git HEAD.
