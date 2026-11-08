# Magdeburg times, platforms and virtual-motion validation

## Outcome

The corrected package is running on **staging only**:
`236dda90-b9fa-40c9-9ae4-fe8a6a6bd616` (`SUCCESS`).

- Staging API/UI: `https://backend-staging-staging-7ada.up.railway.app/locator?tab=mobility`
- Production remains `45be2af4-74eb-4c37-af0f-274c7b495be1`.
- Runtime hashes: **260/260 staging backend files** match the candidate;
  **256/256 production backend files** still match the previous live release.
- Staging and production DB configuration fingerprints differ; no credentials
  were printed and no environment variables or source data were changed.
- Motion/handover enabled; paid Google Routes traffic calls remain disabled in
  both environments. No island services were changed.

## Additional defect found and fixed

A full-trip, one-second-step regression revealed that a physically late arrival
could overtake the provider's departure clock and erase an explicitly supplied
boarding dwell. The existing engine now retains that source dwell after a late
arrival. A departure still in the future remains unchanged. Stops with no
explicit dwell do not receive a fabricated dwell duration.

Both bus and tram tests check every second of the journey through repeated plan
refreshes: no backwards steps, no speed-cap violations, and any boardable zero
ETA is within 0.5m of the correct canonical stop progress. This tests model
consistency, not world position.

## Automated checks on the reconstructed artifact

- **80 backend tests passed**, 1 skipped: the older isolated safe capture is
  deliberately not packaged in the application image
  (`test_mobility_civil_day.py:220`).
- **39 frontend tests passed**, including opposite-platform click IDs,
  platform API filtering, unknown ETA, exact dated-trip/geometry matching,
  no-trail shrinking overlay, polling cancellation and existing interactions.
- Frontend web export succeeded from clean tracked source plus the nine
  explicitly approved Mobility source/test overlays. Dirty BusinessMap WIP,
  dotenv files and unrelated backend WIP were excluded.
- The isolated clean frontend has five known baseline type errors in
  `components/stories/CityAdViewer.tsx`; no Mobility errors. The dirty workspace's
  clean typecheck result is not used to claim the isolated artifact is globally
  typecheck-clean. A build-only Metro watch-folder setting exposes the shared
  dependency cache, not dirty application source.

## Real staging passenger API samples

Successful repeat audit at `2026-10-24T01:01:44Z`:

- Current dated network: `net_7eced50ab798`, service date `2026-10-24`,
  **2,683 trips**, **128/128 ready canonical patterns**.
- Four rounds, **9 active night buses**, **36 platform-specific boards**,
  **355 arrival rows**: 40 PERIX estimates, 35 raw realtime predictions,
  280 scheduled predictions.
- **16 same-plan, same-stop-occurrence clock comparisons passed**.
- No wrong-platform leakage, zero-before-stop fleet distance, impossible
  remaining-time lower bound, skipped next platform or model-provenance failures
  in that sample. Maximum completed HTTP request: **3.312s** (not an SLA).
- That successful repeat window contained no zero rows, so it alone does not
  prove the zero behavior. An earlier window captured **N6 / Am Stern,
  platform `210175`, trip `1885252`, ETA `0s`, distance `6m`** to the actual
  platform, with source/provider clocks preserved separately.
- The first audit initially flagged N2 when it reached the next platform between
  the fleet and details requests while retaining the same plan revision. This
  was an audit comparison error, not a clock defect: fleet occurrence 11 and
  detail occurrence 12 were being compared. The retained audit now compares
  the same ordered occurrence, and the repeat passed. Original evidence remains
  retained rather than discarded.

Reproduce the public read-only audit:

```powershell
python audit_http.py --origin https://backend-staging-staging-7ada.up.railway.app --output <new-evidence-directory> --rounds 4 --stops 12 --interval 5
```

## Actual browser checks

- Staging app and Google map load; **128 lines**, actual numbered night vehicles,
  map height **300px**; no captured browser console errors.
- Actual rendered Domplatz platform-marker clicks result in distinct requests:
  - `platform_id=611034`: N2 toward Westerhüsen and N3 toward Reform.
  - `platform_id=408769`: N2/N3 toward Allee-Center.
  - The displayed rows retain only the selected platform, its source/model
    labels and the actual feed age.
- A real API journey and active N1 vehicle were used for a **map-component**
  approach-layer smoke. Canonical geometry checksum and dated trip matched;
  lime `#A3E635` polyline began at exactly the displayed marker coordinates,
  walking/ride lines remained, and clearing selection detached the overlay.
  This used direct layer calls, not a full passenger-GPS UI E2E. The short
  component observation was stationary; animated shrinking is covered by
  deterministic frame tests, not falsely claimed as observed live movement.

## Real daytime schedule/geometry replay (read-only staging process)

Since the observation window was nighttime, daytime tram checks used actual
imported schedules, current READY canonical geometry and infrastructure, not
invented vehicle positions or claimed live tram observations. `audit_daytime.py`
rebuilds the existing motion plans and samples them every two seconds plus the
arrival/departure boundaries. No worker or new motion engine is introduced.

| Mode / line | Trip | Distance | Model duration | Max speed | Max platform offset | Failures |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Bus 46 → Hbf | 655605 | 3,437m | 660s | 43.47km/h | 28.42m | 0 |
| Bus 46 → Messe | 1836124 | 4,584m | 720s | 50.00km/h | 39.09m | 0 |
| Bus 48 → Verkehrsbetriebe | 442609 | 1,763m | 360s | 43.20km/h | 14.75m | 0 |
| Tram 1 → Cracau | 1490985 | 9,788m | 1,916s | 50.00km/h | 15.08m | 0 |
| Tram 1 → Hbf | 64771 | 5,164m | 1,058s | 47.55km/h | 22.67m | 0 |
| Tram 1 → Kannenstieg | 1657498 | 9,892m | 1,860s | 50.00km/h | 18.41m | 0 |

Total: **84 stop entries**, **57 comparable zero-ETA boundary checks**, no
zero-at-wrong-progress or nonphysical-step failures. Canonical road/track
positions can be several metres from curb/platform coordinates; the measured
offsets are disclosed, not hidden or corrected by moving real GPS.

## Limits and release gate

- No vehicle GPS exists; these are internally consistent schedule/realtime-based
  estimates, not measured fleet locations or a promise of real-world punctuality.
- Active virtual journeys share the effective motion clocks. Future/non-active
  arrivals continue to expose provider/schedule forecasts; they are not all
  physical-plan-validated vehicles.
- Six daytime replay journeys and sampled night buses do not certify every trip,
  detour, DST boundary or operational exception on the network.
- Full passenger-GPS UI E2E and daytime live-tram observation remain unperformed.
- Production promotion remains pending. Rebuild with the production API origin;
  never promote the staging-targeted frontend archive unchanged.

Raw evidence is retained under
`C:\Users\PC\AppData\Local\Temp\opencode\perix-eta-consistency-release\`:
`http-audit-v1/`, `http-audit-v2/`, `daytime-physics-result.json`,
`validation-preflight.json`, `staging-network-preflight.json`,
`staging-runtime-verification.json`, `stage-manifest.json`, and the isolated
source/package directories. The repository bundle retains the exact backend
delta and reproducible read-only audit scripts without overwriting shared WIP.
