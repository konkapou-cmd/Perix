# MOTION PHYSICS ANALYSIS — internal only

> Internal calibration document. No map rendering change.
> Users keep seeing vehicles, lines, stops as today.
> All rules below plug into `position_for_trip` / `effective_timeline`
> and `explain.py` / `diagnostics.py` only.

Baseline verified in code:
- `Perix-main/backend/mobility/motion/config.py:26` bus `a=0.95 b=1.20 max=50`,
  tram `a=0.80 b=1.00 max=50`, `turn_speed_kmh` bus `{20:35,40:25,70:15}`,
  tram `{20:35,40:28,70:20}`.
- `Perix-main/backend/mobility/motion/common.py:71` `turn_speed_cap_kmh`,
  `Perix-main/backend/mobility/motion/common.py:83` `directed_turn_caps`,
  `Perix-main/backend/mobility/motion/common.py:171` `build_speed_trajectory`
  forward `sqrt(v²+2·a·ds)` / backward `sqrt(v²+2·b·ds)`.
- `Perix-main/backend/mobility/motion/bus.py:19` `_hard_speed_kmh`,
  `Perix-main/backend/mobility/motion/bus.py:38` `build_bus_leg`,
  `Perix-main/backend/mobility/motion/tram.py:17` / `:33` same for tram
  (no road traffic, rail signals off by default).
- `Perix-main/backend/mobility/traffic_profiles.py:19` `BPR_V1_UNCALIBRATED`,
  `BPR_ALPHA=0.15 BPR_BETA=4.0`, `DEFAULT_SPEED_KMH` / `LANE_CAPACITY_VPH`.
- Dwell/signal: `Perix-main/backend/mobility/motion/common.py:29`
  `deterministic_signal_hold_seconds`, bus min 4s / max 50s
  (`config.py:49`), tram min 3s / max 30s (`config.py:67`).

## 1. Screenshot colors — math only

Google traffic overlay is a ratio, not absolute speed:

- green: `v / v_hard ≈ 0.85–1.0`
- yellow: `v / v_hard ≈ 0.5–0.7`
- red: `v / v_hard ≈ 0.2–0.4`

Observed pattern in all screenshots:
red clusters immediately upstream of a node (junction entry,
roundabout entry, signal stop line), yellow is the braking taper
40–120 m before it, green resumes after the node. Mid-link red on a
straight = lane-drop or bus/tram shared-lane friction, not a curve.

Model as cap reduction in `spans` (`common.py:157` `_cap_at`),
never as time stretch. Traffic delay stretch stays in
`bus.py:99` `cap = natural + ratio·(hard-natural)`.

## 2. Road class × lanes — base caps

`_hard_speed_kmh` = `min(config.max_speed, posted or default)`, floor 5.

| highway | default | lanes 1 | lanes 2+ | note |
|---|---|---|---|---|
| motorway/trunk | 50 | 50 | 50 | bus only, rare urban |
| primary | 50 | 40–45 | 50 | Magdeburger Ring, Ernst-Reuter-Allee |
| secondary/tertiary | 50/45 | 30–40 | 45–50 | Große Diesdorfer, Jerichower |
| residential/unclassified | 30/40 | 25–30 | 30 | Sandtorstr., side links |
| service/living | 20/10 | 10–20 | 20 | Florapark, station forecourt |

Lane data: `Perix-main/backend/mobility/infrastructure.py:83`
`_directional_lanes` (`lanes`, `lanes:forward/backward`, `oneway`),
capacity in `Perix-main/backend/mobility/traffic_profiles.py:37`
e.g. primary 1200, residential 750, service 600 vph/lane.
BPR: `v = free / (1 + 0.15·vc⁴)`, `vc = flow / (lanes·cap)`.

New rule R1 (internal): lane-drop factor.
`lanes 2→1`: `cap × 0.8` for 80 m upstream of merge nose.
`lanes 1→2`: no upstream cut, `+10%` accel allowance 60 m after
(handled by existing forward pass, no new code path).
Apply in `refine_scenario_inputs` (`common.py:129`) via
`slow_edge_ids + speed_factor`, or future `lane_drop_factor`.

## 3. Roundabout — circle grade behavior

No superelevation assumed (`e≈0`). Lateral limit:

`v_curve = sqrt(μ·g·R)`, `a_lat = v²/R ≤ μ·g`

- dry bus `μ=0.35`, tram rail `μ=0.25`, wet `×0.7`.
- `R` from OSM `junction=roundabout` polyline fit (min 8 m).
- Entry (yield line −30 m): min(turn cap, 30 bus / 25 tram).
- Circulating: min(turn cap, `v_curve`, 20 bus / 18 tram).
- Exit +30 m: release to span cap via normal forward pass.

Screenshots Erzbergerstr./Gareisstr., Maybachstr. roundabout:
red on entry leg, yellow on circulating arc, green on exit —
matches yield-queue model. Congestion origin = entry, not center.

New rule R2: `roundabout_entry_cap`, `roundabout_circ_cap`,
plugged as `point_speed_caps` at entry/circulating progress
(`bus.py:109`, `tram.py:65` turn-cap loop extended).

## 4. Beige vs gray — buildings vs asphalt

- beige = building blocks / enclosed frontage.
- gray = carriageway / paved apron.
- Narrow gray corridor between beige walls = urban canyon:
  lower `default_speed` one step (e.g. primary→30–40),
  higher dwell variance, parking/friction, pedestrian signals.
