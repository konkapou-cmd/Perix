# Reviewed live release — 23 October 2026

Production deployment: `4211552f-697f-49da-b8d9-e814064bdc4e` (`SUCCESS`).
Public application: https://app.perix.eu/locator?tab=mobility

## Why this release was needed

Read-only capture of the preceding production deployment
`d6cad021-9d12-4837-99d6-0b7cd026b36c` found static schema 8 and missing strict
dated-journey modules, despite the previously validated schema-12 release.
Deploying the shared dirty checkout would repeat that regression.

The isolated release therefore retained the current production non-mobility
source, restored the hash-verified mobility closure from staging deployment
`3b8ef7d6-7c7c-4763-b7f1-b133c53dc5e0`, and overlaid the reviewed account fixes
from `bb74ffd1` and frontend pacing fix `05f827be`. The original shared WIP was
not reset, discarded or uploaded wholesale.

The restored closure and replay procedure are described in this directory's
README and manifest. **This older shared backend tree is not itself the exact
production source.** Use the reviewed closure/replay and account overlays for
subsequent builds, rather than an unfiltered upload of the working directory.

## Account and map changes

- Local logout is immediate; delayed account requests cannot restore the user.
  The remote logout attempt is bounded and serialized before a subsequent login.
- Recovery confirms the new password, consumes only an unexpired single-use
  token and invalidates old sessions. It does not bypass mailbox ownership.
- Removed startup Google SDK preloading. Non-Mobility basemap replacement remains
  explicitly pending: see `frontend/OSM_BASEMAP_RECOVERY.md`.
- Mobility wrapper preserves explicit 300px height and 16px margins.
- Static network geometry and unchanged vehicle paths are not resent per poll.
- Marker motion interpolates only between authoritative samples; no threefold
  extrapolation beyond the latest position. Dwell/signal/zero-speed states hold.
  A new dated journey resets its animation identity, even on an identical path.

## Checks actually performed

| Check | Result |
| --- | --- |
| Main frontend pacing/account/map tests | 26 passed |
| Frontend typecheck and web export | PASS |
| Isolated packaged backend occurrence, latency, civil-date and account tests | 76 passed, 1 capture-dependent skip |
| Real staging temporary-account login/logout/reset/session invalidation | PASS; temporary data removed |
| Expired and reused reset links | Rejected in staging |
| Production runtime hash verification | 256 files matched; zero missing/mismatched files |
| Public apex redirect | perix.eu → app.perix.eu → HTTP 200 |
| Production desktop map | 940×300 at viewport 1296×886 |
| Production responsive mobile map | 358×300 in a 390×844 browsing viewport; no horizontal overflow |
| Production moving bus/tram trace | 12-second browser sample: zero backward movements and zero progress overshoots |
| Separate rendered-speed sample | 10 seconds: bus median 17.3 / max 54.2 km/h; tram median 23.1 / max 48.5 km/h; sampled moving estimates only |
| Active static network | net_235c9d2f5bfb, explicit service_date 2026-10-23 |
| Pattern readiness/current snapshot | 157/157 ready and current; zero missing/stale in the inspected report |
| Realtime worker sample | 150 matched/stored; zero invalid-clock rejects |
| Public fleet sample | 28 vehicles: 20 realtime estimates and 8 schedule estimates |
| Public API timing sample | Vehicles 1.5s; map 6.734s; not a proven cache-cold or peak-load benchmark |
| Google Routes traffic | Disabled |
| Recovery link configuration | APP_WEB_URL matches app.perix.eu; Resend configured |

Realtime counts fluctuate. Vehicles are estimates unless backed by actual GPS;
the browser trace is not independent validation of real-world arrival accuracy.
No recovery email was sent to a real user and inbox delivery is not certified.
The responsive browser viewport check is not a native-device test.

## Artifact identity

- Served entry: `entry-8b14d986051982863bfc945235566ed2.js`.
- Frontend transport (`webdist.dat`) SHA-256:
  `71b8e13dca1e15b14059dc4a6ac1e9ba1a6a2f2e351b622375518e7feaaaa39e`.
- Full local release, production baseline backup and runtime verification:
  `C:/Users/PC/AppData/Local/Temp/opencode/perix-live-reviewed-release/`.
- Previous deployment retained as rollback reference:
  `d6cad021-9d12-4837-99d6-0b7cd026b36c`. Its known regressions remain documented;
  it is not asserted to be a healthy mobility rollback.

No DNS/domain mappings, paid Google Routes flags, production accounts, existing
sessions or island networks were modified by the deployment procedure. Existing
gated static import activated the dated network; no forced activation was used.
