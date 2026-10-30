# Home transit + inline business directions

Later origin-selection update: see `LOCATION_MODE_2026-10-24.md`. An explicitly
chosen address is now a supported journey origin as well as live device GPS;
arbitrary viewport panning is still not an origin selection. The records below
describe validation of the earlier home/directions release.

Staging deployment: `fd42aaba-c78c-441f-b908-cbf39b11a373` (`SUCCESS`).
Preview: `https://backend-staging-staging-7ada.up.railway.app/home`.
Production remains `45be2af4-74eb-4c37-af0f-274c7b495be1`.

## Scope

- Home's existing map retains business, event, activity, job, rental, product,
  home and service markers, and adds genuine passenger-API bus/tram positions.
- Transit vehicles remain individual selectable markers even when they share
  coordinates with businesses or other vehicles. The web zoom scale matches
  Mobility; native maps receive explicit transit symbols and route badges.
- Marker clicks open `/locator?tab=mobility` with the exact vehicle ID, dated
  journey identity, mode and snapshot focus. Locator then validates the fresh
  fleet response before opening its stop panel. An expired journey displays an
  unavailable message rather than selecting a same-route replacement. A single
  focus update uses the current position; later polls do not steal the camera.
- Home polls are single-flight and stop on blur/background, expire after 30s
  without a successful sample, and use baseline traffic context. Canonical
  interpolation requires an exact pattern/date/version match, never a route
  number or opposite-direction fallback.
- Home's existing vehicle interpolation now stops at the last supplied sample,
  honors dwell/signal/zero-speed holds and resets on journey changes. It does
  not extrapolate through stops or create another position estimator.

## Business maps

`BusinessProfilePremium` opts its existing `ContentMap` into inline directions.
Other event/activity/job/service/listing maps retain their old behavior.

- The same `planJourney` passenger API and shared `journeyPlanLines` presentation
  are used by Locator and business directions. Walking, rides, boarding/alighting
  stops, departure/arrival clocks and total duration remain visible.
- Origin is the device's current location, not a saved/manual browsing area.
  With an existing fix, planning starts automatically. Without one, a location
  action requests permission only after a gesture. No-location, no-connection
  and request-failure states are explicit; no fallback route is invented.
- The route origin is captured per request instead of replanning on every GPS
  watch tick. “Refresh from my current location” obtains a new fix and plan.
  Obsolete responses from another business/origin or an unmounted view cannot
  replace current directions.
- The existing map fits the origin, destination and returned geometry. Native
  business maps now render the same plan polylines. External Maps remains an
  optional action, not an automatic paid routing request.

## Validation / artifact policy

- **47 frontend tests passed**, including the existing Mobility, auth, polling
  and bridge tests plus new home/link/directions/animation/cluster regressions.
- Shared dirty-workspace TypeScript check passed. The isolated tracked-source
  build still reports the five known `CityAdViewer.tsx` baseline diagnostics;
  no new diagnostics in the changed feature files. Do not call that isolated
  build globally typecheck-clean.
- Frontend export succeeds. The source snapshot uses tracked HEAD plus 21
  explicitly approved files. Pre-existing unrelated BusinessMap readiness/
  traffic WIP is excluded from the package and preserved in the shared checkout.
- Backend application code, importer, motion engine and API data are unchanged
  from validated ETA staging `236dda90-b9fa-40c9-9ae4-fe8a6a6bd616`.
  Only the packaged frontend archive changes. No database/configuration/account
  changes, paid Google Routes calls, new basemap fallback or island-service
  changes are part of this task.
- Runtime verification: **260/260 packaged staging backend files match**, and
  **256/256 production backend files** still match the old live release.
- Production remains unchanged. Native renderer changes are type/source-tested,
  not certified on a physical Android/iOS device.

## Browser evidence

- A real visible home N1 marker was clicked in Chromium, opening the exact
  passenger-API vehicle in Locator Mobility and rendering its upcoming stops.
  Home had 18 actual active vehicle markers in the final captured window. The test
  passenger position was deliberately simulated near a real vehicle so that a
  marker was inside the viewport; no fleet position or ID was fabricated.
- Inline business directions were rendered in desktop and mobile Chromium
  viewports for the existing staging MVB business coordinates using the actual
  passenger planner. Depending on the current test origin/time, results included
  walking, N1 to Arenen, transfer to bus 46, Allee-Center and the final walk.
  The checked request's
  origin matched the simulated device fix and its destination matched the
  business coordinates. No browser runtime exceptions in the final passing
  desktop/mobile runs. The exact Mobility iframe was selected by its title
  (not Google's unrelated hidden iframe) when verifying the focus center.
- Browser-only fixtures supplied the authentication profile, the protected
  business-detail envelope (using public business coordinates) and passenger
  geolocation. This is not a claim of a real signed-in account E2E. No account
  was created, no protected API authorization was bypassed on the server, and
  no API data was written. The profile-view analytics POST was fulfilled
  locally as a no-op, not sent to the backend. Genuine vehicle/planner GET
  requests remained unmocked. Initial fixtures that aborted analytics caused
  an unrelated global error boundary; the final fixture prevents the write
  while returning a local success instead.

Isolated source, package, manifests and browser evidence are retained in
`C:\Users\PC\AppData\Local\Temp\opencode\perix-home-business-release-v2`.
Do not deploy the dirty repository or promote its staging-targeted archive
unchanged to production.
