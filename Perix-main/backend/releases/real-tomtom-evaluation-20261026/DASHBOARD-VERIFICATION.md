# Authenticated MyTomTom verification — account gates advanced

Date: 2026-10-26. This report supersedes earlier statements that the account
dashboard was inaccessible. Earlier files remain historical records. It contains
account usage/control metadata only, not traffic API observations or secrets.

## Verified dashboard findings

The user's private browser login made MyTomTom accessible. Read-only navigation
covered API Usage & Performance, API & SDK Keys, and the plan comparison page.
No upgrade, purchase, key creation/rotation, terms acceptance or setting change
was performed. Key values were not retrieved from the dashboard or copied.

| Dashboard item | Observed value |
|---|---|
| Current plan | Freemium |
| Visible keys | 3 |
| Billing type of each visible key | Evaluation |
| Traffic API listed for each visible key | Yes |
| Traffic Flow Segment Data monthly usage | 0 / 20,000 |
| Traffic Incident Details monthly usage | 831 / 2,500 |
| Displayed arithmetic remaining Flow allowance | 20,000 |
| Displayed arithmetic remaining Incident allowance | 1,669 |

These are dashboard readings, not an atomic reservation or guarantee against
concurrent usage. The quota widget is explicitly monthly; the analytics chart's
selected range was separately Sep 25–Oct 25, 2026, with 849 total requests.
The chart range must not be treated as proof of the billing-cycle boundaries.
The plan comparison also labels Freemium as subject to daily request limits;
their numeric values were not established. Public pricing must not override
account-specific limits or automatically increase PERIX caps.

All visible keys have Evaluation/Traffic status, but the exact secret fetched
from Railway has not been compared with dashboard secret values. Railway's
configured nonempty variable was confirmed previously; no authenticated Traffic
request has tested that secret. Its functional validity is still untested.

## REAL API OBSERVATIONS

No provider data requests were made: Flow **0 / 30**, Incident **0 / 1**.
No response fields, actual cache headers, receipt ages, OpenLR values or traffic
conditions were observed. No real acceptance/rejection percentage exists.

## PERIX BASELINE VS TOMTOM COMPARISON

Not executed. No real paired A/B/C trip values or position/ETA deltas exist.
The six points and all four cycles remain unmeasured. A computational difference
must not be fabricated or reported as a measured zero.

## ACCURACY EVIDENCE / REJECTED EVIDENCE

No independent bus observation or passage time was acquired. No real evidence
was submitted to the direction/geometry matcher, so no sample-level rejection
was recorded. Account authorization/retention blockers are not matcher failures.

## Remaining contractual scope issue

Public agreement section 2.2 permits internal Evaluation Use, subject to the
other terms. This review does not claim all private evaluation is forbidden.
However, section 11.4 restricts caching/storing Results, and Flow v4 documents
Cache-Control: public, max-age=0. Keeping responses, extracted traffic history
or reconstructed equivalents for four cycles is therefore not assumed permitted.
Sections 11.2/11.6.1 also require explicit review of retained derived artifacts.

The account's Evaluation billing label does not independently authorize the
requested retention or displace these conditions. An applicable separate
agreement or TomTom clarification could change this conclusion. None has been
provided or verified here. The user's permission to use an exposed key cannot
amend provider contractual restrictions.

Available next paths:

1. Privately establish applicable permission for a 15-minute, four-cycle history
   and derived PERIX comparison, including deletion/display/report limits; then
   build/use the distinct nonproduction evaluation authorization over the
   existing adapter, central budgets and validators.
2. Narrow the evaluation to expressly permitted transient, per-response
   processing without retained traffic history. This cannot silently be passed
   off as the requested four-cycle trend/report experiment. The allowed private
   display and retained technical metadata scope must be explicit before running.

No live runner, approval manifest or runtime-license bypass was introduced to
manufacture missing retention permission. Runtime gates remain untouched.

## API REQUEST ACCOUNTING / SECURITY FOLLOW-UP

No allowance was consumed by this task. Shared internal budget remaining and
billing renewal boundaries were not measured. Existing caps remain 15,000/2,000,
with pilot maximum 30/1 attempts, no retries, and no permanent scheduler.

The existing key is permitted by the user for this pilot; replacement is not a
precondition imposed here. After testing it must be rotated privately and usage
reviewed for unexpected calls. No key was changed or revoked.

## PRODUCTION READINESS

Not established. Only browser reads and this report were added in this phase.
No production modification, deployment, passenger influence, source/geometry
change, feature-flag activation, commit/push, Google WIP or tram change occurred.

Sources:
- https://my.tomtom.com/analytics/api-usage-and-performance
- https://my.tomtom.com/keys
- https://my.tomtom.com/plans/upgrade-plan (read-only current-plan comparison)
- https://docs.tomtom.com/pricing
- https://docs.tomtom.com/legal/terms-and-conditions
- https://docs.tomtom.com/traffic-api/documentation/traffic-flow/flow-segment-data