- Wide gray apron (station forecourt, Florapark, Hbf) = low
  friction but signal-heavy; delay comes from signals/pedestrians,
  not curvature.

New rule R3 (internal factor, never drawn):
`urban_enclosure = building_area / (building_area + road_area)`
in 50 m buffer. `cap × (1 − 0.15·enclosure)` for bus,
`× (1 − 0.10·enclosure)` for tram (segregated rail less affected).
Computed offline from OSM, stored per edge.

## 5. Forks — single/double, cut-ins

Cases from screenshots (Olvenstedter Graseweg/Holzweg,
Westring/Große Diesdorfer, Schleinufer/Markgrafenstr.):

- 2→1 merge: queue forms upstream on the dropped arm.
  Model: −20% cap 80 m upstream, +15 m HOLD only if signal present.
- 1→2 diverge: no queue; second lane absorbs. No cut.
- Tram shared (`Straßenbahn` on cars): mixed lane = bus rule;
  segregated rail = tram rule (ignore road `vc`).
- Right→left turn across priority: use existing
  `turn_angle_degrees` (`common.py:60`) + `turn_speed_cap_kmh`.
  ≥20°→35, ≥40°→25/28, ≥70°→15/20. Add left-across-traffic
  penalty: bus −5 km/h at intersection box when
  `oneway=no` and crossing ≥2 opposing lanes.

## 6. All speed-affecting inputs (closed list)

1. `hard cap` (posted/default/mode max) — `bus.py:19`, `tram.py:17`.
2. `observed` static BPR — `traffic_profiles.py:92`.
3. `NON_RECOVERABLE` live delta — `bus.py:87`.
4. Turn point caps — `bus.py:109`, `tram.py:65`.
5. Signal HOLD — `bus.py:134`, `tram.py:92`, `common.py:29`.
6. NEW R1 lane-drop, R2 roundabout, R3 enclosure (all as
   `spans`/`point_caps` reductions — same solver, no new engine).

Explicitly out of scope: inventing signal stops, holding at a
passed intersection, GPS positions, fare/occupancy.

## 7. Dwell — bus vs tram, peak vs quiet

Current minima are floors, not targets:
bus 4s (`config.py:50`), tram 3s (`config.py:68`).
Proposed internal table (seconds, departure−arrival):

| mode | central peak | central off-peak | local peak | local quiet |
|---|---|---|---|---|
| tram | 30 | 15–20 | 15 | 10 |
| bus | 20 | 12–15 | 12 | 8–10 |

Centrality = stops/day from GTFS + enclosure factor.
Peak = 06:30–09:00, 15:30–18:30 weekday (`traffic_profiles.py:71`
`_day_type` reuse). Night N-lines = quiet row.
Plugs into `_stop_departure` floor and existing
`station_gate` 5 s detour / 10 s provisional logic — hold longer,
never depart early without new relevant forecast.

## 8. Stop-to-stop baseline + delay prognosis

Per directed pair store (offline, per mode):

`distance_m` (from `stop_progress`), `normal_duration_s`
(free-flow solver output), `vc_base`, `node_type`
(roundabout/signal/merge/central-tram-shared).

Delay-prone points, in order:
1. Signal approach −80 m on primary/secondary.
2. Roundabout entry −30 m (bus) / −40 m (tram).
3. 2→1 merge nose −80 m.
4. Central shared-tram stop (boarding + car friction).
5. Tight turn ≥70° vertex.

When realtime delay grows on a leg, attribute it to the first
downstream point of the above types and pre-apply R1–R3 there;
recover after the node (existing `remaining_eta_spans` /
`REMAINING_ETA_ADJUSTMENT` path). Early arrival on the
next-next stop (`delay` decreased) releases the station gate;
same-value feed without newer provider clock does not.

## 9. Combinable rule set (internal keys)

All via `motion_config_for` (`config.py:83`) region overrides,
no frontend change:

- `lane_drop_factor: 0.8, lane_drop_window_m: 80`
- `roundabout_entry_kmh: {bus:30, tram:25}`,
  `roundabout_circ_kmh: {bus:20, tram:18}`
- `urban_enclosure_factor: {bus:0.15, tram:0.10}`
- `dwell_table: {bus:{...}, tram:{...}}` per §7
- `left_across_penalty_kmh: 5`

Solver order per leg: hard → BPR observed → R3 → R1 → R2/turn →
signal HOLD → dwell. Each step is a min-cap; combination is
multiplicative-min, order-independent.

## 10. Offline calibration (no deploy)

Run 2026-10-30, synthetic 1000 m leg, `common.py:171` solver only:

- baseline 50 km/h: 85.10 s
- R1 lane-drop 2→1 (last 80 m ×0.8): 85.62 s (+0.52 s)
- R2 roundabout point cap 20 at 500 m: 89.81 s (+4.71 s)
- R3 enclosure ×0.85 (42.5 km/h): 95.84 s (+10.74 s)
- turn ≥70°: bus 15 / tram 20 (`config.py:41`)
- `v_curve=sqrt(μ·g·R)`: R15 bus 25.8 / tram 21.8,
  R25 bus 33.4 km/h → circulating caps 20/18 stay binding.

Suites green: `tests/test_mobility_motion_common.py`,
`tests/test_mobility_motion_bus_tram.py`,
`tests/test_mobility_time_allocation.py` — 116 passed.
Map output untouched; only ETA/diagnostics change.

No new endpoint, worker, DB collection, or billable traffic call.
No signal-stop invention. Museum 25 km/h fallback unchanged.
