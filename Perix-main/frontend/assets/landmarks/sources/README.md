# Labelled Magdeburg landmark atlas

`labelled-landmarks-original.png` is an unchanged copy of the supplied
**Transparent landmark icon sheet.png** (1049 × 1500). Its hash is recorded in
`labelled-mask-manifest.json`. Do not redraw it, resize it or bake new captions
into its artwork.

## Extraction

From `frontend`, with Pillow, numpy and opencv-python installed:

```text
python scripts/extract-labelled-landmarks.py --sheet assets/landmarks/sources/labelled-landmarks-original.png --output NEW_REVIEW_DIRECTORY
```

The tool only creates a new review directory; it does not overwrite map assets.
Inspect `all-70-review.png` before applying any output.

- Isolate opaque illustration cores, then recover original antialiased pixels
  by nearest-core ownership. This separates captions connected by faint halos.
- Preserve nearby detached illustration details. Printed captions below the
  illustration do not qualify as decorative pieces.
- Do **not** erase OCR rectangles: those previously cut through roofs and bases.
- Keep 8 transparent pixels on every side of each extracted shape.
- Export lossless WebP without changing visible source RGBA pixels.

The applied alpha masks are in `../masks/original-70/`; map images retain their
existing `legacy-001.webp` … `legacy-070.webp` filenames in `../original-70/`.
The separate unlabelled supplement sheet, names, IDs and coordinates are not
changed. Map labels are rendered by the app from zoom 15 (1×), not from the atlas.

## Source limitations

`legacy-003`, `legacy-004` and `legacy-036` touch the original atlas boundary.
Transparent output padding prevents further clipping, but cannot reconstruct
anything that might already be outside the supplied original. These entries
are explicitly flagged as `source_boundary_touch` in the manifest.
