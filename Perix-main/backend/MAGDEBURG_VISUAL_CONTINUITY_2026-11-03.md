# Web visual continuity and direction follow-up — 2026-11-03

## Local destination-first UI, collapsed stops and original compass — 2026-11-05

New user request AFTER deployment: collapse nearby contents under a light-blue
down arrow; hide nearby heading when the loaded catalogue has no viewport stops;
remove Magdeburg/country selector from header, move origin selection to a popup
on the map; selected stop programme in the below-map slot with close/back; no
stop lists/times in category results or root footer; Locator-style result cards;
destination-oriented search and closable below-map Go/Los; original PERIX compass
instead of gold destination pin; pure white app/login background. User asked to
retry browser validation after initial failures. These NEW changes remain LOCAL;
retained production is still6d89548a (previous section), no new deployment yet.

- NearbyTransitSection now has optional collapsible/hideWhenEmpty/bounds and
  originEditorOnly modes. App and Home opt into collapse; known empty scoped
  boarding-platform catalogue hides the whole section. Loading/error is NOT
  interpreted as certified empty coverage. Closing unmounts departure readers.
- MapLocationPopup reuses that SAME existing origin editor/search/context, not
  another watcher or destination database. Map's location button opens it with
  live location/manual address choices; manual search updates explicit userOrigin
  and the shared map base. Blank-map taps still choose a destination, not GPS.
  MapScreenHeader removes the old area caption/selector on all shared headers.
  Old MapBaseSelector module remains intact (not deleted user work).
- App destination search uses existing searchPlaces but no longer filters the
  category directory query. Address or card selection exposes Go below the map;
  close clears destination/selection/overlay without resetting user location.
  Category/back/all navigation clears old stop/destination panels. Moving fleet
  still uses unchanged shared polling/geometry/motion; category pages don't mount
  nearby names/hours. Root result list excludes stops and moving fleet; explicit
  mobility categories may list only their matching vehicles, never stop rows.
- Selected stop programme replaces nearby section below map, preserves the
  original CityInlineDetails arrivals/countdown source and has explicit close.
  Map-platform click preserves platform_id. Physical PLACE card click shows its
  full programme, not only the nearest (potentially dormant) platform. An initial
  browser trial narrowed to dormant platform399723 and showed valid empty service;
  removed that unintended narrowing. Full-place retry showed8real departure rows.
- Locator's existing nearby list also collapses under blue arrow and hides while
  its selected-stop programme is open; explicit close restores collapsed list.
  Its map location button uses the same popup. No replacement of its planner.
- GatewayResultCard uses exported REAL locatorCardStyles, with no fabricated
  business status/distances/ETA fields. White photo fallback, actual public images,
  original category tokens and existing entity-detail handlers.
- New168x168 perix-compass.png is a mechanical crop (642,0,810,168) of ORIGINAL
  perix-wordmark.png, no redraw/recolour/generation. Web/native marker accepts
  selectionCompass, displays that artwork at38px and keeps its grouping separate
  from a coincident place pin; no coordinates/source marker identities changed.
- App/login navigation surface is scoped#fff; login page/scroll/container#fff.
  RootLayout obtains its OWN usePathname hook. Initial browser validation caught
  an accidental global-pathname reference (TS's DOM declarations did not catch
  it); fixed and added explicit regression. No global map-style recolouring.

Validation so far: **214/214 frontend tests passed**, TypeScript passed, web
export passed (2128modules,68assets including compass) into
`C:\Users\PC\AppData\Local\Temp\opencode\perix-destination-ui-export-20261105`.
Actual in-app browser on localhost:8092 verified popup/manual origin, collapsed
nearby ->2cards ->8real programme rows ->close/collapse; address selection Go below
map and decoded original compass. Initial icon-font cold load hit existing6000ms
fontfaceobserver timeout; retry loaded ionicons successfully. No font-framework
fix or universal cold-start guarantee is claimed from that retry.

Final actual-browser audit PASSED9Google-mode/mobile cases plus programme/category/
empty-region/close/login workflows. Evidence:
`C:\Users\PC\AppData\Local\Temp\opencode\perix-destination-ui-1793909478211\report.json`.
Eight REAL programme rows, sourceUnavailable=false/emptyProgramme=false; programme
below map and nearby hidden; close restores collapsed list. Address Go below map;
original compass decoded AND drawn38px (destination-compass-375.png), no heading
in empty Berlin viewport of PERIX's currently loaded catalogue. This does NOT say
Berlin has no real stops. All9Google responses200;320/375/430px no horizontal
overflow; mini-map shares main-map16px edges and300px height; close keeps main
map343x477.359375px at375px/1000px viewport. Login page/scroll computed#fff.
Final export passed into `perix-destination-ui-final-export-20261105` under approved
temp root (2128modules/68assets);214tests and TypeScript remain passed.

Audit limitations: warm dev assets after an ordinary reload, explicit foreground
Chrome target, browser EMULATION—not physical phone/native/private Home. Earlier
attempts are diagnostic: first passed workflows but captured compass before its
draw(width0); later attempts timed out waiting for origin/board readiness. Existing
GET retries can span3x15s plus backoff; final audit waits that existing window and
accepts only actual rows/explicit empty/unavailable UI states, NOT an invented
programme. APPLICATION timeouts were NOT widened. Final run had8rows, no source
outage. A separate public geocoder GET returned200 in10.672s (1street/8stops).
Neither this audit nor warm retry is a cold-start/latency/capacity fix or guarantee.
Map-platform programme still preserves platform_id, while physical-place card
now always queries full-place programme even if its metadata has a platform_id.

Tests
use unchanged real planner hooks with platform/network boundaries stubbed, and
the existing original default Home component behavior remains separately tested.
No backend runtime/source clocks, provider settings, DB maintenance, GPS engine,
frozen-v11 edits, commit/push or NEW deployment. Keep all existing mixed WIP.

## Authorized cumulative web deployment — 2026-11-05

Latest retained live follow-up: **6d89548a-ee6f-406c-811d-f22d51309e8e, SUCCESS**.
It fixes city-namespace registration on DIRECT Locator entry; only webdist changes
versus initial v12.206frontend tests/TypeScript/export passed;185/185actual runtime
files matched; unchanged production settings. New source SHA
`1ae30649aa7a64181b8c3f55fd2bfe930db64920541a5efe8895755f6c7e671b`.
Final public entry/hash/network/map/stops/source/board checks passed; three58READY
fleets took5.500/2.860/5.610s and retain30s/50s cycle policy. Initial v12's public
check had15.344s then90s timeout with parallel diagnostics; this remains recorded,
not silently fixed or waived as a performance guarantee. Its later serial full
retry passed66/66/68READY at5.421/3.234/6.640s. Cold-start/capacity still unproved.
Initial v12 AND final follow-up Google preview audits passed9real cases each.
Final direct-Locator header translation/no-overflow check passed (not full tiles/
fleet rendering proof); final manifest+4PWA icons match release hashes. Final
deployment/settings/source check confirms6d89548a SUCCESS/live. Evidence under
`perix-web-production-20261105-v12-label-final\live-google-preview-1793902382393`
in approved temp root. See `PERIX_WEB_RELEASE_2026-11-05.md` for precise evidence.

User approved deployment of completed work. New v12-final Railway deployment
`e4201cf4-d4ed-4a3f-98c7-1232cd93e341` reached SUCCESS;185/185 runtime files matched,
one Uvicorn process and matching initial environment. Zero production flags changed.
Final source795files SHA `820b30854d744581554f5dac3de212e71ad411f9ba94641a423e55196df7ab7c`.
It includes completed UI/nearby/countdown/queue/vehicle-details/PWA/white-Go-Google
preview work and approved30s station-cycle policy. Mixed physical backend WIP and
unactivated provider trials excluded; frozen v11 unchanged.205 frontend,297 offline
backend /1skip, TypeScript and production export passed.22 supervised Mongo/HTTP
tests reused only after all337backend file hashes matched final;113HTTP packets/
12cycles/3000stationary samples accepted by final frontend.0known production npm
advisories. Full details in `PERIX_WEB_RELEASE_2026-11-05.md`.
The initial browser/Google and repeated station-cycle public checks passed as
recorded above; runtime verification alone was NOT their evidence. No git commit,
push, native/OTA release, paid-provider activation or production DB maintenance.

## Google preview design correction: white, borderless, Go entry — 2026-11-05

User rejected the gold border/ivory preview background and requested buttons in
the APP/Members proportions/palette. Latest explicit clarification: WHITE
background. This supersedes the initial ivory/gold preview exterior below.

- GoogleDirectionsPreview now has explicit #fff background, no card border,
  no extra inset padding and no coloured container. Embedded Google imagery and
  attribution are still unchanged (not whitened/restyled inside its iframe).
- Added shared MAP_ACTION_COLORS to mapLayout.ts, referenced by BOTH unchanged-
  appearance MapScreenHeader and preview pills: active#59ABE3/white text,
  inactive#eaf5fc/#216BA2 text;44px touch targets and22px corner radius.
  No outlined transport buttons; external link now a pill, not full-width block.
- Initial control is localized "Πήγαινε" (Go) in all10 languages. Selecting a
  destination/pin/map point only offers this action; only pressing Go opens and
  requests the mini Google map. Close unmounts preview; route/origin logic unchanged.
-205/205 frontend tests and TypeScript passed. One new regression verifies Go-only
  collapsed state, explicit white/borderless exterior and shared pill colours.
- REAL Chrome audit320/375/430 x3 modes passed9 cases; zero Embed requests before
  Go; all9 previews loaded with real Google frames. Computed preview#fff/border0,
  transport button borders0/radius22 and active/inactive colours EXACTLY equal to
  rendered APP/Members. No horizontal overflow; main map unchanged after close.
  Mobile browser emulation only, not a physical phone or app-launch validation.
- Evidence: `C:\Users\PC\AppData\Local\Temp\opencode\perix-google-preview-1793899775405`
  report.json, go-375.png, walking/transit/driving-320/375/430.png. Earlier two
  audit attempts were diagnostic assertion failures: Ionicons contributes a font
  glyph to innerText. Final audit checks the visible Go label with that glyph
  allowed; application behavior was correct. Previous gold/ivory screenshots and
  original task.diff describe the previous preview revision, NOT current design.
- Modified only mapLayout.ts, MapScreenHeader.tsx, GoogleDirectionsPreview.tsx,
  googleDirections.json and its test. No source/GPS/planner/backend changes,
  credential actions, commit, push, deployment or production DB writes.

## Google Maps mini directions preview, not live navigation — 2026-11-05

Latest user decision supersedes the earlier driving GPS/Valhalla/OSRM/MapLibre
proposal. User explicitly chose a SMALL REAL GOOGLE ROUTE PREVIEW INSIDE THE SITE,
plus an external Google Maps directions link, and confirmed that their existing
Maps browser key allows Embed. No new API enablement, key changes or Cloud-console
actions were performed. Do not record the key value in this ledger or artifacts.

Implemented in existing CityGatewayScreen (/app and shared public root):
- GoogleDirectionsPreview beside searched destinations, selected static directory
  pins/stops in the existing detail drawer, and a destination selected from nearby
  Directions. Ordinary map-point clicks select exact destination coordinates.
  Moving bus/tram/taxi pins retain their existing detail behavior, not route targets.
- One reusable preview component; no new page, destination search, marker store,
  GPS watcher, route backend, dependency or database mutation. Existing PERIX
  transit planning/geometry remains separate and unchanged. Google independently
  calculates the mini-preview route; UI explicitly says it may differ from PERIX.
- Collapsed by default. User opens Google preview explicitly; only then are origin
  and destination sent to Google. Origin comes ONLY from existing userOrigin, not
  map base/camera/viewport. Missing origin prompts existing origin selection or
  the existing locate action; external link remains usable without guessed origin.
- Walking (default), Transit and Driving toggle Google Embed `mode`. Origin is a
  snapshot on open/refresh/first fix; subsequent live samples do NOT reload iframe.
  Closing removes the iframe, preserving the destination and main-map dimensions.
- Web iframe is300px tall/minimum200px wide, responsive, domain-only
  `strict-origin-when-cross-origin` referrer. Google content/attribution retained;
  outer controls use PERIX navy/blue/gold/ivory. Google embedded styling is NOT
  claimed to match PERIX. Native keeps external link, not a fake web preview.
- Missing key/network failure has a fallback. An iframe load/HTTP200 alone is not
  asserted as successful routing: cross-origin Google error pages cannot be
  inspected by normal frontend code. External link is always available.
- Ten languages installed in existing city namespace via googleDirections.json.
  Existing browser-key resolution matches BusinessMap. No literal key added.

Actual endpoints/fields:
`https://www.google.com/maps/embed/v1/directions` with key, origin, destination,
mode=walking|transit|driving, units=metric and existing language. Google draws the
route/distance/duration itself; PERIX receives NO geometry/maneuver/ETA JSON from
the iframe and cannot mirror its route on the main map or build live instructions.
External `https://www.google.com/maps/dir/` uses api=1, destination, travelmode and
snapshot origin when available. No key in external URL, no forced navigate from a
manual location. Google may recompute route/options when external directions open.

Verified REAL local /app + Google requests, no mock route or permission bypass:
- Actual public origin search Hasselbachplatz -> actual public address result
  Am Dom1 (destination title from existing search is"1"). Browser screenshots
  show Google resolving endpoints to Green barns/Hasselbachplatz -> Domplatz1B.
  The endpoint's road-access snap is Google behavior, not a PERIX invented marker.
- Walking screenshot:11min/800m (alternative12min/850m). Driving:3min/900m.
  Transit screenshot:6min/every7min plus walking alternative. These are transient
  GOOGLE PREVIEW values at capture time, NOT PERIX source forecasts or guarantees.
- Chrome CSS viewport audit320/375/430 x3 modes:9 cases passed, Google Embed
  HTTP200 for all9; cross-origin frame contents and loaded map images examined
  via Chrome diagnostics. No document horizontal overflow. At375 preview43..332
  (289px wide),300px tall; main map16..359 (343px wide),477.359375px tall at the
  audit's1000px viewport, EXACTLY unchanged after preview close. Destination kept.
