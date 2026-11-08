# Magdeburg Deployment Identity Diff

Documentation-only investigation, 2026-10-22. The two deliverables below are
the evidence/code diff and the smallest remaining read-only evidence request.
Only this file was added. Existing WIP was preserved; no application, helper,
test, matcher, GTFS or environment changes, test suite, login, database query,
public endpoint request, deployment or paid external call was performed.

## 1. Evidence And Identity Diff

### Authenticated Railway Evidence

The user's newly supplied authenticated Railway sample is **2026-10-22
06:56 UTC**, not a measurement independently collected by this task:

| Field | production/backend | staging/backend-staging |
| --- | --- | --- |
| Incoming TripUpdates | 105993 | 105993 |
| Reported active static count | 3776 | 3778 |
| Matched | 450 | 0 |
| Stored, rejection totals and rejection breakdown | Not supplied | Not supplied |
| Deployment ID / source revision | Not supplied | Not supplied |
| Active network version / actual selected static date | Not supplied | Not supplied |
| Unique / duplicate static IDs; sorted-set SHA-256 | Not supplied | Not supplied |
| Sync-state checksum / schema fingerprint | Not supplied | Not supplied |
| Effective region / network / timezone / boundary | Not supplied in this sample | Not supplied in this sample |
| Deployed identity and date-rule fingerprint | Not supplied | Not supplied |
| Rejected descriptor start_date / actual expected date | Not supplied | Not supplied |

**Proven:** staging acceptance remains zero while production accepts 450 in the
supplied window. Equal incoming counts do not establish identical feed bytes,
timestamps, entity identities or a synchronized poll. These national feed counts
do not independently establish MVB-only acceptance. Do not infer 105993 identity
rejections, stored counts or a new rejection breakdown from zero matches.

Historical supplied **06:33 UTC** counters in
`MAGDEBURG_VERIFIED_COMPARISON_2026-10-22.md:21-39` were production 111481 incoming,
3776 static, 448 matched/stored; staging 111607 incoming, 3778 static, zero
matched/stored, 111607 identity rejects, split into
`UNKNOWN_OR_DUPLICATE_TRIP=111218` and `WRONG_START_DATE=389`.
The split sums exactly to 111607 but does not separate unknown from duplicate.
Those rejection counters belong to 06:33, not the new 06:56 sample.

### Historical Public Inventory, Not Deployment Proof

No public endpoint was called in this task. The following are transcribed from
`MAGDEBURG_VERIFIED_COMPARISON_2026-10-22.md:71-79,94-119,125-167`, collected around
06:47 UTC. The public production **candidate was never confirmed as Railway
production/backend** and must not be used as its substitute.

| Historical public field | Unconfirmed production candidate | Staging public sample |
| --- | --- | --- |
| Active version | `net_5fbfda99c0dd` | `net_edd91342e6bf` |
| Name-derived advertised date | 2026-10-22 | 2026-10-20 |
| Import timestamp UTC | `2026-10-22T03:26:54.669605+00:00` | `2026-10-20T10:40:13.904816+00:00` |
| Routes / trip occurrences / unique IDs / duplicate excess | 34 / 3776 / 3776 / 0 | 34 / 3778 / 3778 / 0 |
| Region / network | `magdeburg` / `de-magdeburg-mvb` | Same |
| Timezone / day boundary | Europe/Berlin / 04:00 | Same |
| Deployed revision / actual matcher date | Unknown | Unknown |
| Imported archive checksum / sync-state fingerprint | Unknown | Unknown |
| Deployed identity/date-rule fingerprint | Unknown | Unknown |

Historical reported inventory SHA-256 values:

| Inventory | SHA-256 |
| --- | --- |
| Unconfirmed candidate IDs | `19de5e47b0f8f17495e5ae7bc29dd1210b6b5deda62c4ad97dffb8345b3ca044` |
| Public staging IDs | `51632b4d102c5c7c8803ffdc6db73ad451c650ce3b32879c89feb0a1ead3285e` |

The old report hashed sorted `str(trip_id)` **occurrences**, using compact ASCII
JSON and UTF-8 SHA-256. Because it reported no duplicates, these also represent
the sorted unique sets for those historical responses. They were not recomputed
here and are not authenticated 06:56 deployment hashes. The historical sets had
3398 shared IDs, 378 candidate-only and 380 staging-only. Similar counts do not
prove either deployed ID-set identity or mismatch for the authenticated services.
Source-locator hashes in the old report are not archive checksums or sync-state
fingerprints. The earlier report's worker references `192-196` and checksum
references `410-417` are approximate; the precise current ranges are below.

