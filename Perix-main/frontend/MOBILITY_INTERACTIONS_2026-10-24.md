# Mobility interaction contract

- Bus/tram markers carry the supplied public route number in an upright badge.
  The badge is outside the rotated vehicle group. No fleet number is invented.
- Selecting a vehicle opens its upcoming stops; selecting it again closes it.
- Selecting a stop opens its arrival board and clears the vehicle panel.
- Network and journey polylines have `clickable: false` and no click listeners.
  The web/native bridge no longer accepts line-selection actions.
- A selected stop does not remove other otherwise-visible stop markers.
- Loading/failure/empty states are distinguished. Slow trip requests are single-
  flight, as stop requests already were; existing polling intervals are retained.

Upcoming stops prefer an unambiguous motion next-stop anchor for the same trip.
For repeated/unknown stop IDs the UI does not guess a loop occurrence. Elapsed
source predictions remain unchanged and receive an explicit discrepancy warning
when the position still places that stop ahead. This is NOT an effective-ETA
engine correction. Platform-distance and shared-plan ETA findings in
`backend/MAGDEBURG_STOP_ETA_AUDIT_2026-10-24.md` remain open.

The classic Google stop marker now has its own click listener. Previously only
the unused DOM container had one in that fallback; a real marker click could
therefore fail to open the board.

## Verification

- 32 focused frontend tests passed; TypeScript typecheck and web exports passed.
- Targeted lint: zero errors; four pre-existing native-component warnings.
- Staging: `af34b193-a621-440b-a196-9d7dc38988ed`.
- Production: `45be2af4-74eb-4c37-af0f-274c7b495be1` (`SUCCESS`). Served entry:
  `entry-bf5fd4956726d703f4d0f4016b5f2421.js`.
- Browser with real staging APIs: vehicle selection opened the next-stop list;
  classic stop-marker selection opened Allee - Center arrivals and cleared the
  vehicle list; 20 arrival rows were rendered. All ten sampled vehicle icons had
  a route badge, all 128 rendered network lines had no click listener, and map
  height remained 300px.
- The same vehicle/stop interaction was checked on the public production page.
  All ten sampled vehicle markers had the supplied badge, line click listeners
  were absent, and the next-stop panel opened. A subsequent actual stop-marker
  click opened 20 arrivals and cleared that vehicle panel. Runtime verification matched all
  256 packaged backend files with zero mismatches; only the frontend archive
  differs from the previous release. Google traffic remains disabled.
- A 390×844 staging browsing viewport retained a 358×300 map and opened the
  vehicle next-stop panel. This is a responsive web check, not native hardware.
- Both bus and tram badges/click contracts are covered by isolated SDK mocks.
  The live nighttime staging fleet contained buses, so a live tram click and a
  native-device build are not claimed here.

## Release boundary

Only `backend/webdist.dat` changes in the isolated promotion context. Backend
source hashes, geometry, motion plans, realtime matching, account code and data
contracts are identical to production deployment
`4211552f-697f-49da-b8d9-e814064bdc4e`.

Local artifacts: `C:/Users/PC/AppData/Local/Temp/opencode/perix-mobility-interaction-release/`.
The production build targets app.perix.eu; the staging build targets its own
backend. No island changes, provider activation or paid Routes requests.
