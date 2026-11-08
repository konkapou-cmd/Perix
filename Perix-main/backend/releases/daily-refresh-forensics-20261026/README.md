# Daily timetable / native-event forensic audit — 2026-10-26

## Executive finding

**The daily GTFS job did run. The failure was promotion, not calendar download.**
It downloaded and parsed the correct Monday timetable at civil midnight, then
retried six hours later. Both candidates were rejected because eight NEW bus
patterns on lines **56, 57 and 59** could not obtain valid canonical geometry.
The global activation gate also held back all 66 individually ready tram
patterns. It correctly did not activate invalid geometry, but the operational
result is still a serious failure to make today's full timetable active.

Separately, the **122.5645s native target conflict is not measured bus error**.
The stale-handover hypothesis was tested and is not its cause in this replay:
the old curve had already advanced 523.10m to NOW. The source changed from a
propagated future target to a new explicit stop event already in the past.

No runtime algorithm, parameter, source feed, geometry, production flag,
frontend, deployment or existing report was changed during this audit. All
production work was read-only. Native remains an unpublished shadow experiment.

## 1. Evidence scope and actual deployed code

Read-only capture at 2026-10-26T10:07:25Z from the explicitly asserted production
backend/environment. Active deployment remains
`d91ff576-492d-45e8-a388-c2b00d0746c6`, SUCCESS. Files were captured from that
container and archived in `deployed-source-readonly.zip`, not installed into
the local checkout or imported as a production replacement.

Important: the deployed static worker is **schema 12**, not the schema-8 local
WIP. It already implements civil-midnight scheduling, occurrence timing checks,
and not marking a blocked activation as successfully synced. Diagnosing only
the dirty local worker would give the wrong account of production behavior.
Do NOT deploy the checkout wholesale to fix this incident.

Evidence files:
- `production-readonly.json`: network versions, stored generation reports,
  individual pattern statuses, safe configuration; no credentials.
- `worker-logs-redacted.json`: bounded Railway logs, URLs redacted.
- `geometry-forensic.json`: exact offline reproduction of all eight failures.
- `native-event-forensic-precise.json`: raw selected GTFS-RT records, source
  clocks, state trace, paired anchor replay, road-by-road reference time.
- `case-geometry-context.json`: the native trip's actual reused generation.
- `coverage-and-mode-counts.json`, `source-boundary-verification.json`.

The complete OSM graph and GTFS-RT snapshots stay in the approved local temporary
evaluation directory. There were no new GTFS downloads or traffic-provider calls
in this audit. The four real GTFS-RT files from the preceding task were reused.

## 2. What happened to the daily timetable

Observed settings: static source configured (`download.gtfs.de`),
AUTO_ACTIVATE=true, STATIC_INTERVAL_HOURS=6, timezone Europe/Berlin.

| Germany local time | Recorded event |
|---|---|
| 25/10 23:09–23:10 | Startup check; active 25/10 feed correctly skipped as unchanged |
| **26/10 00:00:00** | Midnight worker woke and downloaded the source |
| **00:01:08** | Parsed **34 lines / 3776 trips**, service_date=2026-10-26 |
| **00:02:42** | `net_51aa9c9d9334` blocked by 8 changed/new bus patterns |
| **06:02:42** | Automatic retry started |
| **06:03:39–06:03:46** | Second candidate `net_7c4078011f7f` inserted/logged |
| **06:04:39** | Same 8 failures blocked activation again |

The same feed ZIP hash was downloaded. That is normal: GTFS calendars select a
different day's services without requiring the ZIP bytes to change. Logs prove
the worker DID parse 26/10 instead of incorrectly skipping because the hash was
unchanged. The structural schedule audit had **blocking=0, warnings=0**; no
operator revision contract was applied. The block occurred later, at geometry
readiness, not at feed download, calendar parsing, min-trip checks or billing.

| Stored timetable | Bus | Tram | Total patterns / ready | Status |
|---|---|---|---|---|
| 25/10 active | 22 lines / 1153 trips | 8 lines / 974 trips | 113 / 113 last-good | ACTIVE_READY |
| 26/10 candidate | 25 lines / 1805 trips | 9 lines / 1971 trips | **159 / 151** | BLOCKED_CHANGED_PATTERNS |

