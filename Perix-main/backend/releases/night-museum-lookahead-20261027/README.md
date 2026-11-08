# Museum / Otto-von-Guericke-Straße night-bus timing investigation

## Reported symptom

The user observed real buses at Haeckelstraße/Museum while their PERIX markers
were still behind, specifically near Otto-von-Guericke-Straße 69. This is a
human-observed marker lag. No claim is made that the observation did not occur.
The approximate observation window was midnight through about 00:35 on
2026-10-27, with N5 and N4 mentioned. Individual physical buses cannot be bound
uniquely to trip IDs from that description alone.

## Read-only findings

Production deployment remained `86787584-b517-4c4a-acbb-da7ef325add5`.
No production data/configuration was changed and no feature was enabled.
The wait-only prototype and native recalibration were both off.

Ten scheduled Museum passages were found in the 23:40–01:00 Berlin window,
across service dates 2026-10-26 and 2026-10-27. Dates and stop occurrences were
kept distinct, including 24+ hour scheduled times and opposite platforms.
The relevant northbound sequence is Hasselbachplatz → Haeckelstraße/Museum →
Verkehrsbetriebe → City Carré / Ersatzh.

Retained GTFS-RT event timestamps for two candidate northbound journeys:

| Line / trip | Museum scheduled | Retained Museum arrival | Hasselbach departure → Museum | Museum → Verkehrsbetriebe |
|---|---|---|---|---|
| N4 / `1260011` | 00:39:00 | 00:36:32 | 48 s | 45 s |
| N5 / `107422` | 00:39:00 | 00:36:56 | 42 s | 57 s |

These are retained provider timestamps, not independently measured passage
times and not proof these were the exact buses the user saw. The two-leg
source durations are 93 s and 99 s, versus 120 s scheduled. The approximately
two-minute early Museum timestamps must **not** be interpreted as two minutes
of travel-time saving on this single road segment.

## Concrete model conflict

Using the hash-verified production source and captured ready geometry,
Hasselbachplatz → Museum is approximately **394.60 m**. All three captured OSM
ways on that directed leg have `highway=service` and no stored `maxspeed`:
`197614351`, `197614346`, `681222605`.

The deployed model therefore uses its **fallback 25 km/h**, not a verified
posted 25 km/h restriction. From rest to rest, the fastest modeled traversal
is **62.211 s**, with no modeled signal hold on this leg. The retained source
intervals of 48 s and 42 s are shorter by **14.211 s** and **20.211 s**.
This establishes a model/provider timing conflict that can contribute to lag;
it does not reconstruct the exact historical marker position or total error.

Wait-only recovery cannot eliminate this conflict: there is no signal wait to
remove, and it deliberately preserves the existing movement speed profile.
Current captured static traffic-profile count is zero. Consequently a distinct
calibrated night-time traffic profile is not available in that captured state.

An offline sensitivity experiment, changing only this unposted fallback in a
private calculation, produced 48.114 s at 35 km/h, 44.115 s at 40 km/h,
41.242 s at 45 km/h, and 39.159 s at 50 km/h. These are **hypotheses, not legal
speed recommendations**. No actual limits, global service-road defaults,
acceleration, braking or production settings were changed. Audit directed road
classification, bus access and actual limits before selecting any correction.

## How lookahead should be used

The next and following stop targets should constrain the **current remaining
leg**, not merely be consumed after reaching the intermediate stop. Preserve
separate arrival/departure and dwell constraints at every stop:

1. Establish exact trip/day/version/occurrence and fresh source provenance.
2. Compare the next two explicit targets with the current position/speed and
   the complete remaining physical horizon, including station service.
3. If both targets imply less delay, reduce supported soft traffic/wait
   estimates; do not assume that night or one earlier ETA proves no traffic.
4. If only a downstream target improves, do not assign all its saving upstream.
5. Distinguish verified speed restrictions from uncalibrated fallback values.
   An ETA can reveal a conflict but must not overwrite a known legal limit.
6. Preserve every scheduled stop; no passed-stop inference, teleportation,
   retroactive rewriting or time gain applied twice.

Changing only the ETA target does not fix a model whose own fastest permitted
trajectory is already too slow. The fallback conflict and rolling horizon need
separate treatment, rather than a blanket "faster at night" multiplier.

## Evidence limits

The production realtime collection retains one monotonic-updated document per
dated journey, not successive snapshots. Captured documents were read at about
00:59 Berlin time, **after** the reported passages. They cannot be treated as
the exact forecasts available at 00:35, or used to claim a no-hindsight
predictive backtest. There were no recorded physical GPS observations, and
the marker's historical in-process plan/state was not preserved.

The offline calculations start at rest at each stop and use the retained
source stop-to-stop interval. They are model-feasibility checks, not a replay
of the historical API process. Predictive position improvement has **not**
been measured. Follow-up requires time-aligned source snapshots and marker
states, plus independently timestamped observed arrivals for validation.

Separately, the automatic daily refresh had activated service date 2026-10-27,
network `net_fde2a20dcf86`, at 00:01:21 Berlin, with 157/157 ready and no daily
recovery alarm. This investigation did not trigger that activation.

## Artifacts

- `offline-analysis.json`: captured-source timing and frozen-model feasibility.
- `fallback-sensitivity.json`: explicitly hypothetical calibration experiment.
- `audit-checks.json`: reproducible consistency checks and capture digests.

Raw transit captures remain in the private approved temporary audit directory.
No frontend edits, production writes, deployments, commit or push were done.
