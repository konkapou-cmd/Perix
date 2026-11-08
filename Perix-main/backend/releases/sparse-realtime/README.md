# Sparse realtime safeguards — isolated release candidate

## Release status

Production is not promoted by this workflow. Baseline deployment:
`92095c5c-033d-45b8-b358-3bd2fd4abcac` (`https://app.perix.eu`).
The baseline runtime was reverified: 264 matching backend hashes, paid Google
Routes disabled. The frozen upload/rollback contains 267 verified files.

All feature changes are in an isolated candidate. Shared repository backend,
BusinessMap and other user WIP are not overwritten. `source-delta.patch` is a
delta against the verified production backend and its validated frontend source,
**not** a patch to apply blindly to the dirty repository checkout.

Staging deployment `1e740d85-ca19-4d51-a913-62dd20fc4e6c` completed with
`SUCCESS`. All 271 expected runtime backend files match, and the served frontend
entry/map HTML hashes match the frozen package. Paid routing remains disabled.
Final validation passed **87 backend tests / 92 frontend tests**, focused lint,
and zero new TypeScript errors compared with the frozen baseline.

Read-only HTTP smoke checks sampled 48 virtual vehicles: 44 moving vehicles
carried timing evidence; four unchanged schedule turnaround/stop anchors had no
timing-evidence record. An actual propagated-timing sample and its trip detail
retained the same estimate revision. Worker-history bounds and invalid-scope
rejection passed. There were no actual GPS vehicles in that sample, so this is
not a live GPS-observation test. Fleet/detail HTTP checks took about 2.3/2.4 s
including network latency; diagnostics about 0.53 s. No baseline load comparison
was performed, and these are not production performance guarantees.

Browser checks selected an actual tram 9 towards Reform. It disclosed carried
`+51s` timing from Raiffeisenstraße, unknown trip-update time, and model position
rather than GPS. The overview at zoom 11 presented exactly 40 choices for 40
source IDs in a bounded sheet below the top controls and above map attribution.
Small marker scales and selected detail survived zoom changes. No actual live
source correction was observed during this check; correction behavior is covered
by the controlled canonical replay, VM marker tests and extracted Home update
branch regression. See the individual JSON evidence files for exact scope.

## Behavior

- Carry the latest applicable stop departure delay across missing downstream
  predictions; do not revert to a derived first-stop delay.
- Keep scheduled, provider and PERIX model clocks distinct. Departure-only,
  arrival-only, propagated, trip-wide, absent and conflicting evidence retain
  their provenance; unknown trip timestamps remain unknown.
- Use original stop sequence where available. Ambiguous repeated stop IDs do
  not select an occurrence by guesswork.
- Atomically reject older feed/trip clocks inside the dated/versioned scope.
  An unknown incoming trip timestamp cannot erase the last known high-water mark.
- Keep source-validated dated cancellations/skips through timing outages, but
  strip their stale prediction clocks. Operator overrides remain in place.
- A revised source timing frontier can invalidate simulated history. Rebuild
  the virtual plan from usable source anchors, retaining canonical geometry.
  Explicit estimate revisions reset the existing virtual marker; actual GPS
  coordinates and physical identity are never rewritten by this mechanism.
- Selected-trip disclosure distinguishes model position from GPS, carried timing,
  missing source timestamps, conflicting clocks and fallback uncertainty.
- Source/model diagnostics are worker-local, read-only, bounded to 2,048 events,
  4 MiB and 15 minutes. Restarts lose history. Counts are actual retained/dropped
  events, not a promise of durable or complete history.

## Captured tram 9 replay

Trip `1221147`, service date `2026-10-25`, network `net_7f0605d2409e`.
The original capture had Raiffeisenstraße departure `18:05:27` / `+87s`, no
direct Am Fuchsberg update, and an old downstream fallback `18:05:52` / `−8s`.
The candidate produces `18:07:27`, a 95-second difference, without rewriting
provider records. Later provider timing was `18:07:15` arrival / `18:07:30`
departure. This is evidence of timing consistency, **not independent GPS proof**
or proof of a particular physical tram identity.

The full 20-stop original timetable was replayed using existing canonical
generation `gen_e8ae6f0991d921fcc2` (465 points), the real tram physics engine,
and no database writes. Position/next-stop ETA share the same plan. At 18:06:30,
Am Fuchsberg ETA is 57 seconds; at 18:07:27 the model reaches its canonical stop.
A separately labelled controlled +180-second prediction revision resets the
model from 6,019.56 m to 5,506.54 m rather than preserving the incorrect lead.
It is a synthetic prediction test, not an actual later provider capture.

On this machine the replay's six cold plans took median 43.3 ms / max 61.28 ms;
warm repeats median 0.88 ms / max 2.66 ms. These are focused replay measurements,
not a production load test or accuracy guarantee.

## Mongo verification

The actual candidate update pipeline ran against staging MongoDB 8.0.34:
93 sequential/transition/concurrent cases passed. It retained known trip-clock
high-water marks through timestamp gaps, rejected older trip clocks, preserved
literal `$` text, and respected date/version boundaries. Only a UUID-named
temporary collection was used, and that exact collection was removed. No
database drop or application-collection fixture was used.

## Limitations and remaining release gates

- Legacy forward-only fallback motion is **not repaired** here. Its
  `LEGACY_FALLBACK_UNCERTAIN` disclosure explicitly says revised timing may not
  match the marker. Do not claim accurate corrected live position in that branch.
- Sparse predictions cannot reveal unreported physical vehicle motion. Feed
  header age/receipt time are not GPS observations.
- Route 13 detour geometry/timetable repair is not part of this change. Existing
  operator warnings are preserved; Syros/Mykonos and paid routing remain outside
  scope.
- Final validation, staging deployment/runtime/served hashes, HTTP checks and
  browser results must be read from the accompanying evidence JSON files. Missing
  files mean those gates have not been completed, not that they passed.
- Production promotion requires its own production-origin build, allowlisted
  artifact, runtime/served checks and explicit release result. This helper has
  no production build/deploy command.

## Reproduction / evidence

The helper scripts retain the original Windows isolation paths and expect the
verified baseline, candidate sources and captured public transit fixtures under
`C:\Users\PC\AppData\Local\Temp\opencode`. They do not contain credentials.
`validate.py` runs only the explicit offline suites with a nonresponsive local
Mongo URL, compares TypeScript errors with the frozen frontend baseline and
records source hashes. The five existing `CityAdViewer.tsx` TypeScript errors
are a baseline defect, not silently treated as a clean typecheck.

The exported byte-preserving patch was checked and applied to a new clean
baseline reconstruction: all **27 changed/new source files** match the candidate
SHA-256 hashes exactly. Mixed LF/CRLF endings in the frozen baseline require
disabling Git's automatic newline conversion for this reproduction:

```powershell
git -c core.autocrlf=false -c core.safecrlf=false apply --check source-delta.patch
```

Use that check against a clean reconstruction of the stated baseline before
applying `source-delta.patch`. Never replace dirty shared backend files
wholesale. The helper preflight rejects unallowlisted changes; staging packaging
copies only verified files and adds the built `webdist.dat`.