- This is browser/mobile EMULATION, NOT a physical phone, native integration or
  verified handoff to an installed Google Maps app. External-link behavior tested
  at URL/component boundary; OS app launch remains a physical-device check.
-204/204 frontend tests and TypeScript passed.12new tests cover URL/coordinates,
  explicit origin, modes, no-key/failure/native fallback, no automatic reload,
  ten-language copy, existing search/map-point/static-pin integration and readers.
  Scoped tracked whitespace check passed. Existing transit backend not modified.
- Actual web export passed (2126modules) into owned temporary directory
  `C:\Users\PC\AppData\Local\Temp\opencode\perix-google-preview-export-20261105`.
  This is a local artifact, not a deployment. No new dependencies installed.

Evidence: `C:\Users\PC\AppData\Local\Temp\opencode\perix-google-preview-1793898859548`
with report.json and walking/transit/driving-320/375/430.png. Reproducible script:
`C:\Users\PC\AppData\Local\Temp\opencode\perix-google-preview-audit.cjs`.
Real in-app Review tab also tested all3 modes at localhost:8092/app. No key value
in reports; network evidence records only mode/status, not credential-bearing URLs.

New runtime files: frontend/lib/city/googleDirections.ts,
frontend/components/mobility/GoogleDirectionsPreview.tsx,
frontend/components/mobility/GoogleDirectionsFrame.web.tsx and .tsx,
frontend/i18n/googleDirections.json. Modified CityGatewayScreen.tsx and i18n/city.ts.
New google-directions-preview.test.cjs and updated gateway/localization tests.
Task-only diff (against pre-task local WIP, not frozen/repository baseline) is
`perix-google-preview-1793898859548\task.diff` in the evidence directory. Generated
by reversing only this task's known edits in memory; working files never reverted.
No commit, push, deployment, production DB action or frozen-v11 change.

## Correction: centered SAME-ROW navigation and real mobile-viewport audit — 2026-11-05

User correctly challenged the prior phone-boundary claim and the APP/Members row
below Perix. Assistant acknowledged that previous914/1000px browser measurements
and mathematical tests were NOT a physical/mobile-device check. Current request
means APP/Members centered on the SAME row as Perix, not merely identical second-
row x/y positions. This supersedes the earlier x16/x86,y66 layout specification.

- MapScreenHeader now uses equal bounded side columns around a fixed primary
  group, so APP/Members stay centered regardless of optional actions/Explore.
  Both buttons share the logo's vertical center. At<600px the logo is72px and
  buttons44/76px (4px gap); larger screens retain108px logo and64/104px buttons.
  Touch heights44px. Same original artwork, no redraw. Home/App brand renderers
  use the responsive slot instead of forcing a108px logo into a narrow column.
- On small screens the map-area caption has its own bounded line BELOW the
  brand/button row; it cannot push the logo off-screen. Text is single-line
  ellipsized. Explore remains accessible as a compact compass button at the
  right, not added to the primary group's width. White frame/gutters retained.
- Found concrete Home name-overflow cause: intrinsic identity-pill width plus
  settings/location controls exceeded small widths even with numberOfLines1.
  Added minWidth0/maxWidth100%/flexShrink constraints to IdentityDropdown and
  extracted HomeHeaderControls with independently bounded name/location columns.
  Callbacks, identity switching, settings and manual-origin behavior unchanged.
- No source clocks, motion curves, provider settings, GPS watchers, map-base or
  planner ownership changes. No authentication/credential bypass for validation.

Actual Chrome CDP audit (normal security/sandbox, NEW owned temporary profile):
CSS viewports320,375,430,1280;12 cases: real PUBLIC /app and /locator plus an
isolated Home-controls fixture with real components and synthetic1000-character
identity +240-character area label. This is mobile browser EMULATION, NOT a
physical phone/native build or authenticated full Home page. Fixture uses a plain
img adapter only to complete SSR logo loading with the original image/style;
public-page images/fonts and actual Google map readiness were awaited.

Final audit passed with loaded logos and no horizontal overflow:
-320: primary98..222,centerX160;375:125.5..249.5,centerX187.5;
 430:153..277,centerX215;1280:553..727,centerX640.
- Logo and buttons centerY34 (large-logo fractional33.992 allowed1px tolerance).
- /app maps AND two real nearby cards:16..304 /16..359 /16..414 /16..1264.
- /locator maps: matching16px mobile gutters; desktop left276 due preserved260px
  sidebar, right1264. There were no displayed public result cards in this sample;
  do NOT claim real Locator-card content coverage from that empty result set.
- document.scrollWidth equaled each viewport width. Synthetic Home identity
  stayed within its toolbar column; no name pushed logo/navigation out.

Evidence script/root:
`C:\Users\PC\AppData\Local\Temp\opencode\perix-mobile-header-audit`.
Final report/screenshots:
`run-1793893799078\report.json`, `app-320.png`, `app-375.png`,
`locator-320.png`, `home-controls-fixture-320.png` (and375px variants).
Earlier audit attempts were diagnostic: one captured before images loaded;
another failed readiness before the logo img existed. Final audit explicitly
waits for real decoded artwork and maps; those incomplete attempts are NOT proof.

Regression: **192/192 frontend tests passed**, TypeScript passed; scoped tracked
diff whitespace check passed. Three new regression cases beyond189 cover compact
side-column budget, same-row DOM structure and long-name containment. No backend
runtime/DB actions, provider contact, install, push/deployment or frozen-v11 change.
Still requires a physical phone and real signed-in Home check for that broader
claim. Do not describe these emulated CSS checks as having tested an actual phone.

## Vehicle identity/next-stop card, Home→Members label, installation logo — 2026-11-05

Follow-up user steering: every clicked vehicle should identify itself/next stop,
the stop corresponds to30s before its next departure, Members REPLACES Home
without changing its destination/function, and Install Perix needs the new logo.

- Shared TransitVehicleDetails receives existing current LiveVehicle +catalogue/
  dated map geometry. Gateway passes its polled fleet record for marker/list
  selections; no new fleet/detail GET. Locator shows the same information
  immediately, independently of its retained full-trip panel. Taxi info is read-
  only; unsupported taxi full-trip queries are skipped even from All mode.
- Identity separates PERIX marker ID, dated trip ID and registered vehicle ID
  when supplied. Virtual/estimated units are not presented as measured physical
  vehicles; GPS Live requires explicit LIVE position quality. Next-stop name
  uses the vehicle report or actual source IDs/catalogue/dated geometry, never
  nearest-coordinate inference. Missing data is explicitly reported unavailable.
- vehicleDetails reads the SAME station-cycle-v2 publication/authorization/
  sampling as the map, with exact pattern/version/day/geometry identity. Current
  parked stop and following stop are separate; at known departure0 the accepted
  packet advances to its next occurrence without another fleet read. Parking
  clock and departure clock are distinct source-scoped optical targets; no
  provider HH:mm arrival is silently reinterpreted as a departure. Only declared
 30s policy is shown as that policy. Longer dwell/limited windows and conditional
  source-update waits remain explicit; unknown departure is not timer-unlocked.
- Already admitted SAME vehicle/packet preview is retained through its final
  reserve, just like map sampling; a fresh late admission still fails below the
  existing reserve, and all sampling ends at valid_until. No cross-journey reuse,
  new curve, GPS publication or source/calibration/freshness gate widening.
  Older/unsupported packets show Reported next stop and unavailable optical
  parking/departure clocks instead of fabricated30s clocks.
- Header secondary Home item removed. Members is the old Home destination
  (/home for members, existing login guard for guests), not a duplicate Home or
  a new route. Shared primary APP/Members slots/layout remain unchanged; member
  header now APP/Members/Explore. Native/internal route names stay home.
- InstallBanner/help now use original PerixLogo (72px banner slot, compact help
  slot) without changing install/dismiss/prompt behavior. Found old PRX artwork
  in PWA icons too: replaced only4 requested install assets (192/512/maskable512/
  Apple-touch180) with proportionally resized original wordmark on white; no
  generative redraw. Maskable artwork is centered safely. Versioned manifest and
  Apple-touch URLs avoid stale PRX cache reuse. Original wordmark unchanged,
  native Expo launcher assets not silently changed. Actual OS install not run.
  Before/after icon hashes and backups:
  `C:\Users\PC\AppData\Local\Temp\opencode\perix-pwa-wordmark-20261105`.

Validation: **189/189 frontend passed**, TypeScript passed, scoped tracked diff
whitespace check passed.13 additional vehicle/branding cases beyond the176 layout
suite cover current vehicle props without refetch, identity/next stop, parking vs
departure, roll-at-zero, expired/pending/geometry/legacy rejection, admitted-window
continuation, conditional waits, physical/taxi fallback, terminal state, timezone,
Home-label replacement, install behavior and new PNG sizes/versioned URLs.
These positive phase tests are synthetic, NOT physical GPS/forecast agreement.

Actual dev browser selected Tram10→Sudenburg, identifying marker/trip and
Ambrosiusplatz as next stop from the existing public fleet response. The current
production-backed packet lacked the declared30s clocks; UI correctly reported
them unavailable. This is not a claim that local parked30 policy is deployed.
Development manifest/icon GET200, new versioned icon decoded192x192. No native
install/push, account/phone validation, deployment/push/DB operations or frozen-
v11 changes. Prior backend326/22-isolated results belong to the earlier local
parked30 task, not new backend changes here.

## Fixed primary slots / matching gutters / white page frame — 2026-11-05

Earlier part of this active request: user wanted APP/Members at identical points
on /app /home /locator, identical mobile map/card horizontal limits, unchanged
brand position, desktop /app bar matching member-page bounds, white behind cards.

- Shared mapLayout tokens: frame1280px, gutter16px, brand row56px, APP64px and
  Members104px slots, height44px. Grouped fixed primary slots remain first on
  every screen regardless of translations/active state/auth actions; secondary
  navigation cannot displace them. APP native screen now has the same top-safe-
  area handling as Home/Locator. Member label refinement is recorded above.
- Removed double map margins via optional horizontalInset with explicit0 on the
  three map callers. Home map and nearby wrapper use the same16px outside gutter;
  carousel viewport/card bounds match it. Locator map/search/skeleton/card bounds
  match too. Gateway search/map-border/card bounds now share its one content
  gutter; nearby wrapper no longer adds another10px horizontally.
- Desktop tab container keeps the same1280px frame without an extra24px inset.
  Header/body/chrome/background outside cards are explicitly white. Vertical
  indicator chrome hidden (scrolling retained) so a reserved scrollbar cannot
  create a different right edge. Default other map renderer insets preserved.
- **176/176** tests passed at that point; six dedicated layout cases remain in
  current189 suite. Actual web APP/Locator: APP x16/y66/64x44, Members x86/y66/
  104x44; original logo x16/y15.031/108x37.922. At914px viewport, Gateway map,
  search and both nearby cards all left16/right898/width882; computed background
  rgb255/255/255. Signed-in Home and physical phone/desktop-width matrix not
  browser-tested; shared component/style contracts were typechecked/stub-tested.
  Screenshot:
  `C:\Users\PC\AppData\Local\Temp\opencode-browser-yjFiWp\0\screenshot.jpeg`.
  No backend/source engine/clock/provider change in this layout step.

## Overview stop sizing / personal pin / shared header / selectable map base — 2026-11-05

User requested smaller overview stop pins with zoom-in detail, a personal profile
photo pin (blue thumbnail/white first-name initial fallback), removal of initial
Bus/Tram/Taxi controls, original Perix logo on Home/Locator, App-first consistent
navigation, and an editable Magdeburg/Germany caption that changes map base.

- Shared `mapPresentation.transitStopAppearance` gives4px dots belowzoom12,
  6px below14,8px below15, icons15+, route badges16+, names17+. Web/native use
  the same policy. All physical platform IDs, click targets and source metadata
  remain; no dense-view platform removal/clustering or new station catalogue.
  Cached web symbols rebuild only on detail buckets; native station keys include
  the bucket (vehicle keys/progress are untouched). Null overlay-projection
  guards avoid crashing a stop/user draw before Google projection is ready.
- Fresh user pin is34px profile photo on all three maps, using personal
  `user.profile_photo || user.picture`, not an active business logo. Missing or
  failed photos reveal a blue `#59ABE3` circle with white Unicode initial via
  textContent, never HTML. Map props include userPinName consistently. Locator
  no longer uses a vehicle/search locateFocus as a fake user pin; actual
  livePosition is the only pin source. Locate delegates to shared LocationContext.
- Removed the PUBLIC initial /app/root MobilityModeControls. Locator's Mobility
  controls and existing nested directory mode filters remain functional. No taxi
  mutations, bus/tram profiles, source clocks or motion ownership changed.
- `MapScreenHeader` uses original PerixLogo and one shared navigation row below
  the brand: public screen APP/Members (Members→login for guests, protected Home
  for members; disabled during auth bootstrap), Home/Locator App/Home/Explore.
  Home/Explore labels reuse existing translations. Desktop chrome uses the same
  header layout; create/message/profile actions retained for authenticated users.
  Guest desktop Locator receives the same header outside padded tab content, not
  member actions. Mobile Home identity/settings and user-location entry remain.
  Headers also remain available while Home/Locator data skeletons load.
- `MapBaseSelector` is clickable beside Perix. It reuses existing PUBLIC place
  search and selects an explicit area (city/address), independently of GPS/manual
  userOrigin. Shared MapBoundsContext persists validated mapBase +revision and
  focuses all three cameras there; no map remount, new feed, provider activation
  or GTFS network switch. Map base survives reload; pan does not rename the base.
  Async old storage cannot overwrite a newly selected base. Invalid base storage
  does not discard a valid saved viewport. Changing base marks explore area only,
  never a live fix or planner origin. Locator planning now uses explicit
  userOrigin, not its exploratory city/focus point.
- Home/Locator cameras rely on explicit focus/recenter rather than passive GPS
  area changes, so choosing a city is not immediately yanked back to the device.
  The picker warns that transit appears only where the existing source has data;
  selecting Berlin does NOT fabricate Berlin vehicle/station coverage.

