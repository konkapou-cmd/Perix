# Daily refresh online release — 2026-10-26

## Outcome
- Production final deployment: `86787584-b517-4c4a-acbb-da7ef325add5`.
- Active network: `net_a17a9612acba`, service date `2026-10-26`.
- Active road/rail graph: `1793043763`; 159/159 READY (92 reused, 67 rebuilt).
- 93 bus and 66 tram patterns; 3776 timetable trips across 34 routes.
- Audited OSM layers: 30,027 roads / 865 rails / 2,814 signals. Source timestamp 2026-10-25T21:21:21Z.
- Automatic activation restored and bounded daily recovery enabled. Native recalibration and Traffic APIs remain disabled.
- Live network/routes/vehicles HTTP 200; all returned virtual vehicles use current network/date. Virtual counts: {'bus': 25, 'tram': 32}.
- Served frontend JS and map HTML hashes are unchanged. No passenger appearance changes or frontend rebuild.
- Original staging database/settings restored; only owned isolated validation DB removed after runtime verification.

## Validation and deployment scope
Real-Mongo isolation/ownership/lease/concurrency/attempt-cap/ambiguous-outcome tests passed, including HTTP 409 for blocked activation. Production used only the frozen reviewed production baseline plus the checked production-specific daily patch, not the dirty checkout. 278 backend runtime hashes verified on each production phase. Activation required full READY with `require_ready=True, force=False`, fresh downloaded GTFS schedule audit, current date, stable restrictions, prior active ownership, and pinned graph. No forced activation. No commit or push.

Held deployment `2eefd022-f880-4514-a5bc-fd2105c64385` succeeded; its initial CLI status monitor failed after upload. It was reconciled without duplicate upload. Earlier staging upload/packaging attempts remain preserved privately.

## Rollback readiness
Previous source deployment: `d91ff576-492d-45e8-a388-c2b00d0746c6`; frozen source at the private `perix-neighbor-timing-release/production-upload` directory.
Previous active network `net_7f0605d2409e`, graph `1793013850`.
Private full mobility backup: `production-mobility-rollback.bsonjson.zlib` (13496546 bytes), SHA-256 `c5b7f7f6794a2aca971fcc589bb73981a62885b6a7bc7ba00a1007989ccd24fa`; reverified during report creation.
The backup stays outside the repository in the approved private `perix-daily-online-20261026` directory. It covers all regional raw graph layers and graph metadata, full prior active network and generation/mirror/segment data, all version activation flags, profiles, sync/recovery, restrictions and overlays. User/account/realtime collections are not reset.

If rollback becomes necessary, first hold AUTO and daily recovery and quiesce mobility writers; deploy frozen old source with held settings. Verify backup hash and reconcile post-release writes before restoring only backed-up mobility scopes and exact version flags. Restore raw graph layers and supporting geometry data before switching metadata/network pointers. Restoring only graph metadata is unsafe because the importer prunes old raw graph versions. Restore original activation settings only after DB/runtime/served checks and restart to clear in-process caches. No rollback was executed during this rollout.

## Limits
This establishes code/data/readiness and served-state correctness, not observed bus-position accuracy. No independent GPS comparison was performed. Future unattended midnight recovery cannot be claimed as observed until a subsequent daily cycle occurs. Existing readiness/source/closure gates remain enforced; future source geometry failures may correctly block activation. Native recalibration's separate 122.56s research conflict is not part of this deployment.
