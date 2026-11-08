# Three-stop live rollout compatibility gate — stopped before deployment

## Outcome

**No deployment or feature activation was performed.** The authorized live
rollout was stopped at its source-compatibility gate, before staging changes,
variable changes, data writes or uploads.

The local 79-line patch cannot honestly be presented as a corresponding
passenger-visible production improvement: its actionable change releases an
obsolete cached departure floor present in local WIP, but that floor is absent
from the verified current production engine. The three-stop helper itself is
**not** currently deployed; do not confuse that with the production engine
already handling the particular stale-departure case better than local WIP.

## Verified live baseline

- Production deployment: `86787584-b517-4c4a-acbb-da7ef325add5`.
- Staging deployment: `c53bf814-f21e-4b54-ad55-dd1e8ba0ecc4`.
- All **278 backend runtime files** matched each frozen package manifest on
  both targets, with no mismatches.
- Production active network: `net_fde2a20dcf86`, date `2026-10-27`, ACTIVE_READY.
- Daily recovery and automatic activation remain true in production.
- Native recalibration, Google Traffic, TomTom and strict wait-only recovery
  remain false. The lookahead setting is absent/effectively false.

## Exact source difference

Local `_build_trip_plan()` keeps the previous plan's effective departure as a
floor on a station rebuild. The local lookahead patch conditionally releases
part of that inherited excess.

Production `_build_trip_plan()` instead uses the new source departure, NOW and
the retained service duration/actual arrival when rebuilding from a station.
It does not impose that previous effective-departure floor. Production also
has different raw-source aliases, source reconciliation, occurrence and
effective-timeline safeguards. Copying local engine code or introducing an
old floor merely to let the new helper remove it would be a regression, not
a valid deployment adaptation.

## Identical-input offline comparison

The **actual hash-verified production source** was evaluated against the same
stored synthetic inputs used in the local patch report (SHA-256 recorded in
`production-compatibility.json`). No live database was used by the replay; the
dummy local database client was explicitly closed. Both the deployed physical
configuration and a controlled configuration matching local WIP were tested.

| Consistent-revision case | Local before patch | Local with patch | Existing production solver |
|---|---:|---:|---:|
| Bus source-target miss | 7.498 s | 0 s | **0 s** |
| Tram source-target miss | 10.002 s | 0 s | **0 s** |

Production also already departs the station earlier in these cases. There is
no additional optional cached hold for the local patch to release. These are
synthetic target-consistency comparisons, **not GPS accuracy claims** and not
proof that all current production marker behavior is correct.

## Remaining work / boundary

The user's reported marker lag near Museum remains a valid issue. This gate
does not invalidate that observation or claim it is solved. In particular,
the separately documented unposted `service` fallback (25 km/h on the captured
Hasselbachplatz → Museum leg) is unchanged. The requested patch cannot overcome
that constraint without changing the speed-cap policy, which was explicitly
outside its scope.

A justified live change requires identifying a remaining production-specific
decision that the two extra forecasts can improve, demonstrating that delta
against the actual production solver, and passing staging/served checks.
Do not manufacture a speed bonus, weaken source/closure/physics gates, or
raise unverified speed limits simply to produce a visible change.

All local WIP and the local default-off patch remain preserved. No commit,
push, frontend change, worker change, GTFS activation or production settings
change was made by this rollout attempt.
