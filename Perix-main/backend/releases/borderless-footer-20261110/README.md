# Borderless bottom navigation — 2026-11-10

**Published to https://app.perix.eu** for the shared mobile Home/Locator/profile/messages footer.
Production deployment: `d0c08127-dc5f-4ada-a7ec-371ac3d1f1c7`.
Staging deployment: `6e5f2147-cf3c-4e78-9826-4eae839d4bff`.

## Presentation

- Remove every icon-face border, coloured selected-face background and inactive-face shadow.
- Keep the original icon images and 56px layout/touch frames. The active artwork alone scales to 1.12×; inactive artwork stays 44px. The resulting active 49.28px artwork remains inside the frame.
- Web uses an alpha-aware CSS drop shadow behind the selected artwork, not a rectangular box shadow. Native uses selected-only shadow/elevation styling.
- Message badges remain anchored to the unscaled outer frame, retaining their original font/count handling.
- Reduce footer content height from 76px to 64px and vertical outer padding from 6px to 2px. This lowers the separator by 12px at the same viewport/safe-area inset. The full bottom safe area is still reserved.
- Preserve routes, login gates, business/user create actions, desktop footer hiding, lazy mounting and `freezeOnBlur` behaviour.

## Verification

- 342 frontend tests passed; TypeScript check passed.
- Dedicated tests cover borderless active/inactive states, selected-only zoom/shadow, unchanged image sources, badge handling, login/create actions and bottom insets 0/16/24/34/48px.
- A browser preview rendered the actual old/new React Native Web component using the existing artwork. All 10 preview images loaded. Computed styles confirmed zero icon-face borders, a 1.12 transform and drop shadow only on the active icon. Measured separator positions differed by 12px (76px vs 64px bars).
- The visual preview is not an authenticated Home-page session; auth/navigation semantics are covered independently by the layout tests.

## Isolated release

- Runtime source scope: `components/navigation/TabArtworkButton.tsx`, `lib/navigation/tabLayout.ts`, and `app/(tabs)/_layout.tsx` only. No asset changes.
- Tool: `backend/tools/footer_artwork_release.py`.
- Private captures/builds: `C:\Users\PC\AppData\Local\Temp\opencode\perix-borderless-footer-20261110`.
- The preceding island street-detail revision must be verified first; its exact published source/runtime becomes the baseline so that the footer update cannot revert the pending map work.
- Only `webdist.dat` may differ in the backend package. Backend code, settings and all 82 public-services records remain fingerprinted. No account data, database or mobile/OTA publication is changed.

Final production/staging app HTML, entry bundle, runtime files, unchanged settings and complete 82-record directory fingerprints all passed. Exactly three source files changed and no image assets changed. Deployment verification reports are stored alongside this document. The preceding island street-detail revision is retained in this package.
