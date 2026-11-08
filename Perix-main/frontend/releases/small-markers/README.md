# Small transit markers and overview selection

## Scope

User-approved frontend-only change. No backend code, ETA/provider clocks,
GTFS/importer data, OSM/canonical geometry, traffic provider, Routes adapter,
database or environment configuration changes.

- `BusinessMap.web.tsx`: replace only `vehicleScale` with the requested steps
  0.34 / 0.38 / 0.44 / 0.52 / 0.61 at zoom boundaries 12 / 14 / 16 / 18.
  The separately approved same change is in the actual Mobility HTML renderer.
- Preserve bus/tram SVG artwork, icon factory, scaledSize/anchor calculations,
  heading, progress targeting and canonical animation.
- Initialize the Mobility record's scale once: heading-only polls of a newly
  created source marker must not fall back to a full-size 64/82px icon.
- At zoom **below 14**, group overlapping screen-space hit boxes of real
  payload bus/tram entries, including moving entries. Keep all original marker
  instances/coordinates. A count menu chooses the exact source ID; taxis are
  not included. Pan does not require regrouping or network reads.
- Badges bind to an actual source member, not a fabricated/mean coordinate.
  Overview count targets are centered on that member, and their 42px hit area
  participates in collision grouping; an offset count cannot steal a tap from
  a neighboring group. This affects only the count UI, not bus/tram anchors.
  Membership is refreshed at most every 250ms during animation and on vehicle
  payloads/zoom. No HTTP, line redraw or vehicle recreation is added by grouping.
- Use a bounded overview selection sheet below the parent's area controls,
  left of the location/zoom controls and above attribution, not a geographically
  anchored InfoWindow that can slide under those controls. A valid source-ID snapshot survives movement/
  group splitting while scrolling; expired/replaced dated journeys close it,
  and stale buttons cannot select a replacement trip. The menu height fits the
  300px mobile map. Overview groups dissolve at zoom 14; pre-existing exact
  stationary coincidence selection remains available at close zoom.

## Measured candidate

390×844 CSS viewport, device pixel ratio 3, actual Google Maps and genuine
read-only fleet/trip responses (browser emulation, not physical handset QA):

| Zoom | Bus CSS px | Tram CSS px | Bus device px | Tram device px |
| --- | ---: | ---: | ---: | ---: |
| 11 | 22 | 28 | 66 | 84 |
| 14 | 28 | 36 | 84 | 108 |
| 17 | 33 | 43 | 99 | 129 |
| 19 | 39 | 50 | 117 | 150 |

The intermediate 12–13 step computes 24/31 CSS px. SVG DOM image bounds were
measured where present; at close zoom Google Maps optimizes into canvas, so
passive drawImage instrumentation measures actual destination pixels without
changing the renderer. Visible SVG rotation matches heading−90, and the route
badge remains outside the rotation.

- **86 isolated frontend tests passed**; workspace TypeScript passed.
- Final staging `739b99c1-18d3-4591-b888-388820dd8193`: **264/264 runtime backend
  hashes matched**, paid Routes disabled. All 267 package members are unchanged
  from production except `backend/webdist.dat`.
- Final four-zoom mobile session ending `19:21:50Z`: **8/8 real taps** selected
  the requested Bus/Tram ID; original marker instances retained. Sixty animation
  samples per type/zoom showed zero sampled canonical-position error and no
  extrapolation beyond the received target. Frame timing is not a device SLA.
- Independent final overview session ending `19:21:20Z`: 47 source vehicles, a
  **40-member non-coincident overlap** with exactly matching menu IDs, real bus
  46 and tram 10 individually selected. Badge anchor error 0m. At zoom 14,
  overview groups cleared with **zero vehicle recreations / zero line redraws**.
  The 184px content sheet stayed outside the parent control areas. One map HTTP
  read, no API writes or runtime exceptions.

Earlier measurement attempts and failures remain retained. They exposed
overlapping hit targets, canvas-vs-DOM instrumentation, popup stability, and a
stale screen-coordinate tap after a screenshot while a close-zoom vehicle was
moving. The last issue was fixed in the test harness by tapping the current
projected source position, not by moving the vehicle. No earlier failed run is
silently counted as passed.

## Safe artifact / rollback

Frozen baseline production:
`0adc9837-d717-4694-a10d-686b052ad4d3`.

The shared checkout contains unrelated backend and BusinessMap readiness/
traffic WIP. Deployment uses a separate verified source copy. The BusinessMap
function was replaced in the already-published source; the dirty BusinessMap
file was **not** copied wholesale. The only source delta is BusinessMap scale,
the Mobility HTML and grouping regression tests. Backend code stays byte-for-
byte identical, including the existing operator-diversion warning.

