# Physics-aware time allocation and TomTom traffic evidence

## Status / non-goals

Implementation is in the existing working tree, not deployed. This checkout has
pre-existing unrelated WIP and differs from production d91ff576. Do not deploy
it wholesale. The pre-change audit is MOBILITY_PHYSICS_TOMTOM_AUDIT_2026-10-26.md.
Physics defaults, canonical domain, atomic generations, geometry and passenger
contracts are retained. All new behavior defaults off; the passenger UI is not
modified. Existing Google traffic WIP is preserved, not enabled or repurposed.

## Flags

| Setting | Default | Effect |
|---|---|---|
| MOBILITY_TIME_ALLOCATION_ENABLED | false | Evaluate alternatives with existing bus/tram/common builders |
| MOBILITY_TIME_ALLOCATION_SHADOW_ONLY | true | Return baseline to passengers, keep bounded private comparisons |
| MOBILITY_TOMTOM_ENABLED | false | Permit approved background sampler/cache path only |
| MOBILITY_TOMTOM_LICENSE_APPROVED | false | Operator-attested contractual gate, not automatic approval |
| MOBILITY_TOMTOM_SHADOW_ONLY | true | Prevent direct flow from changing passenger plans |
| TOMTOM_FLOW_MONTHLY_HARD_CAP | 15000 | Cannot be increased above 15000 by configuration |
| TOMTOM_INCIDENT_MONTHLY_HARD_CAP | 2000 | Cannot be increased above 2000 by configuration |

Only TOMTOM_TRAFFIC_API_KEY supplies the server credential. Key presence cannot
enable requests. No frontend secret, paid-service fallback or key-probe endpoint
is provided. This document grants no permission to change production flags.

## Exact baseline and shadow behavior

The original _fit_leg remains the baseline. The forward/backward envelope is
not replaced. New builders accept an optional scenario; None takes the original
path. Fixed-distance directed topology windows refine turn caps only in the
experimental rebuild. OSM_TAG and MODELED_DEFAULT provenance are distinct; even
an OSM tag is not a legal certification of a posted/conditional speed limit.

Candidate legs rebuild acceleration, braking, turns, static/direct flow and a
possible signal stop from identical initial conditions. Near-stop, opposite,
spatial-only, untagged and ambiguous signals do not become stop hypotheses.
Existing signal semantic clustering is reused. Rail-cycle hypotheses are never
enabled by this extension. Full stop cost is with-stop minus without-stop,
including braking/reacceleration, not just an appended wait.

Physical infeasibility preserves baseline physics-limited propagation. Matching
the GTFS-RT target does not prove a red light. Ambiguous geometric hypotheses
remain an envelope in diagnostics; absent distinguishing flow evidence uses the
baseline. Compatible direct road-flow evidence may redistribute an existing
target, never add its travel time/incident delay to that target. Candidates that
would change the moving handover's initial speed, including by global stretch,
are rejected. Only future full edges can acquire new direct evidence.

Shadow mode preserves the baseline cache key, expiry and handover schedule;
TomTom receipt expiry and the experimental 30-second revision bucket cannot
force an extra passenger plan rebuild in shadow. Active experiments have a
separate key including approval fingerprint; the original handover identity
and history remain unchanged. Active direct flow requires BOTH shadow flags
false plus licensing/activation gates. None are switched by this task.

## TomTom contracts and blocked live usage

Documented formats are pinned, never auto-upgraded to Orbis:

- Flow v4: https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/traffic-flow/flow-segment-data
- Incidents v5: https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/traffic-incidents/incident-details

Flow uses absolute/18/json, point=lat,lon, unit=kmph, openLr=true. Incidents uses
bbox=minLon,minLat,maxLon,maxLat, an explicit field set and present validity.
The old unqualified Flow docs URL redirected to Vector Tiles; that page was
not used as the Flow Segment contract. The docs advertise separate Orbis APIs;
their payloads are not mixed into these parsers. Actual key entitlement/version
availability has NOT been probed: no contractual approval is available.

MOBILITY_TOMTOM_APPROVAL_JSON must explicitly contain all true rights:
commercial_prediction, osm_combination, google_maps_combination,
temporary_storage, derived_diagnostics, derived_motion_state. It must also
include activation_approved, billing_period_verified, free_tier_verified,
shared_budget_scope_confirmed, backup_retention_approved,
asynchronous_ttl_cleanup_approved, storage_backend=MONGO_TTL, a nonempty
review_reference, account_ref and shared control_database. allowed_scopes lists
explicit region/network pairs. period_start, period_end and approval_expires
must be timezone-aware ISO timestamps; an expired/unknown period fails closed.
verified_remaining_flow_requests/verified_remaining_incident_requests further
reduce hard caps. retention_seconds must be positive and <=1200.

