# Magdeburg: stop, position and imminent-arrival audit

Read-only production audit. No runtime changes, activation, deployment, account
mutation, Google Routes request or test-suite rerun.

Window: 2026-10-23 22:41–22:42 UTC / **2026-10-24 00:41–00:42 Europe/Berlin**.
Deployment: `4211552f-697f-49da-b8d9-e814064bdc4e`.

## Results

| Question | Observed result | Qualification |
| --- | --- | --- |
| Correct current GTFS calendar date? | PASS: service_date 2026-10-24, net_9a2c2928a241, 2683 trips | Saturday has a different service set from Friday; a lower count alone is not missing data |
| Today's generation readiness? | PASS: 128/128 ready/current; zero missing/stale in stored report | Readiness is not independent operator-route or on-site stop verification |
| Visible map data? | 129 line entries / 128 distinct pattern IDs, 288 physical stop groups, 703 platform records | Includes dated carryover; identical pattern IDs across dated entries are not necessarily different lines |
| Visible fleet? | 17 buses: 14 realtime estimates, 3 schedule estimates | No GPS vehicles and no operating tram in this nighttime sample; this does not certify tram behaviour at another time |
| Vehicles on their available pattern geometry? | 16/16 within 10m; maximum nearest-line error rounded to 0.000m | One further vehicle was a stationary turnaround anchor without a current pattern, not an off-line moving vehicle |
| Frontend progress projection agrees with API position? | 16/16 within 10m; maximum 0.047m | Geometric/internal consistency only, not independent physical vehicle location |
| Platform-to-line validation in published payload? | All lines valid; maximum reported platform distance 30.2m | Platform and street/track centreline coordinates are not identical |
| Does 0–1 minute guarantee the vehicle is beside the displayed stop? | **FAIL / not guaranteed** | Confirmed platform-distance attribution and motion-plan/time-prediction discrepancies below |
| Are all real vehicles visible? | UNKNOWN | Virtual trip/run representations do not constitute a measured fleet inventory |

## Concrete imminent-arrival samples

Arrivals were read for 13 physical stop groups associated with fleet next stops.
The fleet and board reads are close in time but not simultaneous; differences
of several seconds account for some distance differences.

| Route / trip | Stop | Board ETA | Board distance | What the source data actually shows |
| --- | --- | --- | --- | --- |
| N1 / 979177 | Allee - Center | 14s | 35m to grouped stop point | Initial fleet position was 91.6m from actual platform 309656; path distance 92m. Do not treat the grouped distance as boarding-platform distance. |
| N2 / 538125 | Domplatz | 4s | 153m to grouped stop point | Actual next platform 408769 was 23.6m from initial position; path distance 30m. The displayed group point is on the other side/position. This is NOT proof the vehicle was 153m from its boarding platform. |
| N8 / 109883 | Virchowstraße | 56s | 1333m | A real time/position mismatch remains: the vehicle's current physical leg is toward AOK, before Virchowstraße. Motion diagnostics report PHYSICS_LIMITED, 175.01s carried lateness and 250.91s arrival-target error for the current leg. The imminent board time does not derive from that effective plan. |

All three board rows were tagged REALTIME, but their positions were ESTIMATED.
The retained sample's provider feed timestamp was 22:41:20 UTC and update time
22:41:32 UTC. A position age of zero/one second measures a freshly computed
estimate; it is not proof of a new GPS observation or a one-second-old feed.

The N9 anchor (`trip 1071829`) has `position_state=TURNAROUND_ANCHOR`, no current
pattern/progress and no next-stop assignment. It should not be interpreted as a
moving, precisely located real vehicle simply because it has an icon.

## Proven code paths

The following refer to the inspected deployed release source, not unmerged WIP:

1. `mobility/arrivals.py` builds the stop's platform set, then uses the group's
   representative latitude/longitude for distance. It does not use the actual
   serving `entry.stop_id` platform coordinates. For Domplatz the group contains
   platforms 611034 and 408769 at different positions. Platform 611034 supplies
   the group point even when the trip serves 408769.
2. The same endpoint derives ETA from `_predicted_stop_timeline`, while vehicle
   progress comes from `motion.engine.position_for_trip` and its constrained
   plan. This release does not feed the cached effective stop times back into
   the board and selected-trip timeline. Agreement between two time panels does
   not establish agreement with the moving marker.
3. Board eligibility requires raw predicted arrival >= now. When a physics-
   delayed virtual vehicle has not reached the stop, that board row can disappear
   as the raw time passes. It does not independently prove the vehicle passed.
4. `mobility/eta_position.py` is explicitly a generous lower-bound check (bus
   ceiling 110km/h, plus a distance threshold). Therefore
   `PLAUSIBLE_LOWER_BOUND_ONLY` does not mean nearby, reachable under the actual
   urban leg constraints, or independently position-verified. N8's row still
   passes that coarse check.
5. Frontend `getBusesServing` uses ceil(eta_seconds / 60). Thus `1′` means
   1–60 seconds; `0′` is time rounding, not a proximity trigger. The adapter also
   defaults absent eta_seconds to zero, which is unsafe if an incomplete response
   ever reaches it. No missing eta_seconds was observed in this sample.
6. A selected platform is retained in Locator UI state, but the arrivals request
   sends the physical stop ID without that platform selection. Direction-specific
   selection and physical-stop aggregate boards must be distinguished explicitly.

## Smallest required correction, not applied by this audit

- Return the actually served platform ID/coordinates and calculate distance to
  it; honour an explicitly selected platform while retaining aggregate stop mode.
- Use one existing cached effective motion-plan timeline for virtual position,
  next-stop ETA, boards and selected-trip details, with dated/versioned identity.
  Keep raw GTFS-RT predictions separately rather than overwriting source evidence;
  never alter genuine GPS to make it agree with a model.
- Do not turn an unknown ETA into zero or equate expired predicted time with
  having physically passed. Explicitly display unknown/inconsistent/stale data.
- Distinguish REALTIME-derived ETA, modelled position and actual GPS. Show actual
  feed age, not merely the age of the latest computed estimate.

The remaining physical accuracy cannot be guaranteed without independent GPS or
field/reference observations. Fixing the internal discrepancies is necessary but
does not by itself supply that ground truth.

## Retained evidence

Local raw payloads, stop-board results, geometry comparisons and near-arrival
rows: `C:/Users/PC/AppData/Local/Temp/opencode/perix-stop-eta-audit-20261023-224151/`.
No credentials, account data or paid-provider payloads are included.
