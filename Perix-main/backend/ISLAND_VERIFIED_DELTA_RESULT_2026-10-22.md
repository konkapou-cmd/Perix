# Island Verified Delta Result

Offline review only. Extended the existing validator and its tests; no importer,
application feed, traffic/matcher edit, web/API request, activation, commit or deploy.
Existing unrelated WIP was preserved.

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| Original observations | PASS | 342 unique: KTEL 17, municipal 88, Mykonos 237 |
| Actual manifest alias joins | PASS | 206/342: KTEL 17, municipal 68, Mykonos 121; 136 unmatched |
| Exception CSV | PASS | 342 rows, one per observation; required 10-column schema |
| Authoritative exact Mykonos joins | FAIL | 0/237; Ornos subset 0/42 |
| Authoritative geometry/trips | FAIL | All three drafts have empty trips, no canonical patterns, null stop coordinates and false approval flags |
| No promotion | PASS | All trip/stop/platform/pattern output ID columns blank; geometry/day-rule verification false |
| Ornos preservation | PASS | 42 independent original observations; 14 clock-only groups remain inactive; zero virtual trips |
| Date evidence | PASS | Exact 10 IDs, routes and departures: six L1 weekdays, four L3 weekdays |
| Printed header conflict | PASS | Additive evidence records 2025-10-07; original conflict fields and source files unchanged |
| October 2026 operation | UNKNOWN | All 10 weekday observations remain UNCONFIRMED, activation NO, resolved_valid_from null |
| No-delta behavior | PASS | Original selected L3 unresolved-date blocker unchanged |
| Source preservation | PASS | CLI integration hashes every focused-root/manifest input before and after, including rejected overwrite attempt |
| Synthetic web-observer GTFS | PASS | Explicitly excluded: example.invalid, fabricated IDs, unsupported daily calendars, false Ornos continuity |
| OSM evidence | PASS | Safe source refs retained only as unverified evidence; rejected Danakos node/1846917015 excluded |
| Tests | PASS | 27 passed, no skips, with external source/manifest/delta environment paths |

The CSV preserves source route ID/name, direction, origin, departure, day rule,
printed validity, URL and review flags in JSON evidence. Actual draft route labels
are joined through review_metadata.source_route_aliases. Draft stop labels/IDs are
explicit unverified agency inventories, not observation/platform assignments.
KTEL inventory is narrowed to served published labels, preserving shortened
observations (five anchors each) and excluding the ten not-served cells.
OSM station areas are not platforms, relations are not canonical patterns, and
Mykonos legacy MYK_DAILY services are never used. Original 160 published passages,
988 timeline rows, 31 route groups and four empty groups remain unchanged.

## Inventory

All repository paths below are relative to `Perix-main/`:

- Extended `backend/scripts/validate_island_review.py` with optional `date_evidence`, `--date-evidence`, `--exceptions-csv`.
- Extended `backend/tests/test_island_review.py` with real manifest joins, malformed delta, forged confirmations, export and preservation checks.
- Added `backend/data/review/PERIX_SYROS_10_DATE_EVIDENCE_DELTA_2026-10-22.csv` using apply_patch.
- Generated `backend/data/review/PERIX_ISLAND_REVIEW_EXCEPTIONS_2026-10-22.csv` using the validator CLI after verifying the parent directory.
- Added this result report.

Input roots (read-only):

- Focused source: `C:/Users/PC/Downloads/PERIX_OPENCODE_FOCUSED_RESTART_2026-10-22`.
- Actual reviewed manifests: `C:/Users/PC/Downloads/PERIX_OPENCODE_ISLAND_MAPPING_NEXT_STEP_2026-10-22/PERIX_3_CITY_MOBILITY_HANDOFF_2026-10-21/Perix-main/backend/data/operator_feeds`.
- Delta: `C:/Users/PC/Downloads/PERIX_NEXT_BLOCKERS_VERIFIED_DELTA_2026-10-22`, exactly the report and date CSV below; both read, neither modified.

Missing authoritative data: the three external `*_review_draft.json` files contain
no trips or canonical patterns; their stops are draft labels with null coordinates.
No authoritative physical stop/platform/pattern/trip file was supplied at these
paths. Operator-approved directional boarding assignments, current pattern geometry,
exact operator+route+direction+origin+departure+effective-period trip identity,
operating calendars/holidays and reuse approval remain missing. No substitute
authoritative path or ID was invented.

