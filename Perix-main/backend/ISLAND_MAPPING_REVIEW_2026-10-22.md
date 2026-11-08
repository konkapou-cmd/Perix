# Island Mapping Review

Status: research and draft metadata only. No approved GTFS, exports, activation,
production changes, Google calls, builder changes, or motion-engine changes.

## Edited Files

Only review_metadata was added to the three existing manifests under:

`C:/Users/PC/Downloads/PERIX_OPENCODE_ISLAND_MAPPING_NEXT_STEP_2026-10-22/PERIX_3_CITY_MOBILITY_HANDOFF_2026-10-21/Perix-main/backend/data/operator_feeds/`

- syros_ktel_review_draft.json
- syros_municipal_review_draft.json
- mykonos_ktel_review_draft.json

These are external bundle files, not installed application manifests. The
original ZIP and supplied crosswalk remain unchanged. Removing review_metadata
from each edited manifest reproduces its original parsed JSON exactly. All
approval flags remain false, active stop coordinates null and trips empty.
The sole repository addition in this mapping task is this review document.

## Crosswalk Coverage

342 unique observations agree with the source registry: 17 Syros KTEL, 88
municipal, 237 Mykonos. Syros has 160 served passage anchors and 10 explicit
not-served cells. No clock values or departures were inferred.

Existing route labels support 189 additional candidate aliases, not validated
patterns or trips: 68 municipal A/B weekday/Saturday observations and 121
Mykonos observations on five existing draft routes. With 17 existing KTEL
aliases, coverage is 206/342; 136 still lack an existing draft route alias.
Mykonos FROM columns remain independent departures. Saturday municipal aliases
do not inherit the weekday-only service. The research seven-bit weekday mask
must be converted to the builder's zero-based weekday indices, never copied.

## Syros KTEL Stop Candidates

Source: bounded public Overpass transport-feature query, retrieved 2026-10-22.
Returned OSM base timestamp: 2026-07-28T02:16:18Z. This is older mapping evidence,
not a current operator boarding survey. Coordinates below are latitude,
longitude. Each node is inspectable at https://www.openstreetmap.org/node/ID.

| Draft ID | OSM candidates | Result |
| --- | --- | --- |
| SYR_ERMO_START | None confidently matched | Unresolved |
| SYR_KINI | 13597767508: 37.4461613, 24.9003572 | Named platform; direction unverified |
| SYR_DANAKOS | None confidently matched | Unresolved |
| SYR_GALISSAS | 5848129300: 37.4212829, 24.8788613; 2684073144: 37.4201350, 24.8793297; 2684074189: 37.4187434, 24.8834773 | Multiple stops; anchor unresolved |
| SYR_FINIKAS | 3429464178: 37.3974929, 24.8813690; 3429464180: 37.3982685, 24.8778070; 3429464184: 37.4024704, 24.8820556 | Numbered stops are not directions |
| SYR_POSEIDONIA | 3429464179: 37.3854010, 24.8934749; 3429464181: 37.3874938, 24.8921520; 3429464177: 37.3889647, 24.8904172; 3429464185: 37.3894080, 24.8879275 | Multiple stops; anchor unresolved |
| SYR_MEGA_GIALOS | 3390881227: 37.3786710, 24.9084124; 3429415342: 37.3787945, 24.9084193 | Separate nodes; direction assignment unknown |
| SYR_VARI | 2688618081: 37.3910503, 24.9442368 | local_ref match; direction unverified |
| SYR_AZOLIMNOS | 9932638261: 37.4121525, 24.9582329 | Named stop; direction unverified |
| SYR_ERMO_END | None confidently matched | Do not equate with departure platform |

No candidate is an operator-issued stop code or operator-confirmed platform.
Municipal terminal 2942365157 is not substituted for the KTEL terminal.

### Shortened Trips

- SYR_KTEL_L1_WD-loop-1200-01: five published anchors, last Finikas 12:40.
  Exclude Poseidonia, Megas Gialos, Vari, Azolimnos and Ermoupoli terminus.
- SYR_KTEL_L3_WD-loop-1230-01: five published anchors, last Poseidonia 13:00.
  Exclude Finikas, Galissas, Danakos, Kini and Ermoupoli terminus.