### Actual Local Worker Logic

All paths below are relative to `Perix-main/backend`; these are inspected local
working-tree functions, **not asserted deployed code**.

| Function / lines | Exact local behavior and consequence |
| --- | --- |
| `utils/mobility_workers.py:114-125`, `_active_trip_ids` | Imports and calls `_get_active_network`; it is **not** a direct read-only DB query. Collects truthy `trip_id` values unchanged into a set across all routes. No string conversion, prefix stripping, numeric coercion, compound identity, calendar reevaluation or duplicate rejection. Duplicate values collapse silently. No network returns an empty set. |
| `routes/mobility.py:1714-1750`, `_get_active_network` | First queries active region/network. If absent in Magdeburg, queries legacy unscoped active data and can `update_one` scope fields at 1745-1749. Neither this helper nor public routes calling it are safe evidence-collection substitutes for a direct scoped `find_one`. |
| `utils/mobility_workers.py:160-169` | Caches the set; refreshes when empty or more than 120 monotonic seconds since refresh. Activation can leave a nonempty cached old set for roughly 120 seconds plus cycle/IO time. Empty sets refresh each cycle. No network version is attached to that cache. |
| `utils/mobility_workers.py:178-199` | Counts all TripUpdate entities, skips entities without TripUpdates, skips empty trip IDs, then tests raw RT string membership at 195-197. Never reads `start_date`, `start_time`, route_id or direction_id for identity/date validation. |
| `utils/mobility_workers.py:199-262` | Schedule relationship is interpreted after membership, not used to reject identity. An accepted entity becomes one document, even if another entity has the same trip ID. No unknown/duplicate or wrong-date reason is generated. |
| `utils/mobility_workers.py:278-299` | Upserts by `(region_id, network_id, trip_id)` only, without version or date. Logs `network_trips=len(trip_ids)` (unique set size) and `matched=stored=len(docs)` (accepted entity count, not unique IDs or a DB modified-count). Bulk write must return for that success log to execute. |

Searching repository Python sources found neither `WRONG_START_DATE` nor
`UNKNOWN_OR_DUPLICATE_TRIP`. Thus the supplied staging reason codes cannot be
explained by these two local worker functions alone: deployed code, another
component, or the reported diagnostic attribution differs. A specific deployed
revision or component cannot be identified from the available evidence.
Local duplicate static IDs would not cause zero matches: they are accepted as
one set member. Local duplicate RT entities would not be rejected as duplicates.
Non-string static IDs could fail membership against RT strings, but their
existence in either authenticated deployment is unproven.

### Calendar, Date And Scope Rules

- `utils/gtfs.py:55-76`, `_active_service_ids`: selects the weekday flag within
  inclusive calendar start/end dates, then applies matching `calendar_dates`
  additions (`1`) and removals (`2`) in row order. It skips malformed calendar
  rows. Empty active services cause parsing to fail at 120-122.
- `utils/gtfs.py:99-153`, `_parse_zip`: explicit service_date is parsed as
  `YYYY-MM-DD`; otherwise uses the current **civil date in resolved timezone**,
  with no 04:00 subtraction. Agency names are regex-selected case-insensitively;
  supported route types are 0, 3 and 11. Trips require selected route/service.
  A dict keyed by raw GTFS trip_id overwrites earlier duplicate rows, rather
  than rejecting them. Neither static nor RT identity is namespace-normalized.
- `utils/gtfs.py:203-249,278-286`: keeps trips with at least two usable stop
  times, emits raw trip_id and a date-bearing name plus top-level service_date.
  The emitted trip does not retain service_id, direction_id or gtfs_route_id;
  emitted routes do not retain gtfs_agency_ids. Historical staging's richer
  fields therefore are not explained by this local parser's output alone.
- `utils/mobility_workers.py:427-464,475-476` passes timezone/agency regex but no
  service_date to parsing. `_create_network_version` at
  `routes/mobility.py:1819-1855` stores name, scope, timezone, boundary, routes and
  import time, but not the parser's top-level service_date or archive checksum.
- `mobility/domain.py:60-74`, `_service_date`: first date substring in network
  name wins, otherwise import timestamp in network timezone with boundary
  subtraction, otherwise today's civil date. Thus the public staging date
  **2026-10-20 is an advertised/name-derived date, not necessarily the deployed
  RT matcher's expected date**.
