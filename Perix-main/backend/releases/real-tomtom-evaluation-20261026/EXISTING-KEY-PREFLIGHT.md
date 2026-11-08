# Existing-key evaluation — updated authorization preflight

Date: 2026-10-26. This is an addendum, not a replacement of earlier reports.

The user's revised authorization permits the existing exposed key for this
bounded nonproduction evaluation. Rotation is no longer a prerequisite for
this pilot. The key must still be read exclusively from
TOMTOM_TRAFFIC_API_KEY; it must not be recovered from chat history.

## REAL API OBSERVATIONS

Fresh presence-only checks returned credential_present=false in both the local
process and the explicitly selected staging backend process. The remote check
asserted the intended nonproduction environment and service identities.
No secret value, prefix or hash was printed or saved. These findings describe
only the inspected processes, not every possible secret store or machine.

No authenticated Traffic request can be made from either inspected environment
until the existing key is privately configured there. No new key is required
by this preflight. No key was changed or revoked.

## PERIX BASELINE VS TOMTOM COMPARISON

Not executed. No real provider sample was available for a paired A/B/C run.
Progress, speed, ETA, distance and trajectory differences are unavailable, not
measured zeroes. No synthetic result was substituted for the requested pilot.

## ACCURACY EVIDENCE

No real traffic observations or independent vehicle observations were acquired.
No claim of greater accuracy, coverage or computational influence is supported.
GTFS-Realtime predictions would remain model constraints, not independent truth.

## REJECTED EVIDENCE

No samples acquired, so no HTTP/geometry/direction/confidence rejection rate is
measurable. Missing credentials are an execution blocker, not a matcher rejection.
Reviewed OpenLR/direction bindings remain necessary for accepting future samples.

## API REQUEST ACCOUNTING

| Item | Executed | Pilot limit/plan |
|---|---:|---:|
| Flow HTTP attempts | 0 | 30 hard cap |
| Planned Flow observations | 0 | 24 across four cycles |
| Incident HTTP attempts | 0 | 1 optional hard cap |
| Points sampled | 0 | 6 fixed points |

No provider allowance was consumed by this task. The remaining account allowance
and remaining shared internal budget were not verified; their values must not
be inferred from zero requests here. No independent evaluation runner or license
path was added, and production gates were not enabled or bypassed.

## SECURITY AND KEY ROTATION FOLLOW-UP

Immediate prerequisite: privately configure the existing full key through the
chosen nonproduction secret mechanism as TOMTOM_TRAFFIC_API_KEY. Do not paste
it into chat, source files, terminal arguments, reports or authenticated URLs.
Ensure the evaluation process sees the new environment setting; do not trigger
a production deployment or enable runtime flags to do this.

Once accessible, verify account-specific Traffic entitlement, remaining free
allowance/renewal/overage behavior and applicable private-processing rights.
No specific contractual prohibition was established by this credential check;
neither were those account facts verified. An HTTP success alone cannot verify
the applicable rights or ensure that usage is free of charge.

After the evaluation, the previously exposed key must be replaced. Do not
automatically revoke it. In the authenticated TomTom account, locate the relevant
application/API-key controls, create a replacement with only required Traffic
access where supported, privately update the nonproduction backend secret, and
verify it with a separately approved bounded check. Revoke/delete the exposed
key using the account's available key-management control. Check usage analytics
for unexpected requests and verify that the old key is no longer accepted.
Dashboard labels/options must be confirmed in the authenticated account; none
were modified in this task. Keep production Traffic capabilities disabled.

## PRODUCTION READINESS

Not established. No deployment, production change, passenger influence, runtime
flag activation, canonical geometry change, API-contract change, commit/push,
Google WIP modification or tram modification occurred. This phase added only
this technical metadata addendum and performed presence-only environment checks.
