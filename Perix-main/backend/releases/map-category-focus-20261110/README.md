# Category focus and dense island maps — 2026-11-10

**Published to https://app.perix.eu/app.** Production deployment:
`546e8148-3af8-4818-a197-a4fb542c9560`.
Final staging deployment: `447bf547-d74f-4e99-a5ec-4bbb50a0ef9d`.

## Scoped changes

- Category drilldown blurs/fades existing landmark artwork in the background, hides its labels, and disables background landmark taps. Leaving the category restores the normal presentation.
- Arrival cards and loading/empty notices are hidden during category/destination focus; the independently maintained transit snapshot is not reset.
- A directory pin shows a result card below the map **before** its route preview. Public-service result cards open the full public page. Both ordinary and selected public-service pins use the service's profile image.
- Profile artwork uses a padded square `contain` presentation rather than a circular `cover` crop. Circular map thumbnails have sufficient inset to preserve the entire square artwork.
- Camera changes while inspecting a selection do not change the directory query bounds. Vehicle updates reuse stationary marker overlays. The inline summary does not mount a second map.
- Individual and counted directory pins use the same legible 24–44px zoom-size curve on web/native; counted pins are not larger than individual profiles.
- Syros/Mykonos artwork uses a compact, separate size curve and supports close-up map zoom up to 23, subject to provider support. The existing Magdeburg size curve remains unchanged.
- Island buildings are revealed individually as zoom creates space. They never become numbered landmark clusters. Names start at zoom 19 and are collision-managed independently. Exactly co-located sources remain at their real coordinates and can be chosen from a list.
- Directory pins with the same address share one counted profile pin, using the **first list item's** image and anchor. Selection preserves the original list/group order instead of replacing that pin or adding a duplicate. Different addresses are never combined merely because coordinates are close. Legacy markers without addresses retain the existing coordinate fallback; moving vehicles and the standalone compass remain individual.
- The island curve follows the clarified Magdeburg technique: larger artwork at distant zoom, shrinking between zoom 14 and small-street detail at 16, then renewed growth towards 180px at zoom 23. This island curve does not change the existing Magdeburg artwork sizes.
- Web landmark rendering is viewport-bounded and does not resynchronize for ordinary vehicle marker updates.

## Verification

- Clarified revision: 333 frontend tests passing; TypeScript check passed. The isolated source is typechecked again during its release build.
- The frozen baseline matched the published bundle before applying the nine source files. Final staging and production both passed app HTML/entry bundle hash, runtime file, environment-setting and complete 82-record directory fingerprints. Reports and browser observations are stored alongside this document.
- No changes to public-service records, coordinates, source names, imported images, backend code, provider configuration, or mobile/OTA publication are part of this release.

## Isolated release

Operational tool: `backend/tools/map_focus_release.py`.

The exact published island frontend source is used as the baseline. Its rebuilt entry must match the published SHA-256 before the nine scoped UI/map files are applied. The pre-existing unpublished job-artwork line is excluded **only in the isolated snapshot**; the working directory is not reverted or overwritten. All other source/assets/dependencies remain from the verified published snapshot.

Only `webdist.dat` may differ in each environment's backend runtime. Environment variables and the entire 82-record public-services collection are fingerprinted before/after. Staging uses its own API origin and must pass verification before production deployment.

Private source/build/capture directories (not committed):

`C:\Users\PC\AppData\Local\Temp\opencode\perix-map-category-focus-20261110`

Original deployments captured for rollback:

- Production: `2f67cf30-5db6-42f3-8216-faa56707915b` (222 island landmark icons; 185 runtime files).
- Staging: `e195cb47-2503-48b4-9461-1732dd3a4229` (approved public-services release; 184 runtime files).

Original backend/web archives are retained in each environment's `rollback/Perix-main/backend` directory. Rollback must deploy that exact captured runtime, not a reconstruction from the mixed working directory. Do not copy captured environment values into source or commit private captures.

## Browser and transport observations

- The isolated local preview rendered real service-profile map images and the result card before the route preview. Category focus was observed with `blur(3px)`, background hit targets disabled, and arrival cards hidden.
- An earlier Mykonos local preview at overview/street zoom rendered 19 separate visible buildings and zero labels, rather than the oversized overlapping scene in the supplied screenshots. The final clarified curve is larger and starts names at zoom 19; automated projection tests cover its shrink/grow stages, progressive close-up reveal, label collisions and co-located-source selection.
- Initial upload attempts timed out in the older globally installed Railway CLI before a build could start. A separate Railway CLI v5.71.0 was downloaded to the private release directory and verified against GitHub's published archive SHA-256 (`1460c5d4616794558e21bdb1bf94ff2dc2fb9a48df647857642bbe1e714f81b6`). It supports a longer **local request** timeout; no global installation or Railway service variable was changed.
- The first staging deployment (`912f5b23-44fe-43cd-990c-31e734957a5f`) passed bundle, runtime, settings and unchanged-directory fingerprints. A subsequent no-badge revision was superseded by the user's explicit same-address count/first-profile clarification. Only the final clarified revision may be promoted to production.
- The final clarified revision was promoted and verified: 185 production runtime files and 184 staging runtime files match their expected hashes, with backend code/settings/directory data unchanged. The final local preview confirmed matching 33px widths for single/count pins and first-entry profile images beneath numeric address badges.
