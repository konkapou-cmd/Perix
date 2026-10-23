# Non-Mobility basemap recovery

Status: **OSM_TILE_BACKEND_NOT_FOUND** in the inspected checkout, reachable Git
history and local configuration. This is not evidence that an uninspected older
deployment or external project never contained a renderer.

## What is present

- `BusinessMap.web.tsx` constructs `google.maps.Map`. Home, Discovery, shared
  entity maps and non-Mobility Locator tabs import this component.
- `LocationPickerMap.web.tsx` constructs another Google map, reverse geocodes
  with Google and sends Google Places requests through a third-party CORS proxy.
- `GoogleMobilityMap.tsx` is already a separate component used in the Locator
  Mobility branch. No Mobility geometry, vehicle or ETA changes are needed to
  restore a different non-Mobility renderer.
- Native BusinessMap/LocationPickerMap use react-native-maps without an explicit
  OSM tile layer. Android's standard provider is Google; iOS's default is Apple
  unless a provider is explicitly selected. This is source behavior, not a native
  device/build verification.
- `backend/mobility/osm_store.py` and `backend/utils/osm.py` provide real OSM
  roads/rails, signals and route geometry. They are not raster/vector tile servers.
- The theme colors in the frontend are retained; styling does not identify the
  underlying basemap provider.

## Recovery checks completed

- Current and stashed BusinessMap/LocationPickerMap files and dependencies.
- `git log --all -S tile.openstreetmap` on frontend paths: no retained implementation.
- `git log --all -S leaflet` and `-S maplibre` on the relevant frontend paths:
  no retained implementation/dependency change.
- Oldest retained moved BusinessMap commit `2eaa40f2` already imports Google
  configuration. Commit `0a9626c9` explicitly added startup Google preloading.
- No configured Leaflet, MapLibre, TileLayer, UrlTile, tile URL or style endpoint
  was found in the checked frontend/configuration/deployment files.
- `EXPO_PUBLIC_MOBILITY_MAP_URL` identifies the Mobility map document, not a
  tile/style backend; it must not be reused as one.

Startup Google preloading has been removed in this correction. Existing map
components remain unchanged until a replacement is ready: disabling all maps or
silently switching to a public tile service would hide rather than solve the gap.
Consequently Google still loads when those existing non-Mobility maps mount.

## Smallest proposed replacement (not provisioned or enabled)

1. Publish an OSM-derived vector basemap as a PMTiles archive in controlled object
   storage with HTTPS Range requests and CORS restricted to the application.
   Publish the matching style, glyphs and sprite assets alongside it. A renderer
   for the current regions can use existing permissible OSM PBF inputs; global
   discovery requires appropriately scoped/global coverage, not just Magdeburg.
2. Render it through MapLibre in one shared non-Mobility web component and adapt
   the existing BusinessMap prop contract. Preserve marker IDs/colors, clusters,
   selection sheets, bounds/focus callbacks, user pin and location picking.
3. Use the existing first-party search/reverse-geocode APIs where appropriate;
   remove the CORS-proxied Google Places path from the location picker only when
   equivalent search/selection is verified. Do not send keys to a CORS proxy.
4. Keep Google Maps JS exclusively inside GoogleMobilityMap's iframe. Test network
   traffic on Home, Discovery, all Locator tabs, entity pages and location picking
   to prove there are no Google SDK/Places/Geocoder requests outside Mobility.
5. Separately select a native OSM renderer/provider after web parity is verified.

This needs agreement on geographic coverage, storage/service ownership and any
recurring hosting cost before provisioning. No public OSM production fallback,
arbitrary tile URL, new infrastructure or map-provider migration was applied.