Today's candidate has **93 bus patterns: 85 ready + 8 missing**, and **66/66 tram
patterns ready**. Preparation reused 92 patterns and rebuilt 59. Both complete
26/10 attempts have the same eight blockers.

Of the 151 last-good ready generations, the stored preparation report lists
126 on the current OSM snapshot and 25 retained from older snapshots. "Ready"
must therefore not be misreported as "all rebuilt from the latest road graph".

The worker deliberately raises after a failed activation and leaves the feed
hash unsynced for retry. Its ordinary blocked-cycle sleep is still up to six
hours. The background OSM/precompute path refreshes the ACTIVE network; that is
not an immediate repair-and-activation loop for the inactive candidate. Repeating
the same import with the same inadequate road data need not clear the block.

The global gate couples today's schedule availability for both modes to every
new geometry passing. Thus bus geometry failures can withhold a valid new tram
timetable too. This is an operational availability limitation, NOT justification
to force activation or loosen road/geometry validation.

The active database version being dated 25/10 does NOT by itself prove that
passengers see all Sunday departures relabeled as Monday. Deployed journey
selection preserves dated clocks and excludes unactivated candidates. The
confirmed incident is failure to promote Monday's network; a separate passenger
API/UI audit is needed to quantify missing or displayed service at each stop.

## 3. Exact geometry failures — independently reproduced offline

Used the actual deployed pure routing functions, graph snapshot **1792950897**,
and the candidate's exact platform sequences. No builder, Mongo promotion,
Overpass fetch, schema guard or mathematical tolerance was changed.

**All eight stored failure results reproduced exactly** (validation values at
stored precision and exact missing-pair indices):

| Pattern | Stored reason | Exact diagnostic |
|---|---|---|
| 56:5368b7d9e2 | GEOMETRY_VALIDATION_FAILED | max platform distance **3595.6m**, 3 missing, order invalid |
| 56:31ae567775 | GEOMETRY_INCOMPLETE | missing pairs **7→8, 13→14** |
| 56:cf42f1d537 | GEOMETRY_VALIDATION_FAILED | **3596.3m**, 3 missing, order invalid |
| 56:31e03e1a20 | GEOMETRY_VALIDATION_FAILED | **3596.3m**, 3 missing, order invalid |
| 57:85ade62306 | GEOMETRY_VALIDATION_FAILED | **1061.3m**, 3 missing, order invalid |
| 57:eaa2f964fd | GEOMETRY_VALIDATION_FAILED | **1097.5m**, 3 missing, order invalid |
| 59:aa7727a8ad | GEOMETRY_INCOMPLETE | missing pairs **0→1, 2→3, 5→6** |
| 59:2b12646995 | GEOMETRY_INCOMPLETE | missing pairs **0→1, 2→3, 5→6** |

Measured in the imported eligible road graph:
- The nearest-node snap has no distance cutoff. It can snap a platform to an
  available node kilometres away; the later 120m validation correctly rejects it.
- Examples of poorly covered platform approaches: Cracau/Pechauer Platz,
  Alt Prester, Kalenberger Straße, Buckau/Wasserwerk and Stadthalle.
- Several missing pairs connect different weak components of the selected
  graph. Others are in the same weak component but lack a directed route.
- The graph contains 26,137 road ways and 129,154 distinct real node references;
  no exported way is missing its node list or has a node/coordinate length
  mismatch. This is not the former synthetic-node-ID fallback problem.
- Enlarging the local query margin from .004 to .02 degrees did NOT yield a
  valid pattern for any of the eight. Some disconnected pairs improved, but
  other failures persisted. This is not solved by just raising a snap tolerance.
- None of these eight patterns supplied a GTFS shape hint. The failure is not
  a demonstrated wrong-Google/TomTom corridor or erroneous shape-hint weighting.

The observed data show absent/insufficient nearby eligible graph coverage and
directed connectivity at the named approaches. The historical reason those
roads/connections are absent—source coverage, importer completeness, eligibility
filter, source platform errors or access tags—has NOT been fully established.
There is no independently reviewed complete OSM reference in this audit.
Do not equate sparse grid-node counts with proof a fetch failed on a particular
historical tile. One NEW Overpass tile-fetch failure appears in the current
worker logs; it cannot alone explain the history of snapshot 1792950897.

