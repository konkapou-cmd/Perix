# Island Validation And Staging Diagnosis

No feed activation, export, stop creation, production mutation, paid API call,
matcher change or traffic backend/frontend edit. Existing dirty WIP was left
untouched on branch `gmm-integration-review`. This report supplements, rather
than overwrites, `ISLAND_MAPPING_REVIEW_2026-10-22.md` and
`MOBILITY_TRAFFIC_STAGING.md`.

## Located Inputs

Repository searches found no FULL CSVs or operator draft manifests. Actual inputs:

- Research root: `C:/Users/PC/Downloads/PERIX_OPENCODE_FOCUSED_RESTART_2026-10-22/`
- That root contains `FULL_342_DEPARTURES.csv`, `FULL_988_BASELINE_TIMELINES.csv`,
  `FULL_31_ROUTE_REVIEW.csv`, source observations, crosswalk and
  `03_SELECTED_FILES_SHA256_MANIFEST.json`.
- Draft root: `C:/Users/PC/Downloads/PERIX_OPENCODE_ISLAND_MAPPING_NEXT_STEP_2026-10-22/PERIX_3_CITY_MOBILITY_HANDOFF_2026-10-21/Perix-main/backend/data/operator_feeds/`
- Drafts: `syros_ktel_review_draft.json`, `syros_municipal_review_draft.json`,
  `mykonos_ktel_review_draft.json`. These remain external review files, not
  installed application feeds.

The new `scripts/validate_island_review.py` reads these inputs without writes or
application/database imports and prints a JSON candidate artifact. It checks
five source checksums against the supplied checksum manifest, joins original
IDs/agency/route/direction/departure/day/origin against observations and crosswalk,
and compares published stop-name/sequence/time tuples exactly.
Checksum comparison establishes bundle consistency, not operator approval.

## Island Results

| Check | Proven result |
| --- | --- |
| Observation preservation | 342 unique IDs: 17 KTEL Syros, 88 municipal, 237 Mykonos |
| Timeline preservation | 988 rows; 160 exact published passages, 828 internal assumptions |
| Exclusions | 10 explicit not-served source cells; none promoted to published passages |
| Selected Syros routes | `SYR_KTEL_L3_WD`, `SYR_KTEL_L1_WE`, `SYR_KTEL_L3_WE` |
| Selected Syros coverage | 11 departures / 105 unchanged published anchors |
| Mykonos three-column family | 42 independent observations, 14 in each FROM column |
| Candidate relationship | 14 clock-only groups at +10/+15 minutes; no trip/vehicle continuity asserted |
| Mykonos calendar | All 237 source day rules remain `UNSPECIFIED`; simulation all-days is not adopted |
| Empty groups | Kalafatis, Kalo Livadi, Panormos, other-provider Super Paradise inactive |
| Three external drafts | All approval flags false, trips empty, active stop coordinates null |

The JSON report's `selected_syros_pending_anchors` contains all 105 unchanged
published anchors: 35 for `SYR_KTEL_L3_WD`, 40 for `SYR_KTEL_L1_WE`, and 30 for
`SYR_KTEL_L3_WE`. Each record preserves `observation_id`, `route_id`,
`stop_sequence`, `stop_label` and `published_time` (from CSV `baseline_time`).
Both `verified_stop_id` and `verified_pattern_id` are null, with
`approval_status=PENDING_STOP_GEOMETRY_JOIN`.

`selected_syros_date_blockers` explicitly blocks public activation of
`SYR_KTEL_L3_WD`: the source states `CONFLICT:2025-10-07_vs_2026-10-07`.
`resolved_valid_from` remains null; neither year is adopted or invented.

The clock-only candidate groups below refer to existing source observation IDs
under `MYK_FAB_ORNOS_AGIO`, not newly created trips or stops. The emitted JSON
contains all three full observation IDs for each row and all 342 preserved IDs.

| FROM_FABRIKA | FROM_ORNOS (+10) | FROM_AGIO (+15) | Active |
| --- | --- | --- | --- |
| 07:15 | 07:25 | 07:30 | false |
| 09:30 | 09:40 | 09:45 | false |
| 10:30 | 10:40 | 10:45 | false |
| 11:30 | 11:40 | 11:45 | false |
| 12:30 | 12:40 | 12:45 | false |
| 13:30 | 13:40 | 13:45 | false |
| 14:30 | 14:40 | 14:45 | false |
| 15:30 | 15:40 | 15:45 | false |
| 16:30 | 16:40 | 16:45 | false |
| 17:30 | 17:40 | 17:45 | false |
| 18:30 | 18:40 | 18:45 | false |
| 19:30 | 19:40 | 19:45 | false |
| 20:30 | 20:40 | 20:45 | false |
| 21:30 | 21:40 | 21:45 | false |

All patterns remain blocked for activation: direction-specific platforms,
canonical geometry, operator rights and calendars are not established by these
CSV checks. No coarse assumed waypoint becomes a boarding stop or GTFS stop ID.

