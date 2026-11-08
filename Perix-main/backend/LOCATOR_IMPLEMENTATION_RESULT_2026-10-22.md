# Locator Implementation Result

Existing dirty WIP was preserved. This is not a production release approval.
No billable Google calls, feed activation, deployment, commit or matcher
relaxation was performed.

## Implementation Files

Paths below are relative to `Perix-main/`. Some backend files already contained
local WIP; the session completed that implementation rather than replacing it.

- `frontend/app/(tabs)/locator.tsx`
- `frontend/components/BusinessMap.d.ts`
- `frontend/components/BusinessMap.web.tsx`
- `frontend/components/GoogleMobilityMap.tsx`
- `frontend/public/google-mobility-map.html`
- `frontend/lib/api/mobility.ts`
- `frontend/tests/google-locator-traffic.test.cjs`
- `backend/mobility/v2.py`
- `backend/routes/mobility.py`
- `backend/mobility/arrivals.py`
- `backend/mobility/motion/traffic.py`
- `backend/mobility/motion/google_traffic.py`
- `backend/mobility/motion/engine.py`
- `backend/mobility/motion/bus.py`
- `backend/mobility/motion/explain.py`
- `backend/tests/test_mobility_effective_consumers.py`
- `backend/tests/test_mobility_motion_google_traffic.py`
- `backend/scripts/validate_island_review.py`
- `backend/tests/test_island_review.py`
- `backend/ISLAND_AND_MAGDEBURG_CHECK_2026-10-22.md`
- `backend/LOCATOR_IMPLEMENTATION_RESULT_2026-10-22.md`

The actual Mobility map is an iframe-backed GoogleMobilityMap. Its secure
readiness bridge and TrafficLayer were integrated without rerouting to
BusinessMap or changing native maps. Three polling effects retain their existing
cadence, pass `google_locator` only under the web Locator eligibility gate,
and reject stale requests across context changes.

Backend request context defaults to baseline. Estimates use independent bounded
entries scoped by region/network/version/service date/context/observation
revision. Plans and handover state isolate contexts. Vehicle positions, arrivals
and selected trip details resolve the same effective plan timeline. Google
geometry never replaces canonical geometry and real GPS is not synthesized.

The existing Google adapter now validates `staticDuration` as well as `duration`.
Verified directed-edge traffic deltas replace historical traffic on covered
edges; repeated polls do not add the same delta again. Movement obeys physical
bounds and does not stretch dwell or uncovered signal holds. A lower observation
permits bounded recovery; negative Google deltas cannot demand superphysical
travel. Invalid observations fall back to static profiles.

## Verification

Executed from backend with `PERIX_ISLAND_REVIEW_SOURCE` pointing to the located
external research bundle:

```text
python -m pytest tests -q -k "mobility or island_review"
344 passed, 559 deselected, 1 third-party deprecation warning
```

Executed from frontend:

```text
npm run typecheck
PASS
node --test tests/google-locator-traffic.test.cjs
6 passed
```

`git diff --check` passed. The full unrelated backend suite was attempted during
development but produced failures/errors and timed out; it is not certified.
Browser rendering and live paid Google integration were not exercised.

The final tracked working-tree `git diff --stat`, before this untracked report,
was 26 files changed, 1518 insertions, 229 deletions. This includes prior WIP and
unrelated auth/email changes, not just this session. The mobility/frontend scoped
tracked diff was 21 files changed, 1422 insertions, 155 deletions. Git diff does
not count untracked files, including the existing Google adapter and new tests
and reports; see the explicit file inventory above and `git status --short`.

## Remaining Blockers

- No missing research CSVs: both FULL files were found externally. The validator
  preserves all 342 observations and emits 14 inactive Mykonos clock candidates
  plus all 105 selected Syros pending anchor joins.
- Verified directional stop/platform IDs and canonical patterns are still not
  established. External drafts have empty trips, null active coordinates and no
  approval. No IDs were invented and no manifests were activated.
- The Syros weekday line 3 publication date conflict (2025 versus 2026) remains
  explicitly activation-blocking. Mykonos trip identities/operator calendars
  remain unapproved; unknown calendars stay UNSPECIFIED and four empty groups
  stay inactive.
- Railway OAuth is expired. A production/staging comparison of deployment
  revision, static hashes, exact service dates and MVB-only realtime identity
  requires authorized read-only access. Historical rejection logs cannot be
  diagnosed conclusively from the public endpoints. See the separate evidence
  report; the matcher was not weakened.
- The existing backend adapter configuration remains `MOBILITY_GOOGLE_TRAFFIC_*`
  with dedicated `GOOGLE_ROUTES_API_KEY`, region allowlist and positive budget.
  Frontend flag is `EXPO_PUBLIC_PERIX_GOOGLE_LOCATOR_TRAFFIC`. HTTP reads remain
  cache-only; a separately approved refresh path and billing/usage approval are
  required before any real observations are fetched. Flags were not enabled.
