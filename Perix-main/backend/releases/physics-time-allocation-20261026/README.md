# PERIX Mobility — physics-aware allocation / TomTom evidence

## Decision

**Implemented in the existing backend working tree; NOT deployed or enabled.**
Production remains `d91ff576-492d-45e8-a388-c2b00d0746c6`, with 274 matching
runtime hashes and paid routing disabled. No production secret, key, pricing,
configuration, passenger interface or canonical data was modified.

Activation is **NOT recommended/approved**. Contractual rights, real endpoint/key
entitlement, matched traffic coverage, independent accuracy and actual API load
behavior remain unverified. No claim of improved real-world accuracy is made.

## Implementation

This is not a replacement motion system. Existing common/bus/tram builders,
_fit_leg, canonical atomic generations, effective clocks and handover are used.

- Optional directed-topology/fixed-distance turn caps avoid treating every
  polyline wiggle as a turn. Existing acceleration/braking parameters remain.
- Candidate rebuilds include no extra stop, modeled turn slowdown and at most
  two explicitly hypothetical, direction-verified signal-stop events. Stop cost
  includes braking/reacceleration, not a wait appended to an existing curve.
- Unknown phases and ambiguous candidates retain uncertainty; no proximity to
  the GTFS-RT target is treated as proof of a red light. Rail cycles stay off.
- Compatible, accepted road-flow evidence can redistribute an existing target,
  not append another delay. Conflicting evidence retains the baseline.
- Moving candidates that would change initial speed are rejected. With the
  same target, the opt-in path can clip/retain the remaining prior legal leg
  instead of introducing a stretched-speed discontinuity; future full edges
  may use new evidence. Shadow retains baseline key/expiry/rebuild behavior.
- TomTom v4/v5 parsing, strict directed matching, reviewed OpenLR-direction
  binding, confidence/receipt-age/generation gates and incident diagnostics are
  integrated with traffic_snapshot_for_edges. No car-flow correction for tram.
- A single shared Mongo document atomically controls account-period counters,
  fenced scheduler lease, idempotent slots and terminal auth/rate halt.
- Scheduler alone owns requests. Vehicle polling/trip recomputation/diagnostic
  calls cannot trigger TomTom HTTP. Failed attempts and bounded retries reserve
  before HTTP, with no refund and no paid-service upgrade.
- Research endpoints are admin-only; passenger contracts/UI stay unchanged.
- Existing GTFS parser already preserved seconds, extended hours and ordered
  stop occurrences. It was not changed again; its regressions still pass.

## Source scope and rollback

The checkout contains unrelated pre-existing WIP, notably Google traffic fusion
and physics defaults, and differs from production. That WIP was preserved.
**Do not upload the dirty checkout as a production release.** Before future
promotion, reconcile this extension with the published neighbour-timing source.

`task-manifest.json` lists all ten modified existing files, twelve added backend
files and the new CI workflow, with pre/post hashes. `task-only-delta.patch` was
applied to a clean reconstruction of the recorded pre-change WIP: all **23 files
reproduced byte-for-byte**. This is NOT a patch against clean Git HEAD or against
the production artifact. Seven protected modules (config, signals,
infrastructure, generations, regions, GTFS parser, traffic counts) are unchanged.

Defaults/rollback:

```
MOBILITY_TIME_ALLOCATION_ENABLED=false
MOBILITY_TIME_ALLOCATION_SHADOW_ONLY=true
MOBILITY_TOMTOM_ENABLED=false
MOBILITY_TOMTOM_LICENSE_APPROVED=false
MOBILITY_TOMTOM_SHADOW_ONLY=true
TOMTOM_FLOW_MONTHLY_HARD_CAP=15000
TOMTOM_INCIDENT_MONTHLY_HARD_CAP=2000
```

For source rollback, first check the reverse task patch against the exact
audited tree (`git -c core.autocrlf=false apply -R --check task-only-delta.patch`).
Do not reset/checkout whole files over unrelated WIP. No rollback action was
executed because no deployment/activation occurred.

## Validation actually performed

- Pre-change baseline: **277 passed** in explicit relevant offline suites.
- Final local suites: **330 passed, 1 skipped**, one existing multipart warning.
  JUnit evidence is `pytest-results.xml` (331 collected cases).
- The local skip is the optional isolated Mongo-service test. Separately, real
  staging MongoDB **8.0.34** verified 20 lease contenders, racing reservations,
  separate cap enforcement, duplicate-slot idempotency, stale fences, failover,
  no implicit period reset and global 429 halt. Only a UUID temporary collection
  was used and it was removed. See `mongo-control-verification.json`.
- Tests cover flag-off baseline equality, exact shadow outputs/cache behavior,
  turns, short legs, direction/spatial/dedup/near-stop signals, physical stop
  cost, infeasible targets, no double counting, moving handover/traffic changes,
  parser precision/loops/midnight, API authorization, provider errors, stale/
  ambiguous flow, tram exclusion and no TomTom HTTP from repeated snapshots.
  Approval/credential gates are rechecked before each attempt and after budget
  reservation; revoked approval prevents retries and discards in-flight results
  before provider-content storage. Dedicated revocation regressions pass.