## Magdeburg Evidence

Public read-only GET samples on 2026-10-22, beginning 06:08 UTC, from
`https://backend-staging-staging-7ada.up.railway.app`:

| Endpoint | Observed result |
| --- | --- |
| `/api/version` | `net_edd91342e6bf`, OSM `1792610160`, geometry revision 7; git SHA/build time empty |
| `/api/mobility/v2/diagnostic/region` | Magdeburg, `de-magdeburg-mvb`, Europe/Berlin, 04:00 service-day start, national GTFS and GTFS-RT sources |
| `/api/mobility/network` | Imported `2026-10-20T10:40:13.904816+00:00`; 34 routes / 3778 trips; route agency IDs absent |
| `/api/mobility/v2/diagnostic/generations` | ACTIVE_READY, 159/159 present; 75 current / 84 stale OSM snapshots, none missing |
| `/api/mobility/v2/diagnostic/geometry-conformance` | 159/159 rendered canonical OSM, zero render mismatches; not independent real-route validation |
| `/api/mobility/v2/diagnostic/motion/summary` | At `06:08:40.836603Z`: 94 estimated, 74 physics (78.72%), 17 limited; zero reported legacy fallbacks |

The 20 estimated vehicles without a reported physics model are not explained by
the summary's empty fallback counters. Do not call them generation mismatches
without per-vehicle evidence. Snapshot counts can change between requests.

Trip `1318114`, route 3, pattern `3:f78ca81061`, has an available explanation:
leg `20996` (Verkehrsbetriebe) -> `223419` (Hbf / Willy-Brandt-Platz) is
5957.391 m, scheduled/predicted 120 s, fastest/natural/effective 681.958 s.
The schedule implies 178.72 km/h averaged over that canonical leg. Its initial
target miss is 561.958 s. Downstream lateness is carried and partially recovered:
the report ends 252.710 s late after recovering 309.248 s. Signal hold time is
zero and traffic-profile coverage is zero for this tram report. The response
has null realtime source and service date.

This proves incompatibility between the deployed canonical leg and timetable.
It does NOT establish whether the underlying fault is path detour, stop-progress
assignment, timetable data or another geometry/timing error. The automated
`TURN_MODEL_HYPOTHESIS` is a hypothesis, not a verified cause. Canonical OSM
conformance alone does not prove the selected street/track sequence is correct.

## Realtime Blockers

`railway status --json` failed with expired OAuth (`invalid_grant`, Unauthorized).
No variables, secrets, logs, deployment IDs or database records were retrieved.
No login, deployment or environment update was attempted.

The handoff readiness document records an older sample with production matched
262 and staging matched 0, rejected `WRONG_START_DATE=262`. Those are historical
claims, not fresh independently verified log evidence. The local
`utils/mobility_workers.py:_realtime_worker` checks trip-ID membership only and
does not contain `WRONG_START_DATE` or `UNKNOWN_OR_DUPLICATE_TRIP`; neither code
was found in repository Python sources. Its log does not prove MVB-only/date
matching. Empty deployed git SHA/build time prevents revision reconciliation.

Needed for a proven date-rejection diagnosis: authorized read-only staging and
production deployment revisions/logs, active static service dates and MVB agency
inventory, and matching GTFS-RT header timestamps/trip descriptor start dates
from the same sample. Do not infer a timezone bug or relax the matcher.

| Acceptance | Result |
| --- | --- |
| Static network present | PASS for presence; current service-date/MVB-only validity UNKNOWN |
| Actual MVB-only realtime matching | UNKNOWN; logs and agency/date evidence unavailable |
| Canonical rendering | PASS for endpoint conformance; 84 stale snapshots remain |
| Physical/live position accuracy | UNKNOWN; sampled fleet explicitly estimated |
| Timing compatibility | FAIL for the documented trip leg |
| Cross-consumer ETA agreement / traffic isolation | UNKNOWN remotely; not exercised in this task |
| Stale-feed handling / staging release | UNKNOWN / BLOCKED; no production sign-off |

## Verification

- Supplied `python validate_full_network_package.py`: PASS, 342 departures,
  31 groups, 988 baseline rows, 2964 scenario rows, 14/18 direction-day references.
- New validator with explicit research and manifest paths: PASS, including draft
  safety checks and 14 inactive clock-relation groups.
- `PERIX_ISLAND_REVIEW_SOURCE` set to the research root, then
  `python -m pytest tests/test_island_review.py -q`: 7 passed after adding
  exact anchor-field, per-route coverage and unresolved date-blocker assertions.
- Combined island, existing motion-diagnostics and region suites: 12 passed
  (`tests/test_island_review.py`, `tests/test_mobility_motion_diagnostics.py`,
  `tests/test_mobility_regions.py`). Whitespace checks passed for all three new files.
- Tests are offline. Bundle-dependent tests skip explicitly when its environment
  path is not supplied; no absolute local research path is hardcoded in tests.