These are last published served points, not independently confirmed operational
turnaround locations. No arrival at an excluded stop is manufactured.

## Municipal Direction Evidence

OSM relation 4594447 records Sports Centre -> Port -> Doxa; relation 4594448
records the reverse. Relation membership is mapping evidence, not confirmation
of current operation. Both use the older snapshot above.

| Draft ID | Candidate platform | Relation association |
| --- | --- | --- |
| SYR_SPORT_CENTER | 2942365157: 37.4304268, 24.9366594 | Both directions |
| SYR_DOXA | 2973106502: 37.4505443, 24.9474316 | Both directions |
| SYR_PORT | 3350617816: 37.4414110, 24.9413887 | Reverse relation only; do not assume outbound platform |
| SYR_AGORA | 2973106492: 37.4424084, 24.9424571 | Reverse relation only; not proof for neighbourhood services |
| SYR_ANO_SYROS | None selected | Area/service family, not a unique boarding point |

Primary municipal timetable images:

- https://www.syros-ermoupolis.gr/wp-content/uploads/2026/07/Χειμερινά-Δρομολόγια-07092026_001-1.jpg
- https://www.syros-ermoupolis.gr/wp-content/uploads/2026/07/Χειμερινά-Δρομολόγια-07092026_002-1.jpg

Direct image reinspection confirms 07:20 excludes Saturday; 08:00 has no Saturday
exclusion; the 18:15 substitution is 17:30 Tuesday/Thursday only. Earlier research
misread the page-break annotation; those are not outstanding source conflicts.
The 14:20 double-service vehicle count, exact neighbourhood patterns and Anastasi
exceptions still need review. Port intermediate departure times are unpublished.

## Mykonos Evidence

Official source: https://mykonosbus.com/language/el/dromologia/ . All 237
observations still lack confirmed service weekdays. MYK_DAILY in the legacy draft
is explicitly marked unsupported; it must not be used to create daily trips.

| Draft ID | OSM reference | Result |
| --- | --- | --- |
| MYK_FABRIKA | way/736284303 | Station polygon only; no centroid used as boarding coordinates |
| MYK_AIRPORT | node/5891710721: 37.4344913, 25.3456335 | Unnamed airport-location candidate |
| MYK_OLD_PORT | node/6534142968: 37.4508723, 25.3287240 | Named platform candidate |
| MYK_NEW_PORT | node/5891717523: 37.4648107, 25.3232076 | Named platform candidate |

Airport information independently describes the stop outside Arrivals:
https://www.jmk-airport.gr/en/category-detailed/ctg_id-397/nd_id-1248 . It does not
endorse an OSM ID. Route-specific boarding assignments remain unverified.
Other draft stops retain empty candidate lists rather than settlement coordinates.

## Remaining Uncertainties Only

### Follow-Up: Classified Unmatched Observations

All 136 previously unmatched observations are now classified, but none is a
supported additional alias to an existing draft route. Supported alias coverage
remains 206/342; classification coverage is 342/342. No route collections or
trips were added. Nine missing draft families account for 14 source route IDs.

| Missing draft family | Observations | Evidence and confidence |
| --- | ---: | --- |
| Mykonos Old Port - Agios Stefanos | 22 | Official timetable heading; high family-label confidence |
| Mykonos Old Port - New Port | 22 | Official timetable heading; not Fabrika - New Port |
| Mykonos Old Port - Elia | 6 | Official heading; New Peripheral location and return-time conflict remain |
| Mykonos Fabrika - Paradise | 28 | Official heading; distinct from other-provider Super Paradise |
| Mykonos Airport - New Port | 16 | Official heading; October/December effective-date conflict remains |
| Mykonos Fabrika - Paraga | 22 | Official timetable heading; high family-label confidence |
| Municipal Vrontados / Neapoli variants | 13 | Primary timetable; family grouping medium confidence, exact paths unresolved |
| Municipal Karnagio / Kaminia loop | 1 | Primary timetable; high family-label confidence |
| Municipal Ano Syros day/evening variants | 6 | Same published route family, different weekly rules |

Mykonos source: https://mykonosbus.com/language/el/dromologia/ . Neither that
page, the English timetable nor the official news/destination pages checked
establish operating weekdays or public-holiday rules. All 237 observations
remain calendar-blocked. Printed FROM columns are independent departures.