`C:\Users\PC\AppData\Local\Temp\opencode\perix-small-markers-release` retains
the isolated source, staging/production exports and uploads, manifests,
runtime/served verification, and the original 267-file `rollback-context`.
`preflight.json` records its explicit production wrapper-root rollback command.
Source deltas and credential-free evidence are exported beside this document.
Do not apply the release patch over unrelated local WIP.

Staging size/motion evidence:
`perix-marker-size-mobile-2026-10-24T19-20-57-660Z/result.json`.
Overview evidence: `perix-small-markers-release/stage-overview/result.json`.
Production identity and final post-release results are appended after verification.

Intermediate production `2028275d-ba04-458a-b038-711020082c53` passed the actual
four-zoom measurements and 8/8 selection checks. A separate overview check
exposed an InfoWindow/parent Set Your Area control overlap. The final sheet
addresses that issue; the intermediate manifest/archive and failed evidence
are retained instead of counting that run as fully passed. An initial line
draw was also mistakenly counted by the first overview harness; the corrected
harness waits for static lines before measuring camera-only redraws. Neither
test-tool correction changes vehicle coordinates or backend behavior.

The next intermediate sheet deployment
`4a74b592-b157-40d8-a418-0f0d9dcc88ec` exposed a count hit-target overlap between
neighboring groups. Final overview counts are centered and their full hit boxes
are grouped, with a dedicated regression. The original safe rollback remains
`0adc9837-d717-4694-a10d-686b052ad4d3`; both intermediate archives/manifests and
failed browser evidence are retained. No intermediate attempt is labeled a
fully passing final release.

## Final live verification

- **Active `SUCCESS`: `92095c5c-033d-45b8-b358-3bd2fd4abcac`**, at
  <https://app.perix.eu>. Final staging is
  `739b99c1-18d3-4591-b888-388820dd8193`.
- Source/served manifest verified: **264/264 runtime file hashes matched**;
  **267 package files**, with only `Perix-main/backend/webdist.dat` changed
  relative to the frozen baseline. Backend code and configuration are identical.
- Actual served entry `entry-7cf9493e6aa97eadf4a09de78a5ea0dd.js`, SHA-256
  `bdaec258e9fef60a133200996c2b077dde519452dc714443cdda74b99a23c7d4`.
- Actual served map HTML SHA-256:
  `33c82c91bf617ca8f9ba86d4d04ac85c9b97d45847b546bed3e69f0deae6c32a`.
  No staged API origin in the production entry; paid Routes disabled.
- Final production four-zoom check ending `19:31:32Z`: correct CSS/device
  dimensions at all four requested zooms, **8/8 exact source-ID taps**, original
  marker instances, correct rotation and no sampled canonical drift or runtime
  exceptions. Real frontend, no HTML override or API mutation.
- Final production overview check ending `19:34:51Z`: 45 source entries, a
  **38-member non-coincident group**, exactly matching choice IDs, individually
  selected bus 46 and tram 10. Sheet content 184px, safe measured bounds below
  area controls and left of zoom/location controls; badge anchor error 0m.
  Zoom to 14 dissolved groups with **zero vehicle recreation / line redraw**;
  one map read, no API writes or runtime exceptions.
- The final overview probe taps the actual visible count button after camera
  idle, rather than an assumed center pixel while SDK camera rendering is still
  moving. Earlier failed center-pixel attempts are retained, not counted passed.
- A separate initial 4× CPU overview continuity attempt timed out waiting for
  map/vehicle readiness. Its cause was not established from that attempt and it
  is **not** claimed passed (`sh_16f6a5123001oyThMnu5SZcngn`). A diagnostic retry
  records startup state and is retained separately from the functional checks.

Production measurements:
`perix-marker-size-mobile-2026-10-24T19-30-43-108Z/result.json`.
Production count selection: `production-overview/result.json` and
`production-overview/selection-sheet.png` under the release evidence root.

The rollback remains the known pre-change production
`0adc9837-d717-4694-a10d-686b052ad4d3`, not an intermediate UI candidate. It is
hash-verified/frozen, with an explicit deployment command in `preflight.json`.
Shared WIP is preserved and no commit/push was made. These are UI/render checks,
not physical fleet completeness or native handset certification. No new detour/
update-monitoring infrastructure or route-13 geometry change is included.

The diagnostic overview continuity retry ending `19:45:43Z` passed without any
application changes: 90s, DPR 3 / **4× CPU**, zoom 11→12→11 with pan,
**12 API-marker membership samples**, 13 fleet HTTP requests and one map read;
zero missing markers/paths, projection shifts, incomplete deliveries, transport
aborts or runtime exceptions; zero line redraws after initialization. Evidence:
`perix-continuity-audit/browser-mobile-2026-10-24T19-43-37-975Z/summary.json`.
The earlier startup timeout remains recorded as failed/unknown-cause, not
retroactively certified as a network failure or counted as passed. No latency
SLA or physical fleet completeness guarantee is inferred from the retry.
