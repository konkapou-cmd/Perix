# Persistent scene loading and supplied category icons — 2026-11-10

**Published to https://app.perix.eu/app.** Production deployment:
`0e027c01-e90f-4b56-abc1-417909f6b09d`.
Staging deployment: `9cd709c8-87e4-462c-99bf-b4fbc77ccdc6`.

## Changes

- Static data uses a confirmed-origin **10km scene scope**, not the map viewport. Ordinary zoom/pan and GPS-watch updates do not change the directory request URL or building membership.
- Explicitly choosing a new origin starts a new scope. Merely choosing a destination or transit stop does not replace the area's loaded directory/buildings.
- Directory snapshots retain their loaded pages across category navigation, with bounded in-memory caches and no 15-second TTL refetch. Explicit Refresh still invalidates the relevant cached pages. The former 400ms viewport debounce is removed.
- Initial rendering priority is map → nearest stops/dated arrivals → first fleet response (or a legitimate empty/error outcome) → building scene → directory pins. Nearest stops render from their small scoped response while the full stop catalogue is deferred until the initial fleet stage settles.
- Buildings stay mounted through camera changes. Web images use lazy/async, low-priority decoding; the visible building batch releases directory loading after painting, with a 750ms upper bound so a slow image cannot block results indefinitely. Offscreen buildings are not destroyed/recreated on zoom.
- Individual/count profile pins keep a common 33px base until the area's building-name zoom tier, then resize locally up to 44px. Same-address grouping and first-list-item profiles are preserved.
- The live fleet/arrival cadence is intentionally **not** frozen; only stationary directory/building data is retained.

## Artwork

- 17 civic/SOS icons from `Handcrafted Public Services Icon Sheet.png`.
- 5 job-type icons from the lower row of `Handcrafted Civic Services and Jobs Icons.png`.
- Source captions/header are excluded. Edge-connected near-white background and small clipped neighbour fragments are removed; retained RGB artwork is not redrawn/recoloured. Output is lossless WebP with transparent margins.
- `frontend/scripts/extract-civic-jobs-icons.py` and `frontend/assets/illustrations/civic-jobs-v1/manifest.json` record source hashes, crop boxes and output hashes.
- Pixel checks verified original RGB values and transparent margins for all 22 outputs.
- Hotels, Homes nearby, Rentals, transport modes and property-type choices reuse existing uploaded assets. Other installed artwork is not overwritten or promoted as part of this release.

## Tests and operational scope

- 339 frontend tests passed, including real discovery-hook caching/pagination/refresh tests, ordered scene loading, stable bounds on unselected zoom/pan, icon taxonomy mapping and image hashes.
- Working-tree TypeScript check passed. The isolated candidate is also typechecked during its build.
- Release tool: `backend/tools/scene_loading_release.py`.
- Private immutable captures and frozen source/builds: `C:\Users\PC\AppData\Local\Temp\opencode\perix-scene-loading-icons-20261110`.
- The published map-focus source is rebuilt and must reproduce its live entry SHA-256 before applying the 9 scoped source files and 32 named asset/manifest files. Unrelated local catalog artwork/source work stays outside the candidate.
- Only `webdist.dat` changes in the deployed backend. Backend code, environment variables, the complete 82-record public-services directory and its source coordinates are fingerprinted before/after. No database or mobile/OTA publication is performed.

Original deployments retained for rollback:

- Production: `546e8148-3af8-4818-a197-a4fb542c9560`.
- Staging: `447bf547-d74f-4e99-a5ec-4bbb50a0ef9d`.

Both environments passed final app HTML/entry bundle hash, runtime file, setting and complete public-services-directory fingerprints. Backend code/settings and all 82 public-services records are unchanged. The production runtime verified all 185 captured files; staging verified 184.

The isolated browser preview loaded 50 directory results and a 126-building scope. After zooming, it retained the exact same 126 DOM nodes and issued **zero additional public-services directory requests**. All 17 civic-category images loaded with zero broken images. These are concrete QA observations, not a claim that every location contains 126 buildings or that no new, previously unseen image can ever be lazily decoded.

Verification reports, scoped source/asset audit and check summaries are stored alongside this document. The frozen candidate differed from its baseline only in the permitted source/assets (34 files actually changed); other local catalog work was not promoted. No absolute production speed claim is made from unit tests; the target is to remove repeated static requests/remounts and preserve the prioritized first frame.
