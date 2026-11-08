# Optical context and upcoming-approach time allocation

## Passenger contract

The source determines arrival/departure targets. PERIX chooses the **visual
distribution of that time**. A later forecast is not evidence that a vehicle is
currently stuck, nor evidence of congestion at any particular junction.

The display can nevertheless intentionally spend more optical time approaching
upcoming mapped junctions/signals/turns. This is a presentation model, not a
diagnosis. Pins remain estimates: no GPS, observed arrival or physical-speed
assurance is asserted. Reaching ETA zero completes the visual approach only.

## Implemented locally

- `mobility/motion/visual_runtime.py` now passes existing mapped approach priors
  into the original bus/tram builders. Existing acceleration, braking, hard
  geometry/turn caps and station approach shape the curve. Periodic signal
  phases remain disabled; no red light or signal stop is invented.
- The baseline `visual_spatial_slowdown_strength` defaults to **0.35** and is
  bounded to [0, 1]. This is a new explicit **uncalibrated visual choice**, not a
  recovered historical calibration or a measured congestion score.
- `visual_curve_context.py` increases approach slowing on a later source
  forecast, using only the remaining leg and upcoming mapped priors. The
  existing positive-speed approach/crawl/recovery builder supplies braking and
  recovery. The slowdown weight grows toward the approach anchor. Passed
  obstacles and near-station points are excluded by existing prior selection.
- Remaining-window growth selects stronger slowing via a bounded 12-step
  search. Slowing remains bounded; excess time is distributed through optical
  normalization, not an added stop. This is a preference, **not a promise to put
  all added seconds into a single junction**. No eligible upcoming prior means
  ordinary time normalization, not an invented intersection or queue.
- Revisions retain the accepted displayed point. Shared CAS state stores the
  winning curve parameters (not a trajectory); fresh workers reconstruct the
  same profile. Metadata-only/earlier forecasts re-time the accepted remaining
  curve instead of discarding its selected shape. Source deadlines are never
  increased to accommodate physical travel time.
- `visual_context.py` connects buses to the existing `STATIC_PROFILE_V1` time,
  day and direction lookup. The first atomic per-journey/generation snapshot is
  shared across workers and frozen for that journey. It prefers scheduled
  departure on the dated service day (including >24-hour service times), or
  freezes the initial source departure if no scheduled value is provided.
  Receipt time/NOW is not a traffic lookup clock. Snapshot races use the winning
  insert; subsequent profile DB changes cannot make workers diverge. Context
  lives in the same 48-hour TTL collection as optical anchors, with a separate
  key prefix and a 2 MB serialized-context bound. DB failure fails closed for
  the pin, not the stop board. A lookup without data yields empty coverage.
- Trams deliberately do **not** consume road traffic. Both modes can use
  eligible mapped approach priors. Source arrival/departure intervals remain
  the sole dwell timing; no density-based or rush-hour dwell is invented.
- API `motion.visual_context` and the frontend diagnostic type distinguish
  modeled context, profile versions/models/calibration, per-leg edge coverage,
  active approach allocation and source dwell from observed traffic.

## What the repository does not establish

Runtime searches did not locate an operational building/population-density
speed model or per-stop population/time-of-day dwell model. Road classification
(`residential`, etc.) is not population density. Geometry avoiding buildings is
not a density model either. These influences must not be described as fully
connected or previously operational without further evidence.

The static count/BPR code is labeled `BPR_V1_UNCALIBRATED`. This work does not
prove deployed count coverage, calibration, licensing or actual traffic colour
coverage. An opt-in ephemeral Google Routes adapter also exists in
`motion/google_traffic.py`, but the runtime search found no caller of its fetch
function. It was not connected, enabled or used here, and no billable request
or Google payload persistence was introduced. Map traffic colours are not
automatically motion-engine inputs.

## Tests and evidence, 3 November 2026

- **253 selected offline backend tests passed, 1 skipped**, one existing
  `python_multipart` dependency warning. Includes optical context, spatial
  slowing, traffic lookup, source/board consistency, geometry recovery and
  motion regressions. The physical solver was not modified by this update.
- Tests directly compare the fraction of remaining profile time spent within
  the final 35 m of a mapped approach: it increases with the selected stronger
  curve. They also verify identical initial anchors/speeds, no signal hold,
  exact source endpoint, no passed-signal allocation, metadata-only retention,
  extended service hours and a competing snapshot insert.
- **19 supervised disposable-MongoDB tests passed in 124.43 s**, including
  independent workers, actual V2 HTTP and database restart persistence.
- New bus evidence: **120 samples / 3 phases / four independent processes per
  phase**. Real static-profile Mongo lookup had one covered edge (`v1`). All
  workers agreed, including after a DB profile change and fresh interpreters.
  The delayed forecast kept progress **305.5882575823217 m**, changed ETA from
  **40 to 220 s**, and selected approach strength **1.0**. It did not borrow
  the newly edited profile version `v2`.
- Updated four-worker V2 HTTP fixture includes exact mapped signal topology:
  **276 successful responses / 11 phases**. The delayed tram selected strength
  **0.991668701171875**, kept its accepted point and source clocks; recovery,
  revisions, endpoint and cancellation assertions passed.
- Actual frontend preview helpers accepted **105 captured HTTP previews**,
  including **12 approach endpoint checks**, with explicitly simulated client
  timing. This is not a real-screen rendering test.
- **53 frontend tests**, TypeScript and whitespace checks passed. Existing
  Git line-ending notices remain.

Evidence directory (the parent directory retains its earlier creation date):

`C:\Users\PC\AppData\Local\Temp\opencode\perix-mongo-isolated-20261102\visual-context-20261103-v4\`

HTTP report SHA-256:

`c7519258bce8fffb2bf514d07bcd2a39527c727f3a41976c945a1222a27b8a67`

All network/traffic/clock fixtures above are synthetic; their service date is
2 November. They are not today's live PERIX/INSA or road observations.

## Release boundary

No deployment, feature activation, commit or push occurred. Visual mode remains
disabled by default. This is not an assembled or approved release package.
The dirty checkout and unrelated work were not discarded. Exact package and
dependency selection, hosted isolation, full `/app` and `/locator` rendering,
capacity, real dataset coverage/provenance/attribution, backup/restore and
coordinated rollout/rollback still require validation. Existing visual anchors
from an older template can fail closed on signature drift; deployment planning
must account for that without deleting source schedules or observations.
Production activation remains a separate approval.
