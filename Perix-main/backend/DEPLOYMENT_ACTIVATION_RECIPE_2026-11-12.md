# Multi-region activation recipe (final sequence step 6)

**Nothing here is activated.** Magdeburg remains the default region and the
only active runtime region. Every other region stays `REVIEW_ARTIFACT_NOT_ACTIVATED`
until the operator explicitly applies the per-region environment below, one
region at a time, after the staging gates in
`MULTI_REGION_SOURCE_LICENSES_2026-11-12.md` are cleared.

## Large-network storage (added 2026-11-13)

Berlin (264MB) and Athens (~500MB) cannot fit one 16MB BSON document.
`_create_network_version` now splits large versions automatically: a small
header document (`routes_split: true`, `routes_count`, `occurrence_timing`,
no embedded `routes`) plus one document per route in three collections
(streamed one route at a time so the import never holds precomputed data in
RAM):
  - `bus_network_route_blocks` — route shells: stops, shapes, trip identity,
    everything the map/domain/read API needs (66.9MB Berlin total).
  - `bus_network_trip_windows_blocks` — compact deterministic trip windows
    (start/end/anchors + ordered stop|arrival pairs) computed at import from
    the base schedule.
  - `bus_network_trip_times_blocks` — raw timing fields + the precomputed
    base timeline (realtime=None) per trip.

