# Isolated browser visual review — 2 November 2026

## Scope and result

The **synthetic diagram/API/animation review passed its checked scenarios after a terminal-dwell fix**. It uses real V2 passenger handlers, the optical adapter/shared MongoDB state and the actual `authorizePreview` / `sampleAuthorizedPreview` TypeScript implementation in a browser with real local HTTP and animation-frame timing.

**It is not the full `/app` or `/locator` application screen, Google Maps or a native device test.** Both labelled diagram panels intentionally share one renderer/state, so their visual equality is not an independent proof that the two production screens behave identically. No tiles, Google keys, provider requests, production accounts or passenger/driver data were used. A schematic synthetic polyline is the map background, explicitly labelled as such in the page.

## Isolated environment

- `tools/serve_visual_review.py` creates a **new**, hash/PID/path-verified loopback MongoDB 7.0.45 database and a loopback Uvicorn fixture, not `server.py` startup/migrations or hosted staging.
- `tests/visual_review_app.py` adds static local assets and **test-only** controls. POST controls update only the disposable `visual_http_control` and synthetic geometry readiness; explicit reset clears only the synthetic journey anchors. This control surface must never be deployed.
- Non-loopback outgoing socket connections are rejected in the API fixture. The review page uses a restrictive same-origin CSP and local assets only.
- `frontend/tests/build-visual-review.cjs` transpiles the actual production preview helper into an ES module; it does not build the production SPA. The served compiled helper was byte-compared against a fresh transpilation of current source: exact match, source SHA-256 `3e977a7af9b81a6af0cda4800a026b48da76e7c9701a6fbd2ce5d90fe5f7aa22`, compiled SHA-256 `903b397b79a182739e5ade4c13436284b262aec2a868ccb62d5117bbc0dd1ff9`.

Current review URL at completion: `http://127.0.0.1:62897/review`. It is local and temporary, not a public release. The page was left paused at ETA 25 s for user testing. Previous fixture HTTP worker on port 57126 was verified by command identity and stopped; its supervisor completed cleanly and stopped its own MongoDB. Its files/database remain preserved. The corrected review's owned processes remain available locally.

## Observations

### Motion and source revisions

The first review sampled 60 frames over approximately six seconds. Progress advanced from **185.447 m** to **242.207 m**, following the synthetic right-angle polyline: x advanced to the corner then y changed along the second leg. No sampled backwards step occurred. Both displayed panels had identical marker transforms and no page errors.

While paused, changing ETA **19→49 s** and then **49→8 s** preserved progress exactly at **242.94085751577396 m**. This supports the shared rebase mechanism for those controlled cases; it does not guarantee velocity continuity at every revision/network latency. Additional button actions appeared in the user-visible tab's action log; screenshots after those actions must be interpreted using that log. For example, a 33 s screenshot after selecting a 3 s approach was preceded by another +30 s action, not an unexplained clock change.

### A real integration gap found at terminal dwell

The initial test sampled the exact arrival endpoint successfully, but the live browser review exposed the next interval: slightly **after** arrival, the selected virtual run ended at final `predicted_arrival` even though its final source `predicted_departure` was later. The review could no longer bind a moving/stop marker to its path. This was an integration defect, not failure of the curve's endpoint equation.

Fix in `routes/mobility.py`, **visual mode only**:

- `_trip_window` now retains the journey through the final source departure, not just arrival.
- When no source-active trip exists, visual mode does not invent a turnaround marker before/after that source window.
- Legacy physical-mode selection remains unchanged.

The first browser test probe threw a null-point error when it tried to check the missing marker. That probe failure was investigated, not counted as a pass. Browser page errors remained empty; the error was in the inspection assertion. A dedicated regression now checks the terminal source dwell, and the HTTP test adds a sample **one second after arrival**, not only at the exact endpoint.

### Corrected 3→2→1→0 approach

In a new independent corrected review session, 42 sampled frames showed **3, 2, 1, 0 s**. The marker moved from progress **421.42929549497495 m** to the exact endpoint **427.30604656555215 m**, remained visible at the stop during source dwell, and kept `observedArrival=false`. Its projected end coordinate was approximately `(680, 80)` in both SVG panels. No page errors were recorded.

### Unknown geometry and cancellation

Turning synthetic bundle readiness off hid the marker while the board retained **25 s**. Turning readiness back on restored the marker. This simulates loss/restoration of **the whole bundle's authority**, not a fully reviewed partial-middle-leg contract.

Cancellation removed both the pin and board entry after refresh settled. An early inspection 700 ms after the control action still saw the prior snapshot while a refresh was in flight; this is retained in the evidence and is **not** described as instantaneous cancellation. A subsequent settled inspection confirmed no marker, zero board rows and no page errors.

## Regression results

- Latest four-worker HTTP run: **228 successful responses, nine phases**, including the new post-arrival source-dwell case. The supervised selection passed **18 tests in 112.14 s**, one existing dependency warning.
- Actual frontend authorizer/sampler accepted **84 captured HTTP previews**, including **12 approach endpoint** checks, with the artifact verifier's explicitly simulated client clock bridge.
- Separate targeted offline regression: **215 passed, 1 skipped**, one dependency warning. TypeScript passed.
- No production/staging deployment, feature enablement, source-clock rewrite, commit or push occurred.

The full app/native rendering, actual provider ingestion, hosted clocks/latency, shared-listener multi-worker topology, capacity, licensing/source notices and reviewed release package remain separate checks.

## Preserved evidence

Browser/session directory:

`C:\Users\PC\AppData\Local\Temp\opencode\perix-mongo-isolated-20261102\visual-browser-v2-dwell\`

`evidence/` contains:

- `browser-v1-before-dwell-fix.json`: successful turn/revision sampling and the old action history.
- `browser-v2-after-dwell-fix.json`: corrected approach samples, early and settled cancellation readings, hidden/restored marker evidence.
- `01-initial-25s.png`, `02-after-turn-19s.png`, `03-zero-and-dwell.png`, `04-canceled.png`, `05-hidden-pin-board-25s.png`.
- `manifest.json`: hashes of the seven copied browser artifacts.
- `helper-identity.json`: exact source/transpiled helper byte comparison and review asset hashes.

Latest HTTP evidence:

`C:\Users\PC\AppData\Local\Temp\opencode\perix-mongo-isolated-20261102\visual-http-v4-dwell\visual-http-report.json`

SHA-256: `b561e49a44b4758823b901bfbd00f3c109c4e335e31b623951482cb2c1cd2749`.
