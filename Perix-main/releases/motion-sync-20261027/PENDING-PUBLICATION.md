# Coherent publication handover and per-journey pending state

Base production commit: `9e50c04f5a20d931c58c59d932b5942f8a231d67`.

## The failure being addressed

An initial fleet request can still be loading when another request replaces a
vehicle's cached motion revision. The old strict send-time sampler cannot find
that exact revision and correctly refuses to borrow an unrelated curve. In two
production samples, the old packet then carried 3/81 and 6/84 expired previews.
The client rejected them safely, but the API did not explicitly distinguish
these pending publications from ready ones.

## New contract

- The existing solver supplies a publication binding with its dated identity,
  canonical geometry/mode, estimate-correction epoch, motion revision and cache
  time. This is server-generated response provenance, not a new client privilege.
- At send time, a bound row may adopt a complete newer cached packet only for the
  same dated identity, generation, geometry, mode and estimate-correction epoch.
  It must be at least as recent, remain within the existing 90 s cache trust bound,
  and preserve forward continuity. Position, next stop, ETA and preview all come
  from that one newer revision. The top-level revision changes with the preview.
- Unknown or unbound motion revisions retain the old strict behavior. No old
  trajectory archive is kept and no old revision is resurrected.
- If a coherent sample is not ready, that journey is explicitly `PENDING`, with
  no advertised preview and a reason. Other ready journeys are unaffected.
- The native map pauses a pending journey at its last rendered safe position.
  It does not install a partial correction epoch or rewind to an older raw point.
  The pin is dimmed and titled “Updating modeled timing”.
- The next coherent `READY` update is applied immediately, without an extra poll
  of interpolation. Removed trips stay removed; new journeys and geometry cannot
  inherit another journey's held path. GPS/taxis are not frozen by this policy.
- A final send-clock check strips expired/inconsistent bounded windows rather
  than advertising them as ready. Original source receipt/feed clocks are not
  freshened. Client clock, identity, revision and expiry validators are unchanged.

This changes per-vehicle publication/holding, not the physics or the response
format. It does not stream the first fleet computation, add an endpoint, database,
worker, scheduler, traffic service, provider/billing change or independent planner.
Unreachable providers cannot be made instantly available; pending is explicit
instead of fabricated movement or a false guarantee of continuous animation.

## Local validation before staging

- Reproduced the replaced-revision failure with 12 failing regressions before
  implementation; expanded coverage to 15 handover/pending cases.
- 553 backend cases passed per spatial mode; the same 2 database-dependent editor
  cases were excluded locally. All pre-existing strict rejection assertions remain.
- The full added CI motion step passed 144 cases locally; existing booking checks
  remain intact.
- 81 compiled frontend/map checks passed, including per-journey pending hold,
  immediate recovery, no partial correction, cancellation, GPS/taxi and all nine
  retained expired production packets.
- Four real candidate-engine scenarios (same-identity replacement, newer source,
  correction-epoch pending and next-poll recovery) produced 99 future samples.
  Eight compiled API → Locator → bridge → map checks passed on those packets.
- Configured frontend key literals and the native clock/revision validator bytes
  were unchanged.

Actual staging, browser, required GitHub CI and production verification remain
mandatory release gates. Local completion is not production deployment evidence.

## Staging gate

Deployment `e8ee20f1-0f35-4658-857d-5c2683c23060` matched all 287 backend
hashes and the served artifact. The active network/graph and configured keys were
unchanged. Overlapping initial/ordinary requests produced these coherent results:

| Request | Ready | Pending | Valid previews | Expired previews |
| --- | ---: | ---: | ---: | ---: |
| Initial | 80 | 0 | 80 | 0 |
| Overlapping ordinary | 60 | 20 | 60 | 0 |
| Next ordinary poll | 80 | 0 | 80 | 0 |
| Following ordinary poll | 80 | 0 | 80 | 0 |

All 20 initially pending journeys became ready on later ordinary polls. The
overlapping response adopted 52 complete newer revisions atomically, without
changing estimate-correction epochs or relaxing validation. Maximum preview age
at send was below 35 ms in these samples. Deliberate overlap took 22–25 s; later
ordinary requests took 5.7–8.8 s, so no instant-loading SLA is claimed.

The actual Locator iframe loaded the Google raster map; 75 active windows matched
their packet equations with zero error or revision mismatch. The observed live UI
window had no pending transitions; those transitions were verified in compiled
replay tests, while actual pending/recovery was verified in the API cohort above.