- A separate GitHub Actions workflow with isolated localhost Mongo was added;
  no actual GitHub Actions execution is claimed (no commit/push was performed).
- **Actual TomTom Traffic API requests: 0.** Mocks are synthetic, require no real
  key and do not establish endpoint entitlement or provider accuracy.

## Synthetic baseline/new measurements

Forty engineering cases, not independently observed trips:

| Metric | Result |
|---|---:|
| Baseline fit CPU p50 / p95 | 1.15 / 2.31 ms |
| Additional experimental CPU p50 / p95 | 2.11 / 4.83 ms |
| Absolute baseline/new position delta p50 / p95 | 16.77 / 110.78 m |
| Maximum absolute arrival-target delta | 0 s |
| New-trajectory physics violations | 0 |
| Backward progress samples | 0 |
| Selected / physics-limited fallback / incompatible-flow fallback | 20 / 10 / 10 |
| Independent ETA MAE / independent position error | Unavailable |
| Actual API latency p50/p95 or availability non-regression | Not measured |

Position difference is NOT spatial accuracy. Equal fitted ETA is NOT proof of
better real arrival prediction. Experimental CPU overhead is nonzero; a proper
whole-trip/API load benchmark is still required before enabling it. See
`synthetic-benchmark-final.json`. Earlier benchmark JSON is retained as history.

## Six-point ranking on real canonical data

Latest report: `active-network-point-ranking-v3.json`, read-only on 2026-10-26.
The active published snapshot was **service date 2026-10-25**, version
`net_7f0605d2409e`; it must not be represented as verified Monday 26/10 coverage.
Its 113 ready generations yielded 1,702 eligible directed road candidates and
46,130 scheduled candidate-edge passes. No historical profile records existed
in the inspected region/network collection.

The proposed six fixed points touch **660 / 1,153 scheduled bus trips (57.24%)**.
That is daily potential journey-touch coverage, not complete-trip coverage,
current running-vehicle coverage or successfully matched TomTom coverage. The
whole network had 2,127 bus/tram templates. **Measured direct coverage is 0%.**

| Directed OSM edge | Scheduled passes | Lines |
|---|---:|---|
| 95928571:60607092:12953485292 | 143 | 48, 73, N6, N8 |
| 361040981:3780378731:306995315 | 142 | 46, 48, 51 |
| 144905127:34917090:5502983124 | 109 | 52, 72, 73, N9 |
| 626403895:292691431:1851947605 | 95 | 52, 69, 71, N7 |
| 507777965:10091757394:12151173308 | 95 | 69, 71, N7 |
| 29045716:9373365128:12179882047 | 76 | 57, 58, N3 |

Coordinates, graph/generation IDs, direction, pattern IDs, score basis and own
configuration are in the JSON. Coordinates are midpoints of validated OSM edges,
not random points or vehicle GPS. © OpenStreetMap contributors; existing OSM
licensing/attribution obligations remain applicable. No sampling configuration
was installed in production. Earlier v1/v2 reports are historical snapshots.

**4+2 rotation is not justified yet.** The implementation intentionally rejects
rotating live configuration until repeated matched observations and a reviewed
temporal coverage comparison exist, rather than changing points on each call.

## TomTom legal/billing status and remaining gates

Official docs confirm the requested Flow v4 and Incident v5 formats; the docs
also advertise distinct Orbis APIs. No automatic format migration is implemented.
Actual key availability was deliberately not probed before contractual approval.

Commercial prediction, OSM combination, Google Maps display, server storage,
derived motion state/diagnostics, asynchronous TTL cleanup and backup retention
are **NOT CONFIRMED** for this architecture/account. The approval manifest and
flags are all required before live requests; a key alone cannot enable anything.
See `MOBILITY_PHYSICS_TOMTOM.md` for all explicit attestation fields.

The user-quoted public free quotas and actual account renewal/remaining quota
have not been verified. PERIX caps are bounded to 15,000 Flow and 2,000 Incident
attempts and further reduced by reviewed remaining allowance. The proposed base
cadence is 13,392 / 1,488 requests in 31 days, excluding any retry. Every retry
consumes a separate reservation. External account consumers still require
TomTom console controls; these counters are not an account-wide billing promise.

Residual risks: approximate geometry/confidence thresholds need evaluation;
Flow coordinates can be visualization-shifted and have no per-record source
timestamp in this contract; reviewed OpenLR direction bindings are not supplied
for the six actual points. Incident geometry is not direction or closure proof.
Independent observations and whole-trip/API resource measurements are absent.
Do not infer an activation pass from visually smoother synthetic motion.

## Phase status

- A: inspected/snapshotted baseline, parser preservation/regressions complete.
- B: existing-builder allocation/refinement/handover extensions implemented and
  tested; defaults off, shadow baseline preserved.
- C: adapter, strict matching, budgets, lease, cache and scheduler implemented
  with mocks; live legal/entitlement gates intentionally unresolved.
- D: integrated cache-only traffic facade and protected comparisons implemented;
  no licensed live trial or passenger change performed.
- E: **activation withheld**. Need contractual/account review, a fresh dated
  canonical plan and direction bindings, bounded live shadow approval, independent
  validation and latency/resource non-regression evidence, then a separate
  explicit instruction for any production flag change.
