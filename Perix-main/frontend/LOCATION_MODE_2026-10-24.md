# Shared live/manual location selection

Staging: `12d03485-566c-4aec-8834-0c5f51a4e278`.
Promoted to production as `a7360ffb-4c82-4f16-bacc-bd7861111c5e`.
See `PRODUCTION_RELEASE_2026-10-24.md` for live verification and rollback evidence.
This supersedes the earlier GPS-only journey-origin policy: an **explicitly
chosen address** is now a valid origin; arbitrary map panning still is not.

## User flow and design

- Home's Set Your Area card now contains the address/place input, real
  suggestions and an optional Use My Location action. Go to Map and the
  explanatory "To see content..." paragraph are removed.
- Shared `AreaSelectionForm`/modal uses Perix design tokens, compact heading,
  white surface, blue accents, standard borders/radii and 44px controls.
- Map controls reopen the same Set Your Area form and provide a live-location
  action. Home, Locator/Mobility, business and the shared browsing maps use
  the same explicit selection, instead of independent GPS/manual pins.
- Manual selection: orange diamond/pin and the selected address. Live
  selection: blue live marker. Only one origin is drawn. Saved or manually
  selected coordinates are never labelled as a fresh GPS fix.
- GPS remains optional. A denied/slow GPS request leaves a manual selection
  intact. A late watch/startup/request cannot overwrite a newer address.
  Manual mode stops the position watch and survives reload even if location
  permission remains granted. Explicit live selection obtains a fresh fix.
- Full suggestion descriptions and exact provider coordinates are retained;
  typing alone does not invent a coordinate or silently pick an ambiguous
  result. Invalid coordinates are rejected, including out-of-world values.

## Directions and camera behavior

- Locator and business directions use the shared chosen origin. Their labels
  distinguish selected-address and live origins. New explicit selections
  invalidate older in-flight plans. Ordinary GPS watch ticks do not continually
  request plans or steal the camera.
- Refreshing business directions in manual mode keeps the selected origin and
  does not request GPS. Map controls still allow an explicit change to live.
- Mobility's bridge sends each explicit camera token only once; later vehicle
  polls cannot replay an older vehicle focus over the newly selected area.
- Static business journey previews fit the returned route/origin/destination
  extent instead of forcing a fixed zoom. No fallback line or new motion
  engine is introduced. Coordinate editors retain their own destination-pin
  semantics; the shared mode applies to browsing/navigation origins.

## Backend and packaging

The only backend application change is optional authentication for the existing
public-place suggestion use case in `routes/places.py`, with query/coordinate
bounds and a bounded cache. Reverse lookup and private account/business routes
keep their previous authentication. Existing provider/server throttles remain.
No database writes, environment changes, island deployment, paid Google Routes
calls or new public production tile fallback are included.

The candidate is derived from the verified prior staging artifact, not the dirty
backend checkout. The exact places/test delta is retained in
`backend/releases/area-selection`. Upload contains **264 explicitly hashed files**,
not caches or unrelated WIP. Runtime verification matched **261/261 backend
files**. Motion/importer/date/geometry source files are unchanged.

## Checks and limits

- **57 frontend tests passed** on the isolated source snapshot.
- **84 backend tests passed**, 1 old capture replay explicitly skipped because
  its isolated fixture is not part of the application package.
- Workspace TypeScript check passes. The clean isolated source still has the
  five known baseline `CityAdViewer.tsx` diagnostics, with no new feature-file
  errors; do not claim a globally clean isolated typecheck.
- Desktop and mobile Chromium passed genuine anonymous address search/selection, manual
  pin in Home and Mobility, switching to simulated device GPS, switching back,
  and reload with manual preference/GPS permission granted without restarting
  GPS. No runtime exceptions in the passing run.
  Backend source replay also verified all 264 reconstructed file hashes.
- Business UI checks used browser-only auth/detail-envelope fixtures, public
  business coordinates and the genuine planner. The manual origin and refresh
  matched the chosen address with zero GPS requests. No account was created;
  analytics was fulfilled locally as a no-op, with no backend mutation.
- Physical Android/iOS and real device GPS are not certified by browser tests.
  Existing non-Mobility basemap infrastructure limitations remain out of scope.

Source, package manifests, real suggestion payloads, screenshots and browser
reports are retained under
`C:\Users\PC\AppData\Local\Temp\opencode\perix-area-selection-release`.
Do not upload the dirty checkout or promote a staging-targeted frontend archive
unchanged to production.
