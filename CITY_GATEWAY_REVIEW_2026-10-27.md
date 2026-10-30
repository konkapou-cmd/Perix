# City Gateway — isolated review WIP

## Scope and isolation

- Branch: `feature/city-public-services-once-20261027`.
- Starting HEAD: `c1d83bd43262bb0bf24bdc78e3c5fcd589a35162`.
- Worktree: `C:\Users\PC\AppData\Local\Temp\opencode\perix-city-public-services-20261027`.
- Original checkout: `C:\Users\PC\Downloads\Perix1` (43 tracked WIP files at preflight, including maps, Home, Locator and Mobility).
- No changes to the original checkout's application sources; no WIP copied, stashed, reset, merged, committed or pushed.
- No production deployment, database connection/import/migration, DNS/Railway mutation, package installation or API provisioning.
- The user stopped data collection. Existing snapshots/draft files are retained as paused work; the application does not load them, and no records were inserted or published.

## Implemented application structure

- `/` and `/app` both export `CityGatewayScreen` (one implementation).
- The existing BusinessMap is composed directly, with local camera/bounds and a stable initial region. No renderer, MapSection, LocationContext, global map/provider or Mobility engine change.
- Map height is approximately 54% of the available viewport; the lower pane scrolls independently.
- Fourteen root tiles, replacing child levels, breadcrumbs/back, canonical business/group descendant slugs, existing event/activity/marketplace/service/property taxonomy sources.
- Pins and cards derive from the same `useCityDiscovery.items`, with bounded caching, request deduplication, debounce, stale-response rejection, incremental paging and explicit partial/error states.
- Inline read-only details preserve the map/filter state; no category or marker navigation to Locator.
- Public-services taxonomy and read-only cards are ready for a later approved file. Source dates/licences/modifications have their own card section. Drafts are never returned by public reads.
- Guest direct entity routes render a separate safe view before member components mount. Signed-in member detail components remain the original implementation.
- `/home` is excluded from guest routes; the tabs layout prevents Home mounting during anonymous redirect. Login keeps the existing successful-auth redirect to member Home.
- No member creation chrome or install/update banners on the Gateway itself. Other member screens retain their existing chrome.

## Why new public read models are necessary

The audit found that existing optional-auth DTOs can contain invitations/emails, business plan/friend data, and private-event metadata; existing authenticated details cannot simply be made anonymous. A small isolated projection router was added instead of relaxing member endpoints or copying Locator.

New GET routes:

- `/api/public-directory/{kind}` — bounded, paged safe read projection from existing collections.
- `/api/public-directory/{kind}/{id}` — published/public entity detail; business/user slug resolution.
- `/api/public-directory/post/{id}/comments` — public post comments, moderated/author-filtered.
- `/api/public-services/taxonomy`.
- `/api/public-services` and `/api/public-services/{id}` — only approved, source-verified, published records from the existing MongoDB's `public_services` collection.

These routes have **no mutation handlers**. Unsupported POST/PUT/PATCH/DELETE return 405. Existing protected member mutation routes are unchanged, not bypassed.

Public projections omit user email/GPS, credentials, role/admin flags, subscription data, invitations and raw social records. Approximate listing locations reuse the existing `public_listing_location` helper. Hidden/private/draft/deleted/inactive/expired records and unavailable publishers are denied. Exact taxonomy IDs, not translated text, drive category queries.

Existing APIs reused directly: business category tree; event/activity constants; marketplace taxonomy and field registry; existing service module configuration; existing read-only Mobility vehicle/stop adapters. No new transit/routing service or third-party browsing feed was introduced.

## Files changed

Existing runtime files (paths under `Perix-main/`):

- `backend/routes/__init__.py`: register the two small read routers.
- `frontend/app/index.tsx`: common public Gateway entry.
- `frontend/app/_layout.tsx`: explicit public detail/Gateway access and scoped banners.
- `frontend/app/(tabs)/_layout.tsx`: prevent guest member-Home mount.
- `frontend/components/GlobalWebChrome.tsx`: no member chrome on Gateway/guest views.
- `frontend/app/{business,event,activity,artist,user,job,service,rental,listing,post}/[id].tsx`: small wrapper only; retain original member component bodies.

New runtime modules:

- `backend/public_services/{models,repository,discovery}.py`, `taxonomy.json`.
- `backend/routes/{public_services,city_public}.py`.
- `frontend/components/city/{CityGatewayScreen,CityInlineDetails,GuestEntityRoute,PublicServiceCard,PublicServicesExplorer}.tsx`.
- `frontend/hooks/city/useCityDiscovery.ts`.
- `frontend/lib/city/{gateway,publicServices}.ts`.
- `frontend/app/app.tsx`, `frontend/app/public-services/{index,[id]}.tsx`.

Paused collection/import preparation remains under `backend/imports/public_services/` and `backend/scripts/public_services/`. It is not part of application startup, not scheduled, and no import command with `--apply` was executed.

## Checks completed

