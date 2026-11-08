# Last-minute marker / ETA synchronization — production-source audit

## Outcome / minimum patch

The additional proven defect is **frontend interpolation delay**, not a missing
last-minute solver. The actual production map animates each new moving sample
over the *preceding polling interval*, leaving the rendered virtual vehicle
behind the backend position/ETA clock by another poll.

Only `frontend/public/google-mobility-map.html` changes at runtime: **6 added
lines, 1 removed line (net +5)**. New tests are in
`frontend/tests/last-minute-marker-sync.test.cjs` (156 lines / 12 cases).
The production-specific HTML patch is the same small change against the
hash-verified extracted served HTML, not against the dirty frontend bundle.

For **estimated bus/tram** samples with finite canonical progress moving forward,
reuse the existing authoritative positioning branch rather than start another
poll-length tween. Never extrapolate, invent a speed curve, advance a stop
clock or infer boarding from an ETA. The existing backward-jitter guard remains
in place; actual GPS and taxis keep their previous interpolation behavior.

The consequence is deliberate **sample-and-hold between polls**. The update
can be visibly stepped instead of continuously gliding one poll behind.
It removes added presentation latency, not polling/network/sample age. It
does not guarantee exact wall-clock arrival between missing/stale packets or
fabricate unreceived positions to make animation smooth.

**No backend files changed.** The rejected 79-line patch and the old departure
floor were not applied to production. All pre-existing local WIP was retained:
503 of 504 snapshotted pre-existing source files are byte-unchanged; the sole
modified file is the HTML above. All 281 frozen production package files remain
unchanged. No commit, deployment, GTFS activation, real Google request, billing
change or production mutation was performed.

## Exact synchronization audit

`backend-replay.json` contains 17 deterministic packets generated through the
**actual hash-verified production `position_for_trip()`**, with its existing
cache/revisions, handover, fitter and effective timeline. Database and traffic
boundaries were mocked and the dummy database client closed; the production
source itself was not edited.

`synchronization-trace.json` executes the actual original/candidate map scripts
against those *same* packets and records, per packet:

- exact trip instance, actual replay motion-plan revision and server timestamp;
- raw GTFS-RT target clock, effective physical arrival, and remaining distance;
- backend canonical progress/speed;
- coordinates passed to the frontend marker renderer and their canonical
  progress;
- effective ETA seconds and displayed rounded minutes;
- added renderer lag/duration and model-only position assurance.

These timestamps and raw forecasts are **controlled synthetic replay clocks**,
not the forecasts historically available at Museum around 00:35. Google SDK/DOM
boundaries are stubbed: the real map animation code and `setPosition` output
are executed, but live Google pixels/hardware rendering were not loaded or
measured. There was no active PERIX browser page to inspect without loading a
new Google map. No claim is made of an observed live-app accuracy improvement.

The existing production frontend entry hash was also verified and its actual
minified ETA expression inspected: `Math.max(0, Math.ceil(eta_seconds / 60))`.
Therefore **45 seconds → 1 minute is correct**, not evidence of late arrival.
The rounding and ETA adapter are unchanged by this patch.

## Before / after on identical packets

| Case | Additional frontend progress lag before | After |
|---|---:|---:|
| Last-minute packet, same trip/plan revision, four-second interval | 34.9067 m / 4 s tween | < 0.00001 m / no extra tween |
| New absolute arrival target 30 s earlier | 15.7570 m / 4 s tween | < 0.00001 m |
| Two-second modeled stop entirely between polls | 5.6801 m / 8 s tween | < 0.00001 m |
| First departing sample after stop/dwell | 0.2790 m / 1 s tween | < 0.00001 m |
| Two N5 and one N4, independent identities | up to 34.9067 m | < 0.00001 m |

At the **exact modeled arrival** the backend, effective ETA and marker already
agree at the 400 m fixture stop anchor; that was not falsely reported as a new
fix. The existing zero-speed/DWELL branch was already correct. The defect
reappeared while moving and when a brief dwell was not sampled by a poll.
The replay preserves the explicit two-second source dwell and continues toward
the next stop afterwards. It does not impose that duration as an operator-wide
minimum or add another adaptive-dwell policy.

The 30-second source revision moves all three upcoming targets consistently;
the existing production solver applies it from its current state. No new
three-stop controller is justified by this rendering defect. Real stop service,
binding departure clocks, physics limits, source/passage gates, GPS handling,
canonical geometry, contexts and the effective ETA resolver remain untouched.
All no-GPS cases remain **MODEL_ESTIMATE**, never observed GPS arrival/boarding.

## Hasselbachplatz → Museum speed-cap audit

Read-only current OSM way responses were compared to the captured audited OSM
source, including identical node-ID sequences and tags:

| Way | Version | Classification/access | Posted maxspeed in OSM |
|---|---:|---|---|
| 197614351 | 4 | service; access=no, bus=yes, psv=yes, taxi=no | absent |
| 197614346 | 3 | service; access=no, bus=yes, psv=yes, taxi=no | absent |
| 681222605 | 2 | service; access=no, bus=yes, psv=yes, taxi=no | absent |

These are explicitly bus/PSV-access service links, not evidence that a generic
25 km/h value is a posted legal limit. Conversely absent `maxspeed` does **not**
verify a legal 50 km/h limit. On the captured 394.60 m canonical leg, the unchanged
production fallback still produces an effective cap of 25 km/h and a fastest
rest-to-rest duration of 62.211 s. The existing source/model conflict of
42–48 s versus 62.211 s remains separate and unresolved; no speed cap was raised.
This frontend patch must not be presented as fixing all historical Museum lag.

## Tests and protected work

- New production-renderer regressions: **12/12 passed** after the patch.
- Original hash-verified renderer: **6/12 failed** the added synchronization
  assertions; the other 6 passed. The original failures are preserved.
- Entire local frontend Node suite: **98 passed**, no skips/failures.
- Verified production motion suite: **30 passed**, no skips/failures.
- Relevant local backend regression: **559 passed**, no skips/failures;
  one existing `python_multipart` deprecation warning.
- Both local and production HTML patches passed forward/reverse checks.

No older user tests were edited. Tests cover 45 s rounding, a 30 s forecast
advance, last-minute bus/tram rendering, fast stop/continuation, anchor timing,
two N5 + one N4 identities, no extrapolation, unchanged GPS/taxi interpolation,
backward jitter, missing progress and no false GPS arrival evidence.

## Files and reproduction

- `local-task-only.patch`, `production-html-only.patch`, `patch-verification.json`.
- `backend-replay.json`, `synchronization-trace.json`, `osm-audit.json`.
- `production-rounding-evidence.json`, preserved before/after TAP reports.
- `frontend-regressions.tap`, `production-motion-regressions.xml`,
  `local-backend-regressions.xml`.

From `Perix-main/frontend`:

```text
node --test tests/last-minute-marker-sync.test.cjs
```

`PERIX_SYNC_MAP_HTML` can select an extracted original/candidate production HTML
and `PERIX_SYNC_REPLAY` can select the saved packet file. The private snapshot,
frozen-source packet generator and trace runner are retained in the approved
temporary `perix-last-minute-sync-20261027` directory. No frontend rebuild or
served asset replacement has been performed.