Validation: **170/170 frontend tests passed**, TypeScript passed, scoped tracked
diff whitespace check passed.13 new cases (39 Gateway/location +6 marker tests)
cover overview/detail buckets, Unicode initial/photo failure, personal-photo
wiring, safe/common navigation and retained desktop actions, persistent/racing/
corrupt base storage, public picker isolation and camera change without new fleet
reads or replacing user origin. Earlier motion/countdown/compact-card tests pass.
No backend/runtime/database tests changed or run for this frontend-only task.

Actual foreground dev browser: /app APP/Members and no initial mode controls;
150 visible physical pins in8px overview bucket, then24px-detail bucket at close
zoom with two preserved Walther-Rathenau-Str. platform IDs95095/193148 and their
route/name labels. Public Berlin selection moved directory/map bounds to
lat52.50919/lng13.36912, persisted Berlin base52.5200066/13.404954 and survived
reload, while userOrigin stayednull and no GPS pin was manufactured. Guest
Locator displayed one original logo, one header and App/Home/Explore with the
same stored base. Test selection was returned to Magdeburg through the UI.

One background reload initialized Google API but left its canvas empty; focusing
and reloading in the foreground rendered it. No claim of resolving all hidden-
tab/map lifecycle races. Final foreground screenshot (before all source reads
finished) at:
`C:\Users\PC\AppData\Local\Temp\opencode-browser-2Nur6X\0\screenshot.jpeg`.
No real personal GPS/photo account or signed-in Home/device/browser-width matrix
was tested; those are not claimed from mocked/provider tests. No push/deployment,
production DB actions or frozen-v11 edits. Production remains previously recorded
v10; earlier release/source-trial/parked30 limitations remain intact.

## Compact two-stop cards / three departures / inline Directions — 2026-11-05

User narrowed the nearby section to the TWO nearest stops, Directions in the same
card, first THREE departures with a down-arrow for more, as compact as possible.
This supersedes the earlier five-stop list plus separate selected-stop board.

- Shared NearbyTransitSection now requests only the first2 ranked physical stops
  from the SAME existing user-origin/platform-distance helper. Each has its own
  compact NearbyStopCard: stop name/distance/nearest badge and Directions in one
  header, then its departure rows. Removed separate selection/list/duplicate
  large headings and full route-badge strings. Source notice appears once.
- CityInlineDetails has opt-in compactStopBoard / initialDepartureLimit3 props;
  default noncompact entity/stop details keep their old behavior. Compact rows
  retain actual route/direction/time/Arrival-or-Departure-or-Wait event/countdown;
  stale timing is still labeled. No source clock or zero-retirement change.
- Down chevron +remaining count expands existing accepted rows; up chevron
  collapses to3. No new GET/poll starts for this toggle. Each card expands
  independently. Ordinary same-stop refresh preserves expansion; changing stop/
  platform resets to3. Completed rows retire and following rows fill the3 slots.
- Directions instructions open INSIDE that stop card on BOTH screens. Gateway
  reuses its existing parent route/planner and map geometry, suppressing the
  duplicate large destination card above the map for nearby-origin selections.
  Main search results keep their existing destination card. Home's card uses
  the same useGatewayJourney/planJourney engine locally only on explicit click.
  No duplicate request for the externally planned Gateway route and no new GPS.
- Existing-origin UI is one short summary row with locate/edit icon controls;
  manual input opens with the pencil. Missing-origin prompt/manual entry remain
  available. Touch controls retain44px minimum despite compact spacing/fonts.

Validation: **157/157 frontend tests passed**, TypeScript passed; scoped tracked
diff whitespace check passed. Seven new cases (32 in Gateway/location suite)
cover two-card limit/edit availability, three/expanded/collapsed rows without
refetch, independent cards, refresh/platform reset, Home inline planning, Gateway
external-plan reuse and absence of duplicate upper-card UI. Prior source timing,
station/platform and GPS/manual-origin regressions also remain passing.

Clean actual `/app` dev browser: manual Hasselbachplatz address →2 cards,29m and
72m. First card3 live-read rows; second had no upcoming arrivals (not fabricated).
Chevron expanded3→20 accepted rows, then collapsed to3. Directions displayed
existing planner's1min walk within the same card with no duplicate upper card.
Measured DOM card heights202px /81px and section422px in that viewport; these
numbers are not a cross-device layout guarantee. Clean document console errors0.

An older hot-reloaded tab hit the pre-existing StopOverlay.draw null projection
map error; a fresh /app document worked. No map-engine edits or claim of fixing
that HMR race. Screenshot attempt failed because the desktop tab/window was not
visible; no new screenshot artifact is claimed. Home remains auth protected;
its shared behavior/type checks are not a signed-in browser or phone build test.
No backend runtime changes, provider activation, DB operations, push/deployment,
or frozen-v11 promotion. All prior source/release limitations remain.

## User-origin nearest stops below /app and /home maps — 2026-11-05

User requested nearby stops below both maps, the latest departure board for the
nearest stop, and an explicit location request/manual location entry. Findings:
Home's `MapSection` did not mount a stop board; Gateway's former collapsible list
ranked around the viewport center and sat ABOVE the map. Neither satisfied the
requested user-origin section. No backend/runtime/provider changes in this task.

- New shared `components/mobility/NearbyTransitSection.tsx` is below the map on
  both screens (Home respects its existing map-section visibility preference).
  The location prompt is available even before Home has initialized map bounds.
  It shows live/entered origin explicitly, location permission action, and a
  public existing `searchPlaces(null,...)` manual-address input. No silent camera
  or restored/profile-coordinate fallback; no permission prompt on public mount.
- `LocationContext.userOrigin` is the explicit in-memory manual user position,
  otherwise the actual live fix. `setManualLocation` remains explore-area-only;
  saved areas never become user origins. `setUserOrigin` validates coordinates,
  updates the explore area, and does NOT invent a GPS fix. An explicit successful
  live request clears manual selection; passive watch updates keep an entered
  origin selected. A late older GPS request cannot overwrite a newer manual
  origin. One existing provider watch, not a new GPS watcher per section.
- The existing Home location-search pill now marks its explicit selection as a
  user origin. Home/native recenter delegates to the same context request rather
  than a separate direct GPS read. Manual-origin map markers are distinct from
  the fresh live avatar pin; native Home does not enable its own user-dot layer
  without a shared fix. No stored area is relabeled live.
- `lib/city/nearbyTransit.ts` ranks up to5 real physical stops by haversine distance
  to their actual boarding platforms (`transitStopPins`), not their potentially
  remote parent centroid. Source IDs remain intact. Radius3km has an explicit
  empty-state message; a far-away address does NOT show Magdeburg as nearby.
  Directions target the nearest actual platform coordinate, not a guessed point.
- Closest stop is auto-selected; its existing `CityInlineDetails` countdown board
  appears first, followed by the nearby-stop list/distances/routes. Selecting
  another stop changes that same board. No separate arrivals/prediction engine:
  existing GET arrivals endpoint, serialized10s reads, exact stop selection,
  last-known/failure handling and zero-retirement rules are reused unchanged.
- Gateway supplies its already loaded full catalogue: no extra fleet/map/stops
  read from the section, no viewport filtering of nearby candidates. Home loads
  the same public stop catalogue only after an origin exists and does not reload
  for ordinary GPS movement. Errors are retryable, not false no-stops results.
- The old above-map viewport-centered list was removed; mode buttons and main
  destination search remain. Explicit manual user origins now also feed the
  existing planner. Changing an entered origin replans; ordinary live GPS ticks
  still do not repeatedly restart a route. GPS/entered labels remain distinct.
- Board title is Upcoming departures, NOT an historical archive of past trips.
  Each row keeps the payload's actual Arrival/Departure/Waiting event, including
  older v10 Arrival packets; no departure timestamp is synthesized/relabelled.
  Source notice and existing source freshness/optical policy limitations remain.

Validation: **150/150 frontend tests passed**, TypeScript passed; scoped tracked
diff whitespace check passed. Ten new cases (25 in the Gateway/location suite)
cover missing/explicit/restored origins, public manual search and stale responses,
GPS denial/late GPS vs manual selection, platform-vs-centroid distance, radius,
closest default/selection, supplied-catalogue reuse, Home lazy reads/no GPS-driven
catalogue reload, manual-origin routing and below-map integration in both screens.
These are deterministic stubbed handler/provider tests, not device GPS proof.

Actual Expo browser `/app` check: typed Hasselbachplatz via existing public search,
selected actual address `Hasselbachpl.,39104 Magdeburg-Altstadt,Germany`; nearest
Hasselbachplatz29m, following stops72m/404m/426m/465m, real existing arrivals GET
200 and an8-row countdown board displayed. No GPS was requested for this manual
test. Screenshot:
`C:\Users\PC\AppData\Local\Temp\opencode-browser-jZr3QZ\0\screenshot.jpeg`.
Home browser attempt correctly redirected an unsigned visitor to `/login`; no
auth bypass. Its wiring/shared behavior was typechecked/stub-tested, NOT a signed-
in Home browser or phone/native build validation. No always-live/source agreement
claim from this UI check. No deployment/push/DB operations or frozen-v11 changes;
previous326-backend/22-isolated evidence belongs to the parked30 policy task.

## Explicit correction: PARKED at 0:30, DEPART at 0:00 — 2026-11-05

User clarified that 0:30 is NOT the start of approach. The tram/bus must already
be parked at that point and remain stopped until the known departure target0.
This supersedes the earlier local station-cycle-v2 30s-approach/10s-dwell policy
and the assistant's description of it; that older behavior was not this request.

- Optical timing constants now set **stop lead30s / approach lead50s**, preserving
  a20s approach window before parking. Source arrival/departure fields are never
  overwritten. Longer explicit source dwell remains longer; a20s source dwell
  gets the additional optical lead without rewriting its source arrival.
- `apply_station_cycles` parks by source departure minus30s and keeps the existing
  known modeled departure target. Both bus/tram use this same optical contract.
  Existing conditional source-update waits remain conditional; no fabricated
  departure. Infeasible short adjacent windows remain explicitly cycle-limited
  rather than creating negative legs/teleports or changing provider times.
- Initial origin selection now includes the opt-in30s modeled origin dwell;
  default/legacy station-relative-v1 ownership and signatures remain unchanged.
- Raw optical runtime config/cache/template identity includes timing policy;
  shared-CAS namespace and visual revision also bind the30s policy. A historical
  ten-second shared anchor cannot silently lock out or masquerade as the30s plan.
  Same-policy source updates/cold reads still preserve accepted platform anchors.
- Frontend validates the packet's declared station_stop_lead_s; a ten-second dwell
  under a declared30s policy is refused. Old packets without the field retain the
  historical10s contract for compatibility, not a relabeling as the new behavior.
- Prepared45s previews were tested starting1s before parking: incoming remainder,
  full30s stationary phase, then outgoing gradual motion are already in one
  accepted packet. No new packet is required at each tick or exactly at departure
  while that preview remains authorized. Preview/freshness/clock gates unchanged.

Validation for this WORKING TREE (not frozen v11): **326 selected offline backend
passed /1 skip; 140 frontend passed; TypeScript passed;22 supervised disposable
Mongo/HTTP tests passed**. Real synthetic HTTP captures were fed through current
frontend authorization/sampling:113 packets authorized /12 station-cycle packets /
3000 stationary samples within the final30s /12 legacy endpoints verified.
Client clock bridge is simulated; this is NOT live GPS or hosted rendering proof.
The short legacy multiworker fixture was retained for v1; its opt-in cycle case
now uses feasible100s source spacing to exercise a full30s parked interval.

Isolated evidence:
`C:\Users\PC\AppData\Local\Temp\opencode\perix-mongo-isolated-20261102\parked-thirty-20261105-v1`.
Only the runner-owned loopback disposable Mongo was started/restarted/shut down;
no production DB access/write/restart/restore, source setting changes, push or
deployment. Frozen v11 source rechecked unchanged:
`de1cbbb2bace398e32b69cf13440cd057b232de2c4ae64f94ec367972936b301`.
Production remains previously recorded v10. This is local implementation and
validation, not a claim that the new30s policy is already live in production.

## Last-known countdown completion / tram symbol queues — 2026-11-05

User requested keeping PERIX's own planner, completing a one-minute countdown
at zero without waiting for another update, and avoiding overlapping trams while
several wait at the same stop. This is a FRONTEND presentation change only:
no backend motion/provider/source-clock changes or new traffic simulation.

- Found a display blocker: Locator and Gateway stop cards hid all arrival rows
  after 30 seconds; failed reads also hid their retained rows. Finite accepted
  arrival/departure targets now remain readable to `0:00` even through a failed
  refresh. After 30s/failure they are explicitly labeled last-known timing with
  no new update. This is historical-clock completion, NOT refreshed source truth.
- After five seconds at zero a completed row retires from the UI; following rows
  retain their own targets. `60/120/180` seconds becomes `0/60/120` after a minute,
  not three simultaneous zeroes. Equal source targets are NOT artificially
  changed to +/-one minute. Genuine new source targets may revise their clocks.
- Arrivals adapter stores the signed monotonic deadline from the already bounded
  server-clock bridge. Re-reading the same absolute passed target cannot reset
  its zero grace. Initial UI clock0 uses receipt time, avoiding an extra page-age
  addition. The once-per-departure-target refresh can fire at zero after a missed
  packet too; existing serialized poll floors still apply.
- Explicit `WAITING_FOR_SOURCE_UPDATE` has no invented departure deadline and
  remains distinct. No timer releases that conditional wait. Legacy rounded
  minute values without a finite accepted target do not gain unlimited freshness.
- `lib/city/stationQueue.ts` separates only ESTIMATED tram SYMBOLS that are
  simultaneously stopped at the same platform ID, within5m and same direction
  (<=30deg). Ordering uses their existing known departure targets, then arrival
  and deterministic ID ties. Opposite platforms/directions, GPS, buses and moving
  vehicles are not merged. Actual marker coordinates, canonical progress, source
  clocks, plan/estimate revisions and authorized preview equations stay intact.
- Separation is screen-space icon layout (largest icon size +8px), not claimed
  metre spacing on rails or vehicle collision avoidance. Web uses Google SVG
  anchor offsets; native uses a transparent canvas with a valid centered anchor.
  Decoration eases forward when the preceding symbol leaves its stopped phase;
  followers' arrival/departure targets do NOT accelerate to follow that layout.
  Camera heading rotates the decoration, not the geographic trajectory.
