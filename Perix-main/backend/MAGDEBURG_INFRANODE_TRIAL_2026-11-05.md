# InfraNode read-only adapter trial — 2026-11-05

This is the user-authorized trial for feeding **PERIX-owned** markers later.
It is not an active provider adapter, production feed replacement or new motion
engine. Existing source identity/freshness helpers are reused. No routes, GTFS
imports, geometry, bus/tram profiles, animations or production settings changed.

## Files

- `tools/capture_infranode_trial.py`: finite public capture, fixed InfraNode host,
  up to four explicitly selected Magdeburg stops, no loop/retries or trip-detail
  scans, 20-second timeout and 4-MiB response cap.
- `tools/infranode_trial.py`: offline matching/evidence report from supplied JSON.
  No database imports/writes or source HTTP requests. `accepted_for_comparison`
  is NOT authorization to update a marker or store realtime anchors.
- `tests/test_infranode_trial.py`: synthetic contracts for acceptance/rejection,
  source clocks, scope, exact signature matching and INSA-reference comparison.

## Inputs and gates

1. A source-only snapshot of the activated GTFS: region/network/version/service
   date, trip IDs, original occurrence sequences, canonical source clocks.
2. **Operator-reviewed, date/version-scoped** platform/route/trip bindings.
   Bindings are trusted diagnostic inputs, never accepted from an API response.
   No foreign trip mapping is created by line number, current time or closest ETA.
3. Captured API envelopes. Source observations, explicitly supplied feed generation
   and available per-trip clocks stay distinct. `retrieved_at`/HTTP Date/absolute
   arrival time are never promoted to source generation.
4. Optional INSA reference records, with the same region/network/version/date/
   trip/platform/occurrence and a capture <=30 seconds old. Explicit arrival and
   departure delays/epochs compare separately; no new prediction is generated.

Foreign trip matching needs a reviewed dated ID crosswalk OR a unique complete
ordered stop signature + exact second-preserved start/date. Even an identified
trip must pass existing route/direction/occurrence/activation/freshness checks.
Same-ID shortcut requires a reviewed SAME_GTFS_ARCHIVE namespace and matching
static archive hash; coincident numeric IDs do not prove identity.

The trial currently requires source fields that the inspected InfraNode response
does NOT supply: date/complete identity, explicit feed generation and operational
trip/stop status. They are tested with clearly synthetic complete fixtures, not
injected into actual captured records. Generic `delay_s` remains diagnostic when
its arrival/departure basis is unknown. Zero/null event epochs remain unknown.
Cancellations/deletions/SKIPPED/NO_DATA retain their semantics and cannot create
a timed departure. Empty/error/unsupported responses do not cancel trips.

## Actual first run

Evidence root:
`C:\Users\PC\AppData\Local\Temp\opencode\perix-infranode-trial-20261105-v1`.

Read-only production GTFS capture: active **net_7685302f3394 / 2026-11-05**,
32 routes / 2,813 trips. Four platform coordinate/name bindings rechecked against
the activated GTFS; **zero** trip-ID crosswalk entries created. No private user
collections or connection strings exported.

Public capture: **2026-11-04T23:33:38Z = 2026-11-05 00:33:38 CET**, two selected
Hasselbachplatz platform queries (::03/C and ::04/A), both HTTP 200. Five rows
(four distinct source trip IDs); **0 accepted / 5 rejected / 0 INSA comparisons**.
They contain nighttime line labels, but missing source dates prevent assigning
them to today's versus previous-day service. Four lack a stop sequence; the fifth
has eight daily GTFS candidates. No current-wall-time selection was attempted.

All five lack source observation/feed generation, verified trip identity and
operational status. Physical query-platform mapping alone is not a verified
per-trip stop update. The vendor's published parent-index/representative-delay
fallback explains why a requested platform can return rows without exact stop
evidence; its deployed code identity is not certified by that source review.

The initial and final reports are preserved separately. No rejected value was
copied into provider clocks, arrivals or markers. With no eligible records, live
INSA agreement cannot be measured. Synthetic INSA fixtures test the comparator
only; they do not count as live INSA matches.

## Validation

Full selected offline backend regression: **303 passed / 1 skipped**. Includes
56 new trial cases plus existing station-cycle/fractional and source contracts.
Python compilation passed without bytecode writes. The connection guard blocks
external access and the configured port-1 database; Windows asyncio's internal
loopback socketpair is allowed. No database-dependent broad suite was run.

Frozen v11 source was rehashed and remains unchanged:
`de1cbbb2bace398e32b69cf13440cd057b232de2c4ae64f94ec367972936b301`.
No frontend changes, push, deployment or production provider-setting changes.

## Offline command

```powershell
python -B tools/infranode_trial.py --network "<evidence>\network.json" --bindings "<evidence>\bindings.json" --capture "<evidence>\capture.json" --output "<new-output>.json"
```

Use `--reference <reviewed-INSA-reference>.json` only with verified full-scope
records. `--now-epoch` is for controlled offline fixtures, never live freshness
evidence. Input/output/source hashes make the trial reproducible; output files
use exclusive creation and cannot overwrite prior evidence.

## Release boundary

These tools remain local validation support, outside the frozen release and
unwired to production ingestion. A positive trial would still need real INSA
validation, source-access/licence review and existing atomic ingestion/CAS gates
before any production activation. The observed 0/5 result does not justify a
provider switch or freshness/identity relaxation.
