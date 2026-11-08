# Neighbour timing — production release

**Live:** https://app.perix.eu  
**Deployment:** `d91ff576-492d-45e8-a388-c2b00d0746c6` — SUCCESS  
**Previous production / frozen rollback:** `92095c5c-033d-45b8-b358-3bd2fd4abcac`  
**Validated staging:** `41bc15ee-d2e2-4c1c-9a99-e390b5add33e`

The 277-file upload is isolated from shared WIP. Its backend is byte-identical
to validated staging; only `Perix-main/backend/webdist.dat` differs for the
production-origin frontend. All 274 expected runtime backend hashes and the
served frontend entry/map HTML hashes match. No staging origin is embedded in
the production frontend. The active Magdeburg region/configuration is unchanged;
paid Google routing remains disabled. No database migration, artificial live
vehicle, live feed fixture or manual delay correction was inserted.

Validation: 114 backend / 92 frontend regressions, focused lint, zero new
TypeScript diagnostics against the five-error CityAdViewer baseline, the
465-point canonical tram 9 replay and 1,200 synthetic bus/tram time samples.
The 24 neighbour/fallback cases also passed in a separate production Python
process, with a nonresponsive local Mongo URL and no application-worker changes.
Production API and browser results in the accompanying JSON state the actual
dated samples, coverage and limitations; do not infer live GPS/fallback evidence
when those samples were absent.

Concurrent N7 bus and tram 4 samples shared one model-plan revision across fleet,
exact-platform arrival board and selected-trip detail. Their predicted arrival
clocks matched; board/marker ETAs were respectively 158/158 and 117/117 seconds,
with positive remaining distances. Sequential requests can legitimately span a
normal 12-second plan rebuild; they were not misreported as an internal mismatch.
Browser DOM checks rendered the two-anchor disclosure on actual tram 4, retained
42 exact-ID overview choices below top controls and above attribution, and loaded
the new revision-aware map. Pixel screenshots were unavailable because the desktop
browser window was not visible. Home loaded the new entry and its area prompt;
the conditional Home map was not exercised because no area was selected. No
origin preference or account state was changed to manufacture a passing result.

Position, next-stop ETA and stop detail use the same model plan, including the
replacement for the old forward-crawl fallback. Previous/following source stop
constraints preserve provider clocks and do not blindly move downstream delay
upstream. No unobserved red light or queue is presented as a real observation.
These safeguards enforce model consistency, not guaranteed physical tracking.
Worker-local diagnostics are bounded and disappear on restart.

The frozen rollback wrapper is verified and its exact scoped upload command is
in `production-rollback-ready.json`. Do not upload the dirty checkout. Existing
browser tabs need a refresh to load the new frontend; no cookies, account data
or origin preferences were cleared by this release.

The source patch/reproduction evidence remains in the parent release directory:
31 changed/new source files reproduced byte-for-byte from the stated baseline.
Helper scripts expect the approved original temporary artifact paths; they do
not contain credentials. No further automatic production monitoring is promised.
