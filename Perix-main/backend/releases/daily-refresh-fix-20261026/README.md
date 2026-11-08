# Daily timetable recovery — implemented, real-source validated, NOT activated

## Result

The eight historical bus-pattern blockers have been repaired in an isolated
replay using a complete, checksum-verified **Geofabrik / OpenStreetMap** source.
The existing preparation code now produces **READY, 159/159 patterns**, with
**92 reuses + 67 rebuilds**, no missing patterns/failures. Candidate remains
**inactive**. This is real map/GTFS input, not manually invented road geometry.

Implemented bounded road-coverage checks, partial-Overpass-response rejection,
and default-off dated candidate recovery in the existing workers. No physics
parameter, tram motion module, Google WIP, native position solver or frontend
was changed. The 122.56s source-frontier policy is a separate task, not claimed
fixed here. No deployment, production data import, activation, commit or push.

**Production is NOT yet repaired by this task.** The code and audited source
are prepared for reviewed staging/rollout; do not confuse offline READY with
production activation.

## 1. Real source repair

Official source: https://download.geofabrik.de/europe/germany/sachsen-anhalt-latest.osm.pbf

- Source timestamp: **2026-10-25T21:21:21Z**.
- File size: 176,565,448 bytes; download bounded to 250 MiB.
- Published MD5 checked before and after download, and matched the payload:
  `636bd6e7a5aa77e72969982758ef0705`.
- PBF SHA-256: `ba1d36bfa5bcc08933000c1304f56ce090729fe6b158f8241f4d9909f851253c`.
- Official polygon verified to contain the WHOLE region bbox, including concave
  boundary/hole checks; no missing node references.
- Existing importer contract `perix-osm-source-v1` validated unchanged.
- Filters are the existing HIGHWAY_FILTER / RAILWAY_FILTER and signal normalizer.
  No road class, closure, oneway or snapping tolerance was relaxed to get READY.
- ODbL-1.0; attribution: OpenStreetMap contributors, source supplied by Geofabrik.

| Regional layer under existing importer filters | Full reference extract |
|---|---:|
| Road ways | **30,027** |
| Rail ways | 865 |
| Signals | 2,814 |

The historical failing road snapshot had 26,137 ways. Counts are not by
themselves proof of correctness: the decisive result is successful routing,
ordered platform validation and infrastructure derivation on the real patterns.

| Historical blocker | Before | Full reference, same 120m validator |
|---|---|---|
| 56:5368b7d9e2 | 3595.6m / invalid order | **20.1m**, valid |
| 56:31ae567775 | missing 7→8 and 13→14 | **22.3m**, all pairs resolved |
| 56:cf42f1d537 | 3596.3m / invalid order | **22.3m**, valid |
| 56:31e03e1a20 | 3596.3m / invalid order | **22.3m**, valid |
| 57:85ade62306 | 1061.3m / invalid order | **23.5m**, valid |
| 57:eaa2f964fd | 1097.5m / invalid order | **24.6m**, valid |
| 59:aa7727a8ad | missing 0→1, 2→3, 5→6 | **24.1m**, all pairs resolved |
| 59:2b12646995 | missing 0→1, 2→3, 5→6 | **24.1m**, all pairs resolved |

All eight also built directed infrastructure successfully. This demonstrates
insufficient historical imported graph data for these patterns; it does NOT
prove which historical fetch/filter incident originally removed those roads.

`geometry-source-proof.json` records the eight direct comparisons. Full source
and generated bundles remain in the approved private temporary directory, not
embedded into the Git patch. No external traffic or routing API was used.

## 2. Full preparation, not just eight isolated routes

Ran the actual reviewed production `prepare_network_version` on frozen real
network versions, ready generations and the full reference source, with all
storage redirected to explicit **in-memory collections**. This verifies the
application's routing/derivation/readiness logic, NOT real Mongo durability.

- Target: dated 26/10 candidate `net_7c4078011f7f`.
- Previous source network: `net_7f0605d2409e`.
- Captured active operator restrictions: **0**. None were silently discarded.
  Production-only mode/direction/edge-closure code remains in the reviewed patch.
- Result: **READY, 159 expected / 159 ready**, 92 reused, 67 rebuilt.
- `blocking_missing=[]`, `failures={}`.
- Controller result: **READY_NOT_ACTIVATED**; activation callback was absent.
- Zero external fetch attempts. The graph identifier in replay is explicitly
  an OFFLINE namespace, not an installed production OSM version.