The two official municipal images above reconcile all 88 observations:
68 A/B clock entries + 13 neighbourhood base entries + one Tuesday/Thursday
substitute time + six Ano Syros entries. This is not a daily trip count.
Relations 4594447/4594448 support only the A/B corridor; no neighbourhood
variant was assigned to those relations merely because they share Agora.

### Follow-Up: Ermoupoli Station Evidence

Newer OSM query base timestamp: 2026-10-22T01:38:36Z.

- https://www.openstreetmap.org/node/3578181775 : 37.4397002, 24.9400984,
  named Central Bus Station KTEL, tagged station/bus_station and KTEL operator;
  object last edited 2026-04-05. This is a station-level identification, not
  a departure bay or proof that start and terminus use the same platform.
- https://www.openstreetmap.org/way/299227982 : corroborating KTEL station
  footprint. No polygon centre was adopted as boarding coordinates.
- Danakos node/1846917015 is tagged place=hamlet, not a bus stop. Its location
  was explicitly rejected as a boarding-point substitute.
- Galissas adds platform candidates node/2706030001 (37.4224083, 24.8843749)
  and node/3429462828 (37.4202303, 24.8820612). More nearby candidates do not
  resolve the timetable anchor or its direction.

### Follow-Up: Publication Gates And Dry Run

Syros KTEL https://ktelsyrou.gr/terms-of-use/ describes personal use and written
consent for wider reuse, subject to applicable law. Municipal terms at
https://www.syros-ermoupolis.gr/oroi-xrhshs/ likewise do not provide an open
commercial dataset licence. No affirmative Mykonos timetable reuse licence was
found. These are source statements, not a legal opinion or invented approval.

| Agency | Published route evidence | Departure observations | Mapped locations | Estimated intermediate times | GTFS validation |
| --- | --- | ---: | --- | ---: | --- |
| Syros KTEL | Lines 1/3 and shortened patterns; weekday year unresolved | 17 | 7/10 names have stop candidates; additional Ermoupoli station-area reference | 0; 160 published passages preserved | BLOCKED |
| Syros municipal | A/B plus three neighbourhood families; primary weekly rules | 88 | Four platform candidates; A/B relation associations only | 0; no invented intermediate clocks | BLOCKED |
| Mykonos KTEL | Eleven families with observations; no verified daily calendar | 237 | Three platform/location candidates plus Fabrika station area | 0; FROM columns not paired | BLOCKED |

Verified published headings/departures are not verified operating trips or
direction-specific geometry. Existing builder checks were rerun without export:
13 unit tests passed; all three drafts remain BLOCKED at manual approval.
No validation gates were weakened. Only review_metadata changed in the external
manifests; builder, ZIP, supplied observations and crosswalk remain unchanged.

1. Operator reuse rights/approval for all three datasets. OSM evidence is
   attributed to OpenStreetMap contributors under ODbL; it does not license
   operator timetable content: https://www.openstreetmap.org/copyright .
2. Exact KTEL Ermoupoli start/end and Danakos stops; direction-specific boarding
   and selection among multiple KTEL candidates elsewhere.
3. Syros weekday 2025/2026 discrepancy, verified school calendar, holiday
   exceptions, and shortened-trip operational termini.
4. Mini Bus neighbourhood intermediate stops, directions and times; Anastasi
   footnotes and 14:20 actual multiplicity. Passage-time arrival/departure policy.
5. Mykonos weekdays/holidays, New Peripheral boarding point, EN/EL date/time
   conflicts, Ornos three-column interpretation and actual fleet continuity.
6. Official end dates are unstated. Legacy seven-day bounds are internal review
   horizons, not official expiry. Blank routes and other-provider Super Paradise
   cannot be promoted to KTEL services.

## Checks

- Existing builder unittest suite: 13 passed; no replacement builder created.
- Three draft --check executions: expected BLOCKED at manual approval gate.
- Crosswalk/reference checks: 342 unique observations, 160 served anchors,
  10 excluded cells, candidate aliases 206/342.
- Original ZIP, crosswalk and builder unchanged; no apply_three_city_patch.py
  execution, GTFS export, Railway change or paid API call.