- Native has one bounded fleet decoration timer, separate from existing movement
  sampling, with cleanup; expired native previews now hide the symbol instead of
  leaving an apparently current frozen marker visible. No extrapolation beyond
  authorized preview coverage and no physical/source freshness gates widened.

Validation: **139/139 frontend tests passed**, TypeScript passed; changed tracked
files passed `git diff --check`. Tests cover 60s-separated targets, actual stop
card failed-refresh behavior through zero, repeated passed-target reads, UI clock
initialization, unknown waits, 2/3-tram spacing/order, direction/platform/GPS
exclusion, equal-clock non-retiming, icon-only offsets and native timer cleanup.
Browser dev smoke reload of the shared Gateway/root showed no inspected console
errors; this was NOT a captured real three-tram queue or physical spacing test.
Native was typechecked/stub-tested, NOT phone-built/device/GPS validated.

No backend runtime edits, source activation, planner replacement, deployment,
push, DB write/restart/restore or frozen-v11 promotion in this task. Production
remains the previously recorded v10. New queue metadata requires the existing
local station-cycle-v2 payload; unsupported older payloads are not guessed into
station queues. All prior source/release limitations remain in force.

## Search selection → directions from live origin — 2026-11-05

Follow-up user request: selecting a search result (stop/place/address) on `/app`
must show how to get there from the actual current position, not merely center
the map or show an approximate distance from its viewport center.

- `hooks/city/useGatewayJourney.ts` calls existing `planJourney(null,...)` /
  `/mobility/v2/plan`, the same planner as Locator. No backend routing/prediction
  engine, provider, fleet poller or source clock changed. Only real livePosition
  is an origin; saved/manual areas and camera bounds are never fallback origins.
- Selection snapshots the live coordinates. A missing fix renders the explicit
  location action, then starts the pending destination plan when location becomes
  available. GPS ticks/pans do not continuously refetch a displayed itinerary;
  explicit refresh/reselection uses the latest fix. Losing location hides the old
  route. Request-key/cleanup guards suppress stale responses/errors after a new
  selection, clear or unmount. Empty/error results show no invented itinerary.
- `JourneyDirectionsCard.tsx` shows the returned departure/arrival, total/walking
  minutes, numbered walk/transfer/ride steps with line/direction/board/alight
  times and stops. Response notes are retained; existing translation keys reused,
  new no-route/origin labels added in EN/DE/EL with existing fallback behavior.
- Removed the old viewport-distance/nearest-stop-lines heuristic from the
  destination card. The planner's first returned itinerary supplies both steps
  and map geometry via `lib/city/journeyDirections.ts`. The helper only formats
  returned points; it never creates a route/ETA. Native map also accepts/renders
  the existing planLines prop; no device-build claim.
- Nearby-stop list selection now chooses a journey destination too. Actual map
  platform clicks still open existing exact-platform arrival details; their
  endpoint/filter/countdown system remains unchanged.

Validation: TypeScript passed; **126/126 frontend tests passed**, 5 additional
journey tests (13 total in gateway-mobility-location suite). Actual screen/hook
handlers verify live-vs-camera coordinates, place/stop selection, retry using
latest origin, missing fix, geometry, stale-result suppression, clear, empty/error
and step text. Planner responses in these deterministic tests are fixtures, NOT
real-network route correctness or physical GPS/navigation proof.
Browser at `http://localhost:8092/app`: real Hasselbachplatz search result selected,
destination card shows step-by-step heading plus enable-location action without
fabricating a route when no fix exists. No inspected console errors. Actual GPS
was not requested for this browser check, so a live-origin full route was not
verified there. No deployment/push/DB operations; frozen v11 remains untouched.

## Existing /app mobility and shared live pin — 2026-11-05

User selected existing `/app`, not a new `/apps`. `app/app.tsx` still re-exports
`CityGatewayScreen`; any route already sharing that screen inherits its UI.
Home and Locator retained; no backend runtime/provider/engine changes in this task.

- Extracted `components/mobility/MobilityModeControls.tsx`, reused by Locator
  and Gateway (All/Bus/Tram/Taxi). Gateway filters its existing fleet, map geometry,
  physical platforms and list without a second fleet/map reader. Existing
  serialized polling, authoritative marker metadata and source notices remain.
- Collapsible nearby-stop search uses the already loaded physical catalogue,
  searches names across the whole catalogue and orders results around the map
  center. It does not create another stop database/API. Map platforms are resolved
  with existing `transitStopPins` BEFORE mode/viewport filtering, preserving actual
  platform positions and IDs. A place-list selection opens place arrivals; a map
  platform click still passes exact `platform_id` to existing `CityInlineDetails`.
- Gateway uses the singleton `LocationContext.livePosition` and explicit
  `useLiveLocation(15000)` gesture, shared avatar pin, loading/error handling and
  guarded repeated clicks. No GPS watcher in the screen. Public opt-in enables the
  provider's existing ONE watch only after a reliable explicit fix; no automatic
  logged-out startup permission request. Saved areas are never live fixes.
- Destination is now a separate normal map marker, not the user avatar pin.
  Search/stop/locate share explicit focus tokens: latest action controls the camera;
  watch updates move the live pin without repeatedly recentering exploration.
- Native map now accepts the shared pin/avatar props and renders that pin without
  a second native blue-dot location layer. Expanded platforms use platform keys.
  Native changes are typechecked, NOT phone/device GPS-tested.
- Taxi button is a read-only fleet filter here; no authenticated taxi booking or
  other mutation workflow was silently copied into public Gateway.

Validation: `npm run typecheck` passed; `node --test tests/*.test.cjs` **121/121
passed**, including 8 new tests in `gateway-mobility-location.test.cjs` (actual
screen/provider handlers in a deterministic stubbed hook host, not real GPS).
Tests cover modes/platform filtering/no extra reads, exact-platform selection,
destination/live-pin coexistence, explicit focus vs watch updates, denial and
inaccurate fixes, category/button interaction and single-watch/listener cleanup.

Actual Expo dev-browser check at `http://localhost:8092/app`: controls/map render,
Bus + Hasselbach name search returns real loaded stop/routes, selection opens the
existing arrivals card, Taxi removes physical pins and transit lines, All restores
them; no browser console errors in inspected document. Screenshot retained at
`C:\Users\PC\AppData\Local\Temp\opencode-browser-BmWixU\0\screenshot.jpeg`.
This is a dev/web functional check, NOT physical GPS movement/phone validation,
release export, full performance benchmark or production runtime verification.

No push/deployment or production DB actions. Frozen v11 was NOT updated/promoted;
production remains the previously recorded v10. Mixed uncommitted backend WIP
and all source trial constraints below remain intact.

## User-approved raw SIRI / INSA trial — 2026-11-05

New read-only `tools/siri_trial.py`, `tests/test_siri_trial.py`; no runtime/worker
wiring, positions, source-clock changes or new prediction/geometry engine.
**Correction to initial research:** raw DataFrameRef04 is preserved as
`source_frame_ref`, NOT assumed GTFS service_date04. Complete stop/absolute
AimedTime vectors prove some source journeys belong to GTFS05. Current and
retained dates tested separately, never modulo-wrap clocks or infer from now.
True GTFS24+ cases and cross-date duplicate identity rejection are unit tested.

Initial snapshot42 MVB records →14 unique minute signatures /3 timely candidates.
Final paired snapshot29 →10 unique minute candidates /2 timely reference
candidates /0 marker-trial acceptance. `LEGACY_MINUTES` is NOT certified original
seconds or production matching. Platform overlap candidates are kept as sets
until complete dated timetable/route uniqueness; no nearest-platform/time pick.
No VisitNumber100→GTFSsequence coercion. Source cancellation/inaccurate/extra/
monitoring, document/trip clocks180s, future120s, readiness and activation gates
remain; generic HTTP/receipt time never becomes source publication.

Official INSA 3 consecutive N6 boards (Rennetal, Albert-Vater-Str., Harsdorfer Str.)
captured01:01:38.883–39.173Z; paired source comparison at01:01:40.866Z. All120 raw
rows normalized, no scheduled-time fallback for missing realtime. Four forecast
value groups from two provisional GTFS journeys: -77s, -77s, -77s, +101s relative
to INSA. Each INSA event has2 IDs with same advertised direction/time but different
full journey endpoints/indices. They remain ID-ambiguous; compare ONLY unanimous
time consensus (`TIME_CONSENSUS_REFERENCE_ID_AMBIGUOUS`), never choose a journey
ID. **4 time-value comparisons /0 within60s /0 unique INSA-ID matches**. Threshold
60s is diagnostic, not clock/calibration tolerance widening. Unusual much-early
forecasts appear in both sources; no automatic hour/fixed77s adjustment.

One intermediate source snapshot expired180s and was correctly rejected. Initial
browser-only reference filter escaping error yielded an invalid empty export;
it was discarded, NOT blamed on INSA. Final raw capture + tested Python offsets/
date/24h normalizer reads all120. Evaluation is at actual paired capture instant,
not a current-live freshness claim when later viewing the report.

Final **322 selected offline backend passed /1 skip**, 19 new SIRI cases; synthetic
positives are not live agreement. Python compile/frozen-v11 hashes unchanged.
No source adapter activation, markers, provider flags, frontend edits, push,
deployment, Mongo writes/restarts/restores or provider contact/registration.
Detailed repo doc: `backend/MAGDEBURG_SIRI_TRIAL_2026-11-05.md`.
Evidence: `C:\Users\PC\AppData\Local\Temp\opencode\perix-siri-trial-20261105-v1`.
Do not call the feed always unusable OR ready/INSA-equivalent: this is partial
identity progress and a small negative timing sample, not whole-network proof.

## GovData VVO link yielded a better raw SIRI lead — 2026-11-05

User supplied GovData API Fahrplanauskunft VVO. RDF explicitly declares public
access / DL-DE Namensnennung 2.0 for that API distribution; do not conflate with
VRR API contract or SIRI mirror CC-BY-SA. Official attached ODT/ZIP could not be
read locally due TLS chain validation; verification NOT disabled. One public
TRIAS query for Hasselbachplatz returned timetable MVB rows/Status=true, not a
realtime/matching certificate. No plaintext private credentials or integration.

Following an actually linked community SIRI mirror directory discovered raw
Sachsen-Anhalt SIRI ET:
`https://stc.traines.eu/mirror/german-delfi-siri/sachsen-anhalt/latest-sachsen-anhalt.siri.xml`.
Licence notice declares CC-BY-SA and DELFI/Mobilithek provenance, separate from
VVO API licence; exact terms/version still need review for production.

Actual <=8-MiB HTTPS capture at **00:20:10Z / 01:20:10 CET**: 4,757,177 bytes,
SHA99b249dcefe63ad670e43c10c7bc78eddc13e40f15a4f77ee9073b0f5fa5f7c0;
SIRI ResponseTimestamp00:19:16.539Z (53.556 s old), producer rcsued-siri-nasa.
621 regional journey records, 42 explicit MVB records (NOT 42 certified active
vehicles), all source DataFrameRef2026-11-04. Complete-sequence flag42, monitored34,
723 calls with aimed/expected departure. Nine journey source clocks within existing
freshness bounds, 33 outside; **nine is NOT an accepted trip-match count**. Fresh
document/HTTP metadata cannot refresh old per-journey clocks.

Actual example N4/Hasselbachplatz::09 aimed00:18:00Z expected00:20:49Z (+169s),
journey RecordedAt00:18:53.244Z. No PERIX update/INSA comparison performed yet.
This source has materially better raw clock/date/event fields than InfraNode.
Next trial must use retained source date04 after midnight, reconstruct true
Recorded/EstimatedCalls order, and not equate VisitNumber100 with GTFS sequence.
Mirror cadence (~5min) may fall outside the existing 180s gate between refreshes;
no threshold widening or always-live promise. No parser/integration silently added.

Detailed evidence: `C:\Users\PC\AppData\Local\Temp\opencode\perix-vvo-api-review-20261105`.
Recommend a separate read-only SIRI matching trial before activation; current
InfraNode 0/5 result is not relabeled. No production/settings/data/deployment change.

## OpenData ÖPNV API link revisited — 2026-11-05

After InfraNode trial user re-supplied official API URL. Re-read current API page/
agreement and ran ONE small VRR OpenService realtime query for exact Hasselbachplatz
(Tram/Bus), useRealtime=1, limit5. ServerTime 2026-11-05T01:07:19 (timezone not
declared in that field) returns five MVB night-bus rows with planned/base timetable
UTC events and provider tripCode/line/platform/destination, but no separate
realtime target. Timetable matching data is useful; actual realtime coverage is
still not certified. Server query time is NOT substituted for source-feed clock.
Production-access/individual-live-query restrictions still apply; no account,
registration, integration or production changes. Evidence appended to the prior
temporary `vrr-openservice-review.md`; no extension of the InfraNode trial claimed.

## User-approved InfraNode dry-run adapter — 2026-11-05

Implemented local-only `tools/infranode_trial.py` and bounded public capture
`tools/capture_infranode_trial.py`, with `tests/test_infranode_trial.py`.
`accepted_for_comparison` means diagnostic eligibility, NOT marker publication
or production ingestion. Reuses existing identity/freshness helpers; no new
prediction/path engine, no station database or runtime endpoint/worker wiring.
Reviewed bindings are operator-controlled JSON test inputs scoped to exact
region/network/version/date. Direct ID shortcut requires same verified GTFS
archive; foreign matching requires reviewed crosswalk OR complete unique dated
stop signature/exact second-preserved start. No nearest-time/line-only joining.

Source observation, explicit feed generation and available per-trip clock remain
separate. Generic `as_of` is never relabeled as feed_timestamp, HTTP retrieval
or an arrival epoch never becomes source time. Trip/stop operational semantics
must be known; cancellation/deletion/SKIPPED/NO_DATA clear trial timing values,
empty/error responses cannot cancel trips. INSA comparator requires exact same
region/network/version/date/trip/platform/occurrence and reference age <=30 s;
explicit arrival/departure delays/epochs compared separately, no new prediction.

