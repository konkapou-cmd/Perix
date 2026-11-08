# Neighbour-constrained timing and coherent fallback

## Current production — 2026-10-25

**Live at https://app.perix.eu** on deployment
`d91ff576-492d-45e8-a388-c2b00d0746c6` — **SUCCESS**. All 274 runtime backend
hashes and served frontend/map hashes match the verified production artifact.
Paid routing remains disabled; shared WIP and origin/account preferences were
not modified. The previous release is retained as the frozen rollback.

See [production release evidence](production-d91ff576/README.md) for the exact
artifact, concurrent bus/tram consistency checks, browser coverage and limitations.
The staging/candidate notes below are the historical pre-promotion snapshot.

## Scope / release state

This is a new isolated candidate forked from validated sparse-realtime staging
deployment `1e740d85-ca19-4d51-a913-62dd20fc4e6c`. The parent candidate, its frozen
upload and existing evidence are preserved. Shared backend/frontend WIP is not
overwritten. Production baseline remains `92095c5c-033d-45b8-b358-3bd2fd4abcac`.
Missing deployment/runtime/served evidence files mean a release gate is pending,
not that it passed. This workflow contains no production deployment command.

Staging deployment `41bc15ee-d2e2-4c1c-9a99-e390b5add33e` is **SUCCESS**.
All 274 expected runtime backend files match the 277-file frozen upload; served
frontend entry and map HTML hashes match. Production was reverified unchanged
(264 matching runtime files), with paid routing disabled.

Final local validation passed **114 backend / 92 frontend tests**, focused lint,
and zero new TypeScript errors against the five-error baseline. A further 120
deterministic synthetic scenarios / 1,200 bus/tram time samples preserved provider
clocks, position/ETA constraints and generic speed caps. These are consistency
tests, not measured real-world vehicle accuracy.

The 24 new neighbour/fallback cases were also executed in a separate staging
Python 3.11.17 process. Pytest is intentionally absent from the runtime image;
the check extracted the undecorated test functions and ran their parameter cases
with standard-library patch isolation. No package was installed, no application
worker was modified, and the process used a nonresponsive local Mongo URL.
This is a runtime compatibility check, not a claim that the entire pytest suite
ran inside the deployed container.

Read-only staging HTTP checks sampled 44 virtual records: 39 moving records with
timing evidence and five unchanged schedule anchors without it. A later basis
probe sampled 47 records, including 12 with `BETWEEN_STOP_UPDATES`; all 41 moving
records in that probe used detailed physics, so no actual live fallback was
observed. No GPS record was present. Cold HTTP fleet/detail latency was about
6.47/2.80 seconds including network/startup; there is no load-test or production
latency-improvement claim.

Browser DOM checks selected actual bus 51 trip `1201915`, service date
`2026-10-25`, and rendered both source anchors (Arenen → Hbf / Willy-Brandt-Platz),
unknown trip-update time, `RT-derived` intermediate clocks and the explicit
destination's `Provider` caption. The overview showed exactly 45 choices for 45
source IDs in a sheet below top controls and above attribution. Marker scales
and exact source selection were retained across zoom changes. Screenshot capture
was unavailable because the desktop browser window was not visible; pixel
verification is **not** claimed. Live correction, fallback and GPS behavior are
covered by the explicitly scoped offline regressions, not live observation here.

## What changed

### Previous and following source stop constraints

The timeline retains explicit provider arrival and departure clocks. Missing
intermediate stop clocks can now be constrained by the previous usable source
departure and the next usable source arrival. This happens before chronological
ordering checks, so an old inferred intermediate clock cannot incorrectly force
a perfectly usable later provider clock forward.

This is deliberately **not a blind average or an allocation of all downstream
lateness to earlier stops**. A downstream delay could occur after an intermediate
stop. Earlier downstream constraints can bound carried delay using relative
scheduled elapsed time; a later downstream constraint does not, by itself, move
missing upstream stops later. The immediately upcoming stop's actual timing
target is fitted by the existing motion engine in both cases.

`BETWEEN_STOP_UPDATES` means source-constrained inference, never a provider
observation at the missing stop. Evidence contains both anchor stop IDs and
original occurrence sequences where available. NO_DATA breaks the constraint
chain; skips are not observations or dwell anchors. Departure-only updates are
not silently turned into direct arrival observations. Contradictory provider
clocks remain raw and explicitly flagged; no averaging hides them.

### Removal of the old forward-crawl fallback