Unchanged patterns may retain validated last-good geometry, as the existing
policy allows. Do not call all 159 newly rebuilt from the newest graph. These
gates are not independent operator certification of each road or proof of ETA
accuracy. Revalidate current date, GTFS and closures before a live promotion.

## 3. Code changes

### Bounded road coverage, not kilometre snaps

`mobility/roads.py` checks bus/taxi platforms against the existing **120m**
platform tolerance before A*. If the closest node is far but a real graph edge
passes nearby, it does NOT reject a valid long edge merely for sparse vertices.
The existing full-path ordered validator still decides. No virtual node,
invented edge or direction reversal is created.

Missing coverage now reports `PLATFORM_OUTSIDE_LOCAL_GRAPH` plus bounded snap
diagnostics. A missing directed route reports `NO_DIRECTED_PATH`. Generation
failure reports preserve these diagnostics. Tram routing does not enter the
new bus/taxi snap check.

When an explicit graph snapshot is pinned, routing cannot fall back to public
Overpass and silently mix source versions. Bootstrap behavior with no pinned
snapshot is retained.

### Partial HTTP 200 is not a complete OSM response

`mobility/osm_client.py` now rejects invalid response structure and a nonempty
Overpass `remark`, even when HTTP 200 contains nonempty elements. A timeout or
out-of-memory partial result cannot be counted as a successful complete tile.
Mirror/attempt caps are unchanged. The prior optional valid-empty response
policy is retained. This closes a demonstrated code-level acceptance gap; no
historical partial response body was available to prove it caused this incident.

### Bounded daily recovery in the existing coordinator

`mobility/daily_recovery.py` and worker hooks add a dated, source-hash-bound
candidate record, ownership/CAS fence and durable operator alarm:

- **MOBILITY_DAILY_RECOVERY_ENABLED=false by default**; not enabled in production.
- Reuse the same pending candidate for identical GTFS hash AND civil date;
  a new day never inherits yesterday's pending promotion.
- Recover from the existing OSM-repair/precompute event, or its existing 20m
  periodic wake-up. No extra permanent poller or frontend/user-triggered work.
- New graph: eligible immediately; same graph: >=300s cooldown, **3 attempts
  per graph**, **12 attempts per civil day**, including failures.
- Preparation timeout 600s, ownership lease 900s, activation timeout 20s.
  No long preparation near midnight; date and ownership checked again before
  promotion. New managed activation is stopped if its feature flag is disabled
  during preparation.
- Call the existing preparation callback and then existing activation with
  **require_ready=True, force=False** only. Read back exact scope/date before
  confirming an already active candidate. No readiness bypass.
- Persist `DAILY_NETWORK_NOT_READY` and the actual missing pattern IDs. Log the
  recovery state/alarm through existing logging. This is an operator-readable
  durable alarm, NOT a claim an external email/push monitoring integration was
  configured.
- Ambiguous activation results are not blindly retried or overwritten by a new
  feed revision; matching scoped ready-active readback can reconcile the alarm.
- No successful sync marker is written when activation fails.

The original network-switch implementation is reused. This patch does not
claim to make its multi-document activation a Mongo transaction or to solve
all failover cases. Real-Mongo failure/concurrency validation remains a staging
gate. Unit ownership/race tests use atomic in-memory test controls.

The local WIP static worker also receives civil-midnight wake-up, explicit date
propagation and blocked-hash safeguards already present in production schema12.
The private network creator gains an optional explicit service_date, preserving
existing callers. Legacy automatic `force=True` promotion is removed: without
atomic readiness, automatic promotion now fails closed.

## 4. Dirty WIP versus production — two separate deltas

The local checkout is older than current production in several modules. Shipping
its whole worker/road/generation files would discard production safeguards.

Therefore deliver BOTH:

1. A task-only local WIP delta: worker/date integration and source guard changes,
   new recovery module, optional offline extractor, tests and Mobility CI.
2. A separate source patch against the reviewed **d91ff576** production tree.
   It preserves schema12, occurrence clocks, official schedule revision audit,
   verified mode/direction closures, reversed closure edges, existing readiness
   and successful-sync checks. No frontend assets or unrelated WIP are bundled.

Only the reviewed production-specific patch is relevant to a later rollout.
The isolated production test context is NOT a complete deployable application.
Do not deploy the dirty checkout or use a report directory as a Railway root.

Local modified files:
- `mobility/roads.py`, `mobility/generations.py`, `mobility/osm_client.py`
- `utils/mobility_workers.py`, `routes/mobility.py`
- `.github/workflows/mobility-physics-research.yml`

