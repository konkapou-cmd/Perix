# Bus shadow computation hardening — no live provider activation

Continues adaptive-traffic-20261026 without replacing either previous report.
The key supplied in conversation was not copied, stored, tested or sent to a
provider. It should be rotated; a future complete credential belongs only in
TOMTOM_TRAFFIC_API_KEY after separate legal/entitlement/account approval. Key
presence is not such approval. No production operation or real provider call.

## Change

bus_time_evidence.compare now reuses exact repeated pure-builder input pairs
within one synchronous comparison. Inputs are not rounded, candidates are not
merged and the physical/time equations, ranking, residuals, tail tolerances and
fallback decisions are unchanged. Bisection root trials are unique and are not
retained. Unsupported/non-JSON metadata bypasses reuse rather than inventing
an equivalence. The reference path remains available with memoize=False for
engineering checks, not a new runtime activation flag.

Memo lifetime is a single call; it is not shared between vehicles, observations,
queries, threads, network generations or later receipt times. Retention is
bounded to 128 entries / 4096 trajectory phases; long keys (>32768 characters)
are not retained. This is a computation bound, not a claimed total-byte memory
measurement or a provider-history retention extension. No provider payload/key
is logged or included in the computation diagnostics.

New private counters: rebuild_requests, rebuild_executed, memo_hits,
retained_phase_limit. They explain saved work without changing passenger data.
The optimization is only reached through the already opt-in bus shadow path.
No new flag was enabled and no scheduler/budget/licensing behavior was changed.

## Evidence

paired-cpu-benchmark.json: 40 alternating-order paired synthetic cases after
warm-up, with and without trend hypotheses, using one shared physical baseline.
All model outputs, excluding computation counters, matched exactly.

| Metric | Reference | Exact reuse |
|---|---:|---:|
| CPU p50 | 105.46 ms | 91.05 ms |
| CPU p95 | 202.86 ms | 177.11 ms |
| Mean physical rebuilds | 59.5 | 51.0 |

Within this run: p50 reduction 13.67%, p95 reduction 12.69%, average 8.5 exact
memo hits/case. These are CPU measurements for this selected workload, not API
latency, real-world accuracy or a directly comparable absolute result to earlier
mixed-case benchmarks. The remaining absolute cost is substantial. Production
activation is still not justified by this benchmark.

Tests cover exact memo/reference output equality, no cross-call/state/observation
reuse, safe bypass for non-JSON metadata and comparison to the recorded
pre-hardening implementation. The relevant regression suite and manifest state
the actual completed counts. The CI workflow includes the new tests; no remote
GitHub execution, commit or push is claimed.

New units: **5 passed**. Full relevant suite: **368 passed / 1 skipped** (the
existing optional localhost Mongo-service check), one pre-existing multipart
warning. The four changed/new source files were reconstructed byte-for-byte
from the recorded adaptive baseline; provider/scheduler/control/tram/Google
files and the preceding report match their pre-task hashes.

## Scope and rollback

Changed: mobility/motion/bus_time_evidence.py and the dedicated Mobility CI
workflow. Added: tests/test_shadow_rebuild_cache.py and
tools/benchmark_shadow_rebuild_cache.py. All are under backend except workflow.
Central control, provider adapter, scheduler, tram/Google WIP and previous reports
are hash-checked unchanged. No network/key/billing settings were modified.

Source rollback is the task-only reverse patch against the recorded adaptive
working tree, after --check; never reset unrelated WIP. Keeping existing feature
flags off remains the operational safety state. No production rollback is needed
because no deployment or activation was performed. Remaining gates are unchanged:
verified rights/entitlement/quota period/OpenLR direction, approved bounded live
shadow trial, independent observations and whole-trip/API resource validation.