Actual read-only snapshot: active **net_7685302f3394 / 2026-11-05**, 32 routes /
2,813 trips, four prior reviewed platform mappings rechecked by coordinates/name,
zero source trip crosswalks. Two finite platform API reads at **04 Nov 23:33:38Z
= 05 Nov 00:33:38 CET**, both HTTP 200. **5 rows (4 distinct source trips),
0 eligible / 5 rejected / 0 actual INSA comparisons**. All lack source/feed clocks,
explicit source service date/identity and operational status; four lack sequence.
The fifth (N2/A/sequence4) has eight DAILY GTFS candidates, not eight active
vehicles. Nighttime labels/receipt time cannot prove a source service date.
Platform-C parent-fallback rows lack exact stop evidence; do not call them verified
platform updates merely because the response echoes the query ID.

Final selected working-tree regression **303 passed / 1 skip**, including 56 new
trial cases. Initial test-harness overly broad socket guard blocked Windows
asyncio socketpair; final guard allows internal loopback while blocking external
and configured database port-1 access. No source-gate relaxation. Python compile
passed and frozen v11 766-file source hash remains de1cbbb2bace398e32b69cf13440cd057b232de2c4ae64f94ec367972936b301.
Positive complete data/INSA references are SYNTHETIC TESTS ONLY; missing fields
were never inserted into real captures or production.

Evidence: `C:\Users\PC\AppData\Local\Temp\opencode\perix-infranode-trial-20261105-v1`.
Detailed repo document: `backend/MAGDEBURG_INFRANODE_TRIAL_2026-11-05.md`.
No provider changes, integration, Mongo writes/restarts, registration/contact,
frontend edits, push or deployment. Source trial remains blocked on actual
identity/freshness/operational data, not on lack of a matching test mechanism.

## InfraNode matching feasibility — existing GTFS, 2026-11-04

User asked whether delays could be matched. Read-only activated-GTFS index check
at 22:41:59Z, net_499c8533a74b / 2026-11-04: known line/platform/occurrence fields
alone yield 56 daily candidates for line5/C/11, 4 for line4/C/16, 92 for
line9/A/19 and 92 for line2/C/12. These are DAILY scheduled candidates, not
simultaneously running vehicles. No source-ID crosswalk or accepted update was
created. Current wall time is not a substitute for missing source date/timestamp/
scheduled event time. Need a verified original-trip crosswalk or complete dated
trip/start/stop identity, then existing freshness/source-order acceptance gates.
Evidence: timestamped matching-ambiguity JSON in the existing InfraNode temp root.
No production/runtime/provider-setting changes; no nearest-time or line-only
delay assignment to PERIX markers.

## InfraNode `/live` inventory — late-evening research, 2026-11-04

User asked what can be taken from InfraNode's general realtime family. Actual
Magdeburg checks: parking returns 10 facilities with counts/status/trend, but
individual clocks vary (one Oct 15) and no names/coordinates appear in this
sample. City parking variant explicitly returned cache_status=STALE. Roadworks
disabled; incidents no_data. Traffic-flow returned city_slug=magdeburg but source
koeln_traffic_flow / Stadt Köln attribution and only station IDs, no measurements:
reject geographically mismatched data, do not feed it into bus/tram motion.

Related city charging-status endpoint (outside /live) returns 24 known points and
2 reported points, both same coordinates, statuses observed at 11:26:16Z (roughly
11 hours before late-evening query). Not proof of current charger availability.
Use per-record freshness, source geography and identity, not receipt/ok flags.
Own vehicle markers remain blocked by previously documented transit identity/
clock gaps. No integrations or production mutations. Details appended to the
existing temporary InfraNode report; no new prediction/path/station database.

## Correction: not permanently frozen — latest source became empty, 2026-11-04

User challenged any implication that the stream never works and noted prior ETA
visibility. Prior stale measurements establish only those observation windows,
NOT perpetual outage or historic schedule-only service. Stored GTFS_RT rows are
evidence of earlier ingestion, not a complete uptime/history certificate. ETA
visibility alone does not distinguish schedule fallback from realtime updates.

New bounded source checks at **19:40:04Z / 19:40:34Z (20:40 CET)**:
source header has ADVANCED from 14:42:25Z to **19:36:30Z**, so it is no longer the
same frozen snapshot. However Content-Range `bytes 0-14/15` confirms a complete
15-byte FeedMessage, parsed with **0 entities**. At the second check header age
244 s; no TripUpdates/ServiceAlerts are present. This does NOT certify recovery
of usable live data, and no absent entity was treated as a cancellation.

Do not continue describing the endpoint as permanently stuck or as still serving
the old 31 MB snapshot. Latest status: advancing source epoch, empty payload in
this sample. Evidence: timestamped source-header-recheck and source-body-bound-check
JSONs in `perix-realtime-diagnosis-20261104`. No production changes.

## Deferred source reference requested by user — 2026-11-04

User explicitly asked to keep `https://v5.db.api.bahn.guru/` for later review.
Recorded as **DEFERRED / UNVERIFIED**, not an accepted source: no availability,
MVB coverage, source freshness, access/reuse terms or GTFS-trip crosswalk check
has been performed for this URL. Do not fetch/integrate it merely because it was
bookmarked. No production/source-setting change authorized by this bookmark.

User also cited standardized GTFS-RT/SIRI streams and the gtfs.de public endpoint.
`https://realtime.gtfs.de/realtime-free.pb` is ALREADY the configured production
source. Its documented 10-second publication cadence is not proof of actual
freshness or complete MVB coverage; prior measured stale snapshots still stand.
Reusing that same URL is not an independent fallback. GTFS-RT/SIRI describe
formats, not independently verified providers or automatic access permissions.

## Explicit scope correction: PERIX-owned markers — 2026-11-04

User clarified that the requirement is to feed PERIX's own markers. An official
INSA widget is therefore NOT a solution to the active task, even if embedding is
offered without contact. Keep existing geometry, bus/tram profiles and optical
sampler; only accept verified external source updates through existing journey/
stop identity and source-clock gates. No widget integration is authorized here.

A single bounded public-source recheck at 18:59:10Z (Range 0–65535, HTTP 206,
64 KiB inspected, no full download) still returned GTFS-RT header 1793803345 /
14:42:25Z, now 15,405 s old. Do not mark the source recovered. Evidence is the
timestamped source-header-recheck JSON in `perix-realtime-diagnosis-20261104`.
No production/config/runtime changes.

## InfraNode deeper check — user approved, 2026-11-04

New platform-C response 18:47:09Z has five records; some values/trip membership
changed since 18:43. This establishes changing responses, NOT source-clock age.
as_of/observed_at remain null. Two IDs present in the new response were queried
for details (3467209682, 3467234366): both timed out at 60 s. Four total targeted
detail timeouts across the two rounds; no heavy retry loop.

Audited public InfraNode source at immutable commit
66794e6c1fe6960bd76fac7edd97f9fe88282aae (NOT verified as its deployed build).
Parser stores trip-or-feed fallback timestamp but omits dated trip descriptor
start_date/start_time and trip relationship. Departures handler then drops even
that timestamp when constructing its response; this explains missing clocks in
the published implementation. Trip route forwards timestamp/stops, but resolves
static stop_times synchronously before responding; a full stop_times scan is a
plausible timeout contributor, not proved remote runtime causality.

Read-only source snapshots/hashes and AST contract checks are saved under
`perix-infranode-review-20261104/source-audit` in approved temp evidence. No vendor
code execution/install or PERIX runtime change. Direct integration remains
blocked by incomplete verified identity/freshness/cancellation semantics; do not
join trip IDs by line+sequence, promote receipt to source time, borrow the vendor
position engine, or change the frozen v11 candidate to mask these gaps.

## InfraNode alternative — actual MVB data, not yet accepted, 2026-11-04

User proposed infranode.dev. Detailed docs distinguish DB Timetables
`cities/{slug}/station-departures` (actual Magdeburg response: train records,
source db_timetables, CC BY 4.0) from stop-level GTFS-RT
`live/{city}/transit/departures?stop_id=...` (tested MVB source gtfs_rt,
CC BY-SA 4.0, DELFI attribution). Do not conflate railway coverage with MVB.

Actual public parent-stop query de:15003:7330 at 18:43:06Z returns 11 delay records;
platform ::03 (C) returns 4. Names/coordinates verified via its static stop search.
No registration/key/contact needed for these calls. Published REST limits:
300/minute burst, 6,000/hour per IP. Response reports 45-second refresh cadence.

Acceptance remains unproved: `as_of=null`, `observed_at=null`, absolute departure
time unavailable (0/null), no dated scheduled time/headsign in the rows; source
trip IDs (e.g. 3467257745) differ from today's PERIX GTFS. Two line-5 trips have
the same stop_sequence=11 but different delays; line+sequence is NOT a safe join.
Two targeted trip-detail probes timed out at 30 s; no claim of invalid trips or
general outage. Retrieval time/ok status must not replace source-generation time.

Candidate source is promising but NOT integrated or certified fresh/INSA-equivalent.
No production/config/runtime changes, SDK installation or parallel engine/path.
Detailed evidence: `perix-infranode-review-20261104/report.md` in approved temp root.

## VRR OpenService proposal — research only, 2026-11-04

User supplied official OpenData ÖPNV API text. Verified API page and its linked
Nutzungsvereinbarung: unauthenticated development/test service is offered, but
public production access requires registration/contact. §3.1 permits individual
end-user live queries and prohibits systematic/series extraction; do not use it
as unrestricted continuous fleet-wide polling. The MIP CC-BY 4.0 statement covers
the separate mobility/infrastructure datasets, not a blanket EFA realtime licence.

Three public test reads: generic Hasselbachplatz resolved the railway station
(-4050 no serving lines); explicit Hasselbachplatz (Tram/Bus) resolved correct
de:15003:7330 and returned actual MVB timetable entries. Explicit realtime query
at 19:38:17 CET returned five planned-only events, no separate realtime targets.
Therefore Magdeburg timetable coverage exists, but MVB realtime/INSA equivalence
is NOT verified. No integration/registration/contact/production change.
Detailed evidence: sibling `perix-insa-hafas-review-20261104/vrr-openservice-review.md`
in the approved temporary evidence root.

## INSA / HAFAS terms and self-service widget — 2026-11-04

User requested public-terms investigation without contacting providers, and shared
official `hafas-widget-core.1.0.0.js` / `tp=true` embedding code. That snippet is
journey planning, NOT an INSA realtime feed for PERIX's own clocks/markers.

Verified a narrower, provider-offered no-contact route: official widget generator,
Abfahrten only (disable Fahrplan) → Einbindung → Monitor → Hasselbachplatz.
Provider generates `sq=true` / `sq-displaymode=results`. Its actual preview iframe
showed departure rows and realtime +/- minute labels. This is INSA's own display,
not an authorization to ingest/republish its underlying data into our engine.
No account/key/contact was requested during the self-service generator flow.

The hafas-client README explicitly states permission is necessary for HAFAS mobile
endpoints; ISC client-code licensing is not data/API permission. No provider
published production-polling quota/cache policy/republication licence for our
intended direct HAFAS use was found in the pages examined. General INSA Impressum
restricts copying/reuse outside copyright exceptions and describes private,
non-commercial downloads; do not overstate this as a legal ruling on every fact.
Official widget embedding is specifically offered, but privacy/CSP/third-party
loading and preserved attribution still need integration review.

Evidence, source links and exact generated monitor fragment:
`C:\Users\PC\AppData\Local\Temp\opencode\perix-insa-hafas-review-20261104`.
No integration/dependency installation, production changes, provider contact,
registration or deployment. This does not resolve the prior GTFS-RT outage or
certify INSA equivalence of PERIX's own animations.

## Realtime cause investigation — read-only production, 2026-11-04

User authorized investigating the INSA-time mismatch. Identity-guarded read-only
probe against serving v10 at 18:16 UTC: configured source remains GTFS_RT
`realtime.gtfs.de/realtime-free.pb`, active net_499c8533a74b / 2026-11-04. Source
returns HTTP 200 but header epoch **1793803345 (14:42:25 UTC)**, age **12,820 s**.
Explicit no-cache/Pragma repeat returned the same source epoch, Last-Modified
14:42:47 UTC and SHA
`9a9aa623113f047021c07ab1c5ef2e31bcaf5d3e6c3d586eeda3c350ef691eb7`.
Ordinary cache bypass does not recover a fresh snapshot; exact upstream failed
component is not established.

116,733 nationwide TripUpdates; 445 exact active trip IDs all pass deployed strict
identity matching. Seven discrepant comparison trip IDs are absent from this
snapshot and the two scoped stored collections. Today's dated collection has
1,998 records, latest sampled receipt 15:43:01 CET with same old source epoch;
legacy scoped collection empty. 685 active service stop IDs are NOT the full
physical platform catalogue. Workers configured enabled is not liveness proof;
bounded filtered logs returned no lines. Do not claim a matching-algorithm bug
or coverage completion from the national unmatched count.

**Blocked externally / not fixed:** the 180-second source freshness gate correctly
prevents treating this old feed as live. 31 isolated identity/freshness/sparse
timing/ingestion tests pass. No code/runtime/provider-setting/database mutation,
no gate widening and no deployment. Frozen v11 remains unchanged; its optical
clock cannot manufacture missing realtime forecasts.

Evidence and unsent provider inquiry:
`C:\Users\PC\AppData\Local\Temp\opencode\perix-realtime-diagnosis-20261104`.
Next: restore an advancing authorized source or obtain an authorized alternative,
verify target-trip coverage/identity/freshness, then repeat INSA/PERIX comparisons.
No website HAFAS scraping connector, message sending, registration or purchase
was authorized/performed by this investigation.

## User correction: actual INSA station times — live check 2026-11-04

The optical benchmark below did NOT verify INSA time equivalence. User clarified
that the requested confirmation is station arrival/departure times, not map motion.

