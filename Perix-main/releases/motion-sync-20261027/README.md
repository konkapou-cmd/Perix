# Production-derived motion / ETA synchronization release

## Runtime provenance

This release is based on the hash-verified production deployment
`86787584-b517-4c4a-acbb-da7ef325add5`, not the dirty integration checkout.
Remote main was missing 71 runtime files and differed substantively in 23
others. The runtime-alignment commit restores the deployed safeguards before
the motion feature commit is applied. Existing integration WIP is not included.

The Docker build still uses `/Perix-main` and the existing packaged
`backend/webdist.dat`. The frontend archive is a narrow, verified transformation
of the served artifact; this release does not claim that main's older frontend
source can safely regenerate the whole deployed Expo bundle. Do not rebuild it
from an unrelated/dirty frontend checkout.

## Motion behavior

- Arrival/departure updates adapt the remaining trajectory from the marker's
  computed NOW position and speed; traveled motion is not rewritten.
- Upcoming mapped turns/junctions/signals preferentially absorb delay through
  positive approach/crawl/recovery speeds, not invented observed signal stops.
- If no obstacle remains, the revised ETA can adapt remaining moving speed
  until the real stop approach; it does not hold at a passed intersection.
- Existing acceleration/braking, hard edge/vehicle caps, actual stop anchors,
  minimum dwell and binding departures remain. Museum's fallback remains 25 km/h.
- Vehicle identities remain dated-trip-specific, including same-label journeys
  in different directions. An all-calls-SKIPPED source trip is not fabricated as
  a parked passenger vehicle; partial skips and unknown timing do not remove it.

## Publication and renderer

The backend re-samples the same cached, identity/revision-bound plan immediately
before sending a fleet response. Position, ETA, next stop and preview come from
that sample, without rerunning the solver or refreshing source timestamps.
Preview export remains bounded to 8 seconds / 32 phases and arrival/departure/
trip boundaries. The frontend consumes only authorized same-revision phases;
it never invents an unbounded forecast. GPS/taxis are excluded.

Speed-cap lookup uses a sorted sweep with a minimum heap, preserving the exact
existing inclusive 1 mm boundary tolerance and gap fallback. On 29 identical
captured infrastructure cases all fit/trajectory hashes remained identical;
measured fitting cost improved 2.84x on the validation workstation. This is not
a service-latency guarantee or a real-world positional-accuracy claim.

## Completed validation

- 467 backend tests passed with the feature on; 467 passed with it off.
- 467 passed again from the clean release branch.
- Two DB-dependent editor cases were deselected in these runs; their earlier
  owned isolated-Mongo execution is separate evidence, not part of the 467.
- 14 existing auth/security and server-route safeguard tests passed.
- 22 compiled API/Locator/bridge/map-script tests passed.
- 4 delayed-response renderer cases passed, including 28 seconds of server
  work, modeled arrival, departure and terminal boundaries.
- 5 fleet/zoom tests passed, including 120 simultaneous synthetic markers and
  opposite-direction same-label journeys.
- Staging V6 `4d32277d-5822-4c59-956c-03856f9ada51`: 283 backend hashes verified;
  cold HTTP 200 in 11.42 seconds, 80/80 previews valid at send, maximum preview
  sample age 13.25 ms; network/graph guard unchanged.
- Actual Google Maps SDK with normal existing-key forwarding: map tiles loaded,
  no console/map errors; all 86 API vehicle records created, 78 active windows,
  no missing canonical paths or revision mismatches and zero same-frame
  mathematical position discrepancy. This was the public renderer plus actual
  API packets, not an authenticated Locator UI session or observed GPS arrivals.

## Operations and boundaries

### Approved release-blocking CI fixes

The first normal main deployment was skipped because CI did not install
`pytest`. The workflow now installs the same pinned pytest/pytest-asyncio used
for validation. Running the unchanged required suite then exposed expired
hotel test dates and an existing `create_task(gather(...))` error in booking
web-push scheduling. With explicit user approval, fixtures now use relative
future dates (including a genuine overlapping booking/block window), and push
delivery schedules each existing coroutine directly. Original assertions and
exception expectations were retained; four offline push-task regressions were
added. Booking business rules, required CI targets and blocking checks are not
weakened. No real push is sent by these tests.

Production uses the existing GitHub repository `konkapou-cmd/Perix`, branch
`main`, service `94882f6a-8179-43bc-bdf5-73eb1de4a059`, root `/Perix-main`.
No production CLI archive upload, forced GTFS activation, provider/billing
change, new worker, scheduler, endpoint or application database is introduced.
Native recalibration, Google Traffic and TomTom remain disabled. Automatic
static activation and daily recovery retain their existing production settings.

Enable only the existing `MOBILITY_MOTION_PREVIEW_ENABLED` and
`MOBILITY_SPATIAL_SLOWDOWN_ENABLED` flags for this feature. Rollback must restore
both the known-good image and its custom variables via the official deployment
rollback operation; restart alone is not rollback.

Live data refers to arrival/departure source clocks. Marker position is modeled.
Source-specific unavailable-time UI wording and viewport-prioritized loading
are not part of this release. Zoom does not alter physics or ETA. Initial fleet
response latency remains an improvement area; no instant-loading SLA is claimed.
