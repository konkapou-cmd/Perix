# Visual pin recovery after geometry loss — local implementation

## Passenger contract

An estimated pin may reappear when compatible, ready geometry is available again. Its reappearance uses the **current source-clock progress**, not the start of the trip or an invented connector through an unknown interval. The board remains available while the marker is hidden. Reappearance does not assert GPS, observed passage or observed arrival.

This update concerns full atomic generation loss/replacement. A complete production contract for individually reviewed partial-middle-leg masks remains separate; synthetic bundle-readiness tests do not certify every uncertain street or track.

## Code changes

- `mobility/motion/visual_runtime.py`: a ready bundle replacing the worker's cached generation conditionally evicts only that exact stale path generation. The failed current sample stays hidden. The next ordinary poll can reload the compatible bundle without depending on `/map` warming. An older in-flight request cannot evict a concurrently newer cache entry. No retry loop, database geometry mutation, route invention or source-clock change was added.
- `mobility/motion/visual_shared_state.py`: shared rebase state is now additionally keyed/bound to **atomic generation ID**. The same coordinates can have new speed tags/infrastructure, so reusing the previous generation's profile signature could otherwise lock the new template out. A new generation initializes its own optical state; it never borrows the previous generation's hidden traversal history. Config/template drift **within the same generation** still fails closed.
- API `motion.geometry_fingerprint` is supplied even when a short preview is absent, allowing the client to identify a recovered visual path.
- `/app` and `/locator` refresh map data when optical geometry fingerprint/version/day changes. Their new shared `visualGeometryReady` filter waits for matching valid dated map geometry before drawing the recovered visual pin. It checks mode, pattern, version, date and fingerprint, so the new pin cannot borrow an opposite/stale route. Missing matching map data hides only the marker. Legacy physical/GPS/taxi behavior is unchanged by that filter.

## HTTP evidence: four actual Uvicorn processes

The supervised loopback MongoDB **7.0.45** / four-worker actual V2 HTTP test now covers:

1. Existing initial, delayed/earlier source revisions, worker restart, map fingerprint, 3→0 endpoint, post-arrival source dwell, geometry loss and cancellation checks.
2. Geometry readiness loss: no marker while board ETA remains **25 s**.
3. After five synthetic seconds in the hidden interval, ready generation `http-g2` replaces `http-g`, with no intervening `/map` request. In the first recovery cycle **7/12 fleet responses** were already ready and 5 remained hidden while stale caches were invalidated. Every board response retained ETA **20 s**. This transition is not advertised as instantaneous global recovery.
4. In the next controlled cycle **12/12 fleet responses**, across all four workers, were ready and agreed on visual revision, coordinate, progress **227.64224425638434 m** out of **427.30604656555215 m**, and ETA **20 s**. This is the current optical estimate, not a reset to 0 m or a drawn passage across the hidden interval.

Final run: **276 successful HTTP responses / 11 phases**, supervised selection **18 tests passed in 131.04 s** with one existing dependency warning. Real frontend preview code accepted **103 captured HTTP packets**, including 12 approach endpoint checks, using the verifier's explicitly simulated client timing. The initial recovery cycle count is an observation of this run, not a guaranteed fixed number of polls under arbitrary errors/network conditions.

Report directory:

`C:\Users\PC\AppData\Local\Temp\opencode\perix-mongo-isolated-20261102\visual-http-v5-recovery\`

`visual-http-report.json` SHA-256:

`fbf9cdce4c96255e5a3d6b2708624e48b91d1131b0200455f87e2a853610dbf8`

Other checks: **217 selected backend tests passed, 1 skipped**, one dependency warning; **53 frontend tests passed**, TypeScript passed, `git diff --check` had no whitespace errors (existing line-ending notices remain).

## Online activation boundary

Code is still opt-in via `MOBILITY_VISUAL_PROGRESS_ENABLED` (default false). No production/staging deployment, feature-setting change, commit or push was performed. The already-running synthetic browser review session was not hot-reloaded; its earlier diagram evidence is not a visual proof of this latest recovery patch.

For a release, build a reviewed frontend/backend package including the new helper and shared-state adapter, with the same mode/configuration on **all** target workers. Do not mix physical-mode and visual-mode ETA semantics across a rolling activation. Validate in an isolated hosted environment: actual screen marker removal/reappearance, source ingestion/freshness, all workers' version/flags, map refresh, database/state permissions/indexes, restart/rollback and capacity. Source/attribution obligations and the existing geometry-review boundaries are unchanged. Only then request separate production approval.
