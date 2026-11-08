# Wait-only ETA recovery — local, default off

## Purpose

Reconcile a newer, explicit GTFS-RT forecast without making the existing
movement profile faster. This is separate from the deployed daily-refresh fix
and from native recalibration research. No production deployment or flag change
is part of this work. No GPS accuracy improvement is claimed.

`MOBILITY_WAIT_ONLY_RECOVERY_ENABLED` defaults to `false`. The experimental
policy applies only to baseline bus/tram plan replacement, with a recent cached
plan of the same trip, day, version, generation, geometry and stop topology.
Google Locator and non-static provider plans are excluded.

## Policy

- Preserve every MOVING phase's distance, duration, initial/final speeds and
  time scale. Do not refit a faster trajectory, remove braking, or jump position.
- In the current leg, shorten only the **unelapsed** part of modeled
  `SIGNAL_HOLD` phases. Other stationary phases, observed constraints, static
  traffic speed reductions and mandatory station service are not removed.
- At a station, a fresh explicit departure update may release the remaining
  redundant wait. Preserve the actual service start, minimum scheduled/new
  predicted service duration, scheduled departure and any initial departure
  floor. Arrival-only updates do not authorize a departure.
- Shift subsequent existing movement profiles earlier by the released wait;
  a mandatory future timetable hold may absorb that advance. Do not infer a
  passed/served stop or skip its braking/service from an ETA.
- Authorize release only from a strictly newer GTFS-RT **source** timestamp
  no more than 90s old, an explicit event for that stop, and an absolute target
  improvement of at least 2s. Poll receipt time is not source freshness.
- Each accepted forecast updates raw target aliases, so retries and effective
  timeline feedback cannot spend the same time gain twice.
- Repeated stop IDs are conservatively excluded because current realtime
  storage is stop-ID keyed. Missing/stale/future timestamps, propagated-only
  forecasts and NO_DATA cannot authorize release.
- If there is no releasable wait, retain the old movement profile and expose
  the unresolved target miss. Do not turn an impossible ETA into acceleration.
  Fresh later constraints or incompatible schedule/topology changes instead
  return control to the existing planner; this policy must not hide them.

The worker now retains TripUpdate.timestamp (falling back to FeedHeader.timestamp,
or zero when missing). Internal timeline evidence distinguishes explicit arrival
and departure forecasts from propagation. No public arrival endpoint, frontend
or traffic-provider integration is introduced.

## Limits / follow-up gates

This intentionally cannot recover time by accelerating, deleting necessary
braking or reducing movement time. Trams with no modeled within-leg holds may
gain nothing while moving; station wait correction still applies. Preserving
all speed phases can retain an unnecessary modeled stop's deceleration even
when its hold is reduced; eliminating that stop would change the speed profile
and is outside this policy.

This is a local prototype, not a reviewed production overlay. The checkout
contains pre-existing unrelated work and must not be deployed wholesale.
Before any activation: compare frozen real-data bus/tram replays, validate
source timestamp availability/age and occurrence identity, test long-running
cache refresh and source/closure transitions, and build/review a task-only
production overlay. Daily-refresh production settings remain untouched.

## Tests

Final results: **60 new tests passed; 525 total relevant tests passed**, with
one existing `python_multipart` deprecation warning. No tests were deselected.
See `new-unit-results.xml` and `regression-results.xml` for actual results.
Tests cover exact movement-phase preservation, current position/speed
continuity, partially elapsed holds, repeated updates, feedback aliases,
station service and departure floors, future timetable holds, impossible
targets, timestamps/provenance, cache scoping, bus/tram integration and provider
exclusion. They use synthetic trajectories and mocked I/O, not observed GPS.

Initial failed runs remain in `new-unit-initial.xml` and
`regression-initial.xml`. They exposed inconsistent synthetic dwell/clock
fixtures and an end-of-plan advance diagnostic evaluated before its new end
time was assigned. The fixtures and diagnostic were corrected before the
final successful runs; failures were not suppressed.
