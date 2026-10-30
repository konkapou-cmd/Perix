# Pre-change inspection — Physics-aware allocation / TomTom evidence

## Baseline and boundaries

Inspection precedes implementation. This checkout contains unrelated existing
WIP in motion/common, bus, engine, explain, traffic, v2, GTFS, workers and tests.
It is NOT byte-identical to production d91ff576-492d-45e8-a388-c2b00d0746c6.
In particular its Google traffic fusion, effective-timeline orchestration and
physics defaults differ. Do not replace that WIP with a production snapshot or
deploy the checkout wholesale. This task adds opt-in extensions to this tree;
production stays untouched. No credentials/configuration or passenger UI changes.

Inspected required modules: motion/common.py, bus.py, tram.py, engine.py,
traffic.py, config.py, diagnostics.py, explain.py; signal_semantics.py,
infrastructure.py, traffic_profiles.py, traffic_counts.py, generations.py,
regions.py, v2.py, utils/gtfs.py, utils/mobility_workers.py; related motion,
fusion, signal, GTFS and generation tests and the dated production evidence.

## Actual chain and contracts

1. utils/gtfs.py parses the selected region/date/timezone. It already retains
   seconds, extended hours and ordered stop_times_sequence separately from the
   legacy stop_id dictionaries. Regression tests cover loops and midnight.
2. workers ingest GTFS-RT; routes.mobility._predicted_stop_timeline resolves
   arrival/departure separately. Local RT ingestion is older than production
   (stop_id keyed); do not silently graft another importer into this feature.
3. generations validates canonical pattern geometry, derives directed edges
   and signal infrastructure, and atomically replaces one scoped bundle.
   get_pattern_generation is region/network/version/pattern-scoped.
4. engine._build_trip_plan validates generation identity and path length, skips
   SKIPPED anchors, reads batched traffic snapshots for buses, and builds legs.
5. bus/tram apply spatial speed spans and point turn caps. common performs the
   forward acceleration and backward braking envelope and constructs kinematic
   segments; mandatory stops trigger a complete envelope rebuild.
6. _fit_leg chooses natural/recovery/fastest trajectories; time_scale >= 1
   stretches the whole leg. An impossible target propagates a physics-limited
   ETA, never speed compression. Local WIP retains raw predicted clocks and
   returns a shared effective timeline.
7. _acquire_trip_plan caches by scoped identity, geometry, time bucket, timeline
   and traffic context/revision. Rebuilds sample the previous plan at NOW and
   pass initial speed/progress/history into handover. continuity_guard remains.

## Existing capabilities to extend, not duplicate

- common already solves v_next² <= v_current² + 2*a*distance and its braking
  counterpart. Keep existing a/b defaults, including local WIP values.
- Turn angles currently use consecutive polyline-edge bearings, so sampling
  noise can create false turns. Add directed-chain/window refinement opt-in.
- Signal semantics distinguishes NODE_EXACT from spatial diagnostic candidates,
  resolves direction and clusters heads. The new experiment must consume this
  stricter event layer even when the legacy semantics flag is off; legacy
  behavior itself must not change. Pseudo-phase is not a real signal phase.
- Bus road signals default on; periodic rail-signal modeling defaults off.
  This task must not enable rail cycles or feed car speeds into tram tracks.
- Historical traffic profiles use directional lanes, day types and intervals;
  BPR_V1_UNCALIBRATED is explicitly a model, not measured bus speed.
- traffic.py already mediates static/optional Google evidence. Retain that WIP.
  New TomTom reads must be cache-only on this path, with source/age/reasons.
- Existing Google refresh/budget is per-process. No distributed lease or
  atomic account-period external-request budget exists to reuse safely.
- explain/diagnostics already report fastest/natural/effective times, physics,
  signal/traffic/geometry coverage. Add bounded research diagnostics there.
- Existing motion diagnostics use optional authentication. Do not change their
  public contract; add a separate admin-protected research endpoint.

## Implementation decisions / safety gates

New physics/allocation behavior defaults off. Allocation shadow defaults on
when explicitly enabled: passengers retain baseline output. Candidate builders
reuse bus/tram/common, original initial conditions and exact canonical path;
no additive delay on top of a GTFS-RT target. Inconclusive candidates fall back.
Refinements are opt-in; baseline output equality is tested with flags false.

TomTom client, matching and scheduler are separate from vehicle polling.
Enabled, license approval, account-period approval, retention permission and
server-side key are ALL required before an actual request. Key presence alone
never enables anything. Default implementation/testing uses synthetic mocks.
No client, key probe, scheduler initialization or content storage runs by default.
Central reservations count every attempt, with separate <=15000/<=2000 caps,
idempotent sampling slots, a fenced scheduler lease and a global auth/rate halt.
Unverified account renewal periods fail closed; no automatic calendar reset.

## API / licensing inspection

Official Incident Details documentation identifies services/5/incidentDetails,
bbox order minLon,minLat,maxLon,maxLat, GeoJSON lon/lat coordinates and present
validity. It distinguishes Jam/LaneClosed/RoadClosed/RoadWorks; an incident is
not automatically a bus delay or closure. Documentation advertises separate
Orbis APIs: do not mix their formats with the requested legacy versions.
The old Flow documentation URL redirected to an unrelated Vector Tiles page;
the canonical Flow Segment documentation must be used, not that redirect.

API documentation is not contractual approval. Commercial prediction, OSM
matching, Google Maps display/derived output, caching/retention and diagnostics
rights have NOT been confirmed for this account/architecture. Nor have the
user-quoted free quotas or account renewal period been verified. Internal caps
are conservative PERIX limits, not proof of free account-wide use. No live
endpoint/key availability test is authorized before these gates are resolved.

## Validation plan

Snapshot pre-existing source hashes and run explicit offline suites, excluding
the destructive test_db fixture. Test flag-off equality, turns/physics,
directional signal eligibility/dedup/stop proximity, stop-cost recomputation,
infeasible slack and double-count prevention; TomTom parsing/matching/expiry,
lease/budget races and terminal errors with mocks. Independently verified ETA
labels are required for MAE; otherwise report unavailable, not invented accuracy.
Rank six sampling points only from validated active-network bundles and real
scheduled trip templates; report missing coverage and rejected geometry. Do not
present mock coverage as actual coverage or force a 4+2 split without comparison.
