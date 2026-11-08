# Adaptive TomTom sampling and time-aware bus position — separate extension

## Result / boundaries

Implemented in the existing scheduler, cache and physics-aware allocation path.
No deployment, production operation, real TomTom request, key/billing change,
commit or push occurred. The accepted previous report at
`../physics-time-allocation-20261026/README.md` is unchanged. Its 57.24% scheduled
potential is NOT actual TomTom coverage. Actual new provider coverage is **0%**.

The original TrafficControl implementation, 15000/2000 caps, fenced lease,
atomic reservations, retries, terminal-error halt and legal/entitlement gates
are reused, not rewritten. Its account-wide singleton is stronger than an
at-most-one region/provider scheduler within the existing one-active-region
deployment model. No new parallel regional ledger/lease was introduced.

Tram builders/parameters, common physics, Google WIP/adapters, canonical
generations, routing providers and dependencies were not modified. The shared
engine change only supplies bus shadow queries/remaining-leg builder arguments;
new bus diagnostics never select a replacement passenger fitted trajectory.

## Opt-in configuration

All new flags default false and none were activated:

```
MOBILITY_TOMTOM_ADAPTIVE_SAMPLING_ENABLED=false
MOBILITY_TOMTOM_TRENDS_ENABLED=false
MOBILITY_BUS_TIME_EVIDENCE_ENABLED=false
```

Existing TomTom/legal/OpenLR/retention/account-period approval requirements and
existing allocation/shadow flags remain necessary. A key alone cannot start
sampling. Adaptive requested with missing/invalid region policy fails closed.
With adaptive disabled, the previous fixed UTC 20m/30m schedule remains intact.

Policy is read from active `region.motion.traffic_sampling`, using the existing
regional configuration mechanism and `region.timezone`. The initial expanded,
nonoverlapping policy is in
`mobility/sampling_policies/magdeburg-weekly-v1.json`. This is an example to
review/configure, not an automatically installed regional preset. Peak windows
are a sampling policy, not a measured claim about traffic on that day.

| Local days | Flow windows / minutes per point | Incident windows / minutes |
|---|---|---|
| Mon–Thu | 06–07 /30; 07–09 /5; 09–15 /30; 15–18 /5; 18–22 /30 | 06–22 /30 |
| Fri | 06–07 /30; 07–09 /5; 09–12 /30; 12–17 /5; 17–22 /30 | 06–22 /30 |
| Sat–Sun | 09–21 /60 | 09–21 /60 |
| Other local hours | disabled | disabled |

All windows are `[start,end)`. Config validation rejects overlap. A holiday
calendar can specify reviewed `source_ref`, `covered_years`, explicit ISO dates
and separate Flow/Incident windows (empty means off). No actual official holiday
dates were fabricated/imported. A configured calendar with an unverified year
fails closed; a null calendar means weekly policy without a holiday claim.

## Exact schedule cost and request safeguards

Before retries or unrelated consumers, six points / one bbox:

| Days | Fixed Flow | Adaptive Flow maximum | Fixed Incidents | Adaptive Incident maximum |
|---:|---:|---:|---:|---:|
| 28 | 12096 | 10896 | 1344 | 736 |
| 29 | 12528 | 11508 | 1392 | 768 |
| 30 | 12960 | 12000 | 1440 | 800 |
| 31 | 13392 | **12492** | 1488 | **832** |

Tests enumerate actual calendar months, including leap February/weekdays and
DST. A weekday Flow point has 82 slots Mon–Thu, 102 Friday, 12 Sat/Sun. Incidents
have 32 weekday / 12 weekend slots. Maxima are over calendar placement, not a
claim every month attains the maximum. Holiday/custom policies need their own
forecast. Account-period admission counts even overlapping initial partial
slots conservatively, checks holiday coverage and existing lower/capped budget,
and rejects unreviewed multi-bbox operation even if its computed cost fits.

No hard cap increased. Existing central reservations still count each attempt,
including bounded retries/failures and reservations canceled before HTTP.
Retries are outside the planned counts and consume budget; 401/403/429 still
halt without retry. External account users remain outside PERIX accounting;
existing console-side controls/entitlement review are still required.

Slots are deterministic local date + nominal minute + region; the budget adds
product and original point ordinal. There is no policy-version, priority-order
or process nonce that can reopen a slot. Repeated autumn wall slots are queried
at most once; nonexistent spring slots are omitted. After restart/downtime only
the current slot is eligible, never every missed one. Point priority changes do
not change the six original ordinal identities. A per-attempt clock guard runs
before/after reservation and before retries: no new external attempt after a
window ends. Shadow A/B/C uses one offline corpus, not three provider fetchers.