Actual public INSA StationBoard / live PERIX v10 comparison at Hasselbachplatz:
INSA normal UI response 18:10:07.800Z; PERIX public arrivals receipt 18:10:12.676Z
(4.876 s apart). Twenty departures uniquely matched by date/line/platform/scheduled
minute/occurrence sequence, with checked direction aliases. All 20 scheduled times
agree; **7/20 realtime departure targets differ**, PERIX source SCHEDULE for all 20.
Examples (CET): 10→Sudenburg C, schedule/PERIX 19:15 vs INSA realtime 19:20;
9→Reform A 19:11 vs 19:12; 4→Westerhüsen C 19:19 vs 19:17;
5→Messegelände D 19:19 vs 19:18. These are departure-to-departure comparisons;
INSA scheduled `dTimeS` must not be mistaken for realtime `dTimeR`.

Live `/app` platform-C card was also opened: displayed line 10 19:15, line 4 19:19,
line 5 19:20, confirming the API mismatch reaches the page. Initial inspected
PERIX rows have zero delays, null provider predictions/realtime timestamps. This
proves schedule fallback in this sample, not the feed-failure root cause.
No common INSA/GTFS trip-ID crosswalk or whole-network/all-stop certificate.

Evidence: `C:\Users\PC\AppData\Local\Temp\opencode\perix-insa-time-comparison-20261104\report.md`.
Do not claim live INSA equivalence or that optical v11 fixes this discrepancy.
Investigate authorized realtime feed availability/freshness/identity acceptance;
do not hardcode snapshot delays, weaken source gates or silently alter production.

## Requested visual benchmark — 2026-11-04

User authorized optical comparison with an external map, explicitly not GPS proof.
Evidence: `C:\Users\PC\AppData\Local\Temp\opencode\perix-optical-benchmark-20261104`
(`results.json`, attributed screenshots, `visual-comparison.jpg`, local test shell).

- Actual production browser entry is still v10 (`entry-71c25610...`), not v11.
  A 15.002-second foreground observation starting 17:38:22.954Z intercepted only
  Google Marker `setPosition`, passed through all original calls/results, then
  restored the method. 19 markers observed: 15 moved, 4 stationary. Maximum
  consecutive position change 0.51005 m. No large position jump in that short
  sample; not proof of correct direction, physical speed, full-journey continuity,
  provider dwell or GPS accuracy. Marker titles were absent; no matched journey.
- First authorized visible optical frame in this one navigation: 41.934 s;
  applied sample age 3.595 s. These are separate quantities, not a cumulative
  position offset and not an average/p95. Live station labels visibly overlap at
  the sampled zoom. No rendering/label changes were made as part of this test.
- geOps screenshot around Hasselbachplatz/Am Fuchsberg showed regional rail,
  no matched MVB bus/tram. Extent/zoom and vehicle coverage differ. Side-by-side
  image is a qualitative density/readability reference only; no spatial error
  measurement or verification of Am Fuchsberg approach is possible from it.
- Frozen v11 helper was tested separately in a clearly labeled local synthetic
  SVG shell using the actual frozen backend preview builder and frontend sampler,
  not the full /app or /locator renderer. 450 browser-evaluated samples across
  44.9 virtual seconds: no backward progress or dwell violation. At countdown
  0:10: progress 100 m and velocity zero; at departure: same progress/zero initial
  velocity, next occurrence selected; at +1 s: progress 100.02469 m. Countdown
  switches to the next occurrence at departure, not a persistent zero.
- Captured v11 dwell/departure images do not certify real Magdeburg geometry,
  heading, live phone performance or external GPS. No source/candidate bytes,
  deployment, provider settings or production database were changed.

## Station-cycle/countdown completion — local preparation

User selected completion of the remaining rules before release preparation.
New opt-in `station-cycle-v2` keeps `station-relative-v1` intact for old clients.
Provider `predicted_arrival/departure` and `source_windows` are immutable;
`modeled_arrival_s`, `modeled_departure_s`, `approach_started_s` are the separate
optical clock. `countdown_event` identifies ARRIVAL, DEPARTURE or
WAITING_FOR_SOURCE_UPDATE; `countdown_target_at_ms` is an absolute target, never
a reset-to-60 timer. A conditional release has no invented departure countdown.

The 30/10/0 profile uses known departure: approach from -30, stopped by -10,
gradual departure at zero. Earlier explicit provider dwell is retained. A short
or invalid source leg cannot be compressed to a zero/negative window merely to
force ten seconds of dwell; such cycles are marked limited. Three occurrences
are a rolling metadata/preparation minimum, never a cap on authorized 45 s
coverage and never a reset of journey progress. Real terminal ends stay terminal.

2026-11-04 validation and release preparation:

- Latest working tree and exact frozen candidate both passed **247 selected
  offline backend tests / 1 skipped**, **113 frontend tests**, and TypeScript.
  The offline connection guard prevents external/database access. These counts
  include fractional handover and the new station-cycle tests, not broad DB tests.
- The latest countdown regression covers an unchanged absolute departure target
  across a refreshed receipt, delayed callbacks/background elapsed time, and no
  departure refresh for conditional/null/arrival/stale rows. Both arrival screens
  use the existing serialized poller and its two-second floor. A zero departure
  requests a shared refresh once per vehicle/absolute target, not a timed unlock.
- Local working-tree supervised Mongo 7.0.45 run: **22 passed**, verified loopback
  PID/dbpath/binary, four workers and actual fleet/arrival HTTP agreement. Synthetic
  anchors survived disposable database restart. This is not a production recovery,
  hosted load, browser rendering or real provider timing certificate.
- Actual synthetic HTTP output was accepted by the exact candidate's frontend:
  **114 packets**, including **12 station-cycle packets** and **12 legacy approach
  endpoints**. The client timing bridge is simulated; no hosted latency claim.
- Candidate: `C:\Users\PC\AppData\Local\Temp\opencode\perix-web-production-20261104-v11-station-cycle`.
  Frozen source SHA `de1cbbb2bace398e32b69cf13440cd057b232de2c4ae64f94ec367972936b301`,
  extending immutable live v10 SHA
  `59792a4ed52b07a2f6ead8ec613da4360d8e87afb710f75dc2cf36010073daa4`.
  AST/function overlays preserve the v10 physical estimate tail and physical
  publication refresh verbatim. Full mixed backend files were not promoted.
- Dependencies reuse the v10 installation only after comparing package, lock,
  npm configuration and all vendor hashes (26 files). This is **not fresh npm ci**.
- Exact frozen-candidate supervised Mongo/HTTP completed: **22 passed**, including
  four-worker v2 agreement, actual HTTP fleet/arrivals and disposable restart
  survival. Evidence: `station-cycle-20261104-frozen-v11/report.json` under the
  existing isolated-Mongo evidence root. The exact candidate's frontend accepted
  **116 captured packets**, including **12 v2 station-cycle packets** and **12
  legacy approach endpoints**, using simulated client timing. The capture check
  reused the hash-checked parent TypeScript dependency via `NODE_PATH` while the
  local dependency copy was running. Local-only web export subsequently **passed**
  with the physically copied dependency installation; no source/config/lock edits.
  Entry `entry-0374f8c5cb635711af78038bbf3e997b.js`, SHA
  `55f2e42682ea802027b816fffc39266425c8e4c48502c72cef21796b76850437`.
  Verified built v2/countdown/conditional-wait/origin markers and all 766 frozen
  source hashes after build. `validation-summary.json` and
  `local-web-attempt2-build-result.json` retain the exact-candidate evidence.
  Startup prewarm remains
  unchanged v1; v2 warming/cold-start capacity needs separate real-data evidence.
  First web export failed at Metro resolution of `expo-router` through the
  external dependency junction (not at TypeScript or application compilation).
  Preserve that failed log/result; retry uses a physical local copy of the same
  hash-checked installation, not a source/config/lock change or fresh npm ci.
- No push/deployment, production provider-setting change, Mongo restart/restore,
  or global default-rule change. Production remains v10. Am Fuchsberg inverse
  geographic approach, hosted capacity/800 ms p95, phone cold-start averages and
  full database/volume recovery remain unproved.


## Fractional optical levels follow-up — local patch, 2026-11-04

User requests continuous levels between the existing 1–6 major marks, including
1.5/2.5/3.5 and gradual 5→3 / 3→5 transitions on the existing road/rail profiles.
No new prediction engine, progress animator or measured-speed interpretation.

Vocabulary: `relative_motion_continuous` means non-quantized interpolation;
`relative_motion_fractional_step` is the minor-mark spacing (0.5), not a position
multiplier or a rounding rule. `relative_motion_level_marks` includes the half
marks. Existing phase `relative_motion_level0/1` remain floating-point endpoints.
These are publication annotations, not new trajectory inputs or source clocks.

The baseline already supports float levels. The targeted behavioral fix preserves
the initial relative level through same-leg handover when source retiming changes
the meters-per-level unit; unit interpolation must preserve position/velocity,
bounded level rate and original authorization/deadline. No optical-rule namespace
or stored geometry is rekeyed for descriptive half marks. Provider clocks,
station waiting/release rules, dated trip ownership and GPS separation remain.

Applied locally:

- `visual_scale_parameters` publishes 1, 1.5, 2, 2.5, …, 6 minor marks and a
  continuous-scale flag. Neither profile configuration/signatures nor stored
  geometry/source windows change for these descriptive marks.
- The existing same-leg handover now carries its prior relative unit into the
  first velocity ramp and continuously adopts the new curve's unit. Cruise and
  final matching use the new unit. Checks bound both level and d(level)/dt;
  actual position/velocity equations, positive motion and deadline remain.
- No rounding to integer or half marks: values such as 4.38 remain possible.
  The existing physical road/rail envelope already supplies spatial slowing and
  recovery; no extra per-road engine or independent marker route selection.
- If a continuous bounded handover cannot be fitted, keep the already authorized
  behavior rather than invent a jump, source deadline or extrapolation.

Validation: **237 backend passed / 1 skipped**, **109 frontend passed**, full
TypeScript passed. Tests include 5→3 and 3→5, changed normalization units,
intermediate/finer values, both join endpoints, no rewind/road zero, unchanged
provider windows, preview equations and v10 shared-anchor compatibility.
Evidence: `C:\Users\PC\AppData\Local\Temp\opencode\perix-fractional-levels-20261104`.
This is a local patch only: no web build/deployment or production data/settings
mutation. Live production remains the previously verified v10. This patch does
not implement a new 30/10-second station clock rule at that fractional-only stage;
the subsequent opt-in station-cycle work is recorded above. Provider times stay unchanged.


## Full readiness application / approved production preparation — 2026-11-04

**Completed and retained live:** v10 deployment
`9f0bb5e4-aeaf-448b-8036-67bf66b722b8`, SUCCESS. Final runtime verification matched
185/185 files and all unrelated setting hashes. Source
`59792a4ed52b07a2f6ead8ec613da4360d8e87afb710f75dc2cf36010073daa4`, runtime
`aff78bc67ad8d154fb8f41f527275bece4f90f543eaff5743c1d564ef8d69521`.

Final package passed 233 backend / 1 skip, 104 frontend, TypeScript, web export,
21 supervised Mongo/HTTP checks and five release guards. Operational budget fields
do not invalidate accepted v9 optical profile signatures; explicit regression
coverage protects that boundary. Existing dependency bytes were reused after
exact hash comparison; fresh production npm audit reported zero vulnerabilities.

Normal provider import populated 297 physical places / 751 platforms. Live browser
checks found the original eight Hasselbachplatz locations on /app, and nine after
the complete catalogue arrived, including dormant bus platform 399723. Its source
coordinates/mode were retained without invented service. Platform-specific
arrival times were observed in /app using the existing endpoint.

First following-frame metrics were 19.175 s (/app) and 21.908 s (Locator); sample
ages at application were only 1.962 / 3.829 s, leaving 43.038 / 41.171 s of valid
coverage. These single observations demonstrate no addition of total page time
to the position; they are not latency/phone/FPS guarantees. Both pages showed
movement between receipts, no captured console errors, and parallel map/fleet
starts. Full details, source-expiry replay limitations and private evidence are
recorded in `MAGDEBURG_WEB_PRODUCTION_RELEASE_2026-11-03.md`.

The earlier "local only" and "subsequent work" entries below remain historical:
the complete flow is now promoted. No extra prediction engine, replacement
renderer, fabricated production data, provider configuration change or production
database restart/restore accompanied the release.

The user now authorizes completing the agreed flow, testing it and promoting the
exact verified web package. No new prediction engine, provider dataset or
production synthetic data is introduced.

Additional shared fields: `client_navigation_started_monotonic_ms`,
`client_request_started_monotonic_ms`, `page_to_pin_applied_ms`,
`sample_age_at_apply_ms`, `coverage_remaining_ms`, `coverage_end_reason`.
The page/navigation duration is diagnostic and NEVER an additional position
offset. The following frame after a visible/in-bounds marker application records
the completed client path, including the measurement/check work; it is not an
assertion of exact GPU pixel paint time.

Freshness refresh uses the existing serialized fleet poller, with its two-second
floor, no overlap and lifecycle cleanup. A delayed full-horizon packet with less
than the rolling reserve requests a fresh publication instead of extending its
curve. Real source-trip ends are exempt from invented minimum-window extensions.
Expired visual markers do not remain visible as an apparently stopped vehicle.
Visibility restoration also requests the ordinary serialized refresh.

Initial-sync work is ordered by the next arrival from existing source-active trip
timelines, using the existing `_chain_trips` and `_select_run_trip` ownership.
A best-effort visual preparation budget returns the first authorized READY
snapshot; regular polling fills the rest. The first expensive fit is not forcibly
interrupted, and the budget is not a two-second end-to-end/SLO promise. Startup
prewarm continues using its original full, non-initial-sync path.

The existing /app inline stop panel now uses the same arrivals endpoint and exact
platform filter as Locator. No per-catalogue bulk arrival requests are made.
Existing reused daily candidates receive only the physical catalogue field after
date/region/network/archive identity checks; unknown identities take the normal
audited import path. The same GTFS parser runs off the ASGI event loop so archive
parsing need not block all web requests. Source trip clocks remain unchanged.

## Stable network follow-up — 2026-11-04 (local only)

User approved starting the separation of physical network from dated service.
No new deployment is authorized in this stage; v9 remains live.

Terminology additions: `stop_catalogue` is the provider's physical platform
inventory, never a timetable. `physical_stop_id` identifies the grouped place;
`platform_id` identifies its actual boarding location. `service_active` means
dated membership, not geometric existence or measured vehicle presence.

