# Independent island buildings: calibrated shrink, hold, then blur

**Published to https://app.perix.eu/app.** Production deployment:
`a41bfe20-216a-4ce3-b0ca-8bcca993b1be`.
Staging deployment: `814664f0-565c-4273-9b68-bfeda897f8d4`.

## Basemap calibration

The road-label transitions were inspected on the actual Google basemap, not inferred from the previous zoom constants. The local calibration page used the app's map colours/hidden POI styles, German UI, and **361×271 CSS-pixel mobile map areas** centred on Mykonos/Matogianni and Syros/Ermoupoli. Two persistent map instances were captured at actual zooms 15–20 after tile loading.

- 15: broad area/administrative labels and larger approaches; not a sufficiently named town-street network.
- 16: some through-streets/central routes, still sparse in the dense town centres.
- **17: the ordinary town-street tier**, with more internal road names (e.g. Apollonos/Kalliachi around Mykonos, Roidi/Chios/Idili in Ermoupoli).
- **18: additional finer named lanes**, including Florou Zouganeli in Mykonos and Gelenos/Nikis in Ermoupoli.
- At 19/20, the fixed test centre can lie inside a block while surrounding roads leave the viewport. Those white/block-centre views were not interpreted as roads or labels disappearing globally.

These are observed references for the tested map size/centres/style/language, not a universal promise or runtime OCR/detection of Google's tile lettering. Provider data, view size, centre and language may affect label placement.

Private captures: `C:\Users\PC\AppData\Local\Temp\opencode\island-street-calibration-20261110` (`streets-z15.png` … `streets-z20.png`). The calibration HTML contains the existing public browser map key and is not committed/deployed. No provider settings were changed.

## Final visual contract

- Every source building is rendered independently at every zoom; **no crowding-based image hiding**, position averaging or proximity composites. A building tap identifies only that building.
- Distant island artwork follows the same values as Magdeburg (12px at zoom 10, 38px at 12, 115px at 14).
- From zoom 14 to the calibrated town-street tier at 17, artwork smoothly shrinks to **42px**, smaller than Magdeburg's 54px full-artwork reference.
- From 17 through maximum zoom 23, artwork **stays 42px**. No later regrowth/enlargement.
- It stays sharp through the ordinary-street plateau. At the finer-lane reference 18 it fades to .3 opacity and begins image-only blur (1.2px, progressing to 2.4px). Labels are not blurred.
- Existing text-overlap prevention can withhold an overlapping name; it never merges/hides the building image. Exact co-located sources retain their original anchors and may visually overlap, as they do in Magdeburg.
- Same-address **directory profile pins** remain counted groups; this adjustment concerns the island building artwork, not the previously requested address-pin grouping.

## Release controls

Only `frontend/lib/city/landmarks.ts` changes in the isolated runtime source. There are no asset, coordinate, name, category, backend, service-variable or database changes. The borderless footer, civic/job icons, persistent 10km scenes and live transit behaviour are retained from the verified footer release.

Tool: `backend/tools/island_city_scale_release.py`.
Private source/runtime/rollback capture: `C:\Users\PC\AppData\Local\Temp\opencode\perix-island-city-scale-20261110`.

Captured baselines:
- Production: `d0c08127-dc5f-4ada-a7ec-371ac3d1f1c7`.
- Staging: `6e5f2147-cf3c-4e78-9826-4eae839d4bff`.

343 frontend tests and TypeScript checks passed. The source audit confirmed one changed runtime module and no changed artwork assets. Both environments passed HTML/entry bundle hash, runtime, unchanged-setting and complete 82-record directory fingerprints.

A real-map app probe at a 393×852 viewport retained the same **89 independent scoped building nodes** throughout actual zooms 14, 15, 16, 17, 17.5, 18, 19 and 22 (the provider clamped the request for 23). Every node remained drawn and uncombined; directory requests stayed at one for the entire sequence. Recorded sizes were 115 → 90.67 → 66.33 → 42px, followed by a constant 42px plateau. Image blur began at 18 as required. This is the loaded Mykonos 10km scope, not a claim that every location has 89 buildings or that offscreen anchors fit simultaneously in the viewport.

The first probe assumed an initial integer zoom and failed its step-index expectation. It was corrected to read the public Google Map reference in the QA page and explicitly set/record actual zooms; the corrected complete probe passed without a production-code workaround.

Test, basemap calibration, app probe, scoped source and deployment evidence are stored alongside this document. The borderless footer and all prior scene/icon changes are retained. The separately requested App/Home/Locator restructuring is not part of this package and remains pending the user's content/auth/layout clarifications. No mobile/OTA publication is performed.