## Priority and freshness

Six fixed points remain fixed. Priority explains scheduled next-window passage
counts, active-scheduled-trip proxy, accepted receipt age, missing history and
meaningful comparable speed change. Scheduled demand uses exact GTFS seconds,
extended hours and stop-pair occurrences; it is not observed bus motion.

Default `skip_without_bus_demand=false`. Omission additionally requires explicit
verified absence of active forecasts, known zero scheduled demand, two recent
accepted stable observations and a history/freshness refresh bound. The runtime
schedule-only demand estimator deliberately does not attest absence of delayed
buses, so it cannot silently suppress samples on that evidence alone. Unknown
demand is never converted to zero. Priority never triggers extra/out-of-cycle
requests in response to an outlier.

Initial policy bounds: receipt freshness 600s, trend gap 900s, projection horizon
300s, projection fraction 15%, meaningful-change criterion 10%. These are
configurable model criteria, not TomTom's actual update rate. Effective freshness
is capped by approved retention. With 30/60m cadence and <=20m licensed retention,
there are intentionally gaps with no fresh direct influence; baseline/static
profiles remain available. Evening observations cannot masquerade as live at 03:00.

Adaptive observations have separate independently expiring documents, not a
history array under an ever-renewed TTL. At most three comparable retained
observations per edge are used; reads are bounded. Future receipts, invalid
direction binding, network/graph/generation/policy mismatch, gaps and reversals
do not create a continuous series. Source measurement time remains unknown:
age_basis=RECEIPT_ONLY. Trend projections are labeled modeled, never bus speed.

## Spatial remaining-time shadow

The previous method rebuilt traffic trajectories but globally stretched the
chosen curve. The new bus-only comparison additionally tries to allocate
residual model time on verified congested full future edges **before** the next
stop, rebuilding the entire existing physical curve at each trial. Free upstream
segments are not slowed solely to consume slack. Free-flow, unverified,
already-passed, partial-stop-overlapping or after-stop evidence cannot justify
this localized hypothesis. Excess unexplained slack beyond a declared bounded
allowance falls back rather than assigning arbitrary delay to one road.

Baseline, latest/uniform, localized latest and (when supported) localized trend
states are compared. Each state comes from a constructive physical path from
the same initial conditions. Tails are rebuilt from candidate position/speed
to evaluate physical minimum, evidence travel time and remaining GTFS-RT window.
The residual comparison reports its 2–5s spatial-grid numerical tolerance; this
is not a measured arrival-error confidence interval. Multiple compatible states
remain an envelope, not proof the bus is inside a queue.

The model uses the RT deadline as a constraint; it never sums another traffic
delay onto it. Congestion after the stop cannot explain arrival at that stop.
The new hypotheses remain **hard shadow-only** and cannot replace passenger
output, even if older allocation flags are active. At a valid handover, every
new curve must start at the existing position/speed; no instant advance to a
queue, backward movement, teleport or rewrite of past motion is authorized.

## Offline A/B/C evidence and limitations

`offline-abc-final-v2.json` uses one generated 288-record causal corpus, not TomTom
or GPS. A is baseline; B uses fixed slots/latest allocation; C uses adaptive
slots, bounded temporal evidence and spatial residual comparisons. Queries are
independent synthetic legs, not an observed continuous vehicle. Query times are
5m aligned and have no simulated HTTP lag, so zero peak receipt age is a fixture
artifact, not a real-world latency claim.

The corpus/report records scheduled versus actual requests (actual=0), receipt
ages, informative changes, explicit changed-model cases, position/ETA deltas,
construction physics/backward checks, fallback and CPU p50/p95. All actual
directional coverage, live trips affected and independent accuracy remain zero
or unavailable. CPU is in-process model work, **not API latency**. C also uses a
stricter 10m freshness than B's prior 20m retention-based freshness; lower
off-peak availability is an explicit tradeoff, not hidden as an improvement.

No independent ETA/position observations or real API load experiment are
available. Increased modeled information responsiveness is not proof of greater
position accuracy. Extra shadow CPU can be material and needs whole-trip/load
validation. No activation is recommended from this replay alone.

Measured fixture results (75 query states, one synthetic Monday):

