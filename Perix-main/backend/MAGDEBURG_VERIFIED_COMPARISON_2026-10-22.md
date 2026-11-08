# Magdeburg Verified Comparison, 2026-10-22

## Outcome

Staging realtime acceptance is **FAIL in the supplied 06:33 UTC evidence**.
Live public GETs independently establish different active network versions,
different advertised service dates and different static trip inventories between
staging and `https://api.perixapp.com`. They do **not** establish the cause of
the staging rejections or conclusively map that public API to the supplied
Railway `production/backend` service. Exact production/staging feed checksum,
deployed normalization and matcher-date comparison remain **UNKNOWN**.

Only this new report was created. No application/helper/test edits, matcher
relaxation, environment changes, login, database commands, activation, deployment,
commit, island work, traffic implementation or paid API calls were performed.
Existing WIP was preserved. No environment-variable values or credentials were
read or printed. No national GTFS or GTFS-RT feed was downloaded.

## Evidence Provenance

**Supplied evidence, not this task's live measurement:**
`C:/Users/PC/Downloads/PERIX_NEXT_BLOCKERS_VERIFIED_DELTA_2026-10-22/PERIX_READ_ONLY_RESOLUTION_REPORT_2026-10-22.md`,
lines 5-9, reports connected read-only Railway logs near **2026-10-22 06:33 UTC**:

| Supplied field | production/backend | staging/backend-staging |
| --- | --- | --- |
| National TripUpdates | 111481 | 111607 |
| Active static trips | 3776 | 3778 |
| Matched / stored | 448 / 448 | 0 / 0 |
| Identity rejected | Not supplied | 111607 |
| UNKNOWN_OR_DUPLICATE_TRIP | Not supplied | 111218 |
| WRONG_START_DATE | Not supplied | 389 |
| Latest deployment status | SUCCESS | SUCCESS |

`111218 + 389 = 111607`: the supplied staging rejection counters account for
the supplied total. The combined unknown-or-duplicate code does not distinguish
unknown IDs from duplicates. These are national feed totals, not proof that 448
accepted updates are exclusively MVB vehicles. Different polling cycles need
not have equal TripUpdate totals. Deployment SUCCESS is not matcher acceptance.

The supplied report says `MOBILITY_STATIC_GTFS_URL` exists in both services and
`MOBILITY_REGION_PROXIES_JSON` exists only in production; values were redacted.
Names alone do not establish effective source, proxy behavior or root cause.

Existing local reports read, without edits:

- `MOBILITY_TRAFFIC_STAGING.md`: 2026-10-21 service/domain inventory identifies
  `api.perixapp.com` as service `Perix`, distinct from `backend`; associates
  `app.perixapp.com` with `backend`, where `/api/version` was 404.
- `ISLAND_AND_MAGDEBURG_CHECK_2026-10-22.md`: earlier staging samples beginning
  06:08 UTC, active version `net_edd91342e6bf`, 3778 trips, expired Railway OAuth,
  and older 262-match/date-rejection claims explicitly marked historical.

The new supplied 06:33 evidence supersedes those older matcher counts for this
comparison; it does not resolve the service/domain mapping uncertainty.

## Live Read-Only Findings

`railway status --json` failed with `invalid_grant` / `Unauthorized`. No login
or further Railway access was attempted. This does not contradict the user's
separate working ChatGPT Railway connection. No live Railway logs, deployment
IDs, source revisions, variables or database records were obtained here.

Public unauthenticated GETs used only:

- `/api/version`
- `/api/mobility/v2/diagnostic/region`
- `/api/mobility/v2/networks`
- `/api/mobility/network`

Staging origin: `https://backend-staging-staging-7ada.up.railway.app`.
Public production **candidate**, not confirmed `production/backend`:
`https://api.perixapp.com`.
`/api/version` returned 404 at both `https://app.perixapp.com` and the historical
test origin `https://backend-production-1968.up.railway.app`.

Successful detailed samples were collected at **06:47:03-06:47:06 UTC** for
staging, **06:47:23-06:47:27 UTC** for the candidate, and a two-origin inventory
comparison ending **06:47:43 UTC**. These are not simultaneous with the supplied
06:33 logs. An initial Python-urllib candidate request received HTTP 403;
ordinary GETs with a browser User-Agent succeeded, as did the web-fetch tool.
No authentication was added.

### Exact Field Table

