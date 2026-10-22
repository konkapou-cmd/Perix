# Provisional Island Base

The local dated Moovit reference is the provisional stop-order base, not a live
feed or an operator-approved timetable. The compiler runs entirely offline and
does not import, activate, route vehicles, fetch Google traffic or change a DB.

## Local Output

Generated files in `data/review/` (intentionally ignored by Git):

- `ISLAND_PROVISIONAL_STOP_TIMES_2026-10-22.csv`: every available reference stop
  occurrence, previous-leg seconds, cumulative seconds, method and confidence.
- `ISLAND_PROVISIONAL_SCHEDULE_2026-10-22.json`: the same preview plus original
  observations, original baseline rows, source hashes, joins and uncertainties.

| Island | Reference variants | Stop occurrences | Estimated legs |
| --- | --- | --- | --- |
| Syros | 9 | 234 | 225 |
| Mykonos | 18 | 77 | 59 |
| Total | 27 | 311 | 284 |

All 284 legs have a provisional arithmetic duration: 72 interpolations between
named timetable anchors, 124 route/span-calibrated fallback estimates and 88
same-agency cross-variant median-per-stop priors. None is measured travel time.
The original evidence-only result remains separately available: 10 variants
and 88 legs have insufficient own timing evidence. Seconds express arithmetic,
not sub-minute prediction accuracy. Uniform-per-stop priors do not account for
unequal road distances and must not be mistaken for road-accurate ETA.

The original 342 observations and 988 timeline rows remain unchanged. Only 23
observations align provisionally to a reference's origin and named stop order;
319 remain unmatched. This is not a claim that the preview covers all actual
services on either island. Every repeated stop is a separate reference
occurrence, not a newly invented physical stop.

The 42 Fabrika/Ornos/Agios Ioannis observations remain three independent columns.
Their 14 clock relationships do not create trips or identify vehicles. Unknown
calendars remain unknown in the evidence. An all-days internal preview policy
is recorded separately, not applied as an operational calendar. Printed Syros
2025/2026 evidence remains intact; choosing a preview does not prove a typo.

## Reproduce

From backend, set paths to the existing research root and reviewed manifests.
The research root must contain its original checksum manifest and FULL CSVs.

```powershell
python scripts/validate_island_review.py "$researchRoot" --manifests "$manifestRoot" --date-evidence "data/review/PERIX_SYROS_10_DATE_EVIDENCE_DELTA_2026-10-22.csv" --provisional-schedule "data/review/ISLAND_PROVISIONAL_SCHEDULE_2026-10-22.json" --provisional-stop-times "data/review/ISLAND_PROVISIONAL_STOP_TIMES_2026-10-22.csv"
```

Original inputs are checksum-verified and cannot be overwritten by export paths.
No external research datasets are bundled with this code. Availability and
reuse of those datasets are independent of the compiler implementation.

## Runtime Boundary

This is a usable local schedule preview, not a completed live island release.
Physical coordinates, direction-specific pattern geometry and many departure
joins are still absent. The compiler intentionally leaves physical stop IDs and
coordinates blank. Existing synthetic GTFS ZIPs are not activation inputs: the
Mykonos archive includes reversed clocks and unsupported column pairings.

The existing importer has separate local improvements for cross-agency route
collisions and occurrence-specific stop times. These reuse the existing network
and motion pipeline, rather than introducing another importer or engine.

Deployment was attempted only as a Railway status check; OAuth is expired.
No island network, calendar, Google polling or runtime region was activated.