Read-only public check: Hasselbachplatz (`physical:184202`) is present with all
eight platform IDs. Its physical anchor is the first bus platform at 52.120407,
11.627903, not each boarding location around the square. Existing UI additionally
hid platform detail below zoom 16, clustered locations within 25 m, dropped
platform metadata on /app, and omitted minor stops at lower Locator zoom.
These are confirmed display/data-flow causes, not a reason to reverse geometry.

Local patch scope: preserve an agency-scoped physical catalogue through the
existing GTFS/network-document path; project current/overnight service separately;
retain certified background geometry with its original scope; render each real
platform at its own coordinates without nearest-location merging. Keep existing
arrival endpoints and separate bus/tram motion engines. Navigation-to-render age
measurement and arrival-priority prewarm remain subsequent targeted work.

### Applied locally and checked

- `utils/gtfs.py`: agency-scoped `stop_catalogue` includes platforms referenced
  on other service weekdays; dated `routes/trips` selection is unchanged. Invalid
  catalogue coordinates are not promoted into map inventory.
- `routes/mobility.py` and `utils/mobility_workers.py`: carry that optional field
  through the existing upload/automatic import path, without a new collection or
  service. The unchanged-feed shortcut requires a populated catalogue; legacy
  documents require a normal parser/import cycle to gain the complete inventory.
- `mobility/domain.py`: physical catalogue and dated membership are separate;
  platform `modes` survive a day with no serving trip. The catalogue fingerprint
  invalidates label/inventory caches, never a route's direction identity.
- `mobility/v2.py`: accepted physical map domains are separate from active dated
  service domains. Expired previous-day trips do not erase certified background
  geometry or create current service. A last accepted active document provides
  physical background when the journey window is empty. Complete new catalogues
  can remove genuinely removed platforms; legacy day-only documents retain known
  prior inventory without labeling it current service. Programme projection is
  platform-specific; unused nearest-side scanning is not part of placement.
- Both web screens pass all real platform information. Locator no longer removes
  minor stops based on zoom/route count; /app now draws the already loaded transit
  lines as well as vehicle paths. Identical geometry is deduplicated for drawing
  only, retaining original dated records for vehicle authorization.
- Existing stop overlays use `(physical_stop_id, platform_id)` identity and exact
  provider coordinates. No 25 m cluster, evenly skipped pins, or first-anchor
  viewport filtering removes opposite boarding locations. Zoom changes detail
  density; a stop-only viewport revision handles pan/zoom without restarting
  vehicle animation. Cached overlay appearance receives new programme metadata.
- Locator map clicks pass `platform_id` to the existing arrivals endpoint. No
  catalogue record spawns a vehicle or invents a scheduled arrival. /app's inline
  stop-details arrival integration remains a separate follow-up.

Validation on the local working source: **229 backend passed / 1 skipped**,
**100 frontend passed**, and full TypeScript passed. The old expired-network map
test now asserts that previous geometry remains while `service_active` is false;
its dated planning checks were retained. The importer test distinguishes a valid
new catalogue from a legacy same-day document needing hydration.

Local placement against the captured public response preserved **8/8 actual
Hasselbachplatz platform IDs and coordinates**, with 4 bus and 4 tram placements
derived from their own source memberships. This is a data/placement-helper test,
not a deployed renderer or phone performance claim.

Evidence is under
`C:\Users\PC\AppData\Local\Temp\opencode\perix-stable-network-20261104`.
No new web build, deployment, provider setting change, database restore/restart
or manual production data mutation was performed. Production remains v9.

## Approved local patch ledger — implementation stage

User approval: apply the existing targeted patches file by file. No intermediate
tests, typecheck, build or deployment. Test preparation follows completion of all
local changes; production remains untouched. Entries below describe contracts,
not validation claims.

Shared terminology (identical spelling in backend/frontend contracts):

- `visual_rule_version`: optical semantics namespace; never a geometry revision.
- `stop_occurrence_index`: ordered platform occurrence, not merely a stop ID.
- `wait_state`: modeled station waiting, separate from immutable source windows.
- `release_condition`: `KNOWN_DEPARTURE` or `RELEVANT_SOURCE_UPDATE`; an expected
  packet arrival time alone never releases the latter.
- `relevant_source_revision`: digest of relevant occurrence forecasts, not the
  feed header; repeated packets never charge the same waiting time again.
- `modeled_departure_s`: optical departure; does not rewrite provider departure.
- `relative_motion_level`: dimensionless continuous level on the 1–6 scale;
  zero is reserved for an authorized station phase, never a road pause.
- Phase `stop_occurrence_index`, `start_progress_m`, `stop_progress_m` and
  `effective_arrival_at_ms`: authorization belongs to each actual directed leg.
- `display_eta_seconds`: age-compensated display value; raw sampled ETA remains
  available for publication validation. Sample age is consumed exactly once.
- Initial 40 s / rolling 15 s are coverage minima, not future-position offsets;
  retain the existing authorized 45 s / 128-phase contract.

Implementation ledger:

- Started: dated platform service projection. A route's stop catalogue describes
  physical locations; only dated trip membership establishes current service.
- Applied locally: dated service in `domain.py`, legacy stop helpers and shared
  V2 `/map`/`/stops` selection. Physical stop modes/coordinates remain separate
  from dated serving routes; overnight service includes only active trips.
- Applied locally: CAS-owned per-occurrence `wait_state`, relevant forecast
  deduplication and A/B/C lookahead, including a first publication that already
  contains C-only lateness. `waited_s` is derived from the accepted start clock,
  never cumulatively incremented per poll/worker. Conditional release requires
  an explicit `release_condition`; stale feed age never creates a station hold.
- Applied locally: separate optical configuration and continuous 1–6 profile
  envelopes on a copy of the physical solver output. Physical solver files and
  km/h limits are unchanged; km/h remains only a physical recipe input.
- Applied locally: exact multi-occurrence phases, gap/leg/clock bounds and
  occurrence-aware frontend sampling/handover. The line-certified
  `stop_progress_by_occurrence_m` accompanies phase occurrence authorization.
- Compatibility: clients opt in with `visual_rule_version=station-relative-v1`.
  Without that explicit version, both 8/32 and 45/128 responses retain their
  single-stop boundary, including already cached frontend bundles.
- Applied locally: parallel initial map/fleet loading on `/app`, shared in-flight
  map reads scoped by API base/token, and map refresh for uncovered dated
  geometry rather than ordinary active-fleet churn on both screens.
- Applied locally: `eta_sampled_at_ms`, `effective_arrival_at_ms` and separate
  `display_eta_seconds`. Arrival lists consume calibrated age once; renderer
  records use the same authorized phase sample for position/state/display ETA.
- Local implementation is not validation: no tests, typecheck, build, database
  exercise, browser exercise or deployment ran during this patch stage. The
  earlier direction candidate's test totals do not validate these changes.

### Next isolated test preparation (not executed)

#### Prepared source files after the user's station example

- `tests/test_dated_station_service_patch.py`: yesterday 1/10/2 → today
  2/10/5, mixed bus/tram platforms under one physical name, per-platform
  directions, inactive physical modes, service merges, same-version cache
  invalidation and shared V2 map/stops filtering. Uses synthetic data and blocks
  socket connection attempts during test cases; never requests `test_db`.
- `tests/test_station_relative_patch.py`: memory-CAS waiting/deduplication,
  first-publication C-only lateness, known versus explicit conditional release,
  rule namespaces, exact multi-occurrence coverage, missing-leg bounds and
  relative envelope continuity. Memory CAS is not a substitute for the existing
  supervised real-Mongo multiworker stage.
- `../frontend/tests/station-relative-patch.test.cjs`: synthetic receive/render
  clocks, position/state/display-ETA agreement across stops, per-occurrence
  rejection cases, camera-render continuity, opposite-journey isolation,
  in-flight map deduplication/token isolation/retry and fleet-churn geometry.
- Updated the old runtime test's single-arrival expiry assertion to check the
  newly authorized terminal dwell, exact source departure and unchanged final
  progress instead. Its provider arrival assertion remains unchanged.
- Reading-only compatibility follow-up: unversioned direct preview callers keep
  their former stop boundary, minimal legacy phase packets remain supported by
  the bound helper, and old handovers need not supply new phase-state fields.
  The new version still requires its occurrence/state metadata.

No prepared or existing test has been executed in this stage. No totals, pass
claims, typecheck/build results, provider audit or production changes follow
from creating these files.

#### Reading-only risks to settle before release

- The new distant-same-name station case intentionally asserts the documented
  80 m rule. The existing fallback starts with a name-only group key: if no
  nearby group is selected, that original key may still identify a distant
  same-name station. This needs a reviewed identity-preserving correction if
  confirmed; do not silently rename physical stops or weaken the assertion.
- One provider dataset for bus and tram and existing parent-station grouping
  do not prove provider names/parent IDs are error-free. Do not promise universal
  de-duplication from synthetic fixtures or infer proximity proves direction.
- The first executable stage must use an explicit reviewed file list and a
  blocked/isolated environment, never broad `pytest tests`. The shared
  `test_db` fixture can drop its configured database and is outside this scope.

- Dated platform membership, overnight merges and inactive physical stop modes.
- CAS contention/restart, unchanged-header deduplication, repeated C-only delay,
  forecast recovery, known departure versus explicit conditional release.
- Relative levels including 4, endpoint zeros, profile/phase continuity and
  bounded handover ramps; feasibility near short source windows remains a
  required validation case, not an asserted performance guarantee.
- Multi-stop coverage, exact departure/arrival boundaries, unknown next-leg
  geometry, 128-phase truncation and legacy version/horizon compatibility.
- Parallel initial load, map failure/recovery, token isolation, no fleet-churn
  downloads, single age compensation and delayed receipt/render on one clock.
- Retain the unresolved Am Fuchsberg geographic observation and hosted capacity
  limits as separate release questions; these local patches do not prove them.

## Station-name review and executed isolated tests — 2026-11-03

New user authorization: review names first, apply the necessary correction,
then execute tests. This supersedes the earlier preparation-only restriction
for this test stage, not the prohibition on unrequested deployment.

### Naming corrections

- Confirmed and fixed the distant-name fallback collision in both canonical and
  legacy stop projection. An unsuccessful 80 m lookup no longer reuses an
  already occupied name-only group. Ordinary existing IDs remain unchanged;
  a genuinely distant collision uses a platform-qualified fallback key.
- `_physical_stop_group_key` is shared by the two projections. The same provider
  platform ID cannot create a second station group merely because another route
  record spells its name differently. Explicit parent grouping is retained.
- `_stop_name_key` normalizes whitespace, Unicode NFC and case for comparison
  only. Provider display names, punctuation, SEV/platform distinctions and manual
  overrides are not rewritten or guessed through fuzzy name matching.
- Grouped route membership distinguishes `(mode, route_number)`; the existing
  second-level place merge now unions directions instead of losing later
  directions for a shared line. Bus/tram lines with the same number remain
  distinct service entries.
- `_stop_catalogue_fingerprint` refreshes same-version name/parent/platform
  corrections in domain/legacy stop caches. It is intentionally separate from
  direction/geometry fingerprints and does not create new route generations.

### Captured-provider data check (offline, not a fresh provider audit)

Read only the existing `bus_network_versions.bson` capture from the private v1
backup; no provider request, production database connection or write occurred.
The BSON member SHA-256 is
`133d9531dafb55ad66447fbe92c6d2323ea4c737bcabd04c4bcfeadfd244041c`.

For `net_31f88b117124`, service date `2026-11-03`:

- 291 physical places before/after; 685 unique platforms.
- Zero duplicate platform IDs, physical IDs or stop-place IDs.
- Zero conflicting names/parents for the same provider platform ID; zero empty
  platform names; zero remaining nearby same-name duplicate physical places.
- Zero physical-ID changes for groups with unchanged platform membership.
- Two distant same-name pairs remain distinct, as intended.
- Sixteen explicit parent groups have differing platform labels (city prefixes,
  abbreviations, SEV, loop/direction wording). These are not duplicate physical
  stations: retain their source platform names and parent membership rather than
  inventing a replacement spelling or splitting one parent's bus/tram station.

Private evidence:
`C:\Users\PC\AppData\Local\Temp\opencode\perix-station-names-20261103\captured-station-name-audit.json`.

### Test findings and final results

The first executable pass found a real optical-continuity defect: independently
normalizing a stronger remaining profile changed its starting relative speed.
Remaining profiles now reuse the physical baseline's reference unit and map the
accepted relative level into the existing physical recipe input. The original
start-speed continuity assertion remains in place and passes. No physical solver
file or measured/GPS speed contract changed.

An old frontend source-wiring assertion still expected the removed fleet-wide
`visualGeometryKey`; updated it to require the actual uncovered-geometry helper,
deduplicated refresh gate and both existing geometry-readiness checks. Behavioral
tests separately exercise fleet churn, missing authority and in-flight reads.
Legacy bounds additionally retain their moving→arrival phase boundary rather
than inadvertently publishing a later dwell to an unversioned client.

Final executions on this local source:

- **221 backend tests passed / 1 skipped**, explicit 17-file offline list,
  12.78 s. External connections and the deliberately disabled test DB port were
  blocked; the production-destructive shared `test_db` fixture was not used.
- **51 frontend tests passed**, explicit three-file synthetic transport/clock
  suite, including exact departure boundaries and late receipt/render.
- **21 supervised loopback Mongo/HTTP tests passed**, 184.68 s, four independent
  workers, real CAS contention, C-only wait deduplication, explicit conditional
  release, cold process reads, worker recovery and database restart persistence.
  Mongo 7.0.45 ran only on a fresh disposable loopback database, with PID, port
  and dbpath verification, and was shut down by its owning supervisor.
- The only warning in these backend runs was the dependency's existing
  `python_multipart` import deprecation. A skipped case is not counted as passed.

Evidence:

- Offline backend file list and output, plus frontend output:
  `C:\Users\PC\AppData\Local\Temp\opencode\perix-station-names-20261103`.
