# Traffic Fusion Staging Gate

## Verified Deployment Identity

Read-only Railway/public API checks on 2026-10-21:

| Service | Origin | Observed state |
| --- | --- | --- |
| Perix | https://api.perixapp.com | Different service from backend; physics disabled |
| backend | https://app.perixapp.com | Railway assigns this domain; /api/version returned 404 |
| backend-staging | https://backend-staging-staging-7ada.up.railway.app | Magdeburg; physics enabled; partial physics coverage and generation mismatches |
| backend-syros | https://backend-syros-production.up.railway.app | No active network version; realtime source NONE |
| backend-mykonos | https://backend-mykonos-production.up.railway.app | No active network version; realtime source NONE |

Do not switch domains or copy environment variables across these services blindly.
Railway deployment success does not establish a working transit network.

## Opt-In Google Routes

All of these gates are required for billable refresh:

```text
MOBILITY_MOTION_ENABLED=true
MOBILITY_GOOGLE_TRAFFIC_ENABLED=true
GOOGLE_ROUTES_API_KEY=<server-side Routes-enabled key>
MOBILITY_GOOGLE_TRAFFIC_REGIONS=magdeburg
MOBILITY_GOOGLE_TRAFFIC_REQUESTS_PER_MINUTE=2
```

The example request budget is an initial staging rate, not an accuracy target.
The adapter never inherits public frontend keys. Default Google enablement is
false and default budget is zero. Use Google Cloud API restrictions and quotas.
The in-memory rate limit is per process and resets on restart; replicas multiply
the allowed calls. It is not an account-wide spending guarantee.

One authorized live verification used the existing staging server key in
subprocess memory only: Google returned HTTP 200 for canonical edge
366322365:1461367647:82701064. Canonical length was 51.355 m, returned geometry
52.377 m, and route distance 52 m. This proves API access and one geometry match,
not deployed fusion, network-wide coverage, or actual bus position accuracy.
No Railway variables were changed by that verification.

## Composition Contract

- Realtime arrivals define fit targets, not an additive traffic delay.
- Validated Google DRIVE estimates constrain road speed at every recovery ratio.
- Existing uncalibrated historical profiles remain recoverable soft inputs.
- On Google-covered edges, modeled signal holds are suppressed because the
  route duration already includes road/intersection travel delay.
- Physically infeasible targets produce PHYSICS_LIMITED and target-error
  diagnostics rather than removing a live congestion constraint.
- Google geometry never replaces the canonical OSM bus geometry.
- Tram physics does not use car traffic. Bus lanes are excluded from car proxy
  estimates pending separate validation.

## Cache And Safety

The first adapter is deliberately conservative: one request per eligible directed
OSM edge, at least 50 m long, at most two attempts per snapshot, two-second total
snapshot deadline, no paid retries, 60-second successful cache and 15-second
negative cache. Geometry must pass endpoint, directed progress, corridor, and
length checks. Mismatch, expiry, timeout, missing credentials or exhausted budget
fall back to historical profiles, then road baseline.

Plan cache reuse is bounded by the earliest Google expiry. Trip explanations use
the exact snapshot consumed by their plan; fleet diagnostics are cache-only and
cannot populate the live estimates cache with a cache-only result. Public vehicle
requests can refresh only when every Google gate is enabled.

Geometry checks cannot distinguish nearby parallel roads within the tolerance.
Fetched-at is the API retrieval time, not a timestamp for a measured bus or a
Google traffic observation. Route-average car speed is a proxy, not a calibrated
bus speed. Acceleration/turn constraints can add time beyond that proxy duration.
Finite budgets and conservative edge checks intentionally give partial coverage;
do not label the entire route as Google-covered from one provider string.

## Release Checks

1. Deploy the reviewed revision to backend-staging only, recording its deployment
   ID and source revision. Do not change api.perixapp.com routing as part of this.
2. Enable the dedicated server key and a small explicit rate in staging only.
3. Inspect /api/mobility/v2/diagnostic/motion/summary and selected
   /api/mobility/v2/diagnostic/motion/trips/{trip_id} reports. Verify provider and
   per-leg traffic_constraints, expiry, target errors and generation fallbacks.
4. Sample vehicle responses across cache expiry and realtime changes. Check
   forward movement, speed limits, dwell, source coverage and signal behavior.
5. Compare timestamped predicted arrivals to independently observed arrivals;
   Google ETA is a comparison baseline, not ground truth.
6. Resolve geometry/timing contradictions and generation mismatches before
   production activation. Confirm which frontend actually consumes each origin.

Remaining system-level gates: source-feed timestamp/version/day freshness,
physics versus published stop-ETA consistency, frontend generation consistency,
handover elapsed-time/dwell behavior, legal routing/closure validation, and
official active island timetable ingestion. The new adapter alone does not
resolve these or certify production accuracy.

Rollback the adapter with MOBILITY_GOOGLE_TRAFFIC_ENABLED=false; existing
historical/baseline behavior remains available. Keep production unchanged until
staging evidence is reviewed.