The previous fallback could keep increasing progress even after a source timing
revision moved its target behind the displayed marker. That branch and its
`_adaptive_forward_progress` state were removed.

When detailed infrastructure/physics cannot be used, the fallback now builds a
single canonical stop-to-stop plan using the existing speed-envelope trajectory
math, acceleration/braking parameters and generic conservative speed caps. It
only stretches time, never compresses a trajectory faster to satisfy an
impossible source clock. The same effective timeline drives marker position,
next-stop ETA, stop boards and selected-trip projection. Provider clocks remain
separate. Revised source clocks change the virtual estimate revision, using the
existing same-marker correction mechanism rather than a backward animation or
preserved incorrect lead. GPS coordinates/identity never enter this fallback.

This fallback does **not** invent a road edge, intersection queue, mandatory
signal hold or live traffic-light phase. Its speed caps are model parameters,
not proof of a road's posted limit. It is disclosed as
`TIMELINE_CONSTRAINED_FALLBACK`, not counted as detailed physics coverage.
The selected detail says detailed motion data are unavailable and that no live
signal/traffic observation is supplied.

Fallback caching is worker-local: at most 64 plans and 50,000 retained trajectory
segments, with a 30-second cache lifetime. Oversized plans are not cached.
Dated/versioned effective finish windows participate in candidate retention with
a 90-second grace, so a plan's physically delayed finish is not discarded merely
because the source schedule has ended. These are model windows, not evidence of
observed vehicle movement.

## Regression scenarios

- Next-stop ETA is five minutes: sampled progress is still before the stop.
- Later source revision: fallback resamples behind the old wrong lead, retains
  dated identity, and continues forward on subsequent samples.
- Unachievably early source clock: generic speed/acceleration limits prevail;
  effective ETA changes, original provider clock does not.
- Dense time samples for bus and tram, early/late endpoints, repeated stops,
  source ordering conflicts, NO_DATA/skips/cancellations, dated cache isolation,
  cache bounds and fallback-vs-detailed-physics diagnostics.
- Existing physical GPS, operator override, geometry, Home markers, exact journey
  selection, overview controls and manual/live origin regressions remain in the
  explicit validation suites.

## Real tram 9 replay / calibration caution

The captured 20-stop trip `1221147` (`2026-10-25`, `net_7f0605d2409e`) is replayed
on canonical generation `gen_e8ae6f0991d921fcc2`, 465 existing points, with no
database writes. The original sparse-clock correction remains `18:07:27`
instead of `18:05:52`. Detailed and degraded-motion replay both keep progress
before Am Fuchsberg while its effective ETA is positive. A controlled +180-second
source prediction revision is separately identified as synthetic, not an actual
provider capture or GPS proof.

A hold-out regression uses the later real source clocks: Raiffeisenstraße
departure `18:05:30`, Am Fuchsberg arrival `18:07:15`, following stop arrival
`18:08:49`. With Am Fuchsberg deliberately withheld, blindly spreading the
following stop's lateness backward would yield about `18:07:43`, worsening the
one-sided `18:07:30` estimate. The conservative neighbouring bound retains
`18:07:30` (15 seconds from the withheld clock). This is **one controlled
prediction-clock hold-out**, not measured vehicle accuracy or proof of general
improvement. It is why the algorithm does not relocate downstream delay upstream
without evidence.

## Deployment / reproduction gates

The accompanying `validation.json`, `canonical-replay-verification.json`, staging
runtime/served/API/browser evidence and deployment result state what actually
passed. TypeScript is compared against the frozen production frontend baseline;
the existing five CityAdViewer errors are not represented as a clean typecheck.
The original 93-case staging Mongo pipeline verification is inherited only after
checking that the ordering module is byte-identical; this delta does not change
the importer or its ordering rules.

The source delta is against the verified **production** baseline plus its
validated frontend source, not the dirty shared checkout. For byte-exact
reproduction of mixed LF/CRLF files, use a clean baseline reconstruction and:

```powershell
git -c core.autocrlf=false -c core.safecrlf=false apply --check source-delta.patch
```

Never apply the release patch blindly to shared WIP. Helper scripts expect the
approved original temporary baseline/candidate paths; they contain no credentials.
Keep paid routing disabled. Route 13 detour geometry/timetable repair and islands
remain outside scope. Sparse source predictions are not independent GPS proof,
and coherent model output cannot guarantee an unreported physical vehicle's
actual position.