Runtime loading is target-specific ("same trip times as Magdeburg, loaded
only where needed"):
  - Read API (map/nearby/routes/patterns/networks): light assembly, 68.9MB
    (3.8× smaller than the 264MB single-doc shape).
  - Arrivals + buses-serving: hydrate windows+times only for the candidate
    routes (the trips through the requested stop).
  - Estimated vehicles: hydrate all compact windows (run chaining) + raw
    times only for realtime-delayed trips; selected-trip timelines hydrate
    per route lazily, one route at a time.
  - Journey planning / window evidence / driver endpoints: full
    (`include_times=True`) assembly — rare, on-demand calls.
  - Delayed trips always recompute from the raw times (identical results).
Magdeburg-size payloads stay single-doc exactly as before; the fast paths
never trigger (single-doc trips carry no `window`/`base_timeline`).

Local rehearsal (2026-11-13, isolated db `perix_berlin_rehearsal`): download
→ parse (330 routes / 46,610 trips) → revision audit (0 blocking) → inactive
version split into 330 shell + 330 times + 330 window docs → light assembly
68.9MB / full assembly 263.9MB (canonical shape) → selective hydrate of one
route (U1, 264 trips: windows + times + base timeline) verified. Nothing was
activated.

Known follow-ups (documented, not blocking): the estimates path still
fetches the full compact-window collection per compute (~200MB transient,
cached per compute cycle); the stored base timelines are ~570MB on disk per
version — both candidates for a later compaction pass (time-bounded window
fetch, compact timeline encoding).

## Global gates (unchanged from Magdeburg)

| Variable | Effect |
|---|---|
| `MOBILITY_REGION_ID` | Active region id (`magdeburg` when unset). Change = region switch, one at a time. |
| `MOBILITY_WORKERS_ENABLED` | `false` stops all in-process mobility workers (realtime, static, OSM, precompute). |
| `MOBILITY_SYNC_AUTO_ACTIVATE` | `false` = import candidate only, do NOT activate (first pass of every new region). |
| `MOBILITY_STATIC_GTFS_URL` | Static feed URL; empty = static sync disabled (used by islands/ports manual uploads). |
| `MOBILITY_REALTIME_URL` | GTFS-RT feed URL (defaults to the shared DELFI free feed). |
| `MOBILITY_SYNC_MIN_TRIPS` / `MOBILITY_SYNC_MIN_LINES` | Health-check floor before any import is accepted (default 500 / 10). |
| `MOBILITY_STATIC_INTERVAL_HOURS` | Static refresh cadence (default 6h). |

## Recommended order and per-region environment

Run each region as: **pass 1** `MOBILITY_SYNC_AUTO_ACTIVATE=false` (import +
review only), then **pass 2** activate after checking the version-bound
`source_manifest`, schedule audit and health checks.

### 1. berlin (first — same GTFS_RT pipeline as Magdeburg)

```
MOBILITY_REGION_ID=berlin
MOBILITY_STATIC_GTFS_URL=https://unternehmen.vbb.de/gtfs
MOBILITY_REALTIME_URL=https://realtime.gtfs.de/realtime-free.pb
MOBILITY_SYNC_MIN_TRIPS=5000
MOBILITY_SYNC_MIN_LINES=100
```
- Expected: ~327 routes (bus 227 / rail 49 / tram 21 / s-bahn 18 / subway 9 / ferry 3),
  ~46k active trips/day, publisher `VBB Verkehrsverbund Berlin-Brandenburg GmbH`.
- Preconditions: VBB terms page verification (see licence doc §4.4).
- Depth test passed 2026-11-12 (fresh feed, all extended types mapped,
  artwork + motion coverage complete).

### 2. gardelegen (bus-only, national feed)

```
MOBILITY_REGION_ID=gardelegen
MOBILITY_STATIC_GTFS_URL=https://download.gtfs.de/germany/nv_free/latest.zip
MOBILITY_REALTIME_URL=https://realtime.gtfs.de/realtime-free.pb
MOBILITY_SYNC_MIN_TRIPS=50
MOBILITY_SYNC_MIN_LINES=5
```
- Expected: PVG Salzwedel, 82 bus routes (dry-run 2026-11-11).
- Feed carries its own DELFI publisher (`feed_info.txt`).

### 3. syros / ports (manual upload, no realtime)

```
MOBILITY_REGION_ID=syros        # then ports separately
MOBILITY_STATIC_GTFS_URL=       # empty: static sync disabled
MOBILITY_REALTIME_TYPE=NONE     # set through region preset (already NONE)
```
- Import `imports/islands/syros_ktel_gtfs.zip` / `imports/ports/ports_ferry_gtfs.zip`
  through the existing manual-upload path (each zip carries its verified UTF-8 publisher).
- Preconditions: KTEL Syrou reuse permission for the transcribed timetable;
  NAP dataset is 2023 — verify current operator timetables before ports activation.
- **Mykonos is held out of the activation plan** (owner decision 2026-11-12:
  no permission path pursued; the region and its artifacts stay inactive).

### 4. attica (last — needs a fresh feed window + live verification)

```
MOBILITY_REGION_ID=attica
MOBILITY_STATIC_GTFS_URL=       # manual upload of current OASA/STASY RARs
MOBILITY_OASA_TELEMATICS_ENABLED=true   # only after adapter live verification
MOBILITY_OASA_ROUTE_CODES=<comma-separated allowlist>
```
- Current OASA/STASY archives are stale (Aug/Oct 2026 windows) — do not
  activate until data.gov.gr publishes the current window.
- OASA telematics endpoint was unreachable from the build machine; the adapter
  is offline-tested (10/10) but must be verified live against telematics.oasa.gr
  with a small route allowlist before `true` is set.
- Preconditions: operator reuse rights (see licence doc §4.3).

## Rollback

Set `MOBILITY_REGION_ID=magdeburg` (or unset it) and restore the previous
environment set; Magdeburg's static/realtime URLs are unchanged. Region
documents are namespaced by region_id/network_id, so other regions' data is
never touched by the switch.

## Ordering with the frontend

Frontend needs no region flag: it reads the active region's V2 network and
mode list from the API. The 8-mode control, new artwork (incl. rail) and
source credits render from that data. Verify once per region: mode controls,
vehicle/stop artwork, publisher credit line, OSM credit.

## Final mass-test checkpoint before any activation

1. Frontend: `npm run typecheck` clean; suite green except the known WIP
   failures owned by the gateway area-switcher work (user WIP).
2. Backend: mobility subset green except the known pre-existing
   `test_parser_retains_second_visit_times_and_strict_metadata`.
3. Berlin depth test PASS (rerun on activation day to catch a newer feed).
4. Licence gates from `MULTI_REGION_SOURCE_LICENSES_2026-11-12.md` cleared.
