# Island building names, coverage and street-detail blur — 2026-11-10

**Published to https://app.perix.eu/app.** Production deployment:
`602707f4-b778-41c0-a863-9abe1e37d28a`.
Staging deployment: `b5e5d7f3-bf35-4bf7-9948-9a20f7f7bd72`.

## Requested presentation

- Island names accompany the full-artwork tier from zoom 15, rather than waiting until 19. Existing collision handling and category-focus label suppression remain in force.
- The distant/approach technique is retained: 64px at zoom 14, a 54px full-artwork reset at 15, then smooth growth to **320px by the small-street reference at 16**.
- At that reference, image opacity becomes .3 and image-only blur starts at 1.2px, progressing to 2.4px. Further artwork growth is capped at 360px. Names stay sharp; neither renderer blurs the label container.
- The large translucent illustration footprint is capped separately for decluttering, so growing a decorative background image does not suppress nearby independent buildings indefinitely. Coordinates, source names and artwork files are not changed.
- The reference is the existing `LANDMARK_STREET_DETAIL_ZOOM=16`, not OCR or detection of Google's tile lettering; actual basemap label availability can vary by provider/tile/language.
- Magdeburg's existing size curve, the persistent 10km scene, ordered loading, static request caching, category icons, address-count profile pins and live transit cadence are retained.

## Scope and tests

- Runtime change: only `frontend/lib/city/landmarks.ts` in the frozen frontend source; no asset changes.
- 340 frontend tests passed; TypeScript check passed. Tests cover early labels, substantial coverage at the street reference, progressive image-only blur/fade, unchanged coordinates, collision handling and the existing Magdeburg presentation.
- Operational wrapper: `backend/tools/island_street_detail_release.py`, reusing the isolated source/runtime capture and verification workflow.
- Private captures/builds: `C:\Users\PC\AppData\Local\Temp\opencode\perix-island-street-detail-20261110`.
- Only `webdist.dat` may change in a deployed backend runtime. No backend code, database, service-variable or mobile/OTA changes are performed.

Captured prior deployments:

- Production: `0e027c01-e90f-4b56-abc1-417909f6b09d`.
- Staging: `9cd709c8-87e4-462c-99bf-b4fbc77ccdc6`.

Both environments passed final HTML/entry bundle hash, runtime, unchanged-setting and complete 82-record directory fingerprints. The source audit confirmed exactly one changed runtime module and zero asset changes. Verification reports and check summaries are stored alongside this document.
