# Magdeburg: offline OSM reconstruction and checks — 2 November 2026

## Outcome and boundaries

**Research candidates only; not a deployable network or a physical validation.** All **186/186** dated map patterns (102 bus, 84 tram; 34 route/mode combinations) produced a connected stop-pair candidate that passed the existing geometry validator. A second offline audit independently matched every candidate edge and point against the supplied OSM ways, reassembled the segments, and recomputed the geometry/reversal/projection diagnostics: **0 patterns with technical edge or diagnostic errors**.

This does not validate the actual routes, current detours, track operating directions, or vehicle positions. The replay did **not** load active operational restrictions or verified overlays. It does not construct or install a full infrastructure/motion generation, use traffic or signals, run the production motion solver, or compare operator trip shapes or GPS. A shorter candidate is not necessarily a correct route. **Do not import or activate the candidate files.**

## Sources and date identity

- PERIX captured network `net_9d97f995b79a`, service date `2026-11-02`, and its matching map; the prior audit verified every dated pattern, stop occurrence and geometry fingerprint before replay.
- Single public Overpass response with `timestamp_osm_base=2026-11-02T10:36:38Z`, covering declared bbox `(52.023, 11.535, 52.235, 11.767)`. The single query selected road ways matching the existing `HIGHWAY_FILTER` and rail ways matching `RAILWAY_FILTER`, `out meta geom`, with no error/remark. All stops and attempted routing windows fit the declared bbox; however, this is a bounded response, not the independently audited full-region PBF import contract. External paths outside the bbox could be missed.
- Source response SHA-256 `35283d8e5c97d2c40335dbae81149ac262e29ac749cc272f72031a10c6252087`. The response is © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright). Attribution and applicable derived-database/distribution obligations require review before use.
- No operator geometry is present in the captured network, so the existing routing algorithm is replayed without shape hints. Current verified closures are unknown; therefore results must remain unactivated even if all technical checks pass.

## Before/after review signals

These are the same triage thresholds as the earlier audit, not a count of physical errors. Legitimate loops, repeated stops, terminal reversals and parallel tracks can produce flags.

| Diagnostic | Captured baseline | Candidate |
|---|---:|---:|
| Patterns with at least one of the two flags | 117 | 105 |
| Exact immediate reverse run, at least 3 edges and 100 m | 98 | 85 |
| Existing stop projections disagree by over 100 m | 79 | 66 |

Twelve previously flagged tram patterns no longer have either of these two flags; none of the previously unflagged patterns gained one. This is diagnostic only and does not mean 12 operator routes were corrected. The corresponding bus figures remained 58 flagged patterns before and after.

All exact geometry fingerprints changed, so a fingerprint alone overstates meaningful change: **102** candidates have the same number of vertices as their baseline and corresponding vertices at most one metre apart. **33** tram patterns have a total-length change greater than 100 m. Comparing total lengths alone cannot establish geometry equivalence or route accuracy.

## N8 and shared corridor

For `N8:2bfdf50506`, covering 23 stop occurrences, the candidate length is **10,567.1 m** versus **11,820.4 m** in the captured baseline. Its first City Carré → Alter Markt graph segment is approximately **306.63 m** versus **1,560 m** previously. The updated OSM tram way `1498361845` participates in that first segment. Neither the immediate-reversal flag nor the >100 m projection-disagreement flag remains for this N8 pattern; maximum candidate disagreement is **21.4 m**.

The updated way occurs in **25 candidate tram patterns** across routes 1, 2, 3, 4, 5, 6, 8, 9, 10 and N8. This does not prove that all of them use that way operationally or that all changed patterns are accurate. The updated OSM way is a community mapping update, not an operator-confirmed trip shape.

## Additional safety review