Current deployed importer code rejects incomplete new tile fetches before
replacing the active graph. A previously insufficient active graph can still
remain when new import attempts fail. The appropriate next investigation is
coverage/source eligibility at these specific failed stop pairs—not accepting
kilometre-distant snaps or declaring 151/159 universally ready.

## 4. Exact native event: old and new targets

Same instance: trip **491847**, date **2026-10-26**, pattern **66:2e0b359099**,
generation **gen_f3d018208bbde715cb**, stop **71585**, stop_sequence **5**.

| Quantity at common NOW 10:04:43 | Value |
|---|---:|
| Previous normalized ETA | **10:07:06** = service_s 36426 |
| New explicit arrival/departure | **10:04:00** = service_s 36240 |
| Change | **−186s** |
| Previous target remaining | **143s** |
| New target remaining | **−43s** |
| Physical reference remaining from carried estimate | **79.564501936s** |
| Target conflict | **79.564501936 − (−43) = 122.564501936s** |
| Old target's margin above that same reference | **63.435498064s** |
| Remaining canonical distance | **1003.717590444m** |
| Modeled signal hold in that reference | **0s** |

The arithmetic proposed in the request is confirmed for this event at the same
stop and common clock: 186−122.564501936 = 63.435498064. The physical reference
uses the configured path/caps; it is not an independently verified true travel
time or a proof of the globally fastest route on the real street network.
Road-by-road distances and reference durations are in the JSON and sum back to
79.564501936s. There was no unavoidable hypothetical red-light wait causing it.

## 5. Handover suspicion: actual paired replay

At the preceding state clock **10:03:34**, the old accepted plan sampled:
progress **2328.210493089m**, speed **27.292338393km/h**.

At the new clock **10:04:43**, that SAME plan sampled:
progress **2851.313645622m**, speed **27.292338393km/h**.

The 69s interval advances **523.103152534m**. The native handover uses the
second pair, with unrounded speed. It does NOT relabel the older position NOW.
The current deployed engine's call site also samples the old plan at NOW before
calling `handover_anchor_from_state`; the helper alone is not the full pipeline.

| Identical source/limits, different audit anchor | Target conflict |
|---|---:|
| Native as implemented, integer service clock | **122.564501936s** |
| Independently sample old accepted curve at the same NOW, rebuild | **122.564501936s** |
| Deliberately stale anchor from 69s earlier — counterfactual only | **160.227851565s** |
| Use full receipt instant 10:04:43.165823 instead of integer second | **122.639943364s** |

The first two anchors differ by **0m / 0km/h**. Subsecond projection advances an
additional **1.257138175m** and changes the conflict by just **+0.075441427s**.
It is not a 20s/69s frozen-position issue. This excludes that specific hypothesis
for this replay, NOT all possible spatial errors or every handover caller.

## 6. Most important provenance distinction

Stop 71585 had **NO direct stop update in captures 0, 1 or 2**. Its old 10:07:06
target came from scheduled 10:05:00 plus an upstream propagated **+126s** delay.
Capture 3 introduced explicit arrival AND departure epoch **1793005440**, with
delay **−60s**, hence 10:04:00. The epoch was not shifted by another −60s.

This is a **propagated→explicit timing transition**, not necessarily the provider
revising its own explicit forecast for that same stop by 186s. The new stop time
was already **25s before FeedHeader.timestamp** and **43.165823s before receipt**.
It may be a correction concerning a passed stop; the payload does NOT establish
an independently observed vehicle position or certify an actual arrival.

Thus this is best diagnosed as a SOURCE FRONTIER CONFLICT: a preserved virtual
history is upstream while new explicit source timing puts the stop in the past.
The native experiment's continuity-first policy reports PHYSICS_LIMITED rather
than revising its historical model. That is not proof the source was wrong.
The deployed engine has a separate source-frontier reconciliation helper; this
native experiment did not integrate that policy. No complete production replay
of that helper or passenger correction behavior is claimed here.

The +68s/+62s cases were also traced exactly:
- Trip 1209627, target 83801: propagated delay **91→159s**, origin changed from
  stop 380541 / sequence 11 to stop 212930 / sequence 12; target 36331→36399.
- Trip 678105, target 356010: **410→472s**, origin changed from stop 521411 /
  sequence 0 to stop 615023 / sequence 10; target 36230→36292.

