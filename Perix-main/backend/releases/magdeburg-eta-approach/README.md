# Magdeburg ETA + boarding approach — staging validated

**Deployed to staging only:** `236dda90-b9fa-40c9-9ae4-fe8a6a6bd616`.
Production baseline `45be2af4-74eb-4c37-af0f-274c7b495be1` remains unchanged.
The shared backend checkout contains older unrelated WIP; do not deploy it or
apply this patch over it. This bundle retains the exact isolated backend delta.
Frontend changes are ordinary source changes in `Perix-main/frontend`.

## Behavior

- Virtual positions, stop arrivals and selected-trip details share the cached
  effective motion-plan timeline and revision. Original provider times remain
  separately visible. Real GPS coordinates/provider clocks are not replaced.
- When physical arrival overtakes the source's departure clock, retain the
  explicit source dwell duration rather than silently dropping boarding time.
  If the source departure is still ahead, keep it (do not extend a timetable
  hold unnecessarily). No arbitrary dwell is invented for zero-duration stops.
- Distances and selected-platform arrivals use the serving platform, not the
  representative point of a same-name physical-stop group.
- Deep-zoom markers preserve individual platform IDs (including opposite
  platforms within the old 12m clustering radius). Group markers at lower zoom
  deliberately retain all directions; each arrival displays its platform.
- Ride legs retain exact dated trip identity, boarding platform, ordered
  occurrence and canonical progress. Active virtual plans use effective clocks;
  cancellation/skip overrides remain authoritative.
- The additional lime `#A3E635` approach line follows canonical geometry from
  the displayed vehicle progress to boarding. The existing location-to-stop
  walking instructions and ride lines remain. One polyline is replaced each
  animation frame, never appended as a trail.
- Matching requires exact dated journey, direction-specific pattern, future
  occurrence and matching canonical geometry checksum. No matching active vehicle,
  ambiguous identity, missing metadata, raw/unmatched GPS, position-only GTFS
  fallback, changed geometry, passed platform or stale fleet sample => no overlay.
  This intentionally avoids guessing; it does not prove physical fleet accuracy.
- Missing ETA displays `—`, not `0′`. PERIX/model and provider predictions stay
  separate, and feed age uses the actual source timestamp.

## Replay without touching WIP

From this directory, with a hash-verified baseline **context** containing
`Perix-main` and a new destination whose parent exists:

```powershell
python bundle.py replay --baseline <verified-context> --destination <new-directory>
```

The script validates all baseline hashes, checks/applies the patch, and verifies
every reconstructed file. It refuses an existing destination. The reconstructed
tree still has the **old frontend archive**: build/package the changed frontend
in isolation before using it for staging. Never upload the dirty checkout.

## Validation and remaining gates

Offline candidate tests cover actual bus/tram physics, handover boundary,
repeated replans, dated cache isolation, common ETA revisions, GPS preservation,
opposite-platform distance/filtering, boarding dwell, cancellations/skips,
planner identity, exact geometry matching and shrinking/no-trail overlay.
Validation on 2026-10-24: **80 backend tests passed, 1 explicitly skipped**;
**39 frontend tests passed**. Isolated replay verifies **263 exact files**;
the staging runtime matches all **260 packaged backend files**. The dirty
workspace TypeScript check passed, but the isolated clean frontend has five
pre-existing `CityAdViewer.tsx` type diagnostics; no Mobility diagnostics.
Do not describe the isolated frontend as globally typecheck-clean.
Targeted ESLint has no errors; existing warnings remain.
See `VALIDATION_2026-10-24.md` for actual HTTP/browser and real-geometry replay
results and limitations. No field/GPS accuracy claim.

Staging packaging, artifact tests, directional arrival browser checks and a
real-data approach-layer component smoke are complete. Full passenger-GPS
journey E2E and daytime live-tram observation were not performed. Production
promotion is still pending; do not upload the staging archive to production
(its frontend API URL is staging). Google Routes polling stays disabled.
No island, basemap, credentials, database or provider configuration changes
are included.