Local added files:
- `mobility/daily_recovery.py`
- `tools/build_osm_source.py` (optional pyosmium CLI only; requirements unchanged)
- `tests/test_daily_network_recovery.py`

The production patch additionally updates one existing civil-day test: import
still occurs for a new day, but legacy non-atomic forced activation is no longer
an expected successful behavior. No business/schedule approval test was relaxed.

## 5. Validation

- New units first: **30 passed** in local WIP, **30 passed** in production context.
- Local relevant regression: **465 passed**, no skips.
- Reviewed-production-context regression: **295 passed / 1 skipped / 2 deselected**.
  Skip: an old isolated capture not packaged in the application image. The two
  deselected editor API cases require the shared destructive `test_db` fixture;
  they are deliberately not executed against application databases.
- One existing multipart deprecation warning; no remote CI run claimed.
- Full real-source preparation: **159/159 READY, inactive**, as above.

The initial broad production-context test run is retained separately. It found
an omitted golden JSON in the isolated harness, the intentional legacy-force
expectation change, and incompatible API fixture setup. The original golden
fixture was copied byte-for-byte, the old force expectation was updated for the
new fail-closed rule, and destructive API cases were excluded. No failing
geometry test was hidden to obtain READY.

The optional PBF parser was installed only in an approved temporary tool target
(pyosmium 4.3.2), not added to application requirements or the production image.
Geofabrik acquisition used four bounded public HTTP requests; no TomTom/Google
Traffic/Routing API or new GTFS downloads were made by this task.

## 6. Production observations and what remains

Read-only observation at **12:30:31Z on 26/10** still showed active timetable
**net_7f0605d2409e / 25/10**, recovery flag false, new module absent in production.
The EXISTING OSM worker independently advanced its graph to **1793013850**
(29,251 roads / 733 rails / 2,814 signals) while this task was running. This was
not an agent write and not installation of the audited PBF source. It reinforces
why graph refresh alone is not proof today's inactive timetable was promoted.

No production success is claimed. Before production application:
1. Review/apply the production-specific patch to a pinned current source tree.
2. Validate real Mongo ownership/failure behavior and promotion in isolated staging.
3. Recheck today's GTFS/date/operator restrictions and all geometry gates.
4. Obtain a FRESH complete rollback export of graph ways, rails, signals,
   metadata, active network and relevant generations. The existing importer
   removes old raw graph versions after promotion; a metadata pointer alone is
   NOT an adequate data rollback.
5. With separate authorization, feed the audited source through the EXISTING
   validated importer, request the existing precompute event, and prepare the
   correct current-day candidate. Never promote the frozen 26/10 replay on a
   different day or force a candidate that fails the gates.
6. Enable recovery only after validation/approval. Verify both bus and tram
   schedule dates, served runtime identity and passenger endpoint consistency.

Native recalibration, its 180s freshness default/source-frontier policy, tram
physics and Google WIP are unchanged; no claim of vehicle accuracy improvement.

## Rollback / evidence

No production rollback is needed NOW because nothing was applied there. For
local source rollback, reverse only this task's checked patch if hashes still
match; otherwise merge its hunks. Never reset the dirty checkout. Older reports
and protected physics/Google modules are hash-checked unchanged.

Future live rollback must combine the approved source rollback with the fresh
FULL data export above, while workers are controlled; do not simply point to a
raw graph already deleted by an importer. Preserve concurrent operator changes.

`task-manifest.json` records file/input/artifact hashes, exact changes, test
results and mutation boundaries. Large OSM/PBF/generated geometry files stay in
the approved private temporary workspace; report metadata does not redistribute
the full source database. Respect ODbL attribution/distribution obligations before
publishing map-derived databases.

Reproduction materials: `validation-harnesses.zip` preserves the bounded source
acquisition, verified-production overlay construction, eight-pattern geometry
check and full in-memory preparation scripts. They expect the pinned inputs and
reviewed baseline in the approved temporary paths recorded in the manifest;
they are not generic production commands. The copied export script is an audit
record, refuses overwriting existing evidence, and should not be run from this
report directory. The original executed exporter path is recorded in the manifest.

One local preimage deserves an explicit provenance note: `routes/mobility.py`
was inspected but omitted from the automatic initial copy. Its patch preimage
was reconstructed by reversing exactly the three recorded private-creator edits,
not by using HEAD or discarding other WIP. Other modified-file preimages came
from the task-start snapshot. Forward/reverse reconstruction checks cover both
patches; they do not turn that route preimage into an original byte capture.
