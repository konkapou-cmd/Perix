# Syros and Mykonos map artwork

222 landmarks from `syros_mykonos_complete_222.zip`: 127 Syros, 95 Mykonos.

- `sources/` retains the supplied PNG atlases, location JSON and source notice.
- Individual lossless WebP images preserve the source artwork's visible RGBA,
  with transparent padding. Component masks avoid cutting objects at cell edges.
- `manifest.json` records source/output hashes, source bounds and pixel counts.
- `review.jpg` is a review contact sheet, not a runtime asset.
- `lib/city/islandLandmarks.generated.ts` preserves the supplied coordinates and
  names. IDs are prefixed with `GR-SYROS-` or `GR-MYKONOS-` to avoid collisions.
- `lib/city/islandLandmarkImages.generated.ts` registers static Metro assets.

The shared landmark registry feeds the existing web/native map renderers and
gateway destination selection. Tapping selects the exact supplied latitude and
longitude for the existing Google directions preview. Missing street addresses
remain empty; no geocoding or entrance adjustments are performed.

Coordinate data: © OpenStreetMap contributors, ODbL 1.0,
https://www.openstreetmap.org/copyright. Per-record sources and coordinate notes
are retained. The gateway's existing OpenStreetMap attribution is unchanged.

Reproduce in a clean destination with Python, Pillow, numpy and opencv-python:

```powershell
python scripts/import-island-landmarks.py "path\to\syros_mykonos_complete_222.zip"
```

The importer refuses to overwrite an existing import directory.