- The source-edge audit marked **79 tram patterns** with at least one traversed edge opposite to generic OSM `oneway` as interpreted by the existing helper. The current tram graph intentionally builds rails bidirectionally; a generic OSM tag by itself does not prove actual tram direction. This is a review signal, not a claim that every route is illegal or wrong. The N8 candidate has **121** such edges across its complete route; its shorter first segment has none under that generic interpretation.
- **81 patterns** contain at least one source way with `access`, `bus` or `psv` tagged `no` or `private` (56 bus, 25 tram). These are raw tag review signals, not determinations of transit restrictions; mode exceptions, direction, time and the full context must be checked.
- A separate *optimistic* schedule sanity screen matched **2,813** dated trips and **60,112** adjacent stop occurrences. Using only PERIX's default maximum caps (bus 60 km/h, tram 65 km/h), constant speed and a 60-second margin for minute-level source times, **186 trip-stop occurrences in 14 patterns** exceeded even that simplified duration bound. They are review flags, not proof of actual speed or physical error. No acceleration, braking, dwell, signals, traffic, live delay or GPS was modelled. This is not a motion-solver replay and does not certify the other patterns. The specific N8 pattern above did not receive this particular flag.

## Local artifacts and tools

All artifacts are local to `C:\Users\PC\AppData\Local\Temp\opencode\`:

- `perix-all-lines-osm-overpass-20261102.json` — captured OSM source response.
- `perix-osm-rebuild-all-patterns-20261102.json` — review-only candidate points and graph edges.
- `perix-osm-rebuild-audit-v2-20261102.json` — independent candidate graph, direction/access and baseline comparison audit.
- `perix-osm-rebuild-schedule-review-20261102.json` — dated static schedule sanity screen.

`tools/rebuild_transit_offline.py`, `tools/audit_offline_rebuild.py` and `tools/audit_rebuild_schedule.py` read supplied files only, validate identity/provenance, and refuse to overwrite reports. They do not call a provider, open a database or activate a route. The synthetic tests cover malformed/incomplete OSM, disconnected edges, invalid dates/timings, source edge identity, diagnostics and conservative flags. The declared Overpass query bounds and actual response provenance still need independent confirmation before any future import.

## Follow-up: stop-node and direction sensitivity (offline only)

The 14 patterns flagged by the optimistic schedule screen were concentrated around **Sohlener Straße** (10 tram patterns) and **Westringbrücke** (4 bus patterns). Each experiment below uses the *same chosen node for both adjacent stop-pair segments*. These are hypotheses over the same OSM snapshot, not independently verified platforms or operator routes. The stop-node selection is manual and specific to this investigation; do not generalize it into a production snapping rule.

| Experiment | Observation | Remaining limitation |
|---|---|---|
| N8 `N8:2bfdf50506` | With alternative nearby nodes at Rostocker Straße and Zoo and an experimental strict generic-tram-oneway interpretation, the full 23-stop route is **10,577.4 m**. The audited candidate has no generic-oneway opposing edges, no ≥100 m immediate reversal, 21.3 m max projection disagreement, and no flags in the optimistic schedule screen for its 2 trips / 44 pairs. | Alternative nodes are 9.51 m and 12.91 m from their respective stop coordinates; platform side and actual operating direction remain unverified. Three source edges retain raw `access` warnings. No GPS, actual traffic, verified closure or full motion replay. |
| Tram 2 `2:1ebda54deb` | A nearby alternative Sohlener Straße node reduces the Husumer Straße → Sohlener Straße candidate leg from **2,337.4 m to 355.2 m**. Both adjacent legs were reconstructed, all edges audited, and this one pattern's optimistic schedule flags changed from **92 to 0** across 92 trips. | No operator-confirmed platform, exact track, active closure or actual run. The whole-route result is still review-only. |
| N5 `N5:14ef0cbce5` | One alternative Westringbrücke node shortens both adjacent candidate legs; the optimistic schedule screen changes from **4 to 0** flags across 2 trips. | 15 raw access-tag warnings remain. Four occur on way `38930105`, tagged `access=no` without an explicit bus/PSV exception; another 11 occur on way `26839076`, tagged `access=no` plus `psv=yes`. These tags must be interpreted in full context; they do not prove the actual bus detour. |
| Bus 52 `52:75afb29eba` | The same alternative Westringbrücke node shortens the following leg from **2,001.0 m to 692.5 m** and removes that specific schedule-screen flag. | It lengthens the previous leg from **360.8 m to 1,642.6 m**. This merely relocates a potential problem: do not treat it as a fix. |

In a strictly offline batch applying the corresponding manually selected node to each of the **14 previously flagged patterns**, all 14 produced connected geometry and the simplified schedule flags changed from **186 occurrences to 0**. However, **1 pattern** acquired a neighboring-leg increase over 100 m, **2** retain access-tag review signals, and **3** retain generic-oneway review signals. Two patterns still have an exact-reversal flag; these categories overlap. Eight have none of these listed diagnostic signals, which is **not** evidence that they are physically correct. The batch neither verifies MVB operations nor clears the other 172 patterns.

As a separate sensitivity experiment for N5, an intentionally simplified access rule excluded ways tagged `access=no/private` without a `bus`/`psv` allow tag; it excluded way `38930105`, retained way `26839076`, and found a connected alternative 131.6 m longer for Landgericht → Jordanstraße. This is **not** a legal interpretation of OSM, does not account for conditional or operational restrictions, and is not an approved replacement.

### N8 historical relation comparison

The captured OSM relations [11551728](https://www.openstreetmap.org/relation/11551728) (Alter Markt → Barleber See, version 15) and [11551729](https://www.openstreetmap.org/relation/11551729) (reverse direction, version 16) both carry `check_date=September 2022` and a note referring to October 2020. Their April 2026 edit timestamps do **not** establish that the route was revalidated in 2026. Relation membership is another view of the same OSM source, not independent operator confirmation.

Counting candidate edge **occurrences** by whether their way belongs to either relation's unroled route-way members gives the following. Lengths are summed edge lengths, not unique ways; the comparison does not verify member ordering or traversal direction.

| Candidate | Outbound relation only | Inbound relation only | Neither relation |
|---|---:|---:|---:|
| Initial OSM candidate | 350 edges / 8,870.5 m | 114 / 1,242.9 m | 71 / 453.7 m |
| Alternative stop-node and generic-oneway hypothesis | 464 / 10,104.7 m | 0 / 0 m | 71 / 472.7 m |

No traversed candidate way was in both relation way sets. At Rostocker Straße, the alternative node `1798221317` is a `stop` member of the historical outbound relation and is 9.51 m from the captured GTFS stop coordinate. Within 35 m of the Zoo GTFS stop, the captured graph contains historical inbound relation stop node `1798221334` at 17.46 m, but no outbound relation stop node was identified in the available graph nodes. The alternative Zoo node itself is not established as the outbound stop by this check. Absence from the available graph-node subset is not proof that no suitable platform exists. Neither relation membership nor a short snap confirms the current platform, access or physical service. The alternative stays review-only.

The reproducible read-only `tools/replay_stop_snap_hypothesis.py` accepts a dated map, the captured OSM and candidate report, plus explicitly supplied stop occurrence/node pairs. It enforces a 20 m experimental node radius, shared adjacent nodes, exact edge identity and geometry validation. Its optional generic tram-oneway experiment remains explicitly separate from production routing. It flags neighboring-leg increases over 100 m and optionally compares same-network static schedules under the same optimistic 60-second-tolerance screen. A clean result never authorizes activation.

Additional artifacts are in `C:\Users\PC\AppData\Local\Temp\opencode\`:

- `perix-n8-snap-replay-v3-20261102.json`, `perix-tram2-snap-replay-v3-20261102.json`, `perix-n5-snap-replay-v3-20261102.json`, and `perix-bus52-snap-replay-v3-20261102.json` — individual explicit-node replays.
- `perix-flagged14-stop-snap-batch-20261102.json` — all 14 flagged patterns, with their inputs hashed and each result kept review-only.
- `perix-n8-directed-osm-hypothesis-20261102.json`, `perix-n8-snap-oneway-diagnostic-20261102.json`, `perix-flagged-corridor-snap-diagnostic-20261102.json`, and `perix-n5-access-hypothesis-20261102.json` — bounded sensitivity analyses, not production generations.

Next: resolve the tagged direction/access and remaining corridor flags using dated, appropriately licensed operational evidence; perform full snapshot, restrictions, infrastructure, stop/ETA, motion/preview and restart/load tests in a controlled environment. Request separate approval before any deployment. No production data, provider configuration, commit, push or deployment was changed.
