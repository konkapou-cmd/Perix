# Tram 9 ahead of the observed vehicle — Am Fuchsberg, toward centre

## Scope

Read-only investigation of the user's fresh observation: the map estimate left
Am Fuchsberg approximately two minutes before the physical northbound tram;
shortly before the actual tram arrived, the map estimate approached the next
stop. No live code/data/configuration or positions were changed by this audit.

## Captured evidence

Capture: **2026-10-25 18:12:55 Europe/Berlin (+01:00)** / 17:12:55 UTC.
Current dated network `net_7f0605d2409e`, service date `2026-10-25`.
Likely journey: **9 / trip `1221147` / Hbf–Willy-Brandt-Platz**. Its northbound
Am Fuchsberg platform is `639170`; the next platform is `89420`,
Halberst. Str./Leipz. Str. The next source northbound journey was approximately
20 minutes later. This makes the candidate plausible, not physical-ID proof.

The capture reads actual HTTP-worker fleet/trip responses (not a new process's
empty motion cache), plus the dated stored provider evidence. Request times are
retained; fleet/trip/board reads were not simultaneous.

### Sparse source handling defect

- Raiffeisenstraße had a direct source arrival **18:04:27**, departure
  **18:05:27**. Against scheduled departure 18:04:00, departure delay was **+87s**.
- There were **no direct stop predictions** for Am Fuchsberg, the following
  Halberst./Leipz. stop or Hasselbachplatz in that first stored source snapshot.
- `delay_seconds` on the trip document was **−8s**, matching its first-stop
  delay. The worker can derive this field from the first stop when the provider
  has no explicit trip-wide delay; it must not be treated as a newer observation
  overriding the last known stop departure.
- The deployed `_predicted_stop_timeline` chooses a missing stop's fallback as
  `stop_delays[stop_id]`, otherwise that generic `trip_delay`. It does **not**
  carry the latest known local departure delay to downstream missing updates.
- Consequently, PERIX's source-derived fallback for Am Fuchsberg was
  **18:05:52** (18:06:00 minus eight seconds), only 25s after the already-known
  Raiffeisen departure. This was **our inferred fallback**, not a direct MVB
  prediction for Am Fuchsberg.
- The captured effective motion-plan detail assigned approximately **18:06**
  to Am Fuchsberg and **18:07** to the next stop. At capture time both were
  marked passed. Those are retained model clocks, not a historic recording of
  the user's browser at the exact observed moment.

### Independent later provider update

Direct protobuf feed capture at **18:19:55 Berlin feed generation time** found
the same dated trip with 20 stop updates, no explicit trip-wide `delay`, and no
per-trip update timestamp:

| Stop | Later provider arrival | Later provider departure |
| --- | --- | --- |
| Raiffeisenstraße | 18:04:27 | 18:05:30 |
| Am Fuchsberg | **18:07:15** | **18:07:30** |
| Halberst. Str./Leipz. Str. | **18:08:49** | **18:09:09** |
| Hasselbachplatz | 18:11:39 | 18:12:00 |

This strongly matches the reported sequence: the model's next-stop clock was
around 18:07 while the later provider timestamp placed the tram at Am Fuchsberg
at 18:07:15. Provider timestamps remain provider evidence, not independently
measured GPS. We did not archive the raw feed at the initial observed instant,
so the origin/timing of the sparse-update gap (provider vs ingestion) is not
certified. A fresh feed header alone does not certify a fresh observed position.

## Offline reproduction — no production patch applied

The pure timeline functions from the last verified production artifact
reproduce **every captured source-timeline arrival/departure exactly** using
the saved schedule and realtime snapshot. A separate in-memory hypothetical
variant carries the most recent known departure delay until another explicit
update (with NO_DATA reset and skipped-stop handling). Source records stay
unchanged.

| Stop | Existing fallback | Hypothetical +87s propagation | Difference |
| --- | --- | --- | ---: |
| Am Fuchsberg | 18:05:52 | **18:07:27** | **95s** |
| Halberst. Str./Leipz. Str. | 18:06:52 | **18:08:27** | **95s** |
| Hasselbachplatz | 18:09:52 | **18:11:27** | **95s** |

The 12-second difference between that hypothetical Am Fuchsberg estimate and
the later provider arrival is **not** a measured accuracy certification or a
reason to hardcode a correction. It demonstrates why the lost local delay can
create an approximately 1–2 minute lead. Current +01:00 epoch conversion and
the captured timeline agree; this sample does not indicate a one-hour DST bug.

## Required correction, not authorized/applied by this question

1. Propagate the latest applicable **departure** delay through sparse downstream
   updates, rather than resetting to a derived first-stop/trip fallback.
   Preserve direct provider clocks separately from derived timing/provenance.
2. Resolve/revalidate the existing motion plan from the corrected timeline.
   A cached already-ahead projection must not silently override later credible
   source evidence. Do not teleport real GPS or add a fixed two-minute offset.
3. Regress NO_DATA, SKIPPED, cancellation/deletion, arrival-vs-departure dwell,
   repeated occurrences, epoch-only updates and exact dated/versioned isolation.
   Test shared position/arrival/detail clocks and handover/cache behavior.
4. Distinguish a freshly computed estimate or fresh global feed header from an
   independently observed vehicle location. Retain enough bounded historical
   evidence to match a future field report to its exact dated journey.

The sparse-update defect is reproduced. Exact matching to the user's physical
tram still requires its approximate stop time/selected journey; no physical
vehicle identity or five-minute browser history was invented. The recent SVG
size/grouping release does not compute or advance this backend timeline.

## Retained evidence

`C:\Users\PC\AppData\Local\Temp\opencode\perix-am-fuchsberg-9`:

- `capture-20261025-171257.json`: initial source snapshot and warm-worker reads.
- `offline-replay.json`: exact reproduction and hypothetical propagation result.
- `raw-feed-20261025-172020.json`: later direct protobuf evidence, target trips only.

Audit scripts are retained beside that folder. They use no API mutations, paid
Routes calls or account fixtures. Shared backend WIP was not overwritten.