- 46 isolated backend tests passed; one existing python-multipart deprecation warning.
- 41 frontend Node tests passed, including existing auth/Mobility/map regressions.
- Scoped ESLint for the new city modules/routes/tests passed.
- `tsc --noEmit --incremental false` passed after Expo generated its normal local type environment. Earlier isolated pre-export runs had five CityAdViewer diagnostics; no source fix to CityAdViewer was made.
- Expo web export passed. It warned that the native `google-services.json` file is absent in this isolated worktree; no native build certification is claimed.
- Browser UI smoke with explicitly labelled **synthetic test fixtures**, never production/directory imports: anonymous root/alias, fourteen tiles, three-level business filtering (3 → 2 → 1), same map DOM node through filters, map top unchanged while lower pane scrolls, inline detail without Locator navigation.
- Browser fixture host: `http://127.0.0.1:8098`; only the test harness serves its fake records. The production implementation reads MongoDB, not this harness or snapshots.
- After a fresh Metro cache rebuild, the existing browser key is included correctly, the actual Google BusinessMap initializes without the previous error, and the sampled browser console has no errors. No key or Cloud settings were changed by the agent. The user added the temporary localhost referrer in their console.
- Guest direct `/home` was observed redirecting to `/login`. The sampled Gateway browser requests to the local Perix API were all reads (26 requests, zero non-read methods, zero failures).
- Temporary Metro dependency-visibility overrides used to build against the existing dependency junction were removed; no runtime hosting/map configuration change is part of the patch. Expo-generated local `.gitignore`/type environment files are build artifacts, not new dependencies.
- Desktop screenshot evidence: `C:\Users\PC\AppData\Local\Temp\opencode-browser-9pcZJQ\0\screenshot.png` (real Google map, explicitly synthetic test pins).

## Still open — not release acceptance

- The empty-key preview issue was fixed by rebuilding the isolated export with a fresh Metro cache and the existing local key. Valid production-origin configuration still needs release verification. Never print the key or broaden Cloud permissions/billing as a workaround.
- Full production-data/browser/member integration, authenticated ownership/mutation checks, physical native and mobile-device QA have not been completed.
- Existing global security findings from the initial audit (including legacy public event/activity/preview responses and hardcoded-key admin/dev handlers) remain release blockers. New Gateway DTO safety is not a claim that every legacy endpoint is already secure.
- Production source identity is not proven by a branch: live `/api/version` previously returned empty SHA/build fields; frozen release identity reconciliation is still required before promotion.
- The supplied blue/gold logo was located at `C:\Users\PC\Downloads\Perix logo.png` and added as a cropped, proportional local wordmark. The three originally referenced layout screenshots are still unavailable; exact matching against those references is not claimed.
- Reconcile against current Mobility work only through review; the shared renderer in active WIP reads additional global selection state not present in this committed base. No overwrite/merge has been attempted.
- Public services await the user's file and approval. No data-publication or production-write approval is implied by implementing the UI.

No commit, push, merge, production DB write or deployment is authorised by this review WIP.

## Visual and multilingual refinement

- The public Gateway now has a centered, compact but prominent wordmark, with a circular local-flag language picker next to it. Search is above the map, below the brand. A 12px gap separates the map from the upper controls.
- The repeated active-filter / explore-city introduction was removed. Functional back/breadcrumb controls remain available after selecting a category.
- White category/result cards have sky-blue borders. The map outline is a non-interactive overlay, preserving Google gestures, camera and instance lifetime.
- Homepage and Home category accents reuse the Locator's existing colour tokens. No shared palette or map-renderer defaults changed.
- The same artwork is used on member Home (mobile header and opt-in desktop navbar) and login. Other navbar consumers retain their previous brand by default.
- Home title/subtitle/location text now uses existing readable typography tokens and stronger subtitle contrast. The global font system is untouched.
- A scoped `city` namespace uses the existing i18next instance and existing language persistence for all ten supported languages. The language switch changes labels, not canonical taxonomy IDs or map state. Public-services source labels are translated; approved descriptions use available stored EL/DE/EN text, not live automatic translation.
- Selected categories hide their child boxes only after a **confirmed final empty result**: not while loading, not on request errors, not for partial failures and not when another page remains. Every root category has its own translated return-soon message. Root navigation remains available even when the city has no content.
- 54 frontend Node tests, TypeScript, scoped lint and the refreshed web export passed. The native google-services-file warning remains an isolated-environment caveat; no native build certification is claimed.
- Both supplied logo variants are bundled: Greek Πέριξ when the existing app language is `el`, Latin Perix otherwise. No second language preference, storage key or i18n instance was created. Member Home and login use the same component and global preference.
- Desktop browser checks confirmed German/English/Greek switching, corresponding artwork and search labels, successful picker dismissal, and Greek persistence on a fresh login-page load. A regression test covers react-i18next's stale render snapshot during asynchronous language changes: success is checked against the existing application instance.
- In the measured 1296px viewport, the 176px logo slot was centered at x=648. Search was at y=84–132 and the real map started at y=144, leaving the requested 12px gap. The real map had no configuration-error overlay.
- A language switch did not add Perix API requests in the sampled session (39 before / 39 after). Confirmed empty German events and Greek activities had different translated messages and no child-category grid. The non-null map region DOM node was retained across the category change.
- Latest desktop screenshot: `C:\Users\PC\AppData\Local\Temp\opencode-browser-ywxWKm\0\screenshot.png`. It shows the real Google map with the explicitly synthetic local smoke pins, not imported city records.
- Browser verification of signed-in member Home and physical native/mobile devices is still pending; the shared-logo integration and style/token changes have automated coverage.
- Data collection remains paused. These UI changes do not import, publish or synchronise any records.
