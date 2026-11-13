# Multi-region source licences — lock record (2026-11-12)

**Status: assessment for review, not legal advice or legal approval.**
This record locks the source/licence/attribution state of every added region
at the end of the multi-region pipeline (final sequence step 4). All listed
regions are `REVIEW_ARTIFACT_NOT_ACTIVATED`: no region was activated, no
database write was performed and nothing was deployed in this pass.
Magdeburg remains the only active runtime region and is unchanged.

The runtime attribution pipeline stays as previously staged for Magdeburg:
the version-bound read-only V2 `source_manifest` exposes only the allowlisted
publisher record (name + URL, no licence field, no licence inference), and
the `/app` surface renders the archive-supplied or region-declared schedule
publisher plus the existing OSM routing credit. Licence wording below is
recorded from published source pages/artifacts; final legal determination
and ShareAlike review remain open where noted.

## 1. Per-region source/licence table

| Region (inactive) | Static source | Published terms | Runtime publisher (bound verbatim) | Outstanding action |
|---|---|---|---|---|
| syros | Manual GTFS transcription of the official KTEL Syrou timetable, `Dromologia-31.10.26.pdf` from ktelsyrou.gr (31 Oct 2026) | Operator-published timetable; reuse permission not yet requested | `ΚΤΕΛ Ν. ΣΥΡΟΥ Α.Ε.` / `https://ktelsyrou.gr/dromologia/` (verified UTF-8 inside `syros_ktel_gtfs.zip` `feed_info.txt`) | Request operator reuse permission for the transcription; keep the PDF URL and retrieval date with the version |
| mykonos | Manual GTFS transcription of mykonosbus.com winter timetable (valid 9–11 Nov 2026 window) | Operator-published page; **no permission path pursued — region held out of the activation plan by owner decision (2026-11-12)** | `ΚΤΕΛ Μυκόνου / Mykonos Bus` / `https://mykonosbus.com/bus-timetables/` (verified UTF-8 in zip) | None pending: region stays inactive; artifacts retained for a future permission path only |
| ports | NAP maritime dataset (year 2023), 5 OSM ports + 3 transcribed ferry trips | NAP HIT/CERTH open dataset; attribution `Hellenic Institute of Transport / CERTH`; OSM ODbL for port geometry | `Hellenic Institute of Transport / CERTH (NAP)` / `https://data.nap.gov.gr/dataset/f1829566-388d-4bde-afc7-b9a6498b701b` | 2023 dataset is stale: verify current operator timetables before activation; intermediate port times are equal-split estimates |
| attica | OASA road GTFS + STASY fixed GTFS from data.gov.gr (OASA high-value datasets) | Published as open data via data.gov.gr; operator reuse rights to confirm; feed windows Aug/Oct 2026 are stale for today | From each archive's own `feed_info.txt` when imported (no region-declared publisher) | Confirm operator reuse rights; wait for a current feed window before activation; live path = OASA telematics adapter (gated off) |
| berlin | VBB open-data GTFS, `https://unternehmen.vbb.de/gtfs` (fetched 2026-11-12; SHA-256 identical to the 2026-11-11 snapshot) | VBB open data; published terms referenced as CC BY 4.0 in the review artifact — verify the current published terms page before release | **No `feed_info.txt` in the archive.** Region-declared publisher (new): `VBB Verkehrsverbund Berlin-Brandenburg GmbH` / `https://unternehmen.vbb.de/en/digital-services/datasets` | Verify the current VBB terms page and record its retrieval date; rail mode currently renders tram sprites (visual substitution, see step 5) |
| gardelegen | GTFS-DE national feed `nv_free_latest.zip` (download.gtfs.de), agency PVG Salzwedel | gtfs.de / DELFI e.V.; feed carries `attributions.txt` and `feed_info.txt` publisher | Archive-supplied: `gtfs.de - GTFS für Deutschland, Daten bereitgestellt von DELFI e.V.` / `http://gtfs.de` (as-is from the feed) | Preserve archive-supplied notices; review attribution scope on activation |

Realtime for magdeburg/gardelegen/berlin uses the shared DELFI feed
`https://realtime.gtfs.de/realtime-free.pb` (published as CC BY-SA 4.0 with
the provider's completeness/availability disclaimer). ShareAlike
implications for the specific transformations and published outputs require
qualified review — the same open point recorded in
`MAGDEBURG_RIGHTS_PROVENANCE_STAGING_2026-11-02.md`. Syros/Mykonos/ports
declare no realtime source; attica's telematics adapter (gated off) would
need its own reuse confirmation before any live enablement.

## 2. Code changes made for this lock (all additive, Magdeburg-frozen)

- `mobility/regions.py`: optional `static_publisher` field on
  `MobilityRegion` (default `None`); the berlin preset declares the VBB
  publisher; `_region_from_dict` and `_apply_env_overrides` carry the field.
- `utils/gtfs.py`: when the archive supplies no usable `feed_info.txt`,
  the parser falls back to the region-declared `static_publisher`.
  Never merges with or overrides an archive-supplied record. Magdeburg
  declares none, so its behaviour is byte-identical; guarded by the existing
  publisher-bound tests (48 passed incl. `test_daily_network_recovery.py`).
- No licence field is added anywhere at runtime: publisher records remain
  verbatim name+URL, matching the staged Magdeburg contract
  (`test_archive_publisher_is_bound_verbatim_without_licence_inference`).

## 3. Verified evidence in this pass

- `feed_info.txt` of `syros_ktel_gtfs.zip`, `mykonos_ktel_gtfs.zip` and
  `ports_ferry_gtfs.zip`: UTF-8 with BOM, publisher names intact
  (Greek characters verified; an earlier console-display mojibake was a
  terminal artifact, not data corruption).
- `nv_free_latest.zip` (gardelegen): carries `feed_info.txt`
  (gtfs.de/DELFI) — no region declaration needed.
- VBB archive: no `feed_info.txt`; the region fallback now yields the VBB
  publisher in the parsed payload (verified).
- Review artifacts updated in this pass:
  `backend/imports/berlin/berlin_review.json` (new, depth test) with
  attribution, blockers and the rail-sprite substitution flag.

## 4. Unresolved items carried forward

1. KTEL Mykonos email (ktelmyk@gmail.com): official timetable PDF, stop
   coordinates, reuse permission — drafted, not sent.
2. KTEL Syrou reuse permission for the transcribed timetable.
3. OASA/STASY operator reuse rights (attika stays stale-windowed and
   inactive until then).
4. VBB published terms page verification (retrieval date + exact licence
   identifier) before Berlin activation.
5. Realtime ShareAlike review (shared with the Magdeburg staging record).
6. NAP 2023 dataset staleness — re-verify current operator timetables
   before ports activation.

No activation, deployment, database write or feed import was performed in
this pass.