These are attestations supplied AFTER human contractual review, not evidence
that this implementation has obtained those rights. No sample filled approval
or actual credential is committed. Approval must cover server storage, derived
motion history, Google Maps display, backups and asynchronous Mongo TTL cleanup;
application expiry is immediate, physical deletion is asynchronous. If such
terms cannot be approved, keep the adapter mock-only or implement another
explicitly approved storage arrangement before any live call.

The public free-tier numbers quoted in the request and the actual account reset
period have NOT been verified for this account. For the specified cadence,
6*3*24*31=13392 Flow and 2*24*31=1488 Incident requests exclude retries. Every
retry still reserves budget. A shared account used outside this PERIX control
database needs separate console-side controls; internal counters cannot cap
those consumers or guarantee a zero invoice.

## Central safeguards

One Mongo control document per account contains policy fingerprint, explicit
period, a server-time fenced lease, separate counters, idempotent slot tokens
and an account-wide halt. Lease/budget/slot conditions are checked in the same
atomic update before each request; no counter refund follows timeout, malformed
payload or cancellation. A changed period/policy does not reset the ledger.
Renewal/review requires an explicit operator procedure preserving current
counters; there is intentionally no automatic monthly reset.

All instances/environments sharing an account must use the same reviewed
control_database/cluster. A process-local limiter would not meet this contract.
401/403/429 halt globally with no retry. Transient transport/5xx failures have at
most one additional, separately reserved attempt. Exhaustion means no new calls.
The scheduler owns calls; traffic_snapshot_for_edges, /vehicles and diagnostics
cannot acquire a sampling lease or trigger HTTP. The transport has no automatic
redirect/retry or authenticated-URL logging and never returns exception text.

The scheduler validates configuration against active canonical generations,
requests at most six global ordinal slots per 20 minutes and one bbox per 30
minutes, and never catches up missed slots. Configuration/region changes cannot
obtain another six calls within the same slot. Duplicate ticks do not erase
fresh cache records. Provider cache is separate from the permanent own-control
ledger and guarded by approved retention, version/generation and receipt age.

## Geometry/direction and cache

Flow speed is a road aggregate, never bus GPS/speed. Every vertex must agree
with a connected directed OSM chain; wrong orientation, parallel alternatives,
low confidence, closure/stopped ambiguity and stale generation are rejected.
15m corridor / 0.7 confidence are configurable modeling criteria, not proof.
v4 visualization coordinates are zoom-shifted; geometric order is not treated
as sufficient heading proof. A separately reviewed OpenLR-direction binding is
required before motion use. Missing binding means rejected evidence, not a
nearest-road guess. No road flow is applied to tram trajectories.

Flow has no per-record observation timestamp in this contract. source_observed_at
therefore remains null, and age_basis is RECEIPT_ONLY. An old receipt is never
served, but receipt freshness does not prove the underlying measurement age.
Incidents are geometrically associated for diagnostics, not automatically
converted into directed bus closures/delays. Their delay is never summed with
RT or Flow. Source labels distinguish STATIC_PROFILE/TOMTOM_FLOW/
TOMTOM_INCIDENT/NONE without calling a virtual vehicle LIVE.

## Admin diagnostics and offline tools

New endpoints require is_admin=True (401 anonymous, 403 other users):

- GET /api/mobility/v2/diagnostic/research/status — flags/approval/control counters only
- GET /api/mobility/v2/diagnostic/research/sampling — own canonical candidate/coverage report
- GET /api/mobility/v2/diagnostic/research/allocation/{trip_id} — opt-in bounded comparisons

Existing public diagnostic/API contracts remain unchanged. Reports include
baseline/new progress samples, feasible alternatives, hypothetical signal costs,
turn events, targets/fastest/slack, accepted/rejected provenance and fallback.
They report independent ETA MAE and position error as unavailable without labels.

tools/mobility_physics_research.py ranks actual scheduled bus passes from supplied
network + ready-generation snapshots. Tools never fabricate six coordinates or
perform TomTom requests. Six fixed points are the current conservative proposal;
4+2 rotation is explicitly NOT justified until repeated matched observations
and a temporal coverage comparison exist. This is not a deployed configuration.
tools/benchmark_time_allocation.py measures synthetic CPU/consistency, not API
latency or accuracy. See releases/physics-time-allocation-20261026 for evidence.

## Tests / rollback / activation decision

Explicit suites avoid the destructive test_db fixture. A separate CI workflow
adds an isolated localhost Mongo integration service and needs no traffic key.
The local optional Mongo test is skipped unless that service is explicitly
configured; separate scoped staging-Mongo evidence verifies real atomic races.

No deployment or production configuration changes occurred. Keeping flags off
is the rollback for future experiments; baseline output remains unchanged.
For source rollback use the task-only patch against its recorded pre-change WIP,
not git reset/checkout over unrelated work. Before any future release reconcile
this WIP-based extension with the published neighbour-timing production source.
Activation is NOT recommended until licensing, live matching/coverage, independent
accuracy and real API load/latency gates are satisfied and explicitly approved.