| Metric | A baseline | B fixed | C adaptive/time-aware shadow |
|---|---:|---:|---:|
| Simulated six-point Flow requests | 0 | 432 | 492 |
| Simulated Incident requests | 0 | 48 | 32 |
| Actual provider requests | 0 | 0 | 0 |
| Informative fixture changes seen | 0 | 15 | 50 |
| Synthetic fresh-edge query coverage | 0% | 100% | 88% |
| Receipt age p50 / p95 | n/a | 600 / 900 s | 0 / 0 s |
| CPU p50 / p95 | 0.99 / 2.64 ms | 0.99 / 2.18 ms extra | 1.89 / 65.72 ms extra |
| ETA-target delta / construction violations / backward phases | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

The Monday rate is intentionally higher than fixed (Friday higher still), while
night/weekend reductions lower the monthly maximum. C's 86.7% fallback rate in
this fixture includes free-flow/no-distinguishing-evidence, target conflicts and
freshness gaps; it is not hidden. B/C CPU is additional work on the shared
baseline, not end-to-end API latency. There is no universal improvement claim.

In the illustrative bottleneck case, elapsed=100s and remaining target=200s:
the baseline candidate is at 292.43m and its rebuilt road-evidence tail takes
219.12s. A localized candidate is at 748.18m, with rebuilt tail 197.52s (within
the reported 3.89s numerical-grid tolerance). Both histories originate from the
same modeled initial conditions; neither is an observed bus state. The more
advanced shadow hypothesis is therefore feasible, not proven true. In this
single-bottleneck case the trend hypothesis differs by <0.001m and is explicitly
NOT ranked as a materially better position. A separate two-road slowing/recovery
test demonstrates a material redistribution without changing the arrival target.
An evaluated-scenario range is not a confidence interval or the complete set of
possible positions, however narrow it becomes.

## Validation, files and rollback

Modified existing files (relative to repository root):

- `Perix-main/backend/mobility/tomtom_scheduler.py`
- `Perix-main/backend/mobility/tomtom_traffic.py`
- `Perix-main/backend/mobility/motion/time_allocation.py`
- `Perix-main/backend/mobility/motion/engine.py`
- `Perix-main/backend/mobility/v2.py`
- `.github/workflows/mobility-physics-research.yml`

Added source/configuration/test files:

- `Perix-main/backend/mobility/tomtom_schedule.py`
- `Perix-main/backend/mobility/tomtom_temporal.py`
- `Perix-main/backend/mobility/motion/bus_time_evidence.py`
- `Perix-main/backend/mobility/sampling_policies/magdeburg-weekly-v1.json`
- `Perix-main/backend/tests/test_adaptive_traffic_sampling.py`
- `Perix-main/backend/tests/test_bus_temporal_position.py`
- `Perix-main/backend/tools/benchmark_adaptive_traffic.py`

The task patch reconstructed these **13 source files byte-for-byte**. Fifteen
protected files, including the previous report, central controller, tram/common/
bus physics and Google WIP, match the pre-task snapshot. Evidence files in this
new report directory are separate from that source delta.

See `new-unit-results.xml`, `regression-results.xml` and `task-manifest.json` for
actual test results, exact changed files and pre/post hashes. New unit tests ran
before the related regression suite. Mobility CI now follows that ordering and
uses synthetic mocks/no traffic key; no remote GitHub run is claimed.

Final new units: **33 passed**. Full relevant regression suite: **363 passed /
1 skipped** (optional explicit localhost Mongo service, same as the accepted
baseline), one existing multipart deprecation warning. The unchanged central
controller retains the prior real-Mongo verification; no new remote Mongo or
production operation was needed/performed in this task.

The previous global Mongo implementation/proof is reused, not re-executed or
rewritten. The optional local Mongo service test remains separately marked when
unavailable. Tests cover boundaries, holidays, Friday/weekends, DST, restart,
duplicate ticks, budget exhaustion, window-crossing retries, freshness,
direction, temporal reversals/gaps, remaining time, after-stop exclusion, GTFS
midnight/occurrences, no double counting and unchanged tram/passenger behavior.

Rollback: keep/restore the three new flags false (already their defaults), then
check/reverse the task-only patch against the recorded accepted working tree.
Do not reset whole files or overwrite Google/other WIP. The old report and
protected modules are hash-checked unchanged. The existing fixed sampling path
and accepted allocation remain available; no production rollback is needed
because no production operation occurred.

Still required before any live activation: explicit legal/entitlement/account
period approval, real direction/OpenLR bindings, a reviewed current regional
policy/holiday calendar, fresh canonical configuration, bounded licensed shadow
trial, independent validation and API resource/latency gates, followed by a
separate production instruction. No keys, invoices, routing APIs or production
settings were changed by this extension.
