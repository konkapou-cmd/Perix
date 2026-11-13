# Catalog 196 (business taxonomy icons)

Source: the three supplied sheets (70 + 70 + 56 = 196 icons, white background,
no captions) plus `Full-Catalog-Coverage-196.csv` (catalog_order 1–196).
Sheet order is row-major catalog order: s1 = #1–70, s2 = #71–140, s3 = #141–196.
Verified programmatically (exact 70/70/56 cells in 10×7 / 10×7 / 8×7 grids).

## Method (same approved mask workflow, white-background adaptation)

- Foreground = clearly non-white pixels; long infographic rules removed.
- Grid cells found by clustering component centroids (multi-part icons merged).
- Label-based figure masks: only the icon's own components are kept, so
  neighbour fragments, solid white backplates and enclosed holes stay
  transparent. No rectangular erasure, no recoloring, no upscaling.
- 8px transparent padding, lossless WebP, decode round-trip asserted.

## Mapping (catalog → app)

- 149 leaf subs + 31 groups + 2 home + 3 roots replaced in place (same keys).
- 10 new keys: Vollzeit, Teilzeit, Vertrag, Praktikum, Remote (jobs, previously
  Ionicons-only) and apartment, house, studio, room, commercial (rentals
  property_type keys are singular; the map only had plurals).
- `gatewayIllustration` handles `job_type` → business-subcategory (one line).
- Split catalog duplicates kept distinct: #105 Professional Insurance →
  `insurance` (umbrella, companies); #188 Vehicles Insurance →
  `insurance-agencies` (shield+car, car insurance).
- Pet Hotel (#196) has no app slug and stays uninstalled — nothing invented.

## Audit

- `catalog196-mask-manifest.json`: per-icon target, size, alpha bbox, sha256.
- `tests/catalog196-install.test.cjs`: every installed file matches its
  reviewed hash; new keys resolve; pet-hotel absence asserted.
- Pre-apply originals: temp `catalog196-review-20261110/before-apply` (185 files;
  the 10 sub-new keys are new files, no originals exist).
