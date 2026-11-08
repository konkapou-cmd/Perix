# Raw SIRI matching and INSA comparison — 2026-11-05

User authorized testing the raw Sachsen-Anhalt SIRI feed against the existing
GTFS and then official INSA. Read-only tool: `tools/siri_trial.py`; contracts:
`tests/test_siri_trial.py`. No production ingestion, marker/engine update or
third-party prediction/position engine is wired.

Evidence root:
`C:\Users\PC\AppData\Local\Temp\opencode\perix-siri-trial-20261105-v1`.
Its `report.md`, `validated-comparison.json`, raw XML/INSA JSON and manifest contain
the detailed sampling/matching rules, failures and licence boundaries.

## Terminology / date correction

`source_frame_ref` is preserved exactly from SIRI DataFrameRef; it is **not
automatically a GTFS service_date**. `gtfs_service_date` is determined only by
complete source stop order and all available absolute AimedTimes matching one
activated GTFS version/date. True 24+ GTFS times remain 24+, without modulo wrap.
Comparing only FrameRef04 against GTFS04 initially yielded no time matches;
absolute planned timestamps showed valid candidates in GTFS05. No source date
or clock was overwritten. Current and retained GTFS remain independent namespaces.

`LEGACY_MINUTES` means the GTFS original seconds are not certified. Unique
minute-level route/time candidates can support a clearly labeled source-API time
comparison but are NOT accepted to update a marker. `eligible_for_marker_trial`
requires the additional exact-second/clock/readiness gates and still is not an
authorization to ingest or deploy.

## Actual results

Initial raw snapshot: 42 MVB records, 14 unique minute candidates, 3 timely/monitored
unique candidates at its actual capture instant. Final paired snapshot:
**29 records / 10 unique minute candidates / 2 timely reference candidates /
0 marker-trial acceptance**. These are records/candidates, not counts of verified
simultaneously active vehicles. No GTFS-ID crosswalk from a nearest-time guess.

Official INSA references for three consecutive N6 stops at
**01:01:38.883–01:01:39.173 UTC**, source comparison instant **01:01:40.866 UTC**.
120 raw entries normalized successfully. Four departure value groups from two
provisional N6 journeys compared; differences SIRI minus INSA:

- Rennetal 02:11:43 vs 02:13:00 CET: **-77 s**.
- Albert-Vater-Str. 02:12:43 vs 02:14:00: **-77 s**.
- Harsdorfer Str. 02:13:43 vs 02:15:00: **-77 s**.
- Another Harsdorfer departure 02:02:41 vs 02:01:00: **+101 s**.

INSA has two distinct journey refs for each shared event/time/direction, with
different full-trip endpoints/indices. Only unanimous time values are compared
as `TIME_CONSENSUS_REFERENCE_ID_AMBIGUOUS`; no journey ID is arbitrarily chosen.
Thus **4 time-value comparisons / 0 within 60 s / 0 unique INSA journey-ID matches**.
60 s is a reporting threshold, not source/calibration gate widening. Forecasts
that are much earlier than timetable also appear in INSA; no automatic hour or
fixed-77-second correction. Root cause of the differences is not established.

An intermediate snapshot exceeded document freshness and was rejected. Initial
browser time-filter escaping bug produced an unusable empty export; final raw
JSON plus tested Python normalizer replaced it, not a claim that INSA had no data.
Tests cover duplicate/conflicting references, exact offset/date/24h decoding,
activation/readiness, trip-vs-document clocks, full stop order/visit identity,
platform overlaps and no input mutation. No interpolation/prediction is added.

## Validation / release boundary

**322 selected offline backend tests passed / 1 skipped**, including 19 new SIRI
cases. No broad database suite. Positive synthetic fixtures are not live proof.
Frozen v11 remains unchanged, source SHA
`de1cbbb2bace398e32b69cf13440cd057b232de2c4ae64f94ec367972936b301`.
No frontend edits, provider-setting changes, active adapter, push/deployment,
database writes/restarts/restores, registrations or provider contacts.

Do not claim whole-MVB/whole-day INSA equivalence, absolute-second readiness,
GPS/heading/Am-Fuchsberg resolution, hosted performance or production recovery.
Further validation needs source GTFS-second fidelity, reference/trip semantics,
and more lines/times. Mirror cadence (~5min) can fall outside the unchanged 180s
source bound; capture age does not refresh the source document/trip clock.