Both follow schedule + latest applicable departure-delay propagation. They are
not two direct measurements of vehicle position or direct updates at the target
stop. The exact normalized/raw origin records are retained in the audit JSON.

## 7. Freshness, timezone and geometry independence

The four selected TripUpdates do not carry their own timestamp; the parser uses
FeedHeader fallback. Feed-header ages at receipt were **15.565, 26.155, 39.560,
18.166s**. All are below 90s, but freshness of the individual prediction/vehicle
observation is not thereby established. Native's configurable default source
limit is **180s**, not the 90s recommendation. It did not reject these events
under either header-age threshold; it must not be advertised as a guarantee of
per-TripUpdate 90s observation freshness before any activation.

All clocks in this event use **26/10, UTC+01:00**; 10:04 local is 09:04 UTC.
No 25/10 timeline or +02:00 clock was mixed into the replay. The deployed civil
date helper correctly selects 26/10 at 00:01 despite 04:00 display grouping still
being 25/10. The deployed midnight-wait helper returns **25 hours** across the
autumn change and **23 hours** across spring; DST does not explain −186s.
Repeated wall-clock times remain a separate documented ambiguity, not GPS truth.

The native case used a validated, retained geometry from OSM snapshot
**1792887708**, not the newer failing snapshot 1792950897. It has maximum
platform distance 27.7m and no missing platforms. Its pattern is NOT one of the
eight activation blockers. A newer refresh of this same pattern had failed
pair 2→3, so the existing last-good geometry was retained intentionally.
That supports separating the two incidents; it does not prove the old shape's
1003.72m is the actual bus's remaining distance. No independently verified
alternative geometry or true vehicle position was obtained.

## 8. Required corrective work — not executed in this audit

1. Restore and verify eligible road/PSV topology around the named failed
   approaches, with source provenance and bounded snap-distance diagnostics.
   Compare against a complete reviewed OSM reference; do not relax 120m into km.
2. Reprepare the correct dated candidate after source repair, using existing
   atomic readiness rules. Only promote when it actually passes; retain the
   current rollback version. No automatic force=True workaround.
3. Add monitored daily-promotion failure alerts and a bounded recovery path;
   six-hour retries rebuilding identical blocked candidates are insufficient
   operational recovery. OSM refresh alone currently targets the active version.
4. Decide and test whether dated schedule publication can be safely separated
   from per-pattern geometry readiness, with explicit degraded/hidden-position
   behavior. This is a design/approval task, not permission to activate today.
5. For native source-frontier conflicts, specify confidence/history revision and
   passenger presentation policy before integrating the experiment. Do not make
   buses faster to satisfy a past source anchor or silently teleport the marker.
6. Require correct source-clock provenance/freshness, broader replay and
   independent passage/GPS evidence before claiming accuracy improvements.

The mandatory daily renewal of BOTH bus and tram timetables is valid. The audit
proves that automation exists and that midnight selection worked; it also proves
that the present global geometry gate prevented its intended service outcome.
The system is NOT now fixed in production, and no claim to the contrary is made.

## Validation / changes / rollback

20 focused forensic checks cover the log chain, date/DST helpers extracted from
actual deployed source, identical geometry reproduction, paired NOW anchor,
subsecond precision, raw→propagated provenance, arithmetic and unchanged source.
The check harness was corrected to decode UTF-8 BOM in archived Python files;
that was a local test-reader issue, not a production syntax/import failure.

Completed results: **20/20 forensic checks passed**, followed by the relevant
native/bus/tram/Google/timeline/generation regressions: **435 passed**, no skips,
one existing multipart deprecation warning. Results are in `forensic-results.xml`
and `regression-results.xml`. No remote CI execution is claimed.

The deployed-source archive is a text capture; its hashes pin the archived text
(including local encoding/newline representation), not a claim of byte-identical
raw container-file preservation. The local native source-boundary comparison
uses the preceding task's recorded file-byte hashes.

All 28 source changes from the preceding native task still match its recorded
post-hashes; its report is unchanged. This audit added only this separate release
directory and approved temporary capture/replay scripts. No runtime source,
Google WIP, tram physics, feature flag, API contract, key or billing was changed.
No deployment or commit/push. Production reads are distinguished from mutations.

Rollback: no application rollback is needed because nothing was activated or
modified in production. Audit files can remain as private historical evidence;
never use a whole-checkout reset or overwrite other work to remove the report.
