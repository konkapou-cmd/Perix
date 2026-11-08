# Real evaluation — credential located; account and terms review

Review date: 2026-10-26. Technical preflight metadata only. No traffic API
response, key, authenticated URL or provider-derived motion state is retained.
Earlier preflight reports remain historical; this report supersedes the claim
that the credential is absent from Railway's configured production variables.

## REAL API OBSERVATIONS

The preceding read-only Railway configuration check confirmed a nonempty
TOMTOM_TRAFFIC_API_KEY in production/backend. The deployed-container presence
check did not find it; configured variables and container environment are
different checks. The secret was not printed, copied from chat, saved to disk,
or used for any provider request. No production redeploy is required or allowed
merely to make the configured secret available for evaluation.

Official MyTomTom navigation to https://my.tomtom.com/ opened the TomTom Login
authorization screen. An authenticated account dashboard was not accessible.
No account credentials were entered, terms accepted, or billing options changed.

Flow requests: **0 / 30 hard cap**. Optional Incident requests: **0 / 1**.
All four measurement cycles remain unexecuted. No HTTP rejection or geometry
acceptance rate can be calculated without requests.

## Public pricing findings — NOT verified account quota

Source: https://docs.tomtom.com/pricing

- Traffic Flow API Segment Data: published free allowance 20,000/month.
- Traffic Incidents API Details: published free allowance 2,500/month.
- FAQ: allowance is shared across all keys in the account and resets at the
  start of the billing cycle, not necessarily the calendar month.
- FAQ: on free tier, requests beyond the allowance are blocked until the next
  cycle; with prepaid credit, additional usage is charged against credit.
- FAQ: no payment method is needed to start; a payment method is needed to add
  prepaid credit beyond the monthly allowance.

These public figures do not verify this key's entitlement, subscription,
remaining allowance, billing-cycle dates, prepaid balance or renewal settings.
No free-only request guarantee is established for this account yet. PERIX's
existing internal monthly caps stay 15,000 Flow / 2,000 Incident; the pilot
must additionally use its 30/1 attempt caps and shared atomic account budgets.

## Terms findings and retention restriction

Source: https://docs.tomtom.com/legal/terms-and-conditions
The legal text was readable in the rendered public page, though the plain
HTTP text fetch initially omitted the main terms content.

- Definition: Evaluation Use is internal evaluation and testing.
- Section 2.2 grants a royalty-free Evaluation Use license subject to compliance
  with the agreement. Public terms therefore do contemplate internal testing;
  an additional production/commercial license must not be presumed necessary
  merely to read a response for evaluation.
- A separate signed agreement, if applicable, can govern use instead. The
  agreement actually applying to this account has not been verified.
- Section 11.4 prohibits caching/storing Results except within the stated
  client/cache-control exceptions; it does not grant multi-client scaling.
- Sections 11.2 and 11.6.1 restrict derivative works/secondary or derived
  databases. Their applicability to retained PERIX comparison artifacts needs
  explicit review; do not assert that a transient private evaluation is itself
  categorically forbidden or that every derived diagnostic is permitted.
- Sections 3.1.5 and 20.2.3 restrict combinations that subject protected data to
  ODbL/copyleft obligations. They are not a blanket ban on every OSM comparison.
- Section 11.6.10 restricts competitor-product benchmarking without written
  permission. No competitor benchmark was undertaken here.
- Section 8.3 describes prepaid automatic renewal and account controls. Account
  settings were not inspected or changed.

Endpoint documentation:
https://docs.tomtom.com/traffic-api/documentation/traffic-flow/flow-segment-data
(redirects to the current TomTom Maps v1 documentation path; service version 4).

- GET /traffic/services/4/flowSegmentData/{style}/{zoom}/{format} is documented.
- openLr=true is supported; default is false. The existing adapter's spelling
  and request contract match the documented parameter.
- Response coordinates are shifted for visualization depending on zoom. This
  supports retaining the existing reviewed OpenLR/direction requirement, not
  accepting coordinate order as sufficient proof of direction.
- The documented Cache-Control response value is **public, max-age=0**.
  Therefore a 15-minute retained observation history must not be assumed
  authorized from the general Evaluation Use grant. Actual response headers
  have not been measured because no request was made.
- The adapter's existing licensed runtime retention approval is not evidence
  of permission for this account and must not be fabricated or bypassed.

## PERIX BASELINE VS TOMTOM COMPARISON / ACCURACY EVIDENCE

Not run. No real progress/speed/ETA deltas, accepted road observations, affected
trips or independent accuracy evidence exist from this pilot. These are unknown,
not measured zeroes. No synthetic benchmark was run as a substitute.

## Remaining actionable prerequisites

1. Private login to MyTomTom, or privately supplied nonsensitive account evidence
   verifying Traffic access, subscription, remaining free allowance and cycle,
   and prepaid/renewal behavior. Do not share passwords, API keys or auth tokens.
2. Establish which agreement applies. Resolve permission for the requested
   four-cycle history and retained derived comparisons, or restrict execution
   to expressly permitted transient per-response processing with no retained
   provider history. This would limit the originally requested time-series
   deliverable and must be made explicit, not hidden.
3. Only after those checks, implement/reuse a distinct bounded nonproduction
   evaluation authorization over the existing adapter, central reservations,
   lease, matching and physics paths, with no retries and no production flags.

No separate live runner was created in this phase while the necessary account
facts and retention scope remain unresolved. No new credential is required
before the pilot under the user's revised instruction.

## SECURITY / PRODUCTION READINESS

After the evaluation, rotate the exposed key via MyTomTom key management,
privately update the backend secret, revoke the exposed key, and inspect usage
for unexpected calls. Do not revoke automatically or enable production Traffic.

This phase performed public documentation/browser reads and added this report
only. No production configuration, source, canonical geometry, passenger state,
Google WIP or tram code was modified; no deployment, commit/push or TomTom API
request occurred. Production readiness is not established.