- `routes/mobility.py:335-367,505-522`: local display/service-time helpers shift
  hours before the configured boundary into the previous service day / extended
  hours; GTFS hours >=24 are retained. `_berlin_now` is region-aware despite its
  name. None of these helpers supplies an RT `start_date` comparison in the
  inspected worker. At 06:56 UTC, Europe/Berlin is 08:56 CEST on 2026-10-22,
  after 04:00; this is arithmetic, not proof of a deployed expected date.
- `mobility/regions.py:69-85,145-205`: Magdeburg preset is `magdeburg` /
  `de-magdeburg-mvb`, Europe/Berlin, boundary 4. JSON/environment overrides can
  change effective scope/rules. No environment values were read to resolve them.
  Worker region is captured at module initialization at
  `utils/mobility_workers.py:27-34`; helper lookup resolves active region anew.
- `mobility/motion/handover.py:15-21` defines a separate motion continuity tuple
  including version/pattern/generation. It is not called by the inspected RT
  worker and is not evidence of a compound GTFS-RT matcher.

### Sync-State Meaning

`utils/mobility_workers.py:410-417` hashes downloaded archive bytes and reads key
`static_sha256:<region_id>:<network_id>`. The skip condition at 448-454 also
requires schema `8`, today's date in active name and basic trip/stop fields.
State is replaced at 518-528 with `key`, `region_id`, `network_id`, `value`
(archive SHA-256), and `schema_v`. It contains **no active-version linkage**.
It can advance with auto-activation disabled or when preparation returns a
non-READY candidate (505-518). Consequently even equal scoped sync-state hashes
would not prove that both active networks came from that archive. No deployed
sync-state value or fingerprint is available in this task.

### Calculated Local Snapshot Fingerprints

Computed in memory using Python **3.12.8**, without importing application modules
or writing files: parse source with `ast.parse`, select each top-level function,
hash UTF-8 `ast.dump(node, annotate_fields=True, include_attributes=False)` using
SHA-256. This excludes comments/locations, includes docstrings, and does not
capture module globals, imports' implementations or runtime configuration.
Compare with the same Python/AST method; these are not deployment fingerprints.

| Local function | AST SHA-256 |
| --- | --- |
| `utils/mobility_workers.py::_active_trip_ids` | `416bd5560fd349c830658cb6817abc611fbe3a19cdfeb6cadec55dad8adf16ce` |
| `utils/mobility_workers.py::_realtime_worker` | `65f5d72bd75daf5ddd8aafb386b0157716f07ef9991893351f857220f8d1ba41` |
| `utils/mobility_workers.py::_static_worker` | `aa3703f704646f191e2f17973209f71e9731cb342e3194b933a6fa07e24fb0bf` |
| `utils/gtfs.py::_active_service_ids` | `15d0533449e90da2f19dc7a03fe344097473fffabb4e2215fc31cbdda82c0472` |
| `utils/gtfs.py::_parse_zip` | `596a7686ceae4edf7dba44f1487c9a4b07e6a66770f35c2e6ac937401394eae5` |
| `routes/mobility.py::_get_active_network` | `6b7eb35e9fe7bb1d98e48241bac3c17d21c7ae7c327620f6951e78bddfab9d57` |
| `routes/mobility.py::_time_to_seconds` | `cc95709c41dca5c8124942ed64000326d2d8257aa6e182bc66767df8d7899091` |
| `routes/mobility.py::_berlin_now` | `7b2e9ae195f0d2b78efb928d61f00c72add884a36ed20e7c536db1285c05b931` |
| `routes/mobility.py::_service_date_key` | `b910f70dca5121994b4a1ff2dd675182771cc311c3b893c4094b2dc07220d036` |
| `routes/mobility.py::_epoch_to_service_seconds` | `af44b2116661f7d34b13ecb567f6f747154314a41fadfaab4d430410b57da6a7` |
| `routes/mobility.py::_create_network_version` | `5c747d8085033167335315422a1f9bd08f1e01acca62a725fcfad93c3a4a84a6` |
| `mobility/domain.py::_service_date` | `a5b0eda6dd96af2249c359fe263014cd30b8e30c396ea8d21db02b4680501d60` |
| `mobility/regions.py::get_region` | `88885fef0536b22f713d5da943e05d6c36cf589c04d7105f7cc56e444551d71a` |
| `mobility/regions.py::get_active_region` | `c3f6418cff55d3e1e193770d25ad56324ec689ad8cbf73bc849c86396ef8c5b6` |
| `mobility/regions.py::_apply_env_overrides` | `b9cc493c904bd915a2af9152e80ad9106b5dc890878f728c6c6378f78194e515` |

