# Real TomTom evaluation — blocked before first provider request

Date: 2026-10-26. Status: **NOT EXECUTED — pre-request gates unresolved**.
This file contains PERIX technical preflight metadata only, no provider traffic
responses, credentials, authenticated request URLs or account identifiers.

## REAL TOMTOM API DATA

- Flow HTTP attempts: **0 / 30**; requested pilot: 24 requests in four cycles.
- Incident HTTP attempts: **0 / 1**; optional request not executed.
- Cycles t=0,5,10,15 minutes: all unexecuted.
- Points requested: **0 / 6**. Returned/accepted/used observations: **0**.
- Provider speeds, travel times, confidence, closure and OpenLR: **not measured**.
- Actual directional coverage and rejection rate: **not measurable**, not a
  measured 0% coverage finding. No sampled point failed an HTTP or geometry test;
  no sample was acquired. No TomTom-influenced trip was evaluated.

## Verified preflight metadata

Presence-only checks in the local process environment and the explicitly selected
nonproduction staging service both returned:

| Variable | Local | Staging |
|---|---|---|
| TOMTOM_TRAFFIC_API_KEY | absent | absent |
| TOMTOM_EVALUATION_APPROVAL_JSON | absent | absent |
| MOBILITY_TOMTOM_APPROVAL_JSON | absent | absent |

Remote check asserted the intended staging service/environment identities before
returning booleans. These checks concern the inspected process environments,
not all machines, secret managers or account dashboards. No credential value,
prefix or hash was emitted. Rotation cannot be verified by these checks.

Official navigation from developer.tomtom.com redirected to docs.tomtom.com.
Its Sign in link led to TomTom Login; no authenticated account dashboard or
account entitlement evidence was available. No account tier, allowance,
renewal period, overage setting or account-specific agreement was established.
No terms were accepted, credentials changed or billing options modified.

## PERIX MODEL COMPARISON

A/B/C real comparison **not executed**. There are no paired real observations
to support progress/speed/ETA/distance/trajectory/slack/fallback differences.
Those differences are **unavailable**, not measured zeroes. No synthetic replay
was substituted for this requested real evaluation.

The six fixed points still require reviewed OpenLR/direction bindings. A later
HTTP success alone must not bypass existing matching, confidence or freshness
rules. The approved comparison must use identical per-cycle GTFS/GTFS-RT,
canonical geometry, physical parameters and calculation time.

## ACCURACY EVIDENCE

No independent vehicle observation or passage time was acquired. No claim of
better position/ETA accuracy, actual traffic coverage or real computational
influence can be made. The earlier 660/1153 (57.24%) scheduled potential remains
historical snapshot potential, not actual TomTom coverage.

## COST AND LICENSING — missing prerequisites

1. A newly rotated complete key privately installed as TOMTOM_TRAFFIC_API_KEY
   in an explicitly selected nonproduction process; the exposed chat key must
   not be used. A restart/reload may be necessary for that process to see it.
2. Authenticated dashboard access or privately supplied account evidence for
   the new key's Traffic entitlement, account tier, remaining free allowance,
   shared usage, renewal period and overage behavior.
3. Applicable agreement/review evidence authorizing this private evaluation,
   temporary response processing, combination with canonical OSM/transit data,
   and the intended model-derived comparison. Permitted retention, diagnostic
   display and derived-result retention must be specified separately; public
   publication and production rights are not inferred.
4. An explicit bounded nonproduction evaluation authorization based on that
   evidence. TOMTOM_EVALUATION_APPROVAL_JSON was checked only as a prospective
   metadata variable: **a separate evaluation authorization path/runner has not
   yet been implemented**, and setting this variable alone cannot run a pilot.

No allowance debit was caused by this task (zero requests). The account's
remaining quota and charges from other consumers are unknown. Runtime license
and activation gates were not changed to manufacture evaluation permission.

After prerequisites are verified, reuse the existing adapter, shared atomic
account-budget reservations and validators with a separate bounded evaluation
authorization: six fixed points only, no retries, absolute 30 Flow attempts,
separate optional one-Incident cap, four cycles, no permanent scheduler. Reject
unreviewed bindings and unsupported observations without relaxing safeguards.
Retain/display provider data only to the extent explicitly permitted.

## Change boundaries

This phase added only this preflight report. No source, feature flag, production
configuration, passenger position, API contract, tram module or Google WIP was
changed. No deployment, commit/push, provider request or billing change occurred.
Earlier completed engineering tests are not presented as real pilot evidence.