- Mongo/HTTP report and owned test logs:
  `C:\Users\PC\AppData\Local\Temp\opencode\perix-mongo-isolated-20261102\station-relative-20261103-v1\report.json`.

These are not a production load test, fresh live-provider accuracy audit or
browser/device rendering proof. No typecheck, web build, deployment, production
data modification or frozen-v8 overwrite occurred in this stage. Am Fuchsberg's
reported geographic approach remains an observation to verify, not a proven
reverse-geometry diagnosis or a claim resolved by passing synthetic tests.

## Production promotion v9 — completed and retained live

Final deployment **`8cdb5e53-efaf-4783-b811-ab373c71e393`**, SUCCESS, retained live.
The validation-in-progress notes below are historical preparation steps, not
the current release status.

- Production-origin export succeeded on the longer-running retry of the exact
  same frozen source. Runtime SHA-256:
  `aaafb8d521985e00c1e3da414edbaec2a6726e78a2813c63871795bd7fd2529c`.
- New entry `entry-bd92222a58877e500b8e77e5c6324639.js`, SHA-256
  `320f11704d22e42a7e9b63921ac2bf6bbf2e5af80f620cef2e4e79fcb1c056e5`.
- **185/185 runtime files matched**; actual app initial environment matched;
  configuration changed zero flags and all unrelated setting hashes remained
  unchanged through final live verification.
- Public map/stops matched: **173 certified lines, 291 physical stops and 685
  unique platforms**, no duplicate station/platform IDs. Three fleet reads were
  **45/44/43 READY estimates**, with **28/28/27 multi-occurrence publications**.
  Source clocks and explicit optical/non-GPS semantics were preserved.
- Both real browser pages loaded the exact new entry and showed movement
  between fleet receipts, without captured console errors. Fleet/map requests
  started in parallel and ordinary fleet polling did not repeat the map download.
  These are individual bounded observations, not capacity/phone/FPS guarantees.
- Review-created tabs/observers were cleaned up. No rollback, production Mongo
  restart/restore, manual source-clock rewrite, paid-provider activation or
  native/OTA release was performed. Full evidence and precise browser limitations
  are in `MAGDEBURG_WEB_PRODUCTION_RELEASE_2026-11-03.md` and the private v9 folder.

### Historical preparation record

The user explicitly approved production promotion after the station-name review
and isolated tests. Scope remains the existing webapp at `https://app.perix.eu`;
no native/OTA release, paid-provider activation, database restart/restore or
unrelated working-tree promotion.

- Fresh read-only preflight still found serving v6 deployment
  `d595fb4d-89b7-422a-a26e-e87c8500f946`, 173/173 ready generations and unchanged
  active network `net_31f88b117124`, service date `2026-11-03`.
- Frozen v9 source: `7cec167d27a88ad82155c44e67e99b4f77cf9789a46ded72216d478e034402a8`.
  Parent is immutable v8, not a recursive upload of the dirty checkout.
- The mixed `routes/mobility.py` overlay selects only the four reviewed stop/
  serving helpers. The physical estimate tail is byte-for-byte unchanged from
  v8. The V2 overlay selects dated stop/map projection and packet metadata; its
  physical `_refresh_estimated_publications` function remains unchanged.
- Production code comparison found only approved backend direction/service/
  optical changes. The production-only OSM build tool will be preserved by the
  existing packager. Current public frontend entry/hash and explicitly public
  map-key provenance were verified before a production-origin rebuild.
- On this exact frozen source: **221 backend passed / 1 skipped**, **21 real
  four-worker disposable Mongo/HTTP tests passed** (257.10 s), and **93 frontend
  tests passed**. Five offline release-operation guard tests also passed.
- Fresh `npm ci`: 1,138 packages added, audit reported **0 vulnerabilities**.
  Full frozen-source TypeScript check passed. Dependency deprecation notices
  remain maintenance notes, not hidden or relabeled as runtime errors.
- Exact captured-transit BSON restore passed locally: 47 visible estimates,
  **22.016 s cold / 2.109 s next call**, explicit `SCHEDULE_ONLY` stale-RT fallback;
  source notice and **173-generation OSM export** matched the restored dataset.
  This is not a new live-provider accuracy or hosted capacity claim.
- The first clean-cache web export hit the tool's 120 s process limit before
  finishing. Its incomplete log/output were preserved privately; no runtime was
  packaged or deployed from it. Retrying the identical frozen source with a
  longer-running build, without altering source or production settings.

Private release evidence:
`C:\Users\PC\AppData\Local\Temp\opencode\perix-web-production-20261103-v9`.
Production remains on the previous serving deployment until the final package
is built, identity-guarded upload succeeds, and runtime/public/browser checks
complete. This section does not yet announce a successful production release.

## User reports and scope

- v4 moved initially, but panning/zooming could stop animation; source deadline
  changes should be absorbed farther along the remaining leg, not by an
  artificial mid-road hold or jump.
- Buses and trams must turn with the directed route on **both** `/app` and
  `/locator?tab=mobility`.
- At **Am Fuchsberg, ~14:38 Europe/Berlin**, line 9 toward the centre and the
  previous line 9 toward Reform reportedly crossed at the right times but
  approached from opposite geographic directions to their displayed pins.
  The user explicitly clarified this was **opposite geographic travel**, not
  merely the adjacent track or an icon facing backwards.
- Keep production live and fix forward. No precautionary rollback, source
  clock rewrite, operator contact, synthetic production data or Mongo restart.

## Confirmed continuity defects and v5 changes

The marker-sync effect cleared `authorizedPreview` before discovering that a
re-render supplied the same/older sample behind the animated point. It then
returned without reinstalling a curve. This was reachable through ordinary
camera/bounds-driven re-renders. Re-validating an older packet against the
one-second wall-clock bridge-age gate was also unsuitable after map geometry
finished loading or an unchanged vehicle re-entered the viewport.

v5 separates visual publications from the legacy physical/GPS branch:

- Exact duplicate/older packets and same-authority PENDING packets preserve the
  already authorized curve and its original deadline. HIDDEN/different geometry
  cannot borrow an old animation. No camera render resets its time base.
- API receipt captures a monotonic clock bridge. Delayed map rendering samples
  that original bridge rather than treating a re-render as a new receipt or
  extending freshness. Expired authorization remains expired.
- Same-leg source revisions join the current displayed point and visual speed
  to a future point on the new curve using positive-speed ramps. Position and
  velocity are continuous at the join; no rewind/zero-speed artificial hold,
  new source deadline or traversal through unknown geometry is invented.
- New clients explicitly request `visual_preview_seconds=45`. The backend
  publishes up to 45 seconds / 128 exact visual phases, bounded at the source
  stop. Old queries still receive the original 8 seconds / 32 phase contract.
  Physical schema-1 limits are unchanged. This is server authorization, not
  client extrapolation or a physical-speed guarantee.
- Geographic position/forward tangent are sampled together from directed
  geometry. Icon heading updates during animation on both shared web maps,
  rather than only when a new backend heading arrives. Icon redraws are
  throttled, while geographic motion remains frame-driven and zoom-independent.

## Immutable candidate and validation

- Source v5: `68057de8e9e59bb9a1e51317ba39da2f7bf966e0904e1409e7e65dc5f6666ee1`.
- Runtime: `5ad3d22dbbb48077e35ad3922a0746c55cba77c84d52fc4cb3e9170f83fd7cf9`.
- Entry: `entry-18cc299a5ffbece88bde431b12f935c1.js`.
- Entry SHA-256: `bb79cdaa8bb165ce1443391c1dce3411c8e71ec23f06705e47a1e37cba657dfa`.
- **85 frontend tests**, TypeScript and production web export passed.
- **295 backend tests passed / 1 skipped** in the selected offline suite.
- Actual supervised disposable four-worker HTTP/Mongo suite: **19 passed**,
  220.67 s, including opt-in 45 s reads and backward-compatible default reads,
  source target/revision equality, geometry recovery and restart persistence.
- Five offline release-guard tests passed; configure performed **no flag
  rewrites** because the two activation flags were already enabled.
- Fresh full npm audit: **0 advisories**. Dependencies reused the verified v4
  clean install via a scoped junction; lock/vendor inputs did not change. This
  is not a new clean-install claim or blanket security certification.

v5 deployment **`4fadfc53-f244-4c36-8e17-9239f38029a5`** succeeded;
184/184 runtime files matched and public opt-in 45 s/default 8 s checks passed.
Locator samples showed moving/turning markers before and after gestures, but
the `/app` browser exposed a further clock-bridge rejection, so v5 alone is
**not** labeled a complete continuity success. It was kept live while fixing
forward, without changing production flags or performing a rollback.

## v6: separate bounded-RTT server-clock calibration

The fleet response residual RTT sometimes included 6–9 s of server
queueing/encoding outside the endpoint's received/sent timestamps. Treating
that entire residual as network uncertainty rejected otherwise valid curves,
especially on `/app`. v6 adds a tiny public `/api/mobility/v2/clock` response
and a per-client monotonic calibration:

- Calibration accepts only a separate sample with residual RTT **<=500 ms**,
  uncertainty **<=250 ms** and finite ordered timestamps.
- Calibration is refreshed after 60 s and must be at most 120 s old when
  accepting a new publication. Failed/slow clock samples are not accepted.
- Fleet queueing does not widen the clock tolerance. A previously calibrated
  monotonic source-clock bridge is used instead; source stop deadlines and
  preview expiry remain unchanged. No GPS/physical assurance is added.
- A stale, invalid or missing calibration cannot bypass the original strict
  bridge validation. Schema-1 physical preview limits remain unchanged.
- Source v6:
  `a9db2a7be24b0869a1c11047ee4df1a4f70edf36a287319978a25bba5a329fc7`.
- Runtime v6:
  `5a82d22a0ac9747c64b069465af2ff1c8f4e298e9ea1757efe5983afd402cd0e`.
- Entry: `entry-7752150b5f244f62af26437842e5aee0.js`, SHA-256
  `53eab6b75174615e3ab4d32f910317b78536a678c066a99e04cca8c00e5d4083`.
- **86 frontend tests**, TypeScript and **296 selected backend tests / 1 skip**
  passed. The v5 four-worker evidence is reused for unchanged motion logic,
  not relabeled as a new v6 four-worker run. The new clock endpoint is covered
  by its own offline test.

v6 production-origin web export passed. Configure rewrote no flags; rollout
continued forward with existing importers/database/provider settings preserved.

### v6 retained live and gesture checks

- Deployment **`d595fb4d-89b7-422a-a26e-e87c8500f946`**, SUCCESS, retained live.
  **184/184 runtime files** matched; one Uvicorn process, matching initial
  environment and unchanged unrelated settings. No rollback was performed.
- Public new-JS hash, `/app`, Locator, clock and opt-in fleet GET checks passed.
  The clock GET took 93 ms in the low-rate check; the fleet returned 89 estimates.
- `/app` browser clock sample: 379.2 ms, within the accepted bound. In 2-second
  samples, moving/turning icon counts were **17/2 before gestures**, **6/0 after
  zoom**, **6/1 after pan**. Marker-sync counter remained unchanged within these
  samples: motion and orientation changes occurred without a fresh publication.
- Locator samples: **41/23 moving/turning before**, **40/23 after zoom**,
  **36/12 after pan**. The after-pan sample also had an unchanged marker-sync
  counter. Both pages loaded the expected v6 entry and had no captured console
  errors. Ordinary visible SVG-marker movement was observed, not GPS passage.
- Some Locator clock requests were slow (0.67–2.78 s) and correctly rejected;
  later samples of 98.6, 429.1 and 88.5 ms were within bounds. Initialization or
  calibration refresh can still wait under sustained server queueing. This is
  not a high-concurrency, constant-FPS or unlimited-offline-motion guarantee.
- The explicit 45-second visual window remains bounded by source stop clocks.
  If authority/geometry becomes unknown or a window really expires, safety
  handling remains active; clocks are not fabricated to hide an outage.

Private final evidence:
`C:\Users\PC\AppData\Local\Temp\opencode\perix-web-production-20261103-v6`.

## Am Fuchsberg direction investigation — not yet a verified fix

Read-only production/public-data checks identified:

- Physical stop `physical:38827`; platform `182075` serves the centre/north,
  platform `74147` serves Reform/south in the stored source sequence.
- Stored prediction for trip **753085**, Reform: **14:36:09** at platform 74147.
- Stored prediction for trip **255169**, Neustädter See via centre:
  **14:38:41**, departure **14:39:05**, at platform 182075.
- The per-trip update timestamp was absent. These are stored predictions, not
  measured vehicle passage/GPS, and cannot alone certify what ran on the street.
- Current public line-9 directed geometry at latitude 52.1138 crosses at
  longitude **11.6197344414 northbound** and **11.6196887143 southbound**.
  Thus the stored centre-bound rail is east of the southbound rail there;
  the data does not justify blindly reversing either route or swapping labels.
- All eleven line-9 vehicles in a later low-rate read had matching displayed
  destinations and pattern destinations. This is not a replay of the 14:38 UI.
- The user suggested points might be used without origin-to-destination
  direction. Inspection found `_pattern_key` prefers a shape ID when present,
  otherwise headsign plus the ordered platform-ID sequence. A read-only audit
  found **no shape IDs on current line-9 trips**, so these two directions use
  different destination/ordered-stop keys. The trip-path cache additionally
  includes the ordered timeline coordinates, dated version and generation.
  This does not confirm the user's reported inverse movement, nor justify
  replacing all production pattern IDs or rebuilding all geometry.
- Public alerts returned an empty list at inspection; that is not proof no
  real-world diversion existed.

The exact historical pin movement was not recorded. **The reported inverse
geographic approach has not been reproduced or declared resolved.** The new
per-frame heading fixes stale icon orientation, but is not presented as proof
that the separate opposite-travel incident is solved. Do not change production
rails, stop order or source clocks without evidence of the specific mismatch.

Private evidence:
`C:\Users\PC\AppData\Local\Temp\opencode\perix-am-fuchsberg-direction-20261103`
and `C:\Users\PC\AppData\Local\Temp\opencode\perix-web-production-20261103-v5`.

The 800 ms p95 target, high-concurrency capacity and full-database/volume
recovery remain unproved. No native binary/OTA publication is included.