## SHA256

The date CSV is an ASCII semantic copy: text and CSV records are identical after
UTF-8 BOM removal and newline normalization. Original BOM/line-ending bytes were
not retained by apply_patch; both byte hashes are recorded. Greek text in other
source files was not rewritten.

| File | SHA256 |
| --- | --- |
| External PERIX_READ_ONLY_RESOLUTION_REPORT_2026-10-22.md | `0a76ee3cb1aff9b07261d250dea069624316eb5b131d4c6d8ed18b46f0c59539` |
| External PERIX_SYROS_10_DATE_EVIDENCE_DELTA_2026-10-22.csv | `d042e35a3545d14ecb5a7a643eb20ed38490c3fa921a369eb43d3051d3d67ade` |
| Local PERIX_SYROS_10_DATE_EVIDENCE_DELTA_2026-10-22.csv | `a1493bef9c67b7d525787921ee13565e7c2fcdcebb41366d68306baebf207843` |
| Generated PERIX_ISLAND_REVIEW_EXCEPTIONS_2026-10-22.csv | `6d7dcf2e0e76dbe0cc4f4c36db206c3500902da2a71e39fd3c3234f0fd1510ef` |
| FULL_342_DEPARTURES.csv | `042a454eb2285d6abac80429c8550a6a6b12a0b855a698ee964bad2ed532eb87` |
| FULL_988_BASELINE_TIMELINES.csv | `253f705f7940b721fe35c88305955f70295fb4899e46b9219c945af0c47188d6` |
| FULL_31_ROUTE_REVIEW.csv | `4f65cb5ceef43966031b79933c88a00de62fb651bdd18059733e3c178460e0e7` |
| PERIX_ISLAND_SCHEDULE_OBSERVATIONS_2026-10-22.json | `e94d93e9a1a6111ec00a5487a3b7a29f26468d85b678e30ddf2562ddf10ec595` |
| PERIX_ISLAND_OBSERVATION_GTFS_CROSSWALK_2026-10-22.json | `88ef32fe0dc2722e6a87132c41c19809e98df35a7f037ea52107ea1551f6080f` |
| syros_ktel_review_draft.json | `3fd7290e8f990b710937bcc57e4aa863d70737307dbc6884fcb0352c99f382f7` |
| syros_municipal_review_draft.json | `f6f35008703c0171e01cd5c3ad2674d0bfeabeb1de4ce9a40635f2c0061f227b` |
| mykonos_ktel_review_draft.json | `507354f43dc2573eec83584115a840a8198d319e1c2456767495f33deec401aa` |

Verification: `python -m pytest tests/test_island_review.py -q` from backend with
`PERIX_ISLAND_REVIEW_SOURCE`, `PERIX_ISLAND_REVIEW_MANIFESTS`, and
`PERIX_ISLAND_DATE_DELTA_SOURCE` set to the three roots above: **27 passed**.
`git diff --stat` was inspected: 26 tracked WIP files, 1518 insertions and 229
deletions, unrelated to this task. The validator/tests were already untracked;
this task's five files remain untracked and are not represented in that stat.

## Final Cross-Checks

- Combined offline mobility/island run with all three external paths supplied:
  `python -m pytest tests -q -k "mobility or island_review"`: **364 passed**,
  559 deselected, one third-party deprecation warning, no skipped checks.
- Frontend `node --test tests/google-locator-traffic.test.cjs`: **6 passed**.
- `git diff --check`: PASS. Existing tracked diff remains unchanged at
  26 files, +1518/-229. This turn extends two already-untracked validator/test
  files and adds four files: two review CSVs, this report, and
  `MAGDEBURG_VERIFIED_COMPARISON_2026-10-22.md`.
- Real Google traffic was not enabled. Combined tests ran with the backend and
  frontend feature flags false; adapter tests opt in only against mocked HTTP.
  No production, matcher, importer, adapter or motion-engine edit was needed.
- See `MAGDEBURG_VERIFIED_COMPARISON_2026-10-22.md` for the attributed 448/0
  supplied evidence, live public fingerprints, service-mapping uncertainty and
  missing archive checksum/deployed identity evidence. A stale advertised date
  is not proof of the actual matcher's date or the root cause of zero matches.