Aggregate SHA-256 is
`24f688bb837109ec248b4b12989dc3d11f1f48cad117d1b9a996340b7edb2cdc`:
compact ASCII JSON of ordered `[relative_path, function_name, digest]` triples
in table order, UTF-8 encoded. No local hash is represented as deployed.

**Causal conclusion:** zero staging acceptance is established by supplied logs;
its concrete cause is not established. A strict deployed date rule operating
against an older active static set is **only a hypothesis**. The 389 historical
date rejects justify investigating that path but do not prove the compared dates,
the rule, or that a date fix would explain the other 111218 rejects. Local raw-ID
membership alone has no strict date rejection to relax.

## 2. Smallest Read-Only Evidence Request

`railway status --json` was attempted once, with raw output captured and withheld;
it failed with expired/unauthorized OAuth. No login followed. No authenticated
deployment DB access or confirmed connection/scope was established; no local DB
was run or treated as deployed. Credentials, environment values, raw source URLs
and connection strings were not printed.

Request **one paired, redacted snapshot from the existing authorized Railway
connection**, tied to the exact production/backend and staging/backend-staging
deployments. No new diagnostic endpoint, helper, activation or feed download is
needed. If the 06:56 poll is no longer inspectable, label a fresh poll explicitly;
do not combine its rejection details with the 06:56 totals.

1. Return project/environment/service/deployment identifiers, source revision,
   snapshot UTC and RT header timestamp per service. From the deployed artifact,
   return the actual identity/index and expected-date rule with function/file
   references and hashes, including called helpers and effective nonsecret scope,
   timezone, boundary and schema version. If there are no separate rule functions,
   fingerprint the containing function and identify the relevant branches. Empty
   revision fields or local hashes are not substitutes.
2. In the already confirmed deployed DB, use only the two direct reads below,
   with scope independently confirmed for that deployment. Return active version,
   name, imported_at, explicit stored service_date if any, and in-memory summary
   of all projected trip IDs: total truthy occurrences N, unique U, duplicate
   excess N-U, number of duplicated distinct IDs, missing/empty IDs and type/shape
   counts. Report SHA-256 of the lexicographically sorted unique string-ID set,
   compact ASCII JSON (`separators=(',', ':')`), UTF-8. Flag non-string IDs rather
   than silently coercing away differences from raw worker membership. Return the
   safe sync-state fields and their canonical JSON fingerprint, clearly separate
   from archive checksum; identify any existing active-version/checksum linkage,
   otherwise state it is unavailable.
3. From that same recorded RT poll and its actual cached identity index, return
   exact rejection totals by existing reason (split unknown/duplicate if possible,
   otherwise retain the combined code). Give one safe sample for each observed
   rejection class and one production accepted sample. For a wrong-date reject,
   provide hashed raw/normalized trip IDs plus shape, candidate count, scoped
   route/direction/agency identifiers or safe hashes, raw `start_date`, parsed
   date, actual expected date, its derivation, static selected service_date,
   `start_time`, relationship and calendar/calendar_dates decision if retained.
   For unknown/duplicate, provide the same identity fields and candidate
   multiplicity. Indicate absent versus empty fields. Hash identifiers as UTF-8
   SHA-256 consistently across both deployments; no raw URL or credential output.

Allowed DB read shapes, **request only, not executed here**:

```python
await db.bus_network_versions.find_one(
    {"active": True, "region_id": region_id, "network_id": network_id},
    {"_id": 0, "version_id": 1, "name": 1, "imported_at": 1,
     "region_id": 1, "network_id": 1, "timezone": 1,
     "service_day_start_hour": 1, "service_date": 1,
     "routes.trips.trip_id": 1},
)
await db.mobility_sync_state.find_one(
    {"key": f"static_sha256:{region_id}:{network_id}"},
    {"_id": 0, "key": 1, "region_id": 1, "network_id": 1,
     "value": 1, "schema_v": 1},
)
```

Sync-state fingerprint: SHA-256 of UTF-8 compact ASCII JSON with sorted keys over
the returned projected document, excluding `_id`; distinguish missing document
from present fields. Do not invent missing values. Never call
`_get_active_network`, fall back to unscoped/legacy data, or use public network
endpoints for these reads. If the scoped read is empty, report that result.
Cached worker IDs may differ from the DB snapshot during the refresh interval;
record cache version/age or mark it unavailable rather than asserting equality.

These records distinguish ID-set/scope drift, duplicate-index behavior and the
actual start_date-versus-expected-date decision. Without them, no concrete
deployment cause or matcher/configuration change is justified. No tests were run:
offline tests cannot establish missing deployment state.