PASS means the stated check was demonstrated; FAIL means the stated parity or
acceptance check failed; UNKNOWN means required evidence is absent. Unless
explicitly marked supplied, comparisons below are candidate versus staging,
not authenticated Railway production versus staging.

| Field / check | Production candidate live | Staging live | Result |
| --- | --- | --- | --- |
| Public origin is supplied Railway service | Conflicts with prior service inventory; mapping unavailable | Matches prior staging inventory | UNKNOWN |
| Active network present | `net_5fbfda99c0dd` | `net_edd91342e6bf` | PASS |
| Active version equality | `net_5fbfda99c0dd` | `net_edd91342e6bf` | FAIL |
| Region / network equality | `magdeburg` / `de-magdeburg-mvb` | Same | PASS |
| Exact deployed code revision | `git_sha` and `built_at` empty | Both empty | UNKNOWN |
| Network name | `Magdeburg transit 2026-10-22` | `Magdeburg transit 2026-10-20` | FAIL |
| Imported at UTC | `2026-10-22T03:26:54.669605+00:00` | `2026-10-20T10:40:13.904816+00:00` | FAIL |
| Advertised service date equals 2026-10-22 | `2026-10-22` | `2026-10-20` | FAIL |
| Actual matcher service date / RT start_date alignment | Not exposed | Not exposed | UNKNOWN |
| Timezone equality | `Europe/Berlin` | `Europe/Berlin` | PASS |
| Service-day boundary equality | 04:00 local | 04:00 local | PASS |
| Agency selection configuration equality | `Magdeburger Verkehrsbetriebe\|\bMVB\b` (regex alternation, not literal pipe) | Same | PASS |
| Mode configuration equality | bus, tram | bus, tram | PASS |
| Static archive SHA-256 equality | Not exposed | Not exposed | UNKNOWN |
| Public static-source locator fingerprint equality | Empty/absent diagnostic locator | Nonempty diagnostic locator | FAIL |
| Public realtime-source locator fingerprint equality | See hashes below | Same fingerprint | PASS |
| Route count equality | 34 | 34 | PASS |
| Static trip count equality | 3776 | 3778 | FAIL |
| Static trip-ID set equality | 3776 unique IDs | 3778 unique IDs | FAIL |
| Duplicate trip_id within returned static inventory | 0 | 0 | PASS |
| Static ID shape equality | All ASCII digit strings, lengths 4-7 | All ASCII digit strings, lengths 4-7 | PASS |
| Deployed static/RT normalization and compound identity equality | Not exposed | Not exposed | UNKNOWN |
| Public agency inventory parity | `gtfs_agency_ids` absent on all 34 routes | All 34 routes carry `["190"]` | FAIL |
| Agency 190 independently verified as MVB / accepted updates MVB-only | No mapping or accepted samples | No agency-name mapping or accepted samples | UNKNOWN |
| Realtime acceptance, supplied 06:33 logs only | Railway production: 448 matched / stored | Railway staging: 0 matched / stored | FAIL |
| Realtime acceptance remeasured live in this task | Not measured | Not measured | UNKNOWN |
| Proven causal explanation for zero matches | Not available | Not available | UNKNOWN |

The regex in the table is the same on both public responses; its actual value
is `Magdeburger Verkehrsbetriebe|\bMVB\b`. Configured selection is not evidence
that every imported or accepted record belongs to that operator.

### Fingerprints And Identity

These hashes were computed in memory from public responses, not environment
values. Source-locator fingerprints hash the diagnostic string or empty string
if absent/null. They are **not archive checksums** and cannot prove the effective
worker feed or imported bytes are identical/different.

| SHA-256 fingerprint | Production candidate | Staging |
| --- | --- | --- |
| Public static-source locator | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | `c7257f31cf06b3d266e135361b44113d6d69e5dc4c381efbaccbb3ef97f19d97` |
| Public realtime-source locator | `001b918f0eec67de751140edc011584e0e5bea93dca6d19af1c8caf07f7e5fce` | `001b918f0eec67de751140edc011584e0e5bea93dca6d19af1c8caf07f7e5fce` |
| Sorted static trip IDs | `19de5e47b0f8f17495e5ae7bc29dd1210b6b5deda62c4ad97dffb8345b3ca044` | `51632b4d102c5c7c8803ffdc6db73ad451c650ce3b32879c89feb0a1ead3285e` |
| Returned routes payload | `33f9759586d869fe97df8feb5e8ac6d80b5a322c78535c86d181b4aebe205b20` | `b51e71ea5b1e049ae6c6b55076f7d9666e6e59a10fbcebc93d537adbd4c115ab` |

