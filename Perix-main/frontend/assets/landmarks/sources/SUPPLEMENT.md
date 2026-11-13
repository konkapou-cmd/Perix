# Unlabelled supplement: MD-X001 … MD-X070

Source: the supplied `magdeburg_70_supplement/magdeburg_70_icons.png` and its
`magdeburg_70_locations.json`. Unchanged archival copies are saved here as
`unlabelled-supplement-original.png` and `supplement-locations-original.json`.

The zip's rectangular `crop` entries do not follow the artwork. They excluded
138,417 opaque-core pixels across 56 illustrations, and included pieces of
neighbouring illustrations in some cells. They are **not used as crop bounds**.

The extraction uses individual opaque components, ownership of disconnected
details, the original antialias/shadow alpha and an 8px transparent border.
All 687,830 source pixels with alpha > 128 are preserved exactly once across
the 70 masks. No RGB colours, names, IDs, map coordinates or routes are changed.
Images are lossless WebP at their original extraction resolution, not upscaled.

Masks: `../masks/supplement/`. Audit: `supplement-mask-manifest.json`.
The separate labelled atlas and its 70 legacy images are unchanged.

Reproduce into a **new review directory**, with Pillow, numpy, opencv-python:

```text
python scripts/extract-supplement-landmarks.py --sheet assets/landmarks/sources/unlabelled-supplement-original.png --locations assets/landmarks/sources/supplement-locations-original.json --output NEW_REVIEW_DIRECTORY
```

Review `all-70-review.png` before applying files to `../supplement/`. The tool
never overwrites the source or live assets. Soft shadows touch the source edge
in a few entries (flagged); no opaque illustration core touches the source edge.
