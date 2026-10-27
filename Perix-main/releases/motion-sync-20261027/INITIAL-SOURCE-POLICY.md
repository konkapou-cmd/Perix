# Line-derived initial source alignment

This candidate builds on production commit `d1ebeabcfb929fb5464ea2d6150400de00a05ba3`.
It does not replace the speed solver or introduce another vehicle simulator.

## Contract

- The existing vehicle endpoint accepts an optional `initial_sync=true` query.
  The compiled client requests it until its first nonempty successful response;
  subsequent polls do not repeatedly reposition vehicles.
- With the existing spatial-motion flag enabled, initialization chooses the
  source's current dated arrival/departure interval. It does not treat accumulated
  historical simulated lateness as an observed vehicle passage.
- The remaining arrival clock is inverted on the existing physical profile. An
  exact clipped suffix is retained, avoiding a differently aligned solver grid.
- Moving initial discrepancies over 100 m may explicitly replace the estimate
  revision in either direction. Smaller moving differences preserve the current
  position and speed and use the normal rate-adjustment handover.
- Station/departure bounds take precedence over a contradictory moving initial
  estimate, even below 100 m. This exception is not ordinary backward animation.
- Zero-dwell intermediate/final occurrences receive a provisional modeled 10 s
  dwell only when no explicit provider departure exists. Existing positive dwell
  and newer binding departures take priority.
- Current time is refreshed per trip; the opt-in path also reads its reference
  clock inside the dated-trip lock. Source arrival epochs are not reset by data
  receipt or request age.

## Unchanged safeguards

Legal speed caps, acceleration/braking, geometry, actual upcoming obstacles,
Museum's unverified 25 km/h fallback, authoritative marker publication and
identity/revision-bound bounded previews remain in place. Invalid or expired
previews hold safely. No GPS observations, signal stops, traffic billing calls,
database, worker, endpoint, or GTFS activation are introduced.

Zoom and viewport priority do not alter the physics or ETA. Viewport-prioritized
loading and source-specific unavailable-time wording are separate work and are
not claimed as part of this candidate.

## Validation before staging

- 538 backend cases passed in each of the spatial default-off and enabled runs;
  the same 2 database-dependent editor cases were excluded locally.
- 21 targeted initialization/reference-clock cases passed.
- The added blocking CI motion step passed 129 cases locally; existing booking,
  concurrency, migration and push checks remain intact.
- 37 existing frontend/first-request transport cases passed.
- 9 actual candidate-engine replay scenarios produced 17 packets and 528 future
  samples. Both compiled artifacts passed 18 API → Locator → bridge → native map
  tests against those packets, including authoritative large initial corrections,
  small-correction continuity, departure bounds and expired-window hold.
- Production/staging configured frontend key literals were unchanged.

## Staging validation

Staging deployment `e7b0c963-1c51-4041-9e1b-d5c4dae609fa` verified all 286
backend file hashes, the served compiled artifact and unchanged network/graph.
Its explicit initial-sync sample had 79 initialized source plans and 79/79 valid
previews at send; the maximum preview sample age was 13.085 ms.

The actual `/locator` Mobility iframe, without manual vehicle injection, loaded
the Google raster map. 81 active windows matched the backend packet equations
with zero same-frame canonical or coordinate error and zero revision mismatch.
An initial browser request timed out; its successful retry retained the initial
flag. The following 51 successful reads did not repeat the initialization flag.

Slow transport still causes bounded windows to expire and hold safely. This is
not a continuous-animation guarantee or independent real-world position evidence.
Required GitHub checks must pass before production publication; staging evidence
alone is not production deployment evidence.