Inventory hash method: collect every returned trip's `str(trip_id)`, sort
lexicographically, serialize with Python `json.dumps(..., sort_keys=True,
separators=(',', ':'), ensure_ascii=True)`, UTF-8 encode, SHA-256. Route hash
uses the same serialization on the returned `routes` array, retaining array
order. Route hashes include schema/geometry and are not normalized GTFS-content
hashes. Network version IDs are identifiers, not asserted content hashes.

The later two-origin comparison confirmed the same versions and found **3398
shared exact static IDs**, **378 candidate-only**, **380 staging-only**.

| Static trip_id length | Production candidate count | Staging count |
| --- | --- | --- |
| 4 digits | 13 | 17 |
| 5 digits | 194 | 195 |
| 6 digits | 1750 | 1736 |
| 7 digits | 1819 | 1830 |

Safe static-ID sample: the lexicographically first ID in both inventories has
shape `digits:7` and SHA-256
`6cce36d9f8a9e151b100234af75cca89d55bcb94c153f51847debdf1f39cae45`.
No prefix stripping, numeric coercion, namespace rewriting or matcher
normalization was applied. Static-ID uniqueness does not exclude duplicate RT
entities, collisions in another scope or rejection by a compound identity.

Staging exposes per-trip `gtfs_route_id`, `direction_id`, `service_id` and
`stop_sequences`, plus route `gtfs_route_ids` / `gtfs_agency_ids`. The candidate
does not expose these fields in the sampled route/trip payloads. Neither
exposes per-trip service date or RT descriptor normalization through these
responses. Schema drift is observed, not a proven matcher defect.

## Interpretation Limits

- The stale advertised staging date is verified. Local
  `mobility/domain.py:60-74` derives this public date from network name, then
  import time. It is not an independent calendar evaluation or the deployed
  matcher's actual comparison date. No timezone-bug diagnosis is established.
- At supplied 06:33 UTC on 2026-10-22, Europe/Berlin is 08:33 CEST, after the
  reported 04:00 boundary. That arithmetic does not establish how deployed code
  interprets GTFS times beyond 24:00 or RT `start_date`.
- Local `utils/mobility_workers.py:192-196` uses direct trip-ID membership;
  the supplied rejection codes are not explained by that local worker.
  Empty deployed revision fields prevent treating local behavior as deployed
  matcher evidence.
- Local `utils/mobility_workers.py:410-417` computes archive SHA-256 and uses
  `mobility_sync_state` key
  `static_sha256:magdeburg:de-magdeburg-mvb`. It is a potential authorized
  read-only evidence source, not a database value retrieved here. The national
  archive need not be downloaded to request that summary.
- Public network reads call `_get_active_network`; local
  `routes/mobility.py:1727-1749` contains a legacy lazy-scope backfill. These
  were ordinary public GETs with no mutation request, but read-only HTTP intent
  cannot certify absence of internal server writes. No direct database access
  or migration was executed by this task.

## Remaining Evidence

1. Authorized read-only mapping of public hostnames to Railway project,
   environment, service ID and active deployment ID/source revision for both
   `production/backend` and `staging/backend-staging`. Until then, candidate
   observations must not be relabeled authenticated production observations.
2. Same-window redacted summaries for those exact deployments: active version,
   import time, selected service date, timezone/boundary, static schema version,
   effective imported archive SHA-256 (with linkage to the active version), and
   agency IDs/names/counts. A last-downloaded checksum without successful-import
   linkage is insufficient. Do not expose credentials or raw config values.
3. Safe matched/rejected RT samples from one recorded poll in each service:
   feed header timestamp, hashed raw and normalized trip IDs with ID shape,
   normalized route/direction/agency scope, `start_date`, `start_time`, schedule
   relationship, static candidate count, selected static service date and exact
   rejection reason. Split unknown from duplicate where diagnostics allow.
4. Deployed identity/date rules and namespace handling tied to source revisions,
   plus relevant static calendar/calendar_dates outcomes. Compare one of the
   389 date rejects against its actual static candidate, and unknown/duplicate
   rejects against the effective scoped index. National counts alone cannot
   prove MVB-only acceptance or explain the zero-match result.

No cause is asserted and no matcher relaxation or configuration copy is
recommended. Offline tests would not supply the missing deployment evidence;
no diagnostic helper or test was justified for this documentation-only task.
